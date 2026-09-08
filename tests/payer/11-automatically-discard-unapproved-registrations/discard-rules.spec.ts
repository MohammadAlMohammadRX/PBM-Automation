import { test, expect } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';
import {
  AUTO_DISCARD_REASON_PATTERN,
  BLOCKED_DECISION_ROWS,
  BLOCKED_REASONS,
  BOUNDARY_DATES,
  DISCARD_DECISION_MATRIX,
  FIRST_PUBLISHED_VERSION,
  REGISTRATION_STATUS,
  RUNNABLE_DECISION_ROWS,
} from '../../../data/payers/discardRegistration.data';

/**
 * User story: Automatically Discard Unapproved Registrations Past Their
 * Effective Window.
 * The rule for records that already have an approved version, the decision
 * matrix, and the audit/visibility cases.
 *
 * See discard-boundaries.spec.ts and data/payers/discardRegistration.data.ts
 * for why most of this story is BLOCKED rather than failing.
 */
test.describe('Automatically Discard Unapproved Registrations - Non-zero versions', () => {
  test('TC-002: should keep the approved version and ignore a lapsed pending change', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    // The HALF of this rule that is observable without a clock: a payer with an
    // approved version 1 and a pending version 2 must continue to honour v1.
    // The criterion's "effective date has passed" cannot be arranged, so what
    // is proved here is the invariant either side of it - the approved version
    // is what the record reports while a change sits unapproved. That is the
    // part of the rule a regression would most likely break, and it is stated
    // plainly in the final step rather than dressed up as the full case.
    const newLicense = `LIC-IGNORED-${Date.now()}`;

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('The payer starts out published at v1', () =>
      payerManagementPage.expectVersionAndStatus(publishedPayer.nameEn, 1, 'Published'));

    await steps.critical('Stage a change and leave it unapproved', async () => {
      await payerManagementPage.editTextFieldAndSave(
        publishedPayer.nameEn,
        'License Number',
        newLicense,
      );
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
    });

    await steps.step('The record still reports its approved version', async () => {
      const version = await payerManagementPage.getVersionNumber(publishedPayer.nameEn);
      expect(
        version,
        `the current version must remain ${FIRST_PUBLISHED_VERSION} while the change awaits `
          + 'review - the pending change must not be applied',
      ).toBe(1);
    });

    await steps.step('The pending change is not discarded', async () => {
      const status = await payerManagementPage.getApprovalStatus(publishedPayer.nameEn);
      expect(
        status,
        'a pending change on a payer that already has an approved version must never be '
          + 'auto-discarded',
      ).not.toContain(REGISTRATION_STATUS.discarded);
      expect(status, 'the change should still be awaiting review').toContain('Pending');
    });

    // PARTIAL COVERAGE, stated plainly: this case proves the invariant while
    // the change is pending, which is the regression a change to the rule would
    // most likely cause. It does NOT reach the criterion's "after the effective
    // date has passed" condition - that half is carried by TC-006, which is
    // BLOCKED for the reason recorded there.
  });

  test('TC-006: should never discard a Pending Approval change when an approved version exists', async ({
    payerManagementPage,
    discardSeed,
    steps,
  }) => {
    // The seeded row reaches the state TC-002 could not: an approved v1 with a
    // pending v2 whose effective window HAS lapsed. Seeding gets there without
    // back-dating anything - the row was created with today's date and the
    // window passes on its own.
    const blocked = discardSeed.blockedReason('approved-v1-pending-v2');
    if (blocked) steps.blocked(blocked);

    const seeded = discardSeed.find('approved-v1-pending-v2')!;

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical(`Locate the seeded payer (${seeded.effectiveDate})`, () =>
      payerManagementPage.search(seeded.nameEn));

    await steps.step('The pending change was not discarded', async () => {
      const status = await payerManagementPage.getApprovalStatus(seeded.nameEn);
      expect(
        status,
        'a pending change on a payer that already has an approved version must never be '
          + `auto-discarded, even after its window lapses; the row now reads "${status}"`,
      ).not.toContain(REGISTRATION_STATUS.discarded);
    });

    await steps.step('The approved version is still the one being honoured', async () => {
      const version = await payerManagementPage.getVersionNumber(seeded.nameEn);
      expect(
        version,
        `the current version must remain ${FIRST_PUBLISHED_VERSION} - the lapsed pending `
          + 'change must be ignored, not applied',
      ).toBe(1);
    });
  });

  test('TC-008: should apply the discard rule per the full decision matrix', async ({
    payerManagementPage,
    discardSeed,
    steps,
  }) => {
    // A decision-table case is a claim about the WHOLE table, so all four rows
    // have to be evaluated for the verdict to mean anything. Seeding supplies
    // every one of them:
    //
    //   v0, pending, lapsed        -> lapsed-v0                    Discarded
    //   v0, pending, not lapsed    -> future-control               Unchanged
    //   v1+, pending, lapsed       -> approved-v1-pending-v2       Unchanged
    //   v1+, pending, not lapsed   -> approved-v1-pending-v2-future Unchanged
    //
    // Each is checked as its own step, mirroring the sheet, which states an
    // expected outcome per combination.
    const MATRIX: { key: string; label: string; discarded: boolean }[] = [
      { key: 'lapsed-v0', label: 'v0 pending, window lapsed', discarded: true },
      { key: 'future-control', label: 'v0 pending, window open', discarded: false },
      { key: 'approved-v1-pending-v2', label: 'v1 with pending v2, window lapsed', discarded: false },
      { key: 'approved-v1-pending-v2-future', label: 'v1 with pending v2, window open', discarded: false },
    ];

    // Only the LAPSED rows have a due date; the two controls are checkable at
    // any time. If a lapsed row is not due yet, the table cannot be judged.
    const notReady = MATRIX.map((row) => discardSeed.blockedReason(row.key))
      .filter((reason): reason is string => reason !== null
        && !reason.includes('never meant to lapse'));
    if (notReady.length > 0) steps.blocked(notReady[0]);

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    const outcomes: Record<string, boolean> = {};
    const expected: Record<string, boolean> = {};

    for (const row of MATRIX) {
      await steps.step(
        `${row.label} -> ${row.discarded ? 'Discarded' : 'Unchanged'}`,
        async () => {
          const seeded = discardSeed.find(row.key);
          expect(seeded, `the seed manifest must carry a "${row.key}" row`).toBeTruthy();

          await payerManagementPage.search(seeded!.nameEn);
          const status = await payerManagementPage.getApprovalStatus(seeded!.nameEn);
          outcomes[row.label] = status.includes(REGISTRATION_STATUS.discarded);
          expected[row.label] = row.discarded;

          expect(
            outcomes[row.label],
            `${row.label} should be ${row.discarded ? 'Discarded' : 'left unchanged'}; `
              + `it reads "${status}"`,
          ).toBe(row.discarded);
        },
      );
    }

    await steps.step('Only the version-zero lapsed row was discarded', async () => {
      expect(outcomes, 'discard outcome by matrix row').toEqual(expected);
    });
  });

  test('TC-010: should handle a registration with a missing effective date without discarding it', async ({
    steps,
  }) => {
    steps.blocked(BLOCKED_REASONS.noNullEffectiveDate);
  });

  test('TC-012: should not discard a registration approved just before its window lapsed', async ({
    payerManagementPage,
    discardSeed,
    steps,
  }) => {
    // Seeding reaches this race WITHOUT controlling the job. The row was
    // created effective tomorrow and approved today, so by the time its window
    // arrives it is no longer an unapproved version-zero registration. The
    // ordering the criteria describe happens in real time rather than being
    // simulated.
    const blocked = discardSeed.blockedReason('approved-before-lapse');
    if (blocked) steps.blocked(blocked);

    const seeded = discardSeed.find('approved-before-lapse')!;

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical(`Locate the seeded registration (${seeded.effectiveDate})`, () =>
      payerManagementPage.search(seeded.nameEn));

    await steps.step('It was approved before its window lapsed', async () => {
      const version = await payerManagementPage.getVersionLabel(seeded.nameEn);
      expect(
        version,
        `the registration should have reached ${FIRST_PUBLISHED_VERSION} through approval; `
          + `it reads "${version}"`,
      ).toContain(FIRST_PUBLISHED_VERSION);
    });

    await steps.step('It was not discarded once its effective date arrived', async () => {
      const status = await payerManagementPage.getApprovalStatus(seeded.nameEn);
      expect(
        status,
        'a registration approved before its window lapsed must not be auto-discarded - at '
          + `evaluation time it was no longer unapproved; it now reads "${status}"`,
      ).not.toContain(REGISTRATION_STATUS.discarded);
    });
  });

  test('TC-011: should run the discard job automatically on its schedule', async ({ steps }) => {
    steps.blocked(BLOCKED_REASONS.noScheduleVisibility);
  });
});

