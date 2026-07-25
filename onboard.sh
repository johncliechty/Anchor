#!/usr/bin/env bash
# onboard.sh — macOS / Linux cold-start for shareable Anchor + skills.
#
# Usage (from package root after git clone):
#   chmod +x ./onboard.sh   # once if needed
#   ./onboard.sh
#
# What this does:
#   1) Ensure Python 3.8+ (prefer python3 on PATH; suggest brew/python.org if missing)
#   2) Run: python3 -m share_onboard  (interactive dialogue)
#
# Windows users: use onboard.cmd / onboard.ps1 instead.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

die() {
  echo "ERROR: $*" >&2
  exit 1
}

have() { command -v "$1" >/dev/null 2>&1; }

pick_python() {
  # Prefer python3, then python (must be 3.8+).
  local cand
  for cand in python3 python; do
    if have "$cand"; then
      if "$cand" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 8) else 1)' 2>/dev/null; then
        echo "$cand"
        return 0
      fi
    fi
  done
  return 1
}

echo "Anchor onboard (macOS/Linux) — package root: $ROOT"
echo

if ! PY="$(pick_python)"; then
  echo "Python 3.8+ not found on PATH."
  echo
  if [[ "$(uname -s)" == "Darwin" ]]; then
    if have brew; then
      echo "Recommended:  brew install python"
      echo "Then re-run:  ./onboard.sh"
    else
      echo "Install Homebrew (https://brew.sh) then:  brew install python"
      echo "Or install Python 3.8+ from https://www.python.org/downloads/"
      echo "Then re-run:  ./onboard.sh"
    fi
  else
    echo "Install Python 3.8+ via your package manager, e.g.:"
    echo "  sudo apt install python3   # Debian/Ubuntu"
    echo "  sudo dnf install python3   # Fedora"
    echo "Or https://www.python.org/downloads/"
    echo "Then re-run:  ./onboard.sh"
  fi
  exit 1
fi

echo "Using: $PY ($("$PY" -c 'import sys; print("%d.%d.%d" % sys.version_info[:3])'))"
echo

# Ensure package root is on PYTHONPATH for -m share_onboard
export PYTHONPATH="${ROOT}${PYTHONPATH:+:$PYTHONPATH}"

exec "$PY" -m share_onboard "$@"
