# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Issue tracking — chainlink

This repo uses [chainlink](https://github.com/dollspace-gay/chainlink) (local SQLite-backed issue tracker, binary at `~/.cargo/bin/chainlink`). State lives in `.chainlink/issues.db`, committed to git so all agents in this repo share it.

- `chainlink list` — see all open issues
- `chainlink show <id>` — full description, comments, related links
- `chainlink next` — priority-ranked suggestion
- `chainlink create "title" -d "desc" -l <label> -p <priority>` — file a new one
- `chainlink session start` / `chainlink session end --notes "..."` — bracket a working session

Common labels: `idea`, `bug`, `ui`, `designer`, `metrics`.

## Where things live (knowledge taxonomy)

Three distinct homes for non-code information, chosen by what kind of thing it is:

- **Chainlink** (`.chainlink/issues.db`): *actionable work* — bugs, features, ideas that have a natural "done" state. If you close it, what does that mean? If "I built/fixed/decided that", it's an issue.
- **`notes/*.md`** (in repo, git-tracked): *durable project knowledge* — design rules, findings, research, decisions. Things that *inform* future work but don't get "done". Visible to all agents via filesystem.
- **Memory** (`~/.claude/projects/.../memory/`): *user-specific facts and preferences* — not project state. The user's color vision results, environment, workflow preferences. Auto-loaded per-conversation.

When you discover something cross-cutting, ask: does it close, does it inform, or is it about the user? Place accordingly. Don't pile findings into chainlink — they'll sit open forever and clutter the "what to work on" view.

## Project

`ansil16` is a 16-color ANSI palette tool. The user has hand-designed light + dark CIELUV palettes ("luv-rainbow") and previously applied them with a small shell script (`~/.local/bin/theme`) that converted xrdb files to OSC escape sequences. This project replaces and cleans up that workflow.

Two halves planned:
1. **Palette applier** (phase 1, current) — `ansil16` + `ansil16-emit` + `ansil16-kitty`. Reads `.conf` files. Two backends: OSC escape sequences written to ttys, or `kitty @ set-colors` over kitty's local socket. `ansil16 set` auto-picks (kitty if reachable, OSC otherwise); `--kitty` / `--osc` force.
2. **Browser designer** (phase 2, not built) — single-file HTML at `designer/index.html`, follows the `rg-colors` pattern (no build, no deps, opens via `open`). Edits palette files interactively. Replaces or wraps the R-based generators that live separately at `~/proj/code/color-space-palettes/`.

## Running

```sh
./install.sh                              # symlinks into ~/.local/bin, ~/.config/ansil16
ansil16 list
ansil16 set luv-rainbow-dark              # auto-pick backend
ansil16 set luv-rainbow-dark --kitty      # force kitty IPC
ansil16 set luv-rainbow-dark --osc        # force OSC to current tty
ansil16 set luv-rainbow-dark --osc --all  # OSC broadcast to every tty
ansil16 reset                             # reset bg/fg/cursor + 16 ANSI slots, this tty
ansil16 reset --all                       # broadcast reset; also drops state file
ansil16 current
ansil16-emit  palettes/foo.conf           # low-level OSC, composable
ansil16-kitty palettes/foo.conf           # low-level kitty IPC, composable
```

No build, no tests, no external deps beyond bash + coreutils + `readlink`. Portable bash (`#!/usr/bin/env bash`, `set -euo pipefail`).

## Architecture

```
bin/
  ansil16        # high-level UX: set/reset/list/current/path
  ansil16-emit   # low-level OSC emitter (stdout / --tty PATH / --all)
  ansil16-kitty  # low-level kitty IPC: `kitty @ set-colors --all --configured ...`
lib/
  common.sh      # shared bash: parse_palette, render_osc, render_kitty_args,
                 #              render_reset_osc, kitty_reachable, find_ttys,
                 #              find_palette
palettes/
  *.conf         # key=value, 18 values (bg, fg, c0..c15), comments OK
notes/
  osc-vs-kitty-ipc.md   # why kitty IPC was added; tmux/ssh failure modes
designer/        # phase 2, empty
install.sh       # symlink-based self-install
```

**Split rationale**: `ansil16-emit` and `ansil16-kitty` are composable Unix primitives (one input file → one effect via a single channel). `ansil16` is the human CLI on top, manages state and picks a backend. All three bins source `lib/common.sh` after resolving their own symlink chain (the bins live at `~/.local/bin/` post-install, but need to find the repo to locate `common.sh` and `palettes/`).

**Backend selection (`ansil16 set`)**: `--auto` (default) probes `kitty @ ls` for a reachable local kitty socket; success → `ansil16-kitty`, failure → `ansil16-emit`. `--kitty` / `--osc` force a backend (no probe). `--all` is OSC-only — kitty's `set-colors --all` already covers every OS window/tab on that host. See `notes/osc-vs-kitty-ipc.md` for the host-scoping rule (don't `ansil16 set` inside a tmux pane rendered by a *different* host's kitty) and the OSC-vs-IPC failure-mode analysis driving this split.

**Lookup precedence**: `ansil16 set foo` resolves to `~/.config/ansil16/foo.conf` if present, else `<repo>/palettes/foo.conf`. Since `~/.config/ansil16` is a symlink to `<repo>/palettes`, adding a palette to one location is the same as the other — there's no separate "user palettes" concept to manage. User customs that shouldn't be committed are `.gitignore`d within that dir.

**Symlink-following in bins**: Both bins resolve `$0` through readlink chains at the top of each script (5-line preamble) to find `SELF_DIR`, then source `$SELF_DIR/../lib/common.sh`. This is duplicated rather than DRYed because there's no way to source the lib *before* finding it.

## Key design decisions worth knowing

- **OSC over xrdb**: The previous tool consumed iTerm2-Color-Schemes-format xrdb files (`#define Ansi_N_Color #rrggbb`) and sed-converted them to OSC. The user owns the palette data; ansil16 stores it natively as `key = value` and skips the conversion entirely.
- **State file under `$XDG_STATE_HOME`** (`~/.local/state/ansil16/current`), not `~/.theme` as before. Standard XDG layout.
- **No shell integration in phase 1**: there's no "re-apply on new session" hook yet. New shells start with the terminal's compiled-in default colors until `ansil16 set` runs. Phase 3 adds an optional fish/bash snippet to source on shell start.
- **`--all` broadcast**: enumerates `/dev/ttys???` on Darwin or `/dev/pts/[0-9]*` on Linux and writes OSC to each. Permission failures are silent (terminal owned by another process / TTY closed). Persisted choice in the state file lets new shells opt into the same scheme via the (future) phase-3 hook.
- **No `cursor` color in built-in palettes** (`c0`–`c15`, `bg`, `fg` only). The parser accepts `cursor = #hex` if a palette includes it — defer to the terminal's default otherwise.

## Conventions

- Portable bash for scripts (`#!/usr/bin/env bash`). One-liners go in `justfile`-style if introduced, never inline `#!/bin/sh`.
- Palette `.conf` files: lines `key = value`, `#` comments, whitespace ignored. Hex colors uppercase `#RRGGBB`.
- `install.sh` is idempotent and never `sudo`s. Symlinks via `ln -snf`; refuses to clobber non-symlink targets.
- README documents user-facing surface; this file documents internals worth knowing.

## Related (external)

- `~/proj/code/color-space-palettes/` — R generators (`explore-luv.R`, `manual-palette.R`, `ray-tracing.R`). The user's palette-design workspace; produces hex values that get hand-copied (or eventually exported) into `palettes/*.conf`.
- `~/proj/code/vim-ambi16/` — vim colorscheme that uses logical `ctermfg=N` (terminal slots), palette-agnostic. Consumes whatever ANSI palette is active.
- `~/.pi/agent/themes/ambi16.json` — pi.dev terminal-agent theme, also palette-agnostic.
- `~/proj/code/rg-colors/` — reference for phase-2 designer shape (single-file HTML, runs via `open`).
