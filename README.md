# PBM Automation Framework

Production-ready Playwright + TypeScript UI automation framework for the **PBM (Pharmacy Benefit Management System)** application, built with Page Object Model, reusable fixtures, centralized configuration, and CI/CD-ready reporting.

## Table of Contents

- [Project Overview](#project-overview)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Environment Setup](#environment-setup)
- [Browser Configuration](#browser-configuration)
- [Authentication](#authentication)
- [Running Tests](#running-tests)
- [Debugging](#debugging)
- [Reports](#reports)
- [Failed Screenshots](#failed-screenshots)
- [MCP Setup (Claude Code)](#mcp-setup-claude-code)
- [Adding New Test Cases](#adding-new-test-cases)
- [Adding New Page Objects](#adding-new-page-objects)
- [Adding Fixtures](#adding-fixtures)
- [Best Practices](#best-practices)

## Project Overview

This framework automates functional regression testing for PBM's admin console (Dashboard, Payer Management, Network Management, Users Administration, and more). It is designed so any QA engineer can add a new module's tests without restructuring the project - just add a Page Object, test data factory, and spec file following the existing pattern.

Authentication happens **once per test run** via a Playwright "setup project" that logs in as the admin user and reuses that session across every test, so no spec file ever repeats login code.

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
│   ├── AppRoutes.ts            # Relative application routes
│   ├── Paths.ts                # Framework-internal filesystem paths (auth storage state)
│   └── Timeouts.ts             # Centralized timeout values
├── pages/                  # Page Object Model
│   ├── BasePage.ts              # Shared navigation, readiness waits, dialog/toast handling
│   ├── DashboardPage.ts
│   ├── auth/LoginPage.ts
│   ├── components/              # Reusable page fragments
│   │   ├── SidebarNav.ts            # Left navigation drawer
│   │   ├── ListPageBase.ts          # Shared search/table/pagination for all list screens
│   │   └── EntityWizardDialog.ts    # Shared multi-step "Add/Edit" side-panel wizard
│   ├── payer/PayerManagementPage.ts, PayerCreateDialog.ts
│   ├── network/NetworkManagementPage.ts, NetworkCreateDialog.ts
│   └── users/UsersAdministrationPage.ts, UserCreateDialog.ts
├── fixtures/                # Playwright fixtures
│   ├── auth.fixture.ts          # Page Object fixtures (auth itself lives in tests/setup)
│   ├── testData.fixture.ts      # Unique-per-test data fixtures
│   ├── cleanup.fixture.ts       # Registerable teardown tasks
│   ├── screenshot.fixture.ts    # Automatic failure screenshot capture
│   └── index.ts                 # Single merged `test`/`expect` import point
├── utils/                   # Reusable utility classes
│   ├── Logger.ts, DateUtils.ts, RandomDataUtils.ts, CommonUtils.ts
│   ├── ScreenshotUtils.ts       # Writes failure screenshots OUTSIDE the repo
│   └── WaitUtils.ts             # Loading-indicator / network-idle waits
├── data/                    # Test data types + factories
│   ├── common/types.ts, payers/payerData.ts, networks/networkData.ts, users/userData.ts
├── tests/                   # Spec files, mirrored by module
│   ├── setup/auth.setup.ts      # One-time admin login (Playwright setup project)
│   ├── auth/login.spec.ts
│   ├── payer/payer.spec.ts
│   ├── network/network.spec.ts
│   └── users/users.spec.ts
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

## Authentication

Login happens **once per test run**, not once per test:

1. `tests/setup/auth.setup.ts` runs as a dedicated Playwright **setup project**. It uses `LoginPage` + `DashboardPage` to log in with the credentials from `.env` and saves the authenticated session (cookies/local storage) to `.auth/admin.json` (git-ignored).
2. Every other project (`chromium`, `firefox`, etc.) declares `dependencies: ['setup']` in `playwright.config.ts` and loads that saved session via `storageState`.
3. Tests simply request Page Object fixtures (e.g. `payerManagementPage`) and are already authenticated - no test calls `login()` itself.

The one exception is `tests/auth/login.spec.ts`, which specifically tests the login flow and therefore opts out of the shared session with `test.use({ storageState: { cookies: [], origins: [] } })`.

## Running Tests

```bash
npx playwright test                 # runs the setup project, then the configured browser(s)
npm test                            # same, via package.json script
npm run test:payer                  # only tests/payer/**
npm run test:network                # only tests/network/**
npm run test:users                  # only tests/users/**
npx playwright test tests/payer/payer.spec.ts   # a single file
```

### Headed Mode

```bash
npm run test:headed
```

### Parallel Execution

`fullyParallel: true` is set in `playwright.config.ts` and every test builds its own unique data via `data/*` factories (`RandomDataUtils`), so tests are safe to run concurrently with no shared mutable state. Control worker count with `WORKERS` in `.env`, or:

```bash
npx playwright test --workers=4
```

## Debugging

```bash
npx playwright test --debug         # Playwright Inspector, step through actions
npm run test:debug                  # shortcut for the above
npx playwright test --ui            # interactive UI mode (time-travel, watch mode)
npx playwright codegen %BASE_URL%   # record new locators/steps against the live app (Windows)
```

## Reports

```bash
npm run report                      # opens the last HTML report
```

The HTML report (`playwright-report/`) includes failure screenshots (attached via the failure fixture) and traces for failed/retried tests. Neither `playwright-report/` nor `test-results/` are committed to Git.

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

This project ships a committed **`.mcp.json`** at the repo root configuring the official Playwright MCP server, so Claude Code can drive a real browser against this same application directly from chat.

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

Once connected, you can ask Claude Code to, for example, "navigate to the Payer Management page and list the visible table columns" - it will drive a real browser via the MCP server's tools (navigate, click, snapshot, evaluate, etc.), which is how the locators in this framework's Page Objects were originally verified against the live application.

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
  await dialog.proceedFromBasicInfo();
  cleanup.register(() => payerManagementPage.deletePayer(uniquePayer.nameEn));
  // ...assertions
});
```

## Adding New Page Objects

1. Create `pages/<module>/<Module>Page.ts`.
2. For a list/search/table screen, extend `pages/components/ListPageBase.ts` - it already provides search, row lookup, row actions, pagination, and column reads.
3. For a create/edit side-panel wizard, extend `pages/components/EntityWizardDialog.ts` and add only the module-specific `fillXyz()` methods (locate fields by their visible label - see `PayerCreateDialog.ts` for the pattern).
4. Only add methods that are genuinely reusable (`createX`, `editX`, `deleteX`, `searchX`, `verifyXDetails`) - don't duplicate what the base class already provides.
5. Register the new Page Object as a fixture in `fixtures/auth.fixture.ts` so tests can request it instead of constructing it manually.

## Adding Fixtures

Add a new fixture file under `fixtures/`, following the existing pattern (`base.extend<...>({...})`), then merge it into `fixtures/index.ts` via `mergeTests(...)`. Keep each fixture file focused on one concern (auth/Page Objects, test data, cleanup, cross-cutting behavior like the screenshot fixture) rather than one large fixture file.

## Best Practices

- **No hardcoded credentials or URLs** - everything comes from `constants/EnvironmentConfig.ts`, backed by `.env`.
- **No `page.waitForTimeout()`** - use `expect()`, `waitForURL()`, `waitForLoadState()`, or the helpers in `utils/WaitUtils.ts`.
- **Locator priority**: id → name → `data-testid` → stable class → label/placeholder → XPath (last resort). This app doesn't expose stable ids/`data-testid` on form fields, so field lookups are by visible label text (see `EntityWizardDialog.field()`), which is far more stable than placeholder text or DOM position.
- **Independent tests** - every test builds its own unique data (`RandomDataUtils`) and can run in any order or in parallel.
- **Business logic lives in Page Objects**, not in test files - tests read as a sequence of intents (`open()`, `startCreatePayer()`, `verifyPayerDetails()`), not raw locator interactions.
- **Fail loudly** - don't swallow errors or over-use retries to mask real defects; `RETRIES` defaults to `0` locally and only a small number on CI.
