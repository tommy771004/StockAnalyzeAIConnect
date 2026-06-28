import hashlib
import pathlib
import sys
import unittest


PYTHON_ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PYTHON_ROOT))

from science_skills_service import strategy_backtest, strategy_signal, strategy_validate
from strategy_runtime.contracts import StrategyBacktestPayload, StrategySignalPayload, StrategySource


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

    def test_backtest_endpoint_executes_cross_sectional_universe(self):
        source = (
            "def run(data, params):\n"
            "    n = len(data['AAA']['close'])\n"
            "    return {'scores': {'AAA': [2] * n, 'BBB': [1] * n}}\n"
        )
        source_hash = hashlib.sha256(source.encode("utf-8")).hexdigest()
        aaa = [
            {"timestamp": "1", "open": 10, "high": 11, "low": 9, "close": 10, "volume": 1000},
            {"timestamp": "2", "open": 11, "high": 12, "low": 10, "close": 11, "volume": 1000},
            {"timestamp": "3", "open": 12, "high": 13, "low": 11, "close": 12, "volume": 1000},
        ]
        bbb = [
            {"timestamp": "1", "open": 10, "high": 11, "low": 9, "close": 10, "volume": 1000},
            {"timestamp": "2", "open": 9, "high": 10, "low": 8, "close": 9, "volume": 1000},
            {"timestamp": "3", "open": 8, "high": 9, "low": 7, "close": 8, "volume": 1000},
        ]

        response = strategy_backtest(StrategyBacktestPayload(
            runId="run-cross-1",
            strategyVersionId="version-cross-1",
            runtime="indicator",
            source=source,
            sourceHash=source_hash,
            parameters={},
            symbol="AAA,BBB",
            bars=aaa,
            universeBars={"AAA": aaa, "BBB": bbb},
            crossSectional={
                "symbols": ["AAA", "BBB"],
                "portfolioSize": 2,
                "longRatio": 0.5,
                "rebalanceFrequency": "daily",
            },
            execution={
                "initialCapital": 10_000,
                "feeRate": 0,
                "slippageBps": 0,
                "exitOwner": "strategy",
            },
        ))

        self.assertEqual(response["status"], "success")
        self.assertEqual(response["data"]["runId"], "run-cross-1")
        self.assertEqual(response["data"]["assumptions"]["strategyMode"], "cross_sectional")
        self.assertEqual(
            {trade["symbol"] for trade in response["data"]["trades"]},
            {"AAA", "BBB"},
        )

    def test_signal_endpoint_executes_the_immutable_indicator_version(self):
        source = (
            "def run(data, params):\n"
            "    n = len(data['close'])\n"
            "    return {'buy': [False] * (n - 1) + [True], 'sell': [False] * n}\n"
        )
        source_hash = hashlib.sha256(source.encode("utf-8")).hexdigest()
        response = strategy_signal(StrategySignalPayload(
            strategyVersionId="version-1",
            runtime="indicator",
            source=source,
            sourceHash=source_hash,
            parameters={},
            symbol="AAPL",
            bars=[
                {"timestamp": "1", "open": 100, "high": 101, "low": 99, "close": 100, "volume": 1000},
                {"timestamp": "2", "open": 101, "high": 102, "low": 100, "close": 101, "volume": 1000},
            ],
        ))

        self.assertEqual(response["status"], "success")
        self.assertEqual(response["data"]["action"], "BUY")
        self.assertEqual(response["data"]["strategyVersionId"], "version-1")
        self.assertEqual(response["data"]["sourceHash"], source_hash)
        self.assertEqual(response["data"]["price"], 101)


if __name__ == "__main__":
    unittest.main()
