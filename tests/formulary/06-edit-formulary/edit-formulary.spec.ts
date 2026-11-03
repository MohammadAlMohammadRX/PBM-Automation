import { test, expect } from '../../../fixtures';
import type { FormularyFormDrawer } from '../../../pages/formulary/FormularyFormDrawer';
import type { BenefitConfigDrawer } from '../../../pages/formulary/BenefitConfigDrawer';
import type { FormularyPriceHistoryDrawer } from '../../../pages/formulary/FormularyPriceHistoryDrawer';
import { FORMULARY_STATUS, MESSAGE, VERSION_STATUS } from '../../../data/formulary/formulary.data';
import { CASES, CONFLICT, INVALID_FORMAT, UNSAVED_PROMPT, suiteNameOfLength } from '../../../data/formulary/editFormulary.data';
import {
  attemptEditSave,
  clickListRowEdit,
  closeFormDrawerReadingPrompt,
  findExpiredFormulary,
  listRowEditState,
} from '../../../utils/formulary/writerCHelpers';
import { readBenefitConfigs, readPriceHistory, readVersions } from '../../../utils/FormularyProvisioning';

/**
 * User story 15196: Edit Formulary.
 * A formulary's own details are edited (list Edit or the view page's Edit
 * Metadata) only while it is a v0 draft, with the create rules; tiers, trades,
 * price history and benefit configurations stay editable on a published
 * formulary, and every change passes the approval gate before it applies.
 * Readings of the ambiguous cases: data/formulary/editFormulary.data.ts.
 */
