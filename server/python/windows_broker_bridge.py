from __future__ import annotations

import os
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Protocol

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="Windows Broker Bridge", version="1.0.0")


def ok(data: Any = None, *, message: str | None = None):
    payload: dict[str, Any] = {"ok": True}
    if data is not None:
        payload["data"] = data
    if message:
        payload["message"] = message
    return payload


def fail(message: str, status_code: int = 400):
    raise HTTPException(status_code=status_code, detail=message)


class BrokerConnectPayload(BaseModel):
    api_key: str | None = None
    api_secret: str | None = None
    cert_path: str | None = None
    cert_passphrase: str | None = None
    account_id: str | None = None
    simulation: bool = False


class OrderPayload(BaseModel):
    symbol: str
    side: str
    qty: int = Field(..., ge=1)
    price: float | None = None
    orderType: str = "MARKET"
    marketType: str = "TW_STOCK"
    note: str | None = None


@dataclass
class BrokerRuntimeState:
    broker_id: str
    connected: bool = False
    account_id: str = ""
    simulation: bool = False
    open_orders: dict[str, dict[str, Any]] = field(default_factory=dict)
    positions: dict[str, dict[str, Any]] = field(default_factory=dict)

    def as_status(self) -> dict[str, Any]:
        return {
            "brokerId": self.broker_id,
            "connected": self.connected,
            "accountId": self.account_id,
            "simulation": self.simulation,
            "openOrders": len(self.open_orders),
            "positions": len(self.positions),
        }


class BrokerSession(Protocol):
    state: BrokerRuntimeState

    def connect(self, payload: BrokerConnectPayload) -> str: ...
    def disconnect(self) -> None: ...
    def get_balance(self) -> dict[str, Any]: ...
    def place_order(self, order: OrderPayload) -> dict[str, Any]: ...
    def cancel_order(self, order_id: str) -> bool: ...
    def get_positions(self) -> list[dict[str, Any]]: ...
    def get_open_orders(self) -> list[dict[str, Any]]: ...


def normalize_tw_symbol(symbol: str) -> str:
    value = symbol.upper()
    if value.endswith(".TW") or value.endswith(".TWO"):
        return value.split(".")[0]
    return value


