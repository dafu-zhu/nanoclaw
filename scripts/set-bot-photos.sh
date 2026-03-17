#!/bin/bash
# Automatically set Telegram bot profile photos from Genshin Impact character images.
# Uses Telegram Bot API 9.4+ setMyProfilePhoto — fully automatic, no BotFather needed.
#
# Image pipeline:
#   1. Download 1000x2000 portrait card from genshin.jmp.blue (best quality)
#   2. Crop top 1000x1000 (face/upper body area), convert to JPEG via Node.js/sharp
#   3. Fall back to 256x256 PNG icon from enka.network if jmp.blue fails
#   4. custom_url override as last resort
#
# Usage:
#   ./scripts/set-bot-photos.sh              # Set photos for all configured bots
#   ./scripts/set-bot-photos.sh nahida       # Set photo for one bot only
#
# Adding a new bot: add an entry to BOT_CONFIG below.
#   Format: "TOKEN|display_name|jmp_slug|enka_key|custom_url"
#   jmp_slug:   genshin.jmp.blue character slug (e.g. "nahida", "raiden", "al-haitham")
#   enka_key:   enka.network icon key (e.g. "Nahida", "Zhongli", "Shougun")
#   custom_url: direct image URL override (use "-" if none)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TMPDIR_PHOTOS=$(mktemp -d)
trap 'rm -rf "$TMPDIR_PHOTOS"' EXIT

# --- Load tokens from .env ---
SKIRK_TOKEN="" NAHIDA_TOKEN="" ZHONGLI_TOKEN="" RAIDEN_TOKEN="" ALHAITHAM_TOKEN=""
ENV_FILE="$PROJECT_DIR/.env"
if [ -f "$ENV_FILE" ]; then
  POOL_TOKENS=$(grep '^TELEGRAM_BOT_POOL=' "$ENV_FILE" | cut -d= -f2- | tr -d '"')
  IFS=',' read -r SKIRK_TOKEN NAHIDA_TOKEN ZHONGLI_TOKEN RAIDEN_TOKEN ALHAITHAM_TOKEN _ \
    <<< "$POOL_TOKENS"
fi

# --- Bot configuration ---
# token|display_name|jmp_slug|enka_key|custom_url|rarity
BOT_CONFIG=(
  "${SKIRK_TOKEN}|skirk|skirk|SkirkNew|https://gi.yatta.moe/assets/UI/UI_AvatarIcon_SkirkNew.png|5"
  "${NAHIDA_TOKEN}|nahida|nahida|Nahida|-|5"
  "${ZHONGLI_TOKEN}|zhongli|zhongli|Zhongli|-|5"
  "${RAIDEN_TOKEN}|raiden|raiden|Shougun|-|5"
  "${ALHAITHAM_TOKEN}|alhaitham|alhaitham|Alhatham|-|5"
  # Future academic agents — add their tokens here when created:
  # "TOKEN|tighnari|tighnari|Tighnari|-"
  # "TOKEN|collei|collei|Collei|-"
  # "TOKEN|navia|navia|Navia|-"
  # "TOKEN|chevreuse|chevreuse|Chevreuse|-"
  # "TOKEN|diluc|diluc|Diluc|-"
  # "TOKEN|kaeya|kaeya|Kaeya|-"
  # "TOKEN|xiao|xiao|Xiao|-"
  # "TOKEN|arlecchino|arlecchino|Arlecchino|-"
  # "TOKEN|tartaglia|tartaglia|Tartaglia|-"
  # "TOKEN|sandrone|sandrone|Sandrone|-"
  # "TOKEN|keqing|keqing|Keqing|-"
  # "TOKEN|ganyu|ganyu|Ganyu|-"
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
  local token="$1" name="$2" jmp_slug="$3" enka_key="$4" custom_url="$5" rarity="${6:-5}"
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

# --- Main ---

echo "[$(date '+%H:%M:%S')] Setting bot profile photos..."
echo ""

SUCCESS=0 SKIP=0 FAIL=0

for entry in "${BOT_CONFIG[@]}"; do
  IFS='|' read -r token name jmp_slug enka_key custom_url rarity <<< "$entry"
  rarity="${rarity:-5}"

  if [ -n "$FILTER" ] && [ "$name" != "$FILTER" ]; then continue; fi

  if [ -z "${token:-}" ]; then
    echo "  ⚠ Skipping $name — no token configured"
    SKIP=$((SKIP + 1))
    echo ""
    continue
  fi

  echo "[$name]"
  if process_bot "$token" "$name" "$jmp_slug" "$enka_key" "$custom_url" "$rarity"; then
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
