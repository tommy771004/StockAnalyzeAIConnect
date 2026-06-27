from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


ENGINE_VERSION = "hermes-quant-1"


class Diagnostic(BaseModel):
    code: str
    message: str
    line: int | None = None
    severity: Literal["error", "warning"] = "error"


class ValidationResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    valid: bool
    diagnostics: list[Diagnostic] = Field(default_factory=list)
    source_hash: str = Field(serialization_alias="sourceHash")
    engine_version: str = Field(
        default=ENGINE_VERSION,
        serialization_alias="engineVersion",
    )


class StrategySource(BaseModel):
    strategyVersionId: str = Field(min_length=1)
    runtime: Literal["indicator", "script"]
    source: str = Field(min_length=1, max_length=100_000)
    sourceHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    parameters: dict[str, Any] = Field(default_factory=dict)
