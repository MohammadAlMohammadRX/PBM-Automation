import { test, expect } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';
import { buildUniquePayer } from '../../../data/payers/payer.data';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import {
  BLANK_MARKERS,
  EDIT_TRIGGER,
  IMMUTABLE_FIELDS,
  METADATA_FIELDS,
  METADATA_ROLE_REQUIREMENT,
  MUTABLE_FIELDS,
  SEQUENTIAL_EDITS,
  UNMODIFIED_INDICATORS,
} from '../../../data/payers/overviewMetadata.data';

/**
 * User story: Show Created-Modified Metadata on Payer Overview.
 *
 * The Overview tab shows Created By/At and Modified By/At. Each is asserted as
 * the invariant the feature guarantees rather than against a literal username or
 * wall-clock minute the sheet names - this environment has one shared account
 * whose display name is not its login, and a server clock the tester cannot set.
 * See overviewMetadata.data.ts for why that is the honest reading.
 */
const isBlank = (value: string): boolean =>
  BLANK_MARKERS.includes(value.trim().toLowerCase() as (typeof BLANK_MARKERS)[number]);

/** A Modified field is fine either populated or showing an unmodified indicator. */
const modifiedIsAcceptable = (value: string): boolean =>
  !isBlank(value)
  || UNMODIFIED_INDICATORS.includes(value.trim() as (typeof UNMODIFIED_INDICATORS)[number]);

