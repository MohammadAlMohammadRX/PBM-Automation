import { test, expect } from '../../../fixtures';
import type { NetworkFormDialog, SaveReport } from '../../../pages/network/NetworkFormDialog';
import { NETWORK_FIELD } from '../../../pages/network/NetworkFormDialog';
import { NETWORK_APPROVAL_STATE, NETWORK_LIFECYCLE, NETWORK_MESSAGE, NETWORK_TOAST } from '../../../data/networks/network.data';
import { MESSAGE } from '../../../data/networks/networkForm.data';
import { EDIT, EDIT_CHECKLIST, ORIGINAL_DESCRIPTION, sameDayLate } from '../../../data/networks/editNetwork.data';

/**
 * User story 14125: Edit existing network details.
 * The edit FORM: what it pre-fills, which date changes it accepts, that it
 * enforces registration's rules, and that it works whatever the status.
 */
test.describe('US 14125 - Edit form', () => {
  test(`TC-${EDIT.prepopulated.azureId}: should pre-fill every current value and keep the network code from being edited when the edit form opens`, async ({
    networkManagementPage,
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(10 * 60_000);
    const network = await networkIn('Active', { descriptionEn: ORIGINAL_DESCRIPTION });
    let current!: Awaited<ReturnType<typeof networkDetailPage.readOverview>>;
    let form!: NetworkFormDialog;

    await steps.critical('Navigate to the module - the network\'s current values are on its overview', async () => {
      await networkDetailPage.open(network.id);
      current = await networkDetailPage.readOverview();
      expect(current.code).not.toBe('');
    });

    await steps.critical('Edit opens the form', async () => {
      await networkManagementPage.openList();
      form = await networkManagementPage.openEditForm(network.name);
      expect(await form.getTitleText()).not.toBe('');
    });

    await steps.step('Name, description, type and both dates are pre-filled with the current values', async () => {
      const values = await form.readAll();
      expect(values.nameEn).toBe(network.name);
      expect(values.nameAr).toBe(current.nameAr);
      expect(values.descriptionEn).toBe(ORIGINAL_DESCRIPTION);
      expect(values.type).toBe(current.type);
      expect(values.effectiveDate).toBe(current.effectiveDate);
      expect(values.expiryDate).toBe(current.expiryDate);
    });

    await steps.step('The network code cannot be edited - it is hidden or read-only', async () => {
      // QA lead, 2026-10-27: the code must not be editable; whether the form
      // hides it or shows it read-only, both pass.
      expect(await form.offersNetworkCodeField(), 'the network code must not be editable (hidden or read-only)').toBe(false);
      await form.closeAndDiscard();
    });
  });

  test(`TC-${EDIT.effectiveToday.azureId}: should accept a changed effective date when it is set to today`, async ({
    networkManagementPage,
    networkIn,
    toast,
    steps,
  }) => {
    test.setTimeout(10 * 60_000);
    const network = await networkIn('Pending');
    const newEffective = EDIT.effectiveToday.newEffective();
    let form!: NetworkFormDialog;

    await steps.critical('Navigate to the module and open Edit - the future effective date is pre-filled', async () => {
      await networkManagementPage.openList();
      form = await networkManagementPage.openEditForm(network.name);
      expect(await form.readField('effectiveDate')).not.toBe('');
    });

    await steps.step('Today is accepted as the new effective date with no error', async () => {
      await form.editField('effectiveDate', newEffective);
      expect(await form.readField('effectiveDate')).toBe(newEffective);
      expect(await form.readFieldError('effectiveDate')).toBe('');
    });

    await steps.step('Save Draft saves the draft with the updated effective date', async () => {
      const report = await form.saveEditAndReport();
      expect(report.created, report.text).toBe(true);
      await toast.expectText(NETWORK_TOAST.savedAsDraft);
    });
  });

  test(`TC-${EDIT.effectivePast.azureId}: should reject a changed effective date when it is set in the past`, async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(10 * 60_000);
    const network = await networkIn('Pending');
    const past = EDIT.effectivePast.newEffective();
    let form!: NetworkFormDialog;
    let report!: SaveReport;

    await steps.critical('Navigate to the module and open Edit', async () => {
      await networkManagementPage.openList();
      form = await networkManagementPage.openEditForm(network.name);
      expect(await form.readField('effectiveDate')).not.toBe('');
    });

    await steps.step('The past date is shown in the field', async () => {
      await form.editField('effectiveDate', past);
      expect(await form.readField('effectiveDate')).toBe(past);
    });

    await steps.step('Save Draft is refused with a "today or later" error', async () => {
      report = await form.saveEditAndReport();
      expect(report.refused, `a past effective date must not save: ${report.text}`).toBe(true);
      expect(report.messages.join(' | ')).toContain(NETWORK_MESSAGE.effectiveInPast);
      await form.closeAndDiscard();
    });
  });

  test(`TC-${EDIT.unchangedPast.azureId}: should keep an unchanged past effective date and save when only the description is edited`, async ({
    networkManagementPage,
    networkIn,
    toast,
    steps,
  }) => {
    test.setTimeout(10 * 60_000);
    const network = await networkIn('Active');
    const description = EDIT.unchangedPast.description();
    let form!: NetworkFormDialog;
    let original = '';

    await steps.critical('Navigate to the module and open Edit - the original past effective date is shown', async () => {
      await networkManagementPage.openList();
      form = await networkManagementPage.openEditForm(network.name);
      original = await form.readField('effectiveDate');
      expect(original).not.toBe('');
    });

    await steps.step('Only the description changes; the effective date keeps its past value with no error', async () => {
      await form.editField('descriptionEn', description);
      expect(await form.readField('descriptionEn')).toBe(description);
      expect(await form.readField('effectiveDate')).toBe(original);
      expect(await form.readFieldError('effectiveDate')).toBe('');
    });

    await steps.step('Save Draft succeeds without a date validation error', async () => {
      const report = await form.saveEditAndReport();
      expect(report.created, `an untouched past date must not block the save: ${report.text}`).toBe(true);
      expect(report.messages.join(' | ')).not.toContain(NETWORK_MESSAGE.effectiveInPast);
      await toast.expectText(NETWORK_TOAST.savedAsDraft);
    });
  });

  test(`TC-${EDIT.sameDayExpiry.azureId}: should reject an edit when the expiry is moved onto the effective date's day`, async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(10 * 60_000);
    const network = await networkIn('Pending');
    let form!: NetworkFormDialog;
    let sameDay = '';

    await steps.critical('Navigate to the module and open Edit', async () => {
      await networkManagementPage.openList();
      form = await networkManagementPage.openEditForm(network.name);
      sameDay = sameDayLate(await form.readField('effectiveDate'));
      expect(sameDay).not.toBe('');
    });

    await steps.step('The expiry field shows the same-day value', async () => {
      await form.editField('expiryDate', sameDay);
      expect(await form.readField('expiryDate')).toBe(sameDay);
    });

    await steps.step('Save Draft is refused: the expiry must be strictly after the effective date', async () => {
      const report = await form.saveEditAndReport();
      expect(report.refused, `a same-day period must not save: ${report.text}`).toBe(true);
      expect(report.messages.join(' | ')).toMatch(MESSAGE.expiryAfterEffective);
      await form.closeAndDiscard();
    });
  });

  test(`TC-${EDIT.expiredEditable.azureId}: should allow editing and keep the Expired status until approval when the network is Expired`, async ({
    networkManagementPage,
    networkIn,
    toast,
    steps,
  }) => {
    test.setTimeout(20 * 60_000);
    const network = await networkIn('Expired');
    const description = EDIT.expiredEditable.description();
    let form!: NetworkFormDialog;

    await steps.critical('Navigate to the module and open Edit on the Expired network - the form is editable', async () => {
      await networkManagementPage.openList();
      form = await networkManagementPage.openEditForm(network.name);
      expect(await form.isFieldEditable(NETWORK_FIELD.descriptionEn)).toBe(true);
    });

    await steps.step('Save Draft saves the new description and the network stays Expired', async () => {
      await form.editField('descriptionEn', description);
      const report = await form.saveEditAndReport();
      expect(report.created, report.text).toBe(true);
      await toast.expectText(NETWORK_TOAST.savedAsDraft);
      expect(await networkManagementPage.readStatus(network.name)).toBe(NETWORK_LIFECYCLE.expired);
    });
  });

  test(`TC-${EDIT.clearedRequired.azureId}: should reject the edit with a required-field error when the name is cleared`, async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft');
    let form!: NetworkFormDialog;

    await steps.critical('Navigate to the module and open Edit - the name is populated', async () => {
      await networkManagementPage.openList();
      form = await networkManagementPage.openEditForm(network.name);
      expect(await form.readField('nameEn')).toBe(network.name);
    });

    await steps.step('With the name cleared, Save Draft is blocked by a required-field error', async () => {
      await form.clearField(NETWORK_FIELD.nameEn);
      const report = await form.attemptEditSave();
      expect(report.refused, report.text).toBe(true);
      expect(await form.readFieldError('nameEn')).toBe(NETWORK_MESSAGE.required);
      await form.closeAndDiscard();
    });
  });

  test(`TC-${EDIT.checklist.azureId}: should enforce the registration validation rules when the same invalid values are entered in the edit form`, async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(10 * 60_000);
    const network = await networkIn('Pending');

    await steps.critical('Navigate to the module and open Edit', async () => {
      await networkManagementPage.openList();
      const form = await networkManagementPage.openEditForm(network.name);
      expect(await form.readField('nameEn')).toBe(network.name);
      await form.closeAndDiscard();
    });

    for (const check of EDIT_CHECKLIST) {
      await steps.step(`The edit form enforces ${check.rule}`, async () => {
        await networkManagementPage.openList();
        const form = await networkManagementPage.openEditForm(network.name);
        await form.goToStepContaining(NETWORK_FIELD[check.key]);
        await form.clearField(NETWORK_FIELD[check.key]);
        await form.editField(check.key, check.value);
        const report = await form.attemptEditSave();
        const inline = await form.readFieldError(check.key);
        expect(report.refused, `${check.rule}: ${report.text}`).toBe(true);
        expect([...report.messages, inline].join(' | '), `the message for ${check.rule}`).toMatch(check.message);
        await form.closeAndDiscard();
      });
    }
  });

  test(`TC-${EDIT.acrossStatuses.azureId}: should edit, save and send for approval in the same way when the network is Pending or Active`, async ({
    networkManagementPage,
    networkIn,
    toast,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const pending = await networkIn('Pending');
    const active = await networkIn('Active');

    await steps.critical('Navigate to the Network Management module', async () => {
      await networkManagementPage.openList();
      expect(await networkManagementPage.readStatus(pending.name)).toBe(NETWORK_LIFECYCLE.pending);
    });

    for (const network of [pending, active]) {
      await steps.step(`"${network.name}" opens for edit and saves a draft with no unexpected restriction`, async () => {
        await networkManagementPage.openList();
        const form = await networkManagementPage.openEditForm(network.name);
        await form.editField('descriptionEn', EDIT.acrossStatuses.description());
        const report = await form.saveEditAndReport();
        expect(report.created, report.text).toBe(true);
        await toast.expectText(NETWORK_TOAST.savedAsDraft);
      });

      await steps.step(`"${network.name}" can be sent for approval like any draft`, async () => {
        await networkManagementPage.openList();
        await networkManagementPage.submitForApproval(network.name);
        expect((await networkManagementPage.readRow(network.name)).approvalStatus).toContain(NETWORK_APPROVAL_STATE.pendingApproval);
      });
    }
  });
});
