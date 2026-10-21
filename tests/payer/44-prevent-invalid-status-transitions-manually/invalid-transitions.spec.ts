import { test, expect } from '../../../fixtures';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import {
  ALLOWED_TRANSITIONS,
  EXPIRY_GUARDRAIL_MESSAGE,
  INVALID_TRANSITIONS,
  UNREACHABLE_MATRIX_STATUSES,
} from '../../../data/payers/lifecycleGuardrails.data';
import { DateUtils } from '../../../utils/DateUtils';
import type { ShapedSession } from '../../../fixtures/shapedNonAdmin.fixture';
import { NON_ADMIN_PROFILE } from '../../../data/accounts/nonAdminAccount.data';
import { PRIMARY_REASON } from '../../../data/payers/inactivationDecisions.data';

/**
 * User story: Prevent Invalid Status Transitions Manually.
 *
 * MOST OF THIS STORY IS ALREADY AUTOMATED by the activation-guardrails story,
 * which owns the expiry boundaries that block a reactivation, the refusal
 * wording in both languages, the decision table of status against target
 * transition, the direct-API bypass attempt and the access-control refusal.
 * Those are not repeated - the traceability matrix maps each one.
 *
 * FOUR CASES ARE LEFT, and two of them report BLOCKED for a reason worth
 * stating plainly rather than working around: this environment cannot produce a
 * payer in the states they need.
 *
 *   AN EXPIRED PAYER cannot be manufactured. The expiry-date story pins expiry
 *   to today or later, so a payer created here is never expired. Expired payers
 *   do exist in the environment, but they are shared records - extending one's
 *   expiry to watch a transition unblock would take that payer's state away from
 *   every other case that samples it, which is a mistake this suite has made
 *   once already and will not repeat.
 *
 *   A PENDING PAYER cannot be produced either: reaching Pending needs an
 *   approved payer whose effective date has not arrived AND the scheduled job
 *   that later moves it to Active - the job this batch agreed to test manually.
 *
 * Both name the remedy, so they begin running the moment a disposable expired
 * payer or a seeded Pending payer exists.
 */
/** The first `id` found in a lookup response, whatever its envelope - '' when none. */
function firstId(body: unknown): string {
  if (Array.isArray(body)) {
    for (const item of body) { const id = firstId(item); if (id) return id; }
    return '';
  }
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    if (typeof record.id === 'string' && record.id) return record.id;
    for (const value of Object.values(record)) { const id = firstId(value); if (id) return id; }
  }
  return '';
}

/**
 * The calendar day of a date field as YYYY-MM-DD, whichever way it is shown:
 * the wizard uses DD/MM/YYYY (with a time since the 12 Oct build), the details
 * page YYYY-MM-DD.
 */
const dayOf = (value: string): string => {
  const dmy = value.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return (value.match(/\d{4}-\d{2}-\d{2}/) ?? [value.trim()])[0];
};

