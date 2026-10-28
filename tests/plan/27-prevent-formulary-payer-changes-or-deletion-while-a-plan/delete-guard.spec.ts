import { test, expect } from '../../../fixtures';
import {
  APPROVAL_CELL,
  CASE,
  DELETE_BLOCKED_PENDING,
  PAYER_CHANGE_BLOCKED,
  REPEATS,
  SUITE_PAYER,
} from '../../../data/plans/formularyDependencyGuard.data';

/**
 * User story 14342: Prevent formulary payer changes or deletion while a plan depends on it.
 * The deletion half (MSG-PLN-019): a formulary cannot be deleted while a plan
 * change that assigns it awaits a decision; once that change is discarded or
 * decided the deletion proceeds - and refused attempts change nothing.
 *
 * Every formulary is the case's own (`disposableFormulary`); the in-progress
 * plan change is a plan awaiting approval with it (`planIn('PendingApproval')`).
 */
test.describe('US 14342 - Formulary deletion guard', () => {
  test.describe.configure({ timeout: 25 * 60_000 });

  test(`TC-${CASE.decisionTable}: should block only the dependent combinations when payer changes and deletions are tried across assignment states`, async ({
    planManagementPage,
    formularyDetailPage,
    disposableFormulary,
    foreignFormulary,
    planIn,
    steps,
  }) => {
    test.setTimeout(40 * 60_000);
    const target = await foreignFormulary();
    const free = await disposableFormulary();
    const assigned = await disposableFormulary();
    const pending = await disposableFormulary();
    await planIn('Active', { formularyId: assigned.id });
    await planIn('PendingApproval', { formularyId: pending.id });

    await steps.critical('Navigate to the Plans Management module - the dashboard loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isKpiBandVisible()).toBe(true);
    });

    await steps.step('Change the payer of a formulary with no plan assignment - allowed and saved', async () => {
      const answer = await formularyDetailPage.changePayerViaApi(free.id, target.payerId);
      expect(answer.status, answer.text.slice(0, 200)).toBeLessThan(300);
      expect(await formularyDetailPage.publishChangeViaApi(free), 'the change should publish').toBe('');
    });

    await steps.step('Change the payer of a formulary with an active plan assignment - blocked', async () => {
      const answer = await formularyDetailPage.changePayerViaApi(assigned.id, target.payerId);
      expect(answer.status, answer.text.slice(0, 200)).toBeGreaterThanOrEqual(400);
      expect(answer.text).toMatch(PAYER_CHANGE_BLOCKED);
    });

    await steps.step('Delete a formulary with no in-progress plan change assigning it - allowed', async () => {
      const answer = await formularyDetailPage.deleteViaApi(free.id);
      expect(answer.status, answer.text.slice(0, 200)).toBeLessThan(300);
    });

    await steps.step('Delete a formulary with an in-progress plan change assigning it - blocked', async () => {
      const answer = await formularyDetailPage.deleteViaApi(pending.id);
      expect(answer.status, answer.text.slice(0, 200)).toBeGreaterThanOrEqual(400);
      expect(answer.text).toMatch(DELETE_BLOCKED_PENDING);
    });
  });

  test(`TC-${CASE.deleteBlockedPending}: should refuse the deletion with MSG-PLN-019 when a plan change assigning the formulary awaits a decision`, async ({
    planManagementPage,
    formularyDetailPage,
    disposableFormulary,
    planIn,
    steps,
  }) => {
    const formulary = await disposableFormulary();
    const plan = await planIn('PendingApproval', { formularyId: formulary.id });

    await steps.critical('Navigate to the Plans Management module - the dashboard loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Start a plan change assigning the formulary and leave it in progress - it is saved awaiting approval', async () => {
      await planManagementPage.expectApprovalCell(plan.name, APPROVAL_CELL.pendingApproval);
    });

    await steps.step('Open the formulary and attempt to delete it - rejected with MSG-PLN-019', async () => {
      await formularyDetailPage.open(formulary.id);
      expect(await formularyDetailPage.getActionAvailability('delete'), 'Delete should be withheld on screen').not.toBe('available');
      expect(await formularyDetailPage.getActionMessage('delete'), 'the screen should explain why').toMatch(DELETE_BLOCKED_PENDING);
      const answer = await formularyDetailPage.deleteViaApi(formulary.id);
      expect(answer.status, `DeleteFormulary should be refused: ${answer.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
      expect(answer.text, 'MSG-PLN-019').toMatch(DELETE_BLOCKED_PENDING);
      expect(await formularyDetailPage.readViaApiOrNull(formulary.id), 'the formulary must remain').not.toBeNull();
    });
  });

  test(`TC-${CASE.deleteAfterDiscard}: should delete the formulary with no blocking message when the dependent plan change has been discarded`, async ({
    planManagementPage,
    planDetailPage,
    formularyDetailPage,
    disposableFormulary,
    planIn,
    steps,
  }) => {
    const formulary = await disposableFormulary();
    const plan = await planIn('PendingApproval', { formularyId: formulary.id });

    await steps.critical('Navigate to the Plans Management module - the dashboard loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the in-progress plan change and discard it - it is removed', async () => {
      await planDetailPage.open(plan.id);
      const result = await planDetailPage.deleteAndCapture();
      expect(result.status, `DeletePlan: ${result.text.slice(0, 200)}`).toBeLessThan(300);
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(false);
    });

    await steps.critical('Open the previously blocked formulary - its detail page opens', async () => {
      await formularyDetailPage.open(formulary.id);
      expect(await formularyDetailPage.getName()).toBe(formulary.formularyNameEn);
    });

    await steps.step('Attempt to delete the formulary - the deletion proceeds', async () => {
      expect(await formularyDetailPage.getActionAvailability('delete'), 'Delete should be offered again').toBe('available');
      const answer = await formularyDetailPage.deleteViaApi(formulary.id);
      expect(answer.status, `DeleteFormulary: ${answer.text.slice(0, 200)}`).toBeLessThan(300);
      expect(answer.text, 'no blocking message').not.toMatch(DELETE_BLOCKED_PENDING);
    });
  });

  test(`TC-${CASE.deleteAfterDecision}: should delete the formulary when the dependent plan change has been decided`, async ({
    planManagementPage,
    planApprovalsPage,
    formularyDetailPage,
    disposableFormulary,
    planIn,
    steps,
  }) => {
    const formulary = await disposableFormulary();
    const plan = await planIn('PendingApproval', { formularyId: formulary.id });

    await steps.critical('Navigate to the Plans Management module - the dashboard loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Confirm the plan change assigning the formulary has been approved - it shows a final status', async () => {
      await planApprovalsPage.open();
      await planApprovalsPage.approve(plan.name);
      await planManagementPage.openListFor(SUITE_PAYER);
      await planManagementPage.expectApprovalCell(plan.name, APPROVAL_CELL.approved);
    });

    await steps.critical('Open the formulary - its detail page opens', async () => {
      await formularyDetailPage.open(formulary.id);
      expect(await formularyDetailPage.getName()).toBe(formulary.formularyNameEn);
    });

    await steps.step('Attempt to delete the formulary - the deletion proceeds', async () => {
      expect(await formularyDetailPage.getActionAvailability('delete'), `Delete is offered (${await formularyDetailPage.getActionMessage('delete')})`).toBe('available');
      const answer = await formularyDetailPage.deleteViaApi(formulary.id);
      expect(answer.status, `DeleteFormulary: ${answer.text.slice(0, 200)}`).toBeLessThan(300);
    });
  });

  test(`TC-${CASE.repeatedAttempts}: should refuse every repeated attempt and leave the formulary data unchanged when blocked changes are retried`, async ({
    planManagementPage,
    formularyDetailPage,
    disposableFormulary,
    foreignFormulary,
    planIn,
    steps,
  }) => {
    test.setTimeout(35 * 60_000);
    const target = await foreignFormulary();
    const assigned = await disposableFormulary();
    const pending = await disposableFormulary();
    await planIn('Active', { formularyId: assigned.id });
    await planIn('PendingApproval', { formularyId: pending.id });
    let payerBefore = '';

    await steps.critical('Navigate to the Plans Management module - the dashboard loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isKpiBandVisible()).toBe(true);
      await formularyDetailPage.open(assigned.id);
      payerBefore = await formularyDetailPage.readPayer();
      expect(payerBefore).toBe(SUITE_PAYER);
    });

    await steps.step('Change the payer of the assigned formulary several times rapidly - each attempt refused with MSG-PLN-018, no partial save', async () => {
      const answers = await Promise.all(Array.from({ length: REPEATS }, () => formularyDetailPage.changePayerViaApi(assigned.id, target.payerId)));
      expect(answers.filter((a) => a.status < 400 || !PAYER_CHANGE_BLOCKED.test(a.text)).map((a) => `${a.status} ${a.text.slice(0, 120)}`)).toEqual([]);
      expect((await formularyDetailPage.readViaApi(assigned.id)).payerId).toBe(assigned.payerId);
    });

    await steps.step('Delete the formulary with an in-progress dependent change several times - each refused with MSG-PLN-019, it remains', async () => {
      const answers: { status: number; text: string }[] = [];
      for (let i = 0; i < REPEATS; i += 1) answers.push(await formularyDetailPage.deleteViaApi(pending.id));
      expect(answers.filter((a) => a.status < 400 || !DELETE_BLOCKED_PENDING.test(a.text)).map((a) => `${a.status} ${a.text.slice(0, 120)}`)).toEqual([]);
      expect(await formularyDetailPage.readViaApiOrNull(pending.id)).not.toBeNull();
    });

    await steps.step('Reload the formulary detail page - the original payer and formulary data remain', async () => {
      await formularyDetailPage.open(assigned.id);
      expect(await formularyDetailPage.readPayer()).toBe(payerBefore);
      const record = await formularyDetailPage.readViaApi(assigned.id);
      expect({ name: record.formularyNameEn, payerId: record.payerId, code: record.formularyCode })
        .toEqual({ name: assigned.formularyNameEn, payerId: assigned.payerId, code: assigned.formularyCode });
    });
  });

  test(`TC-${CASE.reevaluated}: should block the deletion and then allow it when the dependent plan change goes from in progress to discarded`, async ({
    planManagementPage,
    planDetailPage,
    formularyDetailPage,
    disposableFormulary,
    planIn,
    steps,
  }) => {
    const formulary = await disposableFormulary();
    const plan = await planIn('PendingApproval', { formularyId: formulary.id });

    await steps.critical('Navigate to the Plans Management module - the dashboard loads', async () => {
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.step('Open the formulary and attempt deletion while the plan change is in progress - blocked with MSG-PLN-019', async () => {
      await formularyDetailPage.open(formulary.id);
      const answer = await formularyDetailPage.deleteViaApi(formulary.id);
      expect(answer.status, answer.text.slice(0, 200)).toBeGreaterThanOrEqual(400);
      expect(answer.text).toMatch(DELETE_BLOCKED_PENDING);
    });

    await steps.critical('In a separate workflow, discard the dependent plan change - it reaches a discarded state', async () => {
      await planDetailPage.open(plan.id);
      const result = await planDetailPage.deleteAndCapture();
      expect(result.status, `DeletePlan: ${result.text.slice(0, 200)}`).toBeLessThan(300);
      await planManagementPage.openListFor(SUITE_PAYER);
      expect(await planManagementPage.isListed(plan.name)).toBe(false);
    });

    await steps.step('Return to the formulary and retry the deletion - it now proceeds', async () => {
      await formularyDetailPage.open(formulary.id);
      const answer = await formularyDetailPage.deleteViaApi(formulary.id);
      expect(answer.status, `DeleteFormulary: ${answer.text.slice(0, 200)}`).toBeLessThan(300);
    });
  });
});