class SinopacSession:
    def __init__(self):
        self.state = BrokerRuntimeState(broker_id="sinopac")
        self._api: Any = None
        self._stock_account: Any = None

    def connect(self, payload: BrokerConnectPayload) -> str:
        if not payload.api_key or not payload.api_secret:
            fail("sinopac requires api_key and api_secret", 422)

        try:
            import shioaji as sj  # type: ignore
        except Exception as exc:  # noqa: BLE001
            fail(f"shioaji not installed: {exc}. install with `pip install shioaji`", 500)

        api = sj.Shioaji(simulation=payload.simulation)
        try:
            accounts = api.login(api_key=payload.api_key, secret_key=payload.api_secret)
        except Exception as exc:  # noqa: BLE001
            fail(f"sinopac login failed: {exc}", 401)

        if not payload.simulation:
            if not payload.cert_path:
                fail("cert_path is required for live sinopac trading", 422)
            if not payload.cert_passphrase:
                fail("cert_passphrase is required for live sinopac trading", 422)
            if not payload.account_id:
                fail("account_id is required for live sinopac trading", 422)

            try:
                cert_ok = api.activate_ca(
                    ca_path=payload.cert_path,
                    ca_passwd=payload.cert_passphrase,
                    person_id=payload.account_id,
                )
                if cert_ok is not True:
                    fail("sinopac CA activation failed", 401)
            except Exception as exc:  # noqa: BLE001
                fail(f"sinopac CA activation failed: {exc}", 401)

        stock_account = None
        for acct in accounts or []:
            acct_id = str(getattr(acct, "account_id", "") or "")
            if payload.account_id and acct_id == payload.account_id:
                stock_account = acct
                break
            if stock_account is None and acct_id:
                stock_account = acct

        self._api = api
        self._stock_account = stock_account
        self.state.connected = True
        self.state.account_id = payload.account_id or str(getattr(stock_account, "account_id", "") or "")
        self.state.simulation = payload.simulation
        return "sinopac connected"

    def disconnect(self) -> None:
        try:
            if self._api:
                self._api.logout()
        except Exception:
            pass
        self._api = None
        self._stock_account = None
        self.state.connected = False
        self.state.open_orders.clear()

    def get_balance(self) -> dict[str, Any]:
        if not self.state.connected:
            fail("sinopac not connected", 409)

        total_assets = 0.0
        available = 0.0
        try:
            if self._api and hasattr(self._api, "account_balance"):
                balances = self._api.account_balance()
                for b in balances or []:
                    amount = float(getattr(b, "acc_balance", 0) or 0)
                    total_assets += amount
                available = total_assets
        except Exception:
            pass

        if total_assets <= 0:
            total_assets = 10_000_000.0 if self.state.simulation else 0.0
            available = total_assets

        return {
            "totalAssets": round(total_assets, 2),
            "availableMargin": round(available, 2),
            "usedMargin": round(max(0.0, total_assets - available), 2),
            "dailyPnl": 0.0,
            "currency": "TWD",
        }

    def place_order(self, order: OrderPayload) -> dict[str, Any]:
        if not self.state.connected:
            fail("sinopac not connected", 409)

        order_id = f"SINOPAC-{uuid.uuid4().hex[:12]}"
        now_ms = int(time.time() * 1000)

        if self.state.simulation:
            filled_price = float(order.price or 0)
            result = {
                "orderId": order_id,
                "status": "FILLED",
                "filledQty": int(order.qty),
                "filledPrice": filled_price,
                "timestamp": now_ms,
                "message": "simulation_fill",
            }
            self.state.open_orders[order_id] = {
                "orderId": order_id,
                "status": "FILLED",
                "symbol": order.symbol,
                "side": order.side,
                "qty": order.qty,
                "price": filled_price,
            }
            return result

        if not self._api or not self._stock_account:
            fail("sinopac account is not initialized", 500)

        try:
            import shioaji as sj  # type: ignore

            code = normalize_tw_symbol(order.symbol)
            contract = self._api.Contracts.Stocks[code]

            action = sj.constant.Action.Buy if order.side.upper() == "BUY" else sj.constant.Action.Sell
            price_type = (
                sj.constant.StockPriceType.LMT
                if str(order.orderType).upper() == "LIMIT"
                else sj.constant.StockPriceType.MKT
            )

            shioaji_order = self._api.Order(
                price=float(order.price or 0),
                quantity=int(order.qty),
                action=action,
                price_type=price_type,
                order_type=sj.constant.OrderType.ROD,
                account=self._stock_account,
            )

            trade = self._api.place_order(contract, shioaji_order)
            status = str(getattr(getattr(trade, "status", None), "status", "") or "PENDING").upper()
            filled_qty = int(getattr(getattr(trade, "status", None), "deal_quantity", 0) or 0)
            avg_price = float(getattr(getattr(trade, "status", None), "avg_price", order.price or 0) or 0)
            broker_order_id = str(getattr(getattr(trade, "order", None), "id", "") or order_id)

            mapped_status = "PENDING"
            if "FILLED" in status:
                mapped_status = "FILLED"
            elif "PART" in status:
                mapped_status = "PARTIAL"
            elif "CANCEL" in status:
                mapped_status = "CANCELLED"
            elif "REJECT" in status or "FAIL" in status:
                mapped_status = "REJECTED"

            result = {
                "orderId": broker_order_id,
                "status": mapped_status,
                "filledQty": filled_qty,
                "filledPrice": avg_price,
                "timestamp": now_ms,
                "message": f"shioaji:{status}",
            }
            self.state.open_orders[broker_order_id] = {
                "orderId": broker_order_id,
                "status": mapped_status,
                "symbol": order.symbol,
                "side": order.side,
                "qty": order.qty,
                "price": order.price,
            }
            return result
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001
            fail(f"sinopac place_order failed: {exc}", 502)

    def cancel_order(self, order_id: str) -> bool:
        if not self.state.connected:
            fail("sinopac not connected", 409)
        order = self.state.open_orders.get(order_id)
        if order:
            order["status"] = "CANCELLED"
            return True
        return False

    def get_positions(self) -> list[dict[str, Any]]:
        if not self.state.connected:
            fail("sinopac not connected", 409)
        return list(self.state.positions.values())

    def get_open_orders(self) -> list[dict[str, Any]]:
        if not self.state.connected:
            fail("sinopac not connected", 409)
        return list(self.state.open_orders.values())


