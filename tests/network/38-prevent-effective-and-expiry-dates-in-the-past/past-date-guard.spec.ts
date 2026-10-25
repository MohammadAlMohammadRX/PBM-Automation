import { test, expect } from '../../../fixtures';
import type { NetworkFormDialog, SaveReport } from '../../../pages/network/NetworkFormDialog';
import { NETWORK_FIELD } from '../../../pages/network/NetworkFormDialog';
import type { NetworkFormData } from '../../../data/networks/network.data';
import { NETWORK_MESSAGE, NETWORK_TOAST } from '../../../data/networks/network.data';
import {
  BLANK_EFFECTIVE,
  DATE_ERRORS,
  FEEDBACK_CHECKLIST,
  PAST_DATES,
  PICKER_CONSISTENCY,
  REFUSED_DATES,
  STATE_TRANSITION,
} from '../../../data/networks/pastDateGuard.data';
import { buildNetwork } from '../../../data/networks/networkForm.data';

/**
 * User story 14317: Prevent effective and expiry dates in the past.
 * The date partitions (today, future, yesterday, far past) for each date, the
 * decision table of the two together, and the feedback the form gives.
 */
test.describe('US 14317 - Past date guard', () => {
  for (const accepted of [PAST_DATES.effectiveToday, PAST_DATES.effectiveFuture, PAST_DATES.expiryToday]) {
    test(`TC-${accepted.azureId}: ${accepted.title}`, async ({
      networkManagementPage,
      toast,
      steps,
      cleanup,
    }) => {
      const data: NetworkFormData = accepted.build();
      let form!: NetworkFormDialog;

      await steps.critical('Navigate to the module - the creation form opens with empty dates', async () => {
        await networkManagementPage.openList();
        form = await networkManagementPage.openAddForm();
        await form.fillBasicInformation(data);
        await form.next();
        expect(await form.readField('effectiveDate')).toBe('');
      });

      await steps.step('The effective date is accepted without error', async () => {
        await form.fillEffectivePeriod(data);
        expect(await form.readField('effectiveDate')).toBe(data.effectiveDate);
        expect(await form.readFieldError('effectiveDate')).toBe('');
      });

      await steps.step('The expiry date is accepted without error', async () => {
        expect(await form.readField('expiryDate')).toBe(data.expiryDate);
        expect(await form.readFieldError('expiryDate')).toBe('');
      });

      await steps.step('Saving creates the record and confirms it', async () => {
        const report = await form.saveNewAndReport();
        cleanup.register(() => form.discardCreated(report.outcome));
        expect(report.created, report.text).toBe(true);
        await toast.expectText(NETWORK_TOAST.savedAsDraft);
      });
    });
  }

  for (const refused of REFUSED_DATES) {
    test(`TC-${refused.azureId}: ${refused.title}`, async ({
      networkManagementPage,
      steps,
      cleanup,
    }) => {
      const data: NetworkFormData = refused.build();
      let form!: NetworkFormDialog;
      let report!: SaveReport;

      await steps.critical('Navigate to the module - the creation form opens', async () => {
        await networkManagementPage.openList();
        form = await networkManagementPage.openAddForm();
        await form.fillBasicInformation(data);
        await form.next();
        expect(await form.currentStep()).toBe(2);
      });

      await steps.step('The entered dates are displayed in the fields', async () => {
        await form.fillEffectivePeriod(data);
        expect(await form.readField('effectiveDate')).toBe(data.effectiveDate);
        expect(await form.readField('expiryDate')).toBe(data.expiryDate);
      });

      await steps.step('Saving is refused and the record is not created', async () => {
        report = await form.saveNewAndReport();
        cleanup.register(() => form.discardCreated(report.outcome));
        expect(report.refused, `past dates must not save: ${report.text}`).toBe(true);
      });

      await steps.step('The errors shown are exactly the ones for the past date(s)', async () => {
        const shown = report.messages.join(' | ');
        expect(DATE_ERRORS.effective.test(shown), `effective-date error expected: ${refused.effectiveError}; shown: ${shown}`).toBe(refused.effectiveError);
        expect(DATE_ERRORS.expiry.test(shown), `expiry-date error expected: ${refused.expiryError}; shown: ${shown}`).toBe(refused.expiryError);
      });
    });
  }

  test(`TC-${STATE_TRANSITION.azureId}: should keep the network unsaved while a past date is set and save it once corrected`, async ({
    networkManagementPage,
    toast,
    steps,
    cleanup,
  }) => {
    const data = buildNetwork({ effectiveDate: STATE_TRANSITION.past() });
    let form!: NetworkFormDialog;

    await steps.critical('Navigate to the module - a new network is opened in the creation form', async () => {
      await networkManagementPage.openList();
      form = await networkManagementPage.openAddForm();
      await form.fillBasicInformation(data);
      await form.next();
      expect(await form.currentStep()).toBe(2);
    });

    await steps.step('The past effective date and a valid expiry are displayed', async () => {
      await form.fillEffectivePeriod(data);
      expect(await form.readField('effectiveDate')).toBe(data.effectiveDate);
    });

    await steps.step('Saving is refused and nothing leaves the draft state', async () => {
      const report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.refused, report.text).toBe(true);
      expect(report.messages.join(' | ')).toMatch(DATE_ERRORS.effective);
    });

    await steps.step('With the date corrected to today the network saves with a success message', async () => {
      await form.editField('effectiveDate', STATE_TRANSITION.corrected());
      const report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.created, report.text).toBe(true);
      await toast.expectText(NETWORK_TOAST.savedAsDraft);
    });
  });

  test(`TC-${PAST_DATES.scheduled.azureId}: should schedule a new network with the entered valid date range end to end`, async ({
    networkManagementPage,
    toast,
    steps,
    cleanup,
  }) => {
    const data = PAST_DATES.scheduled.build();
    let form!: NetworkFormDialog;

    await steps.critical('Navigate to the module - the creation form opens with every required field', async () => {
      await networkManagementPage.openList();
      form = await networkManagementPage.openAddForm();
      expect(await form.isFieldEditable(NETWORK_FIELD.nameEn)).toBe(true);
    });

    await steps.step('All details and a future date range are accepted', async () => {
      await form.fill(data);
      expect(await form.readFieldError('effectiveDate')).toBe('');
      expect(await form.readFieldError('expiryDate')).toBe('');
    });

    await steps.step('The entered dates are shown for review before saving', async () => {
      expect(await form.readField('effectiveDate')).toBe(data.effectiveDate);
      expect(await form.readField('expiryDate')).toBe(data.expiryDate);
    });

    await steps.step('Saving creates the network, confirms it and lists it with the correct dates', async () => {
      const report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.created, report.text).toBe(true);
      await toast.expectText(NETWORK_TOAST.savedAsDraft);
      const row = await networkManagementPage.readRow(data.nameEn);
      expect(row.effectiveDate).toBe(data.effectiveDate);
      expect(row.expiryDate).toBe(data.expiryDate);
    });
  });

  test(`TC-${BLANK_EFFECTIVE.azureId}: should block the save with a required-field error, not a past-date error, when the effective date is blank`, async ({
    networkManagementPage,
    steps,
    cleanup,
  }) => {
    const data = buildNetwork();
    let form!: NetworkFormDialog;

    await steps.critical('Navigate to the module - the creation form opens', async () => {
      await networkManagementPage.openList();
      form = await networkManagementPage.openAddForm();
      await form.fillBasicInformation(data);
      await form.next();
      expect(await form.currentStep()).toBe(2);
    });

    await steps.step('Everything but the effective date is filled; it stays empty', async () => {
      await form.fillEffectivePeriod(data, 'effectiveDate');
      expect(await form.readField('effectiveDate')).toBe('');
    });

    await steps.step('Saving shows the required-field error for the effective date and saves nothing', async () => {
      const report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.refused, report.text).toBe(true);
      expect(await form.readFieldError('effectiveDate')).toBe(NETWORK_MESSAGE.required);
      expect(report.messages.join(' | ')).not.toMatch(DATE_ERRORS.effective);
    });
  });

  test(`TC-${FEEDBACK_CHECKLIST.azureId}: should give inline, visual and blocking feedback when a past effective date is saved`, async ({
    networkManagementPage,
    steps,
    cleanup,
  }) => {
    const data = buildNetwork({ effectiveDate: FEEDBACK_CHECKLIST.past() });
    let form!: NetworkFormDialog;

    await steps.critical('Navigate to the module - the creation form opens', async () => {
      await networkManagementPage.openList();
      form = await networkManagementPage.openAddForm();
      await form.fill(data);
      expect(await form.readField('effectiveDate')).toBe(data.effectiveDate);
    });

    await steps.step('Saving shows an inline error directly under the effective date', async () => {
      const report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.refused, report.text).toBe(true);
      expect(await form.readFieldError('effectiveDate'), 'an inline message under the field').toMatch(DATE_ERRORS.effective);
    });

    await steps.step('The effective date field is visibly marked as invalid', async () => {
      expect(await form.fieldHasErrorState('effectiveDate')).toBe(true);
    });

    await steps.step('Save stays available for correction and the record is not in the list', async () => {
      expect(await form.isSaveEnabled()).toBe(true);
      await form.closeAndDiscard();
      await networkManagementPage.openList();
      await networkManagementPage.search(data.nameEn);
      expect(await networkManagementPage.isRowVisible(data.nameEn)).toBe(false);
    });
  });

  test(`TC-${PICKER_CONSISTENCY.azureId}: should apply the past-date rule the same way through the picker, a typed date and another locale`, async ({
    networkManagementPage,
    languageSwitcher,
    steps,
    cleanup,
  }) => {
    cleanup.register(() => languageSwitcher.switchTo('en'));
    const data = buildNetwork({ effectiveDate: PICKER_CONSISTENCY.yesterday() });
    let pickerForm!: NetworkFormDialog;

    await steps.critical('Navigate to the module - the creation form opens', async () => {
      await networkManagementPage.openList();
      pickerForm = await networkManagementPage.openAddForm();
      await pickerForm.fillBasicInformation(data);
      await pickerForm.next();
      expect(await pickerForm.currentStep()).toBe(2);
    });

    await steps.step('The date picker disables the day before today', async () => {
      expect(await pickerForm.isYesterdayDisabledInPicker('effectiveDate')).toBe(true);
      await pickerForm.closeAndDiscard();
    });

    await steps.step('In the other interface locale, yesterday is still rejected', async () => {
      await languageSwitcher.switchTo('ar');
      await networkManagementPage.openList();
      const form = await networkManagementPage.openAddForm();
      await form.fill(data);
      const report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.refused, report.text).toBe(true);
      expect(await form.readFieldError('effectiveDate')).not.toBe('');
      await form.closeAndDiscard();
    });

    await steps.step('A past date pasted straight into the field triggers the same error', async () => {
      await languageSwitcher.switchTo('en');
      await networkManagementPage.openList();
      const form = await networkManagementPage.openAddForm();
      await form.fill(buildNetwork());
      await form.insertInto('effectiveDate', PICKER_CONSISTENCY.yesterday());
      const report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.refused, report.text).toBe(true);
      expect(report.messages.join(' | ')).toMatch(DATE_ERRORS.effective);
    });
  });
});
