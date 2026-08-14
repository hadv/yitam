#!/usr/bin/env bash
#
# Guards the chat-history persistence boundary (see issue #171).
#
# Everything outside client/src/db/ must go through the barrel — `../db` — which
# exports the ChatHistoryStore interface, its domain types, and the singleton.
# Reaching past it to `../db/ChatHistoryDB` or any other module inside that
# directory puts Dexie back into the UI, which is the coupling the boundary exists
# to prevent.
#
# Run from anywhere: scripts/check-db-boundary.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$REPO_ROOT/client/src"

if [ ! -d "$SRC_DIR" ]; then
  echo "check-db-boundary: $SRC_DIR not found" >&2
  exit 1
fi

# Matches a relative import that reaches *into* the db directory, e.g.
#   from '../db/ChatHistoryDB'      import('../../db/ChatHistoryDBUtil')
# but not the barrel itself:
#   from '../db'                    from '../../db'
PATTERN="['\"](\.\.?/)+db/[A-Za-z]"

violations="$(
  grep -rEn --include='*.ts' --include='*.tsx' "$PATTERN" "$SRC_DIR" \
    | grep -v "^$SRC_DIR/db/" \
    || true
)"

if [ -n "$violations" ]; then
  echo "✗ Chat-history storage boundary violated." >&2
  echo >&2
  echo "  These files import a module inside client/src/db/ directly. Import the" >&2
  echo "  barrel instead — \`from '../db'\` for types and the store singleton — or" >&2
  echo "  use \`useChatHistoryStore()\` from ChatHistoryContext in React code." >&2
  echo >&2
  echo "$violations" | sed "s|^$REPO_ROOT/|    |" >&2
  echo >&2
  exit 1
fi

echo "✓ Chat-history storage boundary intact: nothing outside client/src/db/ reaches past the barrel."