class KGISession:
    def __init__(self):
        self.state = BrokerRuntimeState(broker_id="kgi")
        self._sk_center: Any = None
        self._dry_run = os.getenv("BROKER_BRIDGE_DRY_RUN", "false").lower() == "true"

    def _connect_com(self):
        try:
            import win32com.client  # type: ignore
        except Exception as exc:  # noqa: BLE001
            fail(f"pywin32 is required for KGI SKCOM: {exc}", 500)

        prog_id = os.getenv("KGI_SKCOM_PROGID", "SKCOMLib.SKCenterLib")
        try:
            return win32com.client.Dispatch(prog_id)
        except Exception as exc:  # noqa: BLE001
            fail(f"unable to initialize SKCOM ({prog_id}): {exc}", 500)

    def connect(self, payload: BrokerConnectPayload) -> str:
        if payload.simulation or self._dry_run:
            self.state.connected = True
            self.state.simulation = True
            self.state.account_id = payload.account_id or "KGI-SIM"
            return "kgi connected (dry-run simulation)"

        if not payload.account_id:
            fail("account_id is required for KGI live connect", 422)
        if not payload.api_secret:
            fail("api_secret is required for KGI live connect", 422)

        sk_center = self._connect_com()
        login_result = None
        try:
            if hasattr(sk_center, "SKCenterLib_Login"):
                login_result = sk_center.SKCenterLib_Login(payload.account_id, payload.api_secret)
            elif hasattr(sk_center, "Login"):
                login_result = sk_center.Login(payload.account_id, payload.api_secret)
            else:
                fail("SKCOM login function not found in COM object", 500)
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001
            fail(f"KGI COM login failed: {exc}", 401)

        if isinstance(login_result, int) and login_result < 0:
            fail(f"KGI COM login returned error code {login_result}", 401)

        self._sk_center = sk_center
        self.state.connected = True
        self.state.simulation = False
        self.state.account_id = payload.account_id
        return "kgi connected"

    def disconnect(self) -> None:
        self._sk_center = None
        self.state.connected = False
        self.state.open_orders.clear()

    def get_balance(self) -> dict[str, Any]:
        if not self.state.connected:
            fail("kgi not connected", 409)

        # --- simulation / dry-run ---
        if self.state.simulation:
            return {
                "totalAssets": 10_000_000.0,
                "availableMargin": 10_000_000.0,
                "usedMargin": 0.0,
                "dailyPnl": 0.0,
                "currency": "TWD",
            }

        # --- real SKCOM: try SKQuoteLib / SKReplyLib for account info ---
        total_assets = 0.0
        available = 0.0
        try:
            import win32com.client  # type: ignore
            sk_reply = win32com.client.Dispatch(
                os.getenv("KGI_SKREPLY_PROGID", "SKCOMLib.SKReplyLib")
            )
            # SKReplyLib_GetStockAccount returns margin / available; shape depends on SKCOM version
            if hasattr(sk_reply, "SKReplyLib_GetStockAccount"):
                info = sk_reply.SKReplyLib_GetStockAccount(self.state.account_id)
                total_assets = float(getattr(info, "nTotalAssets", 0) or 0)
                available = float(getattr(info, "nAvailableFund", 0) or 0)
        except Exception as exc:  # noqa: BLE001
            print(f"[KGI] get_balance SKCOM error (non-fatal): {exc}")

        return {
            "totalAssets": round(total_assets, 2),
            "availableMargin": round(available, 2),
            "usedMargin": round(max(0.0, total_assets - available), 2),
            "dailyPnl": 0.0,
            "currency": "TWD",
        }

    def place_order(self, order: OrderPayload) -> dict[str, Any]:
        if not self.state.connected:
            fail("kgi not connected", 409)

        order_id = f"KGI-{uuid.uuid4().hex[:12]}"
        now_ms = int(time.time() * 1000)

        # --- simulation / dry-run ---
        if self.state.simulation:
            self.state.open_orders[order_id] = {
                "orderId": order_id, "status": "FILLED",
                "symbol": order.symbol, "side": order.side,
                "qty": order.qty, "price": order.price,
            }
            return {
                "orderId": order_id, "status": "FILLED",
                "filledQty": int(order.qty),
                "filledPrice": float(order.price or 0),
                "timestamp": now_ms, "message": "kgi_simulation_fill",
            }

        # --- real SKCOM: SKOrderLib ---
        try:
            import win32com.client  # type: ignore
            sk_order = win32com.client.Dispatch(
                os.getenv("KGI_SKORDER_PROGID", "SKCOMLib.SKOrderLib")
            )
            code = normalize_tw_symbol(order.symbol)

            # Build SKCOM order object — field names match SKCOM 3.x API
            # BSFlag: 'B' = Buy, 'S' = Sell
            bs_flag = "B" if order.side.upper() == "BUY" else "S"
            # PriceFlag: 0=LMT, 2=MKT
            price_flag = 2 if str(order.orderType).upper() == "MARKET" else 0

            ret_code = None
            broker_order_id = order_id
            if hasattr(sk_order, "SKOrderLib_SendStockOrder"):
                ret_code = sk_order.SKOrderLib_SendStockOrder(
                    self.state.account_id,
                    code,
                    bs_flag,
                    int(order.qty),
                    float(order.price or 0),
                    price_flag,
                )
                # SKCOM returns the broker order id or error code (negative = error)
                if isinstance(ret_code, str):
                    broker_order_id = ret_code or order_id
                elif isinstance(ret_code, int) and ret_code < 0:
                    fail(f"KGI SKOrderLib_SendStockOrder error code {ret_code}", 502)

            status = "PENDING"  # real orders start as PENDING until confirmed
            self.state.open_orders[broker_order_id] = {
                "orderId": broker_order_id, "status": status,
                "symbol": order.symbol, "side": order.side,
                "qty": order.qty, "price": order.price,
            }
            return {
                "orderId": broker_order_id, "status": status,
                "filledQty": 0,
                "filledPrice": float(order.price or 0),
                "timestamp": now_ms, "message": f"kgi_skcom_submitted:{ret_code}",
            }
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001
            fail(f"KGI SKOrderLib place_order failed: {exc}", 502)

    def cancel_order(self, order_id: str) -> bool:
        if not self.state.connected:
            fail("kgi not connected", 409)
        order = self.state.open_orders.get(order_id)
        if not order:
            return False
        # Attempt real COM cancellation
        if not self.state.simulation:
            try:
                import win32com.client  # type: ignore
                sk_order = win32com.client.Dispatch(
                    os.getenv("KGI_SKORDER_PROGID", "SKCOMLib.SKOrderLib")
                )
                if hasattr(sk_order, "SKOrderLib_CancelOrder"):
                    sk_order.SKOrderLib_CancelOrder(self.state.account_id, order_id)
            except Exception as exc:  # noqa: BLE001
                print(f"[KGI] cancel_order SKCOM error (non-fatal): {exc}")
        order["status"] = "CANCELLED"
        return True

    def get_positions(self) -> list[dict[str, Any]]:
        if not self.state.connected:
            fail("kgi not connected", 409)
        if self.state.simulation:
            return list(self.state.positions.values())
        # Real: try SKReplyLib for position snapshot
        try:
            import win32com.client  # type: ignore
            sk_reply = win32com.client.Dispatch(
                os.getenv("KGI_SKREPLY_PROGID", "SKCOMLib.SKReplyLib")
            )
            if hasattr(sk_reply, "SKReplyLib_GetStockPosition"):
                raw = sk_reply.SKReplyLib_GetStockPosition(self.state.account_id)
                if raw:
                    result = []
                    for p in (raw if hasattr(raw, "__iter__") else [raw]):
                        result.append({
                            "symbol": str(getattr(p, "bstrStockNo", "") or "") + ".TW",
                            "qty": int(getattr(p, "nQty", 0) or 0),
                            "avgCost": float(getattr(p, "dAvgPrice", 0) or 0),
                            "currentPrice": float(getattr(p, "dCurrentPrice", 0) or 0),
                            "unrealizedPnl": float(getattr(p, "dProfitLoss", 0) or 0),
                            "marketType": "TW_STOCK",
                        })
                    self.state.positions = {r["symbol"]: r for r in result}
                    return result
        except Exception as exc:  # noqa: BLE001
            print(f"[KGI] get_positions SKCOM error (non-fatal): {exc}")
        return list(self.state.positions.values())

    def get_open_orders(self) -> list[dict[str, Any]]:
        if not self.state.connected:
            fail("kgi not connected", 409)
        return list(self.state.open_orders.values())


