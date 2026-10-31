import { test, expect } from '../../../fixtures';
import { FIELD_TYPE, IS_ACTIVE_FIELD, MESSAGE, TOAST_TEXT, xlsxUpload } from '../../../data/terminology/terminology.data';
import { CASES, CONTROLS_BY_TYPE, DEPENDENT_CONTROLS } from '../../../data/terminology/defineTerminology.data';

/**
 * User story 15150: Define a New Terminology and Its Rules.
 * Creating a terminology through the two-step drawer (Details, Fields): the
 * name / description rules and limits, the at-least-one-field rule, the
 * restrictions and dependent controls each field type brings, the three field
 * flags, restriction parity between typing and importing, and the right to
 * create at all.
 */
test.describe('US 15150 - Define a New Terminology and Its Rules', () => {
  test(`TC-${CASES.create.azureId}: should save a new terminology with its custom field and list it when a unique name, description and valid field are given`, async ({
    terminologyManagementPage,
    terminologyFormDrawer,
    discardTerminologyNamed,
    steps,
  }) => {
    const data = CASES.create;
    const name = data.name();
    discardTerminologyNamed(name);
    await steps.critical('Navigate to the Terminology Management module and open the new terminology form - the form is displayed', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openAddForm();
    });

    await steps.critical('Selecting the option to create a new terminology shows a blank creation form', async () => {
      expect(await terminologyFormDrawer.getNameValue()).toBe('');
      expect(await terminologyFormDrawer.getDescriptionValue()).toBe('');
    });

    await steps.step('A unique name and a description are accepted', async () => {
      await terminologyFormDrawer.fillDetails({ name, description: data.description });
      expect(await terminologyFormDrawer.getNameValue()).toBe(name);
      expect(await terminologyFormDrawer.getDescriptionValue()).toBe(data.description);
    });

    await steps.critical('One custom field with a valid type and restriction is added to the field list', async () => {
      expect(await terminologyFormDrawer.next(), 'Next should open the Fields step').toBe(true);
      const index = await terminologyFormDrawer.addConfiguredField(data.field);
      expect(await terminologyFormDrawer.getFieldNames()).toContain(data.field.name);
      expect(await terminologyFormDrawer.getSelected(index, 'restriction')).toBe(data.field.restriction);
    });

    await steps.step('Saving stores the terminology and it appears in the terminology list', async () => {
      const answer = await terminologyFormDrawer.save();
      expect(answer.status, answer.validationErrors.join('; ')).toBe(200);
      expect(answer.messages.join(' | ')).toMatch(TOAST_TEXT.created);
      expect(await terminologyManagementPage.isListed(name), `"${name}" should be listed`).toBe(true);
    });
  });

  test(`TC-${CASES.blankName.azureId}: should block saving and show a validation error when the terminology name is left empty`, async ({
    terminologyManagementPage,
    terminologyFormDrawer,
    steps,
  }) => {
    const data = CASES.blankName;
    await steps.critical('Navigate to the Terminology Management module and open the new terminology form - the form is displayed', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openAddForm();
    });

    await steps.step('The form is displayed and the name stays empty while the other required fields are completed', async () => {
      await terminologyFormDrawer.fillDetails({ name: '', description: data.description });
      expect(await terminologyFormDrawer.getNameValue()).toBe('');
    });

    await steps.step('Attempting to save shows a validation error and the terminology is not saved', async () => {
      const answer = await terminologyFormDrawer.attemptSave();
      expect(answer.status, 'nothing should be saved').not.toBe(200);
      expect([...answer.messages, ...answer.validationErrors].join(' | '), 'a required-name validation error').toMatch(MESSAGE.required);
    });
  });

  test(`TC-${CASES.duplicateName.azureId}: should reject the save with a duplicate-name error when the name matches an existing terminology`, async ({
    terminologyManagementPage,
    terminologyFormDrawer,
    terminologyIn,
    steps,
  }) => {
    const existing = await terminologyIn({ name: CASES.duplicateName.existing() });
    await steps.critical('Navigate to the Terminology Management module and open the new terminology form - the form is displayed', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openAddForm();
    });

    await steps.step(`The name "${existing.name}", matching an existing terminology, is entered as typed`, async () => {
      await terminologyFormDrawer.fillDetails({ name: existing.name, description: CASES.duplicateName.description });
      expect(await terminologyFormDrawer.getNameValue()).toBe(existing.name);
    });

    await steps.step('Completing the form and saving shows a duplicate-name error and nothing is saved', async () => {
      await terminologyFormDrawer.next();
      await terminologyFormDrawer.addConfiguredField({ name: 'Code' });
      const answer = await terminologyFormDrawer.save();
      expect(answer.status, 'the duplicate should be refused').not.toBe(200);
      expect([...answer.messages, ...answer.validationErrors].join(' | ')).toMatch(MESSAGE.unique);
      expect((await terminologyManagementPage.fetchRegister()).items.filter((t) => t.name === existing.name)).toHaveLength(1);
    });
  });

  test(`TC-${CASES.nameAtMax.azureId}: should accept and save the terminology when its name is exactly 100 characters long`, async ({
    terminologyManagementPage,
    terminologyFormDrawer,
    discardTerminologyNamed,
    steps,
  }) => {
    const data = CASES.nameAtMax;
    const name = data.name();
    discardTerminologyNamed(name);
    await steps.critical('Navigate to the Terminology Management module and open the new terminology form - the form is displayed', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openAddForm();
    });

    await steps.step('A 100-character name is accepted in full', async () => {
      await terminologyFormDrawer.typeName(name);
      expect(await terminologyFormDrawer.getNameValue()).toHaveLength(data.length);
    });

    await steps.step('Completing the form and saving stores the terminology', async () => {
      await terminologyFormDrawer.fillDescription(data.description);
      await terminologyFormDrawer.next();
      await terminologyFormDrawer.addConfiguredField({ name: 'Code' });
      const answer = await terminologyFormDrawer.save();
      expect(answer.status, answer.validationErrors.join('; ')).toBe(200);
      expect((await terminologyManagementPage.fetchRegister()).items.map((t) => t.name)).toContain(name);
    });
  });

  test(`TC-${CASES.nameOverMax.azureId}: should never store the name when a terminology name longer than 100 characters is entered`, async ({
    terminologyManagementPage,
    terminologyFormDrawer,
    discardTerminologyNamed,
    steps,
  }) => {
    const data = CASES.nameOverMax;
    const name = data.name();
    discardTerminologyNamed(name.slice(0, data.limit));
    await steps.critical('Navigate to the Terminology Management module and open the new terminology form - the form is displayed', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openAddForm();
    });

    await steps.step('A 101-character name is either cut at 100 characters or taken in full', async () => {
      await terminologyFormDrawer.typeName(name);
      expect((await terminologyFormDrawer.getNameValue()).length).toBeLessThanOrEqual(name.length);
    });

    await steps.step('Saving never stores a name longer than 100 characters', async () => {
      await terminologyFormDrawer.fillDescription(data.description);
      await terminologyFormDrawer.next();
      await terminologyFormDrawer.addConfiguredField({ name: 'Code' });
      await terminologyFormDrawer.save();
      const stored = (await terminologyManagementPage.fetchRegister()).items.filter((t) => t.name.startsWith(name.slice(0, 20)));
      expect(stored.filter((t) => t.name.length > data.limit).map((t) => t.name), 'names stored over the limit').toEqual([]);
    });
  });

  test(`TC-${CASES.descriptionAtMax.azureId}: should accept and save the terminology when its description is exactly 250 characters long`, async ({
    terminologyManagementPage,
    terminologyFormDrawer,
    discardTerminologyNamed,
    steps,
  }) => {
    const data = CASES.descriptionAtMax;
    const name = data.name();
    discardTerminologyNamed(name);
    await steps.critical('Navigate to the Terminology Management module and open the new terminology form - the form is displayed', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openAddForm();
    });

    await steps.step('A 250-character description is accepted in full', async () => {
      await terminologyFormDrawer.fillName(name);
      await terminologyFormDrawer.typeDescription(data.description);
      expect(await terminologyFormDrawer.getDescriptionValue()).toHaveLength(data.length);
    });

    await steps.step('Completing the form and saving stores the terminology with the whole description', async () => {
      await terminologyFormDrawer.next();
      await terminologyFormDrawer.addConfiguredField({ name: 'Code' });
      const answer = await terminologyFormDrawer.save();
      expect(answer.status, answer.validationErrors.join('; ')).toBe(200);
      const stored = (await terminologyManagementPage.fetchRegister()).items.find((t) => t.name === name);
      expect(stored?.description).toBe(data.description);
    });
  });

  test(`TC-${CASES.descriptionInvalid.azureId}: should refuse to save when the description is over 250 characters or missing`, async ({
    terminologyManagementPage,
    terminologyFormDrawer,
    discardTerminologyNamed,
    steps,
  }) => {
    const data = CASES.descriptionInvalid;
    const name = data.name();
    discardTerminologyNamed(name);
    await steps.critical('Navigate to the Terminology Management module and open the new terminology form - the form is displayed', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openAddForm();
    });

    await steps.step('A 251-character description is either cut at 250 characters or taken in full', async () => {
      await terminologyFormDrawer.fillName(name);
      await terminologyFormDrawer.typeDescription(data.description);
      expect((await terminologyFormDrawer.getDescriptionValue()).length).toBeLessThanOrEqual(data.description.length);
    });

    await steps.step('Saving never stores a description over 250 characters', async () => {
      await terminologyFormDrawer.next();
      await terminologyFormDrawer.addConfiguredField({ name: 'Code' });
      await terminologyFormDrawer.save();
      const stored = (await terminologyManagementPage.fetchRegister()).items.find((t) => t.name === name);
      expect((stored?.description ?? '').length, 'the stored description length').toBeLessThanOrEqual(data.limit);
    });

    await steps.step('A blank description shows a required-field error and nothing is saved', async () => {
      await terminologyManagementPage.openAddForm();
      await terminologyFormDrawer.fillDetails({ name: `${name} blank`, description: '' });
      const answer = await terminologyFormDrawer.attemptSave();
      expect([...answer.messages, ...answer.validationErrors].join(' | '), 'a required-description error').toMatch(MESSAGE.required);
      expect((await terminologyManagementPage.fetchRegister()).items.map((t) => t.name)).not.toContain(`${name} blank`);
    });
  });

  test(`TC-${CASES.noField.azureId}: should refuse to save the terminology when it has no custom field`, async ({
    terminologyManagementPage,
    terminologyFormDrawer,
    discardTerminologyNamed,
    steps,
  }) => {
    const data = CASES.noField;
    const name = data.name();
    discardTerminologyNamed(name);
    await steps.critical('Navigate to the Terminology Management module and open the new terminology form - the form is displayed', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openAddForm();
    });

    await steps.step('A valid name and description are entered and no field appears in the field list', async () => {
      await terminologyFormDrawer.fillDetails({ name, description: data.description });
      expect(await terminologyFormDrawer.next()).toBe(true);
      expect(await terminologyFormDrawer.countFields()).toBe(0);
    });

    await steps.step('Saving shows a validation error requiring at least one field and nothing is saved', async () => {
      const answer = await terminologyFormDrawer.save();
      expect(answer.status, 'nothing should be saved').not.toBe(200);
      expect([...answer.messages, ...answer.validationErrors].join(' | ')).toMatch(data.fieldError);
      expect((await terminologyManagementPage.fetchRegister()).items.map((t) => t.name)).not.toContain(name);
    });
  });

  test(`TC-${CASES.text.azureId}: should offer None, Alphanumeric, English and Arabic restrictions and a Max Length when the field type is Text`, async ({
    terminologyManagementPage,
    terminologyFormDrawer,
    steps,
  }) => {
    const data = CASES.text;
    await steps.critical('Navigate to the Terminology Management module and open the new terminology form - the form is displayed', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openAddForm();
    });
    let index = -1;

    await steps.critical('Adding a new field shows the field configuration panel', async () => {
      await terminologyFormDrawer.fillDetails({ name: 'Text field probe', description: 'Text restrictions' });
      await terminologyFormDrawer.next();
      index = await terminologyFormDrawer.addField();
    });

    await steps.step('Type Text offers None, Alphanumeric, English Only and Arabic Only, and a Max Length field', async () => {
      await terminologyFormDrawer.choose(index, 'type', FIELD_TYPE.text);
      const options = await terminologyFormDrawer.getOptions(index, 'restriction');
      for (const wanted of data.restrictions) expect(options.some((o) => wanted.test(o)), `${wanted} among ${options.join(', ')}`).toBe(true);
      expect(await terminologyFormDrawer.isControlShown(index, 'maxLength')).toBe(true);
    });

    await steps.step('English Only and a max length are both accepted', async () => {
      await terminologyFormDrawer.choose(index, 'restriction', data.choose);
      await terminologyFormDrawer.setMaxLength(index, data.maxLength);
      expect(await terminologyFormDrawer.getSelected(index, 'restriction')).toBe(data.choose);
      expect(await terminologyFormDrawer.getMaxLength(index)).toBe(String(data.maxLength));
      await terminologyFormDrawer.close();
    });
  });

  test(`TC-${CASES.number.azureId}: should offer Float and Integer restrictions and a Max Length when the field type is Number`, async ({
    terminologyManagementPage,
    terminologyFormDrawer,
    steps,
  }) => {
    const data = CASES.number;
    await steps.critical('Navigate to the Terminology Management module and open the new terminology form - the form is displayed', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openAddForm();
    });
    let index = -1;

    await steps.critical('Adding a new field shows the field configuration panel', async () => {
      await terminologyFormDrawer.fillDetails({ name: 'Number field probe', description: 'Number restrictions' });
      await terminologyFormDrawer.next();
      index = await terminologyFormDrawer.addField();
    });

    await steps.critical('Type Number offers Float and Integer, and a Max Length field', async () => {
      await terminologyFormDrawer.choose(index, 'type', FIELD_TYPE.number);
      const options = await terminologyFormDrawer.getOptions(index, 'restriction');
      for (const wanted of data.restrictions) expect(options.some((o) => wanted.test(o)), `${wanted} among ${options.join(', ')}`).toBe(true);
      expect(await terminologyFormDrawer.isControlShown(index, 'maxLength')).toBe(true);
    });

    await steps.step('Integer and a max length are both accepted', async () => {
      await terminologyFormDrawer.choose(index, 'restriction', data.choose);
      await terminologyFormDrawer.setMaxLength(index, data.maxLength);
      expect(await terminologyFormDrawer.getSelected(index, 'restriction')).toBe(data.choose);
      expect(await terminologyFormDrawer.getMaxLength(index)).toBe(String(data.maxLength));
    });
  });

  test(`TC-${CASES.date.azureId}: should offer only Date Only, Time Only and Date and Time and no Max Length when the field type is Date`, async ({
    terminologyManagementPage,
    terminologyFormDrawer,
    steps,
  }) => {
    const data = CASES.date;
    await steps.critical('Navigate to the Terminology Management module and open the new terminology form - the form is displayed', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openAddForm();
    });
    let index = -1;

    await steps.critical('Adding a new field shows the field configuration panel', async () => {
      await terminologyFormDrawer.fillDetails({ name: 'Date field probe', description: 'Date restrictions' });
      await terminologyFormDrawer.next();
      index = await terminologyFormDrawer.addField();
    });

    await steps.step('Type Date offers Date Only, Time Only and Date and Time, and no Max Length field', async () => {
      await terminologyFormDrawer.choose(index, 'type', FIELD_TYPE.date);
      const options = await terminologyFormDrawer.getOptions(index, 'restriction');
      for (const wanted of data.restrictions) expect(options.some((o) => wanted.test(o)), `${wanted} among ${options.join(', ')}`).toBe(true);
      expect(options).toHaveLength(data.restrictions.length);
      expect(await terminologyFormDrawer.isControlShown(index, 'maxLength')).toBe(false);
    });

    await steps.step('Date and Time is accepted', async () => {
      await terminologyFormDrawer.choose(index, 'restriction', data.choose);
      expect(await terminologyFormDrawer.getSelected(index, 'restriction')).toBe(data.choose);
      await terminologyFormDrawer.close();
    });
  });

  test(`TC-${CASES.list.azureId}: should offer Single and Multi Select and a List Source drawn from the Lookup module when the field type is List`, async ({
    terminologyManagementPage,
    terminologyFormDrawer,
    steps,
  }) => {
    const data = CASES.list;
    await steps.critical('Navigate to the Terminology Management module and open the new terminology form - the form is displayed', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openAddForm();
    });
    let index = -1;
    let sources: string[] = [];

    await steps.critical('Adding a new field shows the field configuration panel', async () => {
      await terminologyFormDrawer.fillDetails({ name: 'List field probe', description: 'List restrictions' });
      await terminologyFormDrawer.next();
      index = await terminologyFormDrawer.addField();
    });

    await steps.step('Type List offers Single Select and Multi Select, and a List Source field', async () => {
      await terminologyFormDrawer.choose(index, 'type', FIELD_TYPE.list);
      const options = await terminologyFormDrawer.getOptions(index, 'restriction');
      for (const wanted of data.restrictions) expect(options.some((o) => wanted.test(o)), `${wanted} among ${options.join(', ')}`).toBe(true);
      expect(await terminologyFormDrawer.isControlShown(index, 'listSource')).toBe(true);
    });

    await steps.step('The List Source options are the Lookup module\'s lists', async () => {
      sources = await terminologyFormDrawer.getOptions(index, 'listSource');
      const lookups = await terminologyManagementPage.fetchLookupNames();
      expect(sources.length).toBeGreaterThan(0);
      expect(sources.filter((s) => !lookups.includes(s)), 'sources that are not Lookup lists').toEqual([]);
    });

    await steps.step('Single Select and a List Source are both accepted', async () => {
      await terminologyFormDrawer.choose(index, 'restriction', data.choose);
      await terminologyFormDrawer.choose(index, 'listSource', sources[0]);
      expect(await terminologyFormDrawer.getSelected(index, 'restriction')).toBe(data.choose);
      expect(await terminologyFormDrawer.getSelected(index, 'listSource')).toBe(sources[0]);
      await terminologyFormDrawer.close();
    });
  });

  test(`TC-${CASES.mapping.azureId}: should offer the chosen terminology's fields when a Mapping Identifier field is linked to a terminology`, async ({
    terminologyManagementPage,
    terminologyFormDrawer,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.mapping;
    const target = await terminologyIn({ name: data.target.name(), fields: [{ name: data.target.field, type: 'text', required: true, unique: true }] });
    await steps.critical('Navigate to the Terminology Management module and open the new terminology form - the form is displayed', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openAddForm();
    });
    let index = -1;

    await steps.critical('Adding a new field shows the field configuration panel', async () => {
      await terminologyFormDrawer.fillDetails({ name: 'Mapping field probe', description: 'Mapping restrictions' });
      await terminologyFormDrawer.next();
      index = await terminologyFormDrawer.addField();
    });

    await steps.step('Type Mapping Identifier offers Single and Multi Select, and a Mapping Terminology field', async () => {
      await terminologyFormDrawer.choose(index, 'type', FIELD_TYPE.mapping);
      const options = await terminologyFormDrawer.getOptions(index, 'restriction');
      for (const wanted of data.restrictions) expect(options.some((o) => wanted.test(o)), `${wanted} among ${options.join(', ')}`).toBe(true);
      expect(await terminologyFormDrawer.isControlShown(index, 'mappingTerminology')).toBe(true);
    });

    await steps.step(`Choosing "${target.name}" populates the Mapping Field dropdown with that terminology's fields`, async () => {
      await terminologyFormDrawer.choose(index, 'mappingTerminology', target.name);
      expect(await terminologyFormDrawer.getOptions(index, 'mappingField')).toContain(data.target.field);
    });

    await steps.step('A Mapping Field and a restriction are both accepted', async () => {
      await terminologyFormDrawer.choose(index, 'mappingField', data.target.field);
      await terminologyFormDrawer.choose(index, 'restriction', data.choose);
      expect(await terminologyFormDrawer.getSelected(index, 'mappingField')).toBe(data.target.field);
      expect(await terminologyFormDrawer.getSelected(index, 'restriction')).toBe(data.choose);
      await terminologyFormDrawer.close();
    });
  });

  test(`TC-${CASES.boolean.azureId}: should offer no restriction or max length and save the field when the field type is Boolean`, async ({
    terminologyManagementPage,
    terminologyFormDrawer,
    discardTerminologyNamed,
    steps,
  }) => {
    const data = CASES.boolean;
    const name = data.name();
    discardTerminologyNamed(name);
    await steps.critical('Navigate to the Terminology Management module and open the new terminology form - the form is displayed', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openAddForm();
    });
    let index = -1;

    await steps.critical('Adding a new field shows the field configuration panel', async () => {
      await terminologyFormDrawer.fillDetails({ name, description: data.description });
      await terminologyFormDrawer.next();
      index = await terminologyFormDrawer.addField();
    });

    await steps.step('Type Boolean shows no Restriction options and no Max Length field', async () => {
      await terminologyFormDrawer.configureField(index, { name: data.field, type: FIELD_TYPE.boolean });
      expect(await terminologyFormDrawer.isControlShown(index, 'restriction'), 'a Restriction control on a Boolean field').toBe(false);
      expect(await terminologyFormDrawer.isControlShown(index, 'maxLength'), 'a Max Length control on a Boolean field').toBe(false);
    });

    await steps.step('Saving adds the Boolean field', async () => {
      const answer = await terminologyFormDrawer.save();
      expect(answer.status, answer.validationErrors.join('; ')).toBe(200);
      const stored = (await terminologyManagementPage.fetchRegister()).items.find((t) => t.name === name);
      expect(stored, `"${name}" should be stored`).toBeDefined();
      expect((await terminologyManagementPage.fetchTerminology(stored?.id ?? ''))?.fields.map((f) => f.name)).toContain(data.field);
    });
  });

  test(`TC-${CASES.flags.azureId}: should store Required, Unique and Show in Table exactly as set when they are combined independently on a field`, async ({
    terminologyManagementPage,
    terminologyFormDrawer,
    terminologyDetailPage,
    discardTerminologyNamed,
    steps,
  }) => {
    const data = CASES.flags;
    const name = data.name();
    discardTerminologyNamed(name);
    await steps.critical('Navigate to the Terminology Management module and open the new terminology form - the form is displayed', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openAddForm();
    });

    await steps.critical('Adding a new field shows the field configuration panel', async () => {
      await terminologyFormDrawer.fillDetails({ name, description: data.description });
      await terminologyFormDrawer.next();
      await terminologyFormDrawer.addConfiguredField({ name: data.field });
      expect(await terminologyFormDrawer.getFieldNames()).toEqual([data.field]);
    });

    await steps.critical('With only Required checked, the saved field is required but neither unique nor shown in the table', async () => {
      await terminologyFormDrawer.configureField(0, { required: true, unique: false, showInTable: false });
      expect((await terminologyFormDrawer.save()).status).toBe(200);
      await terminologyManagementPage.openDetails(name);
      const field = (await terminologyDetailPage.readFields()).find((f) => f.name === data.field);
      expect({ required: field?.required, unique: field?.unique, showInTable: field?.showInTable }).toEqual({ required: expect.stringMatching(data.yes), unique: expect.stringMatching(data.no), showInTable: expect.stringMatching(data.no) });
    });

    await steps.step('Editing the field with all three checked saves all three together', async () => {
      await terminologyDetailPage.openEditForm();
      await terminologyFormDrawer.next();
      const index = await terminologyFormDrawer.fieldIndexOf(data.field);
      await terminologyFormDrawer.configureField(index, { required: true, unique: true, showInTable: true });
      expect((await terminologyFormDrawer.save()).status).toBe(200);
      const field = (await terminologyDetailPage.readFields()).find((f) => f.name === data.field);
      expect({ required: field?.required, unique: field?.unique, showInTable: field?.showInTable }).toEqual({ required: expect.stringMatching(data.yes), unique: expect.stringMatching(data.yes), showInTable: expect.stringMatching(data.yes) });
    });
  });

  test(`TC-${CASES.integerParity.azureId}: should reject a decimal in an integer-restricted field both when it is typed and when it is imported`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyRecordDialog,
    terminologyImportDialog,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.integerParity;
    const terminology = await terminologyIn({ fields: [{ name: 'Code', type: 'text', required: true, unique: true }, data.field] });
    const quantityId = terminology.fieldIds[data.field.name];

    await steps.critical('Navigate to the Terminology Management module - the module landing page loads', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
    });

    await steps.step(`Typing ${data.invalid} into the integer field is rejected with a validation message`, async () => {
      await terminologyDetailPage.openAddRecord();
      await terminologyRecordDialog.fill(terminology.fieldIds.Code, data.code);
      await terminologyRecordDialog.fill(quantityId, data.invalid);
      const answer = await terminologyRecordDialog.save();
      expect(answer.status, `the server answered ${answer.status}`).not.toBe(200);
      expect([...answer.messages, ...answer.validationErrors].join(' | ')).toMatch(MESSAGE.format);
      expect((await terminologyManagementPage.fetchRecords(terminology.id)).map((r) => r.cells.Code)).not.toContain(data.code);
    });

    await steps.step(`Importing ${data.invalid} for the same field flags the record with the same restriction error`, async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
      await terminologyDetailPage.openImport();
      await terminologyImportDialog.chooseFile(xlsxUpload(['Code', data.field.name, IS_ACTIVE_FIELD], [[`${data.code}-IMP`, data.invalid, 'true']]));
      expect((await terminologyImportDialog.upload()).status).toBe(200);
      await terminologyManagementPage.waitForImportToFinish(terminology.id);
      const failed = await terminologyManagementPage.fetchErrorRows(terminology.id);
      const errors = failed.flatMap((row) => row.cells.filter((c) => c.fieldName === data.field.name && c.error !== '').map((c) => c.error));
      expect(errors.join(' | '), 'the imported decimal should be flagged').toMatch(MESSAGE.format);
    });
  });

  test(`TC-${CASES.typeChange.azureId}: should clear the List restriction and source and show Text restrictions when a List field is changed to Text`, async ({
    terminologyManagementPage,
    terminologyFormDrawer,
    steps,
  }) => {
    const data = CASES.typeChange;
    await steps.critical('Navigate to the Terminology Management module and open the new terminology form - the form is displayed', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openAddForm();
    });
    let index = -1;
    let source = '';

    await steps.critical('A field configured as List with Single Select and a List Source keeps those selections', async () => {
      await terminologyFormDrawer.fillDetails({ name: 'Type change probe', description: 'List to Text' });
      await terminologyFormDrawer.next();
      index = await terminologyFormDrawer.addField();
      await terminologyFormDrawer.choose(index, 'type', data.from);
      source = (await terminologyFormDrawer.getOptions(index, 'listSource'))[0];
      await terminologyFormDrawer.configureField(index, { restriction: 'Single Select', listSource: source });
      expect(await terminologyFormDrawer.getSelected(index, 'listSource')).toBe(source);
    });

    await steps.step('Changing the type to Text clears the List restriction and source and shows Text restrictions instead', async () => {
      await terminologyFormDrawer.choose(index, 'type', data.to);
      expect(await terminologyFormDrawer.isControlShown(index, 'listSource'), 'the List Source control after switching to Text').toBe(false);
      expect(await terminologyFormDrawer.getSelected(index, 'restriction')).not.toBe('Single Select');
      const options = await terminologyFormDrawer.getOptions(index, 'restriction');
      expect(options.some((o) => /English/i.test(o)), `Text restrictions among ${options.join(', ')}`).toBe(true);
      await terminologyFormDrawer.close();
    });
  });

  test(`TC-${CASES.rapidSwitch.azureId}: should show exactly the controls each type needs with no leftovers when the type is switched rapidly`, async ({
    terminologyManagementPage,
    terminologyFormDrawer,
    steps,
  }) => {
    await steps.critical('Navigate to the Terminology Management module and open the new terminology form - the form is displayed', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openAddForm();
    });
    let index = -1;

    await steps.critical('Adding a new field shows the field configuration panel', async () => {
      await terminologyFormDrawer.fillDetails({ name: 'Rapid switch probe', description: 'Type switching' });
      await terminologyFormDrawer.next();
      index = await terminologyFormDrawer.addField();
    });

    await steps.step('Each type in turn shows its own restriction and dependent controls and nothing left from the previous type', async () => {
      const seen: string[] = [];
      for (const type of CASES.rapidSwitch.order) {
        await terminologyFormDrawer.choose(index, 'type', type);
        const shown = (await terminologyFormDrawer.getShownControls(index)).filter((c) => DEPENDENT_CONTROLS.includes(c));
        seen.push(`${type}: ${[...shown].sort().join(',')}`);
      }
      const expected = CASES.rapidSwitch.order.map((type) => `${type}: ${[...CONTROLS_BY_TYPE[type]].sort().join(',')}`);
      expect(seen).toEqual(expected);
      await terminologyFormDrawer.close();
    });
  });

  test(`TC-${CASES.noCreatePermission.azureId}: should withhold creating a terminology when the user's role lacks the create permission`, async ({
    terminologyManagementPage,
    shapedNonAdmin,
    requireListAccess,
    requireBaseline,
    steps,
  }) => {
    const data = CASES.noCreatePermission;
    await terminologyManagementPage.open();
    requireBaseline(await terminologyManagementPage.isAddOffered(), 'Add Terminology');
    const session = await shapedNonAdmin(data.granted);
    await requireListAccess(session);

    await steps.step('The module loads but the option to create a terminology is unavailable', async () => {
      await session.terminologies.openExpectingDenial();
      expect(await session.terminologies.isAddOffered(), 'Add Terminology for a role without the create right').toBe(false);
    });

    await steps.step('Creating through any other path stays blocked', async () => {
      const answer = await session.terminologies.sendCreate(data.name());
      expect(answer.status, `the server answered ${answer.status}`).toBeGreaterThanOrEqual(400);
      expect(answer.id).toBeNull();
    });
  });
});
