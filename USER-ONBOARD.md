**Version: 1.0.3**

# Install guide — Shareable skills + Anchor (Package A / B)

**All rights reserved.** Not open source. Use by author permission only.

This is the short path for collaborators. Plain ASCII for mail and terminals.

---

## Super-simple path (Windows)

### 1. Open a terminal where you want everything installed

Recommended: `C:\dev` (create it if needed).

- File Explorer → that folder → address bar → type `cmd` or `powershell` and Enter  
- Or VS Code / Cursor → Open Folder → that directory → Terminal  

### 2. Get the package (git)

```text
git clone https://github.com/johncliechty/Anchor.git
cd Anchor
```

Confirm you have **1.0.3+** (`type VERSION`). Older tips had Package B bugs.

(If you were given a zip instead of git: unzip, then `cd` into the package root.)

### 3. Run onboard (one command)

From the package root (folder that contains `onboard.cmd` and `share_onboard.py`):

```text
.\onboard.cmd
```

Or:

```text
powershell -File .\onboard.ps1
```

**Home directory prompt:** default is **`C:\dev`**. Press Enter, or type another **real** folder.  
**Never** type the placeholder text `<path>` (broken in pre-1.0.3 packages).

**What this does for you:**

1. Checks for **Python 3.8+**. If missing, tries **winget** to install it (Windows). If that fails, it points you at python.org and asks you to re-run.
2. Starts the **interactive** install dialogue — same as `python -m share_onboard`.
3. Asks/confirm **where** to put things (home; default `C:\dev`).
4. Installs **skills** and registers them for your agent hosts (Claude pointer, Grok paths, etc.).
5. Probes **Claude / Gemini(agy) / Grok** on PATH (PATH presence is enough for readiness; live session probe is optional via env).
6. Optional **feedback** — **default is No**.
7. **Package B only:** starts the Anchor dashboard process if needed, HTTP-probes the local dashboard, places an **Anchor** icon on the desktop (with **anchor.ico**).

You do **not** need to pre-install Python by hand when winget works.  
You do **not** use silent/`--non-interactive` for a real ready install (that path never stamps ready).

You can also run the dialogue directly after Python is available:

```text
python -m share_onboard
```

### 4. After Package B succeeds

- Double-click **Anchor Dashboard** on the desktop (or pin it to the taskbar).
- That icon runs a **launcher**: if Anchor is already running, it leaves it alone; if it died, it starts the **service**; then it opens the dashboard in your **default browser**.
- Optional: right-click the taskbar icon → pin.

### 5. After skills are installed — `/onboard` in Claude (etc.)

Once skills are registered, your coding agent may expose **`/onboard`** as a **re-run / help** path.  
**Cold-start for a new machine is still `.\onboard.cmd`**, not slash-onboard (slash needs skills already present).

---

## Super-simple path (macOS)

### 1. Create a dev directory and open Terminal there

Recommended: `~/dev`

```text
mkdir -p ~/dev
cd ~/dev
```

(Or use any folder you prefer; onboard will also recommend `~/dev` as the install home.)

### 2. Clone

```text
git clone https://github.com/johncliechty/Anchor.git
cd Anchor
```

### 3. Run Mac/Linux onboard

```text
chmod +x ./onboard.sh
./onboard.sh
```

**What this does:**

1. Checks for **Python 3.8+** (`python3` on PATH). If missing:
   - with Homebrew: install via `brew install python`, then re-run `./onboard.sh`
   - or install from https://www.python.org/downloads/ and re-run
2. Runs the same interactive **share_onboard** dialogue as Windows.
3. Installs skills + probes seats (install `claude` / `agy` / `grok` and log in so they appear on PATH).
4. **Package B:** starts the dashboard in the background if needed, HTTP-probes `http://localhost:8777`, and writes a Desktop **`Anchor Dashboard.command`** launcher (double-click in Finder).  
   On Mac, **Package B ready = dashboard HTTP OK** (desktop `.command` is best-effort; there is no Windows-style service manager yet — Anchor runs as a detached background process).

You can also run:

```text
python3 -m share_onboard
```

### 4. After install

- Double-click **Anchor Dashboard.command** on the Desktop, **or**
- `python3 launch_anchor_dashboard.py` from the clone, **or**
- open http://localhost:8777 if the service is already up.

### Terminals inside Anchor (Mac)

In-dashboard agent terminals use a **POSIX PTY** (stdlib) — not Windows ConPTY/pywinpty.  
If `claude` / `agy` / `grok` are on your PATH and logged in, interactive terminals are intended to work the same as on Windows.

---

## Super-simple path (Linux)

Same as macOS, with `~/dev` and `./onboard.sh`. Install Python 3.8+ via your package manager if needed (`sudo apt install python3`, etc.).

---

## Package A vs B (what ready means)

| | **A — skills only** | **B — Anchor + skills** |
|--|---------------------|-------------------------|
| Skills + host register | Yes | Yes |
| Seat probe (claude / agy / grok) | Yes | Yes |
| Anchor service + local dashboard | No | Yes (HTTP probe) |
| Desktop launcher | No | Windows: branded `.lnk`; macOS/Linux: `.command` best-effort |

Zero coding seats → not-ready (non-zero exit). Skills still may be on disk.

---

## Feedback (optional)

Onboard asks whether to share **sanitized** skill-friction reports. **Default is No.**  
If Yes: coarse metadata only — not your files, prompts, or project content.

---

## Rights

**All rights reserved.** Not MIT/Apache/GPL. Redistribution only by permission.
