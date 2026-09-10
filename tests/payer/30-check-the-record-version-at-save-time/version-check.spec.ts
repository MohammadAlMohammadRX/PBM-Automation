import { test, expect } from '../../../fixtures';
import type { PayerFormDialog } from '../../../pages/payer/PayerFormDialog';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import {
  CONFLICT_MESSAGE_PATTERNS,
  CONFLICT_RESPONSE,
  EXPECTED_VERSION_INCREMENT,
  RAPID_SAVE_CLICKS,
  REPEATED_BLOCKED_SAVES,
  VERSION_CHECK_FIELDS,
} from '../../../data/payers/versionCheckOnSave.data';

/**
 * User story: Check the Record Version at Save Time.
 *
 * THE CHECK IS REAL AND SERVER-SIDE. A save made from a copy loaded before
 * someone else's save comes back HTTP 409 with "This payer has been modified
 * since it was loaded. Please refresh and try again." - verified while writing
 * the concurrent-edit story, whose data file this one re-exports rather than
 * restating.
 *
 * THE INTERFACE STILL SAYS NOTHING. On that 409 there is no toast, no inline
 * error and no banner: the drawer stays open exactly as if Save had not landed.
 * So every conflict case here splits in two - the record is protected, and the
 * user is not told - and the second half fails.
 *
 * TWO TABS, ONE ACCOUNT. The stale copy is produced with a second tab of the
 * same session, because this environment exposes one set of credentials. The
 * version check is server-side and compares the submitted version to the stored
 * one, so it neither knows nor cares which tab sent the save.
 *
 * THE VERSION IS READ FROM THE LIST. Each payer's approval cell reads
 * "v<N> · <status>", which is how "the record remains at v2" is asserted without
 * reading the API.
 */
