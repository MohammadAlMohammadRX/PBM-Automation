import { test, expect } from '../../../fixtures';
import type { PayerDetailPage } from '../../../pages/payer/PayerDetailPage';
import type { PayerVersionHistoryTab } from '../../../pages/payer/PayerVersionHistoryTab';
import {
  REQUIRED_TAB_COUNT,
  REQUIRED_TAB_ORDER,
  VERSION_LABEL,
  type VersionEntry,
} from '../../../data/payers/versionHistory.data';

/**
 * User story: Add Version History Tab to Payer Details.
 * The tab itself, and what it lists.
 *
 * TWO CASES HERE ASSERT THE ACCEPTANCE CRITERIA AND CURRENTLY FAIL. Both are
 * genuine divergences found in the live build, and each is written against the
 * criteria rather than the behaviour, so the report carries the defect instead
 * of blessing it:
 *
 *   TC-002  Tab order. The criteria require Version History to be the FIFTH
 *           tab, after Audit History. Live order is Overview, Linked Networks,
 *           Linked Policies, Version History, Audit History - the last two are
 *           swapped.
 *
 *   TC-003  Unapproved entries. The criteria require only approved (published)
 *           changes to be listed. Live, the tab also lists entries whose status
 *           is "Pending Approval" - observed as "v2 · Update · Pending
 *           Approval" sitting above "v1 · Create · Published".
 *
 * If either turns out to be a documentation error rather than a product one,
 * the fix is a one-line change to REQUIRED_TAB_ORDER / UNAPPROVED_STATUSES in
 * data/payers/versionHistory.data.ts - not a change to any test.
 *
 * NOTE ON STRUCTURE: each test opens the payer detail screen ONCE and keeps the
 * resulting Page Object. Re-deriving it per step means re-navigating through
 * the 35-page list every time, which is both slow and fragile - and after a
 * rename the old name is no longer there to search for.
 */
