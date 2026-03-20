#!/bin/bash
# Refresh the Claude OAuth token in .env from ~/.claude/.credentials.json.
# Run on a schedule so the credential proxy always has a live token.

CREDS="$HOME/.claude/.credentials.json"
ENV_FILE="$(dirname "$0")/../.env"

# Trigger Claude CLI to refresh OAuth token if near expiry.
# Run with --dangerously-skip-permissions to avoid interactive prompts.
claude --version > /dev/null 2>&1 || true

if [ ! -f "$CREDS" ]; then
  echo "refresh-token: credentials file not found at $CREDS" >&2
  exit 1
fi

TOKEN=$(python3 -c "
import json, sys
try:
    d = json.load(open('$CREDS'))
    print(d['claudeAiOauth']['accessToken'])
except Exception as e:
    print(e, file=sys.stderr)
    sys.exit(1)
")

if [ -z "$TOKEN" ]; then
  echo "refresh-token: could not read token from credentials file" >&2
  exit 1
fi

# Update .env — replace existing CLAUDE_CODE_OAUTH_TOKEN line
if grep -q "^CLAUDE_CODE_OAUTH_TOKEN=" "$ENV_FILE"; then
  sed -i "s|^CLAUDE_CODE_OAUTH_TOKEN=.*|CLAUDE_CODE_OAUTH_TOKEN=\"$TOKEN\"|" "$ENV_FILE"
else
  echo "CLAUDE_CODE_OAUTH_TOKEN=\"$TOKEN\"" >> "$ENV_FILE"
fi

echo "refresh-token: token updated"
