#!/usr/bin/env bash
# Self-install: symlink bins into ~/.local/bin and palettes dir into ~/.config/ansil16.
# Idempotent. No sudo. Bails clearly if any target exists as a non-symlink.

set -euo pipefail

REPO=$(cd "$(dirname "$0")" && pwd -P)
BIN=${XDG_BIN_HOME:-$HOME/.local/bin}
CONFIG=${XDG_CONFIG_HOME:-$HOME/.config}/ansil16
STATE=${XDG_STATE_HOME:-$HOME/.local/state}/ansil16

mkdir -p "$BIN" "$STATE"

safe_symlink() {
    local src=$1 dst=$2
    if [[ -e $dst && ! -L $dst ]]; then
        echo "install: $dst exists and is not a symlink — refusing to clobber" >&2
        echo "  move it aside and re-run" >&2
        exit 1
    fi
    ln -snf "$src" "$dst"
    echo "  $dst -> $src"
}

echo "installing ansil16 from $REPO:"
safe_symlink "$REPO/bin/ansil16"       "$BIN/ansil16"
safe_symlink "$REPO/bin/ansil16-emit"  "$BIN/ansil16-emit"
safe_symlink "$REPO/bin/ansil16-kitty" "$BIN/ansil16-kitty"
safe_symlink "$REPO/palettes"          "$CONFIG"
echo "  $STATE/  (state dir, ready)"

case ":$PATH:" in
    *":$BIN:"*) ;;
    *)
        echo
        echo "note: $BIN is not in your PATH" >&2
        echo "  add 'set -gx PATH \$HOME/.local/bin \$PATH' (fish) or" >&2
        echo "  'export PATH=\$HOME/.local/bin:\$PATH' (bash/zsh) to your shell rc" >&2
        ;;
esac
