"""Hermetic-friendly bootstrap decisions for cold-start entrypoints.

Windows: ``onboard.cmd`` / ``onboard.ps1`` (winget when Python missing).
macOS/Linux: ``onboard.sh`` (brew / python.org guidance when Python missing).

This module holds the decision logic so we can unit-test without network thrash.
"""

from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path


def python_version_ok(version_info=None) -> bool:
    v = version_info if version_info is not None else sys.version_info
    return (v[0], v[1]) >= (3, 8)


def is_windows(platform_name: str | None = None) -> bool:
    if platform_name is not None:
        p = platform_name.strip().lower()
        return p in ("windows", "win32", "nt")
    return os.name == "nt" or sys.platform == "win32"


def is_macos(platform_name: str | None = None) -> bool:
    if platform_name is not None:
        p = platform_name.strip().lower()
        return p in ("darwin", "macos", "mac")
    return sys.platform == "darwin"


def resolve_python_command(
    *,
    which_fn=None,
    version_check_fn=None,
    prefer_py_launcher: bool = True,
    platform_name: str | None = None,
) -> dict:
    """Decide which Python command to run for ``-m share_onboard``.

    Returns ``{ok, command, argv_prefix, note}`` where ``argv_prefix`` is a list
    suitable for subprocess (e.g. ``['py', '-3']`` or ``['/usr/bin/python3']``).
    """
    which = which_fn or shutil.which
    check = version_check_fn or (lambda _exe: python_version_ok())
    win = is_windows(platform_name)

    if win and prefer_py_launcher and which("py"):
        # py -3 is preferred on Windows when present and healthy.
        return {
            "ok": True,
            "command": "py -3",
            "argv_prefix": ["py", "-3"],
            "note": "py_launcher",
        }

    # On POSIX prefer python3 first; on Windows either name is fine.
    names = ("python3", "python") if not win else ("python", "python3")
    for name in names:
        path = which(name)
        if not path:
            continue
        if check(path):
            return {
                "ok": True,
                "command": path,
                "argv_prefix": [path],
                "note": "path_" + name,
            }

    return {
        "ok": False,
        "command": None,
        "argv_prefix": [],
        "note": "python_missing",
    }


def bootstrap_plan(
    *,
    which_fn=None,
    winget_present: bool | None = None,
    brew_present: bool | None = None,
    version_check_fn=None,
    platform_name: str | None = None,
) -> dict:
    """Return the bootstrap action plan (no side effects).

    ``action`` is one of: ``run_onboard``, ``install_python_then_run``, ``fail_manual``.
    """
    which = which_fn or shutil.which
    win = is_windows(platform_name)
    mac = is_macos(platform_name)

    if winget_present is None:
        winget_present = bool(which("winget")) if win else False
    if brew_present is None:
        brew_present = bool(which("brew")) if mac else False

    resolved = resolve_python_command(
        which_fn=which,
        version_check_fn=version_check_fn,
        platform_name=platform_name,
    )
    if resolved["ok"]:
        return {
            "action": "run_onboard",
            "python": resolved,
            "winget": bool(winget_present),
            "brew": bool(brew_present),
            "module": "share_onboard",
            "platform": "windows" if win else ("macos" if mac else "posix"),
            "entry": "onboard.cmd" if win else "onboard.sh",
        }

    if win and winget_present:
        return {
            "action": "install_python_then_run",
            "python": resolved,
            "winget": True,
            "brew": False,
            "winget_id": "Python.Python.3.12",
            "module": "share_onboard",
            "fix_link": "https://www.python.org/downloads/",
            "platform": "windows",
            "entry": "onboard.cmd",
        }

    if mac and brew_present:
        return {
            "action": "install_python_then_run",
            "python": resolved,
            "winget": False,
            "brew": True,
            "brew_formula": "python",
            "module": "share_onboard",
            "fix_link": "https://www.python.org/downloads/",
            "platform": "macos",
            "entry": "onboard.sh",
            "install_hint": "brew install python",
        }

    entry = "onboard.cmd" if win else "onboard.sh"
    hint = (
        "Install Python 3.8+ then re-run " + entry
        if win
        else (
            "Install Python 3.8+ (macOS: brew install python, or python.org) "
            "then re-run ./onboard.sh"
            if mac
            else "Install Python 3.8+ then re-run ./onboard.sh"
        )
    )
    return {
        "action": "fail_manual",
        "python": resolved,
        "winget": bool(winget_present),
        "brew": bool(brew_present),
        "module": "share_onboard",
        "fix_link": "https://www.python.org/downloads/",
        "note": hint,
        "platform": "windows" if win else ("macos" if mac else "posix"),
        "entry": entry,
    }


def package_root_has_cold_start(root) -> dict:
    """Assert cold-start files exist under a package root (A or B tree)."""
    root = Path(root)
    needed = (
        "onboard.cmd",
        "onboard.ps1",
        "onboard.sh",
        "share_onboard.py",
        "USER-ONBOARD.md",
    )
    missing = [n for n in needed if not (root / n).is_file()]
    return {
        "ok": not missing,
        "root": str(root),
        "missing": missing,
        "has_launcher": (root / "launch_anchor_dashboard.py").is_file(),
        "has_posix_entry": (root / "onboard.sh").is_file(),
    }