test.describe('Payer overview metadata', () => {
  // Azure test case 15797
  test('15797: should show who created a payer and when as soon as it exists', async ({
    payerManagementPage,
    steps,
  }) => {
    const payer = buildUniquePayer();

    await steps.critical('Navigate to the module and create a payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(payer);
    });

    await steps.step('Its Overview shows a creator and a creation time', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(payer.nameEn);
      const createdBy = await detail.getFieldValue(METADATA_FIELDS.createdBy);
      const createdAt = await detail.getFieldValue(METADATA_FIELDS.createdAt);
      expect(isBlank(createdBy), `Created By should be populated; it read "${createdBy}"`).toBe(
        false,
      );
      expect(isBlank(createdAt), `Created At should be populated; it read "${createdAt}"`).toBe(
        false,
      );
    });

    await steps.step('And the creation time is a real, parseable moment', async () => {
      // Not a wall-clock assertion - the server stamps it and the tester cannot
      // set that clock. What the field must not be is unparseable junk.
      const detail = payerManagementPage.detail();
      const createdAt = await detail.getFieldValue(METADATA_FIELDS.createdAt);
      expect(
        Number.isNaN(Date.parse(createdAt)) && !/\d{4}|\d{1,2}[/:-]\d/.test(createdAt),
        `Created At should read as a date/time; it read "${createdAt}"`,
      ).toBe(false);
    });
  });

  // Azure test case 15798
  test('15798: should move the Modified metadata forward once an edit is approved', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    // An edit stages a draft; the published record's Modified stamp only moves
    // when the change is approved. So the edit is carried through approval here.
    test.slow();
    const before: Record<string, string> = {};

    await steps.critical('Navigate to the module and record the current metadata', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      for (const label of Object.values(METADATA_FIELDS)) {
        before[label] = await detail.getFieldValue(label);
      }
    });

    await steps.step('An edit is made and approved', async () => {
      await payerManagementPage.open();
      await payerManagementPage.editSingleFieldAndSave(
        publishedPayer.nameEn,
        EDIT_TRIGGER.label,
        EDIT_TRIGGER.first,
        EDIT_TRIGGER.kind,
      );
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
      await approvalManagementPage.approve(publishedPayer.nameEn);
    });

    await steps.step('The Modified metadata now reflects that edit', async () => {
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const modifiedAt = await detail.getFieldValue(METADATA_FIELDS.modifiedAt);
      const modifiedBy = await detail.getFieldValue(METADATA_FIELDS.modifiedBy);
      expect(isBlank(modifiedBy), `Modified By should be populated; it read "${modifiedBy}"`).toBe(
        false,
      );
      // The timestamp must have advanced. Compared as parsed moments where both
      // parse, and otherwise as "not identical" - a Modified At frozen across an
      // edit is the defect this guards.
      const prev = Date.parse(before[METADATA_FIELDS.modifiedAt]);
      const now = Date.parse(modifiedAt);
      const advanced = Number.isNaN(prev) || Number.isNaN(now)
        ? modifiedAt !== before[METADATA_FIELDS.modifiedAt]
        : now >= prev;
      expect(
        advanced,
        `Modified At should move forward on an edit; it was "${before[METADATA_FIELDS.modifiedAt]}" `
          + `and is now "${modifiedAt}"`,
      ).toBe(true);
    });

    await steps.step('While Created By and Created At are untouched', async () => {
      const detail = payerManagementPage.detail();
      for (const label of IMMUTABLE_FIELDS) {
        expect(
          await detail.getFieldValue(label),
          `${label} must not change when a payer is edited`,
        ).toBe(before[label]);
      }
    });
  });

  // Azure test case 15799
  test('15799: should keep Created static while Modified advances across sequential edits', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    const created: Record<string, string> = {};
    const modifiedSeen: string[] = [];

    await steps.critical('Navigate to the module and capture the creation metadata', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      for (const label of IMMUTABLE_FIELDS) created[label] = await detail.getFieldValue(label);
    });

    await steps.step('Two edits are made in turn', async () => {
      for (const value of [EDIT_TRIGGER.first, EDIT_TRIGGER.second]) {
        await payerManagementPage.open();
        await payerManagementPage.editSingleFieldAndSave(
          publishedPayer.nameEn,
          EDIT_TRIGGER.label,
          value,
          EDIT_TRIGGER.kind,
        );
        await payerManagementPage.open();
        await payerManagementPage.sendForApproval(publishedPayer.nameEn);
        await approvalManagementPage.open();
        await approvalManagementPage.approve(publishedPayer.nameEn);
        const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
        modifiedSeen.push(await detail.getFieldValue(METADATA_FIELDS.modifiedAt));
      }
      expect(modifiedSeen, 'both edits should have been recorded').toHaveLength(SEQUENTIAL_EDITS);
    });

    await steps.step('Each edit left its own Modified timestamp', async () => {
      // The second edit's Modified At must be at least as late as the first's -
      // a metadata that stopped updating after the first edit is the failure.
      const first = Date.parse(modifiedSeen[0]);
      const second = Date.parse(modifiedSeen[1]);
      const ordered = Number.isNaN(first) || Number.isNaN(second)
        ? true
        : second >= first;
      expect(
        ordered,
        `the second edit's Modified At should not predate the first's; saw `
          + `"${modifiedSeen[0]}" then "${modifiedSeen[1]}"`,
      ).toBe(true);
    });

    await steps.step('And Created By/At never moved through either edit', async () => {
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      for (const label of IMMUTABLE_FIELDS) {
        expect(
          await detail.getFieldValue(label),
          `${label} must be immutable across every edit`,
        ).toBe(created[label]);
      }
    });
  });

  // Azure test case 15800
  test('15800: should show a defined Modified value for a payer never edited since creation', async ({
    payerManagementPage,
    steps,
  }) => {
    const payer = buildUniquePayer();

    await steps.critical('Navigate to the module and create a payer left untouched', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(payer);
    });

    await steps.step('Its Modified fields hold a defined value, not a blank or an error', async () => {
      // The sheet allows the unmodified value to mirror creation or to carry a
      // clear indicator - what it forbids is a blank or broken field. So this
      // asserts "defined", not a specific string.
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(payer.nameEn);
      // The sheet allows an unmodified record to show a clear indicator rather
      // than a value - and this app shows a dash, which is exactly that.
      for (const label of MUTABLE_FIELDS) {
        const value = await detail.getFieldValue(label);
        expect(
          modifiedIsAcceptable(value),
          `${label} on an unedited payer should be a value or a clear indicator; it read "${value}"`,
        ).toBe(true);
      }
    });
  });

  // Azure test case 15806
  test('15806: should present every metadata field non-blank and correctly labelled', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and open a payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.openDetails(publishedPayer.nameEn);
    });

    await steps.step('All four audit fields are present and populated', async () => {
      // The checklist case: the four fields exist, read non-blank, and each is
      // reachable by its own label - which getFieldValue proves by resolving
      // the id behind that label.
      const detail = payerManagementPage.detail();
      // Created fields must be populated; Modified fields may show the
      // unmodified indicator, per the sheet.
      const missing: string[] = [];
      for (const label of IMMUTABLE_FIELDS) {
        const value = await detail.getFieldValue(label).catch(() => '');
        if (isBlank(value)) missing.push(`${label} = "${value}"`);
      }
      for (const label of MUTABLE_FIELDS) {
        const value = await detail.getFieldValue(label).catch(() => '');
        if (!modifiedIsAcceptable(value)) missing.push(`${label} = "${value}"`);
      }
      expect(
        missing,
        `every metadata field should be present and populated; these were not: ${missing.join('; ')}`,
      ).toEqual([]);
    });

    await steps.step('And they are read-only, offered nowhere on the edit form', async () => {
      // Metadata is server-stamped, so it must not be an editable field. The
      // edit story already proves the form has no id for these, which is exactly
      // what "not editable" means here.
      const form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
      for (const label of Object.values(METADATA_FIELDS)) {
        expect(
          await form.hasEditableField(label),
          `${label} is audit metadata and must not be editable`,
        ).toBe(false);
      }
      await form.closeAndDiscard();
    });
  });

  // Azure test case 15803
  test('15803: should show the metadata for a Draft payer and for an Active one alike', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    const draft = buildUniquePayer();

    await steps.critical('Navigate to the module and create a Draft payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(draft);
    });

    await steps.step('The Draft payer shows its creation metadata', async () => {
      // The reachable rows of the sheet's status decision table: Draft and
      // Active. Archived is not a status this module exposes, so it is not
      // asserted rather than faked.
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(draft.nameEn);
      expect(
        isBlank(await detail.getFieldValue(METADATA_FIELDS.createdBy)),
        'a Draft payer should still show who created it',
      ).toBe(false);
    });

    await steps.step('And an Active payer shows the same fields, fully populated', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      for (const label of IMMUTABLE_FIELDS) {
        expect(
          isBlank(await detail.getFieldValue(label)),
          `${label} should be populated for an Active payer`,
        ).toBe(false);
      }
      for (const label of MUTABLE_FIELDS) {
        expect(
          modifiedIsAcceptable(await detail.getFieldValue(label)),
          `${label} should be a value or a clear indicator for an Active payer`,
        ).toBe(true);
      }
    });
  });

  // Azure test case 15804
  test('15804: should carry the same metadata however the payer is reached', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    let viaSearch: Record<string, string> = {};

    await steps.critical('Navigate to the module and read the metadata via search', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      viaSearch = {};
      for (const label of Object.values(METADATA_FIELDS)) {
        viaSearch[label] = await detail.getFieldValue(label);
      }
    });

    await steps.step('Reaching the same payer afresh shows identical metadata', async () => {
      // The exploratory-navigation concern, made concrete: metadata carried over
      // from a previously viewed payer would show here as a mismatch. Reading
      // the record by a second independent path and comparing catches that.
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const mismatched: string[] = [];
      for (const label of Object.values(METADATA_FIELDS)) {
        const now = await detail.getFieldValue(label);
        if (now !== viaSearch[label]) mismatched.push(`${label}: "${viaSearch[label]}" -> "${now}"`);
      }
      expect(
        mismatched,
        `the metadata should not change with the path taken to it: ${mismatched.join('; ')}`,
      ).toEqual([]);
    });
  });

  // Azure test case 15802
  test('15802: should hold up when the creating user account no longer exists', async ({
    steps,
  }) => {
    steps.blocked(
      'This case needs a payer created by a user account that has since been deleted, and this '
      + 'suite must not delete a user account on a shared environment to set it up. Provide a '
      + 'payer whose creator was removed, or a disposable account to delete, then this case can '
      + 'check the Overview shows a historical identifier or a "Deactivated User" label rather '
      + 'than a blank field or an error.',
    );
  });
});

/** Access control, signed out of the shared administrator session. */
test.describe('Payer overview metadata - Access control', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // Azure test case 15805
  test('15805: should withhold the metadata from a role without rights to see it', async ({
    shapeRole,
    loginPage,
    payerManagementPage,
    steps,
  }) => {
    // The restricted account is BUILT, not waited for: the administrator takes the
    // permission off the shared "Payer Admin" role, this case signs in as that
    // account, and the permission goes back when the case ends. It used to report
    // BLOCKED because the only non-administrator here HELD the right.
    await shapeRole({ without: ['viewPayerDetails'] });

    await steps.critical('Sign in as the restricted user and open the payer list', async () => {
      await loginPage.open();
      await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);
      await payerManagementPage.navigate();
      await payerManagementPage.expectRowsRendered();
    });

    await steps.step('The metadata is hidden or the detail view is refused', async () => {
      const names = await payerManagementPage.getVisiblePayerNames();
      const detail = await payerManagementPage.openDetails(names[0]);
      const createdBy = await detail.getFieldValue(METADATA_FIELDS.createdBy).catch(() => '');
      expect(
        isBlank(createdBy),
        'a role without metadata rights should not be shown the creator',
      ).toBe(true);
    });
  });
});
