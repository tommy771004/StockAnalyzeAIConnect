from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Any, Literal

from .indicator_runtime import FOUR_WAY_SIGNALS, TWO_WAY_SIGNALS, run_indicator
from .script_runtime import RuntimeIntent, ScriptRunner


PositionSide = Literal["long", "short"]


@dataclass
class Position:
    side: PositionSide
    quantity: float
    entry_price: float
    entry_timestamp: str
    entry_fee: float
    high_water: float
    low_water: float


def _normalize_policy(policy: dict[str, Any]) -> dict[str, Any]:
    normalized = {
        "initialCapital": float(policy.get("initialCapital", 1_000_000)),
        "feeRate": float(policy.get("feeRate", 0.001)),
        "slippageBps": float(policy.get("slippageBps", 5)),
        "entryPct": float(policy.get("entryPct", 0.1)),
        "stopLossPct": policy.get("stopLossPct"),
        "takeProfitPct": policy.get("takeProfitPct"),
        "trailingStopPct": policy.get("trailingStopPct"),
        "tradeDirection": policy.get("tradeDirection", "long"),
        "exitOwner": policy.get("exitOwner", "engine"),
    }
    if normalized["initialCapital"] <= 0:
        raise ValueError("initialCapital must be positive")
    if not 0 <= normalized["feeRate"] <= 0.1:
        raise ValueError("feeRate must be between 0 and 0.1")
    if not 0 <= normalized["slippageBps"] <= 1_000:
        raise ValueError("slippageBps must be between 0 and 1000")
    if not 0 < normalized["entryPct"] <= 1:
        raise ValueError("entryPct must be greater than 0 and at most 1")
    if normalized["tradeDirection"] not in {"long", "short", "both"}:
        raise ValueError("tradeDirection must be long, short, or both")
    if normalized["exitOwner"] not in {"engine", "strategy"}:
        raise ValueError("exitOwner must be engine or strategy")
    for key in ("stopLossPct", "takeProfitPct", "trailingStopPct"):
        value = normalized[key]
        if value is not None:
            normalized[key] = float(value)
            if normalized[key] <= 0:
                raise ValueError(f"{key} must be positive")
    return normalized


