import * as fs from 'fs';
import * as path from 'path';
import { test, expect } from '../../fixtures';
import { env } from '../../constants/EnvironmentConfig';
import { Logger } from '../../utils/Logger';
import { withProtectionSuspended } from '../../constants/ProtectedData';
import { LIFECYCLE_STATUS } from '../../data/payers/statusTransition.data';
import {
  STATUS_SEED_MANIFEST_PATH,
  STATUS_SEED_ROWS,
  buildStatusSeedPayer,
  statusLapseDate,
  statusSeedStamp,
  type SeededStatusPayer,
  type StatusSeedManifest,
} from '../../data/payers/statusSeed.data';

/**
 * SEEDER - creates the data the expiry-precedence story needs. Not a test.
 *
 * It asserts only that each record reached the state it was meant to reach; it
 * makes no claim about whether the application's transition rules are correct.
 * Those claims are made a day later by expiry-precedence.spec.ts, once the
 * seeded expiry dates have passed of their own accord.
 *
 * WHY THIS DATA CANNOT BE MADE ON DEMAND. The story turns on one record the
 * environment does not contain: an INACTIVE payer whose expiry has passed. It
 * cannot be created directly, because the wizard refuses an expiry before today,
 * and it cannot be assembled inside a test, because reaching it means approving
 * a payer, inactivating it, and then waiting for a calendar day to turn. So the
 * record is created now with an expiry of today and read tomorrow. Nothing is
 * back-dated and no clock is faked - the wait is real.
 *
 * IT IS INERT UNLESS ASKED FOR. The guard below skips the file unless
 * SEED_STATUS is set, so `npx playwright test` can never create these records
 * by accident:
 *
 *     npm run seed:status
 *
 * THESE RECORDS ARE DELIBERATELY NOT CLEANED UP - they have to outlive the run.
 * Every one is named `STATUS-SEED <date> <key> <suffix>` and is protected by
 * constants/ProtectedData.ts, so no other story's teardown or sampling can
 * remove one. Seeding twice creates a second independent set; the manifest
 * always describes the most recent run.
 */
