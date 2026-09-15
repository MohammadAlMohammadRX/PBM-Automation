import { test, expect } from '../../../fixtures';
import type { PayerFormDialog } from '../../../pages/payer/PayerFormDialog';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { APPROVAL_STATE } from '../../../data/payers/withdrawApproval.data';
import {
  BLOCKED_CASES,
  DRAFT_SAVED_TOAST,
  MAX_NAME_LENGTH,
  MAX_STACKED_TOASTS,
  SUBMITTED_TOAST,
  TOAST_GONE_BY_MS,
  UPDATE_EDIT,
  nameAtMaxLength,
} from '../../../data/payers/updateToast.data';

/**
 * User story: Display Toast Notification on Payer Update.
 *
 * The update path shows the same "Saved as draft" toast as creation (folder
 * 34 owns its wording). Here: the toast after an edit in both languages, never
 * the submission toast at save time, the payer staying Draft, edge inputs, a
 * failed save showing no success, rapid saves, dismissal, and the toast
 * arriving only after the server confirmed.
 *
 * VERIFIED: the toast lives about nine seconds and follows the server round
 * trip, so every case reads it the moment Save is clicked - through
 * `saveTextFieldEdit`, which leaves the list alone - and only then waits for
 * the drawer to close. Reloading the list first took the toast down with it.
 */
