# Collaborator email — Anchor 1.1.0 (Windows + Mac)

Copy/paste ready. Same **field-tested** install path as 1.0.3 (proven on stranger
Windows machines); the version and the what-to-test section are new.

---

**Subject:** Anchor 1.1.0 — install / update (Windows & Mac) — hardened trio + two new review engines

---

Hi —

Anchor **1.1.0** is out (public tag **`v1.1.0`** — please use this tip, not an older clone).
One repo = product + skills. Works on **Windows** and **Mac**.

If you already cloned earlier, update first:

```text
cd Anchor
git pull
git checkout v1.1.0
```

(or re-clone fresh below).

## What's new in 1.1.0 (why you should update)

This release is the output of a full journal-driven hardening pass — every recorded
error and friction from real runs was verified against the code and fixed, then a
round of new capability landed on top:

- **The build/plan loop stops lying and stops hanging.** Foreman gate timeouts are
  now honestly classified (`TIMEOUT_INCOMPLETE` with progress %, never a fake
  "0 pass 0 fail" RED), the gate prints a heartbeat every minute (`gate running ·
  t+3m · last: <test line>`), and a flaky reviewer reply degrades loudly instead of
  false-halting your run. Crucible Stage-1 survives crashes (per-round best-draft
  persistence) and `approved: true` actually hands off ("go go go" works).
- **Two NEW adversarial review engines:**
  - `legal-beagle` → `node bin/legal-round.mjs --memo memo.md --sources pack/` —
    hard citation gates (every cite must quote the authority, verbatim from your
    source pack) + a 3-reviewer ≥2-agree adversarial round + an independent judge.
  - `financial-analyst` → `node bin/deal-review.mjs --report r.md --values nodes.json`
    — a deterministic grounding gate (every number must trace to the calculation
    graph) + the same adversarial round. The exact-Decimal calc engine is unchanged.
- **Certified arithmetic in one command:** `node bin/ramanujan-run.mjs --claim
  "12*37+9 = 453"` → HOLDS / REFUTED-with-exact-value / honestly UNSETTLED, via a
  re-executable subprocess certificate. Try feeding it a false equation.
- **Honesty everywhere is machine-enforced now, not remembered:** researchPrime's
  stakes governor really gates cost by tier; cross-model stamps are derived from
  which model families actually answered (unforgeable); every engine that lacks
  live seats says "the review did NOT run" instead of pretending.
- **Cleaner bundle:** dead/experimental modules are archived out, every deep skill
  has its NORTH-STAR + LESSONS in-folder, and each skill has a human-facing
  `HUMAN.md` card — read that first, `SKILL.md` is for the agents.

## Windows

Recommended folders:

- Clone under: `C:\dev\Anchor`
- Onboard “home” default: **`C:\dev`** (skills + data live under that tree)

```text
mkdir C:\dev
cd C:\dev
git clone https://github.com/johncliechty/Anchor.git
cd Anchor
git checkout v1.1.0
.\onboard.cmd
```

**Prompts — what to type:**

1. **Home directory** — press Enter to accept **`C:\dev`**, or type another **real** folder (e.g. `C:\dev\Anchorhome`).
   Never enter the text `<path>` (that was a packaging bug in older tips).
2. **Package** — press Enter for **B** (Anchor + skills).
3. **Permissions** — **Y**.
4. **Feedback** — default **N** is fine (or Y if you want).

**What success looks like:**

- Skills list installs (crucible, foreman, gandalf, legal-beagle, financial-analyst, …).
- Seat line for Claude shows **ok** if `claude` is on PATH (you do **not** need a special env var).
- Package B: **B_ready: YES** (or dashboard opens).
- Desktop icon **Anchor Dashboard** appears.

If Claude is installed but PATH was opened before install: close PowerShell, open a **new** window, re-run `.\onboard.cmd`.

After onboard:

- Double-click **Anchor Dashboard** on the Desktop, or run:

```text
python launch_anchor_dashboard.py
```

## Mac

```text
mkdir -p ~/dev
cd ~/dev
git clone https://github.com/johncliechty/Anchor.git
cd Anchor
git checkout v1.1.0
chmod +x ./onboard.sh
./onboard.sh
```

Home default is typically `~/dev`. Same Package **B** / permissions / feedback flow.
Desktop launcher: **Anchor Dashboard.command** (double-click).
Or: `python3 launch_anchor_dashboard.py`

## Requirements

- **git** + network
- **Windows:** Python 3.8+ (onboard can use winget)
- **Mac:** Python 3.8+ (`brew install python` if needed)
- At least one coding CLI on PATH and logged in: **Claude Code** and/or **agy** and/or **Grok**

Skills ship **inside** the repo under `vendor/bundled-skills/` — no second clone.

## Good first tests (10 minutes, no setup beyond onboard)

These run the new deterministic layers with zero model calls — great smoke tests:

```text
cd vendor/bundled-skills/ramanujan
node bin/ramanujan-run.mjs --claim "12*37+9 = 453" --claim "2+2 = 5"
# expect: c1 HOLDS · c2 REFUTED (certified exact value of LHS-RHS is -1, not 0)

cd ../legal-beagle
node --test
# expect: all green (the citation gates + engine, hermetic)

cd ../financial-analyst
node --test
# expect: all green (the grounding gate + engine, hermetic)
```

With a model CLI logged in, the real flows to try:

1. **Trio order:** researchPrime (optional) → Crucible (approve the plans — YOU are
   the convergence authority) → Foreman (build). Watch the status heartbeats.
2. On a **vacuous-GREEN halt**: don't blind clear-halt — land code, or use
   `--clear-halt --force` (eyes open), or `--attest-wave-proven` if the deliverable
   is real and green but the guard can't see it (it re-runs the gate; it never
   overrides one).
3. Never use bare `node --test test/` as a Foreman gate on Windows — plans emit
   `scripts/run-all-tests.mjs`; use that.
4. If a cross-family (Gemini) seat misbehaves, the transports now tell you why
   (`NOT_LOGGED_IN_ANTIGRAVITY`, `model_substituted`, …) instead of a JSON-parse
   error. A run stamped `cross_model: false` is an honest single-family run, not
   an error.

What we most want from testing: run something REAL, and when anything surprises
you, halts, or feels slow — send the last screen + what you expected. Every skill
keeps a `journal/` of exactly these frictions; your reports become the next
hardening round.

## If something still fails

1. Confirm version: open `VERSION` in the clone — must say **`1.1.0`**.
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
  git checkout v1.1.0
  .\onboard.cmd
  # home prompt: accept C:\dev   (never type <path>)

Mac:
  mkdir -p ~/dev && cd ~/dev
  git clone https://github.com/johncliechty/Anchor.git
  cd Anchor
  git checkout v1.1.0
  chmod +x ./onboard.sh && ./onboard.sh
```
