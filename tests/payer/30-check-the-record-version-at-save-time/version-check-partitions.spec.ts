import { test, expect } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import type { PayerFormDialog } from '../../../pages/payer/PayerFormDialog';
import {
  CONFLICT_MESSAGE_PATTERNS,
  CONFLICT_RESPONSE,
  EXPECTED_VERSION_INCREMENT,
  RESTRICTED_ROLE_REQUIREMENT,
  VERSION_CHECK_FIELDS,
} from '../../../data/payers/versionCheckOnSave.data';

/**
 * User story: Check the Record Version at Save Time.
 * The partitions, the payload, and access control.
 *
 * TC-010 is the one that looks at the mechanism directly: it reads the save
 * REQUEST and asserts it carries the version the form loaded. Everything else
 * in this story infers the check from its outcome; this case shows the check has
 * something to work with.
 */
test.describe('Version check at save time - Partitions', () => {
  test('TC-003: should reject the later save when two sessions save one after the other', async ({
    payerManagementPage,
    staleSession,
    uniquePayer,
    steps,
  }) => {
    let firstForm!: PayerFormDialog;
    let secondForm!: PayerFormDialog;
    let sharedVersion!: string;

    await steps.critical('Navigate to the module and create the payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(uniquePayer);
      await payerManagementPage.open();
      await payerManagementPage.search(uniquePayer.nameEn);
      sharedVersion = await payerManagementPage.getVersionLabel(uniquePayer.nameEn);
    });

    await steps.critical('Both sessions open the payer at the same version', async () => {
      firstForm = await payerManagementPage.openEditForm(uniquePayer.nameEn);
      secondForm = await staleSession.openEditForm(uniquePayer.nameEn);
      await secondForm.setFieldValue(
        VERSION_CHECK_FIELDS.second.label,
        VERSION_CHECK_FIELDS.second.value,
        'text',
      );
      expect(
        await secondForm.getFieldValue(VERSION_CHECK_FIELDS.second.label),
        'the second session should be holding its own edit of the same version',
      ).toBe(VERSION_CHECK_FIELDS.second.value);
      expect(sharedVersion, 'both sessions loaded from the same version').not.toBe('');
    });

    await steps.step("The second session's save completes first", async () => {
      const outcome = await secondForm.saveAndCaptureOutcome();
      expect(outcome!.status, 'the first save through should be accepted').toBe(200);
    });

    await steps.step('The first session saves immediately afterwards and is checked', async () => {
      // No read in between, deliberately: the sheet's "at the same instant as
      // the version bump". The first session never learns the record moved, so
      // the check can only happen at save time.
      await firstForm.setFieldValue(
        VERSION_CHECK_FIELDS.first.label,
        VERSION_CHECK_FIELDS.first.value,
        'text',
      );
      const outcome = await firstForm.saveAndCaptureOutcome();
      firstForm.expectStaleSaveRejected(outcome, {
        status: CONFLICT_RESPONSE.status,
        reason: CONFLICT_RESPONSE.reason,
      });
    });
  });

  test('TC-004: should accept the unchanged case and refuse the modified one', async ({
    payerManagementPage,
    staleSession,
    uniquePayer,
    secondPublishedPayer,
    steps,
  }) => {
    let staleForm!: PayerFormDialog;

    await steps.critical('Navigate to the module with two payers to work on', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(uniquePayer);
      await payerManagementPage.open();
      await payerManagementPage.search(secondPublishedPayer.nameEn);
      await payerManagementPage.waitForRowVisible(secondPublishedPayer.nameEn);
    });

    await steps.step('A payer unchanged since it loaded saves successfully', async () => {
      const form = await payerManagementPage.openEditForm(secondPublishedPayer.nameEn);
      await form.setFieldValue(
        VERSION_CHECK_FIELDS.first.label,
        VERSION_CHECK_FIELDS.first.value,
        'text',
      );
      const outcome = await form.saveAndCaptureOutcome();
      expect(outcome!.status, 'nothing changed underneath it, so it should save').toBe(200);
      await form.waitForClosed();
    });

    await steps.step('A payer modified by another session is refused', async () => {
      await payerManagementPage.open();
      staleForm = await payerManagementPage.openEditForm(uniquePayer.nameEn);

      const otherForm = await staleSession.openEditForm(uniquePayer.nameEn);
      await otherForm.setFieldValue(
        VERSION_CHECK_FIELDS.second.label,
        VERSION_CHECK_FIELDS.second.value,
        'text',
      );
      expect((await otherForm.saveAndCaptureOutcome())!.status).toBe(200);
      await otherForm.waitForClosed();

      await staleForm.setFieldValue(
        VERSION_CHECK_FIELDS.first.label,
        VERSION_CHECK_FIELDS.first.value,
        'text',
      );
      const outcome = await staleForm.saveAndCaptureOutcome();
      staleForm.expectStaleSaveRejected(outcome, {
        status: CONFLICT_RESPONSE.status,
        reason: CONFLICT_RESPONSE.reason,
      });
    });

    await steps.step('And each refusal is reported to the user', async () => {
      // FAILS, for the reason the whole story reports: the 409 carries the
      // explanation and the interface passes none of it on.
      const messages = await staleForm.waitForVisibleMessages();
      expect(
        messages,
        `the blocked save should be explained; the form showed: `
          + `${messages.join(' | ') || '(nothing)'}`,
      ).not.toEqual([]);
    });
  });

  test('TC-006: should meet the conflict checklist - message, retained input, untouched record', async ({
    payerManagementPage,
    staleSession,
    uniquePayer,
    steps,
  }) => {
    let staleForm!: PayerFormDialog;
    let versionAfterOther!: string;

    await steps.critical('Navigate to the module and create the payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(uniquePayer);
      await payerManagementPage.open();
      await payerManagementPage.search(uniquePayer.nameEn);
    });

    await steps.critical('A stale copy is held while another session saves', async () => {
      staleForm = await payerManagementPage.openEditForm(uniquePayer.nameEn);
      const otherForm = await staleSession.openEditForm(uniquePayer.nameEn);
      await otherForm.setFieldValue(
        VERSION_CHECK_FIELDS.second.label,
        VERSION_CHECK_FIELDS.second.value,
        'text',
      );
      expect((await otherForm.saveAndCaptureOutcome())!.status).toBe(200);
      await otherForm.waitForClosed();
      await staleSession.payerPage.open();
      await staleSession.payerPage.search(uniquePayer.nameEn);
      versionAfterOther = await staleSession.payerPage.getVersionLabel(uniquePayer.nameEn);
    });

    await steps.step('The stale save is blocked', async () => {
      await staleForm.setFieldValue(
        VERSION_CHECK_FIELDS.first.label,
        VERSION_CHECK_FIELDS.first.value,
        'text',
      );
      const outcome = await staleForm.saveAndCaptureOutcome();
      staleForm.expectStaleSaveRejected(outcome, {
        status: CONFLICT_RESPONSE.status,
        reason: CONFLICT_RESPONSE.reason,
      });
    });

    await steps.step('The message states the record changed and asks for a refresh', async () => {
      // FAILS - the first of the checklist's three items. The other two pass,
      // which is why they are asserted separately below.
      const messages = await staleForm.waitForVisibleMessages();
      expect(messages.join(' '), 'the checklist wants this said on screen').toMatch(
        CONFLICT_MESSAGE_PATTERNS.en,
      );
    });

    await steps.step("The form still shows the user's edit", async () => {
      // THREE possible answers, not two, and the third is what happens: the
      // drawer stays open but its wizard stops responding, so the edited field
      // never becomes readable again. The sheet asks whether the typing is
      // retained; the honest report is that it is neither retained nor
      // discarded - it is stranded in a drawer the user can no longer work in.
      const kept = await staleForm.readFieldIfReachable(VERSION_CHECK_FIELDS.first.label);
      expect(
        kept.reachable,
        `after the refusal the edited field could not be read back: ${kept.reason}. The drawer `
          + `is still open, so the user is looking at a form that will not save and will not `
          + `show them what they typed`,
      ).toBe(true);
      expect(
        kept.value,
        "a blocked save must not discard the user's typing",
      ).toBe(VERSION_CHECK_FIELDS.first.value);
    });

    await steps.step('And the underlying record is unaffected', async () => {
      await staleForm.closeAndDiscard();
      await payerManagementPage.open();
      await payerManagementPage.search(uniquePayer.nameEn);
      expect(
        await payerManagementPage.getVersionLabel(uniquePayer.nameEn),
        'the refused save should have left the record where the other session put it',
      ).toBe(versionAfterOther);
    });
  });

  test('TC-010: should send the version it loaded with the save', async ({
    page,
    payerManagementPage,
    uniquePayer,
    steps,
  }) => {
    let form!: PayerFormDialog;
    let body!: string | null;

    await steps.critical('Navigate to the module and create the payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(uniquePayer);
      await payerManagementPage.open();
      await payerManagementPage.search(uniquePayer.nameEn);
    });

    await steps.critical('The payer opens for editing', async () => {
      form = await payerManagementPage.openEditForm(uniquePayer.nameEn);
      await form.expectFieldValue('Payer Name', uniquePayer.nameEn);
    });

    await steps.step('The save request is captured as it goes out', async () => {
      await form.setFieldValue(
        VERSION_CHECK_FIELDS.first.label,
        VERSION_CHECK_FIELDS.first.value,
        'text',
      );
      body = await NetworkUtils.captureRequestBody(page, ApiEndpoints.payerUpdate, () =>
        form.saveFromAnyStep(),
      );
      expect(body, 'the save should have reached the server').not.toBeNull();
    });

    await steps.step('It carries a version or record identifier for the server to check', async () => {
      // The mechanism, read from the wire. A payload with no version or id
      // could not be version-checked at all, whatever the server does with it -
      // so this is the evidence behind every other case in the story.
      const sent = JSON.parse(body!) as Record<string, unknown>;
      const keys = Object.keys(sent);
      const identifying = keys.filter((key) => /version|rowversion|timestamp|^id$/i.test(key));
      expect(
        identifying,
        `the payload should identify the version it is updating; it carried: ${keys.join(', ')}`,
      ).not.toEqual([]);
    });

    await steps.step('And the save is accepted, the version having matched', async () => {
      await form.waitForClosed();
      await payerManagementPage.open();
      await payerManagementPage.search(uniquePayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(uniquePayer.nameEn, 'Draft');
    });
  });

  test('TC-011: should increment the version when nothing intervened', async ({
    payerManagementPage,
    approvalManagementPage,
    uniquePayer,
    steps,
  }) => {
    // Two round trips more than the case originally had: it now follows the
    // change through approval, which is where the version actually advances.
    test.slow();

    let form!: PayerFormDialog;
    let versionBefore!: number;

    await steps.critical('Navigate to the module and create the payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(uniquePayer);
      await payerManagementPage.open();
      await payerManagementPage.search(uniquePayer.nameEn);
      versionBefore = await payerManagementPage.getVersionNumber(uniquePayer.nameEn);
    });

    await steps.critical('The payer opens for editing with no other change existing', async () => {
      form = await payerManagementPage.openEditForm(uniquePayer.nameEn);
      await form.expectFieldValue('Payer Name', uniquePayer.nameEn);
    });

    await steps.step('An immediate edit and save is accepted at the zero-conflict boundary', async () => {
      await form.setFieldValue(
        VERSION_CHECK_FIELDS.first.label,
        VERSION_CHECK_FIELDS.first.value,
        'text',
      );
      const outcome = await form.saveAndCaptureOutcome();
      expect(outcome!.status, 'with nothing intervening the save should succeed').toBe(200);
      await form.waitForClosed();
    });

    await steps.step('The accepted save does not publish a new version', async () => {
      // VERIFIED, and the opposite of what this step first demanded. A draft
      // stays at "v0 - Draft" through an accepted save: the draft version is
      // updated in place, so no new version appears and none should. Demanding
      // an increment here failed a correct save.
      await payerManagementPage.open();
      await payerManagementPage.search(uniquePayer.nameEn);
      expect(
        await payerManagementPage.getVersionNumber(uniquePayer.nameEn),
        'a save stages the draft; it does not create a version',
      ).toBe(versionBefore);
    });

    await steps.step('The version advances by exactly one once the change is approved', async () => {
      // Where the sheet's increment actually happens. This is the assertion
      // worth having: one submitted-and-approved change, one new version - and
      // it is the boundary a double-approval or a lost update would break.
      await payerManagementPage.sendForApproval(uniquePayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(uniquePayer.nameEn);
      await approvalManagementPage.approve(uniquePayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(uniquePayer.nameEn);
      expect(
        await payerManagementPage.getVersionNumber(uniquePayer.nameEn),
        'one approved change, one new version',
      ).toBe(versionBefore + EXPECTED_VERSION_INCREMENT);
    });
  });
});

