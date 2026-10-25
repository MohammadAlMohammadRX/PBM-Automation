import { test, expect } from '../../../fixtures';
import type { NetworkFormDialog, SaveReport } from '../../../pages/network/NetworkFormDialog';
import type { NetworkFormData } from '../../../data/networks/network.data';
import { NETWORK_MESSAGE, NETWORK_TOAST } from '../../../data/networks/network.data';
import { MESSAGE } from '../../../data/networks/networkForm.data';
import { CONFIGURED_TYPES, PERIOD } from '../../../data/networks/typeAndEffectivePeriod.data';

/**
 * User story 14124: Specify network type and effective period.
 * The type list and the date rules of the registration form.
 */
test.describe('US 14124 - Network type and effective period rules', () => {
  /** The accepted-period cases: each saves, and what was entered is what is stored. */
  for (const accepted of [PERIOD.validPpo, PERIOD.effectiveToday, PERIOD.oneDayGap, PERIOD.unusualDates]) {
    test(`TC-${accepted.azureId}: ${accepted.title}`, async ({
      networkManagementPage,
      networkDetailPage,
      toast,
      steps,
      cleanup,
    }) => {
      const data: NetworkFormData = accepted.build();
      let form!: NetworkFormDialog;
      let report!: SaveReport;

      await steps.critical('Navigate to the module - the registration form opens blank', async () => {
        await networkManagementPage.openList();
        form = await networkManagementPage.openAddForm();
        expect(await form.readField('nameEn')).toBe('');
      });

      await steps.step(`"${data.type}" is shown as the selected network type`, async () => {
        await form.fillBasicInformation(data);
        expect(await form.readField('type')).toBe(data.type);
      });

      await steps.step('The effective and expiry dates are accepted with no error', async () => {
        await form.next();
        await form.fillEffectivePeriod(data);
        expect(await form.readField('effectiveDate')).toBe(data.effectiveDate);
        expect(await form.readField('expiryDate')).toBe(data.expiryDate);
        expect(await form.readFieldError('effectiveDate')).toBe('');
        expect(await form.readFieldError('expiryDate')).toBe('');
      });

      await steps.step('Saving creates the record and confirms it', async () => {
        report = await form.saveNewAndReport();
        cleanup.register(() => form.discardCreated(report.outcome));
        expect(report.created, report.text).toBe(true);
        await toast.expectText(NETWORK_TOAST.savedAsDraft);
      });

      await steps.step('The stored type and dates are exactly the ones entered', async () => {
        await networkDetailPage.open(form.createdId(report.outcome));
        expect(await networkDetailPage.readOverviewField('type')).toBe(data.type);
        expect(await networkDetailPage.readOverviewField('effectiveDate')).toBe(data.effectiveDate);
        expect(await networkDetailPage.readOverviewField('expiryDate')).toBe(data.expiryDate);
      });
    });
  }

  /** The refused-period cases: each is blocked with a message naming the rule. */
  for (const refused of [
    { ...PERIOD.sameDay, message: MESSAGE.expiryAfterEffective },
    { ...PERIOD.pastEffective, message: new RegExp(NETWORK_MESSAGE.effectiveInPast) },
    { ...PERIOD.pastExpiry, message: MESSAGE.expiryInPast },
    { ...PERIOD.reversed, message: MESSAGE.expiryAfterEffective },
  ]) {
    test(`TC-${refused.azureId}: ${refused.title}`, async ({
      networkManagementPage,
      steps,
      cleanup,
    }) => {
      const data: NetworkFormData = refused.build();
      let form!: NetworkFormDialog;
      let report!: SaveReport;

      await steps.critical('Navigate to the module - the registration form opens', async () => {
        await networkManagementPage.openList();
        form = await networkManagementPage.openAddForm();
        await form.fillBasicInformation(data);
        expect(await form.readField('type')).toBe(data.type);
      });

      await steps.step('The entered dates are shown in the fields', async () => {
        await form.next();
        await form.fillEffectivePeriod(data);
        expect(await form.readField('effectiveDate')).toBe(data.effectiveDate);
        expect(await form.readField('expiryDate')).toBe(data.expiryDate);
      });

      await steps.step('Saving is refused and no record is created', async () => {
        report = await form.saveNewAndReport();
        cleanup.register(() => form.discardCreated(report.outcome));
        expect(report.refused, `this period must not save: ${report.text}`).toBe(true);
      });

      await steps.step('A validation message names the broken date rule', async () => {
        expect(report.messages.join(' | ')).toMatch(refused.message);
      });
    });
  }

  test(`TC-${PERIOD.typeMissing.azureId}: should block saving with a required-field error when the network type is not selected`, async ({
    networkManagementPage,
    steps,
  }) => {
    let form!: NetworkFormDialog;

    await steps.critical('Navigate to the module - the form opens with no type selected', async () => {
      await networkManagementPage.openList();
      form = await networkManagementPage.openAddForm();
      expect(await form.readField('type')).not.toMatch(new RegExp(CONFIGURED_TYPES.join('|')));
    });

    await steps.step('With the type left blank, continuing shows a required error beside it and goes no further', async () => {
      await form.fillBasicInformation(PERIOD.typeMissing.build(), 'type');
      await form.next();
      expect(await form.readFieldError('type')).toBe(NETWORK_MESSAGE.required);
      expect(await form.currentStep(), 'the wizard must stay on Basic Information').toBe(1);
      await form.closeAndDiscard();
    });
  });

  test(`TC-${PERIOD.eachType.azureId}: should let each administrator-maintained type be selected when the type list is opened`, async ({
    networkManagementPage,
    steps,
  }) => {
    let form!: NetworkFormDialog;

    await steps.critical('Navigate to the module - the form opens', async () => {
      await networkManagementPage.openList();
      form = await networkManagementPage.openAddForm();
      expect(await form.getTitleText()).not.toBe('');
    });

    await steps.step('The type list offers exactly HMO, PPO, EPO and POS', async () => {
      expect(await form.getDropdownOptions('Network Type')).toEqual(CONFIGURED_TYPES);
    });

    for (const type of PERIOD.eachType.selectInTurn) {
      await steps.step(`Selecting "${type}" shows it as the type`, async () => {
        await form.editField('type', type);
        expect(await form.readField('type')).toBe(type);
      });
    }

    await steps.step('No error was raised by any selection', async () => {
      expect(await form.readFieldError('type')).toBe('');
      await form.closeAndDiscard();
    });
  });

  test(`TC-${PERIOD.mandatoryChecklist.azureId}: should enforce every mandatory field before saving when the form is completed step by step`, async ({
    networkManagementPage,
    steps,
    cleanup,
  }) => {
    const data = PERIOD.mandatoryChecklist.build();
    let form!: NetworkFormDialog;

    await steps.critical('Navigate to the module - the form opens blank', async () => {
      await networkManagementPage.openList();
      form = await networkManagementPage.openAddForm();
      expect(await form.readField('nameEn')).toBe('');
    });

    await steps.step('Continuing with everything blank flags every required field', async () => {
      await form.next();
      expect(await form.readFieldError('nameEn')).toBe(NETWORK_MESSAGE.required);
      expect(await form.readFieldError('nameAr')).toBe(NETWORK_MESSAGE.required);
      expect(await form.readFieldError('type')).toBe(NETWORK_MESSAGE.required);
    });

    await steps.step('With only the type filled, the errors remain on the other required fields', async () => {
      await form.editField('type', data.type);
      await form.next();
      expect(await form.readFieldError('type')).toBe('');
      expect(await form.readFieldError('nameEn')).toBe(NETWORK_MESSAGE.required);
    });

    await steps.step('The required dates are flagged when Save is tried without them', async () => {
      await form.fillBasicInformation(data);
      await form.next();
      await form.save();
      expect(await form.readFieldError('effectiveDate')).toBe(NETWORK_MESSAGE.required);
      expect(await form.readFieldError('expiryDate')).toBe(NETWORK_MESSAGE.required);
    });

    await steps.step('With every required field filled the record saves with no errors left', async () => {
      await form.fillEffectivePeriod(data);
      const report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.created, report.text).toBe(true);
    });
  });

  test(`TC-${PERIOD.typeList.azureId}: should list exactly the administrator-configured types when the type dropdown is opened`, async ({
    networkManagementPage,
    steps,
  }) => {
    await steps.critical('Navigate to the module - the form opens', async () => {
      await networkManagementPage.openList();
      expect(await networkManagementPage.isAddOffered()).toBe(true);
    });

    await steps.step('The dropdown shows exactly HMO, PPO, EPO and POS, nothing extra or missing', async () => {
      const form = await networkManagementPage.openAddForm();
      expect(await form.getDropdownOptions('Network Type')).toEqual(CONFIGURED_TYPES);
      await form.closeAndDiscard();
    });
  });

  test(`TC-${PERIOD.registrationRole.azureId}: should keep network registration away from a role without the right`, async ({
    networkManagementPage,
    shapedNonAdmin,
    requireBaseline,
    steps,
  }) => {
    await steps.critical('Navigate to the module - an administrator is offered New Network', async () => {
      await networkManagementPage.openList();
      const offered = await networkManagementPage.isAddOffered();
      requireBaseline(offered, 'the Add Network action for a session holding CreateNetwork');
      expect(offered).toBe(true);
    });

    await steps.step('A viewer role without CreateNetwork is not offered New Network', async () => {
      const session = await shapedNonAdmin({ without: ['createNetwork'] });
      await session.networks.openList();
      expect(await session.networks.isAddOffered(), 'New Network must be hidden or disabled').toBe(false);
    });
  });
});
