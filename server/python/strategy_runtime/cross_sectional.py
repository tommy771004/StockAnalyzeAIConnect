from __future__ import annotations

from datetime import datetime
import math
from typing import Any, Literal

from .backtest import (
    Position,
    _close_position,
    _engine_exit,
    _metrics,
    _normalize_bars,
    _normalize_policy,
    _open_position,
)
from .indicator_runtime import REQUIRED_DATA_COLUMNS, run_cross_sectional_indicator


PositionSide = Literal["long", "short"]


def _portfolio_equity(
    cash: float,
    positions: dict[str, Position],
    bars: dict[str, dict[str, Any]],
    price_key: Literal["open", "close"],
) -> float:
    equity = cash
    for symbol, position in positions.items():
        price = bars[symbol][price_key]
        value = position.quantity * price
        equity += value if position.side == "long" else -value
    return equity


def _rebalance_key(timestamp: str, frequency: str) -> str:
    try:
        parsed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except ValueError:
        return timestamp
    if frequency == "monthly":
        return f"{parsed.year:04d}-{parsed.month:02d}"
    if frequency == "weekly":
        iso_year, iso_week, _ = parsed.isocalendar()
        return f"{iso_year:04d}-W{iso_week:02d}"
    return parsed.date().isoformat()


def _target_positions(
    scores: dict[str, list[float]],
    index: int,
    portfolio_size: int,
    long_ratio: float,
) -> dict[str, PositionSide]:
    ranked = sorted(scores, key=lambda symbol: (-scores[symbol][index], symbol))
    long_count = min(
        portfolio_size,
        int(math.floor(portfolio_size * long_ratio + 0.5)),
    )
    short_count = portfolio_size - long_count
    targets: dict[str, PositionSide] = {
        symbol: "long"
        for symbol in ranked[:long_count]
    }
    if short_count:
        targets.update({
            symbol: "short"
            for symbol in ranked[-short_count:]
        })
    return targets


def _close_symbol(
    *,
    symbol: str,
    position: Position,
    bar: dict[str, Any],
    raw_price: float,
    reason: str,
    cash: float,
    policy: dict[str, Any],
) -> tuple[float, dict[str, Any]]:
    cash, trade = _close_position(
        position=position,
        bar=bar,
        raw_price=raw_price,
        reason=reason,
        cash=cash,
        policy=policy,
    )
    trade["symbol"] = symbol
    return cash, trade


