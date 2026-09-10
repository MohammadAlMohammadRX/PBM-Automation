import { test, expect } from '../../../fixtures';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import {
  EXPIRY_GUARDRAIL_MESSAGE,
  INVALID_TRANSITIONS,
} from '../../../data/payers/lifecycleGuardrails.data';

/**
 * User story: Strengthen Guardrails and Messaging for Payer Activation,
 * Inactivation and Reactivation.
 * The INVALID transitions - the guardrails themselves.
 *
 * HOW THE APPLICATION REFUSES THEM, verified per status by listing each row's
 * lifecycle buttons and their enabled state:
 *
 *   Active    inactivate ENABLED   · activate ABSENT
 *   Inactive  activate   ENABLED   · inactivate ABSENT
 *   Expired   activate   DISABLED  · inactivate ABSENT
 *
 * So no invalid transition can be attempted at all - which is a stronger
 * guarantee than the sheet asks for, since it expects the attempt to be made
 * and then refused with a message. Each case therefore asserts the refusal AND
 * the message separately:
 *
 *   THE REFUSAL always holds. Whether by omitting the action or disabling it,
 *   the state change cannot be started.
 *
 *   THE MESSAGE holds only for the expired payer, whose disabled Activate
 *   button carries "Cannot reactivate: the payer has expired. Update its expiry
 *   date to reactivate it." in the active language. For the two "already in
 *   that state" cases there is no control left to carry a message, so nothing
 *   explains the refusal and that step fails.
 *
 * Splitting them is the whole point. One combined assertion would either report
 * the guardrails as broken - they are not - or pass and hide the fact that two
 * of the five refusals are silent.
 *
 * EVERY CASE HERE IS NON-MUTATING. The actions are unusable, so nothing is
 * clicked that could change a record, which is what lets the Inactive and
 * Expired cases sample environment payers rather than manufacture them. An
 * Expired payer cannot be manufactured in any case: the wizard refuses an
 * expiry date before today.
 */