test.describe('Prevent invalid status transitions', () => {
  // Azure test case 14913
  test('14913: should carry a payer through Active, Inactive and back with every step persisted', async ({
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    // Two full lifecycle changes, each through approval.
    test.slow();

    await steps.critical('Navigate to the module with an Active payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });

    await steps.step('Active to Inactive is permitted and takes effect', async () => {
      await payerManagementPage.inactivateRow(publishedPayer.nameEn);
      await payerInactivateDialog.selectReason(PRIMARY_REASON);
      await payerInactivateDialog.confirm();
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.approve(publishedPayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.inactive.en,
      );
    });

    await steps.step('Inactive back to Active is permitted while the expiry is valid', async () => {
      const prompt = await payerManagementPage.openActivationPrompt(publishedPayer.nameEn);
      await prompt.confirm();
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.approve(publishedPayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });

    await steps.step('And every transition survives a reload', async () => {
      // The sheet's last step, and the one that separates a status that was
      // really persisted from one the screen was merely showing.
      await payerManagementPage.reload();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.openAuditHistory();
      const entries = await detail.getAuditEntryTexts();
      expect(
        entries.length,
        'both transitions should be on the record, not just the latest',
      ).toBeGreaterThanOrEqual(2);
    });
  });

  // Azure test case 14914
  //
  // STEPS UPDATED 2026-10-18 (QA lead): an Expired payer is brought back by
  // EDITING the form and extending its expiry date - not by the Activate
  // action, which stays withheld. Runs on its own seeded payer
  // ("expired-extend-activate", npm run seed:status), which it consumes; until
  // that payer's expiry has passed the case reports BLOCKED with the date.
  test('14914: should permit a reactivation once a lapsed expiry date is extended', async ({
    payerManagementPage,
    approvalManagementPage,
    statusSeed,
    steps,
  }) => {
    test.slow();
    const key = 'expired-extend-activate';
    const extended = DateUtils.futureDate(30);
    let name = '';

    await steps.critical('Navigate to the module and open the Expired payer', async () => {
      const blocked = statusSeed.blockedReason(key);
      if (blocked) steps.blocked(blocked);
      name = statusSeed.find(key)!.nameEn;
      await payerManagementPage.open();
      await payerManagementPage.search(name);
      await payerManagementPage.expectLifecycleStatus(name, LIFECYCLE_STATUS.expired.en);
    });

    await steps.step('Activate is withheld and says the expiry date must be extended first', async () => {
      await payerManagementPage.expectRowActionUnavailable(name, 'activate');
      expect(await payerManagementPage.getRowActionMessage(name, 'activate')).toBe(EXPIRY_GUARDRAIL_MESSAGE.en);
      await payerManagementPage.expectLifecycleStatus(name, LIFECYCLE_STATUS.expired.en);
    });

    await steps.critical(`Edit the payer, extend the Expiry Date to ${extended}, save and have it approved`, async () => {
      await payerManagementPage.open();
      const form = await payerManagementPage.openEditForm(name);
      await form.goToStep('Effective Period');
      await form.fillDateField('Expiry Date', extended);
      await form.save();
      await form.waitForClosed();
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(name);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(name);
      await approvalManagementPage.approve(name);
    });

    await steps.step('The payer is Active again, with the extended expiry date', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(name);
      await payerManagementPage.expectLifecycleStatus(name, LIFECYCLE_STATUS.active.en);
      const detail = await payerManagementPage.openDetails(name);
      await detail.waitForLoaded();
      expect(dayOf(await detail.getFieldValue('Expiry Date'))).toBe(dayOf(extended));
    });
  });
});

/**
 * The expiry date as the gate on a reactivation, the matrix as a whole, and the
 * two ways an invalid move can be attempted - through the screen and around it.
 *
 * WHAT RUNS AND WHAT DOES NOT follows one line: an EXPIRED payer cannot be made
 * here, for the reason the preamble gives. Every case whose starting state is
 * Expired reports BLOCKED and names the remedy; every case that starts from
 * Active or Inactive runs, including both sides of the expiry boundary that
 * this environment can actually reach.
 */
test.describe('Prevent invalid status transitions - the expiry gate', () => {
  // Azure test case 14904
  test('14904: should permit a reactivation while the expiry date is still in the future', async ({
    payerManagementPage,
    approvalManagementPage,
    inactivePayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Confirm the payer is Inactive and its expiry has not passed', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        inactivePayer.nameEn,
        LIFECYCLE_STATUS.inactive.en,
      );
      const detail = await payerManagementPage.openDetails(inactivePayer.nameEn);
      await detail.waitForLoaded();
      const expiry = await detail.getFieldValue('Expiry Date');
      expect(
        // dayOf reads both formats: the details page shows YYYY-MM-DD, the
        // wizard DD/MM/YYYY (toIsoDate accepted only the latter).
        Date.parse(dayOf(expiry)),
        `this case only means anything on a payer inside its window; the expiry read "${expiry}"`,
      ).toBeGreaterThan(Date.parse(dayOf(DateUtils.todayFormatted())));
      await payerManagementPage.open();
    });

    // The permissive half of the guardrail. The activation-guardrails story
    // proves an expired payer is refused; without this, an application that
    // refused EVERY reactivation would satisfy it just as well.
    await steps.step('The Activate action is offered', async () => {
      const actions = await payerManagementPage.getEnabledRowActions(inactivePayer.nameEn, [
        'activate',
      ]);
      expect(actions, 'a payer inside its window must offer a route back to Active').toEqual([
        'activate',
      ]);
    });

    await steps.step('And the reactivation completes through approval', async () => {
      const prompt = await payerManagementPage.openActivationPrompt(inactivePayer.nameEn);
      await prompt.confirm();
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(inactivePayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(inactivePayer.nameEn);
      await approvalManagementPage.approve(inactivePayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        inactivePayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });
  });

  // Azure test case 14906
  test('14906: should still permit the reactivation on the expiry date itself', async ({
    payerManagementPage,
    approvalManagementPage,
    inactivePayer,
    steps,
  }) => {
    // Four maker-checker round trips: the fixture's two, the expiry edit, and
    // the reactivation.
    test.slow();

    const today = DateUtils.todayFormatted();

    await steps.critical(`Move the Inactive payer's expiry to today (${today})`, async () => {
      await payerManagementPage.open();
      const form = await payerManagementPage.openEditForm(inactivePayer.nameEn);
      await form.goToStep('Effective Period');
      await form.fillDateField('Expiry Date', today);
      await form.save();
      await form.waitForClosed();
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(inactivePayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(inactivePayer.nameEn);
      await approvalManagementPage.approve(inactivePayer.nameEn);
    });

    // The boundary itself. "Expiry date cannot be EARLIER than today" is the
    // rule the wizard states, so today is inside the window - a payer that went
    // Expired on its own expiry date would be off by one day, and every payer
    // in the register would lose its last day of service.
    await steps.step('On its expiry date the payer is still Inactive, not Expired', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      const shown = await payerManagementPage.getLifecycleStatus(inactivePayer.nameEn);
      expect(
        shown,
        `with an expiry of ${today}, the payer is inside its window on its last day; it read "${shown}"`,
      ).toContain(LIFECYCLE_STATUS.inactive.en);
    });

    await steps.step('The Activate action is offered on the boundary date', async () => {
      const actions = await payerManagementPage.getEnabledRowActions(inactivePayer.nameEn, [
        'activate',
      ]);
      expect(
        actions,
        `a payer expiring today is still inside its window and must offer reactivation`,
      ).toEqual(['activate']);
    });

    await steps.step('And the reactivation completes', async () => {
      const prompt = await payerManagementPage.openActivationPrompt(inactivePayer.nameEn);
      await prompt.confirm();
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(inactivePayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(inactivePayer.nameEn);
      await approvalManagementPage.approve(inactivePayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        inactivePayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });
  });

  // STEPS UPDATED 2026-10-18 (QA lead): reactivating a payer whose expiry has
  // passed is done by EDITING the form and extending the date; the Activate
  // action itself stays withheld with the expiry message. These four run on
  // payers seeded by "npm run seed:status" (expiry = the seed day), so they
  // report BLOCKED with the date to come back on until the expiry has passed.
  // 14905 and 14907 only read their payer; 14919 only reads; 14923 consumes
  // its own row.

  // Azure test cases 14905 and 14907
  for (const [azureId, what, firstDayOnly] of [
    ['14905', 'block a reactivation once the expiry date has passed', false],
    ['14907', 'block the reactivation one day after the expiry date passes', true],
  ] as const) {
    test(`${azureId}: should ${what}`, async ({ payerManagementPage, statusSeed, steps }) => {
      const key = 'inactive-expiry-passed';
      let name = '';
      let statusBefore = '';

      await steps.critical('Navigate to the module and open the Inactive payer whose expiry has passed', async () => {
        const blocked = statusSeed.blockedReason(key);
        if (blocked) steps.blocked(blocked);
        const row = statusSeed.find(key)!;
        // The boundary case means "the FIRST day after expiry"; read on a
        // later day it would be the same check as 14905, so it says so.
        if (firstDayOnly && DateUtils.todayFormatted() !== row.lapsesOn) {
          steps.blocked(
            `"${row.nameEn}" expired on ${row.expiryDate}; this boundary case must run on ${row.lapsesOn}, `
              + 'the first day after it. Re-seed (npm run seed:status) and run it the next day.',
          );
        }
        name = row.nameEn;
        await payerManagementPage.open();
        await payerManagementPage.search(name);
        statusBefore = await payerManagementPage.getLifecycleStatus(name);
        expect(statusBefore, `"${name}" was inactivated before its expiry passed`).toMatch(
          new RegExp(`${LIFECYCLE_STATUS.inactive.en}|${LIFECYCLE_STATUS.expired.en}`, 'i'),
        );
      });

      await steps.step('Activate is withheld with a message to extend the expiry date', async () => {
        await payerManagementPage.expectRowActionUnavailable(name, 'activate');
        expect(await payerManagementPage.getRowActionMessage(name, 'activate')).toBe(EXPIRY_GUARDRAIL_MESSAGE.en);
      });

      await steps.step('The status is unchanged', async () => {
        await payerManagementPage.open();
        await payerManagementPage.search(name);
        expect(await payerManagementPage.getLifecycleStatus(name)).toBe(statusBefore);
      });
    });
  }

  // Azure test case 14919
  test('14919: should refuse to activate an Expired payer without first extending its expiry', async ({
    payerManagementPage,
    statusSeed,
    steps,
  }) => {
    const key = 'active-expiry-passed';
    let name = '';

    await steps.critical('Navigate to the module and open the Expired payer', async () => {
      const blocked = statusSeed.blockedReason(key);
      if (blocked) steps.blocked(blocked);
      name = statusSeed.find(key)!.nameEn;
      await payerManagementPage.open();
      await payerManagementPage.search(name);
      await payerManagementPage.expectLifecycleStatus(name, LIFECYCLE_STATUS.expired.en);
    });

    await steps.step('Without touching the expiry date, Activate is withheld', async () => {
      await payerManagementPage.expectRowActionUnavailable(name, 'activate');
    });

    await steps.step('The message says the expiry date must be extended first', async () => {
      expect(await payerManagementPage.getRowActionMessage(name, 'activate')).toBe(EXPIRY_GUARDRAIL_MESSAGE.en);
    });

    await steps.step('The payer is still Expired', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(name);
      await payerManagementPage.expectLifecycleStatus(name, LIFECYCLE_STATUS.expired.en);
    });
  });

  // Azure test case 14923
  test('14923: should show the reactivation flow and the stored state agreeing immediately after an expiry is extended', async ({
    page,
    payerManagementPage,
    approvalManagementPage,
    statusSeed,
    steps,
  }) => {
    test.slow();
    const key = 'expired-extend-recheck';
    const extended = DateUtils.futureDate(30);
    let name = '';

    const expectReactivated = async (where: string) => {
      await payerManagementPage.open();
      await payerManagementPage.search(name);
      const shown = await payerManagementPage.getLifecycleStatus(name);
      expect(shown, `${where}: the list should read ${LIFECYCLE_STATUS.active.en}`).toContain(LIFECYCLE_STATUS.active.en);
      const detail = await payerManagementPage.openDetails(name);
      await detail.waitForLoaded();
      expect(
        dayOf(await detail.getFieldValue('Expiry Date')),
        `${where}: the details page should show the extended expiry`,
      ).toBe(dayOf(extended));
    };

    await steps.critical('Navigate to the module and open the Expired payer', async () => {
      const blocked = statusSeed.blockedReason(key);
      if (blocked) steps.blocked(blocked);
      name = statusSeed.find(key)!.nameEn;
      await payerManagementPage.open();
      await payerManagementPage.search(name);
      await payerManagementPage.expectLifecycleStatus(name, LIFECYCLE_STATUS.expired.en);
    });

    await steps.critical(`Edit the payer, extend the Expiry Date to ${extended} and save`, async () => {
      const form = await payerManagementPage.openEditForm(name);
      await form.goToStep('Effective Period');
      await form.fillDateField('Expiry Date', extended);
      await form.save();
      await form.waitForClosed();
    });

    await steps.critical('Send the change for approval and approve it', async () => {
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(name);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(name);
      await approvalManagementPage.approve(name);
    });

    await steps.step('Straight after: the payer reads Active with the extended expiry', () =>
      expectReactivated('straight after approval'));

    await steps.step('After a page refresh the same state is shown', async () => {
      await page.reload();
      await expectReactivated('after a refresh');
    });

    await steps.step('After going back and forward, and re-opening the record, the same state is shown', async () => {
      await page.goBack().catch(() => undefined);
      await page.goForward().catch(() => undefined);
      await expectReactivated('after back/forward and re-opening');
    });
  });
});

/**
 * The matrix as a whole, and the two routes an invalid move can take.
 */
test.describe('Prevent invalid status transitions - the matrix and its routes', () => {
  // Azure test case 14922
  test('14922: should match the documented transition matrix on every status it can reach', async ({
    payerManagementPage,
    publishedPayer,
    inactivePayer,
    steps,
  }) => {
    test.slow();

    const payerFor: Record<string, string> = {};

    await steps.critical('Take one payer in each reachable status', async () => {
      payerFor.Active = publishedPayer.nameEn;
      payerFor.Inactive = inactivePayer.nameEn;
      await payerManagementPage.open();
      await payerManagementPage.search(payerFor.Active);
      await payerManagementPage.expectLifecycleStatus(payerFor.Active, LIFECYCLE_STATUS.active.en);
      await payerManagementPage.open();
      await payerManagementPage.search(payerFor.Inactive);
      await payerManagementPage.expectLifecycleStatus(
        payerFor.Inactive,
        LIFECYCLE_STATUS.inactive.en,
      );
    });

    // Both halves in one walk. Checking only the refusals would pass against an
    // application that offered no status action at all; checking only what is
    // offered would pass against one that offered everything.
    await steps.step('Every allowed move is offered', async () => {
      const missing: string[] = [];
      for (const row of ALLOWED_TRANSITIONS) {
        await payerManagementPage.open();
        await payerManagementPage.search(payerFor[row.status]);
        const enabled = await payerManagementPage.getEnabledRowActions(payerFor[row.status], [
          row.action,
        ]);
        if (enabled.length === 0) missing.push(`${row.status} -> ${row.action} (${row.why})`);
      }
      expect(
        missing,
        `the matrix allows these and the row did not offer them: ${missing.join('; ')}`,
      ).toEqual([]);
    });

    await steps.step('And every refused move is refused', async () => {
      const reachable = INVALID_TRANSITIONS.filter((row) => row.status !== 'Expired');
      const offered: string[] = [];
      for (const row of reachable) {
        await payerManagementPage.open();
        await payerManagementPage.search(payerFor[row.status]);
        const enabled = await payerManagementPage.getEnabledRowActions(payerFor[row.status], [
          row.action,
        ]);
        if (enabled.length > 0) offered.push(`${row.status} -> ${row.action}`);
      }
      expect(
        offered,
        `the matrix forbids these and the row offered them anyway: ${offered.join('; ')}. `
          + `Note this walk covers Active and Inactive only - Expired (${UNREACHABLE_MATRIX_STATUSES.Expired}) `
          + `and Pending (${UNREACHABLE_MATRIX_STATUSES.Pending}) were not exercised.`,
      ).toEqual([]);
    });
  });

  // Azure test case 14921
  test('14921: should reject an invalid transition sent straight to the API', async ({
    payerManagementPage,
    inactivePayer,
    page,
    steps,
  }) => {
    test.slow();
    let payerId = '';

    await steps.critical('Take the id of a payer that is already Inactive', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        inactivePayer.nameEn,
        LIFECYCLE_STATUS.inactive.en,
      );
      payerId = await payerManagementPage.getPayerId(inactivePayer.nameEn);
      expect(payerId, 'the case needs the payer id to address the endpoint').not.toBe('');
    });

    // THE POINT OF THE CASE: the screen omitting the action is not a rule, it is
    // a convenience. Inactivating an already-Inactive payer is a move the matrix
    // forbids, and the application layer has to forbid it too - otherwise the
    // guardrail lives entirely in the browser and anything else talking to this
    // API can walk straight past it.
    await steps.step('The application layer refuses Inactive -> Inactive', async () => {
      const response = await NetworkUtils.postAsSession(page, ApiEndpoints.payerInactivate, {
        payerId,
        reason: PRIMARY_REASON,
        details: 'Automated invalid-transition probe - expected to be refused.',
      });
      expect(
        response.status < 300,
        `inactivating an already-Inactive payer is not a legal transition and must be refused `
          + `by the API, not only by the screen; the server answered ${response.status} `
          + `("${response.text.slice(0, 200)}")`,
      ).toBe(false);
    });

    await steps.step('And the payer did not move', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        inactivePayer.nameEn,
        LIFECYCLE_STATUS.inactive.en,
      );
    });
  });

  // Azure test case 14929
  test('14929: should refuse a blocked transition with an explanation, not a bare failure', async ({
    payerManagementPage,
    inactivePayer,
    page,
    steps,
  }) => {
    test.slow();
    let payerId = '';

    await steps.critical('Take a payer the matrix forbids this move on', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        inactivePayer.nameEn,
        LIFECYCLE_STATUS.inactive.en,
      );
      payerId = await payerManagementPage.getPayerId(inactivePayer.nameEn);
    });

    // A refusal the user cannot read is barely better than no refusal: it is
    // what turns a clear rule into a support ticket. The wording of the
    // EXPIRED refusals is owned by the activation-guardrails story; what this
    // case adds is that the backend's own validation carries a reason at all,
    // and that the screen does not contradict it.
    await steps.step('The backend refuses it and says why', async () => {
      const response = await NetworkUtils.postAsSession(page, ApiEndpoints.payerInactivate, {
        payerId,
        reason: PRIMARY_REASON,
        details: 'Automated invalid-transition probe - expected to be refused.',
      });
      expect(
        response.status < 300,
        `the transition must be refused; the server answered ${response.status}`,
      ).toBe(false);
      const explanation = response.validationErrors.join(' ').trim() || response.text.trim();
      expect(
        explanation,
        `a refused transition should come back with a reason a user could be shown; the body `
          + `was "${response.text.slice(0, 200)}"`,
      ).not.toBe('');
    });

    await steps.step('And the screen refuses the same move rather than offering it', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      await payerManagementPage.expectRowActionUnavailable(inactivePayer.nameEn, 'inactivate');
    });
  });

  // Azure test case 14926
  test('14926: should withhold both status changes from a role without the right, on a payer where they are valid', async ({
    payerManagementPage,
    shapedNonAdmin,
    steps,
  }) => {
    test.slow();

    const payerName = NON_ADMIN_PROFILE.scopedPayers[0];
    let baseline: string[] = [];
    let session!: ShapedSession;

    // THE CONTROL, and the case is worthless without it. "The action is not
    // there" proves nothing unless the action is there for someone - a payer in
    // the wrong status, or a row that simply renders no actions, would satisfy
    // the second half on its own.
    await steps.critical(`As an administrator, "${payerName}" offers a status change`, async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(payerName);
      await payerManagementPage.waitForRowVisible(payerName);
      baseline = await payerManagementPage.getEnabledRowActions(payerName, [
        'activate',
        'inactivate',
      ]);
      expect(
        baseline.length,
        `the control failed: a full administrator was offered no status change on "${payerName}", `
          + 'so the withholding below would prove nothing. The payer is probably in a status '
          + 'whose transitions are all refused - pick another scoped payer.',
      ).toBeGreaterThan(0);
    });

    await steps.critical('Sign in as a role without the status-change rights', async () => {
      session = await shapedNonAdmin({ without: ['activatePayer', 'inactivatePayer'] });
      await session.payers.navigate();
      await session.payers.expectRowsRendered();
    });

    await steps.step('The same payer offers that role neither change', async () => {
      await session.payers.search(payerName);
      const offered = await session.payers.getEnabledRowActions(payerName, [
        'activate',
        'inactivate',
      ]);
      expect(
        offered,
        `an administrator was offered ${baseline.join(', ')} on "${payerName}"; a role without `
          + `SetPayerActive or InactivatePayer must be offered neither, and was offered `
          + `${offered.join(', ') || 'none'}`,
      ).toEqual([]);
    });
  });
});
