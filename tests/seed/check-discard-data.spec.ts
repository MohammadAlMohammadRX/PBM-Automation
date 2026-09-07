import { test, expect } from '../../fixtures';
import { Logger } from '../../utils/Logger';
import { REGISTRATION_STATUS } from '../../data/payers/discardRegistration.data';

/**
 * SEED CHECK - reports whether the seeded auto-discard registrations are still
 * in the environment, and what state each is in today. Not a test of the
 * application.
 *
 * It exists because those records are deliberately not cleaned up and have to
 * survive for days: someone else's cleanup, a data refresh, or a re-seed can
 * remove them, and finding that out from a discard case failing is finding out
 * the wrong way - a missing record and a rule that did not fire look identical
 * from the outside.
 *
 * The only thing it ASSERTS is that every row in the manifest is still present.
 * The status of each is reported, not judged: whether a lapsed registration
 * should by now read "Discarded" is the discard cases' question, not this
 * one's.
 *
 * Run it with:
 *     npm run seed:check
 */
test.describe('Seed check - auto-discard registrations', () => {
  test.skip(
    !process.env.SEED_CHECK,
    'Seed status check. Run it explicitly: npm run seed:check',
  );

  test.setTimeout(10 * 60 * 1000);

  test('reports whether the seeded registrations still exist', async ({
    payerManagementPage,
    discardSeed,
    steps,
  }) => {
    if (!discardSeed.present) {
      steps.blocked(
        'no seed manifest was found at reports/discard-seed.json, so there is nothing to '
          + 'check. Run `npm run seed:discard` first.',
      );
    }

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    const missing: string[] = [];
    const found: string[] = [];

    for (const row of discardSeed.all) {
      await steps.step(`${row.key} - is it still there?`, async () => {
        const present = await payerManagementPage.isRowVisibleAfterSearch(row.nameEn);
        if (!present) {
          missing.push(row.key);
          Logger.warn(`[seed-check] MISSING  ${row.key}  "${row.nameEn}"`);
          return;
        }
        found.push(row.key);

        // Reported, not asserted - see the file header.
        const approval = await payerManagementPage.getApprovalStatus(row.nameEn);
        const lifecycle = await payerManagementPage.getLifecycleStatus(row.nameEn);
        const due = row.lapsesOn
          ? (discardSeed.hasLapsed(row.key) ? `DUE since ${row.lapsesOn}` : `due ${row.lapsesOn}`)
          : 'control, never due';
        const discarded = approval.includes(REGISTRATION_STATUS.discarded) ? '  <-- DISCARDED' : '';
        Logger.info(
          `[seed-check] ${row.key.padEnd(24)} ${due.padEnd(24)} `
            + `expect ${row.expected.padEnd(10)} now: ${approval} / ${lifecycle}${discarded}`,
        );
      });
    }

    // The one real assertion. A missing record is not a defect in the payer
    // module - it means the data this story depends on has gone and needs
    // re-seeding, which is a different problem with a different fix.
    await steps.step('Every seeded registration is still in the environment', async () => {
      expect(
        missing,
        `these seeded registrations are gone from ${discardSeed.seededOn ?? 'the seed run'} `
          + 'and the discard cases that depend on them cannot run. Re-create them with '
          + '`npm run seed:discard` (note this restarts their effective windows, so the '
          + 'lapse dates move).',
      ).toEqual([]);
      Logger.info(`[seed-check] ${found.length} present, ${missing.length} missing`);
    });
  });
});
