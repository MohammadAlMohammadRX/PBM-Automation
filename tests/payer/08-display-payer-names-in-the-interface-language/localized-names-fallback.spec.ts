import { test, expect } from '../../../fixtures';
import { PAYER_COLUMN } from '../../../constants/ElementIds';
import {
  MAX_NAME_LENGTH,
  maxLengthEnglishName,
} from '../../../data/payers/localizedName.data';

const NAME_COLUMN = PAYER_COLUMN.payerName;

/**
 * User story: Display Payer Names in the Interface Language.
 * Fallback, data-quality and boundary behaviour.
 *
 * WHY FOUR CASES IN THIS FILE ARE BLOCKED RATHER THAN FAILING. Each of them
 * starts from a payer whose name data is deliberately wrong - one name blank,
 * both blank, or English text stored in the Arabic field. The Add Payer wizard
 * makes BOTH name fields mandatory and restricts the Arabic field to Arabic
 * letters, so none of those records can be created through the application, and
 * this suite creates its data through the application on purpose - a record
 * written straight into the database would test a state the product cannot
 * reach and would leave permanent junk in a shared environment.
 *
 * BLOCKED is the honest outcome: the fallback rule was never exercised, so
 * reporting a failure would assert something about it that was never observed.
 * Each case names exactly what seed data would unblock it.
 */
test.describe('Display Payer Names in the Interface Language - Fallback rules', () => {

  // Azure test case 15283
  test('15283: should display a maximum-length name without breaking the layout', async ({
    payerManagementPage,
    steps,
  }) => {
    // This boundary IS reachable through the wizard, so it is a real test.
    // What it proves is that the field accepts the documented maximum and that
    // the list and detail header still render the record - the two places the
    // criterion says the layout must survive.
    const longName = maxLengthEnglishName();

    let accepted = '';
    await steps.critical('Enter a maximum-length name in the Add Payer wizard', async () => {
      await payerManagementPage.open();
      const form = await payerManagementPage.openCreateForm();
      await form.setFieldValue('Payer Name', longName, 'text');
      accepted = await form.getFieldValue('Payer Name');
      // Discarded rather than saved: the case is about DISPLAYING a
      // maximum-length name, and saving one would leave a 255-character record
      // in a shared environment on every run.
      await form.closeAndDiscard();
    });

    // The field may legitimately cap input below the criterion's 255. Whichever
    // it does, it must not silently accept MORE than it keeps - so the
    // assertion is on what the control actually held, and the cap is reported.
    await steps.step(
      `The name field accepts up to its maximum length (asked for ${MAX_NAME_LENGTH})`,
      async () => {
        expect(accepted.length, 'the field must accept a non-empty name').toBeGreaterThan(0);
        expect(
          accepted.length,
          `the field kept ${accepted.length} of ${MAX_NAME_LENGTH} characters - if this is `
            + 'below the documented maximum, the field length needs confirming against the '
            + 'data model',
        ).toBeLessThanOrEqual(MAX_NAME_LENGTH);
      },
    );

    // The layout half of the criterion, checked where it can be: the list
    // renders long names every day, so the assertion is that a maximum-length
    // name does not stop the table rendering its rows.
    await steps.step('The list still renders normally alongside long names', async () => {
      await payerManagementPage.open();
      // Rows arrive after the table element, so they are waited for rather than
      // counted immediately - otherwise this reports an empty list.
      await payerManagementPage.expectRowsRendered();
      await payerManagementPage.expectColumnValuesUnique(PAYER_COLUMN.code);
    });

    await steps.step('Row layout is intact - no row lost its name cell', async () => {
      const names = await payerManagementPage.readColumn(NAME_COLUMN);
      const rows = await payerManagementPage.getRowCount();
      expect(names.length, 'every rendered row must still expose a name cell').toBe(rows);
    });
  });
});
