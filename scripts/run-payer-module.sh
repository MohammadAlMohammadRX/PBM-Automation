#!/bin/bash
# Full payer-module run: one folder per Playwright invocation, WORKERS=1.
#
# Not one whole-suite invocation. A single 4-hour invocation degraded the
# application mid-run once and lost ten folders' results, and the saved admin
# token lives about an hour - so each folder runs WITH the setup project, which
# re-logs in (about 15 s) and keeps the session fresh for that folder.
#
#   bash scripts/run-payer-module.sh          # from the beginning
#   bash scripts/run-payer-module.sh 38       # resume from folder 38
#
# Partials are written per folder, so a run killed part-way keeps what it had
# and the resume picks up where it stopped.
set -u
cd "$(dirname "$0")/.." || exit 1
export WORKERS=1

START=${1:-01}
OUT=reports/partials
mkdir -p "$OUT"

echo "=== payer module, from folder $START, $(date -u +%H:%M:%S) UTC"
for dir in tests/payer/*/; do
  name=$(basename "$dir")
  nn=${name%%-*}
  [ "$nn" \< "$START" ] && continue

  echo "=== $name  start $(date -u +%H:%M:%S)"
  npx playwright test "tests/payer/$name" --project=chromium > "$OUT/run-$nn.log" 2>&1
  echo "    exit $?"
  # The config pins the JSON reporter's path, so copy it before the next folder
  # overwrites it. Never pass --reporter: that detaches the JSON reporter and
  # the BLOCKED annotations are lost with it.
  cp reports/results.json "$OUT/$nn.json" 2>/dev/null
  grep -E "^\s+[0-9]+ (passed|failed|skipped|flaky|did not run)" "$OUT/run-$nn.log"
done

echo "=== merging $(date -u +%H:%M:%S)"
node scripts/mergeResults.js "$OUT" reports/PBM-Payer-Module-Full-Run.json \
  && node scripts/buildReport.js reports/PBM-Payer-Module-Full-Run.json \
       reports/PBM-Payer-Module-Full-Run.html
echo "=== done $(date -u +%H:%M:%S) UTC"
