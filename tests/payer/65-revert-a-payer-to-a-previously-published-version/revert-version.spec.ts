import { test, expect } from '../../../fixtures';
import type { PayerManagementPage } from '../../../pages/payer/PayerManagementPage';
import type { ApprovalManagementPage } from '../../../pages/approval/ApprovalManagementPage';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { APPROVAL_STATE } from '../../../data/payers/withdrawApproval.data';
import { VERSION_LABEL } from '../../../data/payers/versionHistory.data';
import { NON_ADMIN_PROFILE } from '../../../data/accounts/nonAdminAccount.data';
import {
  BLOCKED_CASES,
  REVERT_ACTION,
  REVERT_CHANGE_TYPE,
  REVERT_EDIT,
  REVERT_PROMPT,
  REVERT_SAVED_AS_DRAFT,
  REVERTED_FROM,
  ROLE_CASE_SAMPLE,
  SUPERSEDED,
  UNKNOWN_VERSION_REFUSAL,
  withUnknownVersionId,
} from '../../../data/payers/revertVersion.data';

/**
 * User story: Revert a Payer to a Previously Published Version.
 *
 * The Revert action exists (see revertVersion.data.ts - folder 31's earlier
 * finding is superseded). A revert is STAGED: confirming it appends a draft
 * version "Reverted from vN", which the maker sends for approval like any other
 * change; the payer's configuration moves when a reviewer approves. Each case
 * grows its own history on a disposable published payer - v1 holds the
 * original licence, later versions the edits - so a revert to v1 is observable
 * as the licence returning to the original with a new version appended.
 */
const LICENCE = REVERT_EDIT.label;

/** Stages a revert to `label`, sends it for approval and has it approved. */
async function revertAndApprove(
  payerManagementPage: PayerManagementPage,
  approvalManagementPage: ApprovalManagementPage,
  name: string,
  label: string,
): Promise<void> {
  const detail = await payerManagementPage.openDetails(name);
  const history = detail.versionHistory();
  await history.open();
  await history.revertTo(label);
  await payerManagementPage.open();
  await payerManagementPage.sendForApproval(name);
  await approvalManagementPage.open();
  await approvalManagementPage.approve(name);
  await payerManagementPage.open();
  await payerManagementPage.search(name);
  await payerManagementPage.expectApprovalStatusContains(name, APPROVAL_STATE.published);
}

/** Publishes an edit through approval, growing the payer's history by one version. */
async function publishEdit(
  payerManagementPage: PayerManagementPage,
  approvalManagementPage: ApprovalManagementPage,
  name: string,
  value: string,
): Promise<void> {
  await payerManagementPage.open();
  await payerManagementPage.editTextFieldAndSave(name, LICENCE, value);
  await payerManagementPage.open();
  await payerManagementPage.sendForApproval(name);
  await approvalManagementPage.open();
  await approvalManagementPage.approve(name);
  await payerManagementPage.open();
  await payerManagementPage.search(name);
  await payerManagementPage.expectApprovalStatusContains(name, APPROVAL_STATE.published);
}

