import pathlib
import sys
import unittest


PYTHON_ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PYTHON_ROOT))

from strategy_runtime.indicator_runtime import run_indicator
from strategy_runtime.backtest import run_backtest
from strategy_runtime.validator import validate_source


VALID_DATA = {
    "timestamp": ["2026-01-01", "2026-01-02"],
    "open": [10.0, 11.0],
    "high": [11.0, 12.0],
    "low": [9.0, 10.0],
    "close": [10.0, 11.0],
    "volume": [100.0, 100.0],
}


class StrategyRuntimeTests(unittest.TestCase):
    def test_validator_rejects_forbidden_import(self):
        result = validate_source(
            "indicator",
            "import os\ndef run(data, params): return {'buy': [], 'sell': []}",
        )

        self.assertFalse(result.valid)
        self.assertIn("forbidden_import", [item.code for item in result.diagnostics])

    def test_validator_rejects_lookahead_shift(self):
        result = validate_source(
            "indicator",
            "def run(data, params):\n"
            "    future = data['close'].shift(-1)\n"
            "    return {'buy': future, 'sell': future}\n",
        )

        self.assertFalse(result.valid)
        self.assertIn("lookahead", [item.code for item in result.diagnostics])

    def test_validator_requires_runtime_entry_points(self):
        result = validate_source("script", "def on_init(ctx): pass")

        self.assertFalse(result.valid)
        self.assertEqual(
            [item.message for item in result.diagnostics],
            ["Missing required function: on_bar"],
        )

    def test_indicator_signals_are_aligned(self):
        source = (
            "def run(data, params):\n"
            "    n = len(data['close'])\n"
            "    return {'buy': [False] * (n - 1) + [True], 'sell': [False] * n}\n"
        )

        result = run_indicator(source, VALID_DATA, {})

        self.assertEqual(result["buy"], [False, True])
        self.assertEqual(result["sell"], [False, False])

    def test_indicator_supports_four_way_signals(self):
        source = (
            "def run(data, params):\n"
            "    n = len(data['close'])\n"
            "    return {\n"
            "        'open_long': [True] + [False] * (n - 1),\n"
            "        'close_long': [False] * n,\n"
            "        'open_short': [False] * n,\n"
            "        'close_short': [False] * (n - 1) + [True],\n"
            "    }\n"
        )

        result = run_indicator(source, VALID_DATA, {})

        self.assertEqual(result["open_long"], [True, False])
        self.assertEqual(result["close_short"], [False, True])

    def test_indicator_rejects_misaligned_signals(self):
        source = (
            "def run(data, params):\n"
            "    return {'buy': [True], 'sell': [False]}\n"
        )

        with self.assertRaisesRegex(ValueError, "length must match bars"):
            run_indicator(source, VALID_DATA, {})

    def test_indicator_rejects_mixed_signal_forms(self):
        source = (
            "def run(data, params):\n"
            "    n = len(data['close'])\n"
            "    return {\n"
            "        'buy': [False] * n,\n"
            "        'sell': [False] * n,\n"
            "        'open_long': [False] * n,\n"
            "        'close_long': [False] * n,\n"
            "        'open_short': [False] * n,\n"
            "        'close_short': [False] * n,\n"
            "    }\n"
        )

        with self.assertRaisesRegex(ValueError, "exactly one signal form"):
            run_indicator(source, VALID_DATA, {})

    def test_script_orders_execute_on_next_bar_open_with_fees(self):
        source = (
            "def on_init(ctx):\n"
            "    ctx.state['seen'] = 0\n"
            "def on_bar(ctx, bar):\n"
            "    ctx.state['seen'] += 1\n"
            "    if ctx.state['seen'] == 1:\n"
            "        ctx.buy()\n"
            "    if ctx.state['seen'] == 3:\n"
            "        ctx.close_position()\n"
        )
        bars = [
            {"timestamp": "1", "open": 100, "high": 101, "low": 99, "close": 100, "volume": 1000},
            {"timestamp": "2", "open": 101, "high": 102, "low": 100, "close": 101, "volume": 1000},
            {"timestamp": "3", "open": 102, "high": 103, "low": 101, "close": 102, "volume": 1000},
            {"timestamp": "4", "open": 103, "high": 104, "low": 102, "close": 103, "volume": 1000},
        ]

        result = run_backtest(
            runtime="script",
            source=source,
            bars=bars,
            params={},
            policy={
                "initialCapital": 10_000,
                "feeRate": 0.001,
                "slippageBps": 0,
                "entryPct": 1,
                "tradeDirection": "long",
                "exitOwner": "strategy",
            },
        )

        self.assertEqual(len(result["trades"]), 1)
        trade = result["trades"][0]
        self.assertEqual(trade["entryTimestamp"], "2")
        self.assertEqual(trade["exitTimestamp"], "4")
        self.assertEqual(trade["entryPrice"], 101)
        self.assertEqual(trade["exitPrice"], 103)
        self.assertGreater(trade["fees"], 0)
        self.assertLess(trade["netPnl"], trade["grossPnl"])

    def test_engine_stop_loss_precedes_queued_strategy_exit(self):
        source = (
            "def on_init(ctx):\n"
            "    ctx.state['seen'] = 0\n"
            "def on_bar(ctx, bar):\n"
            "    ctx.state['seen'] += 1\n"
            "    if ctx.state['seen'] == 1:\n"
            "        ctx.buy()\n"
            "    if ctx.state['seen'] == 2:\n"
            "        ctx.close_position()\n"
        )
        bars = [
            {"timestamp": "1", "open": 100, "high": 101, "low": 99, "close": 100, "volume": 1000},
            {"timestamp": "2", "open": 100, "high": 101, "low": 99, "close": 100, "volume": 1000},
            {"timestamp": "3", "open": 100, "high": 100, "low": 90, "close": 92, "volume": 1000},
        ]

        result = run_backtest(
            runtime="script",
            source=source,
            bars=bars,
            params={},
            policy={
                "initialCapital": 10_000,
                "feeRate": 0,
                "slippageBps": 0,
                "entryPct": 1,
                "stopLossPct": 0.05,
                "tradeDirection": "long",
                "exitOwner": "engine",
            },
        )

        self.assertEqual(len(result["trades"]), 1)
        self.assertEqual(result["trades"][0]["exitReason"], "stop_loss")
        self.assertEqual(result["trades"][0]["exitPrice"], 95)

    def test_indicator_runtime_supports_short_round_trip(self):
        source = (
            "def run(data, params):\n"
            "    n = len(data['close'])\n"
            "    return {\n"
            "        'open_long': [False] * n,\n"
            "        'close_long': [False] * n,\n"
            "        'open_short': [True] + [False] * (n - 1),\n"
            "        'close_short': [False, False, True, False],\n"
            "    }\n"
        )
        bars = [
            {"timestamp": "1", "open": 100, "high": 101, "low": 99, "close": 100, "volume": 1000},
            {"timestamp": "2", "open": 99, "high": 100, "low": 98, "close": 99, "volume": 1000},
            {"timestamp": "3", "open": 98, "high": 99, "low": 97, "close": 98, "volume": 1000},
            {"timestamp": "4", "open": 97, "high": 98, "low": 96, "close": 97, "volume": 1000},
        ]

        result = run_backtest(
            runtime="indicator",
            source=source,
            bars=bars,
            params={},
            policy={
                "initialCapital": 10_000,
                "feeRate": 0,
                "slippageBps": 0,
                "entryPct": 1,
                "tradeDirection": "both",
                "exitOwner": "strategy",
            },
        )

        self.assertEqual(len(result["trades"]), 1)
        self.assertEqual(result["trades"][0]["side"], "short")
        self.assertGreater(result["trades"][0]["netPnl"], 0)


if __name__ == "__main__":
    unittest.main()
