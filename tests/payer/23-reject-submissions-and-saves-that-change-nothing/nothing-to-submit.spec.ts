import { test, expect } from '../../../fixtures';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { SUBMISSION_TOAST } from '../../../data/payers/submissionToast.data';
import {
  APPROVAL_STATE,
  EDITED_FIELD,
  EXPECTED_MESSAGES,
  ROW_ACTIONS,
} from '../../../data/payers/nothingToSubmit.data';

/**
 * User story: Reject Submissions and Saves That Change Nothing.
 *
 * THE RULE HOLDS; THE MESSAGES DO NOT. Verified before these were written, on a
 * published payer with nothing staged:
 *
 *   Send for Approval is not among its row actions - the row offers View, Edit
 *   and Delete - so an empty submission cannot be attempted.
 *
 *   Save is not rendered in the edit wizard until a field changes. Pressing it
 *   on the final step of an untouched form found no button, sent no request,
 *   raised no toast and showed no error.
 *
 * Both refusals are therefore silent, and both are correct. Each case asserts
 * the guard and then looks for the message the sheet requires, in that order,
 * so the report distinguishes "the application protects the record" from "the
 * application explains itself".
 */
test.describe('Nothing to submit - Submissions', () => {
  test('TC-001: should submit the payer when it holds a draft change', async ({
    payerManagementPage,
    approvalManagementPage,
    toast,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and stage a draft change', async () => {
      await payerManagementPage.open();
      await payerManagementPage.editTextFieldAndSave(
        publishedPayer.nameEn,
        EDITED_FIELD.label,
        EDITED_FIELD.value,
      );
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        APPROVAL_STATE.en.draft,
      );
    });

    await steps.critical('The row now offers Send for Approval', async () => {
      await payerManagementPage.expectRowActionsEnabled(publishedPayer.nameEn, [
        'submit-for-approval',
      ]);
    });

    await steps.step('The submission is accepted and confirmed', async () => {
      await payerManagementPage.sendRowForApproval(publishedPayer.nameEn);
      await payerManagementPage.dialog().confirm('Send for Approval');
      await toast.expectText(SUBMISSION_TOAST.en);
    });

    await steps.step('The payer is Pending Approval with a queued request', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        APPROVAL_STATE.en.pending,
      );
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
    });
  });

  test('TC-002: should refuse the submission when the payer holds no draft changes', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module with a payer holding no draft changes', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        APPROVAL_STATE.en.published,
      );
    });

    await steps.critical('Its row offers exactly the actions a settled payer should', async () => {
      const enabled = await payerManagementPage.getEnabledRowActions(publishedPayer.nameEn, [
        'view',
        'edit',
        'delete',
        'submit-for-approval',
      ]);
      expect(
        enabled,
        'a payer with nothing staged should not offer a submission',
      ).toEqual([...ROW_ACTIONS.withoutDraftChange]);
    });

    await steps.step('The submission cannot be started', () =>
      payerManagementPage
        .expectRowActionUnavailable(publishedPayer.nameEn, 'submit-for-approval')
        .then((refusal) => {
          expect(refusal, 'the action is withheld rather than offered and refused').toBe('absent');
        }));

    await steps.step('The user is told there are no draft changes to send', async () => {
      // FAILS. The action is simply absent: no message, and no title on the
      // control either - checked, because that is where this application puts
      // its other withheld-action explanations.
      const message = await payerManagementPage.getRowActionMessage(
        publishedPayer.nameEn,
        'submit-for-approval',
      );
      expect(
        message,
        `the refusal should say "${EXPECTED_MESSAGES.noDraftChanges}"`,
      ).not.toBe('');
    });

    await steps.step('No approval request is created', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.expectNotInQueue(publishedPayer.nameEn);
    });
  });

  test('TC-006: should refuse a further submission while one is already pending', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module with a payer awaiting approval', async () => {
      await payerManagementPage.open();
      await payerManagementPage.editTextFieldAndSave(
        publishedPayer.nameEn,
        EDITED_FIELD.label,
        EDITED_FIELD.value,
      );
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        APPROVAL_STATE.en.pending,
      );
    });

    await steps.critical('The payer shows Pending Approval', () =>
      payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        APPROVAL_STATE.en.pending,
      ));

    await steps.step('A further submission cannot be started', async () => {
      await payerManagementPage.expectRowActionUnavailable(
        publishedPayer.nameEn,
        'submit-for-approval',
      );
    });

    await steps.step('And no duplicate request is created', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
      await approvalManagementPage.expectSingleQueuedRequest(publishedPayer.nameEn);
    });
  });

  test('TC-009: should run one validation when the submission is triggered repeatedly', async ({
    page,
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    let requests = 0;

    await steps.critical('Navigate to the module with a payer holding no draft changes', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        APPROVAL_STATE.en.published,
      );
    });

    await steps.step('There is no submission control to click repeatedly', async () => {
      // The sheet double-clicks Send for Approval on a payer with nothing to
      // send. The action does not exist on such a row, so the double-click
      // cannot be performed - and the duplicate messages it warns about cannot
      // occur either.
      await payerManagementPage.expectRowActionUnavailable(
        publishedPayer.nameEn,
        'submit-for-approval',
      );
    });

    await steps.step('Nothing is sent to the server by trying', async () => {
      requests = await NetworkUtils.countRequestsDuring(
        page,
        ApiEndpoints.payerSubmit,
        async () => {
          await payerManagementPage.open();
          await payerManagementPage.search(publishedPayer.nameEn);
        },
      );
      expect(requests, 'a payer with nothing staged should submit nothing').toBe(0);
    });

    await steps.step('And the payer is untouched, with no request queued', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        APPROVAL_STATE.en.published,
      );
      await approvalManagementPage.open();
      await approvalManagementPage.expectNotInQueue(publishedPayer.nameEn);
    });
  });

  test('TC-011: should leave the approval queue empty for a payer with no draft changes', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module with a payer holding no draft changes', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        APPROVAL_STATE.en.published,
      );
    });

    await steps.step('The submission is refused', async () => {
      await payerManagementPage.expectRowActionUnavailable(
        publishedPayer.nameEn,
        'submit-for-approval',
      );
    });

    await steps.step('The approvals queue holds no request for it', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.expectNotInQueue(publishedPayer.nameEn);
      expect(
        await approvalManagementPage.countQueuedRequests(publishedPayer.nameEn),
        'nothing was submitted, so nothing should be queued',
      ).toBe(0);
    });

    await steps.step('And its own status is unchanged', () =>
      payerManagementPage
        .open()
        .then(() => payerManagementPage.search(publishedPayer.nameEn))
        .then(() => payerManagementPage.expectApprovalStatusContains(
          publishedPayer.nameEn,
          APPROVAL_STATE.en.published,
        )));
  });
});

