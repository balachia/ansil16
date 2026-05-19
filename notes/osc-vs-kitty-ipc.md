# OSC-via-tty vs kitty IPC: when each works

## TL;DR

OSC-via-tty (what `ansil16` / `ansil16-emit` do today) is the right tool for a
single host viewed by a single terminal. It breaks down in two related ways
once tmux or ssh enter the picture:

1. OSC inside a tmux pane **leaks outward** through tmux+ssh to whatever outer
   terminal is rendering you, clobbering its palette.
2. tmux itself **caches OSC 10/11/12** (default fg/bg/cursor) as per-pane
   state and re-emits the captured bg as **truecolor RGB** when filling empty
   cells in that pane. Once captured, that pane is palette-immune (its empty
   cells are absolute RGB, not slot references) and stays that way across
   tmux client attach/detach.

The structurally clean alternative is **`kitty @ set-colors`**, which goes
through kitty's UNIX socket (`allow_remote_control yes`), bypasses the pty
entirely, and is host-local by construction. Tmux never sees it, ssh doesn't
carry it.

## The pty mental model

A pty pair is master ↔ slave. Master = kitty (the renderer). Slave = what
the shell/tmux is attached to.

- **slave → master**: bytes written by a process attached to the slave appear
  on the master side as terminal *output*. This is how the shell paints the
  screen.
- **master → slave**: bytes written by kitty appear on the slave as terminal
  *input*. This is how keystrokes reach the shell.

`ansil16-emit --tty /dev/ttysNNN` opens the slave for writing and injects
OSC sequences into the slave→master direction. The master (kitty) reads
those bytes as output, processes the OSC, changes its palette.

Crucially: when ansil16 writes to the slave, **tmux running inside that
slave does not see those bytes**. Tmux reads master→slave (keystrokes), not
slave→master (its own output going up). So `ansil16 --all` is structurally
a *tmux bypass* on the host where kitty lives — that's why it's reliable
across all the local kitty windows even when tmux is in the loop.

## Why duma is a different story

When you ssh from Mac to duma, the rendering terminal is Mac kitty. The
duma pty is a `/dev/pts/X` on duma — you have no writer for it from the
Mac side. So `ansil16 --all` on Mac cannot reach "the pane inside duma
tmux" directly. It can only reach Mac kitty's slave ptys, which is enough
to change Mac kitty's palette — but tmux on duma may have cached per-pane
defaults that re-emit as truecolor and survive the palette change.

The asymmetry observed:

- `ansil16 --all` on Mac → tmux status on duma updates (uses palette slots),
  pane contents that emit palette refs update, **pane contents drawn from
  tmux's per-pane bg cache (truecolor RGB) do not**.
- `ansil16 set X` *inside* a duma tmux pane (via ssh) → OSC propagates up
  to Mac kitty (clobbering its palette), **and** duma tmux captures the
  OSC 10/11/12 into pane-local state. Now that pane fills empty cells with
  truecolor RGB matching the captured defaults. Subsequent palette changes
  via `ansil16 --all` on Mac can't touch those cells; they're absolute RGB.

To unstick a pane that's captured this way, emit a reset OSC inside it:

```sh
printf '\e]111\a\e]110\a\e]112\a'   # reset bg, fg, cursor to terminal default
```

That tells tmux "drop your captured pane defaults, revert to terminal
default" — tmux goes back to emitting "default" for empty cells, which kitty
resolves against its current palette.

## The rule

> **Palette commands are scoped to the host whose kitty is rendering you.**

- Physically at duma → duma's kitty renders → use duma's palette tool.
- At Mac (whether sshing or not) → Mac kitty renders → use Mac's palette tool.

Don't cross the streams. Don't `ansil16 set` inside a tmux pane that's
ultimately rendered by a *different host's* terminal.

## Implementation: `--kitty` backend

`kitty @ set-colors` talks to the local kitty over its UNIX socket. The
channel is structurally host-local (no socket forwarding by default) and
tmux-bypass (not in the pty stream).

Proposed: an `ansil16 set X --kitty` backend that translates a palette
.conf into the equivalent `kitty @ set-colors` invocation. Sketch:

```sh
kitty @ set-colors \
    background=#... foreground=#... cursor=#... \
    color0=#... color1=#... ... color15=#...
```

Mode selection:

- `--osc` (current default behavior): writes OSC to the current tty (or
  `--tty` / `--all` targets).
- `--kitty`: uses `kitty @ set-colors` against local kitty socket.
- `--auto` (suggested default for Phase 3): try `kitty @ --version` first,
  prefer `--kitty` if available, fall back to `--osc`.

Host-specific fish-rc usage:

```fish
# duma config.fish.Linux
if status --is-interactive
    if command -q kitty; and test -e ~/.config/ansil16/current
        ansil16 set (cat ~/.config/ansil16/current) --kitty
    end
end
```

If duma is accessed over ssh from Mac (no local kitty socket), `kitty @`
errors out and fish-rc no-ops. Mac kitty's palette stays untouched. Clean
failure mode.

## Caveats

- `kitty @ set-colors --all` matches all kitty OS windows / tabs on that
  host. To broadcast across multiple kitty instances on the same host, you
  need either a shared `listen_on` socket or per-instance socket discovery.
  OSC `--all` (per-tty) has the same scope but a different mechanism (one
  write per tty).
- `kitty @` requires `allow_remote_control yes`. Already enabled in the
  user's Mac kitty.conf; duma needs the same setting.
- `kitty +kitten ssh` integration can forward the kitty socket through ssh
  — that *would* let Mac-side `kitty @` reach duma's kitty. Not relevant
  for the host-scoped rule above; mentioned for completeness.
- Tmux's OSC 10/11/12 capture behavior is version-dependent. Modern tmux
  (3.x+) maintains per-pane default colors. Disabling this behavior
  globally is not really a supported configuration.

## Status

- 2026-05-19: observation + analysis captured during a conversation about
  setting up ansil16 on duma. `--kitty` backend not yet implemented.
- Phase 3 in the README ("optional shell integration") should fold this in
  rather than just blindly OSC at shell startup.