def _normalize_bars(bars: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if len(bars) < 2:
        raise ValueError("At least two bars are required")
    normalized: list[dict[str, Any]] = []
    for index, raw in enumerate(bars):
        bar = {
            "timestamp": str(raw["timestamp"]),
            "open": float(raw["open"]),
            "high": float(raw["high"]),
            "low": float(raw["low"]),
            "close": float(raw["close"]),
            "volume": float(raw["volume"]),
        }
        prices = (bar["open"], bar["high"], bar["low"], bar["close"])
        if not all(math.isfinite(value) and value > 0 for value in prices):
            raise ValueError(f"Bar {index} contains invalid prices")
        if not math.isfinite(bar["volume"]) or bar["volume"] < 0:
            raise ValueError(f"Bar {index} contains invalid volume")
        if bar["high"] < max(bar["open"], bar["close"]):
            raise ValueError(f"Bar {index} high is below its body")
        if bar["low"] > min(bar["open"], bar["close"]):
            raise ValueError(f"Bar {index} low is above its body")
        normalized.append(bar)
    return normalized


def _apply_slippage(price: float, action: Literal["buy", "sell"], bps: float) -> float:
    multiplier = 1 + bps / 10_000 if action == "buy" else 1 - bps / 10_000
    return price * multiplier


def _mark_to_market(cash: float, position: Position | None, price: float) -> float:
    if position is None:
        return cash
    value = position.quantity * price
    return cash + value if position.side == "long" else cash - value


def _choose_intent(intents: list[RuntimeIntent], warnings: list[str]) -> RuntimeIntent | None:
    if not intents:
        return None
    close_intents = [intent for intent in intents if intent.action == "close"]
    directional = [intent for intent in intents if intent.action != "close"]
    if close_intents:
        if directional or len(close_intents) > 1:
            warnings.append("Multiple script intents on one bar; close_position took priority")
        return close_intents[0]
    actions = {intent.action for intent in directional}
    if len(actions) > 1:
        warnings.append("Conflicting buy and sell intents were ignored")
        return None
    if len(directional) > 1:
        warnings.append("Duplicate script intents were collapsed")
    return directional[0]


def _indicator_intent(
    signals: dict[str, list[bool]],
    index: int,
    position: Position | None,
    warnings: list[str],
) -> RuntimeIntent | None:
    if all(key in signals for key in TWO_WAY_SIGNALS):
        buy = signals["buy"][index]
        sell = signals["sell"][index]
        if buy and sell:
            warnings.append(f"Conflicting two-way signals ignored at bar {index}")
            return None
        if buy:
            return RuntimeIntent("buy")
        if sell:
            return RuntimeIntent("sell")
        return None

    if not all(key in signals for key in FOUR_WAY_SIGNALS):
        raise ValueError("Indicator output has no supported signal form")
    if position is None:
        open_long = signals["open_long"][index]
        open_short = signals["open_short"][index]
        if open_long and open_short:
            warnings.append(f"Conflicting open signals ignored at bar {index}")
            return None
        if open_long:
            return RuntimeIntent("buy")
        if open_short:
            return RuntimeIntent("sell")
        return None
    if position.side == "long" and signals["close_long"][index]:
        return RuntimeIntent("close")
    if position.side == "short" and signals["close_short"][index]:
        return RuntimeIntent("close")
    return None


def _open_position(
    *,
    side: PositionSide,
    bar: dict[str, Any],
    cash: float,
    equity: float,
    pct: float,
    policy: dict[str, Any],
) -> tuple[float, Position | None]:
    action = "buy" if side == "long" else "sell"
    fill_price = _apply_slippage(bar["open"], action, policy["slippageBps"])
    budget = equity * pct
    quantity = math.floor(budget / (fill_price * (1 + policy["feeRate"])))
    if quantity <= 0:
        return cash, None
    notional = quantity * fill_price
    fee = notional * policy["feeRate"]
    if side == "long":
        if notional + fee > cash:
            return cash, None
        cash -= notional + fee
    else:
        cash += notional - fee
    return cash, Position(
        side=side,
        quantity=quantity,
        entry_price=fill_price,
        entry_timestamp=bar["timestamp"],
        entry_fee=fee,
        high_water=fill_price,
        low_water=fill_price,
    )


def _close_position(
    *,
    position: Position,
    bar: dict[str, Any],
    raw_price: float,
    reason: str,
    cash: float,
    policy: dict[str, Any],
) -> tuple[float, dict[str, Any]]:
    action = "sell" if position.side == "long" else "buy"
    fill_price = _apply_slippage(raw_price, action, policy["slippageBps"])
    notional = position.quantity * fill_price
    exit_fee = notional * policy["feeRate"]
    if position.side == "long":
        cash += notional - exit_fee
        gross_pnl = (fill_price - position.entry_price) * position.quantity
    else:
        cash -= notional + exit_fee
        gross_pnl = (position.entry_price - fill_price) * position.quantity
    fees = position.entry_fee + exit_fee
    net_pnl = gross_pnl - fees
    return cash, {
        "side": position.side,
        "entryTimestamp": position.entry_timestamp,
        "exitTimestamp": bar["timestamp"],
        "entryPrice": position.entry_price,
        "exitPrice": fill_price,
        "quantity": position.quantity,
        "grossPnl": gross_pnl,
        "fees": fees,
        "netPnl": net_pnl,
        "returnPct": (
            net_pnl / (position.entry_price * position.quantity) * 100
            if position.entry_price > 0
            else 0
        ),
        "exitReason": reason,
    }


def _engine_exit(
    position: Position,
    bar: dict[str, Any],
    policy: dict[str, Any],
) -> tuple[float, str] | None:
    if policy["exitOwner"] != "engine":
        return None
    stop_loss = policy.get("stopLossPct")
    take_profit = policy.get("takeProfitPct")
    trailing_stop = policy.get("trailingStopPct")
    if position.side == "long":
        if stop_loss is not None:
            stop_price = position.entry_price * (1 - stop_loss)
            if bar["low"] <= stop_price:
                return min(bar["open"], stop_price), "stop_loss"
        if take_profit is not None:
            target = position.entry_price * (1 + take_profit)
            if bar["high"] >= target:
                return max(bar["open"], target), "take_profit"
        position.high_water = max(position.high_water, bar["high"])
        if trailing_stop is not None:
            trail = position.high_water * (1 - trailing_stop)
            if bar["low"] <= trail:
                return min(bar["open"], trail), "trailing_stop"
    else:
        if stop_loss is not None:
            stop_price = position.entry_price * (1 + stop_loss)
            if bar["high"] >= stop_price:
                return max(bar["open"], stop_price), "stop_loss"
        if take_profit is not None:
            target = position.entry_price * (1 - take_profit)
            if bar["low"] <= target:
                return min(bar["open"], target), "take_profit"
        position.low_water = min(position.low_water, bar["low"])
        if trailing_stop is not None:
            trail = position.low_water * (1 + trailing_stop)
            if bar["high"] >= trail:
                return max(bar["open"], trail), "trailing_stop"
    return None


def _execute_intent(
    *,
    intent: RuntimeIntent,
    bar: dict[str, Any],
    cash: float,
    position: Position | None,
    equity: float,
    policy: dict[str, Any],
) -> tuple[float, Position | None, dict[str, Any] | None]:
    if intent.action == "close":
        if position is None:
            return cash, None, None
        cash, trade = _close_position(
            position=position,
            bar=bar,
            raw_price=bar["open"],
            reason="strategy",
            cash=cash,
            policy=policy,
        )
        return cash, None, trade

    if intent.action == "buy":
        if position is not None and position.side == "short":
            cash, trade = _close_position(
                position=position,
                bar=bar,
                raw_price=bar["open"],
                reason="reverse",
                cash=cash,
                policy=policy,
            )
            return cash, None, trade
        if position is None and policy["tradeDirection"] in {"long", "both"}:
            pct = intent.pct or policy["entryPct"]
            cash, opened = _open_position(
                side="long",
                bar=bar,
                cash=cash,
                equity=equity,
                pct=pct,
                policy=policy,
            )
            return cash, opened, None
        return cash, position, None

    if position is not None and position.side == "long":
        cash, trade = _close_position(
            position=position,
            bar=bar,
            raw_price=bar["open"],
            reason="reverse",
            cash=cash,
            policy=policy,
        )
        return cash, None, trade
    if position is None and policy["tradeDirection"] in {"short", "both"}:
        pct = intent.pct or policy["entryPct"]
        cash, opened = _open_position(
            side="short",
            bar=bar,
            cash=cash,
            equity=equity,
            pct=pct,
            policy=policy,
        )
        return cash, opened, None
    return cash, position, None


def _metrics(
    *,
    initial_capital: float,
    final_equity: float,
    equity_curve: list[dict[str, Any]],
    trades: list[dict[str, Any]],
    exposed_bars: int,
) -> dict[str, float]:
    wins = [trade for trade in trades if trade["netPnl"] > 0]
    losses = [trade for trade in trades if trade["netPnl"] < 0]
    gross_wins = sum(trade["netPnl"] for trade in wins)
    gross_losses = abs(sum(trade["netPnl"] for trade in losses))
    return {
        "initialCapital": initial_capital,
        "finalEquity": final_equity,
        "totalReturnPct": (final_equity / initial_capital - 1) * 100,
        "maxDrawdownPct": max(
            (point["drawdownPct"] for point in equity_curve),
            default=0,
        ),
        "totalTrades": float(len(trades)),
        "winRatePct": len(wins) / len(trades) * 100 if trades else 0,
        "profitFactor": (
            gross_wins / gross_losses
            if gross_losses > 0
            else (gross_wins if gross_wins > 0 else 0)
        ),
        "fees": sum(trade["fees"] for trade in trades),
        "exposurePct": exposed_bars / len(equity_curve) * 100 if equity_curve else 0,
    }


def run_backtest(
    *,
    runtime: Literal["indicator", "script"],
    source: str,
    bars: list[dict[str, Any]],
    params: dict[str, Any],
    policy: dict[str, Any],
) -> dict[str, Any]:
    normalized_bars = _normalize_bars(bars)
    normalized_policy = _normalize_policy(policy)
    warnings: list[str] = []
    data = {
        key: [bar[key] for bar in normalized_bars]
        for key in ("timestamp", "open", "high", "low", "close", "volume")
    }
    indicator_signals = (
        run_indicator(source, data, params) if runtime == "indicator" else None
    )
    script_runner = ScriptRunner(source, params) if runtime == "script" else None

    cash = normalized_policy["initialCapital"]
    position: Position | None = None
    pending_intent: RuntimeIntent | None = None
    trades: list[dict[str, Any]] = []
    equity_curve: list[dict[str, Any]] = []
    peak_equity = cash
    exposed_bars = 0

    for index, bar in enumerate(normalized_bars):
        stopped = False
        if position is not None:
            engine_exit = _engine_exit(position, bar, normalized_policy)
            if engine_exit is not None:
                raw_price, reason = engine_exit
                cash, trade = _close_position(
                    position=position,
                    bar=bar,
                    raw_price=raw_price,
                    reason=reason,
                    cash=cash,
                    policy=normalized_policy,
                )
                trades.append(trade)
                position = None
                stopped = True

        equity_at_open = _mark_to_market(cash, position, bar["open"])
        if pending_intent is not None and not stopped:
            cash, position, trade = _execute_intent(
                intent=pending_intent,
                bar=bar,
                cash=cash,
                position=position,
                equity=equity_at_open,
                policy=normalized_policy,
            )
            if trade is not None:
                trades.append(trade)
        pending_intent = None

        if position is not None:
            exposed_bars += 1
        equity = _mark_to_market(cash, position, bar["close"])
        peak_equity = max(peak_equity, equity)
        drawdown = (peak_equity - equity) / peak_equity * 100 if peak_equity else 0
        equity_curve.append(
            {
                "timestamp": bar["timestamp"],
                "equity": equity,
                "drawdownPct": drawdown,
            }
        )

        if indicator_signals is not None:
            pending_intent = _indicator_intent(
                indicator_signals,
                index,
                position,
                warnings,
            )
        elif script_runner is not None:
            intents = script_runner.on_bar(
                bar,
                cash=cash,
                equity=equity,
                position_side=position.side if position else None,
                quantity=position.quantity if position else 0,
            )
            pending_intent = _choose_intent(intents, warnings)

    if position is not None:
        final_bar = normalized_bars[-1]
        cash, trade = _close_position(
            position=position,
            bar=final_bar,
            raw_price=final_bar["close"],
            reason="end_of_data",
            cash=cash,
            policy=normalized_policy,
        )
        trades.append(trade)
        equity_curve[-1]["equity"] = cash
        peak_equity = max(point["equity"] for point in equity_curve)
        running_peak = normalized_policy["initialCapital"]
        for point in equity_curve:
            running_peak = max(running_peak, point["equity"])
            point["drawdownPct"] = (
                (running_peak - point["equity"]) / running_peak * 100
                if running_peak
                else 0
            )

    final_equity = equity_curve[-1]["equity"]
    return {
        "equityCurve": equity_curve,
        "trades": trades,
        "metrics": _metrics(
            initial_capital=normalized_policy["initialCapital"],
            final_equity=final_equity,
            equity_curve=equity_curve,
            trades=trades,
            exposed_bars=exposed_bars,
        ),
        "assumptions": {
            **normalized_policy,
            "signalTiming": "bar_close_to_next_open",
            "intrabarExitPriority": "stop_loss_take_profit_trailing",
        },
        "warnings": warnings,
    }