test.describe('Add Version History Tab to Payer Details - Tab and contents', () => {
  test('TC-002: should present all five tabs in the specified order', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    let detail: PayerDetailPage;
    let tabs: string[] = [];
    await steps.critical('Open the payer detail screen', async () => {
      detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.waitForLoaded();
      tabs = await detail.getTabOrder();
    });

    await steps.step(`The strip renders exactly ${REQUIRED_TAB_COUNT} tabs`, async () => {
      expect(tabs, `tabs rendered: ${tabs.join(', ')}`).toHaveLength(REQUIRED_TAB_COUNT);
    });

    await steps.step('Every tab is enabled', () => detail.expectAllTabsEnabled());

    // Read from the ids in DOM order, so this holds in Arabic too - the
    // captions are translated, the ids are not.
    await steps.step('The tabs appear in the order the criteria specify', async () => {
      expect(
        tabs,
        'the acceptance criteria require Overview, Linked Networks, Linked Policies, Audit '
          + 'History, Version History - with Version History added as the FIFTH tab',
      ).toEqual([...REQUIRED_TAB_ORDER]);
    });
  });

  test('TC-001: should list the payer’s approved changes, newest first', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    // The fixture gives a payer with ONE approved version (v1). A second
    // approved version is built here, because "lists all approved changes" and
    // "in reverse chronological order" are both claims about a history with
    // more than one entry - a single-entry history would satisfy either by
    // accident.
    //
    // The payer is edited on a field OTHER than its name on purpose: renaming
    // it would leave the fixture's teardown unable to find the record, and
    // every later step would have to know the new name.
    const newLicense = `LIC-V2-${Date.now()}`;

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Make and approve a second change to the payer', async () => {
      await payerManagementPage.editTextFieldAndSave(
        publishedPayer.nameEn,
        'License Number',
        newLicense,
      );
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.approve(publishedPayer.nameEn);
    });

    let history: PayerVersionHistoryTab;
    let versions: string[] = [];
    await steps.critical('Open the Version History tab', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.waitForLoaded();
      history = detail.versionHistory();
      await history.open();
      await history.expectTabActive();
      versions = await history.getVersionLabels();
    });

    await steps.step('Both approved changes are listed', async () => {
      expect(
        versions,
        `Version History should list ${VERSION_LABEL.firstPublished} and `
          + `${VERSION_LABEL.firstEdit}; it listed: ${versions.join(', ')}`,
      ).toEqual(
        expect.arrayContaining([VERSION_LABEL.firstPublished, VERSION_LABEL.firstEdit]),
      );
    });

    await steps.step('The entries run in reverse chronological order', () =>
      history.expectReverseChronologicalOrder());
  });

  test('TC-003: should exclude pending, rejected and draft changes', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    // The payer arrives published at v1. An edit is staged and deliberately
    // LEFT unapproved, which is the mixed-status history the case needs: one
    // approved change plus one awaiting review.
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Stage an edit and leave it awaiting approval', async () => {
      await payerManagementPage.editTextFieldAndSave(
        publishedPayer.nameEn,
        'License Number',
        `LIC-PENDING-${Date.now()}`,
      );
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
    });

    let history: PayerVersionHistoryTab;
    let statuses: string[] = [];
    await steps.critical('Open the Version History tab', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.waitForLoaded();
      history = detail.versionHistory();
      await history.open();
      statuses = await history.getListedStatuses();
    });

    await steps.step('The approved change is listed', async () => {
      expect(
        statuses.some((status) => status.includes('Published')),
        `the published change must be listed; statuses listed: ${statuses.join(', ')}`,
      ).toBe(true);
    });

    // The story's central rule, and the one the build does not honour.
    await steps.step('Only approved changes are listed', () =>
      history.expectOnlyPublishedVersions());
  });

  test('TC-005: should show exactly one entry for a payer with one approved change', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    // `publishedPayer` is created and approved once and then left alone, so it
    // has exactly one approved version - the boundary this case is about.
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    let history: PayerVersionHistoryTab;
    let entries: VersionEntry[] = [];

    await steps.critical('Open the Version History tab', async () => {
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.waitForLoaded();
      history = detail.versionHistory();
      await history.open();
      entries = await history.getEntries();
    });

    await steps.step('Exactly one entry is listed, with no duplication', async () => {
      expect(
        entries.map((entry) => `${entry.version} ${entry.status}`),
        'a payer approved once should have a single-entry version history',
      ).toHaveLength(1);
    });

    await steps.step('That entry carries its version, date, approver and change', () =>
      history.expectEveryEntryComplete());
  });

  test('TC-008: should show every mandatory field on each entry', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    let history: PayerVersionHistoryTab;
    await steps.critical('Open the Version History tab', async () => {
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.waitForLoaded();
      history = detail.versionHistory();
      await history.open();
      await history.expectTableVisible();
    });

    // Version, change type, status, requester and request timestamp are
    // required on every entry; the REVIEWER fields are required only on
    // published ones, because a version still awaiting review has no reviewer -
    // demanding one everywhere would report a defect that is not one. That
    // distinction lives in the Page Object so the test stays a statement of
    // intent.
    await steps.step('Every entry is complete', () => history.expectEveryEntryComplete());

    await steps.step('An entry opens its own detail view', async () => {
      await history.openEntry(VERSION_LABEL.firstPublished);
      await history.expectEntryDrawerOpen();
    });
  });

  test('TC-011: should agree with the Audit History tab for the same changes', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    let detail: PayerDetailPage;
    let changeType = '';
    let approver = '';
    let reviewedOn = '';
    await steps.critical('Read the published version’s details', async () => {
      detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.waitForLoaded();
      const history = detail.versionHistory();
      await history.open();
      changeType = await history.getCell(VERSION_LABEL.firstPublished, 'changeType');
      approver = await history.getCell(VERSION_LABEL.firstPublished, 'reviewedBy');
      reviewedOn = await history.getCell(VERSION_LABEL.firstPublished, 'reviewedOn');
      expect(approver, 'the published version must name its approver').not.toBe('');
    });

    // The Audit tab is a TIMELINE with no per-column ids - each event is one
    // element whose text reads e.g. "Create | 29/08/2026 03:57 AM | By:
    // CareConnect". So the comparison is made on the values both surfaces
    // express comparably: the change type and the date.
    await steps.critical('Open the Audit History tab', () => detail.openAuditHistory());

    await steps.step('The audit trail records the same change type', () =>
      detail.expectAuditEntryMatching(
        new RegExp(changeType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
        `an entry for the "${changeType}" change that Version History reports for `
          + VERSION_LABEL.firstPublished,
      ));

    // Date only, without the time: Version History renders "29/08/2026 03:57"
    // and the audit timeline "29/08/2026 03:57 AM", so comparing the full
    // strings would fail on the clock format rather than on any inconsistency.
    await steps.step('The audit trail records the same date', async () => {
      const date = reviewedOn.split(' ')[0];
      expect(date, 'the published version must carry an approval date').toMatch(/\d/);
      await detail.expectAuditEntryMatching(
        new RegExp(date.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        `an entry dated ${date}, as Version History reports for `
          + VERSION_LABEL.firstPublished,
      );
    });

    // The approver is compared on a NORMALISED basis, because the two surfaces
    // render the same person differently - Version History shows the display
    // name ("CareConnect Admin User") while the audit timeline shows the
    // account name ("CareConnect"). Requiring an exact match would report a
    // naming-convention difference as a data inconsistency; requiring a common
    // root still catches the case where the two tabs credit different people,
    // which is what the criterion is actually about.
    await steps.step('The audit trail credits the same user', async () => {
      const root = approver.split(/\s+/)[0];
      expect(root, 'the approver name must have a comparable root').not.toBe('');
      await detail.expectAuditEntryMatching(
        new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
        `an entry crediting "${root}", the approver Version History reports (note the two `
          + `tabs use different name forms: "${approver}" vs the account name)`,
      );
    });
  });
});