test.describe('Revert to a previously published version', () => {
  test('TC-001: should offer Revert on an earlier published version when the payer has two', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module and publish a second version of the payer', async () => {
      await publishEdit(payerManagementPage, approvalManagementPage, publishedPayer.nameEn, REVERT_EDIT.second);
    });

    await steps.step('Version History lists both published versions', async () => {
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const history = detail.versionHistory();
      await history.open();
      const labels = await history.getVersionLabels();
      expect(labels, 'v1 should be listed').toContain(VERSION_LABEL.firstPublished);
      expect(labels, 'v2 should be listed').toContain(VERSION_LABEL.firstEdit);
    });

    await steps.step('The earlier version offers a Revert action', async () => {
      const actions = await payerManagementPage.detail().versionHistory().getEntryActions(VERSION_LABEL.firstPublished);
      expect(actions, `${VERSION_LABEL.firstPublished} should offer "${REVERT_ACTION}"; it offers: ${actions.join(', ')}`).toContain(REVERT_ACTION);
    });
  });

  test('TC-002: should append a new version holding the reverted configuration rather than rewrite history', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();
    let original = '';
    let versionsBefore = 0;

    await steps.critical('Navigate to the module, record the original licence and publish a second version', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      original = await detail.getFieldValue(LICENCE);
      expect(original, 'the payer should carry a licence to revert to').not.toBe('');
      await publishEdit(payerManagementPage, approvalManagementPage, publishedPayer.nameEn, REVERT_EDIT.second);
    });

    await steps.step('A revert to v1 is staged, sent and approved', async () => {
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const history = detail.versionHistory();
      await history.open();
      versionsBefore = await history.getEntryCount();
      await revertAndApprove(payerManagementPage, approvalManagementPage, publishedPayer.nameEn, VERSION_LABEL.firstPublished);
    });

    await steps.step('The live configuration is back to v1\'s while v1 and v2 remain in history', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      expect(await detail.getFieldValue(LICENCE), 'the licence should read its v1 value again').toBe(original);
      const history = detail.versionHistory();
      await history.open();
      const labels = await history.getVersionLabels();
      expect(labels.some((label) => label.includes(VERSION_LABEL.firstPublished)), 'v1 should still be listed').toBe(true);
      expect(labels.some((label) => label.includes(VERSION_LABEL.firstEdit)), 'v2 should still be listed').toBe(true);
      expect(await history.getEntryCount(), 'the revert should APPEND a version').toBe(versionsBefore + 1);
      const newest = (await history.getEntries())[0];
      expect(newest.version, 'the appended version should name its source').toMatch(REVERTED_FROM);
      expect(newest.changeType, 'and be listed as a revert').toMatch(REVERT_CHANGE_TYPE);
    });
  });

  test('TC-003: should route a revert request through the standard approval workflow before it takes effect', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module and publish a second version', async () => {
      await publishEdit(payerManagementPage, approvalManagementPage, publishedPayer.nameEn, REVERT_EDIT.second);
    });

    let promptMessage = '';

    await steps.step('Confirming the revert stages it as a draft version', async () => {
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const history = detail.versionHistory();
      await history.open();
      const dialog = await history.openRevert(VERSION_LABEL.firstPublished);
      expect(await dialog.getTitle()).toMatch(REVERT_PROMPT.title);
      promptMessage = await dialog.getMessage();
      await dialog.confirm(REVERT_PROMPT.actionLabel);
      expect(await detail.getToastMessage(), 'the app should confirm the staged draft').toMatch(REVERT_SAVED_AS_DRAFT);
      expect(await detail.getVersionLabel(), 'the payer should now carry a draft').toMatch(/draft/i);
    });

    await steps.step('Sending it for approval queues the request', async () => {
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
    });

    await steps.step('Approval makes the reverted version the published one', async () => {
      await approvalManagementPage.approve(publishedPayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(publishedPayer.nameEn, APPROVAL_STATE.published);
    });

    await steps.step('The prompt describes what the action actually does', async () => {
      // VERIFIED: the prompt promises a submission ("This will submit version
      // v1 for approval") while the action saves a draft the maker must still
      // send. A maker who takes the prompt at its word leaves the revert
      // unsent - the wording should say "draft".
      expect(
        REVERT_PROMPT.describesDraft.test(promptMessage) || !REVERT_PROMPT.claimsSubmission.test(promptMessage),
        `the prompt should describe the staged draft rather than a submission; it read "${promptMessage}"`,
      ).toBe(true);
    });
  });

  test('TC-004: should refuse a revert while another submission for the payer is in flight', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module, publish a second version and leave an edit pending', async () => {
      await publishEdit(payerManagementPage, approvalManagementPage, publishedPayer.nameEn, REVERT_EDIT.second);
      await payerManagementPage.editTextFieldAndSave(publishedPayer.nameEn, LICENCE, REVERT_EDIT.third);
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
    });

    await steps.step('Revert is withheld from every version while the submission is pending', async () => {
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const history = detail.versionHistory();
      await history.open();
      const availability = await history.getEntryActionAvailability(VERSION_LABEL.firstPublished, REVERT_ACTION);
      expect(availability, 'one submission at a time: Revert must be absent or disabled').not.toBe('available');
    });
  });

  test('TC-005: should allow the revert once the in-flight submission is withdrawn', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module, publish a second version and leave an edit pending', async () => {
      await publishEdit(payerManagementPage, approvalManagementPage, publishedPayer.nameEn, REVERT_EDIT.second);
      await payerManagementPage.editTextFieldAndSave(publishedPayer.nameEn, LICENCE, REVERT_EDIT.third);
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
    });

    await steps.step('The pending submission is withdrawn by editing the payer', async () => {
      await payerManagementPage.open();
      const form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
      await form.setFieldValue(LICENCE, REVERT_EDIT.second, 'text');
      expect(await form.saveAndReportDialog(), 'the withdrawal warning should appear').toBe(true);
      await payerManagementPage.form().confirmWithdrawal();
      await approvalManagementPage.open();
      await approvalManagementPage.expectNotInQueue(publishedPayer.nameEn);
    });

    await steps.step('The revert can now be staged and sent', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const history = detail.versionHistory();
      await history.open();
      await history.revertTo(VERSION_LABEL.firstPublished);
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
    });
  });

  test('TC-006: should revert to the earliest published version when several exist', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();
    let original = '';

    await steps.critical('Navigate to the module and build a three-version history', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      original = await detail.getFieldValue(LICENCE);
      await publishEdit(payerManagementPage, approvalManagementPage, publishedPayer.nameEn, REVERT_EDIT.second);
      await publishEdit(payerManagementPage, approvalManagementPage, publishedPayer.nameEn, REVERT_EDIT.third);
    });

    await steps.step('A revert to the earliest version is staged, sent and approved', async () => {
      await revertAndApprove(payerManagementPage, approvalManagementPage, publishedPayer.nameEn, VERSION_LABEL.firstPublished);
    });

    await steps.step('The live configuration matches v1', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      expect(await detail.getFieldValue(LICENCE), 'the earliest version is a valid revert target').toBe(original);
    });
  });

  test('TC-007: should offer no Revert on the currently published version', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    let current = '';

    await steps.critical('Navigate to the module and open the payer\'s Version History', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const history = detail.versionHistory();
      await history.open();
      const published = (await history.getEntries()).find((entry) => /published/i.test(entry.status));
      expect(published, 'a published version should be listed').not.toBe(undefined);
      current = published?.version ?? '';
    });

    await steps.step('The current version cannot be reverted to itself', async () => {
      const availability = await payerManagementPage.detail().versionHistory().getEntryActionAvailability(current, REVERT_ACTION);
      expect(availability, `${current} is live; reverting to it is meaningless`).toBe('absent');
    });
  });

  test('TC-008: should not offer Revert on a draft version', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    let draftLabel = '';

    await steps.critical('Navigate to the module and stage a draft on the payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.editTextFieldAndSave(publishedPayer.nameEn, LICENCE, REVERT_EDIT.second);
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const history = detail.versionHistory();
      await history.open();
      const draft = (await history.getEntries()).find((entry) => /draft/i.test(entry.status));
      expect(draft, 'the staged draft should be listed').not.toBe(undefined);
      draftLabel = draft?.version ?? '';
    });

    await steps.step('The draft row offers no Revert', async () => {
      const actions = await payerManagementPage.detail().versionHistory().getEntryActions(draftLabel);
      expect(actions, `a draft must not be a revert target; ${draftLabel} offers: ${actions.join(', ')}`).not.toContain(REVERT_ACTION);
    });
  });

  test('TC-009: should refuse a revert that names a version which does not exist', async ({
    page,
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();
    let body = '';
    let versionsBefore = 0;

    await steps.critical('Navigate to the module, publish a second version and learn the revert payload', async () => {
      // The payload is learned from a real revert rather than guessed; that
      // revert is then sent and approved so the payer is settled again.
      await publishEdit(payerManagementPage, approvalManagementPage, publishedPayer.nameEn, REVERT_EDIT.second);
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const history = detail.versionHistory();
      await history.open();
      body = (await NetworkUtils.captureRequestBody(page, ApiEndpoints.payerRevert, () => history.revertTo(VERSION_LABEL.firstPublished))) ?? '';
      expect(body, 'the revert should send a request body').not.toBe('');
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.approve(publishedPayer.nameEn);
    });

    await steps.step('The settled history is counted', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.versionHistory().open();
      versionsBefore = await detail.versionHistory().getEntryCount();
      expect(versionsBefore, 'the history should hold the create, the edit and the revert').toBeGreaterThanOrEqual(3);
    });

    await steps.step('A revert naming an unknown version is refused and history is unchanged', async () => {
      const response = await NetworkUtils.postAsSession(page, ApiEndpoints.payerRevert, withUnknownVersionId(JSON.parse(body)));
      expect(
        (UNKNOWN_VERSION_REFUSAL as readonly number[]).includes(response.status),
        `an unknown version id should be refused; the server answered ${response.status}: ${response.text.slice(0, 200)}`,
      ).toBe(true);
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.versionHistory().open();
      expect(await detail.versionHistory().getEntryCount(), 'no version should have been created').toBe(versionsBefore);
    });
  });

  test('TC-011: should leave version history unaffected when an approver rejects a revert', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module, publish a second version and send a revert for approval', async () => {
      await publishEdit(payerManagementPage, approvalManagementPage, publishedPayer.nameEn, REVERT_EDIT.second);
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const history = detail.versionHistory();
      await history.open();
      await history.revertTo(VERSION_LABEL.firstPublished);
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
    });

    await steps.step('The approver rejects it', async () => {
      await approvalManagementPage.reject(publishedPayer.nameEn);
    });

    await steps.step('The live configuration is untouched and Revert is available again', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      expect(await detail.getFieldValue(LICENCE), 'v2 should still be live').toBe(REVERT_EDIT.second);
      const history = detail.versionHistory();
      await history.open();
      expect(await history.getEntryActionAvailability(VERSION_LABEL.firstPublished, REVERT_ACTION)).toBe('available');
    });
  });

  test('TC-013: should record the approved revert in the audit trail with user, time and source version', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module and carry a revert through approval', async () => {
      await publishEdit(payerManagementPage, approvalManagementPage, publishedPayer.nameEn, REVERT_EDIT.second);
      await revertAndApprove(payerManagementPage, approvalManagementPage, publishedPayer.nameEn, VERSION_LABEL.firstPublished);
    });

    await steps.step('The audit trail records the revert and its approval', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.openAuditHistory();
      await detail.expectAuditEntryMatching(/revert|update/i, 'the revert request or its approval');
      const entries = await detail.getAuditEntryTexts();
      expect(
        entries.length,
        `the trail should hold the creation, the edit, the revert and its approval as distinct entries; it holds: ${entries.join(' | ')}`,
      ).toBeGreaterThanOrEqual(3);
    });
  });

  test('TC-010: should let only the System Administrator initiate a revert', async ({
    nonAdminSession,
    steps,
  }) => {
    test.slow();
    let superseded: string[] = [];

    await steps.critical('Navigate to the module and open an assigned payer\'s version history as the non-administrator', async () => {
      await nonAdminSession.payers.open();
      const detail = await nonAdminSession.payers.openDetails(NON_ADMIN_PROFILE.scopedPayers[0]);
      await detail.waitForLoaded();
      const history = detail.versionHistory();
      await history.open();
      superseded = (await history.getEntries())
        .filter((entry) => SUPERSEDED.test(entry.status))
        .map((entry) => entry.version)
        .slice(0, ROLE_CASE_SAMPLE);
      expect(superseded.length, 'the payer should carry superseded versions a revert could target').toBeGreaterThan(0);
    });

    await steps.step('No superseded version offers Revert to this role', async () => {
      const history = nonAdminSession.payers.detail().versionHistory();
      for (const version of superseded) {
        const actions = await history.getEntryActions(version);
        expect(actions, `"${version}" should not offer Revert to the ${NON_ADMIN_PROFILE.role}; it offers: ${actions.join(', ')}`).not.toContain(REVERT_ACTION);
      }
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.id}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
