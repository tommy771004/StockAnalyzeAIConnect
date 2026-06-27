from __future__ import annotations

import ast
import hashlib
from typing import Literal

from .contracts import Diagnostic, ValidationResult


FORBIDDEN_NAMES = {
    "__import__",
    "breakpoint",
    "compile",
    "delattr",
    "dir",
    "eval",
    "exec",
    "getattr",
    "globals",
    "help",
    "input",
    "locals",
    "memoryview",
    "open",
    "setattr",
    "vars",
}

FORBIDDEN_NODES = (
    ast.AsyncFunctionDef,
    ast.Await,
    ast.ClassDef,
    ast.Delete,
    ast.Global,
    ast.Import,
    ast.ImportFrom,
    ast.Lambda,
    ast.Nonlocal,
    ast.Raise,
    ast.Try,
    ast.While,
    ast.With,
    ast.Yield,
    ast.YieldFrom,
)


def _diagnostic(code: str, message: str, node: ast.AST | None = None) -> Diagnostic:
    return Diagnostic(
        code=code,
        message=message,
        line=getattr(node, "lineno", None),
    )


def _is_negative_number(node: ast.AST) -> bool:
    return (
        isinstance(node, ast.UnaryOp)
        and isinstance(node.op, ast.USub)
        and isinstance(node.operand, ast.Constant)
        and isinstance(node.operand.value, (int, float))
        and node.operand.value > 0
    )


def validate_source(
    runtime: Literal["indicator", "script"] | str,
    source: str,
) -> ValidationResult:
    diagnostics: list[Diagnostic] = []
    source_hash = hashlib.sha256(source.encode("utf-8")).hexdigest()

    if runtime not in {"indicator", "script"}:
        return ValidationResult(
            valid=False,
            source_hash=source_hash,
            diagnostics=[
                Diagnostic(
                    code="invalid_runtime",
                    message="Runtime must be indicator or script",
                )
            ],
        )

    try:
        tree = ast.parse(source, mode="exec")
    except SyntaxError as exc:
        return ValidationResult(
            valid=False,
            source_hash=source_hash,
            diagnostics=[
                Diagnostic(
                    code="syntax_error",
                    message=exc.msg,
                    line=exc.lineno,
                )
            ],
        )

    top_level_functions = {
        node.name for node in tree.body if isinstance(node, ast.FunctionDef)
    }
    required = {"run"} if runtime == "indicator" else {"on_init", "on_bar"}
    for name in sorted(required - top_level_functions):
        diagnostics.append(
            Diagnostic(
                code="missing_function",
                message=f"Missing required function: {name}",
            )
        )

    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            diagnostics.append(
                _diagnostic(
                    "forbidden_import",
                    "Imports are not allowed; use the provided runtime objects",
                    node,
                )
            )
            continue

        if isinstance(node, FORBIDDEN_NODES):
            diagnostics.append(
                _diagnostic(
                    "forbidden_syntax",
                    f"{type(node).__name__} is not allowed",
                    node,
                )
            )

        if isinstance(node, ast.Name) and node.id in FORBIDDEN_NAMES:
            diagnostics.append(
                _diagnostic(
                    "forbidden_name",
                    f"{node.id} is not allowed",
                    node,
                )
            )

        if isinstance(node, ast.Attribute) and node.attr.startswith("_"):
            diagnostics.append(
                _diagnostic(
                    "forbidden_attribute",
                    f"Attribute {node.attr} is not allowed",
                    node,
                )
            )

        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == "shift"
            and node.args
            and _is_negative_number(node.args[0])
        ):
            diagnostics.append(
                _diagnostic(
                    "lookahead",
                    "Negative shift introduces look-ahead bias",
                    node,
                )
            )

    unique_diagnostics: list[Diagnostic] = []
    seen: set[tuple[str, int | None, str]] = set()
    for item in diagnostics:
        key = (item.code, item.line, item.message)
        if key not in seen:
            seen.add(key)
            unique_diagnostics.append(item)

    return ValidationResult(
        valid=not any(item.severity == "error" for item in unique_diagnostics),
        source_hash=source_hash,
        diagnostics=unique_diagnostics,
    )
