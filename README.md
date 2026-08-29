# PBM Automation Framework

Playwright + TypeScript UI automation **framework scaffold** for the **PBM (Pharmacy Benefit Management System)** application, built around Page Object Model, reusable fixtures, centralized configuration, and CI/CD-ready reporting.

> **Status: payer module complete.** 14 Page Objects and 17 spec files covering **128 test cases across 6 payer user stories**. Every locator is built from the application's element ids and enforced by `npm run lint` - see [Locator Strategy](#locator-strategy). Further modules are added incrementally; see [Adding New Page Objects](#adding-new-page-objects) and [Adding New Test Cases](#adding-new-test-cases) for the pattern.

## Table of Contents

- [Project Overview](#project-overview)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Environment Setup](#environment-setup)
- [Browser Configuration](#browser-configuration)
- [Locator Strategy](#locator-strategy)
- [Authentication](#authentication)
- [Running Tests](#running-tests)
- [Debugging](#debugging)
- [Reports](#reports)
- [Failed Screenshots](#failed-screenshots)
- [MCP Setup (Claude Code)](#mcp-setup-claude-code)
- [Adding New Page Objects](#adding-new-page-objects)
- [Adding New Test Cases](#adding-new-test-cases)
- [Adding Fixtures](#adding-fixtures)
- [Best Practices](#best-practices)

## Project Overview

This is the foundation for functional regression testing of PBM's admin console. It is deliberately built **before** any specific module's Page Objects or tests, so that every module added later (Dashboard, Payer Management, Network Management, Users Administration, etc.) follows the same conventions instead of each being structured ad hoc.

Once a login Page Object is added, authentication is designed to happen **once per test run** via a Playwright "setup project" - see [Authentication](#authentication) for the exact pattern to wire in.

## Technology Stack

| Tool | Purpose |
|---|---|
| [Playwright](https://playwright.dev) + Playwright Test Runner | Browser automation and test execution |
| TypeScript | Type-safe Page Objects, fixtures, and tests |
| Page Object Model (POM) | Encapsulates locators/actions per screen |
| Playwright Fixtures | Reusable auth, Page Objects, test data, cleanup |
| dotenv | `.env`-based environment configuration |
| Node.js / npm | Runtime and package management |
| Model Context Protocol (MCP) | Lets Claude Code drive Playwright directly |

## Project Structure

```
PBM-Automation/
├── constants/              # Centralized, typed configuration (never hardcode elsewhere)
│   ├── BrowserConfig.ts        # Supported browsers, viewport, launch args, project builder
│   ├── EnvironmentConfig.ts    # Typed wrapper around .env / process.env
│   ├── AppRoutes.ts            # Relative application routes (add one entry per new module)
│   ├── ElementIds.ts           # THE element-id map: every selector in the suite derives from here
│   ├── Paths.ts                # Framework-internal filesystem paths (auth storage state)
│   └── Timeouts.ts             # Centralized timeout values
├── pages/                  # Page Object Model
│   ├── BasePage.ts              # Shared navigation, readiness waits, dialog/toast handling
│   └── components/              # Reusable, module-agnostic page fragments
│       ├── ListPageBase.ts          # Shared search/table/pagination for future list screens
│       └── EntityWizardDialog.ts    # Shared multi-step "Add/Edit" side-panel wizard pattern
│   # New modules go here, e.g. pages/payer/PayerManagementPage.ts, pages/auth/LoginPage.ts
├── fixtures/                # Playwright fixtures
│   ├── auth.fixture.ts          # Page Object fixture registry (placeholder - see comments)
│   ├── testData.fixture.ts      # Test-data fixture registry (placeholder - see comments)
│   ├── cleanup.fixture.ts       # Registerable teardown tasks
│   ├── screenshot.fixture.ts    # Automatic failure screenshot capture
│   └── index.ts                 # Single merged `test`/`expect` import point
├── utils/                   # Reusable utility classes
│   ├── Logger.ts, DateUtils.ts, RandomDataUtils.ts, CommonUtils.ts
│   ├── ScreenshotUtils.ts       # Writes failure screenshots OUTSIDE the repo
│   └── WaitUtils.ts             # Loading-indicator / network-idle waits
├── data/                    # Test data types + factories (empty until a module is added)
│   ├── common/, payers/, networks/, users/
├── tests/                   # Spec files, mirrored by module (empty until specs are added)
│   ├── setup/, auth/, payer/, network/, users/
├── playwright.config.ts     # Reads ONLY from constants/ - never hardcodes browser/env values
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── .mcp.json                 # Claude Code <-> Playwright MCP server configuration
└── README.md
```

## Installation

Requires **Node.js 18+** and npm. On Windows, use PowerShell or Command Prompt.

```bash
git clone <your-repo-url> PBM-Automation
cd PBM-Automation
npm install
npx playwright install
```

`npx playwright install` downloads the Chromium/Firefox/WebKit binaries Playwright drives directly. Chrome and Edge use the browser already installed on your machine (via `channel`), so no separate download is needed for those two.

## Environment Setup

Copy the example file and fill in real values:

```bash
copy .env.example .env      # Windows
# cp .env.example .env      # macOS/Linux
```

| Variable | Description | Default |
|---|---|---|
| `BASE_URL` | PBM application URL | `http://20.75.201.176` |
| `ADMIN_USERNAME` | Admin username used by the one-time login | — |
| `ADMIN_PASSWORD` | Admin password used by the one-time login | — |
| `BROWSER` | `chromium` \| `chrome` \| `edge` \| `firefox` \| `webkit` \| `all` | `chromium` |
| `HEADLESS` | `true`/`false` | `true` |
| `SLOW_MO` | Milliseconds of delay between actions (debugging) | `0` |
| `DEFAULT_TIMEOUT` / `NAVIGATION_TIMEOUT` / `ACTION_TIMEOUT` / `EXPECT_TIMEOUT` | Timeouts (ms) | see `.env.example` |
| `WORKERS` | Parallel workers (blank = Playwright decides) | blank |
| `RETRIES` | Automatic retries for failed tests | `0` |
| `FAILED_SCREENSHOTS_PATH` | **Absolute** folder, outside the repo, for failure screenshots | see below |
| `LOG_LEVEL` | `DEBUG` \| `INFO` \| `WARN` \| `ERROR` | `INFO` |

`.env` is git-ignored - never commit real credentials. `constants/EnvironmentConfig.ts` is the only file that reads `process.env` directly; every other file imports the typed `env` object from there.

## Browser Configuration

All browser settings live in **`constants/BrowserConfig.ts`** (supported browsers, default viewport, launch args, headless/slowMo). `playwright.config.ts` builds its `projects` array entirely from this file plus the `BROWSER` env var - **no test file ever needs to change to switch browsers.**

```bash
# Change the default browser without touching any code:
# .env
BROWSER=firefox

# Or per-command, without editing .env:
BROWSER=edge npx playwright test          # macOS/Linux
set BROWSER=edge && npx playwright test   # Windows cmd
$env:BROWSER="edge"; npx playwright test  # Windows PowerShell

# Run every supported browser in one execution:
BROWSER=all npx playwright test

# Convenience npm scripts (cross-platform via cross-env):
npm run test:chromium
npm run test:firefox
npm run test:webkit
npm run test:chrome
npm run test:edge
```

Headed vs. headless and viewport size are also environment-driven:

```bash
HEADLESS=false npx playwright test        # headed
npm run test:headed                       # shortcut for the above
```

Viewport, launch arguments, and per-action/navigation timeouts are all defined once in `BrowserConfig.ts` (`DEFAULT_VIEWPORT`, `BROWSER_LAUNCH_ARGS`, `browserExecutionSettings`) and consumed by every project automatically.

## Locator Strategy

The application carries an HTML `id` on **every** interactive element (see the QA
Manual's `ID-CONVENTIONS.md`), and **every locator in this suite is built from
those ids**. `constants/ElementIds.ts` is the single source of truth - screen
namespaces, column keys, sort keys, the wizard's label→id map and the dialog
action keys all live there, so a selector is never spelled out inside a Page
Object.

Ids are derived from route paths, entity ids, model field names and translation
*keys* - never from rendered text - which is why the same selector matches in
English and Arabic. That property removed a whole class of bilingual fragility
from this framework: row actions used to be found by their localized `title`
attribute, the delete dialog by its translated button label, and the wizard's
Arabic name field by a caption the app had already renamed once.

### The rule is enforced, not just documented

`npm run lint` runs the type-checker **and** `scripts/checkLocators.js`, which fails the build on any selector not built from an element id. It scans `pages/ utils/ fixtures/ tests/ data/ constants/` and applies two rules:

- **Named strategies are banned:** `getByPlaceholder`, `getByLabel`, `getByTitle`, `getByAltText`, `[title=]`, `[aria-label=]`, `locator('.some-class')`, `getByRole('button'|'textbox'|'cell'|'row'|…)`, and `.nth(n)`.
- **A page-rooted locator must name an id:** anything identifying an element from scratch has to use `#id`, or `id^=` / `id$=` / `id*=` for the dynamic, record-keyed ones. So `page.locator('table tbody tr')` fails while `page.locator('tr[id^="payer-list-table-row-"]')` passes. A *chained* `.locator('button')` is fine - it narrows inside an already id-scoped locator, which is how the `pbm-button` host/inner-button pair is reached.

When the application genuinely exposes no id, say so on the line or directly above it and the check allows it:

```ts
// locator-exception: asks whether the header CONTAINS a control at all -
// that is the sort-affordance question under test, not an identity lookup.
const exposesControl = (await header.getByRole('button').count()) > 0;
```

The recurring exceptions - PrimeNG option lists, `aria-checked` state reads, the `.p-dialog-mask` overlay, the `html` element - are allow-listed **once** inside the script with their reasons, rather than repeated at every call site.

This guard exists because the migration was the easy half. Without it, the next change under time pressure reaches for `getByRole('button', { name: 'Save' })`, it works that day, and the suite drifts back to selectors that break on a reworded label or an Arabic run.

### Four DOM quirks that decide whether a locator works

- **`pbm-button` ids sit on the `<p-button>` host, not the `<button>`.** Always
  go through `BasePage.btn(id)` / `buttonSelector(id)`, which descend to the
  inner `<button>`. This matters more than it looks: the app disables *every*
  button while any HTTP request is in flight, and clicking the host element
  skips Playwright's "wait until enabled" check - so a host click during a
  pending request is a **silent no-op that reports success**.
- **`pbm-select` ids sit on the inner `span[role="combobox"]`.** Its option
  elements get PrimeNG-generated, render-order-dependent ids (`pn_id_30_0`), so
  choosing an option is the one thing that must still go by visible text -
  `BasePage.chooseOption()` does this.
- **Drawer and dialog hosts stay mounted and zero-size while closed**, so they
  never report as visible. Assert on the `-title` inside them instead.
- **Everything overlay-shaped renders into `<body>`** - drawers, dialogs, select
  panels, date-picker calendars - outside the screen's own element, so they are
  queried from the document root.

### Where the live app differs from the QA Manual

All verified directly against the running application:

- **There is only ONE confirmation dialog.** `pbm-dialog` serves delete,
  send-for-approval, approve, reject and the dirty-form guard. The manual's
  `pbm-delete-confirm-dialog` and `pbm-unsaved-changes-dialog` never render.
- **Its action keys are only `confirm` / `cancel`** - including on Approve and
  Reject, which the manual describes as `approve` / `reject`. Only the
  drawer-close guard uses `stay` / `discard`. So "Yes", "نعم", "Approve" and
  "Send for Approval" are all the same element.
- **The assign-network drawer's primary action is `-confirm-button`**, not
  `-assign-button`; the shared drawer names its primary action generically.
  Its multiselect id is on a *hidden* input, so the click goes to the visible
  wrapper.
- **The payer table has an undocumented `versionstatus` column** (the "Approval
  Status" cell).

### Two behaviours to respect in new tests

- **Lists refetch server-side** for search, sort, filter and paging, and the UI
  closes its menu and updates its chips *before* the new rows arrive. Reading the
  table straight after a click sees the previous page of data - use
  `withListRefresh()`.
- **Toasts stack and share an id.** A previous action's toast can still be on
  screen when the next arrives, both as `pbm-toast`. Use `toastWithText()` when
  the wrong one could match.

## Authentication

The framework is designed for login to happen **once per test run**, not once per test. This isn't wired up yet (no `LoginPage` exists), but the pattern to follow when one is added is:

1. Add `pages/auth/LoginPage.ts` with locators + a `login(credentials)` method for the real login form.
2. Add `tests/setup/auth.setup.ts` as a Playwright **setup project** test that uses `LoginPage` to log in with the credentials from `.env` and saves the session:
   ```ts
   await page.context().storageState({ path: AUTH_STORAGE_STATE_PATH }); // constants/Paths.ts
   ```
3. `playwright.config.ts` already detects whether that saved session file exists and, if so, automatically gives every browser project `dependencies: ['setup']` and `use: { storageState: AUTH_STORAGE_STATE_PATH }` - no config changes needed once step 2 is in place.
4. Register `loginPage` (and any post-login Page Object) in `fixtures/auth.fixture.ts` so specs never construct `new LoginPage(page)` or call `login()` themselves.

A spec that specifically tests the login flow itself should opt out of the shared session with `test.use({ storageState: { cookies: [], origins: [] } })`.

## Running Tests

```bash
npx playwright test                 # runs the setup project (if present), then the configured browser(s)
npm test                            # same, via package.json script
npx playwright test tests/payer     # only tests under a given module folder, once specs exist
```

`npx playwright test --list` currently reports 0 tests - that's expected until the first spec file is added.

### Headed Mode

```bash
npm run test:headed
```

### Parallel Execution

`fullyParallel: true` is set in `playwright.config.ts`. Once test data factories exist under `data/`, every test should build its own unique record (via `utils/RandomDataUtils.ts`) so tests are safe to run concurrently with no shared mutable state. Control worker count with `WORKERS` in `.env`, or:

```bash
npx playwright test --workers=4
```

## Debugging

```bash
npx playwright test --debug         # Playwright Inspector, step through actions
npm run test:debug                  # shortcut for the above
npx playwright test --ui            # interactive UI mode (time-travel, watch mode)
npx playwright codegen %BASE_URL%   # record locators/steps against the live app (Windows)
```

## Reports

```bash
npm run report                      # opens the last HTML report
```

The HTML report (`playwright-report/`) will include failure screenshots (attached via the failure fixture) and traces for failed/retried tests, once tests exist. Neither `playwright-report/` nor `test-results/` are committed to Git.

## Failed Screenshots

Screenshots are captured **only for failed tests**, and are written **outside the project directory** by `utils/ScreenshotUtils.ts`, configured via `FAILED_SCREENSHOTS_PATH`:

```
<FAILED_SCREENSHOTS_PATH>/
└── 2026-08-09_09-30-00/            # one folder per test run
    ├── Create_Payer_chromium.png
    ├── Edit_Payer_chromium.png
    └── Delete_Payer_firefox.png
```

- If `FAILED_SCREENSHOTS_PATH` is unset, the framework falls back to a folder **one level above** the project root, so screenshots never land inside the repo even without configuration.
- The target directory (and each run's timestamped subfolder) is created automatically if it doesn't exist.
- Filenames combine the sanitized test title and the browser/project name.
- The same screenshot is also attached to the Playwright HTML report via `testInfo.attach(...)`, so you don't need filesystem access to review it.
- This path must never be committed to Git - keep it outside the repository (e.g. `C:\AutomationArtifacts\PBM\FailedScreenshots` on Windows).

## MCP Setup (Claude Code)

This project ships a committed **`.mcp.json`** at the repo root configuring the official Playwright MCP server, so Claude Code can drive a real browser against this same application directly from chat - useful for exploring a new page's locators before writing its Page Object.

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    }
  }
}
```

### Installing required dependencies

No separate install step is required - `npx -y @playwright/mcp@latest` downloads and runs the server on first use. If you prefer it pre-installed:

```bash
npm install -g @playwright/mcp
```

### Connecting Claude Code

1. Open this project folder in Claude Code (`claude` in the project root, or open the folder in an IDE with the Claude Code extension).
2. Claude Code auto-detects `.mcp.json` in the project root and offers to enable the `playwright` server - approve it.
3. Verify it's connected: ask Claude Code to "list available MCP tools" or run `/mcp` inside Claude Code.

### Running Playwright through MCP

Once connected, you can ask Claude Code to, for example, "navigate to the Payer Management page and list the visible table columns" - it will drive a real browser via the MCP server's tools (navigate, click, snapshot, evaluate, etc.), which is the recommended way to verify real locators before writing a new Page Object.

### Windows-specific setup

- Ensure Node.js and npm are on your `PATH` (`node -v`, `npm -v`).
- If `npx` fails to spawn from Claude Code on Windows with an `ENOENT`/spawn error, change `.mcp.json`'s command to use the Windows-safe form:
  ```json
  { "command": "npx.cmd", "args": ["-y", "@playwright/mcp@latest"] }
  ```
- Corporate proxies/firewalls can block the first-time download of `@playwright/mcp` - install it globally instead (see above) and reference the global binary if needed.

### Troubleshooting MCP

| Symptom | Fix |
|---|---|
| Claude Code doesn't see the server | Confirm `.mcp.json` is at the project root and reload the Claude Code window |
| `npx` spawn error on Windows | Use `npx.cmd` as shown above, or install `@playwright/mcp` globally |
| Browser doesn't launch via MCP | Run `npx playwright install` once so the MCP server's browser binaries exist |
| MCP actions time out against the app | Confirm `BASE_URL`/network access to the PBM app from the machine running Claude Code |

## Adding New Page Objects

1. Create `pages/<module>/<Module>Page.ts` (e.g. `pages/payer/PayerManagementPage.ts`).
2. For a list/search/table screen, extend `pages/components/ListPageBase.ts` and pass the screen's **id namespace** (e.g. `payer-list`) to `super()`. It then derives search, row lookup, row actions, pagination and column reads from that one string - no per-screen selectors needed.
3. For a create/edit side-panel wizard, extend `pages/components/EntityWizardDialog.ts`, passing the drawer's id prefix and a label→field map (see `PAYER_FORM_FIELD` in `constants/ElementIds.ts`). Callers keep addressing fields by their visible label while every locator is built from an id.
4. Add every new id to `constants/ElementIds.ts` and **verify it against the running application** before committing - the QA Manual is wrong in several places. Then run `npm run lint`, which fails if any new selector is not id-based.
4. Add the module's route to `constants/AppRoutes.ts` instead of hardcoding a path string.
5. Only add methods that are genuinely reusable (`createX`, `editX`, `deleteX`, `searchX`, `verifyXDetails`) - don't duplicate what the base class already provides.
6. Register the new Page Object as a fixture in `fixtures/auth.fixture.ts` (see the pattern documented in that file) so specs can request it instead of constructing it manually.

## Adding New Test Cases

1. Create a spec file under `tests/<module>/<feature>.spec.ts`.
2. Import the shared fixtures: `import { test, expect } from '../../fixtures';`.
3. Request the Page Object(s) and data you need as fixture parameters - never construct `new SomePage(page)` inside a test.
4. Register any created-data cleanup via the `cleanup` fixture.
5. Keep assertions in the test; keep locators/actions in the Page Object.

```ts
import { test, expect } from '../../fixtures';

test('rejects duplicate payer license numbers', async ({ payerManagementPage, uniquePayer, cleanup }) => {
  await payerManagementPage.open();
  const dialog = await payerManagementPage.startCreatePayer(uniquePayer);
  cleanup.register(() => payerManagementPage.deletePayer(uniquePayer.nameEn));
  // ...assertions
});
```

## Adding Fixtures

Add a new fixture file under `fixtures/`, following the existing pattern (`base.extend<...>({...})`), then merge it into `fixtures/index.ts` via `mergeTests(...)`. Keep each fixture file focused on one concern (auth/Page Objects, test data, cleanup, cross-cutting behavior like the screenshot fixture) rather than one large fixture file.

## Best Practices

- **No hardcoded credentials or URLs** - everything comes from `constants/EnvironmentConfig.ts`, backed by `.env`.
- **No `page.waitForTimeout()`** - use `expect()`, `waitForURL()`, `waitForLoadState()`, or the helpers in `utils/WaitUtils.ts`.
- **Locators are ids, full stop.** Add the id to `constants/ElementIds.ts` and build the locator from it; do not reach for a CSS class, an accessible name, a `title` attribute or a cell position. The only sanctioned exceptions are documented in [Locator Strategy](#locator-strategy): picking a dropdown option (PrimeNG option ids are unstable) and reading the stepper's active-step class. Verify a new id against the live app (via MCP or `codegen`) rather than guessing - the manual is wrong in several places.
- **Never address a cell or a menu item by position.** `nth(2)`, `td:nth-child(n)` and "the second combobox on the page" all silently point at the wrong data the moment the UI grows a column or a control; use the column key or the option key instead.
- **Independent tests** - every test should build its own unique data (`RandomDataUtils`) and be safe to run in any order or in parallel.
- **Business logic lives in Page Objects**, not in test files - tests should read as a sequence of intents (`open()`, `createX()`, `verifyXDetails()`), not raw locator interactions.
- **Fail loudly** - don't swallow errors or over-use retries to mask real defects; `RETRIES` defaults to `0` locally and only a small number on CI.
