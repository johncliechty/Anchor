# Collaborator email — Anchor 1.0.3 (Windows + Mac)

Copy/paste ready. This is the **field-tested** install path after Package B failures on a stranger Windows machine (home placeholder, broken `anchor_gui.py`, missing modules).

---

**Subject:** Anchor 1.0 — install (Windows & Mac) — use **v1.0.3**

---

Hi —

Anchor **version 1.0** is ready (public tag **`v1.0.3`** — please use this tip, not an older clone).  
One repo = product + skills. Works on **Windows** and **Mac**.

If you already cloned earlier, update first:

```text
cd Anchor
git pull
git checkout v1.0.3
```

(or re-clone fresh below).

---

## Windows

Recommended folders:

- Clone under: `C:\dev\Anchor`
- Onboard “home” default: **`C:\dev`** (skills + data live under that tree)

```text
mkdir C:\dev
cd C:\dev
git clone https://github.com/johncliechty/Anchor.git
cd Anchor
.\onboard.cmd
```

**Prompts — what to type:**

1. **Home directory** — press Enter to accept **`C:\dev`**, or type another **real** folder (e.g. `C:\dev\Anchorhome`).  
   Never enter the text `<path>` (that was a packaging bug in older tips).
2. **Package** — press Enter for **B** (Anchor + skills).
3. **Permissions** — **Y**.
4. **Feedback** — default **N** is fine (or Y if you want).

**What success looks like:**

- Skills list installs (crucible, foreman, gandalf, …).
- Seat line for Claude shows **ok** if `claude` is on PATH (you do **not** need a special env var).
- Package B: **B_ready: YES** (or dashboard opens).
- Desktop icon **Anchor Dashboard** appears.

If Claude is installed but PATH was opened before install: close PowerShell, open a **new** window, re-run `.\onboard.cmd`.

After onboard:

- Double-click **Anchor Dashboard** on the Desktop, or run:

```text
python launch_anchor_dashboard.py
```

---

## Mac

```text
mkdir -p ~/dev
cd ~/dev
git clone https://github.com/johncliechty/Anchor.git
cd Anchor
chmod +x ./onboard.sh
./onboard.sh
```

Home default is typically `~/dev`. Same Package **B** / permissions / feedback flow.  
Desktop launcher: **Anchor Dashboard.command** (double-click).  
Or: `python3 launch_anchor_dashboard.py`

---

## Requirements

- **git** + network  
- **Windows:** Python 3.8+ (onboard can use winget)  
- **Mac:** Python 3.8+ (`brew install python` if needed)  
- At least one coding CLI on PATH and logged in: **Claude Code** and/or **agy** and/or **Grok**  

Skills ship **inside** the repo under `vendor/bundled-skills/` — no second clone.

---

## If something still fails

1. Confirm version: open `VERSION` in the clone — must say **`1.0.3`**.  
2. `git pull` / re-clone if older.  
3. Send the last screen of `.\onboard.cmd` (or `./onboard.sh`) plus OS + Python version.

Repo: https://github.com/johncliechty/Anchor  

Questions → reply here.

— John

---

## Short version

```text
Windows:
  cd C:\dev
  git clone https://github.com/johncliechty/Anchor.git
  cd Anchor
  .\onboard.cmd
  # home prompt: accept C:\dev   (never type <path>)

Mac:
  mkdir -p ~/dev && cd ~/dev
  git clone https://github.com/johncliechty/Anchor.git
  cd Anchor
  chmod +x ./onboard.sh && ./onboard.sh
```