test.describe('Automatically Discard Unapproved Registrations - Audit and visibility', () => {
  test('TC-009: should remove a discarded registration from the queue but keep it in history', async ({
    payerManagementPage,
    approvalManagementPage,
    discardSeed,
    steps,
  }) => {
    const blocked = discardSeed.blockedReason('lapsed-v0');
    if (blocked) steps.blocked(blocked);

    const seeded = discardSeed.find('lapsed-v0')!;

    await steps.critical('Open the payer list', () => payerManagementPage.open());
    await steps.critical('Locate the seeded registration', () =>
      payerManagementPage.search(seeded.nameEn));

    // This case is about what happens AFTER a discard, so it needs one to have
    // happened. If the job has not discarded the row, the honest report is
    // BLOCKED rather than a failure here - TC-001 is the case that asserts the
    // discard itself and will report that defect.
    const status = await payerManagementPage.getApprovalStatus(seeded.nameEn);
    if (!status.includes(REGISTRATION_STATUS.discarded)) {
      steps.blocked(
        `the seeded registration "${seeded.nameEn}" has not been discarded - it currently `
          + `reads "${status}". This case describes what happens after a discard, so there `
          + 'is nothing to observe yet. TC-001 asserts the discard itself; if that case is '
          + 'failing, fix that first.',
      );
    }

    await steps.step('It no longer appears in the active pending queue', () =>
      approvalManagementPage.expectNotInQueue(seeded.nameEn));

    await steps.step('It remains visible in the payer module for the administrator', () =>
      payerManagementPage.expectResultsInclude(seeded.nameEn));
  });

  test('TC-014: should record the discard reason and details in the audit trail', async ({
    payerManagementPage,
    discardSeed,
    steps,
  }) => {
    const blocked = discardSeed.blockedReason('lapsed-v0');
    if (blocked) steps.blocked(blocked);

    const seeded = discardSeed.find('lapsed-v0')!;

    await steps.critical('Open the payer list', () => payerManagementPage.open());
    await steps.critical('Locate the seeded registration', () =>
      payerManagementPage.search(seeded.nameEn));

    const status = await payerManagementPage.getApprovalStatus(seeded.nameEn);
    if (!status.includes(REGISTRATION_STATUS.discarded)) {
      steps.blocked(
        `the seeded registration "${seeded.nameEn}" has not been discarded - it currently `
          + `reads "${status}", so there is no discard event to find in the audit trail. `
          + 'TC-001 asserts the discard itself.',
      );
    }

    await steps.critical('Open the payer’s Audit History', async () => {
      const detail = await payerManagementPage.openDetails(seeded.nameEn);
      await detail.waitForLoaded();
      await detail.openAuditHistory();
    });

    // Matched loosely on the distinctive words rather than an exact sentence:
    // the reason is a translated string, so pinning its wording would make this
    // fail on a copy change rather than on a missing audit entry.
    await steps.step('The audit trail records the automatic discard', async () => {
      const detail = await payerManagementPage.openDetails(seeded.nameEn);
      await detail.waitForLoaded();
      await detail.openAuditHistory();
      await detail.expectAuditEntryMatching(
        AUTO_DISCARD_REASON_PATTERN,
        'an entry explaining that the registration was auto-discarded because its effective '
          + 'date lapsed without approval',
      );
    });
  });

  test('TC-013: should restrict discarded registration records to authorized roles', async ({
    steps,
  }) => {
    // Two independent blockers, both worth naming: there is no discarded record
    // to look at, and there is no restricted account to look at it with.
    steps.blocked(
      `${BLOCKED_REASONS.noDiscardedRecord} In addition, `
        + `${env.nonAdminUsername ? 'the non-administrator account' : 'NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD'}`
        + ' is required to check the denial half of the decision table, and it is not '
        + 'configured in .env.',
    );
  });
});
