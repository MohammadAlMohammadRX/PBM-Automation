# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: plan\28-manage-conflicting-requests-during-the-approval-workflow\withdrawal-notification.spec.ts >> US 14343 - Withdrawal clears the approver's notifications >> TC-19361: should clear the request from the approver's queue and notifications when a pending plan is edited and withdrawn
- Location: tests\plan\28-manage-conflicting-requests-during-the-approval-workflow\withdrawal-notification.spec.ts:28:7

# Error details

```
Error: Step 5 "As the Approver, the withdrawn request no longer appears in the notification list" failed. Expected: As the Approver, the withdrawn request no longer appears in the notification list. Actual: Notifications still listed for the withdrawn request: expected none, but found "A plan change awaits your approval:  CareConnect 2026-11-08 04:45 CreatePlan  (2026-11-08T04:45:00.6119839+03:00)".

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [ref=f4e4]:
  - complementary [ref=f4e6]:
    - img "PBM" [ref=f4e8]
    - navigation [ref=f4e9]:
      - list [ref=f4e10]:
        - listitem [ref=f4e11]:
          - link "Dashboard" [ref=f4e12] [cursor=pointer]:
            - /url: /dashboard
        - listitem [ref=f4e17]:
          - button "Users Mgmt" [ref=f4e18] [cursor=pointer]
        - listitem [ref=f4e27]:
          - link "Facility Mgmt" [ref=f4e28] [cursor=pointer]:
            - /url: /facility-management
        - listitem [ref=f4e34]:
          - link "Terminology Mgmt" [ref=f4e35] [cursor=pointer]:
            - /url: /terminology-management
        - listitem [ref=f4e41]:
          - link "Payer Mgmt" [ref=f4e42] [cursor=pointer]:
            - /url: /payer-management
        - listitem [ref=f4e48]:
          - link "Network Mgmt" [ref=f4e49] [cursor=pointer]:
            - /url: /network-management
        - listitem [ref=f4e57]:
          - link "Plans Mgmt" [ref=f4e58] [cursor=pointer]:
            - /url: /plans-management
        - listitem [ref=f4e66]:
          - link "Policy Mgmt" [ref=f4e67] [cursor=pointer]:
            - /url: /policy-management
        - listitem [ref=f4e75]:
          - link "Formulary Mgmt" [ref=f4e76] [cursor=pointer]:
            - /url: /formulary-pricing
        - listitem [ref=f4e84]:
          - link "Member Mgmt" [ref=f4e85] [cursor=pointer]:
            - /url: /member-management
        - listitem [ref=f4e93]:
          - link "Approval Mgmt" [ref=f4e94] [cursor=pointer]:
            - /url: /approval-management
        - listitem [ref=f4e100]:
          - link "Integration Portal" [ref=f4e101] [cursor=pointer]:
            - /url: /engine-portal
            - generic [ref=f4e111]: 
        - listitem [ref=f4e112]:
          - button "System Settings" [ref=f4e113] [cursor=pointer]
  - generic [ref=f4e122]:
    - banner [ref=f4e124]:
      - heading "Approval Mgmt" [level=1] [ref=f4e126]
      - generic [ref=f4e127]:
        - button "Announcements" [ref=f4e130] [cursor=pointer]
        - button "Notifications" [ref=f4e139] [cursor=pointer]:
          - generic [ref=f4e140]: 9+
        - button "عربي" [ref=f4e147] [cursor=pointer]
        - button "User menu" [ref=f4e155] [cursor=pointer]:
          - generic [ref=f4e156]: CU
          - generic [ref=f4e158]: CareConnect User
    - generic [ref=f4e162]:
      - generic [ref=f4e164]:
        - list [ref=f4e165]:
          - listitem [ref=f4e166]:
            - link "Dashboard" [ref=f4e167] [cursor=pointer]:
              - /url: /dashboard
            - generic [ref=f4e168]: 
          - listitem [ref=f4e169]:
            - generic [ref=f4e170]: Approval Mgmt
        - tablist [ref=f4e172]:
          - tab "Table view" [selected] [ref=f4e173] [cursor=pointer]
          - tab "Cards view" [ref=f4e178] [cursor=pointer]
      - main [ref=f4e185]:
        - generic [ref=f4e186]:
          - tablist [ref=f4e187]:
            - tab "Payer 422" [ref=f4e188] [cursor=pointer]:
              - text: Payer
              - generic [ref=f4e189]: "422"
            - tab "Network 132" [ref=f4e190] [cursor=pointer]:
              - text: Network
              - generic [ref=f4e191]: "132"
            - tab "Plan 78" [selected] [ref=f4e192] [cursor=pointer]:
              - text: Plan
              - generic [ref=f4e193]: "78"
            - tab "Policy 7" [ref=f4e194] [cursor=pointer]:
              - text: Policy
              - generic [ref=f4e195]: "7"
            - tab "Formulary 14" [ref=f4e196] [cursor=pointer]:
              - text: Formulary
              - generic [ref=f4e197]: "14"
            - tab "Registrations" [ref=f4e198] [cursor=pointer]
          - generic [ref=f4e200]:
            - generic [ref=f4e201]:
              - generic [ref=f4e202]:
                - generic [ref=f4e203]:
                  - generic: 
                  - textbox "Search" [active] [ref=f4e204]: Automation Plan mw766odwti
                  - generic [ref=f4e205]:
                    - button "Clear" [ref=f4e206] [cursor=pointer]
                    - button "Filters" [ref=f4e209] [cursor=pointer]
                - button "Clear" [ref=f4e212] [cursor=pointer]
              - generic [ref=f4e213]:
                - button "Sort By" [ref=f4e216] [cursor=pointer]
                - generic [ref=f4e222] [cursor=pointer]:
                  - generic [ref=f4e223]:
                    - combobox
                  - generic [ref=f4e224]: All Change Types
                - button "Export" [ref=f4e231] [cursor=pointer]
                - button "Approve All" [disabled] [ref=f4e239]
                - button "Reject All" [disabled] [ref=f4e244]
            - generic [ref=f4e248]:
              - generic [ref=f4e249]: Automation Plan mw766odwti
              - button "remove" [ref=f4e250] [cursor=pointer]
            - table [ref=f4e256]:
              - rowgroup [ref=f4e257]:
                - row [ref=f4e258]:
                  - columnheader "Plan Name" [ref=f4e259]
                  - columnheader "Change Type" [ref=f4e260]
                  - columnheader "Status" [ref=f4e261]
                  - columnheader "Requested By" [ref=f4e262]
                  - columnheader "Requested On" [ref=f4e263]
                  - columnheader "Actions" [ref=f4e264]
              - rowgroup [ref=f4e265]:
                - row [ref=f4e266]:
                  - cell "No pending approval submissions." [ref=f4e267]
```

