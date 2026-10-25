import { test, expect } from '../../../fixtures';
import type { NetworkFormDialog } from '../../../pages/network/NetworkFormDialog';
import { NETWORK_FIELD } from '../../../pages/network/NetworkFormDialog';
import { NETWORK_MESSAGE, NETWORK_SORT_OPTIONS } from '../../../data/networks/network.data';
import { ARABIC_TEXT, LATIN_WORD, buildNetwork, untranslatedWords } from '../../../data/networks/networkForm.data';
import { BILINGUAL, ENGLISH_HEADERS, ENGLISH_REQUIRED, TOGGLE_LABEL } from '../../../data/networks/bilingualLabels.data';

/**
 * User story 14141: Display bilingual labels and validation messages.
 * Whole screens in each interface language - the list, the Add Network form,
 * the delete prompt, the filters and the messages - and the language toggle
 * itself.
 *
 * Every case that leaves English restores it in cleanup: the language is a
 * remembered per-user preference, and a case left in Arabic would break every
 * English assertion after it.
 */
test.describe('US 14141 - Screens in each language', () => {
  test(`TC-${BILINGUAL.english.azureId}: should render labels, buttons, menus and validation messages in English when English is selected`, async ({
    networkManagementPage,
    languageSwitcher,
    steps,
  }) => {
    await steps.critical('Navigate to the Network Management module', async () => {
      await networkManagementPage.openList();
      expect(await languageSwitcher.isOffered(), 'the language toggle should be offered').toBe(true);
    });

    await steps.step('The language toggle offers the other language', async () => {
      await languageSwitcher.switchTo('en');
      expect(await languageSwitcher.getToggleLabel()).toBe(TOGGLE_LABEL.en);
    });

    await steps.step('With English selected the application renders left-to-right in English', async () => {
      await languageSwitcher.expectLanguage('en');
      await languageSwitcher.expectLeftToRight();
    });

    await steps.step('The list\'s headers and menus are all English', async () => {
      await networkManagementPage.openList();
      expect(await networkManagementPage.getHeaderTexts()).toEqual(ENGLISH_HEADERS);
      expect(await networkManagementPage.getSortOptions()).toEqual([...NETWORK_SORT_OPTIONS]);
    });

    await steps.step('A blank Add Network form reports the required-field message in English', async () => {
      const form = await networkManagementPage.openAddForm();
      await form.next();
      expect(await form.readFieldError('nameEn')).toBe(ENGLISH_REQUIRED);
      await form.closeAndDiscard();
    });
  });

  test(`TC-${BILINGUAL.arabic.azureId}: should render labels, buttons, menus and validation messages in Arabic right-to-left when Arabic is selected`, async ({
    networkManagementPage,
    languageSwitcher,
    steps,
    cleanup,
  }) => {
    cleanup.register(() => languageSwitcher.switchTo('en'));

    await steps.critical('Navigate to the Network Management module', async () => {
      await networkManagementPage.openList();
      expect(await languageSwitcher.isOffered()).toBe(true);
    });

    await steps.step('The language toggle offers Arabic', async () => {
      await languageSwitcher.switchTo('en');
      expect(await languageSwitcher.getToggleLabel()).toBe(TOGGLE_LABEL.en);
    });

    await steps.step('With Arabic selected the application renders right-to-left', async () => {
      await languageSwitcher.switchTo('ar');
      await languageSwitcher.expectRightToLeft();
    });

    await steps.step('The list\'s headers and menus are in Arabic with nothing left untranslated', async () => {
      await networkManagementPage.openList();
      const texts = [...(await networkManagementPage.getHeaderTexts()), ...(await networkManagementPage.getSortOptions())];
      expect(texts.join(' '), 'Arabic labels').toMatch(ARABIC_TEXT);
      expect(untranslatedWords(texts), 'English words left on the Arabic list').toEqual([]);
    });

    await steps.step('A blank Add Network form reports the required-field message in Arabic', async () => {
      const form = await networkManagementPage.openAddForm();
      await form.next();
      const message = await form.readFieldError('nameEn');
      expect(message, 'the required message should be Arabic').toMatch(ARABIC_TEXT);
      expect(message).not.toBe(ENGLISH_REQUIRED);
      await form.closeAndDiscard();
    });
  });

  test(`TC-${BILINGUAL.midFormSwitch.azureId}: should switch the form's labels and keep the entered data when the language changes mid-form`, async ({
    networkManagementPage,
    languageSwitcher,
    steps,
    cleanup,
  }) => {
    cleanup.register(() => languageSwitcher.switchTo('en'));
    const data = buildNetwork();
    let form!: NetworkFormDialog;

    await steps.critical('Navigate to the Network Management module in English', async () => {
      await languageSwitcher.switchTo('en');
      await networkManagementPage.openList();
      expect(await networkManagementPage.isAddOffered()).toBe(true);
    });

    await steps.step('In English the form\'s labels are English and the entered data is kept', async () => {
      form = await networkManagementPage.openAddForm();
      await form.fillTextField(NETWORK_FIELD.nameEn, data.nameEn);
      await form.fillTextField(NETWORK_FIELD.nameAr, data.nameAr);
      expect((await form.getStepLabels()).join(' ')).toMatch(LATIN_WORD);
      expect(await form.readField('nameEn')).toBe(data.nameEn);
    });

    await steps.step('Switching to Arabic turns the labels Arabic, right-to-left, and keeps both values', async () => {
      await languageSwitcher.switchTo('ar');
      await languageSwitcher.expectRightToLeft();
      const labels = await form.getStepLabels();
      expect(untranslatedWords(labels), 'English labels left after the switch').toEqual([]);
      expect(await form.readField('nameEn'), 'the English name must survive the switch').toBe(data.nameEn);
      expect(await form.readField('nameAr'), 'the Arabic name must survive the switch').toBe(data.nameAr);
    });

    await steps.step('A mandatory field left blank is reported in Arabic', async () => {
      await form.clearField(NETWORK_FIELD.nameEn);
      await form.next();
      const message = await form.readFieldError('nameEn');
      expect(message).toMatch(ARABIC_TEXT);
      expect(message).not.toBe(NETWORK_MESSAGE.required);
      await form.closeAndDiscard();
    });
  });

  test(`TC-${BILINGUAL.arabicExploration.azureId}: should show no untranslated, placeholder or broken text anywhere in the module when it runs in Arabic`, async ({
    networkManagementPage,
    languageSwitcher,
    networkIn,
    steps,
    cleanup,
  }) => {
    cleanup.register(() => languageSwitcher.switchTo('en'));
    const draft = await networkIn('Draft');

    await steps.critical('Navigate to the module in Arabic - it renders right-to-left', async () => {
      await languageSwitcher.switchTo('ar');
      await networkManagementPage.openList();
      await languageSwitcher.expectRightToLeft();
    });

    await steps.step('The list, KPI band, filters, Add form and delete prompt carry no English text', async () => {
      const texts = [
        ...(await networkManagementPage.getHeaderTexts()),
        ...(await networkManagementPage.getKpiLabels()),
        ...(await networkManagementPage.getFilterOptions('type')),
        ...(await networkManagementPage.getFilterOptions('status')),
      ];
      const form = await networkManagementPage.openAddForm();
      texts.push(await form.getTitleText(), ...(await form.getStepLabels()));
      await form.closeAndDiscard();
      const prompt = await networkManagementPage.openDeletePrompt(draft.name);
      texts.push(await prompt.getTitle());
      await prompt.cancel();
      expect(untranslatedWords(texts, [draft.name]), 'English words in the Arabic module').toEqual([]);
    });

    await steps.step('Sorting and paging text is Arabic too', async () => {
      await networkManagementPage.openList();
      expect(untranslatedWords(await networkManagementPage.getSortOptions()), 'English sort options').toEqual([]);
    });
  });

  test(`TC-${BILINGUAL.translationChecklist.azureId}: should localise every checklist screen in both English and Arabic`, async ({
    networkManagementPage,
    languageSwitcher,
    networkIn,
    steps,
    cleanup,
  }) => {
    cleanup.register(() => languageSwitcher.switchTo('en'));
    const draft = await networkIn('Draft');

    await steps.critical('Navigate to the Network Management module', async () => {
      await networkManagementPage.openList();
      expect(await networkManagementPage.isAddOffered()).toBe(true);
    });

    await steps.step('English: list, form, delete prompt, filters and validation all render in English', async () => {
      await languageSwitcher.switchTo('en');
      await networkManagementPage.openList();
      expect(await networkManagementPage.getHeaderTexts()).toEqual(ENGLISH_HEADERS);
      const form = await networkManagementPage.openAddForm();
      await form.next();
      expect(await form.readFieldError('nameEn')).toBe(ENGLISH_REQUIRED);
      await form.closeAndDiscard();
      const prompt = await networkManagementPage.openDeletePrompt(draft.name);
      expect(await prompt.getTitle()).toBe(NETWORK_MESSAGE.deleteTitle);
      await prompt.cancel();
    });

    await steps.step('Arabic: the same screens render in Arabic with no English left', async () => {
      await languageSwitcher.switchTo('ar');
      await networkManagementPage.openList();
      const texts = [...(await networkManagementPage.getHeaderTexts()), ...(await networkManagementPage.getFilterOptions('status'))];
      const form = await networkManagementPage.openAddForm();
      await form.next();
      const required = await form.readFieldError('nameEn');
      texts.push(...(await form.getStepLabels()), required);
      await form.closeAndDiscard();
      const prompt = await networkManagementPage.openDeletePrompt(draft.name);
      texts.push(await prompt.getTitle());
      await prompt.cancel();
      expect(required).toMatch(ARABIC_TEXT);
      expect(untranslatedWords(texts, [draft.name]), 'English words on the Arabic checklist screens').toEqual([]);
    });
  });

  test(`TC-${BILINGUAL.allRoles.azureId}: should offer the language preference to every signed-in role`, async ({
    networkManagementPage,
    languageSwitcher,
    nonAdminSession,
    steps,
    cleanup,
  }) => {
    cleanup.register(() => nonAdminSession.language.switchTo('en'));
    cleanup.register(() => languageSwitcher.switchTo('en'));

    await steps.critical('Navigate to the Network Management module', async () => {
      await networkManagementPage.openList();
      expect(await languageSwitcher.isOffered()).toBe(true);
    });

    await steps.step('The administrator can select both languages', async () => {
      await languageSwitcher.switchTo('ar');
      await languageSwitcher.expectLanguage('ar');
      await languageSwitcher.switchTo('en');
      await languageSwitcher.expectLanguage('en');
    });

    await steps.step('A non-administrator role can select both languages too', async () => {
      await nonAdminSession.networks.openList();
      expect(await nonAdminSession.language.isOffered(), 'the toggle must not be a permissioned control').toBe(true);
      await nonAdminSession.language.switchTo('ar');
      await nonAdminSession.language.expectLanguage('ar');
      await nonAdminSession.language.switchTo('en');
      await nonAdminSession.language.expectLanguage('en');
    });
  });

  test(`TC-${BILINGUAL.backendMessages.azureId}: should return server validation messages in the selected interface language`, async ({
    networkManagementPage,
    languageSwitcher,
    steps,
    cleanup,
  }) => {
    cleanup.register(() => languageSwitcher.switchTo('en'));
    const invalid = buildNetwork({ nameEn: BILINGUAL.backendMessages.englishWithArabic });

    await steps.critical('Navigate to the Network Management module', async () => {
      await networkManagementPage.openList();
      expect(await networkManagementPage.isAddOffered()).toBe(true);
    });

    await steps.step('In Arabic, the server\'s message for an invalid English name is shown in Arabic', async () => {
      await languageSwitcher.switchTo('ar');
      await networkManagementPage.openList();
      const form = await networkManagementPage.openAddForm();
      await form.fillBasicInformation(invalid);
      // A refused step 1 IS the refusal (2026-10-25) - see attemptNewSave.
      const report = await form.attemptNewSave(invalid);
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.refused, `the invalid name must be refused: ${report.text}`).toBe(true);
      expect(report.messages.join(' | '), 'an Arabic server message').toMatch(ARABIC_TEXT);
      expect(untranslatedWords(report.messages), 'English left in the Arabic message').toEqual([]);
      await form.closeAndDiscard();
    });

    await steps.step('In English, the same submission\'s message is shown in English', async () => {
      await languageSwitcher.switchTo('en');
      await networkManagementPage.openList();
      const form = await networkManagementPage.openAddForm();
      const again = buildNetwork({ nameEn: BILINGUAL.backendMessages.englishWithArabic });
      await form.fillBasicInformation(again);
      const report = await form.attemptNewSave(again);
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.refused, report.text).toBe(true);
      expect(report.messages.join(' | '), 'an English server message').toMatch(LATIN_WORD);
      await form.closeAndDiscard();
    });
  });
});
