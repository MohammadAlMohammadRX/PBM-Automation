import * as fs from 'fs';
import * as path from 'path';
import { test, expect } from '../../fixtures';
import { env } from '../../constants/EnvironmentConfig';
import { Logger } from '../../utils/Logger';
import {
  DISCARD_SEED_PLAN,
  SEED_MANIFEST_PATH,
  buildSeedPayer,
  lapseDate,
  seedStamp,
  type DiscardSeedManifest,
  type SeededPayer,
} from '../../data/payers/discardSeed.data';

/**
 * SEEDER - creates the data the auto-discard story needs. Not a test.
 *
 * It asserts only that each record was created; it makes no claim about the
 * application's behaviour. The claims are made days later by
 * discard-boundaries.spec.ts, once the seeded effective dates have lapsed of
 * their own accord.
 *
 * WHY A SPEC FILE RATHER THAN A SCRIPT. It needs the Page Objects and fixtures,
 * which are TypeScript and expect a Playwright `page`. Re-implementing the
 * three-step wizard and the maker-checker flow in a standalone script would
 * duplicate the most intricate code in the framework - and the duplicate would
 * be the one that rots.
 *
 * IT IS INERT UNLESS ASKED FOR. The guard below skips the whole file unless
 * SEED_DISCARD is set, so `npx playwright test` can never create these records
 * by accident. Run it with:
 *
 *     npm run seed:discard
 *
 * THESE RECORDS ARE DELIBERATELY NOT CLEANED UP. That is the point - they have
 * to outlive the run so their effective windows can lapse. Every one is named
 * `DISCARD-SEED <date> <key> <suffix>`, so they are easy to find and remove by
 * hand when the story is done. Seeding twice creates a second, independent set;
 * the manifest always describes the most recent run.
 */
test.describe('Seed - auto-discard registrations', () => {
  test.skip(
    !process.env.SEED_DISCARD,
    'Seeder. Creates permanent test data, so it only runs when explicitly asked: '
      + 'npm run seed:discard',
  );

  // Creating six payers, two of which go through a full approval round trip,
  // takes well past the default per-test budget.
  test.setTimeout(15 * 60 * 1000);

  test('creates the registrations whose effective windows will lapse', async ({
    payerManagementPage,
    approvalManagementPage,
    steps,
  }) => {
    const stamp = seedStamp();

    // ADDITIVE, and this matters more than it looks. Rows seeded on an earlier
    // day are part-way through their effective window - re-seeding them from
    // scratch would hand them fresh dates and push every dependent case back to
    // "not due yet", silently destroying data that was about to become
    // testable. So an existing manifest is loaded and only the rows it does not
    // already carry are created.
    //
    // To start over deliberately, delete reports/discard-seed.json first.
    let existing: SeededPayer[] = [];
    let seededOn = stamp;
    if (fs.existsSync(SEED_MANIFEST_PATH)) {
      const prior: DiscardSeedManifest = JSON.parse(
        fs.readFileSync(SEED_MANIFEST_PATH, 'utf8'),
      );
      existing = prior.payers ?? [];
      seededOn = prior.seededOn || stamp;
      Logger.info(
        `[seed] found ${existing.length} row(s) from ${prior.seededOn} - keeping them and `
          + 'adding only what is missing',
      );
    }

    const have = new Set(existing.map((p) => p.key));
    const todo = DISCARD_SEED_PLAN.filter((row) => !have.has(row.key));
    const seeded: SeededPayer[] = [...existing];

    if (todo.length === 0) {
      Logger.info('[seed] every planned row already exists - nothing to create');
    }

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    for (const row of todo) {
      const payer = buildSeedPayer(row, stamp);

      await steps.critical(`Create "${row.key}" (${row.state})`, async () => {
        await payerManagementPage.open();
        await payerManagementPage.createDraftPayer(payer);

        // v0-draft stops here on purpose: the criteria say "Pending", and the
        // application distinguishes a Draft from a submitted Pending Approval.
        // Seeding one of each is what will show which the job acts on.
        if (row.state === 'v0-draft') return;

        await payerManagementPage.open();
        await payerManagementPage.sendForApproval(payer.nameEn);

        if (row.state === 'v0-submitted') return;

        // Everything below is approved to v1. For `v1-published` that is the
        // whole point: the registration is approved BEFORE its effective date
        // arrives, so when the window opens it is live rather than unapproved.
        await approvalManagementPage.open();
        await approvalManagementPage.approve(payer.nameEn);

        if (row.state === 'v1-published') return;

        // v1-published-with-pending-v2: stage an edit and leave it awaiting
        // review, so the record carries an approved version AND a pending one.
        await payerManagementPage.open();
        await payerManagementPage.editTextFieldAndSave(
          payer.nameEn,
          'License Number',
          `${payer.licenseNumber}-V2`,
        );
        await payerManagementPage.open();
        await payerManagementPage.sendForApproval(payer.nameEn);
      });

      seeded.push({
        key: row.key,
        forCase: row.forCase,
        state: row.state,
        nameEn: payer.nameEn,
        nameAr: payer.nameAr,
        licenseNumber: payer.licenseNumber,
        effectiveDate: payer.effectiveDate,
        expiryDate: payer.expiryDate,
        lapsesOn: lapseDate(row),
        expected: row.expected,
        purpose: row.purpose,
      });
      Logger.step(`[seed] created ${row.key} -> "${payer.nameEn}" effective ${payer.effectiveDate}`);
    }

    await steps.critical('Every planned registration was created', async () => {
      expect(
        seeded.map((s) => s.key),
        'the manifest must describe every row of the seed plan',
      ).toEqual(DISCARD_SEED_PLAN.map((row) => row.key));
    });

    // Written LAST, and only once every record exists, so a manifest on disk
    // always describes data that is really there. A half-written manifest would
    // send the verification run looking for payers that were never created.
    await steps.critical('Record the manifest for the verification run', async () => {
      // The manifest keeps the ORIGINAL seed date, since rows created today sit
      // alongside rows still counting down from an earlier run.
      const manifest: DiscardSeedManifest = {
        seededOn,
        environment: env.baseUrl,
        payers: seeded,
      };
      fs.mkdirSync(path.dirname(SEED_MANIFEST_PATH), { recursive: true });
      fs.writeFileSync(SEED_MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
      expect(fs.existsSync(SEED_MANIFEST_PATH), 'the manifest should be on disk').toBe(true);
    });

    await steps.step('Report what was seeded and when each row becomes checkable', async () => {
      for (const s of seeded) {
        Logger.info(
          `[seed] ${s.key.padEnd(24)} effective ${s.effectiveDate}  `
            + `lapses ${s.lapsesOn ?? 'never (control)'}  expect ${s.expected}`,
        );
      }
      expect(seeded.length).toBe(DISCARD_SEED_PLAN.length);
    });
  });
});
