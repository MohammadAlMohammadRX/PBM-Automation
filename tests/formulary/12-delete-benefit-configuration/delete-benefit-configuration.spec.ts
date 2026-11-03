import { expect } from '../../../fixtures';
import { SCOPED_PAYER } from '../../../data/formulary/formularyPermissions.data';
import { test } from '../../../utils/formulary/writerCHelpers';
import type { BenefitConfigDrawer } from '../../../pages/formulary/BenefitConfigDrawer';
import { FormularyDetailPage } from '../../../pages/formulary/FormularyDetailPage';
import { FormularyTradesTab } from '../../../pages/formulary/FormularyTradesTab';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { MESSAGE } from '../../../data/formulary/formulary.data';
import {
  ACTIVE,
  BLOCKED_CASES,
  CASES,
  DELETE_PROMPT,
  DRAFT,
  EXPIRED,
  FUTURE,
  ONLY_FUTURE,
} from '../../../data/formulary/deleteBenefitConfiguration.data';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import {
  addBenefitConfig,
  answerText,
  deleteBenefitConfig,
  readBenefitConfigs,
  waitUntil,
} from '../../../utils/FormularyProvisioning';
import {
  benefitTimeline,
  isoIn,
  provide,
  requireAccepted,
  signInWithFormularyRights,
  stamp,
} from '../../../utils/formulary/writerBHelpers';

/**
 * User story 15204: Delete Benefit Configuration.
 * A configuration is deleted only while Not Live or Future and never while
 * processed claims reference it; Active and Expired ones are refused with a
 * reason, the deletion asks for confirmation and is re-checked when confirmed,
 * and only permitted users may delete.
 */
