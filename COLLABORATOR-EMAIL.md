# Collaborator email — Anchor 1.0 (Windows + Mac)

Copy/paste ready. Update the greeting if you want; the install blocks are the source of truth for **v1.0.1**.

---

**Subject:** Anchor 1.0 — install in a few commands (Windows & Mac)

---

Hi —

Anchor **version 1.0** is ready. Public repo, full product + skills in one clone. Works on **Windows** and **Mac**.

## Windows

Recommended install folder: `C:\dev`

```text
mkdir C:\dev
cd C:\dev
git clone https://github.com/johncliechty/Anchor.git
cd Anchor
.\onboard.cmd
```

What that does:

1. Clones Anchor **1.0** (current public tip / tag `v1.0.1`).
2. `.\onboard.cmd` bootstraps Python via winget if needed, then runs the interactive onboard (home dir, skills, seat probes for Claude / agy / Grok). Feedback upload defaults to **No**.
3. Skills come **with the clone** under `vendor/bundled-skills/` — onboard installs/registers them; you don’t clone a second skills repo.
4. For full Anchor + skills (Package B): starts the service if needed, checks the local dashboard, and places a desktop **Anchor** icon that restarts the service if it’s down and opens the browser.

## Mac

Recommended install folder: `~/dev`

```text
mkdir -p ~/dev
cd ~/dev
git clone https://github.com/johncliechty/Anchor.git
cd Anchor
chmod +x ./onboard.sh
./onboard.sh
```

What that does:

1. Same clone — full product + skills.
2. `./onboard.sh` checks for Python 3.8+ (`python3`). If missing: `brew install python` (or python.org), then re-run `./onboard.sh`.
3. Same interactive onboard (home often `~/dev`, skills, seat probes). Feedback defaults to **No**.
4. Package B: starts the dashboard in the background if needed, probes http://localhost:8777, and puts **Anchor Dashboard.command** on the Desktop (double-click in Finder). In-dashboard agent terminals use a Mac-native PTY (no extra install).

After install you can also run:

```text
python3 launch_anchor_dashboard.py
```

## Requirements

- **git** and network for the clone  
- **Windows:** winget can install Python if needed  
- **Mac:** Python 3.8+ (Homebrew or python.org)  
- Model CLIs you already use for seats: Claude Code / agy / Grok, logged in and on PATH  

## Version

This is **Anchor 1.0** (public tag **`v1.0.1`** — Mac/Windows install parity patch on the 1.0 line).  
Repo: https://github.com/johncliechty/Anchor  

Repo is public for easy clone (can be made private later if you want).

Questions → reply here.

— John

---

## Short version (if you need a brief note)

```text
Windows:
  cd C:\dev
  git clone https://github.com/johncliechty/Anchor.git
  cd Anchor
  .\onboard.cmd

Mac:
  mkdir -p ~/dev && cd ~/dev
  git clone https://github.com/johncliechty/Anchor.git
  cd Anchor
  chmod +x ./onboard.sh && ./onboard.sh
```
