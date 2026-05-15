# ansil16

A 16-color ANSI terminal palette tool. Apply hand-designed palettes (light + dark) at runtime via OSC escape sequences, with no terminal-specific config.

## Install

```sh
git clone https://github.com/balachia/ansil16 ~/proj/code/ansil16
cd ~/proj/code/ansil16
./install.sh
```

Symlinks `ansil16` and `ansil16-emit` into `~/.local/bin/`, and exposes the palette dir at `~/.config/ansil16/`.

## Use

```sh
ansil16 list                       # show available palettes
ansil16 set luv-rainbow-dark       # apply to current terminal
ansil16 set luv-rainbow-light      # switch
ansil16 set luv-rainbow-dark --all # broadcast to every tty owned by this user
ansil16 current                    # show last-applied palette
```

For composability:

```sh
ansil16-emit ~/.config/ansil16/luv-rainbow-dark.conf       # OSC to stdout
ansil16-emit foo.conf --tty /dev/ttys003                   # specific tty
ansil16-emit foo.conf --all                                # every tty
```

## Palette format

Plain `key = value`. 16 ANSI slots + foreground + background. Unset slots are left alone by the terminal.

```ini
bg = #000000
fg = #FFFFFF

c0  = #3B3B3B
c1  = #D5898C
# ... c2..c14 ...
c15 = #B9B9B9

# optional:
# cursor = #FF8800
```

Drop a `.conf` into `~/.config/ansil16/` (which is symlinked to this repo's `palettes/`) and it shows up in `ansil16 list`.

## Built-in palettes

Three variants of a CIELUV-designed "luv-rainbow" set:

- `luv-rainbow-dark` — black background, full-saturation chromatics
- `luv-rainbow-light` — white background, darker chromatic row per the ambi16 theory (see `palettes/luv-rainbow-light.conf` for the inversion logic)
- `luv-rainbow-light-oled` — OLED-tuned variant

Designed in R; sources in `~/proj/code/color-space-palettes/` (separate repo, not bundled).

## Design theory: ambi16

The palettes follow an "ambidextrous 16-color" convention so the same logical highlights (vim, ranger, fish, pi.dev, etc.) work on either light or dark backgrounds without per-app reconfiguration:

- 4 grayscales (`c0`, `c8`, `c7`, `c15`) ordered low→high contrast with bg. On light bg this means `c0` is the *lightest* (near-white) and `c15` is darkest.
- 6 chromatics (`c1`–`c6`) at standard contrast.
- 6 chromatics (`c9`–`c14`) at higher contrast. On dark bg these are brighter; on light bg they are darker/desaturated.

See `palettes/*.conf` for the live values.

## Phase plan

- **Phase 1** (this): runtime palette applier (`ansil16`, `ansil16-emit`) + 3 built-in palettes.
- **Phase 2**: browser-based palette designer in `designer/` (single-file HTML, no build, à la rg-colors). Edit palettes interactively with live OSC preview; export `.conf`. Replaces or wraps the R workflow.
- **Phase 3**: optional shell integration — auto-reapply on new sessions via XDG state file.
