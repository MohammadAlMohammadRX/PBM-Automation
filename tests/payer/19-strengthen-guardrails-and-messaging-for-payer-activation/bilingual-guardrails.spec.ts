import { test, expect } from '../../../fixtures';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import {
  EXPIRY_GUARDRAIL_MESSAGE,
  INACTIVATION_REASONS_AR,
} from '../../../data/payers/lifecycleGuardrails.data';

/**
 * User story: Strengthen Guardrails and Messaging for Payer Activation,
 * Inactivation and Reactivation.
 * The guardrails in the secondary language.
 *
 * THE ROWS ARE ADDRESSED BY PAYER CODE HERE, NOT BY NAME. In Arabic the list
 * renders each payer's Arabic name, so a search for an English name returns
 * nothing and the case fails on its precondition rather than on the guardrail.
 * The Payer Code is the same string in both languages, which makes it the only
 * safe handle for a bilingual case - a lesson this suite has learned more than
 * once.
 *
 * WHAT THIS CASE CAN AND CANNOT CHECK. Two of the refusals carry no message in
 * either language - the action is simply absent, see invalid-transitions.spec -
 * so "the message displays correctly in Arabic" is not answerable for them; it
 * is their absence in ENGLISH that is the finding, and reporting it twice would
 * inflate one defect into two. What is checked here is everything the Arabic UI
 * does render for these flows: the guardrail message that exists, the status
 * vocabulary the refusal is read against, and the inactivation drawer the valid
 * transition uses.
 */
test.describe('Payer lifecycle guardrails - Secondary language', () => {
  test('TC-016: should render the lifecycle guardrails and drawer in Arabic when the interface language is switched', async ({
    payerManagementPage,
    payerInactivateDialog,
    payerSample,
    publishedPayer,
    steps,
  }) => {
    let expiredCode!: string;
    let activeCode!: string;

    await steps.critical('Navigate to the module and note the payers by code', async () => {
      const [expiredPayer] = await payerSample('Expired', LIFECYCLE_STATUS.expired.en, 1);
      await payerManagementPage.open();
      await payerManagementPage.search(expiredPayer);
      expiredCode = await payerManagementPage.getPayerCode(expiredPayer);

      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      activeCode = await payerManagementPage.getPayerCode(publishedPayer.nameEn);
    });

    await steps.critical('Switch the interface to the secondary language', async () => {
      await payerManagementPage.language().switchTo('ar');
      await payerManagementPage.open();
      await payerManagementPage.expectRowsRendered();
    });

    await steps.step('An expired payer still refuses activation, and says why in Arabic', async () => {
      await payerManagementPage.search(expiredCode);
      await payerManagementPage.expectLifecycleStatus(expiredCode, LIFECYCLE_STATUS.expired.ar);

      const refusal = await payerManagementPage.expectRowActionUnavailable(
        expiredCode,
        'activate',
      );
      expect(refusal, 'the guardrail should work the same way in either language').toBe('disabled');
      expect(
        await payerManagementPage.getRowActionMessage(expiredCode, 'activate'),
        'the guardrail message should be fully translated, not partly left in English',
      ).toBe(EXPIRY_GUARDRAIL_MESSAGE.ar);
    });

    await steps.step('The inactivate action is still withheld from an expired payer', () =>
      payerManagementPage
        .expectRowActionUnavailable(expiredCode, 'inactivate')
        .then((refusal) => {
          expect(refusal, 'the action should be withheld in Arabic as it is in English').toBe(
            'absent',
          );
        }));

    await steps.step('The valid transition offers a fully translated drawer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(activeCode);
      await payerManagementPage.expectLifecycleStatus(activeCode, LIFECYCLE_STATUS.active.ar);

      await payerManagementPage.inactivateRow(activeCode);
      await payerInactivateDialog.expectReasonAndDetailsOffered();
      // The managed reason list is the part most likely to be left untranslated
      // - it comes from a lookup table rather than the interface's own strings -
      // so it is asserted item by item and in order.
      expect(
        await payerInactivateDialog.getReasonOptions(),
        'every managed reason should be offered in Arabic, in the same order',
      ).toEqual([...INACTIVATION_REASONS_AR]);
    });

    await steps.step('Nothing is left staged and the interface is returned to English', async () => {
      await payerInactivateDialog.cancel();
      await payerManagementPage.language().switchTo('en');
      await payerManagementPage.open();
      await payerManagementPage.search(activeCode);
      await payerManagementPage.expectLifecycleStatus(activeCode, LIFECYCLE_STATUS.active.en);
    });
  });
});
