from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


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


class Bar(BaseModel):
    timestamp: str = Field(min_length=1)
    open: float = Field(gt=0)
    high: float = Field(gt=0)
    low: float = Field(gt=0)
    close: float = Field(gt=0)
    volume: float = Field(ge=0)

    @model_validator(mode="after")
    def validate_ohlc(self):
        if self.high < max(self.open, self.close):
            raise ValueError("high must be greater than or equal to open and close")
        if self.low > min(self.open, self.close):
            raise ValueError("low must be less than or equal to open and close")
        return self


class ExecutionPolicy(BaseModel):
    initialCapital: float = Field(default=1_000_000, gt=0)
    feeRate: float = Field(default=0.001, ge=0, le=0.1)
    slippageBps: float = Field(default=5, ge=0, le=1_000)
    entryPct: float = Field(default=0.1, gt=0, le=1)
    stopLossPct: float | None = Field(default=None, gt=0, le=1)
    takeProfitPct: float | None = Field(default=None, gt=0, le=10)
    trailingStopPct: float | None = Field(default=None, gt=0, le=1)
    tradeDirection: Literal["long", "short", "both"] = "long"
    exitOwner: Literal["engine", "strategy"] = "engine"


class StrategyBacktestPayload(StrategySource):
    runId: str = Field(min_length=1)
    symbol: str = Field(min_length=1)
    bars: list[Bar] = Field(min_length=2, max_length=100_000)
    execution: ExecutionPolicy = Field(default_factory=ExecutionPolicy)
