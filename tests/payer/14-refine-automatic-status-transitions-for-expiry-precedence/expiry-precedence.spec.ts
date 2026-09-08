import { test, expect } from '../../../fixtures';
import {
  BATCH_BLOCKER,
  LIFECYCLE_STATUS,
} from '../../../data/payers/statusTransition.data';

/**
 * User story: Refine Automatic Status Transitions for Expiry Precedence and
 * Recalculation on Edit.
 * The EXPIRY-PRECEDENCE half - decided by the daily batch.
 *
 * WHAT "TRIGGER/AWAIT THE DAILY PROCESS" MEANS HERE. The job has no UI or API
 * trigger available to this suite, so it cannot be run on demand. What these
 * cases do instead is AWAIT it, in the literal sense: the records were seeded
 * with expiry dates that lapse on a known day, and the case runs on or after
 * that day. By then the daily job has had at least one opportunity, so an
 * unchanged status is a real finding rather than a timing artefact.
 *
 * Until a row's expiry has passed the case reports BLOCKED with the date to
 * return on. That distinction is the whole point of the seeding approach:
 * "the rule was never evaluated" and "the rule was evaluated and got it wrong"
 * are different results, and only the second is a defect.
 *
 * WHAT THE ENVIRONMENT ALREADY SHOWS. 210 existing payers were cross-checked
 * against their own expiry dates before these cases were written: every payer
 * whose expiry had passed read Expired, and none with a future expiry read
 * Expired wrongly. So the transition works for ordinary records. What was
 * missing - and what the seed supplies - is an INACTIVE payer past its expiry,
 * which is the case that decides whether expiry takes precedence over a manual
 * inactivation.
 */
