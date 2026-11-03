import { test, expect } from '../../../fixtures';
import { ApprovalManagementPage } from '../../../pages/approval/ApprovalManagementPage';
import type { ConfirmDialog } from '../../../pages/components/ConfirmDialog';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { BENEFIT_CONFIGS, FORMULARY_PRICE_HISTORY, FORMULARY_TIER_DRAWER } from '../../../constants/ElementIds';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { AUDIT_ACTION, FORMULARY_STATUS } from '../../../data/formulary/formulary.data';
import { ADMIN_NAME, BLOCKED_CASES, CASES, GATE_MESSAGE, PRICE_STATUS } from '../../../data/formulary/approvalWorkflow.data';
import { attemptEditSave, waitForVersionBadge, readToasts, saveConfirmingPrompts } from '../../../utils/formulary/writerCHelpers';
import {
  answerText,
  approveFormulary,
  deletePricingPeriod,
  readAuditTrail,
  readPriceHistory,
  readVersions,
  rejectFormulary,
  submitFormulary,
  updateFormularyFields,
  waitUntil,
} from '../../../utils/FormularyProvisioning';

/**
 * User story 15205: Formulary Approval Workflow - the administrator's cases.
 * Rejection needs a written reason; any change to a formulary awaiting
 * approval (the formulary, a tier, a trade, a price record, a benefit
 * configuration) returns it to Draft for resubmission; approval needs a tier
 * and a trade with pricing and a benefit configuration. The administrator is
 * the only approver (it may approve its own requests); the cases needing a
 * submitter without that right are in approval-roles.spec.ts.
 */
