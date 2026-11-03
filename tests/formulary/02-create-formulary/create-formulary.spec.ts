import { test, expect } from '../../../fixtures';
import type { FormularyFormDrawer } from '../../../pages/formulary/FormularyFormDrawer';
import type { FormularyManagementPage } from '../../../pages/formulary/FormularyManagementPage';
import {
  APPROVAL_STATUS,
  CODE_PATTERN,
  FORMULARY_STATUS,
  FORMULARY_SUITE,
  INJECTION,
  MESSAGE,
  SAFE_TEXT,
  textOfLength,
} from '../../../data/formulary/formulary.data';
import { CASES, dateIn, englishNameOfLength, suiteName } from '../../../data/formulary/createFormulary.data';
import { assignPlanFormulary } from '../../../utils/formulary/writerAHelpers';
import { payerIdByName } from '../../../utils/NetworkProvisioning';
import { addTier, addTrade, findFormularyByName } from '../../../utils/FormularyProvisioning';

/** Opens the list under the suite payer's scope and the Add Formulary drawer on step 1. */
async function openAddDrawer(list: FormularyManagementPage): Promise<FormularyFormDrawer> {
  await list.open();
  await list.scopeTo(FORMULARY_SUITE.payerName);
  return list.openAddForm();
}

/** Puts the suite payer in the drawer when it is not already there (a precondition, not the case under test). */
async function ensureSuitePayer(drawer: FormularyFormDrawer): Promise<void> {
  if ((await drawer.readPayer()) !== FORMULARY_SUITE.payerName) await drawer.choosePayer(FORMULARY_SUITE.payerName);
}

/** Fills a valid step 1 and moves to step 2. */
async function validStepOne(drawer: FormularyFormDrawer, nameEn: string): Promise<boolean> {
  await drawer.fillBasicInfo({ nameEn, nameAr: SAFE_TEXT.nameAr });
  await ensureSuitePayer(drawer);
  return drawer.next();
}

/**
 * User story 15192: Create Formulary.
 * The two-step Add Formulary drawer: valid creation as a Draft linked to the
 * current payer, the name / description limits and scripts, mandatory fields,
 * the effective period rules, the generated code, the read-only payer, and
 * values kept between steps.
 */
