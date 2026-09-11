import { test, expect } from '../../../fixtures';
import type { PayerFormDialog } from '../../../pages/payer/PayerFormDialog';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { buildUniquePayer } from '../../../data/payers/payer.data';
import {
  CATALOGUE_REQUEST_PATTERN,
  COUNTRY_SEARCH,
  LEGACY_COUNTRIES,
  NON_LEGACY_COUNTRY,
  PRE_SELECTED_COUNTRY,
  UNLISTED_COUNTRY,
} from '../../../data/payers/countryCatalogue.data';

/**
 * User story: Select Country from the Central Country Catalogue.
 *
 * The story asks whether the Country field was migrated off its hard-coded
 * three-country list onto the central catalogue in Terminology Management. The
 * answer this environment gives is no - it offers exactly the legacy three, and
 * Egypt, the sheet's own example of a non-legacy entry, is not selectable. That
 * was established by the creation-validation story before this one was written;
 * see countryCatalogue.data.ts. These cases assert the story's requirement and
 * name what is actually offered when it fails, so the day the migration lands
 * they begin passing untouched.
 *
 * TC-002 of the sheet's set (no default pre-selected) is NOT repeated here - it
 * is already covered, and already failing, as TC-011 of the creation-validation
 * story.
 */
test.describe('Country catalogue', () => {
  test('TC-001: should offer a country outside the legacy set when the catalogue is central', async ({
    payerManagementPage,
    steps,
  }) => {
    const payer = buildUniquePayer();
    let form!: PayerFormDialog;
    let offered: string[] = [];

    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    await steps.critical('The creation form opens on the step holding Country', async () => {
      form = await payerManagementPage.openCreateForm();
      await form.fillBasicInformation(payer);
      await form.clickNext();
      await form.expectFieldPresent('Country');
    });

    await steps.step('The Country dropdown lists the catalogue', async () => {
      offered = await form.getDropdownOptions('Country');
      expect(offered, 'the dropdown should offer countries to choose from').not.toEqual([]);
    });

    await steps.step(`A country outside the legacy set - "${NON_LEGACY_COUNTRY}" - is selectable`, async () => {
      // The story's requirement, stated as the sheet states it. It fails here,
      // and the message carries the whole list so the finding is actionable
      // without re-running anything.
      expect(
        offered,
        `the catalogue should reach beyond the legacy three; the field offered: `
          + `${offered.join(', ') || '(nothing)'}`,
      ).toContain(NON_LEGACY_COUNTRY);
      await form.selectDropdownOption('Country', NON_LEGACY_COUNTRY);
    });

    await steps.step('And the chosen country is applied to the form', async () => {
      expect(
        await form.getDropdownValue('Country'),
        'the selection should be shown in the field',
      ).toContain(NON_LEGACY_COUNTRY);
      await form.closeAndDiscard();
    });
  });

  test('TC-002: should refuse an unlisted country when one is submitted directly', async ({
    page,
    payerManagementPage,
    steps,
  }) => {
    const payer = buildUniquePayer();
    let outcome!: { status: number; text: string; validationErrors: string[] };

    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    await steps.critical('A creation payload carrying an unlisted country is sent', async () => {
      // Sent on the wire, because the interface offers no way to type a country
      // at all - it is a closed dropdown. The sheet asks for "direct API
      // injection" and this is it, using the signed-in session so a rejection
      // cannot be confused with a 401.
      outcome = await NetworkUtils.postAsSession(page, ApiEndpoints.payerCreate, {
        nameEn: payer.nameEn,
        nameAr: payer.nameAr,
        email: payer.email,
        country: UNLISTED_COUNTRY,
      });
      expect(outcome.status, 'the request should have reached the server').toBeGreaterThan(0);
    });

    await steps.step('The server rejects it rather than storing the value', async () => {
      expect(
        outcome.status,
        `an unlisted country must not be accepted; the server answered ${outcome.status}: `
          + `${outcome.text.slice(0, 300)}`,
      ).toBeGreaterThanOrEqual(400);
    });

    await steps.step('The rejection identifies the country as the problem', async () => {
      // A 400 that says nothing about which field failed is a worse answer than
      // one that names it, and the story asks for a validation error - so the
      // response is checked for the field, not just for the status.
      const said = `${outcome.validationErrors.join(' ')} ${outcome.text}`.toLowerCase();
      expect(
        said.includes('country'),
        `the rejection should name the Country field; it said: `
          + `${outcome.validationErrors.join(' | ') || outcome.text.slice(0, 300)}`,
      ).toBe(true);
    });

    await steps.step('And no payer was created with that country', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(payer.nameEn);
      await payerManagementPage.expectRowNotVisible(payer.nameEn);
    });
  });

  test('TC-003: should accept both the first and the last entry the catalogue lists', async ({
    payerManagementPage,
    steps,
  }) => {
    const payer = buildUniquePayer();
    let form!: PayerFormDialog;
    let offered: string[] = [];

    await steps.critical('Navigate to the module and open the creation form', async () => {
      await payerManagementPage.open();
      form = await payerManagementPage.openCreateForm();
      await form.fillBasicInformation(payer);
      await form.clickNext();
    });

    await steps.critical('The catalogue list is read in the order it renders', async () => {
      offered = await form.getDropdownOptions('Country');
      expect(offered.length, 'there should be a list to take boundaries from').toBeGreaterThan(0);
    });

    await steps.step('The first entry in the list is selectable', async () => {
      // The boundaries of the rendered list, whatever it holds - so this case
      // keeps testing the boundary as the catalogue grows, instead of pinning
      // two country names that a catalogue change would invalidate.
      await form.selectDropdownOption('Country', offered[0]);
      expect(
        await form.getDropdownValue('Country'),
        `the first entry ("${offered[0]}") should be selectable`,
      ).toContain(offered[0]);
    });

    await steps.step('The last entry in the list is selectable too', async () => {
      const last = offered[offered.length - 1];
      await form.selectDropdownOption('Country', last);
      expect(
        await form.getDropdownValue('Country'),
        `the last entry ("${last}") should be selectable`,
      ).toContain(last);
      await form.closeAndDiscard();
    });
  });

  test('TC-004: should never let a payer be submitted without a country', async ({
    payerManagementPage,
    steps,
  }) => {
    const payer = buildUniquePayer();
    let form!: PayerFormDialog;

    await steps.critical('Navigate to the module and open the creation form', async () => {
      await payerManagementPage.open();
      form = await payerManagementPage.openCreateForm();
      await form.fillBasicInformation(payer);
      await form.clickNext();
    });

    await steps.step('Country already carries a value before anything is chosen', async () => {
      // The sheet's precondition - "complete every field except Country" - is
      // unreachable: the wizard pre-selects a country, so the field is never
      // blank and no required-field message can be provoked. Recorded here
      // rather than worked around, because it is the reason the next step
      // asserts what it does.
      expect(
        await form.getDropdownValue('Country'),
        'the wizard pre-selects a country rather than leaving it blank',
      ).toContain(PRE_SELECTED_COUNTRY);
    });

    await steps.step('The Country control offers no empty option to choose', async () => {
      // The guarantee that actually holds, and it is the stronger one: there is
      // no way to put the field back to nothing, so a payer cannot reach the
      // server without a country. Weaker in one respect, which the message
      // records: the user can leave the default in place without ever choosing.
      const offered = await form.getDropdownOptions('Country');
      const blanks = offered.filter((option) => option.trim() === '' || /^select/i.test(option));
      expect(
        blanks,
        `the list should offer no way to clear the field; it offered: ${offered.join(', ')}`,
      ).toEqual([]);
    });

    await steps.step('And the payer saves with a country attached', async () => {
      await form.clickNext();
      await form.fillEffectivePeriod(payer);
      await form.save();
      await payerManagementPage.open();
      await payerManagementPage.search(payer.nameEn);
      await payerManagementPage.waitForRowVisible(payer.nameEn);
      const detail = await payerManagementPage.openDetails(payer.nameEn);
      expect(
        await detail.getFieldValue('Country'),
        'the stored payer should carry a country',
      ).not.toBe('');
    });
  });

  test('TC-005: should fetch the country list from a service rather than compile it in', async ({
    page,
    payerManagementPage,
    steps,
  }) => {
    const payer = buildUniquePayer();
    let form!: PayerFormDialog;
    let requestUrl: string | null = null;

    await steps.critical('Navigate to the module and open the creation form', async () => {
      await payerManagementPage.open();
      form = await payerManagementPage.openCreateForm();
      await form.fillBasicInformation(payer);
      await form.clickNext();
    });

    await steps.step('Opening the dropdown asks a service for the catalogue', async () => {
      // The substantive form of the sheet's "reflects real-time updates from
      // Terminology Management". Adding a country to the shared catalogue to
      // watch it appear would mutate reference data every other test depends
      // on, with no teardown for it - see countryCatalogue.data.ts. A list that
      // is FETCHED tracks the catalogue by construction; a hard-coded one
      // cannot, and that is the difference this story turns on.
      requestUrl = await NetworkUtils.captureRequestUrl(
        page,
        CATALOGUE_REQUEST_PATTERN,
        () => form.getDropdownOptions('Country').then(() => undefined),
      );
      expect(
        requestUrl,
        'the country list should come from a lookup service, not from the bundle',
      ).not.toBeNull();
    });

    await steps.step('And the list it renders is the one the service returned', async () => {
      const offered = await form.getDropdownOptions('Country');
      expect(
        offered,
        `the dropdown should render the fetched catalogue; request: ${requestUrl}`,
      ).not.toEqual([]);
      await form.closeAndDiscard();
    });
  });

  test('TC-006: should offer the whole catalogue rather than the legacy three countries', async ({
    payerManagementPage,
    steps,
  }) => {
    const payer = buildUniquePayer();
    let form!: PayerFormDialog;
    let offered: string[] = [];

    await steps.critical('Navigate to the module and open the creation form', async () => {
      await payerManagementPage.open();
      form = await payerManagementPage.openCreateForm();
      await form.fillBasicInformation(payer);
      await form.clickNext();
    });

    await steps.critical('The Country dropdown lists what it has', async () => {
      offered = await form.getDropdownOptions('Country');
      expect(offered, 'the dropdown should list something').not.toEqual([]);
    });

    await steps.step('The list is not merely the legacy set', async () => {
      // THE STORY'S CENTRAL QUESTION, and it fails: the field offers exactly
      // the three countries it offered before the migration. Asserted as
      // "more than the legacy set" rather than against a specific expected
      // catalogue, because the catalogue's contents are Terminology
      // Management's business - the only thing this story requires is that the
      // payer form is no longer limited to its old hard-coded list.
      const beyondLegacy = offered.filter(
        (country) => !LEGACY_COUNTRIES.some((legacy) => country.includes(legacy)),
      );
      expect(
        beyondLegacy,
        `the catalogue should reach beyond ${LEGACY_COUNTRIES.join(', ')}; the field offered `
          + `exactly: ${offered.join(', ')}`,
      ).not.toEqual([]);
    });

    await steps.step('And every legacy country is still available', async () => {
      // The other half, so a migration that dropped the old values would not
      // pass this case either.
      const missing = LEGACY_COUNTRIES.filter(
        (legacy) => !offered.some((country) => country.includes(legacy)),
      );
      expect(
        missing,
        `no country should have been lost in the migration; offered: ${offered.join(', ')}`,
      ).toEqual([]);
      await form.closeAndDiscard();
    });
  });
});
