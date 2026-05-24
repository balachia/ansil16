# External invocation: the `--kitty-socket` protocol

How an arbitrary process (skhd hotkey, Alfred workflow, launchd job, cron
entry, ad-hoc shell script) can drive ansil16 from outside any kitty pty.

## The one-liner

```sh
ansil16 set luv-rainbow-dark --kitty-socket
```

That's the public surface. Same line works from any launcher; no shell setup
required in the common case.

## Prerequisites (one-time, in kitty.conf)

```
allow_remote_control yes
listen_on            unix:${TMPDIR}/mykitty-{kitty_pid}
```

The exact socket path/name doesn't matter to ansil16 — see "Discovery"
below. It only matters that kitty is *listening on something*.

## How `--kitty-socket` discovers a kitty

1. **Honor `$KITTY_LISTEN_ON`** if it's set in the calling environment.
   - Inside any kitty child process this is set automatically.
   - External callers can pre-set it to pick a specific kitty instance, or
     to target abstract / tcp sockets (which step 2 can't see).
2. **Process introspection** otherwise: `pgrep -n -U $UID kitty` finds the
   newest user-owned kitty PID, then `lsof -p PID -aU -F n` lists that
   process's listening unix sockets. ansil16 uses the first FS-path socket
   it finds.

This is essentially "red-team your own machine to locate the socket" —
there's no advertised discovery API. The trade-off is that the protocol
works with whatever `listen_on` value the user chose (no naming convention
baked into ansil16). Limitation: abstract sockets (`unix:@name` on Linux)
and tcp listeners aren't filesystem-visible, so step 2 misses them; use
the `KITTY_LISTEN_ON` env override for those.

`/usr/sbin/lsof` is the macOS lsof location, which Alfred and some launchers
strip from `PATH`. ansil16 falls back to the absolute path if `command -v
lsof` fails — no PATH wrangling required at the caller.

## Recipes

### skhd

```
# ~/.config/skhd/skhdrc
cmd + shift - d : /Users/me/.local/bin/ansil16 set luv-rainbow-dark --kitty-socket
cmd + shift - l : /Users/me/.local/bin/ansil16 set luv-rainbow-light --kitty-socket
```

Absolute path is required — skhd doesn't search a user PATH.

### Alfred (External Trigger or Hotkey → Run Script)

Script (Bash, with input as argv):

```sh
/Users/me/.local/bin/ansil16 set "$1" --kitty-socket
```

### launchd (day/night switching)

`~/Library/LaunchAgents/local.ansil16.day.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>            <string>local.ansil16.day</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/me/.local/bin/ansil16</string>
    <string>set</string>
    <string>luv-rainbow-light</string>
    <string>--kitty-socket</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>7</integer>
    <key>Minute</key><integer>0</integer>
  </dict>
</dict>
</plist>
```

`launchctl bootstrap gui/$UID ~/Library/LaunchAgents/local.ansil16.day.plist`.

### cron

```
0 7  * * * /Users/me/.local/bin/ansil16 set luv-rainbow-light --kitty-socket
0 19 * * * /Users/me/.local/bin/ansil16 set luv-rainbow-dark  --kitty-socket
```

cron's `PATH` is famously minimal; ansil16's absolute-path lsof fallback
handles that.

## What goes wrong

| Symptom                                                          | Cause                                                                          | Fix                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `ansil16-kitty: no kitty socket found.`                          | No kitty running, or `listen_on` not configured                                | Start kitty / add `listen_on` line to kitty.conf and restart   |
| `ansil16-kitty: kitty IPC unreachable at unix:/...`              | `$KITTY_LISTEN_ON` is stale (points at a dead kitty)                           | Unset it; let discovery pick a live one                        |
| `set-colors` succeeds but kitty doesn't change                   | `allow_remote_control` missing from kitty.conf                                 | Add it and restart kitty                                       |
| Discovery picks the wrong kitty instance                         | Multiple kittys; `pgrep -n` picked the newest one, which isn't the one you see | Pre-set `KITTY_LISTEN_ON` in the launcher's env                |
| Works from terminal, fails from launchd / Alfred / skhd          | TMPDIR / PATH differ — but ansil16 should handle this. If not, file an issue.  | As a workaround, hardcode `KITTY_LISTEN_ON` in the launcher    |

## See also

- `notes/osc-vs-kitty-ipc.md` — why the kitty IPC backend exists at all,
  and the host-scoping rule (don't drive a kitty on host A from a pty
  rendered by a kitty on host B).
- `lib/common.sh:ansil16_discover_kitty_socket` — discovery implementation.
- `bin/ansil16-kitty` — the `--kitty-socket` flag handling.
