import { test, expect } from '../../../fixtures';
import { buildUniquePayer } from '../../../data/payers/payer.data';
import {
  BLOCKED_REASONS,
  BOUNDARY_DATES,
  REGISTRATION_STATUS,
  UNAPPROVED_VERSION,
} from '../../../data/payers/discardRegistration.data';

/**
 * User story: Automatically Discard Unapproved Registrations Past Their
 * Effective Window.
 * The boundary cases either side of the effective window.
 *
 * READ THE HEADER OF data/payers/discardRegistration.data.ts FIRST. This story
 * is enforced by a scheduled back-end job, and most of its cases cannot be
 * exercised from a UI test for three independent reasons found in this build:
 * the application exposes no way to run the job, the server clock cannot be
 * moved, and the wizard will not accept an effective date in the past - which
 * is the precondition most of these cases start from.
 *
 * Those cases are reported BLOCKED with the specific reason and the seed data
 * that would unblock them. BLOCKED, not FAIL: the discard rule was never
 * evaluated, so calling it a failure would assert something about the feature
 * that was never observed. This is the same judgement the framework's own
 * status model was built for - see constants/TestStatus.ts.
 *
 * The cases that ARE real tests here are the negative boundaries: a
 * registration whose effective window has NOT lapsed must be left alone, and
 * "left alone" is observable without any clock or job trigger.
 */
