# Payer module smoke test

A short, representative run to answer one question before committing hours to a
full pass: **is the environment healthy enough for the results to mean
anything?**

It adds no test cases. It selects nine that already exist, by their Azure ids,
and runs them in one invocation. Each one stands for a path the rest of the
suite depends on, so if the smoke is green the full run is worth starting, and
if it is red the full run would mostly be reporting the same fault 900 times.

## Run it

```bash
npm run test:smoke
```

Roughly **12-18 minutes**. It refreshes the admin session first (the saved token
lives about an hour), then runs the nine.

## What it covers, and why each one is there

| Azure id | Story | The path it proves |
|---|---|---|
| 14444 | 07 - payer list | The list renders, with its columns and row actions |
| 14446 | 07 - metrics | The five KPI counters load and agree with the list |
| 15602 | 01 - create | A draft can be created and holds no PayerCode |
| 15599 | 01 - send for approval | Draft -> Pending Approval, the maker's half |
| 15600 | 01 - approval outcome | The checker's half, and the status derived from it (4 cases) |
| 14913 | 44 - status transitions | Active -> Inactive -> Active, both through approval |
| 14615 | 72 - update toast | An edit saves and reports itself |
| 14638 | 73 - detail tabs | The detail screen opens with its Overview attributes |
| 14469 | 07 - access | A non-administrator is refused the list |

Between them they exercise: the saved session, the payer scope gate, the list,
the create wizard, both halves of maker-checker, a status change, an edit, the
detail screen, and a shaped non-admin role. Nothing else in the suite runs
without at least one of these working.

## Reading the result

- **All nine pass** - start the full run.
- **A fixture reports BLOCKED** - the environment could not build a precondition
  (no free network, no expired payer). The full run will report the same, and
  those cases are already written to say so. Not a reason to stop.
- **14444 or 14446 fails** - the list itself is wrong. Stop; a full run would
  report hundreds of failures with one cause.
- **15599/15600 fail** - the approval queue is not clearing. This is the
  failure mode that cost a whole overnight run on 2026-09-26: every provisioning
  fixture in the suite waits on it, so nearly everything times out at two
  minutes. Stop and fix it first.
- **14469 fails** - the role shaping did not take. Only the permission cases
  depend on it; the rest of the run is still worth doing.

## Full run

```bash
npm run test:payer
```

**Budget 9-10 hours.** Measured 2026-09-12: 8.56 h for 909 cases at
`WORKERS=1`. The suite now holds 982, and the payer scope gate added a step to
every lookup, so plan for more rather than less.

Run it a folder at a time rather than in one invocation - a single whole-suite
invocation degraded the application mid-run once and lost ten folders' results.
`scripts/run-payer-module.sh` does this: one folder per invocation, the setup
project per folder so the session never expires mid-run, a partial written after
each, and a merged report at the end. It can be resumed from any folder.
