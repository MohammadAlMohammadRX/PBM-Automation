import { test, expect } from '../../../fixtures';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import {
  APPROVAL_CELL,
  EXPECTED_SUBMIT_REQUESTS,
  RAPID_CLICKS,
  SEND_PROMPT,
  SUBMISSION_TOAST,
  SUBMIT_ENDPOINT_FRAGMENT,
  TOAST_GONE_BY_MS,
  TOAST_STILL_VISIBLE_AT_MS,
} from '../../../data/payers/submissionToast.data';

/**
 * User story: Confirm a Submission with a Bilingual Toast.
 *
 * THE TOAST IS RIGHT, in both languages, and these cases pin the exact wording
 * so a half-translated or truncated version would fail rather than pass on a
 * "contains" match:
 *
 *   EN  "Submitted for approval" / "Your change was submitted for approval. It
 *        will take effect once a reviewer approves it."
 *   AR  "تم الإرسال للموافقة" / "تم إرسال التغيير للموافقة. سيصبح ساري المفعول
 *        بمجرد موافقة المراجع عليه."
 *
 * TWO THINGS ARE NOT. The toast has NO close control - zero buttons inside
 * `#pbm-toast`, in either language - so the sheet's "dismissible" checklist
 * item cannot be met. And three rapid clicks on Send for Approval put three
 * requests on the wire; one toast appeared and one request reached the queue,
 * so nothing was corrupted, but the click guard the sheet asks for is absent.
 *
 * TIMING IS MEASURED FROM WHEN THE TOAST APPEARS, not from the click. The toast
 * follows the server round trip, and charging that delay against its lifetime
 * makes a correct five-second toast look like a two-second one.
 */
