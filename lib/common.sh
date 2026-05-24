# ansil16 shared bash helpers. Source me; don't execute.

# Resolve a possibly-symlinked path to its real location.
ansil16_realpath() {
    local p=$1
    while [[ -L $p ]]; do
        local link
        link=$(readlink "$p")
        case $link in
            /*) p=$link ;;
            *)  p=$(cd "$(dirname "$p")" && pwd -P)/$link ;;
        esac
    done
    cd "$(dirname "$p")" && printf '%s/%s\n' "$(pwd -P)" "$(basename "$p")"
}

# Repo root, derived from the location of this lib file.
ansil16_repo_dir() {
    local self
    self=$(ansil16_realpath "${BASH_SOURCE[0]}")
    cd "$(dirname "$self")/.." && pwd -P
}

# Directory where user-visible palettes live (symlink to repo/palettes after install).
ansil16_config_dir() {
    printf '%s/ansil16\n' "${XDG_CONFIG_HOME:-$HOME/.config}"
}

# State dir for current-palette tracking.
ansil16_state_dir() {
    printf '%s/ansil16\n' "${XDG_STATE_HOME:-$HOME/.local/state}"
}

# Resolve a palette name to a .conf path. Echoes path on success.
ansil16_find_palette() {
    local name=$1
    local config repo
    config=$(ansil16_config_dir)
    repo=$(ansil16_repo_dir)
    for dir in "$config" "$repo/palettes"; do
        if [[ -f "$dir/$name.conf" ]]; then
            printf '%s\n' "$dir/$name.conf"
            return 0
        fi
    done
    return 1
}

# List palette names (basename without .conf) from both config dir and repo.
ansil16_list_palettes() {
    local config repo
    config=$(ansil16_config_dir)
    repo=$(ansil16_repo_dir)
    {
        [[ -d $config ]] && find "$config" -maxdepth 1 -name '*.conf' -print 2>/dev/null
        find "$repo/palettes" -maxdepth 1 -name '*.conf' -print 2>/dev/null
    } | while IFS= read -r f; do
        basename "$f" .conf
    done | sort -u
}

# Parse a palette file into globals: BG, FG, CURSOR, C0..C15. Unset values stay empty.
ansil16_parse_palette() {
    local file=$1 line key val i
    BG=; FG=; CURSOR=
    for i in 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
        printf -v "C$i" ''
    done
    while IFS= read -r line || [[ -n $line ]]; do
        # trim leading/trailing whitespace
        line="${line#"${line%%[![:space:]]*}"}"
        line="${line%"${line##*[![:space:]]}"}"
        # skip blank and full-line comments (must come AFTER trim, since hex values contain #)
        [[ -z $line || ${line:0:1} == '#' ]] && continue
        key=${line%%=*}
        val=${line#*=}
        key="${key%"${key##*[![:space:]]}"}"
        key="${key#"${key%%[![:space:]]*}"}"
        val="${val#"${val%%[![:space:]]*}"}"
        val="${val%"${val##*[![:space:]]}"}"
        case $key in
            bg) BG=$val ;;
            fg) FG=$val ;;
            cursor) CURSOR=$val ;;
            c[0-9]|c1[0-5])
                printf -v "C${key#c}" '%s' "$val"
                ;;
        esac
    done < "$file"
}

# Render OSC escape string from already-parsed BG/FG/CURSOR/C0..C15.
ansil16_render_osc() {
    local esc=$'\033' bel=$'\a' out='' i v
    [[ -n $BG ]]     && out+="${esc}]11;${BG}${bel}"
    [[ -n $FG ]]     && out+="${esc}]10;${FG}${bel}"
    [[ -n $CURSOR ]] && out+="${esc}]12;${CURSOR}${bel}"
    for i in 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
        local var="C$i"
        v=${!var-}
        [[ -n $v ]] && out+="${esc}]4;${i};${v}${bel}"
    done
    printf '%s' "$out"
}

# Enumerate this user's active terminal ttys.
ansil16_find_ttys() {
    case "$(uname -s)" in
        Darwin) find /dev -maxdepth 1 -name 'ttys???' 2>/dev/null ;;
        Linux)  find /dev/pts -maxdepth 1 -name '[0-9]*' 2>/dev/null ;;
        *)      return 0 ;;
    esac
}

# Render kitty `@ set-colors` argument list from parsed BG/FG/CURSOR/C0..C15.
# Prints space-separated key=value pairs on stdout (no values contain spaces).
ansil16_render_kitty_args() {
    local i v out='' var
    [[ -n $BG ]]     && out+=" background=$BG"
    [[ -n $FG ]]     && out+=" foreground=$FG"
    [[ -n $CURSOR ]] && out+=" cursor=$CURSOR"
    for i in 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
        var="C$i"
        v=${!var-}
        [[ -n $v ]] && out+=" color${i}=$v"
    done
    printf '%s\n' "${out# }"
}

# Return 0 if we can talk to a local kitty. With no arg, plain `kitty @`
# uses kitty's tty-based self-discovery (works from inside a kitty pty).
# With a socket arg (`unix:/path` or `tcp:host:port`), probes that socket
# explicitly — the path used for external callers (skhd/Alfred/launchd).
ansil16_kitty_reachable() {
    command -v kitty >/dev/null 2>&1 || return 1
    if [[ $# -ge 1 && -n $1 ]]; then
        kitty @ --to "$1" ls >/dev/null 2>&1
    else
        kitty @ ls >/dev/null 2>&1
    fi
}

# Discover a kitty remote-control socket address for external callers.
# Echoes `unix:/path` on success; returns 1 if nothing usable is found.
# Order:
#   1. $KITTY_LISTEN_ON  -- honored as-is. Set inside kitty children
#      automatically; a caller can pre-set it to target a specific instance,
#      or to handle abstract / tcp sockets that aren't filesystem-visible.
#   2. Newest user-owned kitty's listening unix socket, via lsof. Pulls the
#      actual bound path out of /proc-ish state, so it works regardless of
#      the user's `listen_on` naming convention.
# Limitations of step 2: only finds filesystem-path unix sockets (i.e.,
# `listen_on unix:/path/...` — the common case). For abstract sockets
# (`unix:@name`, Linux) or tcp listeners, the caller must pre-set
# KITTY_LISTEN_ON.
ansil16_discover_kitty_socket() {
    if [[ -n ${KITTY_LISTEN_ON:-} ]]; then
        printf '%s\n' "$KITTY_LISTEN_ON"
        return 0
    fi
    command -v pgrep >/dev/null 2>&1 || return 1
    local lsof_bin
    if command -v lsof >/dev/null 2>&1; then
        lsof_bin=lsof
    elif [[ -x /usr/sbin/lsof ]]; then
        # macOS: lsof ships in /usr/sbin, which Alfred / some launchers
        # strip from PATH. Fall back to the absolute path.
        lsof_bin=/usr/sbin/lsof
    else
        return 1
    fi
    local pid sock
    pid=$(pgrep -n -U "$UID" kitty 2>/dev/null) || return 1
    [[ -n $pid ]] || return 1
    # `lsof -p PID -aU -F n` emits one record per unix socket fd. Listening
    # sockets bound to a path appear as `n/abs/path`; peer connections appear
    # as `n->0x...` and are skipped by the `^n/` match.
    sock=$("$lsof_bin" -p "$pid" -aU -F n 2>/dev/null \
        | awk '/^n\//{print substr($0,2); exit}')
    [[ -n $sock && -S $sock ]] || return 1
    printf 'unix:%s\n' "$sock"
}

# Reset OSC sequence:
#   ]111 ]110 ]112 = reset default bg / fg / cursor (the per-pane state tmux
#                    captures; see notes/osc-vs-kitty-ipc.md lines 56–67)
#   ]104          = reset all 16 ANSI palette slots to terminal defaults
# Together this returns the terminal to its compiled-in defaults across both
# namespaces. Cells already drawn with old colors won't visually update until
# they redraw (e.g., next prompt cycle, `clear`, or new output).
ansil16_render_reset_osc() {
    printf '\033]111\a\033]110\a\033]112\a\033]104\a'
}
