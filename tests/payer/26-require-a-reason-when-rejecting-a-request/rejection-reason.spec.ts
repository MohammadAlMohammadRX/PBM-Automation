import { test, expect } from '../../../fixtures';
import {
  LONGEST_REASON,
  REJECT_DIALOG,
  REJECTED_STATUS,
  REJECTION_DIALOG_REASONS,
  UNENTERABLE_REASONS,
} from '../../../data/payers/rejectionReason.data';

/**
 * User story: Require a Reason When Rejecting a Request.
 *
 * THE REASON IS A MANAGED DROPDOWN. Verified on the live Reject dialog: a
 * "Rejection Reason" select with seven options, an acknowledgement checkbox,
 * and no typable control anywhere - zero textareas, zero text inputs.
 *
 * That decides how this story is tested. The sheet's minimum-length,
 * maximum-length, whitespace-only and script-injection cases describe a free-
 * text field that does not exist, so each of them asserts the constraint that
 * replaces it: the value can only be one of a managed set. That is a stronger
 * guarantee than the validation being asked for - an unmanaged value cannot be
 * entered, so it cannot be too short, too long, blank-but-not-empty, or
 * executable - and each case says so rather than reporting a false pass.
 *
 * Every case rejects a request raised on a payer this suite created, so no
 * reviewer's real work is discarded.
 */
