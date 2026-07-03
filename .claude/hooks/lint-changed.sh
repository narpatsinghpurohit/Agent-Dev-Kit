#!/usr/bin/env bash
# PostToolUse hook: format + lint the file Claude just edited/wrote.
# Reads the hook payload JSON on stdin; exits 2 (feedback to Claude) only on
# unfixable eslint errors. Everything else exits 0 silently.
set -uo pipefail

payload="$(cat)"

# Extract .tool_input.file_path — jq if present, python3 fallback (jq not required).
if command -v jq >/dev/null 2>&1; then
  file_path="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty' 2>/dev/null)"
else
  file_path="$(printf '%s' "$payload" | python3 -c '
import json, sys
try:
    print(json.load(sys.stdin).get("tool_input", {}).get("file_path") or "")
except Exception:
    pass
' 2>/dev/null)"
fi

[ -n "${file_path:-}" ] || exit 0
[ -n "${CLAUDE_PROJECT_DIR:-}" ] || exit 0
[ -f "$file_path" ] || exit 0

# Only act on files inside the repo.
case "$file_path" in
  "$CLAUDE_PROJECT_DIR"/*) : ;;
  *) exit 0 ;;
esac
rel_path="${file_path#"$CLAUDE_PROJECT_DIR"/}"

# Only lintable source extensions.
case "$file_path" in
  *.ts | *.tsx | *.js | *.mjs) : ;;
  *) exit 0 ;;
esac

# Never touch generated or vendored files.
case "$rel_path" in
  *.gen.ts | \
  apps/web/src/routeTree.gen.ts | \
  packages/api-client/src/generated/* | \
  */node_modules/* | node_modules/* | \
  */dist/* | dist/*)
    exit 0
    ;;
esac

cd "$CLAUDE_PROJECT_DIR" || exit 0

pnpm exec prettier --write "$file_path" >/dev/null 2>&1

eslint_output="$(pnpm exec eslint --fix --no-warn-ignored "$file_path" 2>&1)"
eslint_status=$?

# Route files changed → regenerate the route tree (never hand-edit routeTree.gen.ts).
case "$rel_path" in
  apps/web/src/routes/*)
    (cd apps/web && pnpm exec tsr generate) >/dev/null 2>&1
    ;;
esac

if [ $eslint_status -ne 0 ]; then
  echo "eslint errors remain in $rel_path after --fix:" >&2
  echo "$eslint_output" >&2
  exit 2
fi

exit 0
