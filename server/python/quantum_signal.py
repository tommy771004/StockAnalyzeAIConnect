from __future__ import annotations

import math
from statistics import mean
from typing import Mapping, Sequence


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _safe_returns(prices: Sequence[float]) -> list[float]:
    if len(prices) < 2:
        return []
    out: list[float] = []
    for i in range(1, len(prices)):
        p0 = float(prices[i - 1] or 0.0)
        p1 = float(prices[i] or 0.0)
        if abs(p0) < 1e-9:
            continue
        out.append((p1 - p0) / p0)
    return out


def _std(values: Sequence[float]) -> float:
    if not values:
        return 0.0
    m = mean(values)
    var = sum((v - m) ** 2 for v in values) / len(values)
    return math.sqrt(max(0.0, var))


def compute_quantum_signal(
    prices: Sequence[float] | None = None,
    features: Mapping[str, float] | None = None,
    shots: int = 256,
) -> dict:
    clean_prices = [float(v) for v in (prices or []) if isinstance(v, (int, float))]
    clean_prices = clean_prices[-128:]
    f = {str(k): float(v) for k, v in (features or {}).items() if isinstance(v, (int, float))}

    returns = _safe_returns(clean_prices)
    mom = mean(returns[-10:]) if returns else 0.0
    vol = _std(returns[-20:]) if returns else 0.0

    # 若有外部特徵，作為先驗偏置
    feature_bias = _clamp(
        (f.get("macd_diff", 0.0) * 0.2)
        + ((f.get("rsi", 50.0) - 50.0) / 50.0 * 0.25)
        + (f.get("flow_bias", 0.0) * 0.35),
        -1.0,
        1.0,
    )

    momentum_phase = _clamp(math.tanh(mom * 12.0) + feature_bias * 0.35, -1.0, 1.0)
    regime_flip_prob = _clamp(0.15 + vol * 6.0 + (1.0 - abs(momentum_phase)) * 0.35, 0.0, 1.0)
    uncertainty_penalty = _clamp(regime_flip_prob * 0.75 + (0.15 if len(clean_prices) < 8 else 0.0), 0.0, 1.0)
    backend = "fallback_proxy"
    backend_error = None

    # 最佳努力：若 qiskit 可用，使用單量子位模擬做 phase 修正
    try:
        from qiskit import QuantumCircuit, transpile  # type: ignore
        try:
            from qiskit_aer import AerSimulator  # type: ignore
            simulator = AerSimulator()
        except Exception:  # noqa: BLE001
            simulator = None

        if simulator is not None:
            qc = QuantumCircuit(1, 1)
            theta = _clamp((momentum_phase + 1.0) * math.pi / 2.0, 0.0, math.pi)
            qc.ry(theta, 0)
            qc.measure(0, 0)
            tqc = transpile(qc, simulator)
            job = simulator.run(tqc, shots=max(32, int(shots or 256)))
            counts = job.result().get_counts(tqc)
            p1 = counts.get("1", 0) / max(1, sum(counts.values()))
            # p1 越大偏空，p1 越小偏多（可視為 phase 投影）
            momentum_phase = _clamp((0.5 - p1) * 2.0, -1.0, 1.0)
            backend = "qiskit_aer"
    except Exception as exc:  # noqa: BLE001
        backend_error = str(exc)

    action = "HOLD"
    if momentum_phase > 0.18:
        action = "BUY"
    elif momentum_phase < -0.18:
        action = "SELL"

    confidence = int(
        round(
            _clamp((1.0 - uncertainty_penalty) * (0.55 + abs(momentum_phase) * 0.45), 0.0, 1.0)
            * 100
        )
    )

    return {
        "action": action,
        "confidence": confidence,
        "momentum_phase": round(momentum_phase, 6),
        "regime_flip_prob": round(regime_flip_prob, 6),
        "uncertainty_penalty": round(uncertainty_penalty, 6),
        "model": backend,
        "errors": ([backend_error] if backend_error else []),
    }