/**
 * The bilingual half, in its own describe because it leaves the interface in
 * Arabic for the duration and restores it at the end.
 */
test.describe('Nothing to submit - Both languages', () => {
  test('TC-008: should state both refusals in the active language, English and Arabic', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    let code!: string;

    await steps.critical('Navigate to the module with a settled payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      code = await payerManagementPage.getPayerCode(publishedPayer.nameEn);
      expect(code, 'the payer code is the handle that works in both languages').not.toBe('');
    });

    await steps.step('In English, neither refusal is explained', async () => {
      // Both halves of the sheet's table at once: the submission refusal and
      // the save refusal. Each is enforced by withholding a control, and
      // neither says anything - so this fails, in English, naming what it
      // looked for.
      const rowMessage = await payerManagementPage.getRowActionMessage(
        publishedPayer.nameEn,
        'submit-for-approval',
      );
      const form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
      const formMessages = await form.waitForVisibleMessages();
      await form.closeAndDiscard();

      expect(
        [rowMessage, ...formMessages].filter((text) => text.length > 0),
        `expected "${EXPECTED_MESSAGES.noDraftChanges}" and `
          + `"${EXPECTED_MESSAGES.nothingToSubmit}" somewhere on screen`,
      ).not.toEqual([]);
    });

    await steps.step('The interface switches to the secondary language', async () => {
      await payerManagementPage.open();
      await payerManagementPage.language().switchTo('ar');
      await payerManagementPage.open();
      await payerManagementPage.language().expectLanguage('ar');
      await payerManagementPage.search(code);
      await payerManagementPage.waitForRowVisible(code);
    });

    await steps.step('In Arabic, the guards hold and are equally silent', async () => {
      // The guard first - it must not weaken with the language - and then the
      // message, which is absent in Arabic for the same reason it is absent in
      // English: there is no message to translate.
      await payerManagementPage.expectRowActionUnavailable(code, 'submit-for-approval');
      const rowMessage = await payerManagementPage.getRowActionMessage(
        code,
        'submit-for-approval',
      );
      expect(
        rowMessage,
        'the Arabic interface should explain the refusal as the sheet requires',
      ).not.toBe('');
    });

    await steps.step('The interface is returned to English', async () => {
      await payerManagementPage.language().switchTo('en');
      await payerManagementPage.open();
      await payerManagementPage.expectRowsRendered();
    });
  });
});