test.describe('US 15205 - Formulary Approval Workflow', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.selfApproveWithRight.azureId}: should approve and record the approver when a user with approval rights approves their own change`, async ({
    page,
    formularyManagementPage,
    formularyApprovalsPage,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('PendingApproval');
    let dialog!: ConfirmDialog;

    await steps.critical('Navigate to the Formulary Management module - the formulary list is shown', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the change request submitted by the current user - it shows Pending Approval with the current user as submitter', async () => {
      await formularyApprovalsPage.open();
      await formularyApprovalsPage.expectInQueue(formulary.nameEn);
      const pending = (await readVersions(page, formulary.id)).find((v) => v.versionStatusCode === 'pendingApproval');
      expect(pending?.requestedByNameEn).toBe(ADMIN_NAME);
    });

    await steps.critical('Click Approve - an approval confirmation prompt is displayed', async () => {
      dialog = await formularyApprovalsPage.openApproveDialog(formulary.nameEn);
      expect(await dialog.isVisible()).toBe(true);
    });

    await steps.step('Confirm the approval - the request is Approved with the approver\'s name and timestamp recorded', async () => {
      await dialog.confirm('Approve');
      await formularyApprovalsPage.waitForDecisionProcessed(formulary.nameEn);
      const approved = (await readVersions(page, formulary.id)).find((v) => v.versionStatusCode === 'published');
      expect(approved?.reviewedByNameEn).toBe(ADMIN_NAME);
      expect(approved?.reviewedOn ?? '', 'the approval timestamp').not.toBe('');
    });
  });

  test(`TC-${CASES.rejectWithReason.azureId}: should reject the change and record the written reason when a reviewer rejects with a reason`, async ({
    page,
    formularyManagementPage,
    formularyApprovalsPage,
    formularyIn,
    steps,
  }) => {
    const data = CASES.rejectWithReason;
    const formulary = await formularyIn('PendingApproval');

    await steps.critical('Navigate to the Formulary Management module - the formulary list is shown', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the pending request and click Reject - the rejection dialog opens', async () => {
      await formularyApprovalsPage.open();
      const dialog = await formularyApprovalsPage.openRejectDialog(formulary.nameEn);
      expect(await dialog.isVisible()).toBe(true);
      await dialog.cancel();
    });

    await steps.step(`Enter the reason "${data.reason}" and confirm - the status is Rejected and the reason is shown in the history`, async () => {
      const decided = await formularyApprovalsPage.decideWithComment(formulary.nameEn, 'reject', data.reason);
      expect(decided.typed, 'the reason typed into the dialog').toBe(data.reason);
      expect(decided.stillQueued, decided.answer).toBe(false);
      const rejected = (await readVersions(page, formulary.id)).find((v) => v.versionStatusCode === 'rejected');
      expect(rejected, 'a Rejected version').toBeDefined();
      expect(rejected?.reviewNote ?? '').toContain(data.reason);
    });
  });

  test(`TC-${CASES.tierEditToDraft.azureId}: should return the formulary to Draft when a tier is edited while it awaits approval`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyTiersTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('PendingApproval');
    const tierId = formulary.tiers[0].id;

    await steps.critical('Navigate to the Formulary Management module - the formulary list is shown', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the pending formulary and go to its Tier list - the existing tiers are displayed', async () => {
      await formularyDetailPage.open(formulary.id);
      expect(await formularyDetailPage.getVersionBadge()).toMatch(/Pending Approval/);
      await formularyTiersTab.open();
      expect(await formularyTiersTab.countCards()).toBe(formulary.tiers.length);
    });

    await steps.step('Modify a tier\'s coverage and save - the tier update is saved', async () => {
      const drawer = await formularyTiersTab.openEdit(tierId);
      await drawer.type('coverage', CASES.tierEditToDraft.coverage);
      const answer = await saveConfirmingPrompts(page, FORMULARY_TIER_DRAWER.save, /\/UpdateTier$/);
      expect(answer.status, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBe(200);
    });

    await steps.step('View the formulary status - it has changed to Draft', async () => {
      expect(await waitForVersionBadge(formularyDetailPage, /Draft/)).toMatch(/Draft/);
    });
  });

  test(`TC-${CASES.formularyEditToDraft.azureId}: should return the request to Draft and require resending when the formulary itself is edited after submission`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyApprovalsPage,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('PendingApproval');

    await steps.critical('Navigate to the Formulary Management module - the formulary list is shown', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the pending formulary and edit its description - the field is updated and saved', async () => {
      await formularyDetailPage.open(formulary.id);
      const drawer = await formularyDetailPage.openEditDrawer();
      await drawer.type('descriptionEn', CASES.formularyEditToDraft.description);
      const answer = await attemptEditSave(drawer);
      expect(answer.status, answer.messages.join(' | ')).toBe(200);
    });

    await steps.step('View the formulary status - it has changed to Draft', async () => {
      expect(await waitForVersionBadge(formularyDetailPage, /Draft/)).toMatch(/Draft/);
    });

    await steps.step('Look for it in the approver\'s pending queue - it no longer appears there', async () => {
      await formularyApprovalsPage.open();
      await formularyApprovalsPage.expectNotInQueue(formulary.nameEn);
    });

    await steps.step('Resend for Approval - the status changes back to Pending Approval', async () => {
      await formularyDetailPage.open(formulary.id);
      const sent = await formularyDetailPage.sendForApproval();
      expect(sent.status, sent.text.slice(0, 200)).toBe(200);
      expect(await waitForVersionBadge(formularyDetailPage, /Pending Approval/)).toMatch(/Pending Approval/);
    });
  });

  test(`TC-${CASES.reasonRequired.azureId}: should refuse a rejection with no reason and accept it once one character is entered`, async ({
    page,
    formularyManagementPage,
    formularyApprovalsPage,
    formularyIn,
    steps,
  }) => {
    const data = CASES.reasonRequired;
    const formulary = await formularyIn('PendingApproval');
    let dialog!: ConfirmDialog;

    await steps.critical('Navigate to the Formulary Management module - the formulary list is shown', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Open the pending request and click Reject - a dialog with an empty reason text field and Confirm Reject opens', async () => {
      await formularyApprovalsPage.open();
      dialog = await formularyApprovalsPage.openRejectDialog(formulary.nameEn);
      // The dialog opens on a "Rejection Reason" select; its free-text reason
      // belongs to "Other" (2026-11-02), so that is chosen before looking for it.
      await dialog.selectReasonIfPresent('Other');
      expect(await dialog.hasFreeTextInput(), 'a reason text field').toBe(true);
      expect(await dialog.typeReasonText(''), 'the reason field starts empty').toBe('');
    });

    await steps.step('Leave the reason empty (0 characters) and click Confirm Reject - the reason is required and the dialog stays open', async () => {
      await dialog.acknowledgeIfPresent();
      const enabled = await dialog.isAffirmativeEnabled();
      if (enabled) await dialog.clickAction('confirm');
      expect(await dialog.isVisible(), 'the dialog stays open').toBe(true);
      const said = `${await dialog.getMessage().catch(() => '')} ${(await readToasts(page)).join(' ')}`;
      expect(/required/i.test(said) || (await dialog.isReasonMarkedRequired()), `the dialog should say the reason is required: "${said}"`).toBe(true);
      expect((await readVersions(page, formulary.id)).some((v) => v.versionStatusCode === 'rejected'), 'nothing rejected yet').toBe(false);
    });

    await steps.step('Enter a single character and click Confirm Reject - the request is Rejected and the reason saved', async () => {
      expect(await dialog.typeReasonText(data.reason)).toBe(data.reason);
      await dialog.selectReasonIfPresent('Other');
      await dialog.acknowledgeIfPresent();
      await dialog.clickAction('confirm');
      await formularyApprovalsPage.waitForDecisionProcessed(formulary.nameEn);
      const rejected = (await readVersions(page, formulary.id)).find((v) => v.versionStatusCode === 'rejected');
      expect(rejected?.reviewNote ?? '').toContain(data.reason);
    });
  });

  test(`TC-${CASES.tradeEditToDraft.azureId}: should return the formulary to Draft when a trade is modified while it awaits approval`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('PendingApproval');
    const tradeId = formulary.trades[0].id;

    await steps.critical('Navigate to the Formulary Management module - the formulary list is shown', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the pending formulary and go to its Trades list - the existing trades are displayed', async () => {
      await formularyDetailPage.open(formulary.id);
      await formularyTradesTab.open();
      expect(await formularyTradesTab.countCards()).toBe(formulary.trades.length);
    });

    await steps.step('Modify the trade (Suspend) and save - the trade update is saved', async () => {
      const dialog = await formularyTradesTab.requestToggleStatus(tradeId);
      const answer = await NetworkUtils.captureResponse(page, ApiEndpoints.formularySetTradeStatus, async () => { await dialog.confirmWithFollowUps(); });
      expect(answer?.status, answer?.text.slice(0, 200)).toBe(200);
    });

    await steps.step('View the formulary status - it has changed to Draft', async () => {
      expect(await waitForVersionBadge(formularyDetailPage, /Draft/)).toMatch(/Draft/);
    });
  });

  test(`TC-${CASES.priceEditToDraft.azureId}: should return the formulary to Draft when a price history record is edited while it awaits approval`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('PendingApproval', { extraPricePeriods: 1 });
    const tradeId = formulary.trades[0].id;
    let periodId = '';

    await steps.critical('Navigate to the Formulary Management module - the formulary list is shown', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the pending formulary and the Price History of a trade - the existing pricing records are displayed', async () => {
      const periods = await readPriceHistory(page, tradeId);
      periodId = [...periods].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0].id;
      await formularyDetailPage.open(formulary.id);
      await formularyTradesTab.open();
      const drawer = await formularyTradesTab.openPriceHistory(tradeId);
      expect((await drawer.readPeriodIds()).length).toBe(periods.length);
      await drawer.openEditRecord(periodId);
      await drawer.typeRecord('supplierPrice', CASES.priceEditToDraft.supplierPrice);
    });

    await steps.step('Modify the price amount and save - the price history record is updated', async () => {
      const answer = await saveConfirmingPrompts(page, FORMULARY_PRICE_HISTORY.submit, /\/UpdatePricingPeriod$/);
      expect(answer.status, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBe(200);
      expect((await readPriceHistory(page, tradeId)).find((p) => p.id === periodId)?.supplierPrice).toBe(CASES.priceEditToDraft.supplierPrice);
    });

    await steps.step('View the formulary status - it has changed to Draft', async () => {
      expect(await waitForVersionBadge(formularyDetailPage, /Draft/)).toMatch(/Draft/);
    });
  });

  test(`TC-${CASES.benefitEditToDraft.azureId}: should return the formulary to Draft when a benefit configuration is edited while it awaits approval`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyTradesTab,
    benefitConfigDrawer,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('PendingApproval', { benefitConfigs: 1 });
    const tradeId = formulary.trades[0].id;
    let configId = '';

    await steps.critical('Navigate to the Formulary Management module - the formulary list is shown', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the pending formulary and the Benefit Configuration of a trade - the existing configuration is displayed', async () => {
      await formularyDetailPage.open(formulary.id);
      await formularyTradesTab.open();
      const drawer = await formularyTradesTab.openBenefitConfigs(tradeId);
      configId = (await drawer.readConfigIds())[0] ?? '';
      expect(configId, 'a benefit configuration card').not.toBe('');
    });

    await steps.step('Modify a benefit configuration setting and save - the record is updated', async () => {
      expect(await benefitConfigDrawer.getCardActionAvailability(configId, 'edit'), 'Edit on the configuration').toBe('available');
      await benefitConfigDrawer.openEdit(configId);
      await benefitConfigDrawer.type('copaymentAmount', CASES.benefitEditToDraft.copayment);
      const answer = await saveConfirmingPrompts(page, BENEFIT_CONFIGS.submit, /\/UpdateBenefitConfig$/);
      expect(answer.status, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBe(200);
    });

    await steps.step('View the formulary status - it has changed to Draft', async () => {
      expect(await waitForVersionBadge(formularyDetailPage, /Draft/)).toMatch(/Draft/);
    });
  });

  test(`TC-${CASES.approvalGate.azureId}: should approve only a formulary with a tier and a trade holding both pricing history and a benefit configuration`, async ({
    page,
    formularyManagementPage,
    formularyApprovalsPage,
    formularyDetailPage,
    formularyIn,
    steps,
  }) => {
    const noTier = await formularyIn('Draft', { tiers: 0 });
    const noBenefit = await formularyIn('Draft', { tiers: 1, trades: 1 });
    const noPricing = await formularyIn('Draft', { tiers: 1, trades: 1, benefitConfigs: 1 });
    const complete = await formularyIn('Draft', { tiers: 1, trades: 1, benefitConfigs: 1 });
    for (const period of await readPriceHistory(page, noPricing.trades[0].id)) {
      const removed = await deletePricingPeriod(page, period.id);
      if (removed.status >= 300) {
        steps.blocked(`FRM-C needs a trade with a benefit configuration but NO price history record. The application refuses to remove the `
          + `trade's last price record (DeletePricingPeriod answered ${removed.status} ${answerText(removed).slice(0, 160)}), and a trade `
          + 'is always added with its price, so that formulary cannot be built.');
      }
    }
    /** Send for approval, then approve in the hub: a refusal at either step is a block, with what was said. */
    const attemptApproval = async (name: string, id: string): Promise<{ approved: boolean; said: string }> => {
      const submitted = await submitFormulary(page, id);
      if (submitted.status >= 300) return { approved: false, said: answerText(submitted) };
      await formularyApprovalsPage.open();
      const attempt = await formularyApprovalsPage.attemptApprove(name);
      return { approved: !attempt.stillQueued, said: attempt.answer };
    };

    await steps.critical('Navigate to the Formulary Management module - the formulary list is shown', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(complete.nameEn)).toBe(true);
    });

    await steps.step('Attempt to approve FRM-A (no tier) - approval is blocked with a message that a tier is required', async () => {
      const outcome = await attemptApproval(noTier.nameEn, noTier.id);
      expect(outcome.approved, outcome.said).toBe(false);
      expect(outcome.said).toMatch(GATE_MESSAGE.noTier);
    });

    await steps.step('Attempt to approve FRM-B (tier, trade with pricing, no benefit configuration) - blocked: the trade is missing a benefit configuration', async () => {
      const outcome = await attemptApproval(noBenefit.nameEn, noBenefit.id);
      expect(outcome.approved, outcome.said).toBe(false);
      expect(outcome.said).toMatch(GATE_MESSAGE.noBenefit);
    });

    await steps.step('Attempt to approve FRM-C (tier, trade with benefit configuration, no pricing history) - blocked: the trade is missing a pricing record', async () => {
      const outcome = await attemptApproval(noPricing.nameEn, noPricing.id);
      expect(outcome.approved, outcome.said).toBe(false);
      expect(outcome.said).toMatch(GATE_MESSAGE.noPricing);
    });

    await steps.step('Attempt to approve FRM-D (tier, trade with pricing and benefit configuration) - approval succeeds and the status changes', async () => {
      const outcome = await attemptApproval(complete.nameEn, complete.id);
      expect(outcome.approved, outcome.said).toBe(true);
      await formularyDetailPage.open(complete.id);
      expect(await formularyDetailPage.getVersionBadge()).toMatch(/Approved/);
    });
  });

  test(`TC-${CASES.exploratory.azureId}: should keep a consistent status and history and refuse duplicate decisions during unusual approval sequences`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyApprovalsPage,
    formularySecondWindow,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('PendingApproval');

    await steps.critical('Navigate to the Formulary Management module - the formulary list is shown', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Explore submit, edit mid-review and resubmit - each action gives the status and audit trail the workflow defines', async () => {
      await formularyDetailPage.open(formulary.id);
      const drawer = await formularyDetailPage.openEditDrawer();
      await drawer.type('descriptionEn', CASES.exploratory.description);
      expect((await attemptEditSave(drawer)).status).toBe(200);
      expect(await waitForVersionBadge(formularyDetailPage, /Draft/)).toMatch(/Draft/);
      const sent = await formularyDetailPage.sendForApproval();
      expect(sent.status, sent.text.slice(0, 200)).toBe(200);
      expect(await waitForVersionBadge(formularyDetailPage, /Pending Approval/)).toMatch(/Pending Approval/);
      const trail = (await readAuditTrail(page, formulary.id)).items.map((e) => String(e.actionType ?? ''));
      expect(trail.filter((a) => a === AUDIT_ACTION.submitted).length, `audit actions: ${trail.join(', ')}`).toBeGreaterThanOrEqual(2);
    });

    await steps.step('Open the same request in two tabs and approve from both - the second decision is refused with a clear message', async () => {
      const second = await formularySecondWindow();
      const approvalsB = new ApprovalManagementPage(second.page, 'formulary');
      await approvalsB.open();
      await approvalsB.expectInQueue(formulary.nameEn);
      await formularyApprovalsPage.open();
      await formularyApprovalsPage.approve(formulary.nameEn);
      const late = await approvalsB.attemptDecisionOnLoadedRow(formulary.nameEn, 'approve');
      expect(/answered 2\d\d/.test(late.answer), `the second approval was accepted: ${late.answer}`).toBe(false);
      expect(`${late.messages} ${late.answer}`.trim(), 'a message about the conflict').not.toBe('');
    });

    await steps.step('Record any inconsistency - there is exactly one approved version and no duplicate state change', async () => {
      const versions = await readVersions(page, formulary.id);
      expect(versions.filter((v) => v.versionStatusCode === 'published').length, JSON.stringify(versions.map((v) => [v.version, v.versionStatusCode]))).toBe(1);
      await formularyDetailPage.open(formulary.id);
      expect(await formularyDetailPage.getStatus()).toBe(FORMULARY_STATUS.future);
    });
  });

  test(`TC-${CASES.fullHistory.azureId}: should keep the submissions, the rejection with its reason, the edit and the approval in the formulary's history`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyAuditTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.fullHistory;
    const formulary = await formularyIn('Draft', { tiers: 1, trades: 1 });

    await steps.critical('Precondition: the formulary goes through submit - reject - edit - resubmit - approve', async () => {
      expect((await submitFormulary(page, formulary.id)).status).toBe(200);
      expect((await rejectFormulary(page, formulary.nameEn, data.reason)).status).toBe(200);
      expect((await updateFormularyFields(page, formulary.id, { descriptionEn: data.description })).status).toBe(200);
      expect((await submitFormulary(page, formulary.id)).status).toBe(200);
      await approveFormulary(page, formulary.nameEn);
      expect((await readVersions(page, formulary.id)).some((v) => v.versionStatusCode === 'published')).toBe(true);
    });

    await steps.critical('Navigate to the Formulary Management module - the formulary list is shown', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Open the formulary\'s audit / history tab - a chronological list of events is shown', async () => {
      await formularyDetailPage.open(formulary.id);
      await formularyAuditTab.open();
      const entries = await formularyAuditTab.readAllEntries();
      expect(entries.length).toBeGreaterThanOrEqual(5);
    });

    await steps.step('The history holds the submission, the rejection with its reason, the edit, the resubmission and the approval - each with time and user', async () => {
      const trail = (await readAuditTrail(page, formulary.id)).items.map((e) => String(e.actionType ?? ''));
      expect(trail.filter((a) => a === AUDIT_ACTION.submitted).length, trail.join(', ')).toBeGreaterThanOrEqual(2);
      expect(trail, trail.join(', ')).toEqual(expect.arrayContaining([AUDIT_ACTION.rejected, AUDIT_ACTION.update, AUDIT_ACTION.approved]));
      const entries = await formularyAuditTab.readAllEntries();
      expect(entries.filter((e) => e.when === '' || e.by === ''), 'entries without a time or a user').toEqual([]);
    });

    await steps.step('After the approval, the original rejection reason is still visible, unchanged', async () => {
      const rejected = (await readVersions(page, formulary.id)).find((v) => v.versionStatusCode === 'rejected');
      const trailText = JSON.stringify((await readAuditTrail(page, formulary.id, AUDIT_ACTION.rejected)).items);
      expect(`${rejected?.reviewNote ?? ''} ${trailText}`).toContain(data.reason);
    });
  });

  test(`TC-${CASES.priceStatus.azureId}: should show a new price as an editable Draft and, once approved and started, as Active and no longer editable`, async ({
    page,
    formularyDetailPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft', { tiers: 1, trades: 1, benefitConfigs: 1, effectiveInMinutes: CASES.priceStatus.effectiveInMinutes });
    const tradeId = formulary.trades[0].id;

    await steps.step('A newly added price reads Draft and is editable', async () => {
      const periodId = (await readPriceHistory(page, tradeId))[0].id;
      await formularyDetailPage.open(formulary.id);
      await formularyTradesTab.open();
      const drawer = await formularyTradesTab.openPriceHistory(tradeId);
      expect((await drawer.readCard(periodId)).status).toMatch(PRICE_STATUS.draft);
      expect(await drawer.getCardActionAvailability(periodId, 'editRecord')).toBe('available');
    });

    await steps.step('After the price is approved it reads Active and is no longer editable', async () => {
      expect((await submitFormulary(page, formulary.id)).status).toBe(200);
      await approveFormulary(page, formulary.nameEn);
      await waitUntil(page, formulary.effectiveDate);
      const periodId = (await readPriceHistory(page, tradeId))[0].id;
      await formularyDetailPage.open(formulary.id);
      await formularyTradesTab.open();
      const drawer = await formularyTradesTab.openPriceHistory(tradeId);
      expect((await drawer.readCard(periodId)).status).toMatch(PRICE_STATUS.active);
      expect(await drawer.getCardActionAvailability(periodId, 'editRecord')).not.toBe('available');
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
