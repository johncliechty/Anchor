# Anchor 1.0.2

**Public collaborator release** — all rights reserved (not open source).

Hotfix over **1.0.1** so Package B actually works on a stranger Windows machine.

## What 1.0.2 fixes (collaborator field report)

1. **Windows home default** was the literal placeholder `<path>` → now **`C:\dev`**
2. **`anchor_gui.py` line-ending corruption** (extra CR bytes) → clean file that Python can compile
3. **Missing modules** required to start the dashboard (`supervisor`, `anchor_settings`, foundry/usage helpers, …) → included
4. **Seat probe** treated “Claude on PATH” as failure without live probes → PATH presence is enough for readiness (live probe still opt-in)

## Cold start

### Windows

```text
mkdir C:\dev
cd C:\dev
git clone https://github.com/johncliechty/Anchor.git
cd Anchor
.\onboard.cmd
```

At the home prompt, accept the default **`C:\dev`** (or type another real folder).  
Do **not** enter the text `<path>`.

### macOS / Linux

```text
mkdir -p ~/dev
cd ~/dev
git clone https://github.com/johncliechty/Anchor.git
cd Anchor
chmod +x ./onboard.sh
./onboard.sh
```

## Collaborator email

See `COLLABORATOR-EMAIL.md`.

Tag: **`v1.0.2`**.