test.describe('Automatically Discard Unapproved Registrations - Boundaries', () => {
  test('TC-004: should not discard a version-zero registration whose effective date is tomorrow', async ({
    payerManagementPage,
    approvalManagementPage,
    cleanup,
    steps,
  }) => {
    // The one boundary row that is fully executable: the precondition is
    // creatable (a future effective date is accepted), and the expected outcome
    // is that NOTHING happens - which needs neither a clock change nor a job
    // run to observe.
    const payer = buildUniquePayer({
      effectiveDate: BOUNDARY_DATES.tomorrow(),
      expiryDate: BOUNDARY_DATES.future(),
    });

    await steps.critical('Create a version-zero registration effective tomorrow', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(payer);
      cleanup.register(async () => {
        await payerManagementPage.open();
        await payerManagementPage.deletePayer(payer.nameEn).catch(() => undefined);
      });
    });

    await steps.critical('Submit it so it sits unapproved in the queue', async () => {
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(payer.nameEn);
    });

    let versionBefore = '';
    await steps.critical('Confirm its starting state', async () => {
      await payerManagementPage.open();
      versionBefore = await payerManagementPage.getVersionLabel(payer.nameEn);
      expect(
        versionBefore,
        `a never-approved registration should be at ${UNAPPROVED_VERSION}`,
      ).toContain(UNAPPROVED_VERSION);
      await payerManagementPage.expectApprovalStatusContains(payer.nameEn, 'Pending');
    });

    // The registration is still queued for review, which is the observable
    // consequence of it NOT having been discarded: a discarded registration
    // leaves the pending queue.
    //
    // The queue is OPENED first. `expectInQueue` searches the queue's own
    // toolbar, which does not exist while the payer list is on screen - without
    // the navigation it fails as a click timeout on a control that was never
    // there, which reads like an application defect and is not one.
    await steps.step('It remains in the approval queue, not discarded', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(payer.nameEn);
    });

    await steps.step('Its status and version are unchanged', async () => {
      await payerManagementPage.open();
      await payerManagementPage.expectApprovalStatusContains(payer.nameEn, 'Pending');
      const versionAfter = await payerManagementPage.getVersionLabel(payer.nameEn);
      expect(
        versionAfter,
        'a registration whose effective window has not lapsed must be left untouched',
      ).toBe(versionBefore);
    });

    await steps.step('It is not reported as Discarded', async () => {
      const status = await payerManagementPage.getApprovalStatus(payer.nameEn);
      expect(
        status,
        `a registration effective ${BOUNDARY_DATES.tomorrow()} must not be discarded today`,
      ).not.toContain(REGISTRATION_STATUS.discarded);
    });
  });

  // ---------------------------------------------------------------------------
  // The cases below run against SEEDED registrations.
  //
  // Each needs a version-zero registration whose effective window has already
  // lapsed - which the wizard cannot create, because it refuses a past
  // effective date. `npm run seed:discard` creates the registrations with dates
  // that lapse naturally over the following days, and these cases pick them up
  // once they have. No clock is faked and nothing is back-dated; real elapsed
  // time does the work.
  //
  // Until a seeded row is available AND its window has passed, each case
  // reports BLOCKED with the date to come back on - see
  // fixtures/discardSeed.fixture.ts. That distinction is deliberate: checking
  // early would report a registration as wrongly kept when it is simply not due.
  // ---------------------------------------------------------------------------

  test('TC-003: should discard a version-zero registration exactly on its effective date', async ({
    payerManagementPage,
    discardSeed,
    steps,
  }) => {
    const blocked = discardSeed.blockedReason('boundary-today');
    if (blocked) steps.blocked(blocked);

    const seeded = discardSeed.find('boundary-today')!;

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical(`Locate the seeded registration (${seeded.effectiveDate})`, () =>
      payerManagementPage.search(seeded.nameEn));

    await steps.step('It is reported as Discarded on its effective date', () =>
      payerManagementPage.expectApprovalStatusContains(
        seeded.nameEn,
        REGISTRATION_STATUS.discarded,
      ));
  });

  test('TC-005: should discard a registration whose effective date is well in the past', async ({
    payerManagementPage,
    discardSeed,
    steps,
  }) => {
    // The same shape as TC-001 but seeded to become checkable several days
    // later, which is what shows the rule is not limited to a same-day lapse.
    const blocked = discardSeed.blockedReason('well-past-v0');
    if (blocked) steps.blocked(blocked);

    const seeded = discardSeed.find('well-past-v0')!;

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical(`Locate the seeded registration (${seeded.effectiveDate})`, () =>
      payerManagementPage.search(seeded.nameEn));

    await steps.step('The overdue registration is Discarded', () =>
      payerManagementPage.expectApprovalStatusContains(
        seeded.nameEn,
        REGISTRATION_STATUS.discarded,
      ));
  });

  test('TC-001: should discard a version-zero Pending registration once its effective date passes', async ({
    payerManagementPage,
    approvalManagementPage,
    discardSeed,
    steps,
  }) => {
    const blocked = discardSeed.blockedReason('lapsed-v0');
    if (blocked) steps.blocked(blocked);

    const seeded = discardSeed.find('lapsed-v0')!;

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical(`Locate the seeded registration (${seeded.effectiveDate})`, () =>
      payerManagementPage.search(seeded.nameEn));

    await steps.step('It is reported as Discarded', () =>
      payerManagementPage.expectApprovalStatusContains(
        seeded.nameEn,
        REGISTRATION_STATUS.discarded,
      ));

    // The second half of the criterion: a discarded registration leaves the
    // pending queue. Listing it as Discarded while still queueing it for review
    // would be half the rule.
    await steps.step('It has left the approval queue', () =>
      approvalManagementPage.expectNotInQueue(seeded.nameEn));
  });

  test('TC-007: should transition a lapsed version-zero registration from Pending to Discarded', async ({
    payerManagementPage,
    discardSeed,
    steps,
  }) => {
    const blocked = discardSeed.blockedReason('lapsed-v0');
    if (blocked) steps.blocked(blocked);

    const seeded = discardSeed.find('lapsed-v0')!;

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical(`Locate the seeded registration (${seeded.effectiveDate})`, () =>
      payerManagementPage.search(seeded.nameEn));

    // The transition is Pending -> Discarded with NO approval in between, so the
    // version must still be zero: a registration that reached v1 was approved,
    // which is a different journey and not the one the criterion describes.
    await steps.step('It never gained a published version', async () => {
      const version = await payerManagementPage.getVersionLabel(seeded.nameEn);
      expect(
        version,
        `a discarded registration must still be at ${UNAPPROVED_VERSION} - reaching v1 would `
          + 'mean it was approved rather than discarded',
      ).toContain(UNAPPROVED_VERSION);
    });

    await steps.step('It reached Discarded without an intermediate approval', () =>
      payerManagementPage.expectApprovalStatusContains(
        seeded.nameEn,
        REGISTRATION_STATUS.discarded,
      ));
  });
});
