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
