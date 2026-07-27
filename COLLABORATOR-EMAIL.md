# Collaborator email — Anchor 1.1.2 (Windows + Mac)

Copy/paste ready. **This is the first release we consider genuinely stable and
shareable**: both hardening passes are in it — the skills/trio pass and the
Anchor product pass — and nothing experimental is.

Same field-tested install path as 1.0.3 / 1.1.0. What is new here is the
version, the "please update" notice, and the what's-new section.

> **Not in this release, on purpose:** the v1.2 "steward" work. It is still
> being built and reviewed and is deliberately kept out of anything shared.
> If someone asks about it, the answer is "not yet".

---

**Subject:** Anchor 1.1.2 — the first stable build (1.1.0 wouldn't start; this one is hardened end to end)

---

Hi —

Anchor **1.1.2** is out (public tag **`v1.1.2`** — please use this tip).
One repo = product + skills. Works on **Windows** and **Mac**.

This is the one worth your time. Everything before it was either unhardened or,
in the case of 1.1.0, unable to start at all. Two full hardening passes landed
underneath this build:

1. **The skills** — the trio (researchPrime → Crucible → Foreman) and the
   deep-work skills were reviewed against their own run journals: every recorded
   error and friction from real runs was verified against the code and fixed.
2. **Anchor itself** — the product around them: terminal, dictation, usage
   accounting, summaries, logging, packaging.

Both are in this tag. Details below.

## Please update — 1.1.0 could not start

If you cloned **1.1.0** and the dashboard never came up, that was us, not you.
The bundle was missing a data file the server reads while it is still loading,
so startup failed immediately with a `FileNotFoundError` about
`foundry_map_v2.schema.json`. There was no workaround and nothing worth
debugging — it simply could not start.

The cause is worth stating plainly, because it explains one of the fixes: our
packaging list is deny-by-default (nothing ships unless it is listed), and that
file was never added to it. Every packaging check we run reads the *contents* of
files, and a content check cannot notice a file that isn't there. Nothing in the
release process ever actually started the bundle it had just built.

So this release ships the missing files **and starts the built bundle as part of
the build**. If it can't come up, the release now fails instead of shipping.

If you already cloned earlier:

```text
cd Anchor
git pull
git checkout v1.1.2
```

(or re-clone fresh below).

## What's hardened in the skills

- **The build/plan loop stops lying and stops hanging.** Foreman gate timeouts
  are honestly classified (`TIMEOUT_INCOMPLETE` with a progress %, never a fake
  "0 pass 0 fail" RED), the gate prints a heartbeat every minute (`gate running ·
  t+3m · last: <test line>`), and a flaky reviewer reply degrades loudly instead
  of false-halting your run. Crucible Stage-1 survives crashes (per-round
  best-draft persistence) and `approved: true` actually hands off.
- **Two adversarial review engines that are enforced, not merely described:**
  - `legal-beagle` → `node bin/legal-round.mjs --memo memo.md --sources pack/` —
    hard citation gates (every cite must quote the authority, verbatim from your
    source pack) + a 3-reviewer ≥2-agree adversarial round + an independent judge.
  - `financial-analyst` → `node bin/deal-review.mjs --report r.md --values nodes.json`
    — a deterministic grounding gate (every number must trace to the calculation
    graph) + the same adversarial round. The exact-Decimal calc engine is unchanged.
- **Certified arithmetic in one command:** `node bin/ramanujan-run.mjs --claim
  "12*37+9 = 453"` → HOLDS / REFUTED-with-exact-value / honestly UNSETTLED, via a
  re-executable subprocess certificate. Try feeding it a false equation.
- **Honesty is machine-enforced now, not remembered:** researchPrime's stakes
  governor really gates cost by tier; cross-model stamps are derived from which
  model families actually answered (unforgeable); every engine that lacks live
  seats says "the review did NOT run" instead of pretending it did.
- **Cleaner bundle:** dead/experimental modules archived out, every deep skill
  carries its NORTH-STAR + LESSONS in-folder, and each skill has a human-facing
  `HUMAN.md` card — read that first, `SKILL.md` is written for the agents.

## What's hardened in Anchor itself

Every item below was reproduced from logs or a live session first, then fixed.

- **The terminal stops double-printing.** If you used Anchor on a laptop you may
  have seen output repeat itself, or a session go quiet after the lid closed.
  Three faults were stacking up: reconnecting replayed the session from byte zero
  instead of from where you were, a healthy connection could silently trigger the
  fallback transport so *both* streams wrote to your screen, and re-opening a
  session mounted a second terminal on top of the first. Sleep/wake and network
  drops now actively resume instead of waiting to be noticed.

- **Dictation into an Anchor terminal works on iPad.** Dictating used to re-send
  everything you had said so far on every pause, so a few sentences turned into
  an avalanche. Anchor now tracks the composition properly and sends only what is
  new. (The underlying terminal component gives iOS Safari no on-screen target to
  anchor a dictation to; Anchor supplies one for touch devices, without forking
  the component.)

- **Usage tracking actually shows your numbers.** Tokens, time and cost read as
  zero or blank for most projects. The numbers were on disk the whole time — the
  readers were looking in too few places, and one lost index file could hide
  efforts entirely. On a real project here that turned "0" into **3,178,583
  tokens across 2 sessions**. Cost still displays as `(subscription)`: Anchor
  deliberately keeps no pricing table rather than invent a dollar figure.

- **Summaries stop repeating themselves, and stop billing you for blanks.**
  Anchor writes each summary twice and keeps what both runs support — but it was
  *merging* the two runs instead of comparing them, so two rewordings of the same
  point both survived. Across the summaries on this machine, 56 of 167 carried
  restated claims; one 33-point planning summary is now 20. Separately, when a
  session's documents cannot be read there is nothing to check a summary against,
  so it always came back empty — 45% of summaries were blank, and one blank cost
  194,422 tokens to produce. Anchor now recognises that case and does not make
  the call. It also does not cache the blank, so the summary fills in on its own
  once the documents land.

- **NEW — journaling, so friction gets fixed instead of forgotten.** When
  something is wrong, annoying, or just feels off, say so on the spot:

  ```text
  python anchor.py journal "the terminal double-printed after my laptop woke up" --severity problem
  python anchor.py friction-report
  ```

  Your words are stored **verbatim** — Anchor never rewrites, summarises or
  judges them, and never calls a model to record one (it has to work when the
  engines are down, which is exactly when you will want it). `friction-report`
  groups everything open into a brief for a later cleanup pass. Nothing
  self-resolves: a record stays open until someone closes it with
  `friction-resolve <id>`. There is also a `POST /api/rnd/journal_friction`
  endpoint if you would rather wire it into something.

  This is the same loop that produced both hardening passes above — the skills
  each keep a `journal/` of exactly these frictions. Your reports become the
  next round.

- **Access logs no longer record your access token.** Tokens passed in URLs were
  written to the log in full. They are redacted now. **If you have been running
  an older version, treat the tokens in your existing `logs/` as exposed** —
  rotate them and delete or scrub those files. This fix only covers new requests;
  it cannot clean up what is already written.

- **The zombie-hunter background process stops thrashing.** A failing helper was
  restarted in a tight loop (74 restart cycles in one log). It now backs off and
  cools down instead.

- **Tests can no longer spend your money.** Anchor's own test suite could start
  real billable CLI sessions if an environment variable happened to be set. The
  guard is fail-closed at three layers now and refuses to launch a real engine
  from a test, whatever the environment says.

## Windows

Recommended folders:

- Clone under: `C:\dev\Anchor`
- Onboard "home" default: **`C:\dev`** (skills + data live under that tree)

```text
mkdir C:\dev
cd C:\dev
git clone https://github.com/johncliechty/Anchor.git
cd Anchor
git checkout v1.1.2
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
git checkout v1.1.2
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

**First, confirm the thing that was broken actually works** — this is the whole
reason to update:

```text
python -c "import anchor_gui; print('starts OK')"
# expect: starts OK        (on 1.1.0 this raised FileNotFoundError)
```

Then the deterministic engines. These run with zero model calls, so they are
good smoke tests:

```text
cd vendor/bundled-skills/ramanujan
node bin/ramanujan-run.mjs --claim "12*37+9 = 453" --claim "2+2 = 5"
# expect: c1 HOLDS · c2 REFUTED (certified exact value of LHS-RHS is -1, not 0)

cd ../legal-beagle
node --test
# expect: 11/11 green (the citation gates + engine, hermetic)

cd ../financial-analyst
node --test
# expect: 8/8 green (the grounding gate + engine, hermetic)
```

All four were re-run against this exact bundle before it was tagged.

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

What we most want from testing: run something REAL, and **when anything
surprises you, halts, or feels slow, journal it on the spot** —
`python anchor.py journal "..."` takes five seconds and keeps your exact words.
Send the last screen too.

## Known rough edges (so they don't surprise you)

- Cost shows `(subscription)`, never a dollar amount — deliberate. Anchor will
  not guess at pricing.
- Some summaries still say "no grounded claims". That is Anchor declining to
  write something it cannot support from your documents, not a crash.
- `python distro.py` (the packaging builder) currently fails its own secret scan
  on placeholder keys inside vendored skill *test* files. It does not affect
  running Anchor — only rebuilding the distribution.

## If something still fails

1. Confirm version: open `VERSION` in the clone — must say **`1.1.2`**.
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
  git checkout v1.1.2
  .\onboard.cmd
  # home prompt: accept C:\dev   (never type <path>)

Mac:
  mkdir -p ~/dev && cd ~/dev
  git clone https://github.com/johncliechty/Anchor.git
  cd Anchor
  git checkout v1.1.2
  chmod +x ./onboard.sh && ./onboard.sh

On 1.1.0 or earlier? Please update — 1.1.0 could not start:
  cd Anchor && git pull && git checkout v1.1.2
```
