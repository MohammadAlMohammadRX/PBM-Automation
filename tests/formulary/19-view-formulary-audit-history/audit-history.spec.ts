import { test, expect } from '../../../fixtures';
import type { AuditEntry } from '../../../pages/components/AuditHistoryTab';
import { ACTION_LABEL, BLANK_VALUE, CASES, EMPTY_AUDIT, FIELD } from '../../../data/formulary/auditHistory.data';
import { attemptEditSave, auditTime } from '../../../utils/formulary/writerCHelpers';
import {
  addPricingPeriod,
  approveFormulary,
  deletePricingPeriod,
  readAuditTrail,
  readPriceHistory,
  updateFormularyFields,
  updatePricingPeriod,
} from '../../../utils/FormularyProvisioning';

/** Whether the timeline reads newest first. */
const newestFirst = (entries: AuditEntry[]): boolean => entries.every((e, i) => i === 0 || auditTime(entries[i - 1].when) >= auditTime(e.when));

/**
 * User story 15216: View Formulary - Audit History.
 * A dedicated trail records every user action and change on a formulary -
 * who, when, which field, the value before and after (View Details) - behind
 * its own permission (audit-permission.spec.ts). Readings of the ambiguous
 * cases: data/formulary/auditHistory.data.ts.
 */
test.describe('US 15216 - View Formulary - Audit History', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.reviewHistory.azureId}: should list the formulary's recorded actions in chronological order`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyAuditTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Future');

    await steps.critical('Navigate to the Formulary Management module - it loads and lists formularies', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open a formulary with recorded changes - its details page shows every tab including Audit History', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      expect(await formularyDetailPage.hasTab('audit')).toBe(true);
    });

    await steps.step('Select the Audit History tab - a chronological list of the recorded actions is displayed', async () => {
      await formularyAuditTab.open();
      const entries = await formularyAuditTab.readAllEntries();
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.filter((e) => Number.isNaN(auditTime(e.when))).map((e) => e.when), 'entries without a readable time').toEqual([]);
      expect(newestFirst(entries), entries.map((e) => `${e.action} ${e.when}`).join(' | ')).toBe(true);
    });
  });

  test(`TC-${CASES.previousAndNew.azureId}: should show the field, its previous value and its new value in an entry's details`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyAuditTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft');
    const moved = new Date(new Date(formulary.expiryDate).getTime() + CASES.previousAndNew.moveExpiryDays * 86_400_000).toISOString();

    await steps.critical('Precondition: the expiry date is changed, so an audit entry exists for a field update', async () => {
      expect((await updateFormularyFields(page, formulary.id, { expiryDate: moved })).status).toBe(200);
    });

    await steps.critical('Navigate to the Formulary Management module - it loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the formulary and go to the Audit History tab - the audit entries are displayed', async () => {
      await formularyDetailPage.open(formulary.id);
      await formularyAuditTab.expectEntry(ACTION_LABEL.update);
    });

    await steps.step('Click View details on the field-update entry - a details panel opens', async () => {
      const detail = await formularyAuditTab.openEntry(0);
      expect(detail.action).not.toBe('');
      await formularyAuditTab.closeEntry();
    });

    await steps.step('Review the panel - it shows the field name, its previous value and its new value', async () => {
      const changes = await formularyAuditTab.findChanges(FIELD.expiry);
      expect(changes.length, 'an entry listing the Expiry Date change').toBeGreaterThan(0);
      expect(changes[0].before).not.toMatch(BLANK_VALUE);
      expect(changes[0].after).not.toMatch(BLANK_VALUE);
      expect(changes[0].after).not.toBe(changes[0].before);
    });
  });

  test(`TC-${CASES.emptyAndLarge.azureId}: should show an empty state for no changes and load a large trail without errors`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyAuditTab,
    formularyIn,
    steps,
  }) => {
    test.setTimeout(30 * 60_000);
    const data = CASES.emptyAndLarge;
    const quiet = await formularyIn('Draft');
    const busy = await formularyIn('Draft');

    await steps.critical(`Precondition: one formulary has no recorded change, the other ${data.minimum}+ entries`, async () => {
      for (let n = 1; n <= data.saves; n += 1) {
        const saved = await updateFormularyFields(page, busy.id, { descriptionEn: `Audit volume change ${n}` });
        expect(saved.status, `save ${n}`).toBe(200);
      }
      const total = (await readAuditTrail(page, busy.id)).totalRows;
      if (total < data.minimum) {
        steps.blocked(`Needs a formulary with ${data.minimum}+ audit entries. ${data.saves} saves of a draft formulary's description left its trail `
          + `at ${total} entries, so the large-volume formulary cannot be built this way.`);
      }
      expect(total).toBeGreaterThanOrEqual(data.minimum);
    });

    await steps.critical('Navigate to the Formulary Management module - it loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(quiet.nameEn)).toBe(true);
    });

    await steps.step('Open the formulary with no recorded changes and select Audit History - an empty-state message is shown', async () => {
      await formularyDetailPage.open(quiet.id);
      await formularyAuditTab.open();
      expect(await formularyAuditTab.readEntries()).toEqual([]);
      expect(await formularyAuditTab.getPanelText()).toMatch(EMPTY_AUDIT);
    });

    await steps.step('Open the formulary with many changes and select Audit History - a paginated list loads without errors or timeouts', async () => {
      await formularyDetailPage.open(busy.id);
      await formularyAuditTab.open();
      expect((await formularyAuditTab.readEntries()).length).toBeGreaterThan(0);
      expect(await formularyAuditTab.hasNextPage(), 'a further page of entries').toBe(true);
      expect((await formularyAuditTab.readAllEntries()).length).toBeGreaterThanOrEqual(data.minimum);
    });
  });

  test(`TC-${CASES.createUpdateDelete.azureId}: should record distinct entries for creating, updating and deleting a price record`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyAuditTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft');
    const tradeId = formulary.trades[0].id;
    let periodId = '';

    await steps.critical('Navigate to the Formulary Management module - it loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Create a new price history record on a trade - it is created and saved', async () => {
      const from = new Date(new Date(formulary.expiryDate).getTime() + 3_600_000);
      const added = await addPricingPeriod(page, tradeId, { effectiveFrom: from.toISOString(), effectiveTo: new Date(from.getTime() + 30 * 86_400_000).toISOString() });
      expect(added.status, added.text.slice(0, 200)).toBe(200);
      periodId = added.id ?? '';
      expect(periodId).not.toBe('');
    });

    await steps.step('Update an existing field (Discount %) on the price record - the update is saved', async () => {
      const updated = await updatePricingPeriod(page, tradeId, periodId, { discountPercentage: CASES.createUpdateDelete.discount });
      expect(updated.status, updated.text.slice(0, 200)).toBe(200);
    });

    await steps.step('Delete the future price record - it is removed', async () => {
      expect((await deletePricingPeriod(page, periodId)).status).toBe(200);
      expect((await readPriceHistory(page, tradeId)).map((p) => p.id)).not.toContain(periodId);
    });

    await steps.step('Open the Audit History tab - it holds a distinct entry for the create, the update and the delete', async () => {
      await formularyDetailPage.open(formulary.id);
      await formularyAuditTab.expectEntry(ACTION_LABEL.delete);
      const actions = (await formularyAuditTab.readAllEntries()).map((e) => e.action);
      expect({
        create: actions.some((a) => ACTION_LABEL.create.test(a)),
        update: actions.some((a) => ACTION_LABEL.update.test(a)),
        delete: actions.some((a) => ACTION_LABEL.delete.test(a)),
      }, actions.join(' | ')).toEqual({ create: true, update: true, delete: true });
    });
  });

  test(`TC-${CASES.immediateEntry.azureId}: should add one new entry for the change as soon as it is saved`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyAuditTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft');
    let before = 0;

    await steps.critical('Navigate to the Formulary Management module - it loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open a formulary and note its number of audit entries - the count is visible', async () => {
      await formularyDetailPage.open(formulary.id);
      await formularyAuditTab.open();
      before = (await formularyAuditTab.readAllEntries()).length;
      expect(before).toBeGreaterThanOrEqual(0);
    });

    await steps.critical('Edit the Description and save - the change is saved', async () => {
      const drawer = await formularyDetailPage.openEditDrawer();
      await drawer.type('descriptionEn', CASES.immediateEntry.description);
      expect((await attemptEditSave(drawer)).status).toBe(200);
    });

    await steps.step('Return to the Audit History tab and refresh - one new entry reflecting the change has appeared', async () => {
      await formularyAuditTab.expectEntry(ACTION_LABEL.update);
      const after = await formularyAuditTab.readAllEntries();
      expect(after.length).toBe(before + 1);
      expect(after[0].action).toMatch(ACTION_LABEL.update);
    });
  });

  test(`TC-${CASES.sameFieldOrder.azureId}: should keep each change of the same field as its own entry in order with the right values`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyAuditTab,
    formularyIn,
    steps,
  }) => {
    const vats = CASES.sameFieldOrder.vats;
    const formulary = await formularyIn('Draft');
    const tradeId = formulary.trades[0].id;

    await steps.critical('Navigate to the Formulary Management module - it loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step(`Change the same field (VAT %) three times in a row - ${vats.join(', ')} - each change is saved`, async () => {
      const periodId = (await readPriceHistory(page, tradeId))[0].id;
      const statuses: number[] = [];
      for (const vat of vats) statuses.push((await updatePricingPeriod(page, tradeId, periodId, { vatPercentage: vat })).status);
      expect(statuses).toEqual(vats.map(() => 200));
    });

    await steps.step('Open the Audit History tab - the audit list loads', async () => {
      await formularyDetailPage.open(formulary.id);
      await formularyAuditTab.open();
      expect((await formularyAuditTab.readEntries()).length).toBeGreaterThanOrEqual(vats.length);
    });

    await steps.step('Open View details on each of the three entries - each shows its own previous and new VAT %, newest first', async () => {
      const changes = (await formularyAuditTab.findChanges(FIELD.vat)).map((c) => [parseFloat(c.before) || 0, parseFloat(c.after)]);
      expect(changes.slice(0, vats.length)).toEqual([[vats[1], vats[2]], [vats[0], vats[1]], [0, vats[0]]]);
    });
  });

  test(`TC-${CASES.blankToValue.azureId}: should show a blank previous value and the new value when an empty optional field is filled`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyAuditTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.blankToValue;
    const formulary = await formularyIn('Draft', { descriptionEn: null, descriptionAr: null });

    await steps.critical('Navigate to the Formulary Management module - it loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open a formulary and add a value to its empty optional Description - the change is saved', async () => {
      await formularyDetailPage.open(formulary.id);
      const drawer = await formularyDetailPage.openEditDrawer();
      expect(await drawer.getValue('descriptionEn')).toBe('');
      await drawer.type('descriptionEn', data.description);
      expect((await attemptEditSave(drawer)).status).toBe(200);
    });

    await steps.step('Open Audit History and View details on that entry - previous value blank / None, new value the text entered', async () => {
      await formularyAuditTab.expectEntry(ACTION_LABEL.update);
      const change = (await formularyAuditTab.findChanges(FIELD.description))[0];
      expect(change, 'an entry listing the Description change').toBeDefined();
      expect(change?.before ?? 'missing').toMatch(BLANK_VALUE);
      expect(change?.after).toBe(data.description);
    });
  });

  test(`TC-${CASES.approvalAudited.azureId}: should record the approval decision with the previous and new approval status`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyAuditTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('PendingApproval');

    await steps.critical('Navigate to the Formulary Management module - it loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the formulary with its price records pending approval and approve it - the decision is recorded', async () => {
      await approveFormulary(page, formulary.nameEn);
      await formularyDetailPage.open(formulary.id);
      expect(await formularyDetailPage.getVersionBadge()).toMatch(/Approved/);
    });

    await steps.step('Open the Audit History tab - it holds the approval entry with the previous and new approval status', async () => {
      await formularyAuditTab.expectEntry(ACTION_LABEL.approved);
      const changes = await formularyAuditTab.findChanges(FIELD.status);
      expect(changes.length, 'an entry listing a status change').toBeGreaterThan(0);
      expect(changes[0].after).not.toBe(changes[0].before);
    });
  });

  test(`TC-${CASES.whoAndWhen.azureId}: should show who made each change and when, with the field and its values`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyAuditTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Future');

    await steps.critical('Navigate to the Formulary Management module - it loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open a formulary and select the Audit History tab - the audit list loads', async () => {
      await formularyDetailPage.open(formulary.id);
      await formularyAuditTab.open();
      expect((await formularyAuditTab.readEntries()).length).toBeGreaterThan(0);
    });

    await steps.step('Review an entry and its View details panel - user, date / time, field and previous / new values are shown', async () => {
      const entries = await formularyAuditTab.readEntries();
      expect(entries.filter((e) => e.by === '' || Number.isNaN(auditTime(e.when))).map((e) => e.action), 'entries without user or time').toEqual([]);
      const details = await formularyAuditTab.readEntryDetails(entries.length);
      expect(details.filter((d) => d.detail.meta === '').map((d) => d.action), 'panels without time / user').toEqual([]);
      const withChange = details.find((d) => d.detail.changes.some((c) => c.field !== '' && c.before !== c.after));
      expect(withChange, 'a panel listing a field with its previous and new values').toBeDefined();
    });
  });
});
