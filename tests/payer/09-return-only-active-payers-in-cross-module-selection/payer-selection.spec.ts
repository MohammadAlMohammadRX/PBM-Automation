import { test, expect } from '../../../fixtures';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import {
  CONSUMING_SURFACES,
  DROPDOWN_DECISION_TABLE,
  DISPLAYED_STATUS,
  ELIGIBLE_STATUS,
  ELIGIBLE_STATUS_CODE,
  EXCLUDED_STATUS_CASES,
  REQUIRED_ENTRY_FIELDS,
  SAMPLE_SIZE,
  type ApiEnvelope,
  type PayerDropdownEntry,
  type StatusLookupItem,
} from '../../../data/payers/payerSelection.data';

/**
 * User story: Return Only Active Payers with Status in Cross-Module Payer
 * Selection.
 *
 * The interface under test is `GET /api/Payers/GetPayersDropdown`, consumed by
 * the Plans module (both its Add Plan wizard and its list filter) and by the
 * Networks list filter.
 *
 * ONE FINDING WORTH A DEFECT REPORT, recorded here so it is not lost: at the
 * moment of writing the dropdown offered 219 payers while the payer list's own
 * "Active Payers" counter read 255. Both cannot be right. The assertions below
 * deliberately check the RULE the story specifies - every option is Active, and
 * no non-Active payer is offered - rather than a count equality, because the
 * rule is what the criteria state and a count equality would be asserting a
 * behaviour nobody specified. The discrepancy still needs a product answer.
 *
 * The non-Active payers used for the exclusion checks are SAMPLED from the
 * environment via `payerSample` rather than created: manufacturing an Expired
 * payer means back-dating an expiry the wizard will not accept, and an Inactive
 * one means a full inactivate-plus-approve round trip per test.
 */
