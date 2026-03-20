#!/bin/bash
# Automatically set Telegram bot profile photos from Genshin Impact character images.
# Uses Telegram Bot API 9.4+ setMyProfilePhoto — fully automatic, no BotFather needed.
#
# Image pipeline:
#   1. enka.network head icon (primary — clean head portrait)
#   2. custom_url fallback (e.g. yatta.moe for characters not yet on enka)
#
# Usage:
#   ./scripts/set-bot-photos.sh              # Set photos for all configured bots
#   ./scripts/set-bot-photos.sh nahida       # Set photo for one bot only
#
# Adding a new bot: add an entry to BOT_CONFIG below.
#   Format: "NAME|display_name|enka_key|custom_url|rarity"
#   enka_key:   enka.network icon key (e.g. "Nahida", "Zhongli", "Shougun")
#   custom_url: direct image URL override (use "-" if none)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TMPDIR_PHOTOS=$(mktemp -d)
trap 'rm -rf "$TMPDIR_PHOTOS"' EXIT

# --- Load all tokens from bot-tokens.json in one python3 call ---
TOKENS_FILE="$SCRIPT_DIR/bot-tokens.json"
declare -A BOT_TOKENS
if [ -f "$TOKENS_FILE" ]; then
  while IFS='=' read -r k v; do
    BOT_TOKENS["$k"]="$v"
  done < <(python3 -c "
import json
d = json.load(open('$TOKENS_FILE'))
for k, v in d.items():
    print(f'{k}={v}')
" 2>/dev/null)
fi

# --- Bot configuration ---
# name|display_name|enka_key|custom_url|rarity
# Add new bots here as they are created. enka_key: UI_AvatarIcon_{key}.png on enka.network
BOT_CONFIG=(
  "Skirk|skirk|SkirkNew|https://gi.yatta.moe/assets/UI/UI_AvatarIcon_SkirkNew.png|5"
  "Nahida|nahida|Nahida|-|5"
  "Zhongli|zhongli|Zhongli|-|5"
  "Raiden|raiden|Shougun|-|5"
  "Alhaitham|alhaitham|Alhatham|-|5"
  "Tighnari|tighnari|Tighnari|-|5"
  "Navia|navia|Navia|-|5"
  "Diluc|diluc|Diluc|-|5"
  "Arlecchino|arlecchino|Arlecchino|-|5"
  "Keqing|keqing|Keqing|-|5"
  "Neuvillette|neuvillette|Neuvillette|-|5"
  "Lisa|lisa|Lisa|-|4"
)

FILTER="${1:-}"

# --- Image conversion helper (Node.js + sharp) ---
CONVERTED_FILE=""
convert_image() {
  local input="$1" top="${2:-0}"
  CONVERTED_FILE="$TMPDIR_PHOTOS/converted_$(basename "$input" | sed 's/\./_/g').jpg"
  node "$SCRIPT_DIR/convert-bot-photo.mjs" "$input" "$CONVERTED_FILE" "$top"
}

# --- Download and set photo for one bot ---
process_bot() {
  local token="$1" name="$2" enka_key="$3" custom_url="$4" rarity="${5:-5}"
  local raw="" http_code info

  # 1. enka.network head icon (primary — clean head portrait)
  if [ "$enka_key" != "-" ]; then
    raw="$TMPDIR_PHOTOS/${name}_icon.png"
    http_code=$(curl -sL -w "%{http_code}" -o "$raw" \
      "https://enka.network/ui/UI_AvatarIcon_${enka_key}.png" 2>/dev/null)
    if [ "$http_code" = "200" ] && [ -s "$raw" ]; then
      CONVERTED_FILE="$TMPDIR_PHOTOS/${name}_converted.jpg"
      local info
      info=$(node "$SCRIPT_DIR/convert-bot-photo.mjs" "$raw" "$CONVERTED_FILE" "$rarity" 2>/dev/null)
      if [ -s "$CONVERTED_FILE" ]; then
        echo "  ✓ Image: enka.network/$enka_key → $info"
        _set_photo "$token" "$name" "$CONVERTED_FILE" && return 0
      fi
    fi
  fi

  # 2. Custom URL fallback (e.g. yatta.moe for new characters not yet on enka)
  if [ "$custom_url" != "-" ]; then
    raw="$TMPDIR_PHOTOS/${name}_custom.img"
    http_code=$(curl -sL -w "%{http_code}" -o "$raw" "$custom_url" 2>/dev/null)
    if [ "$http_code" = "200" ] && [ -s "$raw" ]; then
      CONVERTED_FILE="$TMPDIR_PHOTOS/${name}_custom_converted.jpg"
      info=$(node "$SCRIPT_DIR/convert-bot-photo.mjs" "$raw" "$CONVERTED_FILE" "$rarity" 2>/dev/null)
      if [ -s "$CONVERTED_FILE" ]; then
        echo "  ✓ Image: custom URL → $info"
        _set_photo "$token" "$name" "$CONVERTED_FILE" && return 0
      fi
    fi
  fi

  echo "  ⚠ No image found for $name — skipping avatar"
  return 0
}

_set_photo() {
  local token="$1" name="$2" img="$3"
  local response ok_val err

  response=$(curl -s -X POST \
    "https://api.telegram.org/bot${token}/setMyProfilePhoto" \
    -F 'photo={"type":"static","photo":"attach://photo_file"}' \
    -F "photo_file=@${img}" 2>/dev/null)

  ok_val=$(echo "$response" | python3 -c \
    "import json,sys; d=json.load(sys.stdin); print(d.get('ok'))" 2>/dev/null)

  if [ "$ok_val" = "True" ]; then
    echo "  ✓ setMyProfilePhoto: OK"
    return 0
  else
    err=$(echo "$response" | python3 -c \
      "import json,sys; d=json.load(sys.stdin); print(d.get('description','?'))" 2>/dev/null \
      || echo "$response")
    echo "  ✗ setMyProfilePhoto failed: $err"
    return 1
  fi
}

# --- Direct single-bot mode: --direct TOKEN NAME ENKA_KEY [RARITY] ---
# Must appear after function definitions.
if [ "${FILTER:-}" = "--direct" ]; then
  token="${2:-}" name="${3:-}" enka_key="${4:-}" rarity="${5:-5}"
  if [ -z "$token" ] || [ -z "$name" ] || [ -z "$enka_key" ]; then
    echo "Usage: $0 --direct TOKEN NAME ENKA_KEY [RARITY]" >&2
    exit 1
  fi
  echo "[$name] (direct mode)"
  process_bot "$token" "$name" "$enka_key" "-" "$rarity"
  exit $?
fi

# --- Main ---

echo "[$(date '+%H:%M:%S')] Setting bot profile photos..."
echo ""

SUCCESS=0 SKIP=0 FAIL=0

for entry in "${BOT_CONFIG[@]}"; do
  IFS='|' read -r bot_key name enka_key custom_url rarity <<< "$entry"
  rarity="${rarity:-5}"
  token="${BOT_TOKENS[$bot_key]:-}"

  if [ -n "$FILTER" ] && [ "$name" != "$FILTER" ]; then continue; fi

  if [ -z "${token:-}" ]; then
    echo "  ⚠ Skipping $name — no token configured"
    SKIP=$((SKIP + 1))
    echo ""
    continue
  fi

  echo "[$name]"
  if process_bot "$token" "$name" "$enka_key" "$custom_url" "$rarity"; then
    SUCCESS=$((SUCCESS + 1))
  else
    FAIL=$((FAIL + 1))
  fi
  echo ""
done

echo "[$(date '+%H:%M:%S')] Done. ✓ $SUCCESS set | ⚠ $SKIP skipped | ✗ $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "Failed bots had tokens but setMyProfilePhoto returned an error."
fi