test.describe('US 15196 - Edit Formulary', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.listEdit.azureId}: should open the pre-populated edit form and save the change when a draft is edited from the list`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyFormDrawer,
    formularyIn,
    steps,
  }) => {
    const data = CASES.listEdit;
    const formulary = await formularyIn('Draft');

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Locate the draft formulary in the list - the Edit action is visible and enabled', async () => {
      await formularyManagementPage.revealRow(formulary.nameEn);
      expect(await listRowEditState(page, formulary.id), 'the draft row\'s Edit action').toBe('available');
    });

    await steps.critical('Select Edit and modify the details - the edit form opens pre-populated with the current data', async () => {
      await clickListRowEdit(page, formulary.id);
      await formularyFormDrawer.waitForOpen();
      await formularyFormDrawer.waitForLoadedValues();
      expect(await formularyFormDrawer.getValue('nameEn')).toBe(formulary.nameEn);
      await formularyFormDrawer.type('descriptionEn', data.description);
      expect(await formularyFormDrawer.getValue('descriptionEn')).toBe(data.description);
    });

    await steps.step('Save the changes - they are submitted successfully', async () => {
      const answer = await attemptEditSave(formularyFormDrawer);
      expect(answer.status, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBe(200);
      expect((await formularyDetailPage.readViaApi(formulary.id)).descriptionEn).toBe(data.description);
    });
  });

  test(`TC-${CASES.detailEdit.azureId}: should save the update when a draft's details are edited from the view page`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyIn,
    steps,
  }) => {
    const data = CASES.detailEdit;
    const formulary = await formularyIn('Draft');
    let drawer!: FormularyFormDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the draft formulary\'s view page - its details display with an edit option available', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      expect(await formularyDetailPage.getName()).toBe(formulary.nameEn);
      expect(await formularyDetailPage.getActionAvailability('edit')).toBe('available');
    });

    await steps.critical('Select edit and update the details - the fields become editable', async () => {
      drawer = await formularyDetailPage.openEditDrawer();
      await drawer.type('descriptionEn', data.description);
      expect(await drawer.getValue('descriptionEn')).toBe(data.description);
    });

    await steps.step('Save the changes - the updates are saved', async () => {
      const answer = await attemptEditSave(drawer);
      expect(answer.status, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBe(200);
      await formularyDetailPage.open(formulary.id);
      expect(await formularyDetailPage.readOverviewField('description')).toContain(data.description);
    });
  });

  test(`TC-${CASES.editOnlyInDraft.azureId}: should offer editing of the details only while the formulary is a v0 draft`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyIn,
    steps,
  }) => {
    const expired = await findExpiredFormulary(page).catch(() => null);
    if (expired === null) {
      steps.blocked('Needs a formulary in status Expired. Expired cannot be produced on demand (the formulary lifecycle job is daily) and '
        + 'the register holds no Expired formulary to look at read-only. Runnable once one exists.');
    }
    const draft = await formularyIn('Draft');
    const published = await formularyIn('Future');
    const pending = await formularyIn('PendingApproval');
    const inactive = await formularyIn('Inactive');
    const editOn = async (id: string): Promise<string> => {
      await formularyDetailPage.open(id);
      return formularyDetailPage.getActionAvailability('edit');
    };

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(draft.nameEn)).toBe(true);
    });

    await steps.step('Check the edit availability for the draft formulary - edit is available', async () => {
      expect(await editOn(draft.id)).toBe('available');
      await formularyManagementPage.revealRow(draft.nameEn);
      expect(await listRowEditState(page, draft.id), 'the list row\'s Edit').toBe('available');
    });

    await steps.step('Check the edit availability for the published formulary - edit is not available', async () => {
      expect(await editOn(published.id)).not.toBe('available');
      await formularyManagementPage.revealRow(published.nameEn);
      expect(await listRowEditState(page, published.id), 'the list row\'s Edit').not.toBe('available');
    });

    await steps.step('Check the edit availability for the pending approval, inactive and expired formularies - edit is not available for any', async () => {
      const offered = {
        pendingApproval: await editOn(pending.id),
        inactive: await editOn(inactive.id),
        expired: await editOn(expired!.id),
      };
      expect(offered).toEqual({ pendingApproval: expect.not.stringMatching(/^available$/), inactive: expect.not.stringMatching(/^available$/), expired: expect.not.stringMatching(/^available$/) });
    });
  });

  test(`TC-${CASES.publishedListEdit.azureId}: should not offer the list Edit action when the formulary is published`, async ({
    page,
    formularyManagementPage,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Future');

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Locate the published formulary in the list - the record displays with its current status', async () => {
      const row = await formularyManagementPage.readRow(formulary.nameEn);
      expect(row.status).toBe(FORMULARY_STATUS.future);
      expect(row.approvalStatus).toMatch(/Approved/);
    });

    await steps.step('Check for the Edit action on this record - it is not shown or disabled', async () => {
      expect(await listRowEditState(page, formulary.id)).not.toBe('available');
    });
  });

  test(`TC-${CASES.publishedBenefitEdit.azureId}: should route a benefit configuration change on a published formulary through the approval gate`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.publishedBenefitEdit;
    const formulary = await formularyIn('Future', { benefitConfigs: 1 });
    const tradeId = formulary.trades[0].id;
    let drawer!: BenefitConfigDrawer;
    let configId = '';

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the published formulary\'s view page - the benefit configuration section is visible and editable', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openBenefitConfigs(tradeId);
      configId = (await drawer.readConfigIds())[0] ?? '';
      expect(configId, 'a benefit configuration card').not.toBe('');
      expect(await drawer.getCardActionAvailability(configId, 'edit')).toBe('available');
    });

    await steps.critical('Modify the benefit configuration values - the new values are entered', async () => {
      await drawer.openEdit(configId);
      await drawer.type('copaymentAmount', data.copayment);
      expect(await drawer.getValue('copaymentAmount')).toContain(String(data.copayment));
    });

    await steps.step('Save the changes - the change is submitted for approval, not applied', async () => {
      const answer = await drawer.attemptSave();
      expect(answer.status, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBe(200);
      const record = await formularyDetailPage.readViaApi(formulary.id);
      expect(record.hasDraft === true || record.hasPendingVersion === true, 'the formulary should carry the change as a draft / pending version').toBe(true);
    });
  });

  test(`TC-${CASES.noEffectUntilApproved.azureId}: should apply the metadata edit only once it has been approved`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyApprovalsPage,
    formularyIn,
    page,
    steps,
  }) => {
    const data = CASES.noEffectUntilApproved;
    const formulary = await formularyIn('Draft', { tiers: 1, trades: 1 });

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Submit a metadata edit on the draft formulary - the edit is submitted', async () => {
      await formularyDetailPage.open(formulary.id);
      const drawer = await formularyDetailPage.openEditDrawer();
      await drawer.type('descriptionEn', data.description);
      const saved = await attemptEditSave(drawer);
      expect(saved.status, saved.messages.join(' | ')).toBe(200);
      const sent = await formularyDetailPage.sendForApproval();
      expect(sent.status, sent.text.slice(0, 200)).toBe(200);
    });

    await steps.step('Check whether the change is visible on the live record - nothing has taken effect pending approval', async () => {
      await formularyDetailPage.open(formulary.id);
      expect(await formularyDetailPage.getStatus()).toBe(FORMULARY_STATUS.notLive);
      const published = (await readVersions(page, formulary.id)).filter((v) => v.versionStatusCode === 'published');
      expect(published, 'no version should be published before the approval').toEqual([]);
    });

    await steps.critical('Approve the pending change as an approver - the change is approved', async () => {
      await formularyApprovalsPage.open();
      await formularyApprovalsPage.approve(formulary.nameEn);
      expect((await readVersions(page, formulary.id)).some((v) => v.versionStatusCode === 'published')).toBe(true);
    });

    await steps.step('Recheck the formulary record - the updated data is now reflected', async () => {
      await formularyDetailPage.open(formulary.id);
      expect(await formularyDetailPage.getStatus()).toBe(FORMULARY_STATUS.future);
      expect(await formularyDetailPage.readOverviewField('description')).toContain(data.description);
    });
  });

  test(`TC-${CASES.publishedPriceEdit.azureId}: should route a trade's price history change on a published formulary through the approval gate`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.publishedPriceEdit;
    const formulary = await formularyIn('Future', { extraPricePeriods: 1 });
    const tradeId = formulary.trades[0].id;
    let drawer!: FormularyPriceHistoryDrawer;
    let periodId = '';

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the published formulary\'s view page - its details, tiers and trades display', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      expect(await formularyDetailPage.readTabCount('tiers')).toBe(formulary.tiers.length);
      expect(await formularyDetailPage.readTabCount('trades')).toBe(formulary.trades.length);
    });

    await steps.critical('Select a trade and update its price history - the price history form opens with the existing data', async () => {
      const periods = await readPriceHistory(page, tradeId);
      const latest = [...periods].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
      periodId = latest.id;
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openPriceHistory(tradeId);
      await drawer.openEditRecord(periodId);
      expect(Number(await drawer.getRecordValue('supplierPrice'))).toBe(latest.supplierPrice);
      await drawer.typeRecord('supplierPrice', data.supplierPrice);
    });

    await steps.step('Save the change - it is submitted for approval, not applied', async () => {
      const answer = await drawer.attemptSave();
      expect(answer.status, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBe(200);
      const record = await formularyDetailPage.readViaApi(formulary.id);
      const period = (await readPriceHistory(page, tradeId)).find((p) => p.id === periodId);
      expect(record.hasDraft === true || record.hasPendingVersion === true || period?.isDraft === true,
        'the price change should be staged for approval (formulary draft / pending, or a draft period)').toBe(true);
    });
  });

  test(`TC-${CASES.draftToApproved.azureId}: should move the formulary through Pending Approval to Approved as its edit goes through the workflow`, async ({
    formularyDetailPage,
    formularyManagementPage,
    formularyApprovalsPage,
    formularyIn,
    steps,
  }) => {
    const data = CASES.draftToApproved;
    const formulary = await formularyIn('Draft', { tiers: 1, trades: 1 });

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Edit the draft formulary\'s details and submit the change - the submission is accepted', async () => {
      await formularyDetailPage.open(formulary.id);
      const drawer = await formularyDetailPage.openEditDrawer();
      await drawer.type('descriptionEn', data.description);
      expect((await attemptEditSave(drawer)).status).toBe(200);
      const sent = await formularyDetailPage.sendForApproval();
      expect(sent.status, sent.text.slice(0, 200)).toBe(200);
    });

    await steps.critical('Check the formulary\'s status - it transitions to Pending Approval', async () => {
      await formularyDetailPage.open(formulary.id);
      expect(await formularyDetailPage.getVersionBadge()).toMatch(/Pending Approval/);
    });

    await steps.step('Have an approver approve the change - the status transitions to Approved / Published', async () => {
      await formularyApprovalsPage.open();
      await formularyApprovalsPage.approve(formulary.nameEn);
      await formularyDetailPage.open(formulary.id);
      expect(await formularyDetailPage.getVersionBadge()).toMatch(/Approved/);
      expect(await formularyDetailPage.getStatus()).toBe(FORMULARY_STATUS.future);
    });
  });

  test(`TC-${CASES.rejectedEdit.azureId}: should keep the original data and status and record the reason when the edit is rejected`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyApprovalsPage,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('PendingChange');
    const before = await formularyDetailPage.readViaApi(formulary.id);

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the pending edit as an approver - its details and a rejection option display', async () => {
      await formularyApprovalsPage.open();
      const offered = await formularyApprovalsPage.getDecisionAvailability(formulary.nameEn);
      expect(offered).toEqual({ inQueue: true, approve: expect.any(Boolean), reject: true });
    });

    await steps.critical('Reject the change with a reason - the rejection is recorded', async () => {
      const decided = await formularyApprovalsPage.decideWithComment(formulary.nameEn, 'reject', 'Rejected edit - original data must stay.');
      expect(decided.stillQueued, decided.answer).toBe(false);
    });

    await steps.step('Check the formulary record - it keeps its original data and status, with the rejection reason recorded', async () => {
      await formularyDetailPage.open(formulary.id);
      expect(await formularyDetailPage.getStatus()).toBe(FORMULARY_STATUS.active);
      const after = await formularyDetailPage.readViaApi(formulary.id);
      expect({ name: after.formularyNameEn, description: after.descriptionEn, effective: after.effectiveDate, expiry: after.expiryDate })
        .toEqual({ name: before.formularyNameEn, description: before.descriptionEn, effective: before.effectiveDate, expiry: before.expiryDate });
      const rejected = (await readVersions(page, formulary.id)).find((v) => v.versionStatusCode === 'rejected');
      expect(rejected, 'a Rejected version').toBeDefined();
      expect(`${rejected?.reviewNote ?? ''} ${String(after.rejectionReason ?? '')}`.trim(), 'the rejection reason').not.toBe('');
    });
  });

  test(`TC-${CASES.requiredOnEdit.azureId}: should block the save with a required-field message when the formulary name is cleared on edit`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft');
    let drawer!: FormularyFormDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the draft formulary for editing and clear the formulary name - the field is left empty', async () => {
      await formularyDetailPage.open(formulary.id);
      drawer = await formularyDetailPage.openEditDrawer();
      await drawer.clear('nameEn');
      expect(await drawer.getValue('nameEn')).toBe('');
    });

    await steps.step('Attempt to save the edit - the form is validated and the save blocked with a required-field message', async () => {
      const answer = await attemptEditSave(drawer);
      expect(answer.status === -1 || answer.status >= 400, `the save answered ${answer.status}`).toBe(true);
      expect(answer.errors.nameEn ?? answer.messages.join(' | ')).toMatch(MESSAGE.required);
      expect((await formularyDetailPage.readViaApi(formulary.id)).formularyNameEn).toBe(formulary.nameEn);
    });
  });

  test(`TC-${CASES.nameLengthOnEdit.azureId}: should accept a name at the maximum length and flag one character more on edit`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft');
    let drawer!: FormularyFormDrawer;
    let max: number = CASES.nameLengthOnEdit.maxFallback;
    let atMax = '';

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the draft formulary for editing and enter a name at exactly the maximum length - the field accepts it', async () => {
      await formularyDetailPage.open(formulary.id);
      drawer = await formularyDetailPage.openEditDrawer();
      max = (await drawer.getMaxLength('nameEn')) ?? max;
      atMax = suiteNameOfLength(max);
      await drawer.type('nameEn', atMax);
      expect(await drawer.getValue('nameEn')).toBe(atMax);
    });

    await steps.step('Save the edit - it is submitted successfully', async () => {
      const answer = await attemptEditSave(drawer);
      expect(answer.status, answer.messages.join(' | ')).toBe(200);
      expect((await formularyDetailPage.readViaApi(formulary.id)).formularyNameEn).toBe(atMax);
    });

    await steps.step('Re-open and enter a name one character beyond the maximum - the value is flagged', async () => {
      await formularyDetailPage.open(formulary.id);
      drawer = await formularyDetailPage.openEditDrawer();
      await drawer.type('nameEn', suiteNameOfLength(max + 1));
      const typed = await drawer.getValue('nameEn');
      const error = await drawer.getFieldError('nameEn');
      expect(typed.length <= max || MESSAGE.maxLength.test(error), `held ${typed.length} characters, error "${error}"`).toBe(true);
      await attemptEditSave(drawer);
      expect((await formularyDetailPage.readViaApi(formulary.id)).formularyNameEn.length).toBeLessThanOrEqual(max);
    });
  });

  test(`TC-${CASES.invalidFormatOnEdit.azureId}: should reject the edit with a clear validation error when the effective date has an invalid format`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft');
    let drawer!: FormularyFormDrawer;
    let original = '';

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the draft for editing and enter an invalid effective date - the invalid value is entered', async () => {
      await formularyDetailPage.open(formulary.id);
      drawer = await formularyDetailPage.openEditDrawer();
      expect(await drawer.next(), 'step 2 of the drawer').toBe(true);
      original = await drawer.getValue('effectiveDate');
      await drawer.clear('effectiveDate');
      await drawer.type('effectiveDate', CASES.invalidFormatOnEdit.invalidDate);
      expect(await drawer.getValue('effectiveDate')).not.toBe(original);
    });

    await steps.step('Attempt to save - the format is validated and the edit rejected with a clear message', async () => {
      const answer = await attemptEditSave(drawer);
      expect(answer.status === -1 || answer.status >= 400, `the save answered ${answer.status}`).toBe(true);
      expect([answer.errors.effectiveDate ?? '', ...answer.messages].join(' | ')).toMatch(INVALID_FORMAT);
      expect((await formularyDetailPage.readViaApi(formulary.id)).effectiveDate).toBe(formulary.effectiveDate);
    });
  });

  test(`TC-${CASES.concurrentEdit.azureId}: should block or warn on the second save when two administrators edit the same draft at once`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularySecondWindow,
    formularyIn,
    steps,
  }) => {
    const data = CASES.concurrentEdit;
    const formulary = await formularyIn('Draft');
    let first!: FormularyFormDrawer;
    let second!: FormularyFormDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Administrator A opens the formulary for editing and makes changes - an edit session begins for A', async () => {
      await formularyDetailPage.open(formulary.id);
      first = await formularyDetailPage.openEditDrawer();
      await first.type('descriptionEn', data.first);
      expect(await first.getValue('descriptionEn')).toBe(data.first);
    });

    await steps.critical('Administrator B opens the same formulary and makes different changes - an edit session begins for B', async () => {
      const windowB = await formularySecondWindow();
      await windowB.detail.open(formulary.id);
      second = await windowB.detail.openEditDrawer();
      await second.type('descriptionEn', data.second);
      expect(await second.getValue('descriptionEn')).toBe(data.second);
    });

    await steps.step('Both submit their changes - the second submission is blocked or warned, never silently overwriting', async () => {
      const a = await attemptEditSave(first);
      expect(a.status, a.messages.join(' | ')).toBe(200);
      const b = await attemptEditSave(second);
      expect(b.status >= 400 || CONFLICT.test(`${b.text} ${b.messages.join(' ')}`), `B's save answered ${b.status}: ${b.text.slice(0, 200)} ${b.messages.join(' | ')}`).toBe(true);
    });
  });

  test(`TC-${CASES.unsavedEdit.azureId}: should warn and discard the unsaved edit when the administrator leaves the edit form`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyIn,
    steps,
  }) => {
    const data = CASES.unsavedEdit;
    const formulary = await formularyIn('Draft');
    const original = (await formularyDetailPage.readViaApi(formulary.id)).descriptionEn ?? '';
    let drawer!: FormularyFormDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the draft for editing and modify a field without saving - the unsaved change is in the form', async () => {
      await formularyDetailPage.open(formulary.id);
      drawer = await formularyDetailPage.openEditDrawer();
      await drawer.type('descriptionEn', data.unsaved);
      expect(await drawer.getValue('descriptionEn')).toBe(data.unsaved);
    });

    await steps.step('Navigate away without saving - the user is warned "Unsaved Changes" and the change is discarded', async () => {
      const prompt = await closeFormDrawerReadingPrompt(page);
      expect(prompt.title).toMatch(UNSAVED_PROMPT.title);
      expect(prompt.message).toMatch(UNSAVED_PROMPT.message);
    });

    await steps.step('Re-open the formulary - it shows its original, unmodified data', async () => {
      await formularyDetailPage.open(formulary.id);
      expect((await formularyDetailPage.readViaApi(formulary.id)).descriptionEn ?? '').toBe(original);
      drawer = await formularyDetailPage.openEditDrawer();
      expect(await drawer.getValue('descriptionEn')).toBe(original);
    });
  });

  test(`TC-${CASES.benefitThroughApproval.azureId}: should apply the benefit configuration edit on a published formulary once it is approved`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyTradesTab,
    formularyApprovalsPage,
    formularyIn,
    steps,
  }) => {
    const data = CASES.benefitThroughApproval;
    const formulary = await formularyIn('Future', { benefitConfigs: 1 });
    const tradeId = formulary.trades[0].id;
    let configId = '';

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the published formulary\'s view page and edit the benefit configuration - the change is entered and submitted', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      const drawer = await formularyTradesTab.openBenefitConfigs(tradeId);
      configId = (await drawer.readConfigIds())[0] ?? '';
      await drawer.openEdit(configId);
      await drawer.type('copaymentAmount', data.copayment);
      expect((await drawer.attemptSave()).status).toBe(200);
      await drawer.close();
      const sent = await formularyDetailPage.sendForApproval();
      expect(sent.status, sent.text.slice(0, 200)).toBe(200);
    });

    await steps.critical('Confirm the change appears in the approval queue - it is listed as pending approval', async () => {
      await formularyApprovalsPage.open();
      await formularyApprovalsPage.expectInQueue(formulary.nameEn);
    });

    await steps.step('Approve the change as the approver - its status updates to Approved', async () => {
      await formularyApprovalsPage.approve(formulary.nameEn);
      const latest = [...(await readVersions(page, formulary.id))].sort((a, b) => b.version - a.version)[0];
      expect(latest?.versionStatusCode).toBe('published');
      expect(latest?.versionStatusEn ?? '').toMatch(new RegExp(`${VERSION_STATUS.published}|Approved`));
    });

    await steps.step('Verify the formulary reflects the updated configuration - the new value is visible', async () => {
      const config = (await readBenefitConfigs(page, tradeId)).find((c) => c.id === configId)
        ?? (await readBenefitConfigs(page, tradeId))[0];
      expect(config?.copaymentAmount).toBe(data.copayment);
      await formularyDetailPage.open(formulary.id);
      await formularyTradesTab.open();
      const drawer = await formularyTradesTab.openBenefitConfigs(tradeId);
      expect((await drawer.readCards()).map((c) => c.copaymentAmount).join(' ')).toContain(String(data.copayment));
    });
  });
});