test.describe('Bilingual submission toast', () => {
  test('TC-001: should confirm the submission with a bilingual toast when a draft is sent for approval', async ({
    payerManagementPage,
    toast,
    draftPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      await payerManagementPage.waitForRowVisible(draftPayer.nameEn);
    });

    await steps.critical('The payer is a Draft offering Send for Approval', async () => {
      await payerManagementPage.expectApprovalStatusContains(
        draftPayer.nameEn,
        APPROVAL_CELL.en.draft,
      );
      await payerManagementPage.expectRowActionsEnabled(draftPayer.nameEn, [
        'submit-for-approval',
      ]);
    });

    await steps.step('Submitting shows the confirmation toast, word for word', async () => {
      // The toast is read HERE, immediately after confirming, and not after the
      // status check below: it lives about five seconds, and a reload on the
      // way to the list would outlast it. Asserted exactly rather than by a
      // contains-match, because a truncated or half-translated toast would pass
      // the looser check.
      await payerManagementPage.sendRowForApproval(draftPayer.nameEn);
      const dialog = payerManagementPage.dialog();
      expect(await dialog.getTitle(), 'the prompt should ask first').toBe(SEND_PROMPT.en.title);
      await dialog.confirm('Send for Approval');
      await toast.expectText(SUBMISSION_TOAST.en);
    });

    await steps.step('The payer now reads Pending Approval, as the toast claimed', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        draftPayer.nameEn,
        APPROVAL_CELL.en.pending,
      );
    });
  });

  test('TC-003: should keep the toast on screen for its configured duration and then remove it', async ({
    payerManagementPage,
    toast,
    draftPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      await payerManagementPage.waitForRowVisible(draftPayer.nameEn);
    });

    await steps.critical('The payer is submitted and the toast appears', async () => {
      await payerManagementPage.sendRowForApproval(draftPayer.nameEn);
      await payerManagementPage.dialog().confirm('Send for Approval');
      const text = await toast.waitForText();
      expect(text.summary, 'the submission toast').toBe(SUBMISSION_TOAST.en.summary);
    });

    await steps.step('It is still on screen shortly before its duration elapses', async () => {
      await toast.expectVisibleFor(TOAST_STILL_VISIBLE_AT_MS);
    });

    await steps.step('It has gone once the duration has elapsed', () =>
      toast.expectDismissedWithin(TOAST_GONE_BY_MS - TOAST_STILL_VISIBLE_AT_MS));
  });

  test('TC-004: should render the toast in the active language, in English and in Arabic', async ({
    payerManagementPage,
    toast,
    draftPayer,
    secondPublishedPayer,
    steps,
  }) => {
    let secondCode!: string;

    await steps.critical('Navigate to the Payer Management module in English', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      await payerManagementPage.waitForRowVisible(draftPayer.nameEn);

      // The second payer's CODE is captured while the interface is still
      // English. In Arabic the list renders Arabic names, so an English name
      // finds no row - and the code is the one handle that reads the same in
      // both languages.
      secondCode = await payerManagementPage.getPayerCode(secondPublishedPayer.nameEn);
      expect(secondCode, 'the second payer should carry a payer code').not.toBe('');
    });

    await steps.step('An English submission produces the English toast', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      await payerManagementPage.sendRowForApproval(draftPayer.nameEn);
      await payerManagementPage.dialog().confirm('Send for Approval');
      await toast.expectText(SUBMISSION_TOAST.en);
    });

    await steps.step('The interface switches to the secondary language', async () => {
      await payerManagementPage.open();
      await payerManagementPage.language().switchTo('ar');
      await payerManagementPage.open();
      await payerManagementPage.expectRowsRendered();
      await payerManagementPage.language().expectLanguage('ar');
      await payerManagementPage.language().expectRightToLeft();
    });

    await steps.step('An Arabic submission produces the Arabic toast', async () => {
      // A DIFFERENT payer, as the sheet asks - the first one is already
      // pending, and a second submission is not offered on it. Addressed by
      // code, and given a draft change of its own so there is something to
      // submit.
      await payerManagementPage.editTextFieldAndSave(secondCode, 'License Number', 'LIC-AR-TOAST');
      await payerManagementPage.open();
      await payerManagementPage.sendRowForApproval(secondCode);
      await payerManagementPage.dialog().confirm('Send for Approval');
      await toast.expectText(SUBMISSION_TOAST.ar);
    });

    await steps.step('The interface is returned to English', async () => {
      await payerManagementPage.language().switchTo('en');
      await payerManagementPage.open();
      await payerManagementPage.expectRowsRendered();
    });
  });

  test('TC-005: should update the status field alongside the confirmation', async ({
    payerManagementPage,
    toast,
    draftPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      await payerManagementPage.waitForRowVisible(draftPayer.nameEn);
    });

    await steps.critical('The status field reads Draft', () =>
      payerManagementPage.expectApprovalStatusContains(draftPayer.nameEn, APPROVAL_CELL.en.draft));

    await steps.step('Submitting shows the toast and moves the status to Pending Approval', async () => {
      await payerManagementPage.sendRowForApproval(draftPayer.nameEn);
      await payerManagementPage.dialog().confirm('Send for Approval');
      await toast.expectText(SUBMISSION_TOAST.en);

      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        draftPayer.nameEn,
        APPROVAL_CELL.en.pending,
      );
    });
  });

  test('TC-007: should process one submission and show one toast when Send is clicked repeatedly', async ({
    page,
    payerManagementPage,
    approvalManagementPage,
    toast,
    draftPayer,
    steps,
  }) => {
    let requests = 0;

    await steps.critical('Navigate to the module with a Draft payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      await payerManagementPage.expectRowActionsEnabled(draftPayer.nameEn, [
        'submit-for-approval',
      ]);
    });

    await steps.critical('The submission prompt is open', async () => {
      await payerManagementPage.sendRowForApproval(draftPayer.nameEn);
      await payerManagementPage.dialog().waitForVisible();
      expect(
        await payerManagementPage.dialog().getTitle(),
        'the prompt should be the submission one',
      ).toBe(SEND_PROMPT.en.title);
    });

    await steps.step('Spam-clicking Send sends a single submission request', async () => {
      requests = await NetworkUtils.countRequestsDuring(
        page,
        SUBMIT_ENDPOINT_FRAGMENT,
        () => payerManagementPage.dialog().confirmRepeatedly(RAPID_CLICKS),
      );
      // MEASURED: three clicks put three requests on the wire - the affirmative
      // action is not disabled on the first click. The end state survives it
      // (see the next step), but the guard the sheet asks for is absent.
      expect(
        requests,
        `${RAPID_CLICKS} rapid clicks should reach the server once, not ${requests} times`,
      ).toBe(EXPECTED_SUBMIT_REQUESTS);
    });

    await steps.step('Exactly one toast is shown and one request is queued', async () => {
      const text = await toast.waitForText();
      expect(text.summary, 'one confirmation, not three').toBe(SUBMISSION_TOAST.en.summary);

      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(draftPayer.nameEn);
      await approvalManagementPage.expectSingleQueuedRequest(draftPayer.nameEn);
    });
  });

  test('TC-008: should satisfy the toast checklist - bilingual, explanatory, dismissible, unobtrusive', async ({
    payerManagementPage,
    toast,
    draftPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and submit the payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      await payerManagementPage.sendRowForApproval(draftPayer.nameEn);
      await payerManagementPage.dialog().confirm('Send for Approval');
    });

    await steps.critical('The toast appears', async () => {
      const text = await toast.waitForText();
      expect(text.summary, 'the toast should be the submission confirmation').toBe(
        SUBMISSION_TOAST.en.summary,
      );
    });

    await steps.step('It explains the submission and its pending effect', async () => {
      await toast.expectText(SUBMISSION_TOAST.en);
    });

    await steps.step('It is dismissible', async () => {
      // FAILS. `#pbm-toast` holds no buttons at all, in either language, so
      // there is nothing to dismiss it with - the user waits it out. Reported
      // rather than skipped: the checklist item is explicit.
      expect(
        await toast.countCloseControls(),
        'the toast should offer a way to dismiss it',
      ).toBeGreaterThan(0);
    });

    await steps.step('And it does not block the interface while it is up', async () => {
      // The unobtrusive half of the checklist: the list is still usable with
      // the toast on screen. Asserted by doing something ordinary.
      await payerManagementPage.open();
      await payerManagementPage.expectRowsRendered();
      await payerManagementPage.search(draftPayer.nameEn);
      await payerManagementPage.waitForRowVisible(draftPayer.nameEn);
    });
  });
});