def run_cross_sectional_backtest(
    *,
    source: str,
    universe_bars: dict[str, list[dict[str, Any]]],
    params: dict[str, Any],
    policy: dict[str, Any],
    config: dict[str, Any],
) -> dict[str, Any]:
    symbols = [str(symbol).strip().upper() for symbol in config.get("symbols", [])]
    if len(symbols) < 2 or len(set(symbols)) != len(symbols):
        raise ValueError("Cross-sectional symbols must contain at least two unique values")
    if set(symbols) != set(universe_bars):
        raise ValueError("Cross-sectional universe bars must match configured symbols")

    portfolio_size = int(config.get("portfolioSize", len(symbols)))
    long_ratio = float(config.get("longRatio", 1))
    frequency = str(config.get("rebalanceFrequency", "daily"))
    if not 1 <= portfolio_size <= len(symbols):
        raise ValueError("portfolioSize must be between 1 and the universe size")
    if not 0 <= long_ratio <= 1:
        raise ValueError("longRatio must be between 0 and 1")
    if frequency not in {"daily", "weekly", "monthly"}:
        raise ValueError("rebalanceFrequency must be daily, weekly, or monthly")

    normalized = {
        symbol: _normalize_bars(universe_bars[symbol])
        for symbol in symbols
    }
    timestamps = [bar["timestamp"] for bar in normalized[symbols[0]]]
    for symbol in symbols[1:]:
        if [bar["timestamp"] for bar in normalized[symbol]] != timestamps:
            raise ValueError("Cross-sectional bars must share aligned timestamps")

    data = {
        symbol: {
            key: [bar[key] for bar in normalized[symbol]]
            for key in REQUIRED_DATA_COLUMNS
        }
        for symbol in symbols
    }
    scores = run_cross_sectional_indicator(source, data, params)
    normalized_policy = _normalize_policy(policy)
    normalized_policy["tradeDirection"] = (
        "long" if long_ratio == 1
        else "short" if long_ratio == 0
        else "both"
    )
    cash = normalized_policy["initialCapital"]
    positions: dict[str, Position] = {}
    trades: list[dict[str, Any]] = []
    equity_curve: list[dict[str, Any]] = []
    warnings: list[str] = []
    peak_equity = cash
    exposed_bars = 0
    pending_targets: dict[str, PositionSide] | None = None
    previous_rebalance_key: str | None = None

    for index, timestamp in enumerate(timestamps):
        current_bars = {
            symbol: normalized[symbol][index]
            for symbol in symbols
        }
        stopped_symbols: set[str] = set()

        for symbol, position in list(positions.items()):
            engine_exit = _engine_exit(position, current_bars[symbol], normalized_policy)
            if engine_exit is None:
                continue
            raw_price, reason = engine_exit
            cash, trade = _close_symbol(
                symbol=symbol,
                position=position,
                bar=current_bars[symbol],
                raw_price=raw_price,
                reason=reason,
                cash=cash,
                policy=normalized_policy,
            )
            trades.append(trade)
            del positions[symbol]
            stopped_symbols.add(symbol)

        if pending_targets is not None:
            for symbol, position in list(positions.items()):
                cash, trade = _close_symbol(
                    symbol=symbol,
                    position=position,
                    bar=current_bars[symbol],
                    raw_price=current_bars[symbol]["open"],
                    reason="rebalance",
                    cash=cash,
                    policy=normalized_policy,
                )
                trades.append(trade)
                del positions[symbol]

            equity_at_open = _portfolio_equity(cash, positions, current_bars, "open")
            allocation_pct = 1 / portfolio_size
            ordered_targets = sorted(
                pending_targets.items(),
                key=lambda item: (item[1] != "short", item[0]),
            )
            for symbol, side in ordered_targets:
                if symbol in positions or symbol in stopped_symbols:
                    continue
                cash, opened = _open_position(
                    side=side,
                    bar=current_bars[symbol],
                    cash=cash,
                    equity=equity_at_open,
                    pct=allocation_pct,
                    policy=normalized_policy,
                )
                if opened is None:
                    warnings.append(f"Insufficient capital to open {side} {symbol}")
                    continue
                positions[symbol] = opened
            pending_targets = None

        if positions:
            exposed_bars += 1
        equity = _portfolio_equity(cash, positions, current_bars, "close")
        peak_equity = max(peak_equity, equity)
        drawdown = (peak_equity - equity) / peak_equity * 100 if peak_equity else 0
        equity_curve.append({
            "timestamp": timestamp,
            "equity": equity,
            "drawdownPct": drawdown,
        })

        rebalance_key = _rebalance_key(timestamp, frequency)
        if rebalance_key != previous_rebalance_key:
            pending_targets = _target_positions(
                scores,
                index,
                portfolio_size,
                long_ratio,
            )
            previous_rebalance_key = rebalance_key

    final_bars = {
        symbol: normalized[symbol][-1]
        for symbol in symbols
    }
    for symbol, position in list(positions.items()):
        cash, trade = _close_symbol(
            symbol=symbol,
            position=position,
            bar=final_bars[symbol],
            raw_price=final_bars[symbol]["close"],
            reason="end_of_data",
            cash=cash,
            policy=normalized_policy,
        )
        trades.append(trade)
        del positions[symbol]
    equity_curve[-1]["equity"] = cash
    running_peak = normalized_policy["initialCapital"]
    for point in equity_curve:
        running_peak = max(running_peak, point["equity"])
        point["drawdownPct"] = (
            (running_peak - point["equity"]) / running_peak * 100
            if running_peak
            else 0
        )

    return {
        "equityCurve": equity_curve,
        "trades": trades,
        "metrics": _metrics(
            initial_capital=normalized_policy["initialCapital"],
            final_equity=cash,
            equity_curve=equity_curve,
            trades=trades,
            exposed_bars=exposed_bars,
        ),
        "assumptions": {
            **normalized_policy,
            "strategyMode": "cross_sectional",
            "symbols": symbols,
            "portfolioSize": portfolio_size,
            "longRatio": long_ratio,
            "rebalanceFrequency": frequency,
            "signalTiming": "bar_close_to_next_open",
            "positionSizing": "equal_weight",
        },
        "warnings": warnings,
    }
