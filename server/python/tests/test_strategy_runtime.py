import pathlib
import sys
import unittest


PYTHON_ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PYTHON_ROOT))

from strategy_runtime.indicator_runtime import run_indicator
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


if __name__ == "__main__":
    unittest.main()