/** Access control, signed out of the shared administrator session. */
test.describe('Version check at save time - Access control', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('TC-009: should refuse the save for a read-only user', async ({
    loginPage,
    payerManagementPage,
    steps,
  }) => {
    if (!env.nonAdminUsername || !env.nonAdminPassword) {
      steps.blocked(
        `NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD are not configured in .env. ${
          RESTRICTED_ROLE_REQUIREMENT.reason
        } Set them to an account holding ${RESTRICTED_ROLE_REQUIREMENT.role}, then re-run this `
          + 'case.',
      );
    }

    let payerName!: string;

    await steps.critical('Open the payer list as the read-only user', async () => {
      await loginPage.open();
      await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);
      await payerManagementPage.navigate();
      await payerManagementPage.expectRowsRendered();
      payerName = (await payerManagementPage.getVisiblePayerNames())[0];
      expect(payerName, 'the read-only user should see at least one payer').not.toBe(undefined);
    });

    await steps.step('The record cannot be opened for editing', async () => {
      const refusal = await payerManagementPage.expectRowActionUnavailable(payerName, 'edit');
      expect(refusal, 'edit should be absent or disabled for this role').not.toBe('available');
    });

    await steps.step('And the payer is unchanged by the attempt', async () => {
      await payerManagementPage.waitForRowVisible(payerName);
      expect(
        await payerManagementPage.isRowVisibleAfterSearch(payerName),
        'a refused edit must leave the record listed as it was',
      ).toBe(true);
    });
  });
});
