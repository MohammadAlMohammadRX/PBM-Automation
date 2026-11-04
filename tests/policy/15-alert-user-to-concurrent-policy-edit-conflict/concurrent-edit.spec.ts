import { test, expect } from '../../../fixtures';
import type { PolicyDetailPage } from '../../../pages/policy/PolicyDetailPage';
import type { PolicyFormDrawer, PolicySaveAnswer } from '../../../pages/policy/PolicyFormDrawer';
import { LABEL } from '../../../data/policy/policy.data';
import {
  ADVISES_RELOAD,
  BLOCKED_CASES,
  CASES,
  CONFLICT_SENTENCE,
  MODIFIED_SINCE_OPENED,
  NOT_SAVED_TITLE,
} from '../../../data/policy/concurrentEdit.data';
import { clickReload, isConflict, openEditIn, readGracePeriod, reloadPrompt, typeGracePeriod } from '../../../utils/policy/writerCHelpers';
import { readPolicy } from '../../../utils/PolicyProvisioning';

/** What a save answered, for an assertion message. */
const said = (answer: PolicySaveAnswer): string => `${answer.status} ${answer.text.slice(0, 200)} | ${answer.messages.join(' | ')}`;

/**
 * The message of a missing reload prompt (2026-11-04): what the conflict showed, read
 * when the save answered - the toast is gone by the time the prompt is looked for,
 * which left the 2026-11-03 failures reading "what was shown: " with nothing after it.
 */
const noPrompt = (onConflict: string, later: string): string =>
  `no reload dialog and no Reload control; the conflict showed only: "${onConflict || '(nothing)'}"${later ? `, then "${later}"` : ''}`;

/**
 * User story 15186: Alert user to concurrent policy edit conflict - AUTOMATED
 * with two sessions (user decision 2026-11-03): User A is the test's own
 * administrator window, User B a separate browser context signed in as the
 * administrator, User C (19627) a second tab of the first session. Each loads
 * the policy on its own; the Grace Period is the field edited
 * (data/policy/concurrentEdit.data.ts).
 */
