from __future__ import annotations

from dataclasses import dataclass
from typing import List, Sequence, Tuple


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _fallback_forecast(history: Sequence[float], horizon: int) -> List[float]:
    if not history:
        return [0.0] * horizon
    if len(history) == 1:
        return [float(history[0])] * horizon

    window = list(map(float, history[-30:]))
    n = len(window)
    x_mean = (n - 1) / 2
    y_mean = sum(window) / n

    num = 0.0
    den = 0.0
    for idx, val in enumerate(window):
        dx = idx - x_mean
        num += dx * (val - y_mean)
        den += dx * dx
    slope = num / den if den > 0 else 0.0

    last = window[-1]
    forecasts: List[float] = []
    for i in range(1, horizon + 1):
        # 趨勢逐步衰減，避免長預測爆衝
        decay = 1.0 / (1.0 + i * 0.2)
        pred = last + slope * i * decay
        forecasts.append(float(max(0.0, pred)))
    return forecasts


@dataclass
class TimesFMPredictResult:
    predictions: List[float]
    model: str
    used_fallback: bool
    error: str | None = None


class TimesFMPredictor:
    def __init__(self) -> None:
        self._model = None
        self._model_name = "fallback_linear_trend"
        self._load_error: str | None = None
        self._try_load_model()

    def _try_load_model(self) -> None:
        """
        盡力載入 TimesFM。若環境未安裝或模型無法初始化，保持 fallback 模式。
        """
        try:
            import timesfm  # type: ignore

            # 不在此硬綁特定 checkpoint，優先嘗試使用環境預設。
            # 若本地沒有模型資源，會走 exception -> fallback。
            hparams = getattr(timesfm, "TimesFmHparams", None)
            checkpoint = getattr(timesfm, "TimesFmCheckpoint", None)
            model_cls = getattr(timesfm, "TimesFm", None)
            if not (hparams and checkpoint and model_cls):
                self._load_error = "timesfm package found but API shape is unsupported"
                return

            self._model = model_cls(
                hparams=hparams(
                    backend="cpu",
                    per_core_batch_size=1,
                    horizon_len=16,
                ),
                checkpoint=checkpoint(),
            )
            self._model_name = "timesfm"
            self._load_error = None
        except Exception as exc:  # noqa: BLE001
            self._model = None
            self._model_name = "fallback_linear_trend"
            self._load_error = str(exc)

    def _predict_with_model(self, history: Sequence[float], horizon: int) -> Tuple[List[float], str]:
        if self._model is None:
            raise RuntimeError("timesfm model unavailable")

        try:
            forecast = self._model.forecast(
                inputs=[list(map(float, history))],
                freq=[0],
            )
            # API 可能回 tuple 或 array-like，做最保守攤平處理
            if isinstance(forecast, tuple):
                forecast = forecast[0]
            arr = list(forecast[0]) if forecast else []
            if len(arr) < horizon:
                arr.extend([arr[-1] if arr else history[-1]] * (horizon - len(arr)))
            return [float(max(0.0, v)) for v in arr[:horizon]], "timesfm"
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(str(exc))

    def predict(self, history: Sequence[float], horizon: int) -> TimesFMPredictResult:
        horizon = max(1, min(int(horizon or 1), 64))
        clean = [float(v) for v in history if isinstance(v, (int, float))]
        if not clean:
            clean = [0.0]

        if self._model is not None:
            try:
                preds, model = self._predict_with_model(clean, horizon)
                return TimesFMPredictResult(
                    predictions=[round(v, 6) for v in preds],
                    model=model,
                    used_fallback=False,
                    error=None,
                )
            except Exception as exc:  # noqa: BLE001
                fb = _fallback_forecast(clean, horizon)
                return TimesFMPredictResult(
                    predictions=[round(v, 6) for v in fb],
                    model="fallback_linear_trend",
                    used_fallback=True,
                    error=f"TimesFM inference failed: {exc}",
                )

        fb = _fallback_forecast(clean, horizon)
        err = self._load_error
        return TimesFMPredictResult(
            predictions=[round(v, 6) for v in fb],
            model="fallback_linear_trend",
            used_fallback=True,
            error=(f"TimesFM unavailable: {err}" if err else None),
        )

