import hashlib
import pathlib
import sys
import unittest


PYTHON_ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PYTHON_ROOT))

from science_skills_service import strategy_backtest, strategy_validate
from strategy_runtime.contracts import StrategyBacktestPayload, StrategySource


class StrategyApiTests(unittest.TestCase):
    def test_validation_endpoint_preserves_identity(self):
        source = "def run(data, params): return {'buy': [], 'sell': []}"
        source_hash = hashlib.sha256(source.encode("utf-8")).hexdigest()

        response = strategy_validate(StrategySource(
            strategyVersionId="version-1",
            runtime="indicator",
            source=source,
            sourceHash=source_hash,
            parameters={},
        ))

        self.assertEqual(response["status"], "success")
        self.assertEqual(response["data"]["sourceHash"], source_hash)
        self.assertEqual(response["data"]["engineVersion"], "hermes-quant-1")

    def test_validation_endpoint_rejects_hash_mismatch(self):
        source = "def run(data, params): return {'buy': [], 'sell': []}"

        response = strategy_validate(StrategySource(
            strategyVersionId="version-1",
            runtime="indicator",
            source=source,
            sourceHash="0" * 64,
            parameters={},
        ))

        self.assertEqual(response["status"], "error")
        self.assertEqual(response["message"], "source hash mismatch")

    def test_backtest_endpoint_returns_run_metadata(self):
        source = (
            "def run(data, params):\n"
            "    n = len(data['close'])\n"
            "    return {'buy': [False] * n, 'sell': [False] * n}\n"
        )
        source_hash = hashlib.sha256(source.encode("utf-8")).hexdigest()

        response = strategy_backtest(StrategyBacktestPayload(
            runId="run-1",
            strategyVersionId="version-1",
            runtime="indicator",
            source=source,
            sourceHash=source_hash,
            parameters={},
            symbol="2330.TW",
            bars=[
                {
                    "timestamp": "1",
                    "open": 100,
                    "high": 101,
                    "low": 99,
                    "close": 100,
                    "volume": 1000,
                },
                {
                    "timestamp": "2",
                    "open": 101,
                    "high": 102,
                    "low": 100,
                    "close": 101,
                    "volume": 1000,
                },
            ],
            execution={"initialCapital": 10_000},
        ))

        self.assertEqual(response["status"], "success")
        self.assertEqual(response["data"]["runId"], "run-1")
        self.assertEqual(response["data"]["strategyVersionId"], "version-1")
        self.assertEqual(response["data"]["sourceHash"], source_hash)


if __name__ == "__main__":
    unittest.main()
