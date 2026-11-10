#!/usr/bin/env bash
# Fails when code or config changed without CLAUDE.md, README.md or docs/
# changing too. See "Keeping the documentation true" in CLAUDE.md.
# Usage: check-docs.sh <base-sha> <head-sha> [extra text to search for the opt-out, e.g. a PR title]
set -euo pipefail

base=$1 head=$2 extra=${3:-}
if [ -z "$base" ] || [ "$base" = "0000000000000000000000000000000000000000" ] || ! git cat-file -e "$base^{commit}" 2>/dev/null; then
  base=$(git rev-parse "$head^")
fi

files=$(git diff --name-only "$base" "$head")
docs=$(printf '%s\n' "$files" | grep -E '^(CLAUDE\.md|README\.md|docs/)' || true)
# Lockfiles change with dependency bumps and say nothing a reader needs.
code=$(printf '%s\n' "$files" | grep -vE '^(CLAUDE\.md|AGENTS\.md|README\.md|docs/)|(^|/)package-lock\.json$|^$' || true)

if [ -z "$code" ]; then
  echo "No code or config changed."
  exit 0
fi
if [ -n "$docs" ]; then
  echo "Code changed and the docs were updated:"
  printf '  %s\n' $docs
  exit 0
fi
if { git log --format=%B "$base..$head"; printf '%s\n' "$extra"; } | grep -qE '\[no-docs: *[^]]+\]'; then
  echo "Code changed without docs, opted out with [no-docs: reason]."
  exit 0
fi

echo "::error::Code or config changed but CLAUDE.md, README.md and docs/ did not."
echo "Changed:"
printf '  %s\n' $code
echo
echo "Update the docs this change affects (see 'Keeping the documentation true' in CLAUDE.md),"
echo "or, only if nothing a future agent needs to know changed, add [no-docs: reason] to the commit message or PR title."
exit 1
