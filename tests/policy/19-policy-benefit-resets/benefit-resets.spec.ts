import { test, expect } from '../../../fixtures';
import type { PolicyResetDrawer } from '../../../pages/policy/PolicyBenefitResetsPage';
import { BENEFIT_RESETS } from '../../../constants/ElementIds';
import { RESET_HISTORY } from '../../../constants/policy/writerCIds';
import { FIELD_MESSAGE, LABEL, TOAST_TEXT, textOfLength } from '../../../data/policy/policy.data';
import { BLOCKED_CASES, CASES, FORM_PARTS } from '../../../data/policy/benefitResets.data';
import {
  docxFile,
  pdfOfSize,
  readResetHistory,
  readResetHistoryText,
  resetDrawerMessages,
  resetReasonValue,
  resetTermValue,
  searchResetHistory,
  todayText,
  typeInForceSearch,
  waitUntilInForce,
} from '../../../utils/policy/writerCHelpers';
import { policiesInForce, readPolicy } from '../../../utils/PolicyProvisioning';

/** A Riyadh calendar day (yyyy-mm-dd), the day the app's benefit periods are counted in. */
const riyadhDay = (when: string | Date): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date(when));

/**
 * The app refuses a reset on the day the current benefit period starts (409 "already starts
 * today; it cannot be reset again today"). A seed made Active by today's lifecycle job starts
 * its period today (2026-11-04: 19689 / 19690), so such a seed BLOCKS the case until tomorrow.
 */
function requirePeriodNotStartingToday(policy: Awaited<ReturnType<typeof readPolicy>>, requireBaseline: (held: boolean, what: string) => void): void {
  const start = policy.benefitYear.currentPeriodStart;
  requireBaseline(!start || riyadhDay(start) !== riyadhDay(new Date()), `an Active policy whose current benefit period did not start today (it starts ${start}; a reset is refused on that day)`);
}

/** In force two minutes from now: the case's own Future policy, listed in Policies in force once its effective time passes. */
const IN_FORCE_SOON = { effectiveInMinutes: 2 } as const;

/**
 * User story 18366: Policy Benefit Resets. The administrator is the System
 * Administrator. Resets that must succeed claim an Active seed (a period that
 * started on an earlier day); the screen and validation cases use the case's
 * own policy brought into force (data/policy/benefitResets.data.ts).
 */
