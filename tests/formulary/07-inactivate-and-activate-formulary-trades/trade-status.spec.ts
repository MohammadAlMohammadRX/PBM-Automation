import { expect } from '../../../fixtures';
import { SCOPED_PAYER } from '../../../data/formulary/formularyPermissions.data';
import { test } from '../../../utils/formulary/writerCHelpers';
import type { ConfirmDialog } from '../../../pages/components/ConfirmDialog';
import { FormularyDetailPage } from '../../../pages/formulary/FormularyDetailPage';
import { FormularyManagementPage } from '../../../pages/formulary/FormularyManagementPage';
import { FormularyVersionHistoryTab } from '../../../pages/formulary/FormularyVersionHistoryTab';
import { FormularyTradesTab, type TradeCard } from '../../../pages/formulary/FormularyTradesTab';
import { APPROVAL_STATUS, DIALOG_TITLE } from '../../../data/formulary/formulary.data';
import {
  ACTIVE,
  ALREADY,
  CASES,
  INACTIVE,
  OFFERS_ACTIVATE,
  OFFERS_INACTIVATE,
  STATUS_CHANGE_ENTRY,
} from '../../../data/formulary/tradeStatus.data';
import {
  answerText,
  approveFormulary,
  pendingFormularyRequestId,
  readAuditTrail,
  readBenefitConfigs,
  readPriceHistory,
  rejectFormulary,
  setTradeStatus,
  submitFormulary,
} from '../../../utils/FormularyProvisioning';
import { hasDraft, requireAccepted, requireDone, signInWithFormularyRights, submitAndApprove } from '../../../utils/formulary/writerBHelpers';

/**
 * User story 15197: Inactivate and activate formulary trades.
 * On an Active formulary a trade is inactivated (Suspend) or activated again
 * through the approval workflow, its record kept intact; redundant changes are
 * refused, only permitted users see the toggle, and every change is audited.
 * The live cases build an Active formulary (about three minutes each).
 */