# Test source

```ts
  106 | export const test = base.extend<TestStatusFixtures>({
  107 |   steps: async ({ page }, use, testInfo) => {
  108 |     const records: StepRecord[] = [];
  109 |     let abortReason: string | null = null;
  110 | 
  111 |     // Everything the application shows from here on is recorded, so a failed
  112 |     // step can report the toast or error it raised even after it expired.
  113 |     await UiEventRecorder.watch(testInfo, page);
  114 | 
  115 |     const add = (
  116 |       name: string,
  117 |       status: StepRecord['status'],
  118 |       reason: string | undefined,
  119 |       durationMs: number,
  120 |       screenshot?: string,
  121 |       observed?: StepRecord['observed'],
  122 |       plainWords?: StepRecord['plain'],
  123 |     ) => {
  124 |       records.push({ index: records.length + 1, name, status, reason, durationMs, screenshot, observed, plain: plainWords });
  125 |     };
  126 | 
  127 |     async function run(name: string, body: () => Promise<void>, isCritical: boolean) {
  128 |       if (abortReason) {
  129 |         add(name, StepStatus.NOT_EXECUTED, abortReason, 0);
  130 |         Logger.warn(`Step "${name}" NOT EXECUTED - ${abortReason}`);
  131 |         return;
  132 |       }
  133 | 
  134 |       const started = Date.now();
  135 |       // Watched so a BLOCKED raised INSIDE this step can be told apart from a
  136 |       // failure - see the catch below.
  137 |       const annotationsBefore = testInfo.annotations.length;
  138 |       try {
  139 |         // Wrapped in test.step so the HTML report and trace show the same
  140 |         // structure this recorder reports.
  141 |         await base.step(name, body);
  142 |         add(name, StepStatus.PASS, undefined, Date.now() - started);
  143 |       } catch (error) {
  144 |         const reason = plain(error instanceof Error ? error.message : String(error));
  145 | 
  146 |         // A BLOCKED prerequisite is NOT a failed step, and must not be recorded
  147 |         // as one. `blocked()` and `blockedByPrecondition()` annotate and then
  148 |         // call testInfo.skip, which throws - and that throw landed here, where
  149 |         // it was written down as a failure and given a soft assertion. The soft
  150 |         // assertion is what decides Playwright's verdict, so the test came out
  151 |         // FAILED instead of skipped: eleven cases in the network-assignment
  152 |         // story reported as failures of the application when every one of them
  153 |         // had said, in its own message, "Test is skipped: BLOCKED: ...".
  154 |         //
  155 |         // Detected by the annotation the blocked helpers add immediately before
  156 |         // skipping, rather than by matching Playwright's skip message, so it
  157 |         // cannot drift with a wording change upstream.
  158 |         const blockedHere = testInfo.annotations
  159 |           .slice(annotationsBefore)
  160 |           .some((annotation) => annotation.type === ANNOTATION.blocked);
  161 |         if (blockedHere) {
  162 |           add(name, StepStatus.BLOCKED, reason, Date.now() - started);
  163 |           Logger.warn(`Step "${name}" BLOCKED - ${reason.split('\n')[0]}`);
  164 |           throw error;
  165 |         }
  166 | 
  167 |         // The failure in plain words (utils/failureNarrator.js) - worked out
  168 |         // first, because the screenshot prints it on the screen it photographs.
  169 |         const stepIndex = records.length + 1;
  170 |         const told = narrateStep({ index: stepIndex, name, reason });
  171 |         const elementId = (reason.match(/locator\('[^']*#([A-Za-z0-9_-]+)/) ?? [])[1];
  172 | 
  173 |         // Taken HERE, before anything else runs, so the image shows the screen
  174 |         // that produced the failure rather than whatever teardown leaves behind.
  175 |         const shot = await ScreenshotUtils.captureStepFailure(page, testInfo, stepIndex, name, {
  176 |           expected: told.expected,
  177 |           actual: told.actual,
  178 |           elementId,
  179 |         });
  180 | 
  181 |         // What the application showed during the step - read after the
  182 |         // screenshot so a message that arrived while the screen settled is
  183 |         // included - and the pictures taken the moment each message appeared.
  184 |         const seen = UiEventRecorder.since(testInfo, started);
  185 |         const messageShots = await ScreenshotUtils.captureStepMessages(testInfo, stepIndex, name, seen);
  186 |         const observed = {
  187 |           events: UiEventRecorder.describe(seen, started),
  188 |           screenshots: messageShots,
  189 |         };
  190 |         const plainWords = {
  191 |           expected: told.expected,
  192 |           actual: told.actual,
  193 |           screen: narrateStep({ index: stepIndex, name, reason, observed }).screen,
  194 |         };
  195 | 
  196 |         add(name, StepStatus.FAIL, reason, Date.now() - started, shot, observed, plainWords);
  197 |         Logger.error(`Step "${name}" FAILED - expected: ${told.expected} | actual: ${told.actual}`, reason);
  198 |         for (const line of observed.events) Logger.info(`    seen: ${line}`);
  199 | 
  200 |         // A SOFT failure, so the test continues here but Playwright still ends
  201 |         // it as failed. This is what lets the remaining steps run while keeping
  202 |         // the overall verdict honest - no separate bookkeeping decides it.
  203 |         // Worded for a reader: it is the error Playwright and Azure show.
  204 |         expect
  205 |           .soft(false, `Step ${stepIndex} "${name}" failed. Expected: ${told.expected} Actual: ${told.actual}`)
> 206 |           .toBe(true);
      |            ^ Error: Step 5 "As the Approver, the withdrawn request no longer appears in the notification list" failed. Expected: As the Approver, the withdrawn request no longer appears in the notification list. Actual: Notifications still listed for the withdrawn request: expected none, but found "A plan change awaits your approval:  CareConnect 2026-11-08 04:45 CreatePlan  (2026-11-08T04:45:00.6119839+03:00)".
  207 | 
  208 |         if (isCritical) {
  209 |           abortReason = `step ${records.length} "${name}" failed and later steps depend on it`;
  210 |         }
  211 |       }
  212 |     }
  213 | 
  214 |     const steps: TestSteps = {
  215 |       step: (name, body) => run(name, body, false),
  216 |       critical: (name, body) => run(name, body, true),
  217 | 
  218 |       blocked(reason) {
  219 |         testInfo.annotations.push({ type: ANNOTATION.blocked, description: reason });
  220 |         Logger.warn(`BLOCKED: ${reason}`);
  221 |         // Skipping, not failing: the behaviour under test was never observed.
  222 |         base.skip(true, `BLOCKED: ${reason}`);
  223 |         throw new Error('unreachable');
  224 |       },
  225 | 
  226 |       dependsOn(caseId) {
  227 |         const outcome = outcomes.get(keyFor(testInfo, caseId));
  228 | 
  229 |         if (outcome === undefined) {
  230 |           // Nothing to go on - the prerequisite has not run in this worker.
  231 |           // Stay silent rather than skip: a partial run (a `-g` filter, or the
  232 |           // file split across workers) must not fabricate a dependency failure.
  233 |           Logger.warn(
  234 |             `Dependency "${caseId}" has not run in this worker - continuing without it`,
  235 |           );
  236 |           return;
  237 |         }
  238 | 
  239 |         if (outcome === TestStatus.FAIL || outcome === TestStatus.BLOCKED) {
  240 |           const reason = `depends on ${caseId}, which ended as ${outcome}`;
  241 |           testInfo.annotations.push({
  242 |             type: ANNOTATION.dependencySkipped,
  243 |             description: reason,
  244 |           });
  245 |           Logger.warn(`SKIPPED: ${reason}`);
  246 |           base.skip(true, `SKIPPED: ${reason}`);
  247 |         }
  248 |       },
  249 | 
  250 |       records: () => [...records],
  251 |     };
  252 | 
  253 |     await use(steps);
  254 | 
  255 |     // ---- teardown: publish the step breakdown and remember the outcome -----
  256 | 
  257 |     if (records.length > 0) {
  258 |       const lines = records.map((r) => {
  259 |         const head = `Step ${r.index} -> ${r.status}  (${(r.durationMs / 1000).toFixed(1)}s)  ${r.name}`;
  260 |         const parts = [head];
  261 |         if (r.plain) {
  262 |           parts.push(`    Expected: ${r.plain.expected}`);
  263 |           parts.push(`    Actual:   ${r.plain.actual}`);
  264 |           if (r.plain.screen.length) parts.push(`    On screen at that moment: ${r.plain.screen.join('; ')}`);
  265 |           if (r.reason) parts.push(`    Technical detail (for the automation team): ${r.reason.split('\n')[0]}`);
  266 |         } else if (r.reason) parts.push(`    Reason: ${r.reason.split('\n')[0]}`);
  267 |         if (r.screenshot) parts.push(`    Screenshot: ${r.screenshot}`);
  268 |         if (r.observed) {
  269 |           parts.push(r.observed.events.length > 0
  270 |             ? '    Seen on screen during the step:'
  271 |             : '    Seen on screen during the step: no message, dialog, API error or console error');
  272 |           for (const line of r.observed.events) parts.push(`      ${line}`);
  273 |           for (const file of r.observed.screenshots) parts.push(`    Message screenshot: ${file}`);
  274 |         }
  275 |         return parts.join('\n');
  276 |       });
  277 | 
  278 |       testInfo.annotations.push({
  279 |         type: ANNOTATION.steps,
  280 |         description: JSON.stringify(records),
  281 |       });
  282 | 
  283 |       // A readable copy for whoever opens the HTML report.
  284 |       await testInfo
  285 |         .attach('steps.txt', {
  286 |           body: lines.join('\n'),
  287 |           contentType: 'text/plain',
  288 |         })
  289 |         .catch(() => undefined);
  290 |     }
  291 | 
  292 |     outcomes.set(keyFor(testInfo, caseIdOf(testInfo.title)), resolveStatus(testInfo));
  293 |   },
  294 | });
  295 | 
  296 | /**
  297 |  * The test case's status, from what Playwright recorded plus our annotations.
  298 |  *
  299 |  * Read in teardown, where `testInfo.status` is already settled.
  300 |  */
  301 | function resolveStatus(info: TestInfo): TestStatusName {
  302 |   const blocked = info.annotations.some((a) => a.type === ANNOTATION.blocked);
  303 |   if (blocked) return TestStatus.BLOCKED;
  304 |   if (info.status === 'skipped') return TestStatus.SKIPPED;
  305 |   if (info.status === 'passed') return TestStatus.PASS;
  306 |   // failed or timedOut. An EXPECTED failure (test.fail) still counts as FAIL for
```