test.describe('Payer lifecycle guardrails - Invalid transitions', () => {
  const transitionOf = (caseId: string) =>
    INVALID_TRANSITIONS.find((candidate) => candidate.caseId === caseId)!;

  test('TC-002: should refuse the inactivation when the payer is already Inactive', async ({
    payerManagementPage,
    payerSample,
    steps,
  }) => {
    const transition = transitionOf('TC-002');
    let payerName!: string;

    await steps.critical('Navigate to the module with an Inactive payer on screen', async () => {
      [payerName] = await payerSample('Inactive', LIFECYCLE_STATUS.inactive.en, 1);
      await payerManagementPage.open();
      await payerManagementPage.search(payerName);
      await payerManagementPage.expectLifecycleStatus(payerName, LIFECYCLE_STATUS.inactive.en);
    });

    await steps.step('The Inactivate action cannot be used on this payer', async () => {
      const refusal = await payerManagementPage.expectRowActionUnavailable(payerName, 'inactivate');
      expect(
        refusal,
        'the refusal should be made the way it was observed to be made',
      ).toBe(transition.refusedBy);
    });

    await steps.step('The refusal is explained to the user', async () => {
      // FAILS, and reports a real gap. The row simply has no Inactivate button,
      // so there is nowhere for the "only an active payer can be inactivated"
      // message the sheet requires to appear - no title, no toast, no dialog.
      // The transition is impossible but unexplained.
      const message = await payerManagementPage.getRowActionMessage(payerName, 'inactivate');
      expect(
        message,
        'the refusal should state that only an active payer can be inactivated',
      ).not.toBe('');
    });

    await steps.step('The payer is still Inactive', () =>
      payerManagementPage.expectLifecycleStatus(payerName, LIFECYCLE_STATUS.inactive.en));
  });

  test('TC-004: should refuse the activation when the payer is already Active', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    const transition = transitionOf('TC-004');

    await steps.critical('Navigate to the module with an Active payer on screen', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });

    await steps.step('The Activate action cannot be used on this payer', async () => {
      const refusal = await payerManagementPage.expectRowActionUnavailable(
        publishedPayer.nameEn,
        'activate',
      );
      expect(refusal, 'the refusal should be made as observed').toBe(transition.refusedBy);
    });

    await steps.step('The refusal is explained to the user', async () => {
      // FAILS for the same reason as TC-002: an active payer's row carries no
      // Activate button at all, so the "only an inactive payer can be
      // activated" message has nowhere to appear.
      const message = await payerManagementPage.getRowActionMessage(
        publishedPayer.nameEn,
        'activate',
      );
      expect(
        message,
        'the refusal should state that only an inactive payer can be activated',
      ).not.toBe('');
    });

    await steps.step('The payer is still Active', () =>
      payerManagementPage.expectLifecycleStatus(publishedPayer.nameEn, LIFECYCLE_STATUS.active.en));
  });

  /**
   * TC-005 and TC-007 drive the SAME control on purpose.
   *
   * The application has no separate Reactivate action - Activate serves both,
   * and its own confirmation dialog says so ("Do you want to reactivate this
   * payer?"). The sheet asks for activation and reactivation of an expired
   * payer as two cases, so both are kept: if a future build separates them, the
   * case that no longer applies will fail here instead of quietly disappearing.
   */
  for (const caseId of ['TC-005', 'TC-007'] as const) {
    const attempt = caseId === 'TC-005' ? 'activated' : 'reactivated';

    test(`${caseId}: should refuse and explain when an Expired payer is ${attempt}`, async ({
      payerManagementPage,
      payerSample,
      steps,
    }) => {
      const transition = transitionOf(caseId);
      let payerName!: string;

      await steps.critical('Navigate to the module with an Expired payer on screen', async () => {
        [payerName] = await payerSample('Expired', LIFECYCLE_STATUS.expired.en, 1);
        await payerManagementPage.open();
        await payerManagementPage.search(payerName);
        await payerManagementPage.expectLifecycleStatus(payerName, LIFECYCLE_STATUS.expired.en);
      });

      await steps.step('The system evaluates the expired state and withholds the action', async () => {
        const refusal = await payerManagementPage.expectRowActionUnavailable(payerName, 'activate');
        // DISABLED rather than absent, and the difference carries the whole
        // case: a disabled button is still on screen, so it can hold the
        // explanation an omitted one cannot.
        expect(refusal, 'an expired payer should offer a disabled Activate action').toBe(
          transition.refusedBy,
        );
      });

      await steps.step('The refusal tells the user to update the expiry date first', async () => {
        const message = await payerManagementPage.getRowActionMessage(payerName, 'activate');
        expect(
          message,
          'the guardrail message should be rendered in full, not truncated or partly translated',
        ).toBe(EXPIRY_GUARDRAIL_MESSAGE.en);
      });

      await steps.step('The payer is still Expired', () =>
        payerManagementPage.expectLifecycleStatus(payerName, LIFECYCLE_STATUS.expired.en));
    });
  }

  test('TC-006: should refuse and explain when an Expired payer is inactivated', async ({
    payerManagementPage,
    payerSample,
    steps,
  }) => {
    const transition = transitionOf('TC-006');
    let payerName!: string;

    await steps.critical('Navigate to the module with an Expired payer on screen', async () => {
      [payerName] = await payerSample('Expired', LIFECYCLE_STATUS.expired.en, 1);
      await payerManagementPage.open();
      await payerManagementPage.search(payerName);
      await payerManagementPage.expectLifecycleStatus(payerName, LIFECYCLE_STATUS.expired.en);
    });

    await steps.step('The system evaluates the expired state and withholds the action', async () => {
      const refusal = await payerManagementPage.expectRowActionUnavailable(payerName, 'inactivate');
      expect(refusal, 'the refusal should be made as observed').toBe(transition.refusedBy);
    });

    await steps.step('The refusal tells the user to extend the expiry date first', async () => {
      // FAILS. The expiry guidance exists only on the disabled Activate action;
      // Inactivate is omitted from an expired payer's row entirely, so the
      // "extend the expiry date first" message the sheet requires here never
      // appears. Worth reporting precisely because the message the story wants
      // is already written elsewhere in the same row.
      const message = await payerManagementPage.getRowActionMessage(payerName, 'inactivate');
      expect(
        message,
        'the refusal should tell the user to extend the expiry date before deactivating',
      ).not.toBe('');
    });

    await steps.step('The payer is still Expired', () =>
      payerManagementPage.expectLifecycleStatus(payerName, LIFECYCLE_STATUS.expired.en));
  });
});
