# Anchor 1.0.1

**Public collaborator release** — all rights reserved (not open source).

Patch over **1.0.0** with macOS/Linux cold-start parity for the same product tree.

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

## Contents

- Anchor product + onboard shell (Windows `onboard.cmd` / macOS-Linux `onboard.sh`)
- Vendored skills under `vendor/bundled-skills/` (installed by onboard into your skills root)
- Service-aware desktop launcher:
  - **Windows:** branded `.lnk` + service start when needed
  - **macOS/Linux:** Desktop `.command` launcher + detached dashboard process; Package B ready = local HTTP probe OK

## Skills in this tree

See `vendor/bundled-skills/SOURCES.md`.

## Collaborator email

See `COLLABORATOR-EMAIL.md` (copy/paste ready).

Tag: **`v1.0.1`**. Development beyond this line continues on the private 1.1 tree.