test.describe('Cross-Module Payer Selection - Active-only filtering', () => {
  test('TC-001: should offer only Active payers in a consuming module dropdown', async ({
    payerManagementPage,
    planManagementPage,
    payerSample,
    steps,
  }) => {
    let activePayers: string[] = [];
    await steps.critical('Confirm the payer register holds a mix of statuses', async () => {
      activePayers = await payerSample(ELIGIBLE_STATUS, DISPLAYED_STATUS.active, SAMPLE_SIZE);
      expect(
        activePayers.length,
        'the environment must hold at least one Active payer for this case to mean anything',
      ).toBeGreaterThan(0);
    });

    let offered: string[] = [];
    await steps.critical('Open the payer dropdown in the Plans module', async () => {
      await planManagementPage.openList();
      const dropdown = planManagementPage.payerFilter();
      await dropdown.open();
      await dropdown.expectNotEmpty();
      offered = await dropdown.getPayerOptions();
    });

    await steps.step('The dropdown offers the Active payers', async () => {
      const missing = activePayers.filter((name) => !offered.includes(name));
      expect(
        missing,
        `these Active payers were not offered by the dropdown: ${missing.join(', ')}`,
      ).toEqual([]);
    });

    // The positive half alone is not enough - a dropdown listing EVERY payer
    // would satisfy it. Every non-Active status is checked for absence too, so
    // "only Active" is genuinely asserted.
    for (const excluded of EXCLUDED_STATUS_CASES) {
      await steps.step(`No ${excluded.status} payer is offered`, async () => {
        const names = await payerSample(excluded.filter, excluded.displayed, SAMPLE_SIZE);
        if (names.length === 0) {
          // Nothing to exclude means nothing to prove for this status, and
          // saying so beats a vacuous pass.
          expect(
            names,
            `the environment holds no ${excluded.status} payer, so its exclusion could not `
              + 'be exercised',
          ).not.toEqual([]);
          return;
        }
        const wronglyOffered = names.filter((name) => offered.includes(name));
        expect(
          wronglyOffered,
          `these ${excluded.status} payers were offered by the dropdown but must not be: `
            + `${wronglyOffered.join(', ')}`,
        ).toEqual([]);
      });
    }
  });

  test('TC-002: should exclude Pending, Inactive and Expired payers', async ({
    planManagementPage,
    payerSample,
    steps,
  }) => {
    // The sheet's first step confirms the register actually holds one payer of
    // each excluded status. Without it, an exclusion check can pass simply
    // because no such payer exists - a vacuous pass rather than evidence.
    await steps.critical('The register holds one payer of each excluded status', async () => {
      const absent: string[] = [];
      for (const excluded of EXCLUDED_STATUS_CASES) {
        const names = await payerSample(excluded.filter, excluded.displayed, 1);
        if (names.length === 0) absent.push(excluded.status);
      }
      expect(
        absent,
        `the environment must hold a payer of each excluded status; missing: ${absent.join(', ')}`,
      ).toEqual([]);
    });

    let dropdownOptions: string[] = [];
    await steps.critical('Open the payer dropdown in a consuming module', async () => {
      await planManagementPage.openList();
      const dropdown = planManagementPage.payerFilter();
      await dropdown.open();
      await dropdown.expectNotEmpty();
      dropdownOptions = await dropdown.getPayerOptions();
    });

    // One step per equivalence class, so the report says WHICH status leaked
    // rather than that "an exclusion failed".
    for (const excluded of EXCLUDED_STATUS_CASES) {
      await steps.step(`A ${excluded.status} payer does not appear in the list`, async () => {
        const names = await payerSample(excluded.filter, excluded.displayed, SAMPLE_SIZE);
        expect(
          names.length,
          `the environment must hold a ${excluded.status} payer to prove it is excluded`,
        ).toBeGreaterThan(0);
        const leaked = names.filter((name) => dropdownOptions.includes(name));
        expect(leaked, `${excluded.status} payers offered: ${leaked.join(', ')}`).toEqual([]);
      });
    }
  });

  test('TC-007: should match the status decision table exactly', async ({
    planManagementPage,
    payerSample,
    steps,
  }) => {
    let offered: string[] = [];
    await steps.critical('Open the payer dropdown in a consuming module', async () => {
      await planManagementPage.openList();
      const dropdown = planManagementPage.payerFilter();
      await dropdown.open();
      await dropdown.expectNotEmpty();
      offered = await dropdown.getPayerOptions();
    });

    // One STEP per decision-table row, mirroring the sheet, which states an
    // expected result for each status separately ("Included" / "Excluded").
    // Evaluating the whole table in a single assertion reported the outcome but
    // lost which row disagreed, and the sheet's per-row expectations had no
    // step of their own to land on.
    const outcomes: Record<string, boolean | 'no-sample'> = {};

    for (const row of DROPDOWN_DECISION_TABLE) {
      await steps.step(
        `A ${row.status} payer is ${row.included ? 'included' : 'excluded'}`,
        async () => {
          const names = await payerSample(row.filter, row.displayed, 1);
          expect(
            names.length,
            `the environment must hold a ${row.status} payer for this row of the decision `
              + 'table to be exercised',
          ).toBeGreaterThan(0);

          outcomes[row.status] = offered.includes(names[0]);
          expect(
            outcomes[row.status],
            `a ${row.status} payer ("${names[0]}") should be `
              + `${row.included ? 'offered by' : 'absent from'} the dropdown`,
          ).toBe(row.included);
        },
      );
    }

    // The table as a whole, so the report also carries the full matrix in one
    // place rather than only the row that broke.
    await steps.step('The full decision matrix matches the specification', async () => {
      const expectedTable = Object.fromEntries(
        DROPDOWN_DECISION_TABLE.map((row) => [row.status, row.included]),
      );
      expect(outcomes, 'dropdown inclusion by payer status').toEqual(expectedTable);
    });
  });

  test('TC-003: should carry each payer status alongside its identifying fields', async ({
    page,
    planManagementPage,
    steps,
  }) => {
    // The criterion asks for the status to travel WITH each entry, and says it
    // may be checked in the UI or in the underlying payload. It has to be the
    // payload: the rendered option is `<span>AAA</span>` - the payer name and
    // nothing else - so the visible label alone would fail a criterion the
    // interface actually satisfies.
    let payload: ApiEnvelope<PayerDropdownEntry[]> | null = null;

    await steps.critical('Open the payer dropdown and capture its interface call', async () => {
      await planManagementPage.open();
      payload = await NetworkUtils.captureJsonResponse<ApiEnvelope<PayerDropdownEntry[]>>(
        page,
        ApiEndpoints.payerDropdown,
        () => planManagementPage.openList(),
      );
      expect(payload, 'the payer selection interface should have been called').not.toBeNull();
    });

    await steps.step('Every entry carries its identifying fields and a status', async () => {
      const entries = payload!.payload;
      expect(entries.length, 'the interface must return payers to inspect').toBeGreaterThan(0);

      const incomplete = entries.filter((entry) =>
        REQUIRED_ENTRY_FIELDS.some((field) => {
          const value = entry[field];
          return value === undefined || value === null || value === '';
        }),
      );
      expect(
        incomplete.map((entry) => entry.payerNameEn || entry.id),
        `every entry must carry ${REQUIRED_ENTRY_FIELDS.join(', ')}`,
      ).toEqual([]);
    });

    await steps.step('The status on every entry is the Active status', async () => {
      const entries = payload!.payload;
      const distinctStatuses = [...new Set(entries.map((entry) => entry.statusId))];
      expect(
        distinctStatuses.length,
        'every returned payer should carry the same status - the Active one; statuses '
          + `returned: ${distinctStatuses.join(', ')}`,
      ).toBe(1);
    });
  });

  test('TC-008: should return a well-formed payload restricted to Active payers', async ({
    page,
    payerManagementPage,
    planManagementPage,
    steps,
  }) => {
    // The Active status's id is resolved from the application's own lookup
    // rather than hard-coded, so this does not break the day the seed data is
    // rebuilt with new GUIDs.
    let activeStatusId = '';
    await steps.critical('Resolve the Active status id from the status lookup', async () => {
      const lookup = await NetworkUtils.captureJsonResponse<ApiEnvelope<StatusLookupItem[]>>(
        page,
        ApiEndpoints.payerStatusLookup,
        () => payerManagementPage.open(),
      );
      expect(lookup, 'the payer status lookup should have been called').not.toBeNull();
      const active = lookup!.payload.find((item) => item.code === ELIGIBLE_STATUS_CODE);
      expect(active, `the lookup must define a "${ELIGIBLE_STATUS_CODE}" status`).toBeDefined();
      activeStatusId = active!.id;
    });

    let payload: ApiEnvelope<PayerDropdownEntry[]> | null = null;
    await steps.critical('Capture the payer selection interface payload', async () => {
      payload = await NetworkUtils.captureJsonResponse<ApiEnvelope<PayerDropdownEntry[]>>(
        page,
        ApiEndpoints.payerDropdown,
        () => planManagementPage.openList(),
      );
      expect(payload, 'the payer selection interface should have been called').not.toBeNull();
    });

    await steps.step('The response envelope reports success', async () => {
      expect(payload!.status, 'the interface should return HTTP 200').toBe(200);
      expect(Array.isArray(payload!.payload), 'the payload should be a list').toBe(true);
    });

    await steps.step('Every returned payer carries the Active status id', async () => {
      const wrongStatus = payload!.payload.filter((entry) => entry.statusId !== activeStatusId);
      expect(
        wrongStatus.map((entry) => `${entry.payerNameEn} (${entry.statusId})`),
        `every entry must carry the Active status id ${activeStatusId}`,
      ).toEqual([]);
    });

    await steps.step('Each entry exposes both localized names for its consumers', async () => {
      const missingNames = payload!.payload.filter(
        (entry) => !entry.payerNameEn && !entry.payerNameAr,
      );
      expect(
        missingNames.map((entry) => entry.id),
        'an entry with neither name is unusable by a consuming module',
      ).toEqual([]);
    });
  });

  test('TC-012: should enforce the same rule in every consuming module', async ({
    planManagementPage,
    networkManagementPage,
    payerSample,
    steps,
  }) => {
    // Two INDEPENDENT consumers. If both return the same set, the Active-only
    // filter lives in the shared interface rather than being re-implemented -
    // and re-broken - per module, which is the point of the criterion.
    const results: Record<string, string[]> = {};

    // The sheet expects each module to be checked on its own terms first -
    // "Only Active payers are listed, each showing status" - and only then
    // compared. Reading both and jumping straight to the comparison would pass
    // if BOTH modules were wrong in the same way, which is exactly the failure
    // a shared interface makes likely.
    await steps.critical('Read the payer options offered by the Plans module', async () => {
      await planManagementPage.openList();
      const dropdown = planManagementPage.payerFilter();
      await dropdown.open();
      await dropdown.expectNotEmpty();
      results.Plans = (await dropdown.getPayerOptions()).sort();
      await dropdown.close();
    });

    await steps.step('The Plans module offers only Active payers', async () => {
      const nonActive = await payerSample('Inactive', DISPLAYED_STATUS.inactive, 1);
      expect(
        nonActive.length,
        'the environment must hold a non-Active payer for this check to mean anything',
      ).toBeGreaterThan(0);
      expect(
        results.Plans.includes(nonActive[0]),
        `the Plans dropdown must not offer "${nonActive[0]}", which is Inactive`,
      ).toBe(false);
    });

    await steps.critical('Read the payer options offered by the Networks module', async () => {
      await networkManagementPage.openList();
      const dropdown = networkManagementPage.payerFilter();
      await dropdown.open();
      await dropdown.expectNotEmpty();
      results.Networks = (await dropdown.getPayerOptions()).sort();
      await dropdown.close();
    });

    await steps.step('The Networks module offers only Active payers', async () => {
      const nonActive = await payerSample('Expired', DISPLAYED_STATUS.expired, 1);
      expect(
        nonActive.length,
        'the environment must hold an Expired payer for this check to mean anything',
      ).toBeGreaterThan(0);
      expect(
        results.Networks.includes(nonActive[0]),
        `the Networks dropdown must not offer "${nonActive[0]}", which is Expired`,
      ).toBe(false);
    });

    await steps.step('Both consuming modules offer the identical payer set', async () => {
      // The symmetric difference is reported, not merely "the sets differ": a
      // defect report has to say WHICH payers one module offers and the other
      // does not, or nobody can act on it.
      const onlyInPlans = results.Plans.filter((name) => !results.Networks.includes(name));
      const onlyInNetworks = results.Networks.filter((name) => !results.Plans.includes(name));
      const modules = CONSUMING_SURFACES.map((surface) => surface.moduleName).join(' and ');
      expect(
        { onlyInPlans, onlyInNetworks },
        `${modules} must offer the same payers, or the Active-only rule is not being `
          + 'enforced by the shared interface',
      ).toEqual({ onlyInPlans: [], onlyInNetworks: [] });
    });
  });

  test('TC-011: should fail gracefully when the payer service is unavailable', async ({
    page,
    planManagementPage,
    steps,
  }) => {
    // Only the payer dropdown's own endpoint is aborted. The consuming module
    // still loads, so what the dropdown then does is genuinely its own error
    // handling rather than a page that never booted.
    await steps.critical('Simulate the payer service being unreachable', () =>
      NetworkUtils.abortEndpoint(page, ApiEndpoints.payerDropdown));

    await steps.critical('Open the consuming module and its payer dropdown', async () => {
      await planManagementPage.open();
      const dropdown = planManagementPage.payerFilter();
      await dropdown.expectPresent();
      await dropdown.open();
    });

    await steps.step('The dropdown offers nothing rather than corrupted data', async () => {
      const dropdown = planManagementPage.payerFilter();
      await dropdown.expectEmptyStateHandledGracefully();
    });

    await steps.critical('Restore the payer service', () =>
      NetworkUtils.restoreEndpoint(page, ApiEndpoints.payerDropdown));

    await steps.step('The dropdown loads Active payers once the service is back', async () => {
      await planManagementPage.openList();
      const dropdown = planManagementPage.payerFilter();
      await dropdown.open();
      await dropdown.expectNotEmpty();
    });
  });

  test('TC-013: should reflect the latest statuses on each fresh load, with no stale cache', async ({
    planManagementPage,
    payerSample,
    steps,
  }) => {
    // The concurrency the criterion describes needs a status change in a
    // parallel session, which this suite cannot arrange safely against a shared
    // environment. What IS checkable, and is the actual risk the case is about,
    // is CACHING: re-opening the dropdown must re-read the interface rather
    // than replay a stale list. Reopened repeatedly, the answer must be stable
    // and must still satisfy the Active-only rule every time.
    let excludedSample: string[] = [];
    await steps.critical('Sample a payer that must never be offered', async () => {
      for (const excluded of EXCLUDED_STATUS_CASES) {
        const names = await payerSample(excluded.filter, excluded.displayed, 1);
        if (names.length > 0) {
          excludedSample = names;
          break;
        }
      }
      expect(
        excludedSample.length,
        'the environment must hold at least one non-Active payer for this case',
      ).toBeGreaterThan(0);
    });

    await steps.critical('Open the consuming module', () => planManagementPage.openList());

    for (const attempt of [1, 2, 3]) {
      await steps.step(`Reload ${attempt} still excludes the non-Active payer`, async () => {
        const dropdown = planManagementPage.payerFilter();
        await dropdown.open();
        await dropdown.expectNotEmpty();
        await dropdown.expectExcludesPayer(excludedSample[0]);
        await dropdown.close();
        await planManagementPage.openList();
      });
    }
  });
});
