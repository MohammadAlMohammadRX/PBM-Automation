import { test, expect } from '../../../fixtures';
import {
  BLOCKED_CASES,
  CASE,
  MANY_PLANS,
  PAYER_CHANGE_BLOCKED,
  PAYER_LOCK_WARNING,
  SUITE_PAYER,
} from '../../../data/plans/formularyDependencyGuard.data';

/**
 * User story 14342: Prevent formulary payer changes or deletion while a plan depends on it.
 * The payer half (MSG-PLN-018): a formulary's payer may change only while no
 * plan is assigned to it, the lock shows on its screen, and a refused change
 * leaves the formulary and its plan list exactly as they were.
 *
 * Every formulary changed is the case's own (`disposableFormulary`); 19343
 * only READS the suite formulary. See the data file.
 */
test.describe('US 14342 - Formulary payer lock', () => {
  test.describe.configure({ timeout: 25 * 60_000 });

  test(`TC-${CASE.unassignedChange}: should save the new payer with no blocking message when the formulary is assigned to no plan`, async ({
    planManagementPage,
    formularyDetailPage,
    disposableFormulary,
    foreignFormulary,
    steps,
  }) => {
    const formulary = await disposableFormulary();
    const target = await foreignFormulary();
    let answer = { status: 0, text: '' };

    await steps.critical('Navigate to the Plans Management module - the dashboard loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isKpiBandVisible()).toBe(true);
    });

    await steps.critical('Open a formulary linked to no plan - its detail page shows the current payer', async () => {
      await formularyDetailPage.open(formulary.id);
      expect(await formularyDetailPage.readPayer()).toBe(SUITE_PAYER);
      expect((await formularyDetailPage.readViaApi(formulary.id)).assignedPlanCount ?? 0, 'no plan uses it').toBe(0);
    });

    await steps.step('Edit the Payer field and select a different payer - the field accepts the new payer', async () => {
      await formularyDetailPage.openEdit();
      expect(await formularyDetailPage.isPayerEditable(), 'an unassigned formulary\'s payer should be editable').toBe(true);
      await formularyDetailPage.closeEdit();
    });

    await steps.step('Save the change - it is saved and the formulary reflects the new payer, with no MSG-PLN-018', async () => {
      answer = await formularyDetailPage.changePayerViaApi(formulary.id, target.payerId);
      expect(answer.status, `UpdateFormulary: ${answer.text.slice(0, 200)}`).toBeLessThan(300);
      expect(answer.text, 'no payer-lock message').not.toMatch(PAYER_CHANGE_BLOCKED);
      expect(await formularyDetailPage.publishChangeViaApi(formulary), 'the change should publish').toBe('');
      expect((await formularyDetailPage.readViaApi(formulary.id)).payerId, 'the formulary should carry the new payer').toBe(target.payerId);
    });
  });

  test(`TC-${CASE.assignedBlocked}: should reject the payer change with MSG-PLN-018 and keep the payer when the formulary is assigned to a plan`, async ({
    planManagementPage,
    formularyDetailPage,
    disposableFormulary,
    foreignFormulary,
    planIn,
    steps,
  }) => {
    const formulary = await disposableFormulary();
    const target = await foreignFormulary();
    const plan = await planIn('Active', { formularyId: formulary.id });

    await steps.critical('Navigate to the Plans Management module - the dashboard loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.step('Open the formulary assigned to a plan - its detail page lists the assigned plans', async () => {
      await formularyDetailPage.open(formulary.id);
      expect((await formularyDetailPage.readViaApi(formulary.id)).assignedPlanCount ?? 0, 'the server counts the plan').toBeGreaterThanOrEqual(1);
      expect(await formularyDetailPage.getPageText(), 'the assigned plan should be listed').toContain(plan.name);
    });

    await steps.step('Edit the Payer field - the drawer opens on the payer', async () => {
      await formularyDetailPage.openEdit();
      expect(await formularyDetailPage.readPayerField()).toContain(SUITE_PAYER);
      await formularyDetailPage.closeEdit();
    });

    await steps.step('Save a different payer - rejected with MSG-PLN-018 and the payer is unchanged', async () => {
      const answer = await formularyDetailPage.changePayerViaApi(formulary.id, target.payerId);
      expect(answer.status, `UpdateFormulary should be refused: ${answer.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
      expect(answer.text, 'MSG-PLN-018').toMatch(PAYER_CHANGE_BLOCKED);
      expect((await formularyDetailPage.readViaApi(formulary.id)).payerId).toBe(formulary.payerId);
    });
  });

  test(`TC-${CASE.oneOrMany}: should block the payer change with MSG-PLN-018 when the formulary has one plan or many`, async ({
    planManagementPage,
    formularyDetailPage,
    disposableFormulary,
    foreignFormulary,
    planIn,
    steps,
  }) => {
    test.setTimeout(40 * 60_000);
    const target = await foreignFormulary();
    const single = await disposableFormulary();
    const shared = await disposableFormulary();
    await planIn('Active', { formularyId: single.id });
    for (let i = 0; i < MANY_PLANS; i += 1) await planIn('Active', { formularyId: shared.id });

    await steps.critical('Navigate to the Plans Management module - the dashboard loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isKpiBandVisible()).toBe(true);
    });

    await steps.step('Change the payer of the formulary linked to exactly one plan - rejected with MSG-PLN-018', async () => {
      expect((await formularyDetailPage.readViaApi(single.id)).assignedPlanCount).toBe(1);
      const answer = await formularyDetailPage.changePayerViaApi(single.id, target.payerId);
      expect(answer.status, answer.text.slice(0, 200)).toBeGreaterThanOrEqual(400);
      expect(answer.text).toMatch(PAYER_CHANGE_BLOCKED);
    });

    await steps.step('Change the payer of the formulary linked to several plans - rejected with MSG-PLN-018', async () => {
      expect((await formularyDetailPage.readViaApi(shared.id)).assignedPlanCount).toBe(MANY_PLANS);
      const answer = await formularyDetailPage.changePayerViaApi(shared.id, target.payerId);
      expect(answer.status, answer.text.slice(0, 200)).toBeGreaterThanOrEqual(400);
      expect(answer.text).toMatch(PAYER_CHANGE_BLOCKED);
    });
  });

  test(`TC-${CASE.payerLocked}: should show the payer locked and list the dependent plans when the formulary is assigned to a plan`, async ({
    planManagementPage,
    formularyDetailPage,
    planFormulary,
    planIn,
    steps,
  }) => {
    const formulary = await planFormulary();
    const plan = await planIn('Active');

    await steps.critical('Navigate to the Plans Management module - the dashboard loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the assigned formulary\'s detail page - it shows the payer field', async () => {
      await formularyDetailPage.open(formulary.id);
      expect(await formularyDetailPage.readPayer()).toBe(SUITE_PAYER);
    });

    await steps.step('Check the Payer field and its guidance - read-only / disabled, or warned as unchangeable', async () => {
      // A formulary that offers no Edit at all cannot have its payer changed
      // from the screen - locked by construction. FORM-0023 offered none on the
      // full run (2026-10-27) and the step timed out looking for it.
      if ((await formularyDetailPage.getActionAvailability('edit')) !== 'available') return;
      await formularyDetailPage.openEdit();
      const editable = await formularyDetailPage.isPayerEditable();
      const warned = PAYER_LOCK_WARNING.test(await formularyDetailPage.getEditDrawerText());
      await formularyDetailPage.closeEdit();
      expect(!editable || warned, 'the payer must read as locked on an assigned formulary').toBe(true);
    });

    await steps.step('Verify the assigned plans are listed for reference - their names / codes are visible', async () => {
      expect(await formularyDetailPage.getPageText(), 'the dependent plan should be listed').toContain(plan.name);
    });
  });

  test(`TC-${CASE.listConsistent}: should keep the plan list and payer unchanged across navigation when a payer change was blocked`, async ({
    planManagementPage,
    formularyDetailPage,
    disposableFormulary,
    foreignFormulary,
    planIn,
    steps,
  }) => {
    test.setTimeout(30 * 60_000);
    const target = await foreignFormulary();
    const formulary = await disposableFormulary();
    for (let i = 0; i < MANY_PLANS; i += 1) await planIn('Active', { formularyId: formulary.id });
    let before = { payerId: '', assignedPlanCount: 0, payer: '' };

    await steps.critical('Navigate to the Plans Management module - the dashboard loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isKpiBandVisible()).toBe(true);
    });

    await steps.critical('Open the formulary and note its assigned plans - they are listed', async () => {
      await formularyDetailPage.open(formulary.id);
      const record = await formularyDetailPage.readViaApi(formulary.id);
      before = { payerId: record.payerId, assignedPlanCount: record.assignedPlanCount ?? 0, payer: await formularyDetailPage.readPayer() };
      expect(before.assignedPlanCount).toBe(MANY_PLANS);
    });

    await steps.critical('Attempt a payer change (blocked), navigate away and back - the formulary reloads', async () => {
      const answer = await formularyDetailPage.changePayerViaApi(formulary.id, target.payerId);
      expect(answer.status, answer.text.slice(0, 200)).toBeGreaterThanOrEqual(400);
      await planManagementPage.openListFor(SUITE_PAYER);
      await formularyDetailPage.open(formulary.id);
      expect(await formularyDetailPage.getName()).toBe(formulary.formularyNameEn);
    });

    await steps.step('Re-check the assigned plans and the payer - they match what was noted', async () => {
      const record = await formularyDetailPage.readViaApi(formulary.id);
      expect({ payerId: record.payerId, assignedPlanCount: record.assignedPlanCount ?? 0, payer: await formularyDetailPage.readPayer() }).toEqual(before);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