test.describe('Version check at save time', () => {
  test('TC-001: should save successfully when the record has not changed since it loaded', async ({
    payerManagementPage,
    uniquePayer,
    steps,
  }) => {
    let form!: PayerFormDialog;
    let versionBefore!: string;

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(uniquePayer);
      await payerManagementPage.open();
      await payerManagementPage.search(uniquePayer.nameEn);
      versionBefore = await payerManagementPage.getVersionLabel(uniquePayer.nameEn);
      expect(versionBefore, 'the record should carry a version to check against').not.toBe('');
    });

    await steps.critical('The payer opens for editing at that version', async () => {
      form = await payerManagementPage.openEditForm(uniquePayer.nameEn);
      await form.expectFieldValue('Payer Name', uniquePayer.nameEn);
    });

    await steps.step('A field is modified and the form holds the change', async () => {
      await form.setFieldValue(
        VERSION_CHECK_FIELDS.first.label,
        VERSION_CHECK_FIELDS.first.value,
        'text',
      );
      expect(
        await form.getFieldValue(VERSION_CHECK_FIELDS.first.label),
        'the form should be holding the change it is about to submit',
      ).toBe(VERSION_CHECK_FIELDS.first.value);
    });

    await steps.step('The save is accepted because the version still matches', async () => {
      const outcome = await form.saveAndCaptureOutcome();
      expect(outcome, 'the save should have reached the server').not.toBeNull();
      expect(outcome!.status, 'a matching version should be accepted').toBe(200);
      await form.waitForClosed();
    });

    await steps.step('Reopening the record shows the change was applied', async () => {
      await payerManagementPage.open();
      const reopened = await payerManagementPage.openEditForm(uniquePayer.nameEn);
      await reopened.expectFieldValue(
        VERSION_CHECK_FIELDS.first.label,
        VERSION_CHECK_FIELDS.first.value,
      );
      await reopened.closeAndDiscard();
    });
  });

  test('TC-002: should reject the save when another session has moved the record on', async ({
    payerManagementPage,
    staleSession,
    uniquePayer,
    steps,
  }) => {
    let staleForm!: PayerFormDialog;
    let versionAtLoad!: string;

    await steps.critical('Navigate to the module and create the payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(uniquePayer);
      await payerManagementPage.open();
      await payerManagementPage.search(uniquePayer.nameEn);
      versionAtLoad = await payerManagementPage.getVersionLabel(uniquePayer.nameEn);
    });

    await steps.critical('The first session opens the payer, capturing its version', async () => {
      staleForm = await payerManagementPage.openEditForm(uniquePayer.nameEn);
      await staleForm.expectFieldValue('Payer Name', uniquePayer.nameEn);
    });

    await steps.step('A second session saves a change, moving the record on', async () => {
      const otherForm = await staleSession.openEditForm(uniquePayer.nameEn);
      await otherForm.setFieldValue(
        VERSION_CHECK_FIELDS.second.label,
        VERSION_CHECK_FIELDS.second.value,
        'text',
      );
      const outcome = await otherForm.saveAndCaptureOutcome();
      expect(outcome!.status, "the second session's save should succeed").toBe(200);
      await otherForm.waitForClosed();

      // The record HAS moved on - but not in a way the list shows, and this
      // step first asserted the label had changed. VERIFIED: a draft sits at
      // "v0 - Draft" and stays there through any number of accepted saves,
      // because a draft save updates its own version in place; the number
      // advances when a change is APPROVED. The stored row version the server
      // checks against is not the number on screen.
      //
      // So the label is asserted to be UNCHANGED - which is itself worth
      // pinning, since an unapproved edit must not look like a new published
      // version - and the proof that the record moved on is the 200 above
      // followed by the 409 below.
      await staleSession.payerPage.open();
      await staleSession.payerPage.search(uniquePayer.nameEn);
      expect(
        await staleSession.payerPage.getVersionLabel(uniquePayer.nameEn),
        'an accepted save on a draft does not publish a new version',
      ).toBe(versionAtLoad);
    });

    await steps.step('The first session edits its stale copy', async () => {
      await staleForm.setFieldValue(
        VERSION_CHECK_FIELDS.first.label,
        VERSION_CHECK_FIELDS.first.value,
        'text',
      );
      expect(
        await staleForm.getFieldValue(VERSION_CHECK_FIELDS.first.label),
        'the change should be held in the stale form',
      ).toBe(VERSION_CHECK_FIELDS.first.value);
    });

    await steps.step('Its save is refused by the version check', async () => {
      const outcome = await staleForm.saveAndCaptureOutcome();
      staleForm.expectStaleSaveRejected(outcome, {
        status: CONFLICT_RESPONSE.status,
        reason: CONFLICT_RESPONSE.reason,
      });
    });
  });

  test('TC-005: should block the stale save, keep the input, and accept it after a refresh', async ({
    payerManagementPage,
    staleSession,
    uniquePayer,
    steps,
  }) => {
    let staleForm!: PayerFormDialog;

    await steps.critical('Navigate to the module and create the payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(uniquePayer);
      await payerManagementPage.open();
      await payerManagementPage.search(uniquePayer.nameEn);
    });

    await steps.critical('The first session loads the payer and edits a field', async () => {
      staleForm = await payerManagementPage.openEditForm(uniquePayer.nameEn);
      await staleForm.setFieldValue(
        VERSION_CHECK_FIELDS.first.label,
        VERSION_CHECK_FIELDS.first.value,
        'text',
      );
      expect(
        await staleForm.getFieldValue(VERSION_CHECK_FIELDS.first.label),
        'the form should be holding the edit that will later be refused',
      ).toBe(VERSION_CHECK_FIELDS.first.value);
    });

    await steps.step('Another session changes the record behind it', async () => {
      const otherForm = await staleSession.openEditForm(uniquePayer.nameEn);
      await otherForm.setFieldValue(
        VERSION_CHECK_FIELDS.second.label,
        VERSION_CHECK_FIELDS.second.value,
        'text',
      );
      const outcome = await otherForm.saveAndCaptureOutcome();
      expect(outcome!.status).toBe(200);
      await otherForm.waitForClosed();
    });

    await steps.step('The stale save is blocked and the edit is kept in the form', async () => {
      const outcome = await staleForm.saveAndCaptureOutcome();
      staleForm.expectStaleSaveRejected(outcome, {
        status: CONFLICT_RESPONSE.status,
        reason: CONFLICT_RESPONSE.reason,
      });
      // The sheet's "the edited value remains in the form" - what makes the
      // refresh-and-retry route usable at all.
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

    await steps.step('The user is told to refresh and try again', async () => {
      // FAILS. The server says exactly that in its 409, and the interface
      // passes none of it on - so a user is left looking at a form that will
      // not save and no reason why.
      const messages = await staleForm.waitForVisibleMessages();
      expect(
        messages,
        `the interface should carry the server's advice; it showed: `
          + `${messages.join(' | ') || '(nothing)'}`,
      ).not.toEqual([]);
      expect(
        messages.join(' '),
        'and it should say the record changed and ask for a refresh',
      ).toMatch(CONFLICT_MESSAGE_PATTERNS.en);
    });

    await steps.step('After reloading, the same edit saves successfully', async () => {
      await staleForm.closeAndDiscard();
      await payerManagementPage.open();
      const refreshed = await payerManagementPage.openEditForm(uniquePayer.nameEn);
      await refreshed.setFieldValue(
        VERSION_CHECK_FIELDS.retry.label,
        VERSION_CHECK_FIELDS.retry.value,
        'text',
      );
      const outcome = await refreshed.saveAndCaptureOutcome();
      expect(outcome!.status, 'a save from a fresh copy should be accepted').toBe(200);
      await refreshed.waitForClosed();
    });
  });

  test('TC-007: should keep refusing repeated stale saves without changing the record', async ({
    payerManagementPage,
    staleSession,
    uniquePayer,
    steps,
  }) => {
    let staleForm!: PayerFormDialog;
    let versionAfterOtherSave!: string;

    await steps.critical('Navigate to the module and create the payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(uniquePayer);
      await payerManagementPage.open();
      await payerManagementPage.search(uniquePayer.nameEn);
    });

    await steps.critical('One session holds a stale copy after another saves', async () => {
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
      versionAfterOtherSave = await staleSession.payerPage.getVersionLabel(uniquePayer.nameEn);
    });

    await steps.step('Every repeated save from the stale copy is refused the same way', async () => {
      await staleForm.setFieldValue(
        VERSION_CHECK_FIELDS.first.label,
        VERSION_CHECK_FIELDS.first.value,
        'text',
      );
      for (let attempt = 1; attempt <= REPEATED_BLOCKED_SAVES; attempt += 1) {
        const outcome = await staleForm.saveAndCaptureOutcome();
        staleForm.expectStaleSaveRejected(outcome, {
          status: CONFLICT_RESPONSE.status,
          reason: CONFLICT_RESPONSE.reason,
        });
      }
    });

    await steps.step('And the record is untouched by any of them', async () => {
      await staleForm.closeAndDiscard();
      await payerManagementPage.open();
      await payerManagementPage.search(uniquePayer.nameEn);
      expect(
        await payerManagementPage.getVersionLabel(uniquePayer.nameEn),
        `${REPEATED_BLOCKED_SAVES} refused saves should leave the version where it was`,
      ).toBe(versionAfterOtherSave);
    });
  });

  test('TC-008: should save once when Save is double-clicked', async ({
    page,
    payerManagementPage,
    uniquePayer,
    steps,
  }) => {
    let form!: PayerFormDialog;
    let savesSent = 0;

    await steps.critical('Navigate to the module and create the payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(uniquePayer);
      await payerManagementPage.open();
      await payerManagementPage.search(uniquePayer.nameEn);
      await payerManagementPage.waitForRowVisible(uniquePayer.nameEn);
    });

    await steps.critical('The payer opens for editing with a change made', async () => {
      form = await payerManagementPage.openEditForm(uniquePayer.nameEn);
      await form.setFieldValue(
        VERSION_CHECK_FIELDS.first.label,
        VERSION_CHECK_FIELDS.first.value,
        'text',
      );
      expect(
        await form.getFieldValue(VERSION_CHECK_FIELDS.first.label),
        'there should be something to save before the clicks are counted',
      ).toBe(VERSION_CHECK_FIELDS.first.value);
    });

    await steps.step('Save is clicked repeatedly in rapid succession', async () => {
      // Counted on the wire, which is where "saves once" is decided. The
      // displayed version is the wrong instrument for this: it moves on
      // APPROVAL, not on save, so a draft saved once and a draft saved three
      // times both still read "v1", and the assertion that used it could not
      // have failed for the reason the case cares about.
      savesSent = await NetworkUtils.countRequestsDuring(
        page,
        ApiEndpoints.payerUpdate,
        () => form.saveRepeatedly(RAPID_SAVE_CLICKS),
      );
      await form.waitForClosed();
      expect(
        await form.isOpen(),
        'the drawer should have closed once, not been left in a half-saved state',
      ).toBe(false);
    });

    await steps.step(`The ${RAPID_SAVE_CLICKS} clicks produced exactly one save`, async () => {
      expect(
        savesSent,
        `${RAPID_SAVE_CLICKS} clicks should send ${EXPECTED_VERSION_INCREMENT} update request`,
      ).toBe(EXPECTED_VERSION_INCREMENT);
    });

    await steps.step('And the record holds the change once', async () => {
      await payerManagementPage.open();
      const reopened = await payerManagementPage.openEditForm(uniquePayer.nameEn);
      await reopened.expectFieldValue(
        VERSION_CHECK_FIELDS.first.label,
        VERSION_CHECK_FIELDS.first.value,
      );
      await reopened.closeAndDiscard();
    });

    await steps.step('And no error was raised in the process', () =>
      payerManagementPage.expectNoUnexpectedDialog());
  });
});