SESSIONS: dict[str, BrokerSession] = {
    "sinopac": SinopacSession(),
    "kgi": KGISession(),
}


def get_session(broker_id: str) -> BrokerSession:
    session = SESSIONS.get(broker_id.lower())
    if session is None:
        fail(f"unsupported broker: {broker_id}", 404)
    return session


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "windows-broker-bridge",
        "ts": int(time.time()),
        "brokers": {broker_id: session.state.as_status() for broker_id, session in SESSIONS.items()},
    }


@app.post("/brokers/{broker_id}/connect")
def connect_broker(broker_id: str, payload: BrokerConnectPayload):
    session = get_session(broker_id)
    message = session.connect(payload)
    return {"ok": True, "message": message, "status": session.state.as_status()}


@app.post("/brokers/{broker_id}/disconnect")
def disconnect_broker(broker_id: str):
    session = get_session(broker_id)
    session.disconnect()
    return ok(message=f"{broker_id} disconnected")


@app.get("/brokers/{broker_id}/balance")
def get_balance(broker_id: str):
    session = get_session(broker_id)
    return session.get_balance()


@app.post("/brokers/{broker_id}/order")
def place_order(broker_id: str, payload: OrderPayload):
    session = get_session(broker_id)
    return session.place_order(payload)


@app.delete("/brokers/{broker_id}/order/{order_id}")
def cancel_order(broker_id: str, order_id: str):
    session = get_session(broker_id)
    return {"ok": session.cancel_order(order_id)}


@app.get("/brokers/{broker_id}/positions")
def get_positions(broker_id: str):
    session = get_session(broker_id)
    return session.get_positions()


@app.get("/brokers/{broker_id}/orders")
def get_orders(broker_id: str):
    session = get_session(broker_id)
    return session.get_open_orders()


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("BROKER_BRIDGE_PORT", "18080"))
    host = os.getenv("BROKER_BRIDGE_HOST", "127.0.0.1")
    uvicorn.run(app, host=host, port=port)
