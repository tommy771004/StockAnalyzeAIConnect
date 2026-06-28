from __future__ import annotations

import math
import statistics
from typing import Any

from .validator import validate_source


SAFE_BUILTINS = {
    "abs": abs,
    "all": all,
    "any": any,
    "bool": bool,
    "dict": dict,
    "enumerate": enumerate,
    "filter": filter,
    "float": float,
    "int": int,
    "len": len,
    "list": list,
    "map": map,
    "max": max,
    "min": min,
    "range": range,
    "reversed": reversed,
    "round": round,
    "set": set,
    "sorted": sorted,
    "str": str,
    "sum": sum,
    "tuple": tuple,
    "zip": zip,
}

TWO_WAY_SIGNALS = ("buy", "sell")
FOUR_WAY_SIGNALS = (
    "open_long",
    "close_long",
    "open_short",
    "close_short",
)
REQUIRED_DATA_COLUMNS = ("timestamp", "open", "high", "low", "close", "volume")


def _validate_data(data: dict[str, list[Any]]) -> int:
    missing = [key for key in REQUIRED_DATA_COLUMNS if key not in data]
    if missing:
        raise ValueError(f"Missing data columns: {', '.join(missing)}")
    length = len(data["close"])
    if length < 2:
        raise ValueError("At least two bars are required")
    for key in REQUIRED_DATA_COLUMNS:
        if len(data[key]) != length:
            raise ValueError(f"{key} length must match bars")
    return length


def _resolve_signal_form(output: dict[str, Any]) -> tuple[str, ...]:
    has_two_way = all(key in output for key in TWO_WAY_SIGNALS)
    has_four_way = all(key in output for key in FOUR_WAY_SIGNALS)
    if has_two_way == has_four_way:
        raise ValueError("Strategy must return exactly one signal form")
    return TWO_WAY_SIGNALS if has_two_way else FOUR_WAY_SIGNALS


def run_indicator(
    source: str,
    data: dict[str, list[Any]],
    params: dict[str, Any],
) -> dict[str, list[bool]]:
    length = _validate_data(data)
    validation = validate_source("indicator", source)
    if not validation.valid:
        messages = "; ".join(item.message for item in validation.diagnostics)
        raise ValueError(f"Strategy validation failed: {messages}")

    namespace: dict[str, Any] = {
        "__builtins__": SAFE_BUILTINS,
        "math": math,
        "statistics": statistics,
    }
    exec(compile(source, "<indicator-strategy>", "exec"), namespace, namespace)
    output = namespace["run"](
        {key: list(values) for key, values in data.items()},
        dict(params),
    )
    if not isinstance(output, dict):
        raise ValueError("Indicator strategy must return a dict")

    signal_keys = _resolve_signal_form(output)
    normalized: dict[str, list[bool]] = {}
    for key in signal_keys:
        values = list(output[key])
        if len(values) != length:
            raise ValueError(f"{key} length must match bars")
        normalized[key] = [bool(value) for value in values]
    return normalized


def run_cross_sectional_indicator(
    source: str,
    universe_data: dict[str, dict[str, list[Any]]],
    params: dict[str, Any],
) -> dict[str, list[float]]:
    if len(universe_data) < 2:
        raise ValueError("Cross-sectional strategies require at least two symbols")

    expected_length: int | None = None
    expected_timestamps: list[Any] | None = None
    copied_data: dict[str, dict[str, list[Any]]] = {}
    for symbol in sorted(universe_data):
        data = universe_data[symbol]
        length = _validate_data(data)
        timestamps = list(data["timestamp"])
        if expected_length is None:
            expected_length = length
            expected_timestamps = timestamps
        elif length != expected_length or timestamps != expected_timestamps:
            raise ValueError("Cross-sectional bars must share aligned timestamps")
        copied_data[symbol] = {
            key: list(values)
            for key, values in data.items()
        }

    validation = validate_source("indicator", source)
    if not validation.valid:
        messages = "; ".join(item.message for item in validation.diagnostics)
        raise ValueError(f"Strategy validation failed: {messages}")

    namespace: dict[str, Any] = {
        "__builtins__": SAFE_BUILTINS,
        "math": math,
        "statistics": statistics,
    }
    exec(compile(source, "<cross-sectional-strategy>", "exec"), namespace, namespace)
    output = namespace["run"](copied_data, dict(params))
    if not isinstance(output, dict) or not isinstance(output.get("scores"), dict):
        raise ValueError("Cross-sectional strategy must return {'scores': {symbol: values}}")

    raw_scores = output["scores"]
    if set(raw_scores) != set(copied_data):
        raise ValueError("Cross-sectional scores must contain every configured symbol exactly once")

    normalized: dict[str, list[float]] = {}
    for symbol in sorted(copied_data):
        values = list(raw_scores[symbol])
        if len(values) != expected_length:
            raise ValueError(f"{symbol} score length must match bars")
        scores = [float(value) for value in values]
        if not all(math.isfinite(value) for value in scores):
            raise ValueError(f"{symbol} scores must be finite")
        normalized[symbol] = scores
    return normalized
