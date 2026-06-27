from __future__ import annotations

from dataclasses import dataclass
import math
import statistics
from typing import Any, Literal

from .indicator_runtime import SAFE_BUILTINS
from .validator import validate_source


IntentAction = Literal["buy", "sell", "close"]


@dataclass(frozen=True)
class RuntimeIntent:
    action: IntentAction
    pct: float | None = None


@dataclass(frozen=True)
class BarView:
    timestamp: str
    open: float
    high: float
    low: float
    close: float
    volume: float

    def __getitem__(self, key: str) -> str | float:
        if key not in {"timestamp", "open", "high", "low", "close", "volume"}:
            raise KeyError(key)
        return getattr(self, key)


class RuntimeContext:
    def __init__(self, params: dict[str, Any]):
        self.state: dict[str, Any] = {}
        self.params = dict(params)
        self._cash = 0.0
        self._equity = 0.0
        self._position_side: str | None = None
        self._quantity = 0.0
        self._intents: list[RuntimeIntent] = []

    @property
    def cash(self) -> float:
        return self._cash

    @property
    def equity(self) -> float:
        return self._equity

    @property
    def position_side(self) -> str | None:
        return self._position_side

    @property
    def quantity(self) -> float:
        return self._quantity

    def buy(self, pct: float | None = None) -> None:
        self._intents.append(RuntimeIntent("buy", self._validate_pct(pct)))

    def sell(self, pct: float | None = None) -> None:
        self._intents.append(RuntimeIntent("sell", self._validate_pct(pct)))

    def close_position(self) -> None:
        self._intents.append(RuntimeIntent("close"))

    @staticmethod
    def _validate_pct(pct: float | None) -> float | None:
        if pct is None:
            return None
        value = float(pct)
        if not 0 < value <= 1:
            raise ValueError("Order pct must be greater than 0 and at most 1")
        return value

    def _set_snapshot(
        self,
        *,
        cash: float,
        equity: float,
        position_side: str | None,
        quantity: float,
    ) -> None:
        self._cash = cash
        self._equity = equity
        self._position_side = position_side
        self._quantity = quantity

    def _drain_intents(self) -> list[RuntimeIntent]:
        intents = self._intents
        self._intents = []
        return intents


class ScriptRunner:
    def __init__(self, source: str, params: dict[str, Any]):
        validation = validate_source("script", source)
        if not validation.valid:
            messages = "; ".join(item.message for item in validation.diagnostics)
            raise ValueError(f"Strategy validation failed: {messages}")

        namespace: dict[str, Any] = {
            "__builtins__": SAFE_BUILTINS,
            "math": math,
            "statistics": statistics,
        }
        exec(compile(source, "<script-strategy>", "exec"), namespace, namespace)
        self._on_bar = namespace["on_bar"]
        self.context = RuntimeContext(params)
        namespace["on_init"](self.context)
        self.context._drain_intents()

    def on_bar(
        self,
        bar: dict[str, Any],
        *,
        cash: float,
        equity: float,
        position_side: str | None,
        quantity: float,
    ) -> list[RuntimeIntent]:
        self.context._set_snapshot(
            cash=cash,
            equity=equity,
            position_side=position_side,
            quantity=quantity,
        )
        view = BarView(
            timestamp=str(bar["timestamp"]),
            open=float(bar["open"]),
            high=float(bar["high"]),
            low=float(bar["low"]),
            close=float(bar["close"]),
            volume=float(bar["volume"]),
        )
        self._on_bar(self.context, view)
        return self.context._drain_intents()