test.describe('US 15186 - Alert user to concurrent policy edit conflict', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  /**
   * User A opens the Edit drawer, User B (a second session) opens it too and
   * saves `userB`, then User A types `userA` and saves. Returns User A's drawer
   * (still open) and what its save answered.
   */
  async function provokeConflict(
    userA: { detail: PolicyDetailPage },
    openUserB: () => Promise<{ detail: PolicyDetailPage }>,
    policyId: string,
    values: { userA: string; userB: string },
  ): Promise<{ drawerA: PolicyFormDrawer; answer: PolicySaveAnswer; savedByB: PolicySaveAnswer }> {
    const drawerA = await openEditIn(userA, policyId);
    const userB = await openUserB();
    const drawerB = await openEditIn(userB, policyId);
    await typeGracePeriod(drawerB, values.userB);
    const savedByB = await drawerB.attemptSave();
    expect(savedByB.status, `User B's save: ${said(savedByB)}`).toBe(200);
    await typeGracePeriod(drawerA, values.userA);
    return { drawerA, answer: await drawerA.attemptSave(), savedByB };
  }

  test(`TC-${CASES.warned.azureId}: should warn User A instead of saving when User B changed the policy after it was opened`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyIn,
    policySecondSession,
    steps,
  }) => {
    const data = CASES.warned;
    const policy = await policyIn('Draft');
    let drawerA!: PolicyFormDrawer;

    await steps.critical('Navigate to the Policy Management module - the module home screen shows the policy list', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('As User A, open the policy for editing - the policy opens in edit mode', async () => {
      drawerA = await openEditIn({ detail: policyDetailPage }, policy.id);
      expect(await drawerA.getTitle()).toBe(LABEL.drawerTitle.edit);
    });

    await steps.critical(`As User B, open the same policy, change the grace period to ${data.userB} and save - User B's update is confirmed`, async () => {
      const userB = await policySecondSession();
      const drawerB = await openEditIn(userB, policy.id);
      await typeGracePeriod(drawerB, data.userB);
      const answer = await drawerB.attemptSave();
      expect(answer.status, said(answer)).toBe(200);
      expect((await readPolicy(page, policy.id)).gracePeriodDays).toBe(Number(data.userB));
    });

    await steps.step(`As User A, change the grace period to ${data.userA} and attempt to save - a concurrent edit conflict warning is shown instead of saving`, async () => {
      await typeGracePeriod(drawerA, data.userA);
      const answer = await drawerA.attemptSave();
      expect(isConflict(answer, CONFLICT_SENTENCE), said(answer)).toBe(true);
      expect(answer.messages.join(' | ')).toContain(CONFLICT_SENTENCE);
      expect((await readPolicy(page, policy.id)).gracePeriodDays, 'User B\'s value kept').toBe(Number(data.userB));
    });
  });

  test(`TC-${CASES.reloadPrompt.azureId}: should prompt the user to reload the policy after a conflict and refresh it on Reload`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyIn,
    policySecondSession,
    steps,
  }) => {
    const data = CASES.reloadPrompt;
    const policy = await policyIn('Draft');

    await steps.critical('Navigate to the Policy Management module - the module home screen shows the policy list', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    let shownOnConflict = '';
    await steps.critical('Trigger a save that conflicts (another user saved first) - the conflict message is displayed', async () => {
      const { answer } = await provokeConflict({ detail: policyDetailPage }, policySecondSession, policy.id, data);
      shownOnConflict = answer.messages.join(' | ');
      expect(isConflict(answer, CONFLICT_SENTENCE), said(answer)).toBe(true);
    });

    await steps.step('Review the options presented - a prompt tells the user to reload the policy before saving again', async () => {
      const prompt = await reloadPrompt(page);
      expect(prompt.shown, noPrompt(shownOnConflict, prompt.text)).toBe(true);
    });

    await steps.step('Select Reload - the policy is refreshed with the latest saved data', async () => {
      expect(await clickReload(page), 'a Reload control to select').toBe(true);
      expect(await policyDetailPage.readOverviewField('gracePeriod')).toContain(data.userB);
    });
  });

  test(`TC-${CASES.saveAfterReload.azureId}: should save the re-applied change without further conflict once the policy is reloaded`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyIn,
    policySecondSession,
    steps,
  }) => {
    const data = CASES.saveAfterReload;
    const policy = await policyIn('Draft');
    let drawer!: PolicyFormDrawer;

    await steps.critical('Precondition: User A received a concurrent edit conflict on save', async () => {
      const { answer } = await provokeConflict({ detail: policyDetailPage }, policySecondSession, policy.id, data);
      expect(isConflict(answer, CONFLICT_SENTENCE), said(answer)).toBe(true);
    });

    await steps.critical('Navigate to the Policy Management module - the module home screen shows the policy list', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical(`After reloading the policy, re-apply the grace period ${data.userA} - the field shows the new value`, async () => {
      drawer = await openEditIn({ detail: policyDetailPage }, policy.id);
      await typeGracePeriod(drawer, data.userA);
      expect(await drawer.getValue('gracePeriod')).toBe(data.userA);
    });

    await steps.step('Save the policy - the save completes successfully', async () => {
      const answer = await drawer.attemptSave();
      expect(answer.status, said(answer)).toBe(200);
    });

    await steps.step('Reopen the policy - the saved change is present and no data was lost', async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.readOverviewField('gracePeriod')).toContain(data.userA);
      const record = await readPolicy(page, policy.id);
      expect(record.gracePeriodDays).toBe(Number(data.userA));
      expect(record.policyNameEn).toBe(policy.nameEn);
    });
  });

  test(`TC-${CASES.noOverwrite.azureId}: should keep refusing the save until the user reloads after a conflict warning`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyIn,
    policySecondSession,
    steps,
  }) => {
    const data = CASES.noOverwrite;
    const policy = await policyIn('Draft');
    let drawerA!: PolicyFormDrawer;

    await steps.critical('Navigate to the Policy Management module - the module home screen shows the policy list', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Receive a conflict warning on a save attempt - the save is blocked and the reload prompt is shown', async () => {
      const conflict = await provokeConflict({ detail: policyDetailPage }, policySecondSession, policy.id, data);
      drawerA = conflict.drawerA;
      expect(isConflict(conflict.answer, CONFLICT_SENTENCE), said(conflict.answer)).toBe(true);
      const prompt = await reloadPrompt(page);
      expect(prompt.shown, noPrompt(conflict.answer.messages.join(' | '), prompt.text)).toBe(true);
    });

    await steps.step('Ignore the prompt and click Save again without reloading - the save is blocked again with the same conflict warning', async () => {
      const again = await drawerA.attemptSave();
      expect(isConflict(again, CONFLICT_SENTENCE), said(again)).toBe(true);
      expect((await readPolicy(page, policy.id)).gracePeriodDays, 'the other administrator\'s update is kept').toBe(Number(data.userB));
    });
  });

  test(`TC-${CASES.singleEditor.azureId}: should save normally with no conflict warning when nobody else changed the policy`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyIn,
    steps,
  }) => {
    const data = CASES.singleEditor;
    const policy = await policyIn('Draft');
    let drawer!: PolicyFormDrawer;

    await steps.critical('Navigate to the Policy Management module - the module home screen shows the policy list', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open a policy for editing - the policy loads in edit mode', async () => {
      drawer = await openEditIn({ detail: policyDetailPage }, policy.id);
      expect(await drawer.getTitle()).toBe(LABEL.drawerTitle.edit);
    });

    await steps.step(`Change the grace period to ${data.value} and save - the save completes with no conflict warning`, async () => {
      await typeGracePeriod(drawer, data.value);
      const answer = await drawer.attemptSave();
      expect(answer.status, said(answer)).toBe(200);
      expect(answer.messages.join(' | ')).not.toContain(CONFLICT_SENTENCE);
      expect((await readPolicy(page, policy.id)).gracePeriodDays).toBe(Number(data.value));
    });
  });

  test(`TC-${CASES.sameSecond.azureId}: should accept exactly one of two saves fired in the same moment and flag the other as a conflict`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyIn,
    policySecondSession,
    steps,
  }) => {
    const data = CASES.sameSecond;
    const policy = await policyIn('Draft');
    let drawerA!: PolicyFormDrawer;
    let drawerB!: PolicyFormDrawer;
    let answers: PolicySaveAnswer[] = [];

    await steps.critical('Navigate to the Policy Management module - the module home screen shows the policy list', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('As User A and User B, both open the same policy - both see the same initial data', async () => {
      drawerA = await openEditIn({ detail: policyDetailPage }, policy.id);
      drawerB = await openEditIn(await policySecondSession(), policy.id);
      expect(await readGracePeriod(drawerA)).toBe(await readGracePeriod(drawerB));
    });

    await steps.step('Trigger both users\' saves in immediate succession - the first save is accepted', async () => {
      await typeGracePeriod(drawerA, data.userA);
      await typeGracePeriod(drawerB, data.userB);
      answers = await Promise.all([drawerA.attemptSave(), drawerB.attemptSave()]);
      expect(answers.filter((a) => a.status === 200).length, answers.map(said).join(' || ')).toBe(1);
    });

    await steps.step('Observe the second save attempt - it is identified as a conflict and blocked despite the minimal gap', async () => {
      expect(answers.filter((a) => isConflict(a, CONFLICT_SENTENCE)).length, answers.map(said).join(' || ')).toBe(1);
      const kept = (await readPolicy(page, policy.id)).gracePeriodDays;
      const winner = answers[0].status === 200 ? data.userA : data.userB;
      expect(kept, 'the accepted save is the one stored').toBe(Number(winner));
    });
  });

  test(`TC-${CASES.reloadDiscardsLocal.azureId}: should replace the user's unsaved edits with the latest saved data on Reload`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyIn,
    policySecondSession,
    steps,
  }) => {
    const data = CASES.reloadDiscardsLocal;
    const policy = await policyIn('Draft', { maxMembers: 40 });
    const localMaxMembers = '55';
    let drawerA!: PolicyFormDrawer;

    await steps.critical('Navigate to the Policy Management module - the module home screen shows the policy list', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Make unsaved edits to several fields, then receive a conflict warning on save - the prompt to reload is displayed', async () => {
      drawerA = await openEditIn({ detail: policyDetailPage }, policy.id);
      const userB = await policySecondSession();
      const drawerB = await openEditIn(userB, policy.id);
      await typeGracePeriod(drawerB, data.userB);
      expect((await drawerB.attemptSave()).status).toBe(200);
      await typeGracePeriod(drawerA, data.userA);
      await drawerA.type('maxMembers', localMaxMembers);
      const answer = await drawerA.attemptSave();
      expect(isConflict(answer, CONFLICT_SENTENCE), said(answer)).toBe(true);
      const prompt = await reloadPrompt(page);
      expect(prompt.shown, noPrompt(answer.messages.join(' | '), prompt.text)).toBe(true);
    });

    await steps.step('Select Reload - the form repopulates', async () => {
      expect(await clickReload(page), 'a Reload control to select').toBe(true);
    });

    await steps.step('Compare the displayed values - they show the other user\'s latest data and the unsaved edits are gone', async () => {
      expect(await readGracePeriod(drawerA), 'grace period').toBe(data.userB);
      expect(await drawerA.getValue('maxMembers'), 'member limit').not.toBe(localMaxMembers);
    });
  });

  test(`TC-${CASES.clearMessage.azureId}: should tell the user the policy was changed since it was opened and to reload before retrying`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    policySecondSession,
    steps,
  }) => {
    const data = CASES.clearMessage;
    const policy = await policyIn('Draft');
    let notice = '';

    await steps.critical('Navigate to the Policy Management module - the module home screen shows the policy list', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Trigger a save that results in a conflict - the conflict notification is displayed', async () => {
      const { answer } = await provokeConflict({ detail: policyDetailPage }, policySecondSession, policy.id, data);
      expect(isConflict(answer, CONFLICT_SENTENCE), said(answer)).toBe(true);
      notice = answer.messages.join(' | ');
      expect(notice).toContain(NOT_SAVED_TITLE);
    });

    await steps.step('Read the notification - it states the policy was modified since it was opened and advises reloading before retrying', async () => {
      expect(notice).toMatch(MODIFIED_SINCE_OPENED);
      expect(notice).toMatch(ADVISES_RELOAD);
    });
  });

  test(`TC-${CASES.threeEditors.azureId}: should let only the first of three concurrent editors save and require the others to reload`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyIn,
    policySecondSession,
    policySecondWindow,
    steps,
  }) => {
    const data = CASES.threeEditors;
    const policy = await policyIn('Draft');
    const drawers: Record<'A' | 'B' | 'C', PolicyFormDrawer> = {} as Record<'A' | 'B' | 'C', PolicyFormDrawer>;
    let userB!: { detail: PolicyDetailPage };

    await steps.critical('Navigate to the Policy Management module - the module home screen shows the policy list', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Have User A, B and C open the same policy for editing - all three see the same starting data', async () => {
      drawers.A = await openEditIn({ detail: policyDetailPage }, policy.id);
      userB = await policySecondSession();
      drawers.B = await openEditIn(userB, policy.id);
      drawers.C = await openEditIn(await policySecondWindow(), policy.id);
      const values = [await readGracePeriod(drawers.A), await readGracePeriod(drawers.B), await readGracePeriod(drawers.C)];
      expect(new Set(values).size, JSON.stringify(values)).toBe(1);
    });

    await steps.step(`Save as User A first (grace period ${data.userA}) - the save succeeds and the policy is updated`, async () => {
      await typeGracePeriod(drawers.A, data.userA);
      const answer = await drawers.A.attemptSave();
      expect(answer.status, said(answer)).toBe(200);
      expect((await readPolicy(page, policy.id)).gracePeriodDays).toBe(Number(data.userA));
    });

    await steps.step('Attempt saves as User B then User C - each is flagged as a conflict and succeeds only after a reload', async () => {
      await typeGracePeriod(drawers.B, data.userB);
      const savedB = await drawers.B.attemptSave();
      await typeGracePeriod(drawers.C, data.userC);
      const savedC = await drawers.C.attemptSave();
      expect(isConflict(savedB, CONFLICT_SENTENCE), `User B: ${said(savedB)}`).toBe(true);
      expect(isConflict(savedC, CONFLICT_SENTENCE), `User C: ${said(savedC)}`).toBe(true);
      expect((await readPolicy(page, policy.id)).gracePeriodDays, 'User A\'s save kept').toBe(Number(data.userA));
      const reloaded = await openEditIn(userB, policy.id);
      await typeGracePeriod(reloaded, data.userB);
      const afterReload = await reloaded.attemptSave();
      expect(afterReload.status, `User B after reloading: ${said(afterReload)}`).toBe(200);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
