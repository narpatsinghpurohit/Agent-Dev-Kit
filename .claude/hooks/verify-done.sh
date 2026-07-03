#!/usr/bin/env bash
# Stop hook: before Claude finishes a turn with uncommitted changes, make sure
# the monorepo still type-checks. Exits 2 with the errors (feedback to Claude)
# on failure; exits 0 otherwise.
set -uo pipefail

payload="$(cat)"

# Infinite-loop guards: never re-trigger a verification that is already the
# result of this hook firing.
if [ "${CLAUDE_STOP_HOOK_ACTIVE:-}" = "true" ]; then
  exit 0
fi
already_active="$(printf '%s' "$payload" | python3 -c '
import json, sys
try:
    print("true" if json.load(sys.stdin).get("stop_hook_active") else "false")
except Exception:
    print("false")
' 2>/dev/null)"
if [ "$already_active" = "true" ]; then
  exit 0
fi

[ -n "${CLAUDE_PROJECT_DIR:-}" ] || exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0

# Nothing changed → nothing to verify.
if [ -z "$(git status --porcelain 2>/dev/null)" ]; then
  exit 0
fi

check_output="$(pnpm turbo run check-types --output-logs=errors-only 2>&1)"
check_status=$?

if [ $check_status -ne 0 ]; then
  echo "Type check failed — the working tree has errors. Fix them before finishing:" >&2
  echo "$check_output" >&2
  exit 2
fi

exit 0