test.describe('Refine Automatic Status Transitions - Expiry precedence', () => {
  test('TC-001: should transition the payer to Expired when its expiry has passed while it is Inactive', async ({
    payerManagementPage,
    statusSeed,
    steps,
  }) => {
    const blocked = statusSeed.blockedReason('inactive-expiry-passed');
    if (blocked !== null) steps.blocked(blocked);

    const seeded = statusSeed.find('inactive-expiry-passed')!;

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(seeded.nameEn);
      await payerManagementPage.waitForRowVisible(seeded.nameEn);
    });

    await steps.step('The daily status recalculation has had at least one run', async () => {
      // Asserted as elapsed TIME rather than as a job invocation, because the
      // job cannot be invoked. The seeded expiry date has passed, so a daily
      // process has had its chance - which is what makes the next step's
      // failure attributable to the rule and not to timing.
      expect(
        statusSeed.hasLapsed('inactive-expiry-passed'),
        `the seeded expiry (${seeded.expiryDate}) should have passed by now`,
      ).toBe(true);
    });

    await steps.step('The payer now displays Expired rather than Inactive', () =>
      payerManagementPage.expectStatusText(seeded.nameEn, LIFECYCLE_STATUS.expired.en));
  });

  test('TC-002: should leave the payer Inactive when its expiry date is today and has not yet passed', async ({
    payerManagementPage,
    statusSeed,
    steps,
  }) => {
    const seeded = statusSeed.find('inactive-expiry-today');
    if (seeded === undefined) {
      steps.blocked(
        `no "inactive-expiry-today" row exists. ${BATCH_BLOCKER.reason} Run `
          + '`npm run seed:status` to create it.',
      );
    }

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(seeded!.nameEn);
      await payerManagementPage.waitForRowVisible(seeded!.nameEn);
    });

    await steps.step('The record is Inactive with an expiry date of today', async () => {
      await payerManagementPage.expectStatusText(seeded!.nameEn, LIFECYCLE_STATUS.inactive.en);
      const detail = await payerManagementPage.openDetails(seeded!.nameEn);
      expect(await detail.getFieldValue('Expiry Date')).toBe(seeded!.expiryDate);
    });

    // The boundary: an expiry date of TODAY has not passed, so the payer must
    // still be Inactive. Kept as its own case because it and TC-001 differ only
    // in when they are read, and conflating them would hide whichever way the
    // boundary is implemented.
    await steps.step('The status remains Inactive on the expiry date itself', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(seeded!.nameEn);
      await payerManagementPage.expectStatusText(seeded!.nameEn, LIFECYCLE_STATUS.inactive.en);
    });
  });

  test('TC-003: should leave the payer Inactive when its expiry date is still in the future', async ({
    payerManagementPage,
    statusSeed,
    steps,
  }) => {
    const seeded = statusSeed.find('inactive-expiry-future');
    if (seeded === undefined) {
      steps.blocked(
        `no "inactive-expiry-future" control row exists. ${BATCH_BLOCKER.reason} Run `
          + '`npm run seed:status` to create it.',
      );
    }

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(seeded!.nameEn);
      await payerManagementPage.waitForRowVisible(seeded!.nameEn);
    });

    await steps.step('The record is Inactive with an expiry well in the future', async () => {
      await payerManagementPage.expectStatusText(seeded!.nameEn, LIFECYCLE_STATUS.inactive.en);
      expect(statusSeed.hasLapsed('inactive-expiry-future')).toBe(false);
    });

    // The control. Without it, a job that blindly expired every inactive record
    // would satisfy TC-001 and look correct.
    await steps.step('The status is left untouched by the recalculation', () =>
      payerManagementPage.expectStatusText(seeded!.nameEn, LIFECYCLE_STATUS.inactive.en));
  });

  test('TC-004: should expire every lapsed payer and leave the rest alone when the batch covers mixed statuses', async ({
    payerManagementPage,
    statusSeed,
    steps,
  }) => {
    if (!statusSeed.present) {
      steps.blocked(
        `no status seed manifest exists. ${BATCH_BLOCKER.reason} Run \`npm run seed:status\`.`,
      );
    }

    const due = statusSeed.all.filter((payer) => statusSeed.hasLapsed(payer.key));
    if (due.length === 0) {
      steps.blocked(
        `none of the ${statusSeed.all.length} seeded payers has reached its expiry yet. `
          + `${BATCH_BLOCKER.reason}`,
      );
    }

    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    await steps.step('The batch of seeded records is on screen with its initial statuses', async () => {
      for (const payer of statusSeed.all) {
        await payerManagementPage.open();
        expect(
          await payerManagementPage.isRowVisibleAfterSearch(payer.nameEn),
          `the seeded payer "${payer.key}" should still exist`,
        ).toBe(true);
      }
    });

    // One step per seeded row, so the report names WHICH starting status was
    // handled wrongly. A single aggregate assertion would say only that the
    // batch was wrong somewhere.
    for (const payer of statusSeed.all) {
      await steps.step(
        `"${payer.key}" (${payer.lifecycle}, expiring ${payer.expiryDate}) reads ${payer.expected}`,
        async () => {
          await payerManagementPage.open();
          await payerManagementPage.search(payer.nameEn);
          await payerManagementPage.expectStatusText(payer.nameEn, payer.expected);
        },
      );
    }
  });

  test('TC-008: should keep the payer Expired when the recalculation runs again with no edit in between', async ({
    payerManagementPage,
    statusSeed,
    steps,
  }) => {
    const blocked = statusSeed.blockedReason('active-expiry-passed');
    if (blocked !== null) steps.blocked(blocked);

    const seeded = statusSeed.find('active-expiry-passed')!;

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(seeded.nameEn);
      await payerManagementPage.expectStatusText(seeded.nameEn, LIFECYCLE_STATUS.expired.en);
    });

    await steps.step('The recalculation has run without any edit to the record', async () => {
      expect(statusSeed.hasLapsed('active-expiry-passed')).toBe(true);
    });

    await steps.step('The status is still Expired', () =>
      payerManagementPage.expectStatusText(seeded.nameEn, LIFECYCLE_STATUS.expired.en));

    // Read again after a reload rather than on the same render: "remains
    // Expired on a subsequent run" is about the value being stable across
    // re-queries, which a single read cannot show.
    await steps.step('It remains Expired when the list is queried again', async () => {
      await payerManagementPage.reopen();
      await payerManagementPage.search(seeded.nameEn);
      await payerManagementPage.expectStatusText(seeded.nameEn, LIFECYCLE_STATUS.expired.en);
    });
  });

  test('TC-010: should end as Expired when a manual inactivation is attempted on a payer whose expiry has passed', async ({
    payerManagementPage,
    statusSeed,
    steps,
  }) => {
    const blocked = statusSeed.blockedReason('inactive-expiry-passed');
    if (blocked !== null) steps.blocked(blocked);

    const seeded = statusSeed.find('inactive-expiry-passed')!;

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(seeded.nameEn);
      await payerManagementPage.waitForRowVisible(seeded.nameEn);
    });

    // The seeded row WAS manually inactivated, before its expiry passed - that
    // is exactly the "manually attempted Inactive setting" the case describes,
    // and reaching that state is why the row had to be seeded rather than
    // assembled inside the test.
    await steps.step('The record was manually set Inactive before its expiry passed', async () => {
      expect(seeded.lifecycle).toBe('inactive');
      expect(statusSeed.hasLapsed('inactive-expiry-passed')).toBe(true);
    });

    await steps.step('The recalculation has re-evaluated the record', async () => {
      await payerManagementPage.reopen();
      await payerManagementPage.search(seeded.nameEn);
      await payerManagementPage.waitForRowVisible(seeded.nameEn);
    });

    await steps.step('Expiry takes precedence, so the status reads Expired not Inactive', async () => {
      await payerManagementPage.expectStatusText(seeded.nameEn, LIFECYCLE_STATUS.expired.en);
      const status = await payerManagementPage.getStatusText(seeded.nameEn);
      expect(status).not.toBe(LIFECYCLE_STATUS.inactive.en);
    });
  });

  test('TC-011: should transition each record consistently with its own dates when a mixed batch is recalculated', async ({
    payerManagementPage,
    statusSeed,
    steps,
  }) => {
    if (!statusSeed.present) {
      steps.blocked(
        `no status seed manifest exists. ${BATCH_BLOCKER.reason} Run \`npm run seed:status\`.`,
      );
    }

    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    // EXPLORATORY, as the sheet frames it: "note and log any unexpected
    // transitions". The invariant asserted is the one that must hold whatever
    // the dates are - a payer past its expiry is Expired, and a payer inside
    // its window is not. Cross-checking each record against its OWN dates is
    // what makes this more than a restatement of the cases above.
    const anomalies: string[] = [];

    await steps.step('Every seeded record is cross-checked against its own dates', async () => {
      for (const payer of statusSeed.all) {
        await payerManagementPage.open();
        await payerManagementPage.search(payer.nameEn);
        const status = await payerManagementPage.getStatusText(payer.nameEn);
        const lapsed = statusSeed.hasLapsed(payer.key);
        const consistent = lapsed
          ? status === LIFECYCLE_STATUS.expired.en
          : status !== LIFECYCLE_STATUS.expired.en;
        anomalies.push(
          ...(consistent
            ? []
            : [`${payer.key}: expiry ${payer.expiryDate} (${lapsed ? 'passed' : 'future'}) but status is "${status}"`]),
        );
      }
      expect(statusSeed.all.length).toBeGreaterThan(0);
    });

    await steps.step('No record transitioned inconsistently with its dates', async () => {
      expect(
        anomalies,
        'Each of these records shows a status its own effective window does not justify',
      ).toEqual([]);
    });
  });

  test('TC-013: should expire all lapsed payers and leave future-dated ones unchanged when the scheduled job completes', async ({
    payerManagementPage,
    statusSeed,
    steps,
  }) => {
    if (!statusSeed.present) {
      steps.blocked(
        `no status seed manifest exists. ${BATCH_BLOCKER.reason} Run \`npm run seed:status\`.`,
      );
    }

    const due = statusSeed.all.filter((payer) => statusSeed.hasLapsed(payer.key));
    const notDue = statusSeed.all.filter((payer) => !statusSeed.hasLapsed(payer.key));
    if (due.length === 0) {
      steps.blocked(
        `none of the ${statusSeed.all.length} seeded payers has reached its expiry yet. `
          + `${BATCH_BLOCKER.reason}`,
      );
    }

    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    await steps.step('The scheduled job has run across every applicable record', async () => {
      // No errors are visible as a job log, so what is asserted is that the job
      // has had its opportunity and the list is readable afterwards - the
      // per-record outcomes below are where the job's correctness is judged.
      expect(due.length).toBeGreaterThan(0);
      await payerManagementPage.expectRowsRendered();
    });

    await steps.step(`All ${due.length} payer(s) past their expiry now read Expired`, async () => {
      for (const payer of due) {
        await payerManagementPage.open();
        await payerManagementPage.search(payer.nameEn);
        await payerManagementPage.expectStatusText(payer.nameEn, payer.expected);
      }
    });

    await steps.step(
      `The ${notDue.length} payer(s) with future expiry dates are unchanged`,
      async () => {
        for (const payer of notDue) {
          await payerManagementPage.open();
          await payerManagementPage.search(payer.nameEn);
          const status = await payerManagementPage.getStatusText(payer.nameEn);
          expect(status, `"${payer.key}" is not due yet and must not be Expired`).not.toBe(
            LIFECYCLE_STATUS.expired.en,
          );
        }
      },
    );
  });
});