test.describe('US 15197 - Inactivate and activate formulary trades', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.activateInactive.azureId}: should reactivate an inactive trade and put the change up for approval`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }, testInfo) => {
    const formulary = await formularyIn('Active');
    const trade = formulary.trades[0];
    requireAccepted(testInfo, await setTradeStatus(page, trade.id, true), 'the trade suspended for the precondition');
    await requireDone(testInfo, 'the suspension approved', () => submitAndApprove(page, formulary));
    let dialog!: ConfirmDialog;

    await steps.critical('Navigate to the Formulary Management module - the module loads successfully', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the formulary containing the inactive trade - the trade is listed as Inactive', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      expect((await formularyTradesTab.readCard(trade.id)).status).toMatch(INACTIVE);
    });

    await steps.step('Select the inactive trade and click Activate - a confirmation prompt is displayed', async () => {
      expect((await formularyTradesTab.readCard(trade.id)).toggleLabel).toMatch(OFFERS_ACTIVATE);
      dialog = await formularyTradesTab.requestToggleStatus(trade.id);
      expect(await dialog.getTitle()).toBe(DIALOG_TITLE.reactivateTrade);
      await dialog.cancel();
    });

    await steps.step('Confirm the activation - the trade reads Active and an approval request is generated', async () => {
      const answer = await formularyTradesTab.toggleStatus(trade.id);
      expect(answer.status, answer.text.slice(0, 300)).toBe(200);
      expect((await formularyTradesTab.readCard(trade.id)).status).toMatch(ACTIVE);
      expect(await hasDraft(page, formulary.id), 'the activation should be staged for approval').toBe(true);
      const sent = await formularyDetailPage.sendForApproval();
      expect(sent.status, sent.text.slice(0, 300)).toBe(200);
      expect(await pendingFormularyRequestId(page, formulary.nameEn)).not.toBe('');
    });
  });

  test(`TC-${CASES.detailsPreserved.azureId}: should keep every trade detail, its pricing and benefit configurations when the trade is inactivated`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Active', { rebate: CASES.detailsPreserved.rebate });
    const trade = formulary.trades[0];
    let before!: TradeCard;
    const pricing = async () => (await readPriceHistory(page, trade.id)).map((p) => ({ id: p.id, from: p.effectiveFrom, to: p.effectiveTo, net: p.netPrice, rebate: p.rebateValue }));
    const benefits = async () => (await readBenefitConfigs(page, trade.id)).map((b) => ({ id: b.id, name: b.benefitConfigNameEn, from: b.benefitEffectiveDate }));
    const pricesBefore = await pricing();
    const benefitsBefore = await benefits();

    await steps.critical('Navigate to the Formulary Management module - the module loads successfully', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the formulary and note the trade\'s code, tier, coverage, net price and rebate - the details are visible', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      before = await formularyTradesTab.readCard(trade.id);
      expect(before.tradeCode).toContain(trade.tradeCode);
      expect(before.status).toMatch(ACTIVE);
    });

    await steps.critical('Inactivate the trade and approve the change - the trade status updates to Inactive', async () => {
      const answer = await formularyTradesTab.toggleStatus(trade.id);
      expect(answer.status, answer.text.slice(0, 300)).toBe(200);
      const sent = await formularyDetailPage.sendForApproval();
      expect(sent.status, sent.text.slice(0, 300)).toBe(200);
      await approveFormulary(page, formulary.nameEn);
      await formularyDetailPage.reload();
      await formularyTradesTab.open();
      expect((await formularyTradesTab.readCard(trade.id)).status).toMatch(INACTIVE);
    });

    await steps.step('Reopen the trade record - only the status changed; code, tier, pricing, rebate and benefit configurations are preserved', async () => {
      const after = await formularyTradesTab.readCard(trade.id);
      expect({ code: after.tradeCode, tier: after.tier, coverage: after.coverage, net: after.netPrice, rebate: after.rebate })
        .toEqual({ code: before.tradeCode, tier: before.tier, coverage: before.coverage, net: before.netPrice, rebate: before.rebate });
      expect(await pricing()).toEqual(pricesBefore);
      expect(await benefits()).toEqual(benefitsBefore);
    });
  });

  test(`TC-${CASES.inactivateActive.azureId}: should inactivate an active trade without removing it and put the change up for approval`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Active');
    const trade = formulary.trades[0];

    await steps.critical('Navigate to the Formulary Management module - the module loads successfully', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the active formulary - the details page shows its trades', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      expect((await formularyDetailPage.readHeader()).status).toMatch(ACTIVE);
      await formularyTradesTab.open();
      expect(await formularyTradesTab.countCards()).toBe(formulary.trades.length);
    });

    await steps.step('Select the Active trade and click Inactivate - a confirmation prompt is displayed', async () => {
      expect((await formularyTradesTab.readCard(trade.id)).toggleLabel).toMatch(OFFERS_INACTIVATE);
      const dialog = await formularyTradesTab.requestToggleStatus(trade.id);
      expect(await dialog.getTitle()).toBe(DIALOG_TITLE.suspendTrade);
      await dialog.cancel();
    });

    await steps.step('Confirm the inactivation - the trade reads Inactive, stays on the formulary, and an approval request is generated', async () => {
      const answer = await formularyTradesTab.toggleStatus(trade.id);
      expect(answer.status, answer.text.slice(0, 300)).toBe(200);
      expect((await formularyTradesTab.readCard(trade.id)).status).toMatch(INACTIVE);
      expect(await formularyTradesTab.card(trade.id).isVisible()).toBe(true);
      const sent = await formularyDetailPage.sendForApproval();
      expect(sent.status, sent.text.slice(0, 300)).toBe(200);
      expect(await pendingFormularyRequestId(page, formulary.nameEn)).not.toBe('');
    });
  });

  test(`TC-${CASES.rejectedInactivation.azureId}: should leave the trade Active when its inactivation request is rejected`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Active');
    const trade = formulary.trades[0];

    await steps.critical('Navigate to the Formulary Management module - the module loads successfully', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Submit an inactivation request for the Active trade - it awaits approval while the trade still reads Active', async () => {
      const staged = await setTradeStatus(page, trade.id, true);
      expect(staged.status, answerText(staged)).toBe(200);
      const submitted = await submitFormulary(page, formulary.id);
      expect(submitted.status, answerText(submitted)).toBe(200);
      await formularyManagementPage.openDetails(formulary.nameEn);
      expect(await formularyDetailPage.getVersionBadge()).toContain(APPROVAL_STATUS.pending);
      await formularyTradesTab.open();
      expect((await formularyTradesTab.readCard(trade.id)).status).toMatch(ACTIVE);
    });

    await steps.step('Have the approver reject the inactivation request - the Rejected decision is displayed', async () => {
      const rejected = await rejectFormulary(page, formulary.nameEn);
      expect(rejected.status, answerText(rejected)).toBe(200);
      await formularyDetailPage.reload();
      // On a PUBLISHED formulary a rejected change is dropped and the header
      // returns to the live version ("v2 · Approved", 2026-11-02); the decision
      // itself is displayed in the Version History tab.
      const badge = await formularyDetailPage.getVersionBadge();
      if (!badge.includes(APPROVAL_STATUS.rejected)) {
        const history = new FormularyVersionHistoryTab(page);
        await history.open();
        const statuses = (await history.readRows()).map((r) => r.status);
        expect(statuses.join(' | '), `header "${badge}"; the Version History should show the rejected request`).toContain(APPROVAL_STATUS.rejected);
      }
    });

    await steps.step('Check the trade status after the rejection - the trade is Active', async () => {
      await formularyTradesTab.open();
      const card = await formularyTradesTab.readCard(trade.id);
      expect(card.status).toMatch(ACTIVE);
      expect(card.toggleLabel).toMatch(OFFERS_INACTIVATE);
    });
  });

  test(`TC-${CASES.noPermission.azureId}: should hide Inactivate and Activate from a user without the permission`, async ({
    page,
    formularyIn,
    formularyRole,
    steps,
  }, testInfo) => {
    const formulary = await formularyIn('Draft', { payerName: SCOPED_PAYER, trades: 2 });
    const [active, suspended] = formulary.trades;
    requireAccepted(testInfo, await setTradeStatus(page, suspended.id, true), 'the second trade suspended for the precondition');
    // Create is withheld too: the step reads "the list displays without edit controls".
    const session = await signInWithFormularyRights(formularyRole, { held: ['viewFormulary', 'viewTrades'], lacking: ['setTradeStatus', 'createFormulary'] });
    const list = new FormularyManagementPage(session.page);
    const detail = new FormularyDetailPage(session.page);
    const trades = new FormularyTradesTab(session.page);

    await steps.critical('Navigate to the Formulary Management module - the module loads with restricted access', async () => {
      await list.openExpectingDenial();
      expect(await list.isListRendered()).toBe(true);
    });

    // Not critical, and the trades are opened BEFORE the Add check: an Add still
    // offered is a finding of its own and must not stop steps 3-4 (2026-11-02).
    await steps.step('Signed in with the non-administrator role - the formulary list displays without edit controls', async () => {
      const addOffered = await list.isAddOffered();
      await detail.open(formulary.id);
      await trades.open();
      expect(await trades.countCards()).toBe(2);
      expect(addOffered, 'Add Formulary offered without CreateFormulary').toBe(false);
    });

    await steps.step('Attempt to access Inactivate - the action is hidden and the system blocks it', async () => {
      expect(await trades.getCardActionAvailability(active.id, 'toggleStatus')).toBe('absent');
      const direct = await setTradeStatus(session.page, active.id, true);
      expect(direct.status, `a direct SetFormularyTradeStatus answered ${direct.status}`).toBeGreaterThanOrEqual(400);
    });

    await steps.step('Attempt to access Activate - the action is hidden and the system blocks it', async () => {
      expect(await trades.getCardActionAvailability(suspended.id, 'toggleStatus')).toBe('absent');
      const direct = await setTradeStatus(session.page, suspended.id, false);
      expect(direct.status, `a direct SetFormularyTradeStatus answered ${direct.status}`).toBeGreaterThanOrEqual(400);
    });
  });

  test(`TC-${CASES.alreadyInactive.azureId}: should prevent inactivating a trade that is already inactive`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }, testInfo) => {
    const formulary = await formularyIn('Draft');
    const trade = formulary.trades[0];
    requireAccepted(testInfo, await setTradeStatus(page, trade.id, true), 'the trade suspended for the precondition');

    await steps.critical('Navigate to the Formulary Management module - the module loads successfully', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Open the formulary and locate the Inactive trade - it reads Inactive with no Inactivate option', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      const card = await formularyTradesTab.readCard(trade.id);
      expect(card.status).toMatch(INACTIVE);
      expect(card.toggleLabel).not.toMatch(/^\s*(Suspend|Inactivate)\s*$/i);
    });

    await steps.step('Trigger Inactivate again on the same trade - the duplicate action is prevented with a message', async () => {
      const again = await setTradeStatus(page, trade.id, true);
      expect(again.status, `a second suspension answered ${again.status} ${answerText(again)}`).toBeGreaterThanOrEqual(400);
      expect(answerText(again)).toMatch(ALREADY);
    });
  });

  test(`TC-${CASES.alreadyActive.azureId}: should prevent activating a trade that is already active`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft');
    const trade = formulary.trades[0];

    await steps.critical('Navigate to the Formulary Management module - the module loads successfully', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Open the formulary and locate the Active trade - it reads Active with no Activate option', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      const card = await formularyTradesTab.readCard(trade.id);
      expect(card.status).toMatch(ACTIVE);
      expect(card.toggleLabel).not.toMatch(OFFERS_ACTIVATE);
    });

    await steps.step('Trigger Activate again on the same trade - the duplicate action is prevented with a message', async () => {
      const again = await setTradeStatus(page, trade.id, false);
      expect(again.status, `activating an active trade answered ${again.status} ${answerText(again)}`).toBeGreaterThanOrEqual(400);
      expect(answerText(again)).toMatch(ALREADY);
    });
  });

  test(`TC-${CASES.draftFormulary.azureId}: should offer and apply Inactivate on a trade of a formulary that is still a draft`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft');
    const trade = formulary.trades[0];

    await steps.critical('Navigate to the Formulary Management module - the module loads successfully', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open a formulary that is still in Draft - its details show status Draft', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      expect(await formularyDetailPage.getVersionBadge()).toContain(APPROVAL_STATUS.draft);
    });

    await steps.step('Inactivate a trade on the draft formulary - the Inactivate option is available and applies', async () => {
      await formularyTradesTab.open();
      expect(await formularyTradesTab.getCardActionAvailability(trade.id, 'toggleStatus')).toBe('available');
      expect((await formularyTradesTab.readCard(trade.id)).toggleLabel).toMatch(OFFERS_INACTIVATE);
      const answer = await formularyTradesTab.toggleStatus(trade.id);
      expect(answer.status, answer.text.slice(0, 300)).toBe(200);
      expect((await formularyTradesTab.readCard(trade.id)).status).toMatch(INACTIVE);
    });
  });

  test(`TC-${CASES.rapidToggles.azureId}: should end in the last confirmed state and log every toggle when the status is toggled rapidly`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft');
    const trade = formulary.trades[0];
    const toggles = CASES.rapidToggles.toggles;
    let auditBefore = 0;

    await steps.critical('Navigate to the Formulary Management module - the module loads successfully', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
      auditBefore = (await readAuditTrail(page, formulary.id)).totalRows;
    });

    await steps.step(`Toggle Inactivate / Activate ${toggles} times in quick succession - each toggle is processed once, without the screen freezing`, async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      const sent: unknown[] = [];
      for (let n = 0; n < toggles; n += 1) {
        const answer = await formularyTradesTab.toggleStatus(trade.id);
        expect(answer.status, `toggle ${n + 1}: ${answer.text.slice(0, 200)}`).toBe(200);
        sent.push(answer.body?.suspend);
      }
      expect(sent).toEqual([true, false, true, false, true]);
    });

    await steps.step('Review the final status and the history - the last confirmed action stands and the log lists every toggle in order', async () => {
      expect((await formularyTradesTab.readCard(trade.id)).status).toMatch(INACTIVE);
      const trail = await readAuditTrail(page, formulary.id);
      expect(trail.totalRows - auditBefore, 'one audit entry per toggle').toBeGreaterThanOrEqual(toggles);
      const latest = trail.items.slice(0, toggles).map((entry) => JSON.stringify(entry));
      expect(latest.filter((text) => STATUS_CHANGE_ENTRY.test(text))).toHaveLength(toggles);
    });
  });

  test(`TC-${CASES.auditLogged.azureId}: should log each inactivation and activation with the user, time and before and after status`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Active');
    const trade = formulary.trades[0];
    /** Toggles the trade, sends the change and approves it; returns the toggle's and the submission's answers and the status read afterwards. */
    const approveToggle = async (): Promise<{ toggled: number; sent: number; status: string }> => {
      const answer = await formularyTradesTab.toggleStatus(trade.id);
      const sent = await formularyDetailPage.sendForApproval();
      await approveFormulary(page, formulary.nameEn);
      await formularyDetailPage.reload();
      await formularyTradesTab.open();
      return { toggled: answer.status, sent: sent.status, status: (await formularyTradesTab.readCard(trade.id)).status };
    };

    await steps.critical('Navigate to the Formulary Management module - the module loads successfully', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
    });

    await steps.critical('Inactivate a trade and approve the change - the trade status updates to Inactive', async () => {
      const outcome = await approveToggle();
      expect([outcome.toggled, outcome.sent]).toEqual([200, 200]);
      expect(outcome.status).toMatch(INACTIVE);
    });

    await steps.critical('Activate the same trade again and approve the change - the trade status updates to Active', async () => {
      const outcome = await approveToggle();
      expect([outcome.toggled, outcome.sent]).toEqual([200, 200]);
      expect(outcome.status).toMatch(ACTIVE);
    });

    await steps.step('Open the audit log - both actions are listed with the acting user, timestamp, previous and new status', async () => {
      const entries = (await readAuditTrail(page, formulary.id)).items.map((entry) => JSON.stringify(entry)).filter((text) => STATUS_CHANGE_ENTRY.test(text) && text.includes(trade.id));
      expect(entries.length, 'one entry for the inactivation and one for the activation').toBeGreaterThanOrEqual(2);
      for (const text of entries.slice(0, 2)) {
        expect(text, 'the acting user').toMatch(/"(userName|user|createdBy|performedBy|actor)[A-Za-z]*"\s*:\s*"[^"]+"/i);
        expect(text, 'the timestamp').toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
        expect(text, 'the previous and the new status').toMatch(/(old|previous|before)[A-Za-z]*"\s*:/i);
        expect(text).toMatch(/(new|after|current)[A-Za-z]*"\s*:/i);
      }
    });
  });

  test(`TC-${CASES.reflectedOnTab.azureId}: should show the approved inactivation on the trade's card in the Trades & Pricing tab`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Active');
    const trade = formulary.trades[0];

    await steps.critical('Navigate to the Formulary Management module - the module loads successfully', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Inactivate a trade and approve the change - the trade status updates to Inactive', async () => {
      const staged = await setTradeStatus(page, trade.id, true);
      expect(staged.status, answerText(staged)).toBe(200);
      await submitAndApprove(page, formulary);
      expect(await pendingFormularyRequestId(page, formulary.nameEn)).toBe('');
    });

    await steps.critical('Open the Trade & Pricing tab of the same formulary - the tab loads with the trade cards', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      expect(await formularyTradesTab.countCards()).toBe(formulary.trades.length);
    });

    await steps.step('Locate the affected trade card - it reads Inactive, matching the approved change', async () => {
      const card = await formularyTradesTab.readCard(trade.id);
      expect(card.status).toMatch(INACTIVE);
      expect(card.toggleLabel).toMatch(OFFERS_ACTIVATE);
    });
  });
});