test.describe('US 15192 - Create Formulary', () => {
  test(`TC-${CASES.happyPath.azureId}: should save a Draft formulary with no permanent code linked to the current payer when both steps are completed with valid data`, async ({
    formularyManagementPage,
    discardFormularyNamed,
    steps,
  }) => {
    const data = CASES.happyPath;
    const name = suiteName(data.label);
    let drawer: FormularyFormDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
    });

    await steps.critical('Select "Create Formulary" - step 1 "Basic Information" is displayed', async () => {
      drawer = await openAddDrawer(formularyManagementPage);
      expect(await drawer.currentStep()).toBe(1);
    });

    await steps.critical(`Enter English name "${name}", Arabic name "${data.nameAr}", no descriptions, then Next - step 2 "Effective Period" is displayed`, async () => {
      await drawer.fillBasicInfo({ nameEn: name, nameAr: data.nameAr });
      await ensureSuitePayer(drawer);
      expect(await drawer.next(), (await drawer.getMessages()).join(' | ')).toBe(true);
    });

    await steps.critical('Enter an effective date of tomorrow and an expiry date one year later, then submit - the formulary is saved', async () => {
      discardFormularyNamed(name);
      await drawer.fillPeriod({ effectiveDate: data.effective(), expiryDate: data.expiry() });
      const answer = await drawer.attemptSave();
      expect(answer.status, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBeGreaterThanOrEqual(200);
      expect(answer.status).toBeLessThan(300);
    });

    await steps.step('The formulary is listed with Approval Status "Draft", no permanent code, linked to the current payer', async () => {
      const row = await formularyManagementPage.readRow(name);
      expect(row.approvalStatus).toMatch(new RegExp(`${APPROVAL_STATUS.draft}$`));
      expect(row.code, 'no permanent formulary code before approval').not.toMatch(CODE_PATTERN.permanent);
      expect(row.payer, 'the current payer').toBe(FORMULARY_SUITE.payerName);
    });
  });

  test(`TC-${CASES.nameAt255.azureId}: should accept an English name of exactly 255 characters and move to step 2`, async ({
    formularyManagementPage,
    steps,
  }) => {
    const name = englishNameOfLength(CASES.nameAt255.length);
    let drawer: FormularyFormDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
    });

    await steps.critical('Select "Create Formulary" - step 1 is displayed', async () => {
      drawer = await openAddDrawer(formularyManagementPage);
      expect(await drawer.currentStep()).toBe(1);
    });

    await steps.step('Enter an English name of exactly 255 English letters - the field keeps the full text without truncation', async () => {
      await drawer.type('nameEn', name);
      expect((await drawer.getValue('nameEn')).length).toBe(CASES.nameAt255.length);
    });

    await steps.step('Complete the remaining mandatory fields and proceed - step 2 is shown', async () => {
      await drawer.type('nameAr', SAFE_TEXT.nameAr);
      await ensureSuitePayer(drawer);
      expect(await drawer.next(), (await drawer.getMessages()).join(' | ')).toBe(true);
    });
  });

  test(`TC-${CASES.nameAt256.azureId}: should reject an English name longer than 255 characters with a maximum-length message`, async ({
    formularyManagementPage,
    steps,
  }) => {
    const data = CASES.nameAt256;
    let drawer: FormularyFormDrawer;
    let kept = '';

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
    });

    await steps.critical('Select "Create Formulary" - step 1 is displayed', async () => {
      drawer = await openAddDrawer(formularyManagementPage);
      expect(await drawer.currentStep()).toBe(1);
    });

    await steps.step('Enter 256 English letters - the field prevents further input or flags the value as too long', async () => {
      await drawer.type('nameEn', englishNameOfLength(data.length));
      kept = await drawer.getValue('nameEn');
      const error = await drawer.getFieldError('nameEn');
      expect(kept.length <= data.limit || MESSAGE.maxLength.test(error), `kept ${kept.length} characters; error "${error}"`).toBe(true);
    });

    await steps.step('Attempting to proceed is blocked with a maximum-length validation message', async () => {
      await drawer.type('nameAr', SAFE_TEXT.nameAr);
      await ensureSuitePayer(drawer);
      const moved = await drawer.next();
      const messages = (await drawer.getMessages()).join(' | ');
      // A field that stopped at 255 never held the 256-character name (see the data file).
      expect(kept.length <= data.limit || (!moved && MESSAGE.maxLength.test(messages)), `moved: ${moved}; messages: ${messages}`).toBe(true);
    });
  });

  for (const [key, field, other, rule] of [
    ['arabicInEnglish', 'nameEn', 'nameAr', MESSAGE.englishOnly],
    ['englishInArabic', 'nameAr', 'nameEn', MESSAGE.arabicOnly],
  ] as const) {
    const data = CASES[key];
    const language = field === 'nameEn' ? 'English' : 'Arabic';
    test(`TC-${data.azureId}: should refuse "${data.value}" in the ${language} formulary name and block step 2 with a ${language}-letters-only message`, async ({
      formularyManagementPage,
      steps,
    }) => {
      let drawer: FormularyFormDrawer;

      await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
        await formularyManagementPage.open();
      });

      await steps.critical('Select "Create Formulary" - step 1 is displayed', async () => {
        drawer = await openAddDrawer(formularyManagementPage);
        expect(await drawer.currentStep()).toBe(1);
      });

      await steps.step(`Enter "${data.value}" into the ${language} Formulary Name - the field rejects the characters or flags an invalid format`, async () => {
        await drawer.type(field, data.value);
        const kept = await drawer.getValue(field);
        const error = await drawer.getFieldError(field);
        expect(kept !== data.value || rule.test(error), `kept "${kept}"; error "${error}"`).toBe(true);
      });

      await steps.step(`Attempting to proceed is blocked with a message that only ${language} letters are allowed`, async () => {
        await drawer.type(other, other === 'nameAr' ? SAFE_TEXT.nameAr : suiteName('Language'));
        await ensureSuitePayer(drawer);
        expect(await drawer.next(), 'step 2 must not open').toBe(false);
        expect((await drawer.getMessages()).join(' | ')).toMatch(rule);
      });
    });
  }

  test(`TC-${CASES.namesRequired.azureId}: should block step 2 until both the English and the Arabic names are given`, async ({
    formularyManagementPage,
    steps,
  }) => {
    let drawer: FormularyFormDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
    });

    await steps.critical('Select "Create Formulary" - step 1 is displayed', async () => {
      drawer = await openAddDrawer(formularyManagementPage);
      await ensureSuitePayer(drawer);
      expect(await drawer.currentStep()).toBe(1);
    });

    await steps.step('English name blank, Arabic name filled, Next - blocked with the English name flagged as required', async () => {
      await drawer.fillBasicInfo({ nameEn: '', nameAr: SAFE_TEXT.nameAr });
      expect(await drawer.next()).toBe(false);
      expect(await drawer.getFieldError('nameEn')).toMatch(MESSAGE.required);
    });

    await steps.step('English name filled, Arabic name blank, Next - blocked with the Arabic name flagged as required', async () => {
      await drawer.fillBasicInfo({ nameEn: suiteName('Required'), nameAr: '' });
      expect(await drawer.next()).toBe(false);
      expect(await drawer.getFieldError('nameAr')).toMatch(MESSAGE.required);
    });

    await steps.step('Both names filled, Next - step 2 is shown', async () => {
      await drawer.fillBasicInfo({ nameAr: SAFE_TEXT.nameAr });
      expect(await drawer.next(), (await drawer.getMessages()).join(' | ')).toBe(true);
    });
  });

  test(`TC-${CASES.payerAutoFilled.azureId}: should prefill the owning payer with the current payer and not let it be changed when a formulary is created`, async ({
    formularyManagementPage,
    steps,
  }) => {
    let drawer: FormularyFormDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
    });

    await steps.critical('Select "Create Formulary" - step 1 is displayed', async () => {
      drawer = await openAddDrawer(formularyManagementPage);
      expect(await drawer.currentStep()).toBe(1);
    });

    await steps.step(`The Payer Name field is prefilled with the current payer "${FORMULARY_SUITE.payerName}" and read-only`, async () => {
      expect(await drawer.readPayer(), 'the prefilled payer').toBe(FORMULARY_SUITE.payerName);
      expect(await drawer.isPayerEditable(), 'the payer must not be selectable').toBe(false);
    });

    await steps.step('Attempting to change the Payer Name leaves it unchanged', async () => {
      await drawer.choosePayer(CASES.payerAutoFilled.otherPayer).catch(() => undefined);
      expect(await drawer.readPayer()).toBe(FORMULARY_SUITE.payerName);
    });
  });

  test(`TC-${CASES.effectiveNotPast.azureId}: should refuse an effective date in the past and accept today's date`, async ({
    formularyManagementPage,
    discardFormularyNamed,
    steps,
  }) => {
    const data = CASES.effectiveNotPast;
    const name = suiteName('Past Effective');
    let drawer: FormularyFormDrawer;
    discardFormularyNamed(name);

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
    });

    await steps.critical('Select "Create Formulary" and complete step 1 - step 2 "Effective Period" is displayed', async () => {
      drawer = await openAddDrawer(formularyManagementPage);
      expect(await validStepOne(drawer, name), (await drawer.getMessages()).join(' | ')).toBe(true);
    });

    await steps.step('Yesterday as the Effective Date is rejected with a cannot-be-in-the-past message', async () => {
      await drawer.fillPeriod({ effectiveDate: data.yesterday(), expiryDate: data.expiry() });
      const answer = await drawer.attemptSave();
      expect(answer.status === -1 || answer.status >= 400, `the save answered ${answer.status}`).toBe(true);
      expect([await drawer.getFieldError('effectiveDate'), ...answer.messages].join(' | ')).toMatch(MESSAGE.pastDate);
    });

    await steps.step('Today\'s date as the Effective Date is accepted', async () => {
      await drawer.fillPeriod({ effectiveDate: data.today() });
      const answer = await drawer.attemptSave();
      expect(answer.status, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBeGreaterThanOrEqual(200);
      expect(answer.status).toBeLessThan(300);
    });
  });

  test(`TC-${CASES.descriptionAt1000.azureId}: should accept a 1000-character description and refuse 1001 characters with a maximum-length message`, async ({
    formularyManagementPage,
    steps,
  }) => {
    const data = CASES.descriptionAt1000;
    let drawer: FormularyFormDrawer;
    let kept = '';

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
    });

    await steps.critical('Select "Create Formulary" - step 1 is displayed with the names completed', async () => {
      drawer = await openAddDrawer(formularyManagementPage);
      await drawer.fillBasicInfo({ nameEn: suiteName('Description'), nameAr: SAFE_TEXT.nameAr });
      await ensureSuitePayer(drawer);
      expect(await drawer.currentStep()).toBe(1);
    });

    await steps.step('Exactly 1000 characters in the English Description are accepted and the form advances', async () => {
      await drawer.type('descriptionEn', textOfLength(data.valid, 'Description text '));
      expect((await drawer.getValue('descriptionEn')).length).toBe(data.valid);
      expect(await drawer.next(), (await drawer.getMessages()).join(' | ')).toBe(true);
    });

    await steps.step('1001 characters in the English Description block progression with a maximum-length message', async () => {
      await drawer.back();
      await drawer.type('descriptionEn', textOfLength(data.invalid, 'Description text '));
      kept = await drawer.getValue('descriptionEn');
      const moved = await drawer.next();
      const messages = (await drawer.getMessages()).join(' | ');
      expect(kept.length <= data.valid || (!moved && MESSAGE.maxLength.test(messages)), `kept ${kept.length}; moved: ${moved}; messages: ${messages}`).toBe(true);
    });
  });

  test(`TC-${CASES.expiryAfterEffective.azureId}: should accept an expiry date only when it falls strictly after the effective date`, async ({
    formularyManagementPage,
    discardFormularyNamed,
    steps,
  }) => {
    const minutes = CASES.expiryAfterEffective.effectiveInMinutes;
    const name = suiteName('Expiry Rule');
    let drawer: FormularyFormDrawer;
    discardFormularyNamed(name);

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
    });

    await steps.critical('Select "Create Formulary" and complete step 1 - step 2 "Effective Period" is displayed', async () => {
      drawer = await openAddDrawer(formularyManagementPage);
      expect(await validStepOne(drawer, name), (await drawer.getMessages()).join(' | ')).toBe(true);
    });

    await steps.step('Effective today and an expiry equal to it - the expiry is rejected as it must be after the effective date', async () => {
      await drawer.fillPeriod({ effectiveDate: dateIn(minutes), expiryDate: dateIn(minutes) });
      const answer = await drawer.attemptSave();
      expect(answer.status === -1 || answer.status >= 400, `the save answered ${answer.status}`).toBe(true);
      expect([await drawer.getFieldError('expiryDate'), ...answer.messages].join(' | ')).toMatch(MESSAGE.afterEffective);
    });

    await steps.step('An expiry before the effective date is rejected with the same message', async () => {
      await drawer.fillPeriod({ expiryDate: dateIn(minutes - 24 * 60) });
      const answer = await drawer.attemptSave();
      expect(answer.status === -1 || answer.status >= 400, `the save answered ${answer.status}`).toBe(true);
      expect([await drawer.getFieldError('expiryDate'), ...answer.messages].join(' | ')).toMatch(MESSAGE.afterEffective);
    });

    await steps.step('An expiry one day after the effective date is accepted and the formulary saved', async () => {
      await drawer.fillPeriod({ expiryDate: dateIn(minutes + 24 * 60) });
      const answer = await drawer.attemptSave();
      expect(answer.status, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBeGreaterThanOrEqual(200);
      expect(answer.status).toBeLessThan(300);
    });
  });

  test(`TC-${CASES.savedAsDraft.azureId}: should keep a new formulary Draft and Not Live until it is sent for approval`, async ({
    formularyManagementPage,
    discardFormularyNamed,
    steps,
  }) => {
    const data = CASES.savedAsDraft;
    const name = suiteName('Draft Only');
    discardFormularyNamed(name);

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
    });

    await steps.critical('Select "Create Formulary", complete steps 1 and 2 with valid data and save - the formulary is created', async () => {
      const drawer = await openAddDrawer(formularyManagementPage);
      expect(await validStepOne(drawer, name)).toBe(true);
      await drawer.fillPeriod({ effectiveDate: data.effective(), expiryDate: data.expiry() });
      const answer = await drawer.attemptSave();
      expect(answer.status, answer.messages.join(' | ')).toBeLessThan(300);
    });

    await steps.step('The new record\'s Approval Status shows "Draft"', async () => {
      expect((await formularyManagementPage.readRow(name)).approvalStatus).toMatch(new RegExp(`${APPROVAL_STATUS.draft}$`));
    });

    await steps.step('Its Status is not "Active" - it stays "Not Live" until sent for approval', async () => {
      const status = (await formularyManagementPage.readRow(name)).status;
      expect(status).not.toBe(FORMULARY_STATUS.active);
      expect(status).toBe(FORMULARY_STATUS.notLive);
    });
  });

  test(`TC-${CASES.codeOnApproval.azureId}: should show a temporary code on the draft and a generated permanent code once the formulary is approved, with no code field in the form`, async ({
    formularyManagementPage,
    formularyApprovalsPage,
    discardFormularyNamed,
    page,
    steps,
  }) => {
    const data = CASES.codeOnApproval;
    const name = suiteName('Code');
    let drawer: FormularyFormDrawer;
    discardFormularyNamed(name);

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
    });

    await steps.critical('Select "Create Formulary" - step 1 is displayed', async () => {
      drawer = await openAddDrawer(formularyManagementPage);
      expect(await drawer.currentStep()).toBe(1);
    });

    await steps.step('No Formulary Code field is present in steps 1 and 2', async () => {
      expect(await drawer.hasCodeField(), 'a code control on step 1').toBe(false);
      expect(await validStepOne(drawer, name)).toBe(true);
      expect(await drawer.hasCodeField(), 'a code control on step 2').toBe(false);
    });

    await steps.critical('Save the formulary as Draft - the Code column shows a temporary code', async () => {
      await drawer.fillPeriod({ effectiveDate: data.effective(), expiryDate: data.expiry() });
      expect((await drawer.attemptSave()).status).toBeLessThan(300);
      expect((await formularyManagementPage.readRow(name)).code).toMatch(CODE_PATTERN.temporary);
    });

    await steps.step('Send it for approval and approve it - a formulary code has been generated and is displayed', async () => {
      const created = await findFormularyByName(page, name);
      expect(created, 'the saved formulary').not.toBeNull();
      expect((await addTier(page, created?.id ?? '')).status, 'a tier (needed for approval)').toBeLessThan(300);
      expect((await addTrade(page, created?.id ?? '')).status, 'a trade (needed for approval)').toBeLessThan(300);
      await formularyManagementPage.open();
      expect((await formularyManagementPage.sendForApproval(name)).status).toBeLessThan(300);
      await formularyApprovalsPage.open();
      await formularyApprovalsPage.approve(name);
      await formularyManagementPage.open();
      expect((await formularyManagementPage.readRow(name)).code, 'the permanent code').toMatch(CODE_PATTERN.permanent);
    });
  });

  test(`TC-${CASES.payerLockedByPlan.azureId}: should keep the owning payer locked and the formulary restricted to that payer's plans once a plan is assigned to it`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyIn,
    planIn,
    page,
    steps,
  }) => {
    test.setTimeout(20 * 60_000);
    const formulary = await formularyIn('Active');
    await planIn('Active', { formularyId: formulary.id });
    const foreignPlan = await planIn('Draft', { payerName: CASES.payerLockedByPlan.otherPayer, noFormulary: true });

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
    });

    await steps.critical(`Open the approved formulary that has a plan assigned - its Owning Payer is "${FORMULARY_SUITE.payerName}"`, async () => {
      await formularyDetailPage.open(formulary.id);
      expect(await formularyDetailPage.readPayer()).toBe(FORMULARY_SUITE.payerName);
      expect((await formularyDetailPage.readViaApi(formulary.id)).assignedPlanCount ?? 0, 'the plan assignment').toBeGreaterThan(0);
    });

    await steps.step('The Owning Payer is locked / read-only once a plan assignment exists', async () => {
      if ((await formularyDetailPage.getActionAvailability('edit')) === 'available') {
        await formularyDetailPage.openEditDrawer();
        expect(await formularyDetailPage.isPayerEditable(), 'the payer in the Edit drawer').toBe(false);
        await formularyDetailPage.closeEdit();
      }
      const answer = await formularyDetailPage.changePayerViaApi(formulary.id, await payerIdByName(page, CASES.payerLockedByPlan.otherPayer));
      expect(answer.status, `a payer change was accepted: ${answer.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
    });

    await steps.step(`A plan of another payer ("${CASES.payerLockedByPlan.otherPayer}") cannot select this formulary`, async () => {
      const answer = await assignPlanFormulary(page, foreignPlan.id, formulary.id);
      expect(answer.status, `AssignFormularyToPlan answered ${answer.status}: ${answer.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
    });
  });

  test(`TC-${CASES.injection.azureId}: should treat a script in the English name as invalid text, block step 2 and execute nothing`, async ({
    formularyManagementPage,
    page,
    steps,
  }) => {
    let drawer: FormularyFormDrawer;
    let dialogs = 0;
    page.on('dialog', (dialog) => {
      dialogs += 1;
      void dialog.dismiss();
    });

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
    });

    await steps.critical('Select "Create Formulary" - step 1 is displayed', async () => {
      drawer = await openAddDrawer(formularyManagementPage);
      expect(await drawer.currentStep()).toBe(1);
    });

    await steps.step(`Enter "${INJECTION.script}" into the English Name - it is rejected as invalid English-letter text or sanitized, and no script runs`, async () => {
      await drawer.type('nameEn', INJECTION.script);
      const error = await drawer.getFieldError('nameEn');
      const kept = await drawer.getValue('nameEn');
      expect(MESSAGE.englishOnly.test(error) || !kept.includes('<script'), `kept "${kept}"; error "${error}"`).toBe(true);
      expect(dialogs, 'no script may execute').toBe(0);
    });

    await steps.step('Attempting to proceed is blocked for invalid characters and no script executes', async () => {
      await drawer.type('nameAr', SAFE_TEXT.nameAr);
      await ensureSuitePayer(drawer);
      expect(await drawer.next(), 'step 2 must not open').toBe(false);
      expect((await drawer.getMessages()).join(' | ')).toMatch(MESSAGE.englishOnly);
      expect(dialogs).toBe(0);
    });
  });

  test(`TC-${CASES.stepsKeepValues.azureId}: should keep step 1 and step 2 values when the administrator moves back and forth between the steps`, async ({
    formularyManagementPage,
    steps,
  }) => {
    const data = CASES.stepsKeepValues;
    const info = { nameEn: suiteName('Back And Forth'), nameAr: SAFE_TEXT.nameAr, descriptionEn: SAFE_TEXT.descriptionEn, descriptionAr: SAFE_TEXT.descriptionAr };
    const period = { effectiveDate: dateIn(3 * 24 * 60), expiryDate: dateIn(200 * 24 * 60) };
    let drawer: FormularyFormDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
    });

    await steps.critical('Select "Create Formulary", fill every step 1 field and click Next - step 2 is displayed (its period entered)', async () => {
      drawer = await openAddDrawer(formularyManagementPage);
      await drawer.fillBasicInfo(info);
      await ensureSuitePayer(drawer);
      expect(await drawer.next()).toBe(true);
      await drawer.fillPeriod(period);
    });

    await steps.step('Click "Back" - the step 1 values are still populated', async () => {
      await drawer.back();
      expect({
        nameEn: await drawer.getValue('nameEn'),
        nameAr: await drawer.getValue('nameAr'),
        descriptionEn: await drawer.getValue('descriptionEn'),
        descriptionAr: await drawer.getValue('descriptionAr'),
      }).toEqual(info);
      expect(await drawer.readPayer()).toBe(FORMULARY_SUITE.payerName);
    });

    await steps.step('Modify a step 1 field and proceed - step 2 still holds the effective period entered before', async () => {
      await drawer.type('descriptionEn', data.changedDescription);
      expect(await drawer.next()).toBe(true);
      expect({ effectiveDate: await drawer.getValue('effectiveDate'), expiryDate: await drawer.getValue('expiryDate') }).toEqual(period);
    });
  });

  test(`TC-${CASES.indicators.azureId}: should mark the mandatory fields, leave the descriptions optional and show a field-specific message for each rule`, async ({
    formularyManagementPage,
    steps,
  }) => {
    const data = CASES.indicators;
    let drawer: FormularyFormDrawer;
    let stepOne: string[] = [];

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
    });

    await steps.critical('Select "Create Formulary" - step 1 is displayed', async () => {
      drawer = await openAddDrawer(formularyManagementPage);
      expect(await drawer.currentStep()).toBe(1);
    });

    await steps.step('English Name, Arabic Name, Effective Date and Expiry Date are marked mandatory', async () => {
      stepOne = await drawer.getRequiredLabels();
      for (const label of data.required) expect(stepOne.some((l) => label.test(l)), `${label} among ${stepOne.join(', ')}`).toBe(true);
      expect(await validStepOne(drawer, suiteName('Indicators'))).toBe(true);
      // Back to step 1 whatever step 2 shows: step 5 starts there.
      try {
        const stepTwo = await drawer.getRequiredLabels();
        for (const label of data.requiredPeriod) expect(stepTwo.some((l) => label.test(l)), `${label} among ${stepTwo.join(', ')}`).toBe(true);
      } finally {
        await drawer.back();
      }
    });

    await steps.step('English Description and Arabic Description carry no mandatory indicator', async () => {
      for (const label of data.optional) expect(stepOne.filter((l) => label.test(l)), 'descriptions marked mandatory').toEqual([]);
    });

    await steps.step('Each field shows a clear, field-specific message when its rule is broken', async () => {
      await drawer.fillBasicInfo({ nameEn: '', nameAr: '' });
      expect(await drawer.next()).toBe(false);
      const names = await drawer.getFieldErrors();
      expect({ nameEn: names.nameEn ?? '', nameAr: names.nameAr ?? '' }).toEqual({ nameEn: expect.stringMatching(MESSAGE.required), nameAr: expect.stringMatching(MESSAGE.required) });
      await drawer.fillBasicInfo({ nameEn: 'قائمة', nameAr: 'English' });
      expect(await drawer.next()).toBe(false);
      expect(await drawer.getFieldError('nameEn')).toMatch(MESSAGE.englishOnly);
      expect(await drawer.getFieldError('nameAr')).toMatch(MESSAGE.arabicOnly);
      await drawer.fillBasicInfo({ nameEn: suiteName('Indicators'), nameAr: SAFE_TEXT.nameAr });
      expect(await drawer.next()).toBe(true);
      await drawer.fillPeriod({ effectiveDate: '', expiryDate: '' });
      expect((await drawer.attemptSave()).status, 'an empty period must not save').toBe(-1);
      const period = await drawer.getFieldErrors();
      expect({ effectiveDate: period.effectiveDate ?? '', expiryDate: period.expiryDate ?? '' })
        .toEqual({ effectiveDate: expect.stringMatching(MESSAGE.required), expiryDate: expect.stringMatching(MESSAGE.required) });
    });
  });
});
