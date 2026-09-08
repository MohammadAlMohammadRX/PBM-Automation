import { test, expect } from '../../fixtures';
import { Logger } from '../../utils/Logger';

/**
 * CHECKER - reports the state of the seeded expiry-precedence payers. Not a
 * verification of the story's rules.
 *
 * WHAT IT ASSERTS, and what it deliberately does not. It asserts only that
 * every seeded payer still EXISTS. It does not assert that a lapsed payer has
 * become Expired, because that is the story's own question and belongs in
 * expiry-precedence.spec.ts, where a failure means something. If this file made
 * that claim it would fail every day the lifecycle job stayed idle, and a
 * standing red result is one nobody reads.
 *
 * So this is the "is my data still there, and is it due yet" report. It answers
 * two things that matter before spending a run on the story:
 *
 *   - has anything deleted a seeded record (the reason ProtectedData exists), and
 *   - has the job moved any row that is now due.
 *
 * Run it with:
 *
 *     npm run check:status
 */
test.describe('Seed check - expiry precedence payers', () => {
  test.skip(
    !process.env.SEED_CHECK_STATUS,
    'Reporting run. Only executes when explicitly asked: npm run check:status',
  );

  test.setTimeout(10 * 60 * 1000);

  test('reports whether the seeded payers still exist and have transitioned', async ({
    payerManagementPage,
    statusSeed,
    steps,
  }) => {
    if (!statusSeed.present) {
      steps.blocked(
        'no status seed manifest exists yet. Run `npm run seed:status` to create the payers '
          + 'whose expiry dates will lapse.',
      );
      return;
    }

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    const missing: string[] = [];
    const moved: string[] = [];

    await steps.critical('Locate every seeded payer and report its status', async () => {
      for (const payer of statusSeed.all) {
        await payerManagementPage.open();

        const found = await payerManagementPage.isRowVisibleAfterSearch(payer.nameEn);
        if (!found) {
          missing.push(payer.key);
          Logger.warn(`[status-check] ${payer.key.padEnd(24)} MISSING - the record is gone`);
          continue;
        }

        const status = await payerManagementPage.getStatusText(payer.nameEn);
        const due = statusSeed.hasLapsed(payer.key);
        const dueLabel = payer.lapsesOn
          ? due
            ? `DUE since ${payer.lapsesOn}`
            : `due ${payer.lapsesOn}`
          : 'control, never due';

        if (due && status === payer.expected) moved.push(payer.key);

        Logger.info(
          `[status-check] ${payer.key.padEnd(24)} ${dueLabel.padEnd(24)} `
            + `expect ${payer.expected.padEnd(9)} now: ${status}`,
        );
      }

      // The only assertion, and the one that protects days of waiting: a seeded
      // record that has vanished means something deleted it, which is a bug in
      // whichever suite did so - not a finding about the payer module.
      expect(
        missing,
        'Every seeded payer must still exist. A missing record means another test deleted it '
          + 'despite the ProtectedData guard - see constants/ProtectedData.ts.',
      ).toEqual([]);
    });

    await steps.step('Summarise how far the seeded set has progressed', async () => {
      const dueCount = statusSeed.all.filter((payer) => statusSeed.hasLapsed(payer.key)).length;
      Logger.info(
        `[status-check] ${statusSeed.all.length} present, ${missing.length} missing, `
          + `${dueCount} due, ${moved.length} already transitioned as expected`,
      );
      expect(statusSeed.all.length).toBeGreaterThan(0);
    });
  });
});
