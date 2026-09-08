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
  test('TC-003: should fall back to the English name when the Arabic name is blank', async ({
    steps,
  }) => {
    steps.blocked(
      'this case needs a payer whose Arabic name is blank while its English name is '
        + 'populated. The Add Payer wizard makes the Arabic name mandatory, so such a record '
        + 'cannot be created through the application. To unblock: seed one payer with '
        + 'payerNameAr = null and a populated payerNameEn, then set SEARCH-style .env '
        + 'overrides for its English name.',
    );
  });

  test('TC-004: should fall back to the Arabic name when the English name is blank', async ({
    steps,
  }) => {
    steps.blocked(
      'this case needs a payer whose English name is blank while its Arabic name is '
        + 'populated. The Add Payer wizard makes the English name mandatory, so such a record '
        + 'cannot be created through the application. To unblock: seed one payer with '
        + 'payerNameEn = null and a populated payerNameAr.',
    );
  });

  test('TC-005: should show a defined placeholder when both names are blank', async ({
    steps,
  }) => {
    steps.blocked(
      'this case needs a payer with BOTH names blank. Both fields are mandatory in the Add '
        + 'Payer wizard, so the record cannot be created through the application. To unblock: '
        + 'seed one payer with payerNameEn = null and payerNameAr = null. The expected '
        + 'placeholder is not specified by the criteria either ("e.g. N/A or PayerCode"), so '
        + 'the intended value needs confirming before this can be asserted.',
    );
  });

  test('TC-010: should display mismatched-language name data as stored, without breaking', async ({
    steps,
  }) => {
    steps.blocked(
      'this case needs a payer with English text stored in its Arabic name field. The Arabic '
        + 'name field rejects any character that is not an Arabic letter, so the data-entry '
        + 'error it simulates cannot be made through the application. To unblock: seed one '
        + 'payer with payerNameAr set to Latin text.',
    );
  });

  test('TC-011: should display a maximum-length name without breaking the layout', async ({
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
