import { test, expect } from '../../../fixtures';
import { azureOrCase } from '../../../data/azureTestIds.data';
import type { ShapedSession } from '../../../fixtures/shapedNonAdmin.fixture';
import { NON_ADMIN_PROFILE } from '../../../data/accounts/nonAdminAccount.data';
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

  // Azure test case 14609
  test('14609: should show the bilingual draft-saved toast naming the payer when an edit is saved', async ({
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

  // Azure test case 14614
  test('14614: should not show the submitted-for-approval message when an edit is merely saved', async ({
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

  // Azure test case 14617
  test('14617: should show the submitted-for-approval toast only after Send for Approval is used', async ({
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

  // Azure test case 14623
  test('14623: should show the toast correctly when the payer name is at its maximum length', async ({
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

  // Azure test case 14627
  test('14627: should show no success toast when the save fails on the wire', async ({
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

  // Azure test case 14632
  test('14632: should not stack duplicate toasts when saves follow in quick succession', async ({
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

  // Azure test case 14635
  test('14635: should match the specified wording and dismiss both automatically and on demand', async ({
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


  // ---- the withheld half, on a role shaped for this case -------------------
  // This used to report BLOCKED: the one non-administrator credential in this
  // environment HOLDS the permission whose absence the case is about. The
  // account is now BUILT - the administrator takes the permission off the
  // shared "Payer Admin" role, the case signs in as it, and the permission
  // goes back when the case ends.

  // Azure test case 14630
  test('14630: should not let a user without edit permission reach the save and toast flow', async ({ shapedNonAdmin, steps }) => {
    let session!: ShapedSession;

    await steps.critical('Sign in as a user without Edit Payer', async () => {
      session = await shapedNonAdmin({ without: ['editPayer'] });
      await session.payers.navigate();
      await session.payers.expectRowsRendered();
    });

    await steps.step('The edit route, and so the save and its toast, is withheld', async () => {
      await session.payers.expectRowActionUnavailable(NON_ADMIN_PROFILE.scopedPayers[0], 'edit');
    });
  });
  // Azure test case 14615
  test('14615: should keep the user on the payer after an edit is saved', async ({
    payerManagementPage,
    toast,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and save an edit', async () => {
      await payerManagementPage.open();
      const form = await payerManagementPage.saveTextFieldEdit(
        publishedPayer.nameEn,
        UPDATE_EDIT.licence.label,
        UPDATE_EDIT.licence.first,
      );
      await toast.waitForText();
      await form.waitForClosed();
    });

    // Being thrown back to an unfiltered list after saving loses the reader's
    // place, which is the complaint this case guards against. The payer stays
    // in view, whether that is its detail screen or the row it was edited from.
    await steps.step('The payer that was edited is still the one on screen', async () => {
      const listed = await payerManagementPage.getVisiblePayerNames().catch((): string[] => []);
      const onDetail = await payerManagementPage.detail().hasStatusBanner().catch(() => false);
      expect(
        onDetail || listed.includes(publishedPayer.nameEn),
        `after saving, the payer should still be in view; the list showed: ${listed.join(', ') || '(nothing)'}`,
      ).toBe(true);
    });
  });

  // Azure test case 14611
  test('14611: should name the payer in the toast so it is clear what was saved', async ({
    payerManagementPage,
    toast,
    publishedPayer,
    steps,
  }) => {
    let shown = { summary: '', detail: '' };

    await steps.critical('Navigate to the module and save an edit', async () => {
      await payerManagementPage.open();
      const form = await payerManagementPage.saveTextFieldEdit(
        publishedPayer.nameEn,
        UPDATE_EDIT.licence.label,
        UPDATE_EDIT.licence.second,
      );
      shown = await toast.waitForText();
      await form.waitForClosed();
    });

    // With several payers edited in a session, a toast that names none of them
    // cannot be matched to what was just saved - which is the context the case
    // asks for.
    await steps.step('The toast carries the payer it is reporting on', async () => {
      const text = `${shown.summary} ${shown.detail}`;
      expect(
        text,
        `the toast should name the payer it saved; it read "${text.trim()}"`,
      ).toContain(publishedPayer.nameEn);
    });
  });

  // Azure test case 14625
  test('14625: should not report a save when nothing was actually changed', async ({
    payerManagementPage,
    toast,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Open the edit form and leave every field as it was', async () => {
      await payerManagementPage.open();
      const form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
      await form.attemptSave();
    });

    // A success toast for a save that staged nothing tells the user a change
    // was recorded when none was - the reverse of what the toast is for.
    await steps.step('No draft-saved toast is raised for a no-op save', async () => {
      const raised = await toast.waitForText().catch(() => null);
      expect(
        raised === null || raised.summary !== DRAFT_SAVED_TOAST.en.summary,
        `a save that changed nothing should not report a saved draft; the toast read `
          + `"${raised ? raised.summary : '(none)'}"`,
      ).toBe(true);
    });
  });

  // Azure test case 14619
  test('14619: should report the draft save and the submission as two separate messages', async ({
    payerManagementPage,
    toast,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Save an edit as a draft', async () => {
      await payerManagementPage.open();
      const form = await payerManagementPage.saveTextFieldEdit(
        publishedPayer.nameEn,
        UPDATE_EDIT.licence.label,
        UPDATE_EDIT.licence.first,
      );
      const saved = await toast.waitForText();
      expect(saved.summary, 'the first message is the draft save').toBe(DRAFT_SAVED_TOAST.en.summary);
      await form.waitForClosed();
    });

    // The two steps of the maker-checker flow each have their own message, and
    // in this order. One message for both, or the submission wording appearing
    // at save time, would misreport where the change has got to.
    await steps.step('Sending it for approval reports the submission, not another draft save', async () => {
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      const submitted = await toast.waitForText();
      expect(
        submitted.summary,
        `the second message should report the submission; it read "${submitted.summary}"`,
      ).toBe(SUBMITTED_TOAST.en.summary);
    });
  });

  // Azure test case 14622
  test('14622: should render the draft-saved toast in Arabic when the interface is Arabic', async ({
    payerManagementPage,
    languageSwitcher,
    toast,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Switch to Arabic and save an edit', async () => {
      await languageSwitcher.switchTo('ar');
      await payerManagementPage.open();
      // The Arabic list renders the Arabic name in the name column, so the row
      // is keyed by it.
      const form = await payerManagementPage.saveTextFieldEdit(
        publishedPayer.nameAr,
        UPDATE_EDIT.licence.label,
        UPDATE_EDIT.licence.second,
      );
      await form.waitForClosed().catch(() => undefined);
    });

    await steps.step('The toast is the Arabic wording, not the English one', async () => {
      const shown = await toast.waitForText();
      expect(shown.summary, 'the summary should be the Arabic wording').toBe(DRAFT_SAVED_TOAST.ar.summary);
      expect(shown.detail, 'the detail should be the Arabic wording').toBe(DRAFT_SAVED_TOAST.ar.detail);
    });

    await steps.step('And the interface is returned to English', () => languageSwitcher.switchTo('en'));
  });

  // Azure test case 14629
  test('14629: should report each save and submission outcome with its own message', async ({
    payerManagementPage,
    toast,
    publishedPayer,
    page,
    steps,
  }) => {
    test.slow();

    await steps.step('A save that succeeds reports the draft save', async () => {
      await payerManagementPage.open();
      const form = await payerManagementPage.saveTextFieldEdit(
        publishedPayer.nameEn,
        UPDATE_EDIT.licence.label,
        UPDATE_EDIT.licence.first,
      );
      const saved = await toast.waitForText();
      expect(saved.summary).toBe(DRAFT_SAVED_TOAST.en.summary);
      await form.waitForClosed();
    });

    // The failing half matters more than the succeeding one: a success message
    // on a save the server refused is the worst outcome available, because the
    // user leaves believing the change is recorded.
    await steps.step('A save the server refuses does not report a draft save', async () => {
      await NetworkUtils.failEndpoint(page, ApiEndpoints.payerUpdate);
      await payerManagementPage.open();
      const form = await payerManagementPage.saveTextFieldEdit(
        publishedPayer.nameEn,
        UPDATE_EDIT.licence.label,
        UPDATE_EDIT.licence.second,
      ).catch(() => null);
      const raised = await toast.waitForText().catch(() => null);
      expect(
        raised === null || raised.summary !== DRAFT_SAVED_TOAST.en.summary,
        `a refused save must not report a saved draft; the toast read "${raised ? raised.summary : '(none)'}"`,
      ).toBe(true);
      await form?.closeAndDiscard().catch(() => undefined);
      await NetworkUtils.restoreEndpoint(page, ApiEndpoints.payerUpdate);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`${azureOrCase('72', 'TC-' + blocked.id)}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
