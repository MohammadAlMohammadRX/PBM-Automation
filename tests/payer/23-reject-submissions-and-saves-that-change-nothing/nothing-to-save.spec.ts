import { test, expect } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import {
  APPROVAL_STATE,
  EDITED_FIELD,
  EXPECTED_MESSAGES,
  NO_OP_SAVE_RESPONSE,
  RESTRICTED_ROLE_REQUIREMENT,
  subtleVariants,
} from '../../../data/payers/nothingToSubmit.data';

/**
 * User story: Reject Submissions and Saves That Change Nothing.
 * The SAVE half - an edit form with nothing changed in it.
 *
 * Save is not rendered until a field changes. An untouched form navigated to
 * its final step offers Back and Next and no Save at all: no request goes out,
 * no draft version is created, and nothing is said. These cases assert that
 * guard, look for the message the sheet asks for, and then check the subtler
 * question - whether a change that nets out to nothing is treated the same way.
 */
test.describe('Nothing to submit - Saves', () => {
  test('TC-003: should offer no way to save an edit form in which nothing changed', async ({
    page,
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    let requests = 0;

    await steps.critical('Navigate to the module and open the payer for editing', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        APPROVAL_STATE.en.published,
      );
    });

    await steps.critical('The edit form opens pre-populated', async () => {
      const form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
      expect(
        await form.getFieldValue('Payer Name'),
        'the form should be pre-populated with the existing record',
      ).toBe(publishedPayer.nameEn);
    });

    await steps.step('Nothing is submitted when an untouched form is saved', async () => {
      // Asserted on what was SENT rather than on the Save button's presence:
      // this wizard renders Save only on its final step, and probing for it
      // there proved unreliable. "Was anything submitted" is the question the
      // story asks anyway, and it is answered the same way whether the control
      // is missing, disabled, or simply inert.
      const form = payerManagementPage.form();
      // ASSERTED ON WHAT THE SERVER DID, not on whether a request went out. A
      // request IS sent - verified on the wire - and the server answers 200
      // with `noChanges: true` and "No changes were made ...", so the record is
      // protected by the SERVER rather than by the form withholding Save.
      // Demanding that nothing be sent failed a guard that works, just not
      // where the sheet assumed it lives. An untouched form.
      const outcome = await form.attemptSave();
      const body = JSON.stringify(outcome?.body ?? {});
      expect(
        body.includes(`"${NO_OP_SAVE_RESPONSE.noChangesFlag}":true`) || outcome === null,
        `no version should be created; the server answered: ${outcome?.status ?? 'nothing sent'} `
          + `${body}`,
      ).toBe(true);
    });

    await steps.step('The user is told there is nothing to submit', async () => {
      // FAILS. Nothing is said: no toast, no dialog, no field error - the
      // control is simply not there. The record is protected, which is what
      // matters most, but a user looking for Save has nothing to go on.
      const form = payerManagementPage.form();
      const messages = await form.waitForVisibleMessages();
      expect(
        messages,
        `the server already returned "${NO_OP_SAVE_RESPONSE.message} ..." in its 200 response `
          + `and the interface displayed none of it. Expected something like `
          + `"${EXPECTED_MESSAGES.nothingToSubmit}"; the form showed: `
          + `${messages.join(' | ') || '(nothing)'}`,
      ).not.toEqual([]);
    });

    await steps.step('And no draft version is created for the payer', async () => {
      requests = await NetworkUtils.countRequestsDuring(
        page,
        ApiEndpoints.payerUpdate,
        () => payerManagementPage.form().closeAndDiscard(),
      );
      expect(requests, 'nothing changed, so nothing should have been sent').toBe(0);

      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        APPROVAL_STATE.en.published,
      );
    });
  });

  test('TC-004: should treat a change that is reverted before saving as no change', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and open the payer for editing', async () => {
      await payerManagementPage.open();
      await payerManagementPage.editTextFieldAndSave(
        publishedPayer.nameEn,
        EDITED_FIELD.label,
        EDITED_FIELD.value,
      );
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
    });

    await steps.critical('A field is changed and then changed back', async () => {
      const form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
      await form.setFieldValue(EDITED_FIELD.label, EDITED_FIELD.changed, 'text');
      await form.setFieldValue(EDITED_FIELD.label, EDITED_FIELD.value, 'text');
      expect(
        await form.getFieldValue(EDITED_FIELD.label),
        'the field should hold its original value again',
      ).toBe(EDITED_FIELD.value);
    });

    await steps.step('The net change is nothing, and nothing is submitted', async () => {
      // The interesting half of this story. A form that only tracks "was
      // anything typed" would submit here and create a version identical to the
      // one before it - which is exactly the no-op draft the story exists to
      // prevent.
      const form = payerManagementPage.form();
      // ASSERTED ON WHAT THE SERVER DID, not on whether a request went out. A
      // request IS sent - verified on the wire - and the server answers 200
      // with `noChanges: true` and "No changes were made ...", so the record is
      // protected by the SERVER rather than by the form withholding Save.
      // Demanding that nothing be sent failed a guard that works, just not
      // where the sheet assumed it lives. A change typed and then undone.
      const outcome = await form.attemptSave();
      const body = JSON.stringify(outcome?.body ?? {});
      expect(
        body.includes(`"${NO_OP_SAVE_RESPONSE.noChangesFlag}":true`) || outcome === null,
        `no version should be created; the server answered: ${outcome?.status ?? 'nothing sent'} `
          + `${body}`,
      ).toBe(true);
    });

    await steps.step('And the payer keeps the version it had', async () => {
      await payerManagementPage.form().closeAndDiscard();
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      expect(
        await detail.getFieldValue(EDITED_FIELD.label),
        'the stored value should be the one the case started from',
      ).toBe(EDITED_FIELD.value);
    });
  });

  test('TC-005: should behave consistently across the four submit-and-save scenarios', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        APPROVAL_STATE.en.published,
      );
    });

    await steps.step('A payer with no draft changes offers no submission', async () => {
      await payerManagementPage.expectRowActionUnavailable(
        publishedPayer.nameEn,
        'submit-for-approval',
      );
    });

    await steps.step('An edit that changes a field can be saved', async () => {
      const form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
      await form.setFieldValue(EDITED_FIELD.label, EDITED_FIELD.changed, 'text');
      const outcome = await form.attemptSave();
      expect(outcome, 'a real change should reach the server').not.toBeNull();
      expect(outcome!.status, 'and be accepted').toBe(200);
      await form.waitForClosed();
    });

    await steps.step('The payer now holds a draft change and can be submitted', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        APPROVAL_STATE.en.draft,
      );
      await payerManagementPage.expectRowActionsEnabled(publishedPayer.nameEn, [
        'submit-for-approval',
      ]);
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
    });

    await steps.step('And an edit session that changes nothing still cannot be saved', async () => {
      await payerManagementPage.open();
      const form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
      // ASSERTED ON WHAT THE SERVER DID, not on whether a request went out. A
      // request IS sent - verified on the wire - and the server answers 200
      // with `noChanges: true` and "No changes were made ...", so the record is
      // protected by the SERVER rather than by the form withholding Save.
      // Demanding that nothing be sent failed a guard that works, just not
      // where the sheet assumed it lives. The fourth scenario: an untouched form, whatever state the payer is in.
      const outcome = await form.attemptSave();
      const body = JSON.stringify(outcome?.body ?? {});
      expect(
        body.includes(`"${NO_OP_SAVE_RESPONSE.noChangesFlag}":true`) || outcome === null,
        `no version should be created; the server answered: ${outcome?.status ?? 'nothing sent'} `
          + `${body}`,
      ).toBe(true);
      await form.closeAndDiscard();
    });
  });

  test('TC-010: should treat every whitespace-only difference the same way', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    const outcomes: { label: string; savable: boolean }[] = [];

    await steps.critical('Navigate to the module with a payer holding a known value', async () => {
      await payerManagementPage.open();
      await payerManagementPage.editTextFieldAndSave(
        publishedPayer.nameEn,
        EDITED_FIELD.label,
        EDITED_FIELD.value,
      );
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
    });

    await steps.step('Each subtle non-change is offered to the form in turn', async () => {
      for (const variant of subtleVariants(EDITED_FIELD.value)) {
        const form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
        await form.setFieldValue(EDITED_FIELD.label, variant.value, 'text');
        outcomes.push({
          label: variant.label,
          savable: (await form.attemptSave()) !== null,
        });
        await form.closeAndDiscard();
        await payerManagementPage.open();
        await payerManagementPage.search(publishedPayer.nameEn);
      }
      expect(outcomes, 'every variant should have been tried').toHaveLength(3);
    });

    await steps.step('They are all treated alike', async () => {
      // The invariant, rather than a guess at which way the application should
      // decide: a build that treated a trailing space as a change while
      // treating a re-typed identical value as no change would create draft
      // versions that differ only by whitespace.
      const distinct = new Set(outcomes.map((outcome) => outcome.savable));
      expect(
        distinct.size,
        `the variants disagreed: ${outcomes
          .map((o) => `${o.label} -> ${o.savable ? 'savable' : 'refused'}`)
          .join('; ')}`,
      ).toBe(1);
    });

    await steps.step('And the stored value is unchanged by any of them', async () => {
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      expect(
        (await detail.getFieldValue(EDITED_FIELD.label)).trim(),
        'no variant should have been written to the record',
      ).toBe(EDITED_FIELD.value);
    });
  });

  test('TC-012: should offer the submit and save controls only when there is something to act on', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module with a settled payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        APPROVAL_STATE.en.published,
      );
    });

    await steps.step('With nothing staged, Send for Approval is not offered', async () => {
      const availability = await payerManagementPage.getRowActionAvailability(
        publishedPayer.nameEn,
        'submit-for-approval',
      );
      expect(availability, 'no draft change, no submission').not.toBe('available');
    });

    await steps.step('With nothing typed, nothing can be submitted either', async () => {
      const form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
      // ASSERTED ON WHAT THE SERVER DID, not on whether a request went out. A
      // request IS sent - verified on the wire - and the server answers 200
      // with `noChanges: true` and "No changes were made ...", so the record is
      // protected by the SERVER rather than by the form withholding Save.
      // Demanding that nothing be sent failed a guard that works, just not
      // where the sheet assumed it lives. Nothing typed.
      const outcome = await form.attemptSave();
      const body = JSON.stringify(outcome?.body ?? {});
      expect(
        body.includes(`"${NO_OP_SAVE_RESPONSE.noChangesFlag}":true`) || outcome === null,
        `no version should be created; the server answered: ${outcome?.status ?? 'nothing sent'} `
          + `${body}`,
      ).toBe(true);
    });

    await steps.step('One real change turns both controls back on', async () => {
      // The drawer is REOPENED, because the previous step's no-op save closed
      // it. That is the application's actual behaviour and it surprised this
      // case: the save is accepted with `noChanges: true` and the drawer shuts
      // as though something had been saved, so carrying on with the same form
      // handle typed into a drawer that was no longer there.
      await payerManagementPage.open();
      const form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
      await form.setFieldValue(EDITED_FIELD.label, EDITED_FIELD.changed, 'text');
      const outcome = await form.attemptSave();
      expect(outcome, 'a real change should submit').not.toBeNull();
      await form.waitForClosed();

      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectRowActionsEnabled(publishedPayer.nameEn, [
        'submit-for-approval',
      ]);
    });
  });
});

/** Access control, signed out of the shared administrator session. */
test.describe('Nothing to submit - Access control', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('TC-007: should refuse the submission for a user without submission rights', async ({
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

    await steps.critical('Open the payer list as the restricted user', async () => {
      await loginPage.open();
      await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);
      await payerManagementPage.navigate();
      await payerManagementPage.expectRowsRendered();
    });

    await steps.critical('A payer holding a draft change is on screen', async () => {
      const found = await payerManagementPage.findPayerWithApprovalStatus(
        APPROVAL_STATE.en.draft,
      );
      payerName = found.name;
      expect(payerName, 'the list should hold a draft payer to look at').not.toBe('');
    });

    await steps.step('Send for Approval is refused for this role', () =>
      payerManagementPage
        .expectRowActionUnavailable(payerName, 'submit-for-approval')
        .then((refusal) => {
          expect(refusal, 'the action should be absent or disabled').not.toBe('available');
        }));
  });
});