test.describe('Seed - expiry precedence payers', () => {
  test.skip(
    !process.env.SEED_STATUS,
    'Seeder. Creates permanent test data, so it only runs when explicitly asked: '
      + 'npm run seed:status',
  );

  // Five payers, every one through a full approval round trip and three of them
  // through an inactivation as well - far past the default per-test budget.
  test.setTimeout(20 * 60 * 1000);

  test('creates the payers whose expiry dates will lapse', async ({
    payerManagementPage,
    approvalManagementPage,
    payerInactivateDialog,
    steps,
  }) => {
    const stamp = statusSeedStamp();

    // ADDITIVE, for the same reason the discard seeder is: rows seeded earlier
    // are part-way through their countdown, and re-creating them would hand
    // them fresh expiry dates and push every dependent case back to "not due
    // yet" - silently destroying data that was about to become testable.
    //
    // To start over deliberately, delete reports/status-seed.json first.
    let existing: SeededStatusPayer[] = [];
    let seededOn = stamp;
    if (fs.existsSync(STATUS_SEED_MANIFEST_PATH)) {
      const prior: StatusSeedManifest = JSON.parse(
        fs.readFileSync(STATUS_SEED_MANIFEST_PATH, 'utf8'),
      );
      existing = prior.payers ?? [];
      seededOn = prior.seededOn || stamp;
      Logger.info(
        `[seed] found ${existing.length} row(s) from ${prior.seededOn} - keeping them and `
          + 'adding only what is missing',
      );
    }

    const have = new Set(existing.map((payer) => payer.key));
    const todo = STATUS_SEED_ROWS.filter((row) => !have.has(row.key));
    const seeded: SeededStatusPayer[] = [...existing];

    if (todo.length === 0) {
      Logger.info('[seed] every planned row already exists - nothing to create');
    }

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    for (const row of todo) {
      const payer = buildStatusSeedPayer(row, stamp);

      await steps.critical(`Create and publish "${row.key}" (${row.lifecycle})`, async () => {
        await payerManagementPage.open();
        await payerManagementPage.createDraftPayer(payer);
        await payerManagementPage.open();
        await payerManagementPage.sendForApproval(payer.nameEn);
        await approvalManagementPage.open();
        await approvalManagementPage.approve(payer.nameEn);

        // Effective today, so an approved payer is live immediately. Asserting
        // it here rather than trusting the flow: a row that never went live
        // cannot demonstrate anything about expiry precedence, and finding that
        // out tomorrow would waste the whole wait.
        await payerManagementPage.open();
        await payerManagementPage.search(payer.nameEn);
        await payerManagementPage.expectStatusText(payer.nameEn, LIFECYCLE_STATUS.active.en);
      });

      if (row.lifecycle === 'inactive') {
        await steps.critical(`Inactivate "${row.key}"`, async () => {
          await payerManagementPage.open();
          // The guard is suspended for exactly this call. STATUS-SEED records
          // are protected the moment they are named, and inactivating one is
          // precisely what a later story must NOT do - but it is what this
          // seeder exists to do. See constants/ProtectedData.ts for why the
          // escape is a process-wide switch rather than a parameter.
          await withProtectionSuspended(() =>
            payerManagementPage.findAndInactivateRow(payer.nameEn));
          await payerInactivateDialog.inactivateWithFirstReason(
            `Seeded for the expiry-precedence story (${row.key})`,
          );

          // Inactivation is a maker-checker change like any other, so it may
          // arrive as a pending version rather than taking effect at once. The
          // approval queue is drained if the request is there, and the end
          // state is asserted either way - which makes this correct whether or
          // not inactivation needs review, instead of depending on which.
          await approvalManagementPage.open();
          await approvalManagementPage.approveIfPending(payer.nameEn);

          await payerManagementPage.open();
          await payerManagementPage.search(payer.nameEn);
          await payerManagementPage.expectStatusText(payer.nameEn, LIFECYCLE_STATUS.inactive.en);
        });
      }

      seeded.push({
        key: row.key,
        forCase: row.forCase,
        lifecycle: row.lifecycle,
        nameEn: payer.nameEn,
        nameAr: payer.nameAr,
        licenseNumber: payer.licenseNumber,
        effectiveDate: payer.effectiveDate,
        expiryDate: payer.expiryDate,
        lapsesOn: statusLapseDate(row),
        expected: row.expected,
        purpose: row.purpose,
      });
      Logger.step(
        `[seed] created ${row.key} -> "${payer.nameEn}" expiring ${payer.expiryDate}`,
      );
    }

    await steps.critical('Every planned payer was created', async () => {
      expect(
        seeded.map((payer) => payer.key),
        'the manifest must describe every row of the seed plan',
      ).toEqual(STATUS_SEED_ROWS.map((row) => row.key));
    });

    // Written LAST, and only once every record exists, so a manifest on disk
    // always describes data that is really there. A half-written manifest would
    // send tomorrow's verification looking for payers that were never created.
    await steps.critical('Record the manifest for the verification run', async () => {
      const manifest: StatusSeedManifest = {
        seededOn,
        environment: env.baseUrl,
        payers: seeded,
      };
      fs.mkdirSync(path.dirname(STATUS_SEED_MANIFEST_PATH), { recursive: true });
      fs.writeFileSync(STATUS_SEED_MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
      expect(fs.existsSync(STATUS_SEED_MANIFEST_PATH), 'the manifest should be on disk').toBe(
        true,
      );
    });

    await steps.step('Report what was seeded and when each row becomes checkable', async () => {
      for (const payer of seeded) {
        Logger.info(
          `[seed] ${payer.key.padEnd(24)} ${payer.lifecycle.padEnd(9)} expires `
            + `${payer.expiryDate}  checkable ${payer.lapsesOn ?? 'never (control)'}  `
            + `expect ${payer.expected}`,
        );
      }
      expect(seeded.length).toBe(STATUS_SEED_ROWS.length);
    });
  });
});