test.describe('US 18366 - Policy Benefit Resets', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.resetSucceeds.azureId}: should reset a policy's benefits to a fresh period and log the reset as Success`, async ({
    page,
    policyManagementPage,
    policyBenefitResetsPage,
    policyIn,
    steps,
  }) => {
    const data = CASES.resetSucceeds;
    const policy = await policyIn('Active');
    let drawer!: PolicyResetDrawer;

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open Policy Benefit Resets - the screen shows the Policies in force and Reset History tabs', async () => {
      await policyBenefitResetsPage.open();
      const text = await policyBenefitResetsPage.getText();
      expect(text).toContain(LABEL.resetTabs.policies);
      expect(text).toContain(LABEL.resetTabs.history);
    });

    await steps.critical(`Locate ${policy.policyNumber} in Policies in force and select Reset Now - the Reset form shows the message, used amounts, Reason, upload and terms`, async () => {
      await policyBenefitResetsPage.search(policy.policyNumber);
      drawer = await policyBenefitResetsPage.openReset(policy.id);
      expect(await drawer.getNotice()).toContain(policy.policyNumber);
      expect(await drawer.getUsed()).not.toBe('');
      expect(await drawer.getText()).toMatch(FORM_PARTS);
      expect(Object.values(await drawer.getTermPlaceholders()).every((p) => p !== '')).toBe(true);
    });

    await steps.step(`Enter the reason "${data.reason}" and submit - a confirmation is shown and the reset is processed`, async () => {
      await drawer.typeReason(data.reason);
      const answer = await drawer.attemptReset();
      expect(answer.status, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBe(200);
      expect(answer.messages.join(' | ')).toContain(TOAST_TEXT.resetDone.title);
    });

    await steps.step('Reopen Policies in force - the period and Benefit used reflect a fresh period, and Reset History lists a Success entry', async () => {
      await policyBenefitResetsPage.open();
      await policyBenefitResetsPage.search(policy.policyNumber);
      const row = await policyBenefitResetsPage.readRow(policy.id);
      expect(row, 'the policy in force').toBeDefined();
      expect(row!.period.startsWith(todayText()), `period "${row!.period}"`).toBe(true);
      expect(row!.used).not.toMatch(/SAR [1-9][\d,]*\.\d\d \//);
      await policyBenefitResetsPage.openTab('history');
      await searchResetHistory(page, policy.policyNumber);
      const entries = (await readResetHistory(page)).filter((e) => e.text.includes(policy.policyNumber));
      expect(entries.length, 'a Reset history entry').toBeGreaterThan(0);
      expect(entries.some((e) => /Success/i.test(e.status)), JSON.stringify(entries)).toBe(true);
    });
  });

  for (const [key, by] of [['searchByNumber', 'number'], ['searchByName', 'name']] as const) {
    const data = CASES[key];
    test(`TC-${data.azureId}: should show only the policy matching its ${by === 'number' ? 'policy number' : 'policy name'} in Policies in force`, async ({
      page,
      policyManagementPage,
      policyBenefitResetsPage,
      policyIn,
      steps,
    }) => {
      const policy = await policyIn('Future', IN_FORCE_SOON);
      const term = by === 'number' ? policy.policyNumber : policy.nameEn;

      await steps.critical('Precondition: the policy is in force', async () => {
        expect((await waitUntilInForce(page, policy)).policyId).toBe(policy.id);
      });

      await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
        await policyManagementPage.openTable();
        expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
      });

      await steps.critical('Open Policy Benefit Resets - the Policies in force tab loads with the policy list', async () => {
        await policyBenefitResetsPage.open();
        await expect.poll(async () => (await policyBenefitResetsPage.readRows()).length, { message: 'rows in Policies in force' }).toBeGreaterThan(0);
      });

      await steps.step(`Enter "${term}" into the search field - the list filters as the text is typed`, async () => {
        const asTyped = await typeInForceSearch(page, BENEFIT_RESETS.policiesSearch, term);
        await expect.poll(() => policyBenefitResetsPage.isListed(policy.id), { message: `${policy.policyNumber} listed after the search` }).toBe(true);
        expect(asTyped, 'the list answered the typed text without Enter').toBe(true);
      });

      await steps.step('Review the filtered result - only the matching policy is displayed', async () => {
        expect((await policyBenefitResetsPage.readRows()).map((r) => r.policyId)).toEqual([policy.id]);
      });
    });
  }

  test(`TC-${CASES.searchNoMatch.azureId}: should show an empty list with a "no matching policies" message for an unknown policy`, async ({
    page,
    policyManagementPage,
    policyBenefitResetsPage,
    steps,
  }) => {
    const data = CASES.searchNoMatch;

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.countRows()).toBeGreaterThan(0);
    });

    await steps.critical('Open Policy Benefit Resets - the Policies in force tab loads', async () => {
      await policyBenefitResetsPage.open();
      expect(await policyBenefitResetsPage.getText()).toContain(LABEL.resetTabs.policies);
    });

    await steps.step(`Enter the non-existent policy number "${data.term}" - the list filters`, async () => {
      await typeInForceSearch(page, BENEFIT_RESETS.policiesSearch, data.term);
      expect(await policyBenefitResetsPage.readRows()).toEqual([]);
    });

    await steps.step('Review the results - an empty list with a "no matching policies found" message is shown', async () => {
      // The empty state's own text first (2026-11-04), so a failure names what the list said.
      const empty = await policyBenefitResetsPage.getInForceEmptyText();
      expect(empty || await policyBenefitResetsPage.getText(), `the empty list's message ("${empty}")`).toMatch(data.message);
    });
  });

  test(`TC-${CASES.columns.azureId}: should show every required column of Policies in force, populated with the policy's data`, async ({
    page,
    policyManagementPage,
    policyBenefitResetsPage,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('Future', { ...IN_FORCE_SOON, type: 'individual' });

    await steps.critical('Precondition: the policy is in force', async () => {
      expect((await waitUntilInForce(page, policy)).policyId).toBe(policy.id);
    });

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open Policy Benefit Resets - the Policies in force tab loads', async () => {
      await policyBenefitResetsPage.open();
      await policyBenefitResetsPage.search(policy.policyNumber);
      expect(await policyBenefitResetsPage.isListed(policy.id)).toBe(true);
    });

    await steps.step(`Review the columns against ${CASES.columns.headers.join(', ')} - each is present and populated with the correct data`, async () => {
      // The row's data first, the header labels last (2026-11-04): the missing "Action"
      // header stopped the step before the data was checked on 2026-11-03.
      const row = await policyBenefitResetsPage.readRow(policy.id);
      const stored = (await policiesInForce(page, policy.policyNumber)).find((p) => p.policyId === policy.id);
      expect(row && row.text.includes(policy.policyNumber) && row.period && row.nextReset && row.used && row.resetOffered, JSON.stringify(row)).toBeTruthy();
      expect(row!.members).toBe(String(stored?.membersCount));
      expect(await policyBenefitResetsPage.getHeaders(), 'the column headers').toEqual([...CASES.columns.headers]);
    });
  });

  test(`TC-${CASES.noResetsYet.azureId}: should show "No resets have been recorded yet" for a policy that was never reset`, async ({
    page,
    policyManagementPage,
    policyBenefitResetsPage,
    policyIn,
    steps,
  }) => {
    const data = CASES.noResetsYet;
    const policy = await policyIn('Future');

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open Policy Benefit Resets - the screen loads', async () => {
      await policyBenefitResetsPage.open();
      expect(await policyBenefitResetsPage.getText()).toContain(LABEL.resetTabs.history);
    });

    await steps.critical('Select the Reset History tab - the tab loads', async () => {
      await policyBenefitResetsPage.openTab('history');
      // The tab's search box and its list (rows or the empty state) - read from the screen
      // root since 2026-11-04 (writerCIds RESET_HISTORY).
      await expect(page.locator(`#${RESET_HISTORY.search}`), 'the Reset history search').toBeVisible();
      expect(await readResetHistoryText(page)).toContain(LABEL.resetTabs.history);
    });

    await steps.step(`Search for the policy that was never reset (${policy.policyNumber}) - the list is filtered to that policy`, async () => {
      await searchResetHistory(page, policy.policyNumber);
      expect((await readResetHistory(page)).filter((e) => !e.text.includes(policy.policyNumber))).toEqual([]);
    });

    await steps.step(`Review the tab - "${data.message}" is displayed in place of a table`, async () => {
      expect(await readResetHistory(page)).toEqual([]);
      expect(await readResetHistoryText(page)).toContain(data.message);
    });
  });

  test(`TC-${CASES.reasonRequired.azureId}: should block a reset submitted without a reason`, async ({
    page,
    policyManagementPage,
    policyBenefitResetsPage,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('Future', IN_FORCE_SOON);
    let drawer!: PolicyResetDrawer;

    await steps.critical('Precondition: the policy is in force', async () => {
      expect((await waitUntilInForce(page, policy)).policyId).toBe(policy.id);
    });

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open Policy Benefit Resets - the screen loads', async () => {
      await policyBenefitResetsPage.open();
      await policyBenefitResetsPage.search(policy.policyNumber);
      expect(await policyBenefitResetsPage.isListed(policy.id)).toBe(true);
    });

    await steps.critical('Select Reset Now on the policy - the Reset form opens', async () => {
      drawer = await policyBenefitResetsPage.openReset(policy.id);
      expect(await drawer.getText()).toMatch(FORM_PARTS);
    });

    await steps.step('Leave the Reason empty and submit - the submission is blocked and a required-field message shows next to Reason', async () => {
      const answer = await drawer.attemptReset();
      expect(answer.status, 'no reset request sent').toBe(-1);
      expect(await drawer.getReasonError()).toBe(FIELD_MESSAGE.required);
    });
  });

  test(`TC-${CASES.reasonMaxLength.azureId}: should accept a reason of exactly 1000 characters and save it in full`, async ({
    policyManagementPage,
    policyBenefitResetsPage,
    policyIn,
    steps,
  }) => {
    const data = CASES.reasonMaxLength;
    const policy = await policyIn('Active');
    const reason = textOfLength(data.length);
    let drawer!: PolicyResetDrawer;

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open Policy Benefit Resets - the screen loads', async () => {
      await policyBenefitResetsPage.open();
      await policyBenefitResetsPage.search(policy.policyNumber);
      expect(await policyBenefitResetsPage.isListed(policy.id)).toBe(true);
    });

    await steps.critical('Select Reset Now on the policy - the Reset form opens', async () => {
      drawer = await policyBenefitResetsPage.openReset(policy.id);
      expect(await drawer.getText()).toMatch(FORM_PARTS);
    });

    await steps.step(`Enter a reason of exactly ${data.length} characters and submit - the input is accepted and the reset submitted`, async () => {
      await drawer.typeReason(reason);
      const answer = await drawer.attemptReset();
      expect(answer.status, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBe(200);
      expect(String(answer.body?.reason ?? '').length, 'the reason sent in full').toBe(data.length);
    });
  });

  test(`TC-${CASES.reasonTooLong.azureId}: should stop a reason longer than 1000 characters`, async ({
    page,
    policyManagementPage,
    policyBenefitResetsPage,
    policyIn,
    steps,
  }) => {
    const data = CASES.reasonTooLong;
    const policy = await policyIn('Future', IN_FORCE_SOON);
    let drawer!: PolicyResetDrawer;

    await steps.critical('Precondition: the policy is in force', async () => {
      expect((await waitUntilInForce(page, policy)).policyId).toBe(policy.id);
    });

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open Policy Benefit Resets - the screen loads', async () => {
      await policyBenefitResetsPage.open();
      await policyBenefitResetsPage.search(policy.policyNumber);
      expect(await policyBenefitResetsPage.isListed(policy.id)).toBe(true);
    });

    await steps.critical('Select Reset Now on the policy - the Reset form opens', async () => {
      drawer = await policyBenefitResetsPage.openReset(policy.id);
      expect(await drawer.getText()).toMatch(FORM_PARTS);
    });

    await steps.step(`Enter a reason of ${data.length} characters and attempt to submit - typing stops at ${data.max} or a maximum-length error is shown`, async () => {
      await drawer.typeReason(textOfLength(data.length));
      const kept = (await resetReasonValue(page)).length;
      const answer = await drawer.attemptReset();
      const sent = String(answer.body?.reason ?? '').length;
      expect(sent, 'a reason longer than the maximum was sent').toBeLessThanOrEqual(data.max);
      expect(kept <= data.max || answer.messages.includes(FIELD_MESSAGE.resetReasonTooLong), `kept ${kept} characters; shown: ${answer.messages.join(' | ')}`).toBe(true);
    });
  });

  test(`TC-${CASES.pdf10Mb.azureId}: should accept a 10 MB PDF contract and complete the reset`, async ({
    policyManagementPage,
    policyBenefitResetsPage,
    policyIn,
    steps,
  }) => {
    const data = CASES.pdf10Mb;
    const policy = await policyIn('Active');
    let drawer!: PolicyResetDrawer;

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open Policy Benefit Resets - the screen loads', async () => {
      await policyBenefitResetsPage.open();
      await policyBenefitResetsPage.search(policy.policyNumber);
      expect(await policyBenefitResetsPage.isListed(policy.id)).toBe(true);
    });

    await steps.critical('Select Reset Now on the policy - the Reset form opens', async () => {
      drawer = await policyBenefitResetsPage.openReset(policy.id);
      expect(await drawer.getText()).toMatch(FORM_PARTS);
    });

    await steps.step('Upload a valid 10 MB PDF, enter a reason and submit - the file uploads and the reset completes', async () => {
      await drawer.attach(pdfOfSize(data.bytes, data.name));
      await drawer.typeReason(data.reason);
      const answer = await drawer.attemptReset();
      expect(answer.status, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBe(200);
      expect(answer.body?.attachmentFileName, 'the contract attached to the reset').toBe(data.name);
      expect(String(answer.body?.attachmentUri ?? '')).not.toBe('');
    });
  });

  for (const [key, file, label] of [
    ['pdfTooLarge', () => pdfOfSize(CASES.pdfTooLarge.bytes, CASES.pdfTooLarge.name), 'a PDF larger than 10 MB'],
    ['wrongFormat', () => docxFile(), 'a non-PDF file (.docx)'],
  ] as const) {
    const data = CASES[key];
    test(`TC-${data.azureId}: should reject ${label} as the new contract`, async ({
      page,
      policyManagementPage,
      policyBenefitResetsPage,
      policyIn,
      steps,
    }) => {
      const policy = await policyIn('Future', IN_FORCE_SOON);
      let drawer!: PolicyResetDrawer;

      await steps.critical('Precondition: the policy is in force', async () => {
        expect((await waitUntilInForce(page, policy)).policyId).toBe(policy.id);
      });

      await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
        await policyManagementPage.openTable();
        expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
      });

      await steps.critical('Open Policy Benefit Resets - the screen loads', async () => {
        await policyBenefitResetsPage.open();
        await policyBenefitResetsPage.search(policy.policyNumber);
        expect(await policyBenefitResetsPage.isListed(policy.id)).toBe(true);
      });

      await steps.critical('Select Reset Now on the policy - the Reset form opens', async () => {
        drawer = await policyBenefitResetsPage.openReset(policy.id);
        expect(await drawer.getText()).toMatch(FORM_PARTS);
      });

      await steps.step(`Attempt to upload ${label} - the upload is rejected with a message ${key === 'pdfTooLarge' ? 'naming the 10 MB limit' : 'that only PDF files are accepted'}`, async () => {
        await drawer.attach(file());
        const messages = (await resetDrawerMessages(page)).join(' | ');
        expect(messages).toMatch(data.message);
      });
    });
  }

  test(`TC-${CASES.blankTerms.azureId}: should keep the policy's own terms when the term fields are left blank`, async ({
    page,
    policyManagementPage,
    policyBenefitResetsPage,
    policyIn,
    requireBaseline,
    steps,
  }) => {
    const data = CASES.blankTerms;
    const policy = await policyIn('Active');
    let drawer!: PolicyResetDrawer;
    let before!: Awaited<ReturnType<typeof readPolicy>>;

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      before = await readPolicy(page, policy.id);
      requirePeriodNotStartingToday(before, requireBaseline);
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open Policy Benefit Resets - the screen loads', async () => {
      await policyBenefitResetsPage.open();
      await policyBenefitResetsPage.search(policy.policyNumber);
      expect(await policyBenefitResetsPage.isListed(policy.id)).toBe(true);
    });

    await steps.critical('Select Reset Now on the policy - the form shows placeholders for Deductible, Coinsurance %, Out-of-pocket maximum and Sublimit', async () => {
      drawer = await policyBenefitResetsPage.openReset(policy.id);
      const placeholders = await drawer.getTermPlaceholders();
      expect(Object.values(placeholders).every((p) => p !== ''), JSON.stringify(placeholders)).toBe(true);
    });

    await steps.step('Leave every term empty, enter a reason and submit - the reset is submitted', async () => {
      await drawer.typeReason(data.reason);
      const answer = await drawer.attemptReset();
      expect(answer.status, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBe(200);
    });

    await steps.step('Review the policy after the reset - its own Deductible, Coinsurance %, Out-of-pocket maximum and Sublimit remain in effect', async () => {
      const after = await readPolicy(page, policy.id);
      expect({ d: after.deductibleAmount, c: after.coinsurancePercent, o: after.outOfPocketMaximum, s: after.sublimitAmount })
        .toEqual({ d: before.deductibleAmount, c: before.coinsurancePercent, o: before.outOfPocketMaximum, s: before.sublimitAmount });
      expect(after.benefitYear.termsOverridden, 'no override').toBe(false);
    });
  });

  test(`TC-${CASES.zeroSublimit.azureId}: should remove the sublimit term for the rest of the benefit year when 0 is entered`, async ({
    page,
    policyManagementPage,
    policyBenefitResetsPage,
    policyIn,
    requireBaseline,
    steps,
  }) => {
    const data = CASES.zeroSublimit;
    const policy = await policyIn('Active');
    let drawer!: PolicyResetDrawer;

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      requirePeriodNotStartingToday(await readPolicy(page, policy.id), requireBaseline);
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open Policy Benefit Resets - the screen loads', async () => {
      await policyBenefitResetsPage.open();
      await policyBenefitResetsPage.search(policy.policyNumber);
      expect(await policyBenefitResetsPage.isListed(policy.id)).toBe(true);
    });

    await steps.critical('Select Reset Now on the policy - the Reset form opens', async () => {
      drawer = await policyBenefitResetsPage.openReset(policy.id);
      expect(await drawer.getText()).toMatch(FORM_PARTS);
    });

    await steps.step(`Enter ${data.sublimit} in Sublimit, enter a reason and submit - the reset is submitted`, async () => {
      await drawer.typeTerm('sublimit', data.sublimit);
      await drawer.typeReason(data.reason);
      const answer = await drawer.attemptReset();
      expect(answer.status, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBe(200);
      expect(answer.body?.sublimitAmount).toBe(0);
    });

    await steps.step('Review the policy after the reset - the Sublimit term shows as not applicable until the benefit year ends', async () => {
      await policyBenefitResetsPage.open();
      await policyBenefitResetsPage.search(policy.policyNumber);
      const row = await policyBenefitResetsPage.readRow(policy.id);
      expect(row?.used ?? '').toMatch(/Sublimit:[^:]*\/\s*(—|-|None|N\/A)/i);
      expect((await readPolicy(page, policy.id)).benefitYear.termsOverridden, 'the policy reads overridden').toBe(true);
    });
  });

  test(`TC-${CASES.negativeAmount.azureId}: should block a negative amount for a benefit term`, async ({
    page,
    policyManagementPage,
    policyBenefitResetsPage,
    policyIn,
    steps,
  }) => {
    const data = CASES.negativeAmount;
    const policy = await policyIn('Future', IN_FORCE_SOON);
    let drawer!: PolicyResetDrawer;

    await steps.critical('Precondition: the policy is in force', async () => {
      expect((await waitUntilInForce(page, policy)).policyId).toBe(policy.id);
    });

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open Policy Benefit Resets - the screen loads', async () => {
      await policyBenefitResetsPage.open();
      await policyBenefitResetsPage.search(policy.policyNumber);
      expect(await policyBenefitResetsPage.isListed(policy.id)).toBe(true);
    });

    await steps.critical('Select Reset Now on the policy - the Reset form opens', async () => {
      drawer = await policyBenefitResetsPage.openReset(policy.id);
      expect(await drawer.getText()).toMatch(FORM_PARTS);
    });

    await steps.step(`Enter ${data.deductible} in Deductible, enter a reason and attempt to submit - the submission is blocked with a whole, non-negative amount message`, async () => {
      await drawer.typeTerm('deductible', data.deductible);
      await drawer.typeReason(data.reason);
      const typed = await resetTermValue(page, 'deductible');
      const answer = await drawer.attemptReset();
      const sent = answer.body?.deductibleAmount;
      expect(typeof sent === 'number' && sent < 0, `a negative deductible was sent (${String(sent)}); the field held "${typed}"`).toBe(false);
      // A field that refuses the minus sign IS the prevention (house rule, as in the
      // Formulary suite; 2026-11-04): on 2026-11-03 it held "500" for "-500" and the
      // only message was the same-day 409. The message is owed only when the field
      // takes the negative value.
      if (typed.includes('-')) expect(answer.messages.join(' | '), `the field held "${typed}"`).toMatch(data.message);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