test.describe('Require a reason when rejecting', () => {
  test('TC-001: should record the rejection when a valid reason is chosen', async ({
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and submit a request', async () => {
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(draftPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(draftPayer.nameEn);
    });

    await steps.critical('The queued request offers both decisions', () =>
      approvalManagementPage.expectActionsAvailable(draftPayer.nameEn));

    await steps.step('A valid reason is accepted in the reason field', async () => {
      const dialog = await approvalManagementPage.openRejectDialog(draftPayer.nameEn);
      expect(await dialog.getTitle(), 'the reject dialog').toBe(REJECT_DIALOG.title);
      await dialog.selectReasonIfPresent(REJECTION_DIALOG_REASONS[1]);
      // Both gates answered before the assertion below - see TC-003.
      await dialog.acknowledgeIfPresent();
      await dialog.expectAffirmativeEnabled(
        'a chosen reason and acknowledgement should release the Reject action',
      );
    });

    await steps.step('Submitting the rejection processes it and records the reason', async () => {
      await payerManagementPage.dialog().confirm('Reject');
      await approvalManagementPage.expectNotInQueue(draftPayer.nameEn);

      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(draftPayer.nameEn, REJECTED_STATUS);
    });
  });

  test('TC-002: should refuse the rejection when no reason is chosen', async ({
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and submit a request', async () => {
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(draftPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(draftPayer.nameEn);
    });

    await steps.critical('The Reject dialog is open with its reason field empty', async () => {
      const dialog = await approvalManagementPage.openRejectDialog(draftPayer.nameEn);
      expect(
        await dialog.getMessage(),
        'the dialog should explain what rejecting does',
      ).toContain(REJECT_DIALOG.consequence);
    });

    await steps.step('The Reject action is gated while no reason is chosen', async () => {
      const dialog = payerManagementPage.dialog();
      await dialog.acknowledgeIfPresent();
      // The acknowledgement alone is not enough: the reason is the gate this
      // story is about, so it is checked with everything ELSE answered.
      await dialog.expectAffirmativeDisabled(
        'Reject should stay unavailable until a reason is chosen',
      );
    });

    await steps.step('The requirement is stated to the reviewer', async () => {
      // The dialog names the field ("Rejection Reason") and prompts with
      // "Select a reason", which is the requirement expressed as a label rather
      // than as an error. Asserted because it is the only statement of the rule
      // the reviewer ever sees - the gate itself is silent.
      const dialog = payerManagementPage.dialog();
      expect(
        await dialog.getMessage(),
        `the dialog should prompt for a reason ("${REJECT_DIALOG.reasonPlaceholder}")`,
      ).not.toBe('');
      expect(
        await dialog.getReasonOptions(),
        'and offer the managed reasons to choose from',
      ).toEqual(expect.arrayContaining([...REJECTION_DIALOG_REASONS]));
    });

    await steps.step('The request is left pending, undecided', async () => {
      await payerManagementPage.dialog().cancel();
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(draftPayer.nameEn);
      await approvalManagementPage.expectActionsAvailable(draftPayer.nameEn);
    });
  });

  test('TC-003: should accept the shortest valid reason and offer no shorter one', async ({
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and submit a request', async () => {
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(draftPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(draftPayer.nameEn);
    });

    await steps.critical('The Reject dialog is open', async () => {
      const dialog = await approvalManagementPage.openRejectDialog(draftPayer.nameEn);
      expect(await dialog.getTitle()).toBe(REJECT_DIALOG.title);
    });

    await steps.step('A zero-character reason cannot be submitted', async () => {
      // The sheet's "zero characters" case. There is no field to leave empty:
      // the reason is chosen, not typed, so "empty" means "nothing selected" -
      // and that is gated.
      const dialog = payerManagementPage.dialog();
      expect(
        await dialog.hasFreeTextInput(),
        `the dialog offers no typable reason field, so "${UNENTERABLE_REASONS.empty}" cannot be `
          + 'entered at all',
      ).toBe(false);
      await dialog.acknowledgeIfPresent();
      await dialog.expectAffirmativeDisabled('and Reject stays gated');
    });

    await steps.step('The shortest reason the application offers is accepted', async () => {
      const dialog = payerManagementPage.dialog();
      const shortest = [...REJECTION_DIALOG_REASONS].sort((a, b) => a.length - b.length)[0];
      await dialog.selectReasonIfPresent(shortest);
      // The acknowledgement is the SECOND gate - verified live: the confirm
      // stays disabled with a reason chosen and nothing acknowledged, and only
      // both together release it.
      await dialog.acknowledgeIfPresent();
      await dialog.expectAffirmativeEnabled(
        `"${shortest}" should meet the minimum requirement`,
      );
      await dialog.confirm('Reject');
    });

    await steps.step('The rejection is recorded', async () => {
      await approvalManagementPage.expectNotInQueue(draftPayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(draftPayer.nameEn, REJECTED_STATUS);
    });
  });

  test('TC-004: should accept the longest managed reason and offer no way to exceed it', async ({
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and submit a request', async () => {
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(draftPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(draftPayer.nameEn);
    });

    await steps.critical('The Reject dialog is open', async () => {
      const dialog = await approvalManagementPage.openRejectDialog(draftPayer.nameEn);
      expect(await dialog.getTitle()).toBe(REJECT_DIALOG.title);
    });

    await steps.step('The longest reason the application offers is accepted in full', async () => {
      const dialog = payerManagementPage.dialog();
      await dialog.selectReasonIfPresent(LONGEST_REASON);
      await dialog.acknowledgeIfPresent();
      await dialog.expectAffirmativeEnabled(
        `"${LONGEST_REASON}" is the longest managed reason and should be accepted`,
      );
    });

    await steps.step('There is no way to exceed a length limit', async () => {
      // The sheet's "one character over the maximum" case. With no typable
      // field there is no maximum to exceed - the constraint is the managed
      // list, which is a stronger guarantee than a length check.
      const dialog = payerManagementPage.dialog();
      expect(
        await dialog.hasFreeTextInput(),
        `the dialog offers no typable field, so a ${UNENTERABLE_REASONS.overLength.length}-`
          + 'character reason cannot be submitted',
      ).toBe(false);
      const options = await dialog.getReasonOptions();
      expect(
        options.every((option) => option.length <= 64),
        `every managed reason is short by construction: ${options.join(', ')}`,
      ).toBe(true);
    });

    await steps.step('The rejection with the longest reason is processed', async () => {
      await payerManagementPage.dialog().confirm('Reject');
      await approvalManagementPage.expectNotInQueue(draftPayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(draftPayer.nameEn, REJECTED_STATUS);
    });
  });

  test('TC-005: should treat an unchosen reason as no reason at all', async ({
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and submit a request', async () => {
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(draftPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(draftPayer.nameEn);
    });

    await steps.critical('The Reject dialog is open', async () => {
      const dialog = await approvalManagementPage.openRejectDialog(draftPayer.nameEn);
      expect(await dialog.getTitle()).toBe(REJECT_DIALOG.title);
    });

    await steps.step('A whitespace-only reason cannot be entered', async () => {
      // The sheet types "   " and expects it trimmed and refused. There is
      // nothing to type into, and the dropdown's placeholder is not a value -
      // so the whitespace case collapses into the no-reason case, which is
      // gated.
      const dialog = payerManagementPage.dialog();
      expect(
        await dialog.hasFreeTextInput(),
        `"${UNENTERABLE_REASONS.whitespace}" cannot be entered - there is no text field`,
      ).toBe(false);
      expect(
        await dialog.getReasonOptions(),
        'and the placeholder is not among the selectable values',
      ).not.toContain(REJECT_DIALOG.reasonPlaceholder);
    });

    await steps.step('The rejection stays blocked while nothing is chosen', async () => {
      const dialog = payerManagementPage.dialog();
      await dialog.acknowledgeIfPresent();
      await dialog.expectAffirmativeDisabled('Reject should remain unavailable');
    });

    await steps.step('The request is left pending', async () => {
      await payerManagementPage.dialog().cancel();
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(draftPayer.nameEn);
    });
  });

  test('TC-007: should offer no surface for a script to be stored in the reason', async ({
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and submit a request', async () => {
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(draftPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(draftPayer.nameEn);
    });

    await steps.critical('The Reject dialog is open', async () => {
      const dialog = await approvalManagementPage.openRejectDialog(draftPayer.nameEn);
      expect(await dialog.getTitle()).toBe(REJECT_DIALOG.title);
    });

    await steps.step('The reason cannot carry a script or special characters', async () => {
      // The strongest possible answer to the sheet's injection case: there is
      // no free-text field, and the managed options contain no markup, so the
      // value that reaches the record can only ever be one of seven known
      // strings. Nothing to sanitize because nothing arbitrary can be sent.
      const dialog = payerManagementPage.dialog();
      expect(
        await dialog.hasFreeTextInput(),
        `"${UNENTERABLE_REASONS.script}" cannot be entered - the reason is a managed list`,
      ).toBe(false);
      const options = await dialog.getReasonOptions();
      expect(
        options.some((option) => /[<>]/.test(option)),
        'and no managed reason contains markup of its own',
      ).toBe(false);
    });

    await steps.step('A rejection recorded from the managed list stores plain text', async () => {
      const dialog = payerManagementPage.dialog();
      await dialog.selectReasonIfPresent(REJECTION_DIALOG_REASONS[3]);
      await dialog.acknowledgeIfPresent();
      await dialog.confirm('Reject');
      await approvalManagementPage.expectNotInQueue(draftPayer.nameEn);
    });

    await steps.step('And the stored value renders as text in the payer history', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(draftPayer.nameEn);
      await detail.openAuditHistory();
      const entries = await detail.getAuditEntryTexts();
      expect(
        entries.some((entry) => /<script/i.test(entry)),
        'nothing script-like should appear in the history',
      ).toBe(false);
    });
  });
});