test.describe('Toast on payer update', () => {
  test.afterEach(async ({ languageSwitcher }) => {
    await languageSwitcher.switchTo('en');
  });

  test('TC-001: should show the bilingual draft-saved toast naming the payer when an edit is saved', async ({
    payerManagementPage,
    languageSwitcher,
    toast,
    publishedPayer,
    steps,
  }) => {
    test.slow();
    let english = { summary: '', detail: '' };

    await steps.critical('Navigate to the module and save an edit', async () => {
      await payerManagementPage.open();
      const form = await payerManagementPage.saveTextFieldEdit(publishedPayer.nameEn, UPDATE_EDIT.licence.label, UPDATE_EDIT.licence.first);
      english = await toast.waitForText();
      expect(english.summary).toBe(DRAFT_SAVED_TOAST.en.summary);
      expect(english.detail).toBe(DRAFT_SAVED_TOAST.en.detail);
      await form.waitForClosed();
    });

    await steps.step('In Arabic the toast is the Arabic wording', async () => {
      await languageSwitcher.switchTo('ar');
      await payerManagementPage.open();
      // The Arabic list renders the ARABIC name in the name column, so the row
      // is keyed by it - VERIFIED the English name matches nothing there.
      const form = await payerManagementPage.saveTextFieldEdit(publishedPayer.nameAr, UPDATE_EDIT.licence.label, UPDATE_EDIT.licence.second);
      await toast.expectText(DRAFT_SAVED_TOAST.ar);
      await form.waitForClosed();
      await languageSwitcher.switchTo('en');
    });

    await steps.step('The toast names the payer it saved', async () => {
      // The sheet's expectation. VERIFIED wording names no payer, so this
      // reports the gap rather than passing on the wording alone.
      expect(
        `${english.summary} ${english.detail}`.includes(publishedPayer.nameEn),
        `the toast should name the payer; it read "${english.summary} - ${english.detail}"`,
      ).toBe(true);
    });
  });

  test('TC-002: should not show the submitted-for-approval message when an edit is merely saved', async ({
    payerManagementPage,
    toast,
    publishedPayer,
    steps,
  }) => {
    let form: PayerFormDialog | null = null;

    await steps.critical('Navigate to the module and save an edit', async () => {
      await payerManagementPage.open();
      form = await payerManagementPage.saveTextFieldEdit(publishedPayer.nameEn, UPDATE_EDIT.licence.label, UPDATE_EDIT.licence.first);
    });

    await steps.step('The toast is the draft-saved one, not the submission one', async () => {
      const text = await toast.waitForText();
      expect(text.summary).toBe(DRAFT_SAVED_TOAST.en.summary);
      expect(text.summary, 'saving must not claim a submission').not.toBe(SUBMITTED_TOAST.en.summary);
      await (form as PayerFormDialog).waitForClosed();
    });
  });

  test('TC-003: should leave the payer in Draft rather than auto-submitting it when an edit is saved', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and save an edit', async () => {
      await payerManagementPage.open();
      await payerManagementPage.editTextFieldAndSave(publishedPayer.nameEn, UPDATE_EDIT.licence.label, UPDATE_EDIT.licence.first);
    });

    await steps.step('The payer reads Draft', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(publishedPayer.nameEn, APPROVAL_STATE.draft);
    });
  });

  test('TC-004: should show the submitted-for-approval toast only after Send for Approval is used', async ({
    payerManagementPage,
    toast,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and save an edit', async () => {
      await payerManagementPage.open();
      const form = await payerManagementPage.saveTextFieldEdit(publishedPayer.nameEn, UPDATE_EDIT.licence.label, UPDATE_EDIT.licence.first);
      await toast.expectText(DRAFT_SAVED_TOAST.en);
      await form.waitForClosed();
    });

    await steps.step('Sending for approval shows the submission toast', async () => {
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await toast.expectText(SUBMITTED_TOAST.en);
    });
  });

  test('TC-005: should show the toast correctly when the payer name is at its maximum length', async ({
    payerManagementPage,
    toast,
    publishedPayer,
    steps,
  }) => {
    let form: PayerFormDialog | null = null;

    await steps.critical('Navigate to the module and rename the payer to a maximum-length name', async () => {
      await payerManagementPage.open();
      form = await payerManagementPage.saveTextFieldEdit(
        publishedPayer.nameEn,
        UPDATE_EDIT.name.label,
        nameAtMaxLength(publishedPayer.nameEn, MAX_NAME_LENGTH),
      );
    });

    await steps.step('The draft-saved toast renders as usual', async () => {
      await toast.expectText(DRAFT_SAVED_TOAST.en);
      await (form as PayerFormDialog).waitForClosed();
    });
  });

  test('TC-006: should show the same toast when several fields are edited at once', async ({
    payerManagementPage,
    toast,
    publishedPayer,
    steps,
  }) => {
    let form: PayerFormDialog | null = null;

    await steps.critical('Navigate to the module and edit two fields in one save', async () => {
      await payerManagementPage.open();
      form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
      await form.setFieldValue(UPDATE_EDIT.licence.label, UPDATE_EDIT.licence.first, 'text');
      await form.setFieldValue(UPDATE_EDIT.email.label, UPDATE_EDIT.email.value, 'text');
      await form.saveFromAnyStep();
    });

    await steps.step('One draft-saved toast, the same as for a single field', async () => {
      await toast.expectText(DRAFT_SAVED_TOAST.en);
      await (form as PayerFormDialog).waitForClosed();
    });
  });

  test('TC-007: should show no success toast when the save fails on the wire', async ({
    page,
    payerManagementPage,
    toast,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and attempt a save with the update service failing', async () => {
      await NetworkUtils.failEndpoint(page, ApiEndpoints.payerUpdate);
      await payerManagementPage.open();
      const form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
      await form.setFieldValue(UPDATE_EDIT.licence.label, UPDATE_EDIT.licence.first, 'text');
      await form.saveAndReportDialog();
      expect(await form.isOpen(), 'a failed save should keep the form open').toBe(true);
    });

    await steps.step('No draft-saved toast appears', async () => {
      await toast.expectNone();
      await NetworkUtils.restoreEndpoint(page, ApiEndpoints.payerUpdate);
      await payerManagementPage.form().closeAndDiscard();
    });
  });

  test('TC-008: should not stack duplicate toasts when saves follow in quick succession', async ({
    payerManagementPage,
    toast,
    publishedPayer,
    steps,
  }) => {
    let form: PayerFormDialog | null = null;

    await steps.critical('Navigate to the module and save two edits back to back', async () => {
      await payerManagementPage.open();
      await payerManagementPage.editTextFieldAndSave(publishedPayer.nameEn, UPDATE_EDIT.licence.label, UPDATE_EDIT.licence.first);
      form = await payerManagementPage.saveTextFieldEdit(publishedPayer.nameEn, UPDATE_EDIT.licence.label, UPDATE_EDIT.licence.second);
      await toast.expectText(DRAFT_SAVED_TOAST.en);
    });

    await steps.step('At most one toast is on screen', async () => {
      expect(await toast.countCloseControls(), 'toasts must not stack').toBeLessThanOrEqual(MAX_STACKED_TOASTS);
      await (form as PayerFormDialog).waitForClosed();
    });
  });

  test('TC-009: should match the specified wording and dismiss both automatically and on demand', async ({
    payerManagementPage,
    toast,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module and save an edit', async () => {
      await payerManagementPage.open();
      const form = await payerManagementPage.saveTextFieldEdit(publishedPayer.nameEn, UPDATE_EDIT.licence.label, UPDATE_EDIT.licence.first);
      await toast.expectText(DRAFT_SAVED_TOAST.en);
      await form.waitForClosed();
    });

    await steps.step('The toast dismisses itself in time', async () => {
      await toast.expectDismissedWithin(TOAST_GONE_BY_MS);
    });

    await steps.step('A fresh toast can be dismissed with its close control', async () => {
      await payerManagementPage.open();
      const form = await payerManagementPage.saveTextFieldEdit(publishedPayer.nameEn, UPDATE_EDIT.licence.label, UPDATE_EDIT.licence.second);
      await toast.expectText(DRAFT_SAVED_TOAST.en);
      // Counted before clicking so the finding reads "no close control" rather
      // than a click timeout - VERIFIED the toast renders none (folder 34).
      expect(await toast.countCloseControls(), 'the toast should offer a close control').toBeGreaterThan(0);
      await toast.dismiss();
      await toast.expectNone();
      await form.waitForClosed();
    });
  });

  test('TC-011: should show the toast only once the server has confirmed the draft save', async ({
    page,
    payerManagementPage,
    toast,
    publishedPayer,
    steps,
  }) => {
    let form: PayerFormDialog | null = null;

    await steps.critical('Navigate to the module and save an edit while watching the server response', async () => {
      await payerManagementPage.open();
      form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
      await form.setFieldValue(UPDATE_EDIT.licence.label, UPDATE_EDIT.licence.first, 'text');
      const response = await NetworkUtils.captureResponse(page, ApiEndpoints.payerUpdate, async () => {
        await (form as PayerFormDialog).saveFromAnyStep();
      });
      expect(response, 'the save should reach the server').not.toBeNull();
      expect(response?.status, 'the server should confirm the save').toBe(200);
    });

    await steps.step('The toast follows the confirmation', async () => {
      await toast.expectText(DRAFT_SAVED_TOAST.en);
      await (form as PayerFormDialog).waitForClosed();
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.id}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