test.describe('US 15204 - Delete Benefit Configuration', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.deleteFuture.azureId}: should delete a Future benefit configuration with no referencing claims`, async ({
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const name = `Future Delete ${stamp()}`;
    const formulary = await formularyIn('Future', { benefitConfigs: [{ nameEn: name }] });
    let drawer!: BenefitConfigDrawer;
    let configId = '';

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Benefit Configuration list and locate the Future entry - it offers Delete', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openBenefitConfigs(formulary.trades[0].id);
      configId = await drawer.configIdByName(name);
      expect((await drawer.readCard(configId)).status).toMatch(FUTURE);
      expect(await drawer.getCardActionAvailability(configId, 'delete')).toBe('available');
    });

    await steps.step('Select Delete and confirm - the configuration is removed from the list', async () => {
      const answer = await drawer.deleteConfig(configId);
      expect(answer.status, answer.text.slice(0, 300)).toBe(200);
      await expect.poll(async () => drawer.readConfigIds()).not.toContain(configId);
    });
  });

  test(`TC-${CASES.deleteNotLive.azureId}: should delete a Not Live benefit configuration with no referencing claims`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const name = `Not Live Delete ${stamp()}`;
    const formulary = await formularyIn('Draft', { benefitConfigs: [{ nameEn: name }] });
    const trade = formulary.trades[0];
    let drawer!: BenefitConfigDrawer;
    let configId = '';

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Benefit Configuration list and locate the Not Live entry - it offers Delete', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openBenefitConfigs(trade.id);
      configId = await drawer.configIdByName(name);
      expect((await drawer.readCard(configId)).status).toMatch(DRAFT);
      expect(await drawer.getCardActionAvailability(configId, 'delete')).toBe('available');
    });

    await steps.step('Select Delete and confirm - the configuration is removed from the list', async () => {
      const answer = await drawer.deleteConfig(configId);
      expect(answer.status, answer.text.slice(0, 300)).toBe(200);
      await expect.poll(async () => drawer.readConfigIds()).not.toContain(configId);
      expect((await readBenefitConfigs(page, trade.id)).map((b) => b.id)).not.toContain(configId);
    });
  });

  for (const stage of ['active', 'expired'] as const) {
    const data = stage === 'active' ? CASES.activeBlocked : CASES.expiredBlocked;
    const label = stage === 'active' ? 'Active' : 'Expired';
    test(`TC-${data.azureId}: should refuse to delete a benefit configuration that is ${label}`, async ({
      page,
      formularyManagementPage,
      formularyTradesTab,
      formularyIn,
      steps,
    }, testInfo) => {
      const timeline = await provide(testInfo, 'a benefit configuration timeline', () => benefitTimeline(page, formularyIn, [stage]));
      const name = timeline.names[stage] ?? '';
      let configId = '';

      await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
        await waitUntil(page, stage === 'active' ? timeline.activeFrom : timeline.expiredAfter);
        await formularyManagementPage.open();
        expect(await formularyManagementPage.isListed(timeline.formulary.nameEn)).toBe(true);
      });

      await steps.step(`Open the Benefit Configuration list and locate the ${label} entry - Delete is disabled or not available`, async () => {
        await formularyManagementPage.openDetails(timeline.formulary.nameEn);
        await formularyTradesTab.open();
        const drawer = await formularyTradesTab.openBenefitConfigs(timeline.tradeId);
        configId = await drawer.configIdByName(name);
        expect((await drawer.readCard(configId)).status).toMatch(stage === 'active' ? ACTIVE : EXPIRED);
        expect(await drawer.getCardActionAvailability(configId, 'delete')).not.toBe('available');
      });

      await steps.step(`Trigger the deletion directly - it is refused with a message that ${label} configurations cannot be deleted`, async () => {
        const direct = await deleteBenefitConfig(page, configId || ((await readBenefitConfigs(page, timeline.tradeId)).find((b) => b.benefitConfigNameEn === name)?.id ?? ''));
        expect(direct.status, `DeleteBenefitConfig answered ${direct.status} ${answerText(direct)}`).toBeGreaterThanOrEqual(400);
        expect(answerText(direct)).toMatch(ONLY_FUTURE);
        expect((await readBenefitConfigs(page, timeline.tradeId)).map((b) => b.benefitConfigNameEn)).toContain(name);
      });
    });
  }

  test(`TC-${CASES.noPermission.azureId}: should withhold the deletion of benefit configurations from a user without the permission`, async ({
    page,
    formularyIn,
    formularyRole,
    steps,
  }, testInfo) => {
    const name = `Guarded Delete ${stamp()}`;
    const formulary = await formularyIn('Future', { payerName: SCOPED_PAYER, benefitConfigs: [{ nameEn: name }] });
    const trade = formulary.trades[0];
    const configId = (await readBenefitConfigs(page, trade.id)).find((b) => b.benefitConfigNameEn === name)?.id ?? '';
    const session = await signInWithFormularyRights(formularyRole, { lacking: ['deleteBenefitConfig'] });
    const detail = new FormularyDetailPage(session.page);
    const trades = new FormularyTradesTab(session.page);

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await detail.openExpectingFailure(formulary.id);
      expect(session.page.url()).toContain(formulary.id);
    });

    await steps.step('As a user without the analyst role, open the Benefit Configuration list - Delete is disabled or hidden on every entry', async () => {
      const reachable = (await detail.isLoaded()) && (await trades.open().then(() => true).catch(() => false))
        && (await trades.getCardActionAvailability(trade.id, 'benefitConfig')) === 'available';
      if (reachable) {
        const drawer = await trades.openBenefitConfigs(trade.id);
        for (const id of await drawer.readConfigIds()) expect(await drawer.getCardActionAvailability(id, 'delete'), id).not.toBe('available');
      } else {
        expect(await trades.getCardActionAvailability(trade.id, 'benefitConfig')).not.toBe('available');
      }
    });

    await steps.step('Trigger the deletion directly - it is denied with an authorization message', async () => {
      const direct = await deleteBenefitConfig(session.page, configId);
      expect(direct.status, `a direct DeleteBenefitConfig answered ${direct.status}`).toBeGreaterThanOrEqual(400);
      expect(answerText(direct)).toMatch(MESSAGE.denied);
      expect((await readBenefitConfigs(page, trade.id)).map((b) => b.id)).toContain(configId);
    });
  });

  test(`TC-${CASES.revalidatedOnConfirm.azureId}: should re-check eligibility when the deletion is confirmed after the configuration became Active`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }, testInfo) => {
    const timeline = await provide(testInfo, 'a benefit configuration timeline', () => benefitTimeline(page, formularyIn, ['active']));
    const name = timeline.names.active ?? '';
    let answer: { status: number; text: string } | null = null;
    let configId = '';
    let drawer!: BenefitConfigDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(timeline.formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Delete confirmation of a Future configuration - a confirmation dialog is displayed', async () => {
      await formularyManagementPage.openDetails(timeline.formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openBenefitConfigs(timeline.tradeId);
      configId = await drawer.configIdByName(name);
      expect((await drawer.readCard(configId)).status).toMatch(FUTURE);
      const dialog = await drawer.requestDelete(configId);
      expect(await dialog.getMessage()).toMatch(DELETE_PROMPT);
      await waitUntil(page, timeline.activeFrom);
      answer = await NetworkUtils.captureResponse(page, ApiEndpoints.benefitConfigDelete, () => dialog.confirm().catch(() => undefined));
      expect(answer, 'confirming should send the deletion').not.toBeNull();
    });

    await steps.step('Let it become Active before confirming - the deletion is blocked as no longer eligible', async () => {
      expect(answer?.status, `DeleteBenefitConfig answered ${answer?.status} ${answer?.text.slice(0, 300)}`).toBeGreaterThanOrEqual(400);
      expect(`${answer?.text ?? ''} ${(await drawer.getMessages()).join(' | ')}`).toMatch(ONLY_FUTURE);
      expect((await readBenefitConfigs(page, timeline.tradeId)).map((b) => b.id)).toContain(configId);
    });
  });

  test(`TC-${CASES.confirmationRequired.azureId}: should delete a configuration only after the deletion is confirmed`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const name = `Confirm Delete ${stamp()}`;
    const formulary = await formularyIn('Future', { benefitConfigs: [{ nameEn: name }] });
    const trade = formulary.trades[0];
    let drawer!: BenefitConfigDrawer;
    let configId = '';

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openBenefitConfigs(trade.id);
      configId = await drawer.configIdByName(name);
    });

    await steps.step('Select Delete on the eligible configuration - a dialog asks to confirm the deletion', async () => {
      const dialog = await drawer.requestDelete(configId);
      expect(`${await dialog.getTitle()} ${await dialog.getMessage()}`).toMatch(DELETE_PROMPT);
      await dialog.cancel();
    });

    await steps.step('Cancel the dialog - the configuration stays in the list unchanged', async () => {
      expect(await drawer.readConfigIds()).toContain(configId);
      expect((await readBenefitConfigs(page, trade.id)).map((b) => b.id)).toContain(configId);
    });

    await steps.step('Select Delete again and confirm - the configuration is removed from the list', async () => {
      const answer = await drawer.deleteConfig(configId);
      expect(answer.status, answer.text.slice(0, 300)).toBe(200);
      await expect.poll(async () => drawer.readConfigIds()).not.toContain(configId);
    });
  });

  test(`TC-${CASES.everyStatus.azureId}: should delete only Not Live and Future configurations and refuse the others with a clear message`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }, testInfo) => {
    const timeline = await provide(testInfo, 'a benefit configuration timeline', () => benefitTimeline(page, formularyIn, ['future', 'active', 'expired']));
    const draft = await addBenefitConfig(page, timeline.tradeId, { nameEn: `Not Live Matrix ${stamp()}`, benefitEffectiveDate: isoIn(3 * 24 * 60) });
    requireAccepted(testInfo, draft, 'a Not Live benefit configuration on the published formulary');
    const names = { notLive: draft.nameEn, future: timeline.names.future ?? '', active: timeline.names.active ?? '', expired: timeline.names.expired ?? '' };
    let drawer!: BenefitConfigDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await waitUntil(page, timeline.expiredAfter);
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(timeline.formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the list holding Not Live, Active, Future and Expired configurations - every entry is displayed', async () => {
      await formularyManagementPage.openDetails(timeline.formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openBenefitConfigs(timeline.tradeId);
      for (const name of Object.values(names)) expect(await drawer.configIdByName(name), name).not.toBe('');
    });

    await steps.step('Attempt Delete on every status - only Not Live and Future succeed; Active and Expired are refused with a clear message', async () => {
      const outcomes: Record<string, number> = {};
      const reasons: string[] = [];
      for (const [stage, name] of Object.entries(names)) {
        const id = await drawer.configIdByName(name);
        const answer = (await drawer.getCardActionAvailability(id, 'delete')) === 'available'
          ? await drawer.deleteConfig(id)
          : await deleteBenefitConfig(page, id);
        outcomes[stage] = answer.status;
        if (answer.status >= 400) reasons.push(answerText({ status: answer.status, text: answer.text }));
      }
      expect(outcomes).toEqual({ notLive: 200, future: 200, active: expect.any(Number), expired: expect.any(Number) });
      expect(outcomes.active, 'Active must be refused').toBeGreaterThanOrEqual(400);
      expect(outcomes.expired, 'Expired must be refused').toBeGreaterThanOrEqual(400);
      for (const reason of reasons) expect(reason).toMatch(ONLY_FUTURE);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
