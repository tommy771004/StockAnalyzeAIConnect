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
