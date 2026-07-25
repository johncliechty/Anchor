# Anchor 1.0.3

**Public collaborator release** — all rights reserved (not open source).

Patch over **1.0.2** after end-to-end verification.

## Fixes in 1.0.2 (still included)

1. Windows home default **`C:\dev`** (was broken literal `<path>`)
2. Clean `anchor_gui.py` line endings + missing dashboard modules
3. `anchor.ico` branded desktop shortcut
4. Seat probe: CLI on PATH is enough for readiness

## Fixes in 1.0.3

5. **`onboard.sh` LF-only** line endings (CRLF breaks macOS/Linux bash with `$'\r': command not found`)
6. `.gitattributes` pins `*.sh` / `onboard.sh` to `eol=lf`

## E2E verification (2026-07-25)

Verified on fresh public clone:

- Root Python modules compile; no double-CR corruption
- Skills install: 13 portfolio dirs from `vendor/bundled-skills`
- Windows: branded `.lnk`, detached dashboard start, HTTP probe `:8777` OK, dual gate **B_ready**
- macOS path (simulated): dual gate B_ready on probe, `.command` launcher written, `onboard.sh` bash syntax OK, Posix PTY backend present
- Seat probe: Claude on PATH → ok without `ANCHOR_SHARE_LIVE_PROBES`

Not run on physical Apple hardware in this session; Mac cold-start is validated at script/gate/launcher level.

## Cold start

### Windows

```text
mkdir C:\dev
cd C:\dev
git clone https://github.com/johncliechty/Anchor.git
cd Anchor
.\onboard.cmd
```

### macOS / Linux

```text
mkdir -p ~/dev
cd ~/dev
git clone https://github.com/johncliechty/Anchor.git
cd Anchor
chmod +x ./onboard.sh
./onboard.sh
```

Tag: **`v1.0.3`**. See `COLLABORATOR-EMAIL.md`.
