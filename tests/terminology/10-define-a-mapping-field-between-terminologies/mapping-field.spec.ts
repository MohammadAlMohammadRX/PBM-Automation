import { test, expect } from '../../../fixtures';
import { FIELD_TYPE, MESSAGE } from '../../../data/terminology/terminology.data';
import { CASES, MAPPING_FIELD_NAME, levelFields } from '../../../data/terminology/mappingField.data';
import { mappingTo } from '../../../data/terminology/retireValues.data';

/**
 * User story 15155: Define a Mapping Field Between Terminologies.
 * Linking a terminology's field to another terminology's UNIQUE field to build
 * a hierarchy: the required selections, the uniqueness and self-reference
 * rules, resolution tracking the referenced terminology's status, a four-level
 * chain, and who may define a mapping.
 */
test.describe('US 15155 - Define a Mapping Field Between Terminologies', () => {
  test(`TC-${CASES.link.azureId}: should save the mapping field under City's fields when City is linked to Country through its unique field`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyFormDrawer,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.link;
    const country = await terminologyIn({ name: data.country(), fields: levelFields(data.key) });
    const city = await terminologyIn({ name: data.city(), fields: levelFields('City Code') });
    let index = -1;

    await steps.critical('Navigate to the Terminology Management module - the module home page is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.critical('View opens the City terminology with its field list', async () => {
      await terminologyManagementPage.openDetails(city.name);
      expect((await terminologyDetailPage.readFields()).map((f) => f.name)).toContain('City Code');
    });

    await steps.critical('Adding a mapping field opens its configuration panel', async () => {
      await terminologyDetailPage.openEditForm();
      await terminologyFormDrawer.next();
      index = await terminologyFormDrawer.addConfiguredField({ name: MAPPING_FIELD_NAME, type: FIELD_TYPE.mapping });
      expect(await terminologyFormDrawer.isControlShown(index, 'mappingTerminology')).toBe(true);
    });

    await steps.step(`Choosing "${country.name}" fills the field selector with its fields`, async () => {
      await terminologyFormDrawer.choose(index, 'mappingTerminology', country.name);
      expect(await terminologyFormDrawer.getOptions(index, 'mappingField')).toContain(data.key);
    });

    await steps.step(`The unique field "${data.key}" is selected`, async () => {
      await terminologyFormDrawer.choose(index, 'mappingField', data.key);
      expect(await terminologyFormDrawer.getSelected(index, 'mappingField')).toBe(data.key);
    });

    await steps.step('Saving lists the mapping field under City\'s field definitions', async () => {
      const answer = await terminologyFormDrawer.save();
      expect(answer.status, answer.validationErrors.join('; ')).toBe(200);
      const field = (await terminologyDetailPage.readFields()).find((f) => f.name === MAPPING_FIELD_NAME);
      expect(field?.type).toBe(FIELD_TYPE.mapping);
      const stored = (await terminologyManagementPage.fetchTerminology(city.id))?.fields.find((f) => f.name === MAPPING_FIELD_NAME);
      expect({ target: stored?.mappingIdentifiedTerminologyId, field: stored?.mappingIdentifierFieldId }).toEqual({ target: country.id, field: country.fieldIds[data.key] });
    });
  });

  test(`TC-${CASES.noTerminology.azureId}: should refuse to save the mapping field when no referenced terminology is selected`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyFormDrawer,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.noTerminology;
    const district = await terminologyIn({ name: data.district(), fields: levelFields('District Code') });
    let index = -1;

    await steps.critical('Opening District and adding a mapping field opens its configuration panel', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(district.name);
      await terminologyDetailPage.openEditForm();
      await terminologyFormDrawer.next();
      index = await terminologyFormDrawer.addConfiguredField({ name: MAPPING_FIELD_NAME, type: FIELD_TYPE.mapping });
    });

    await steps.step('The terminology selector shows no value', async () => {
      expect(await terminologyFormDrawer.getSelected(index, 'mappingTerminology')).toMatch(/select/i);
    });

    await steps.step('Saving says a terminology must be selected and nothing is saved', async () => {
      const answer = await terminologyFormDrawer.save();
      expect(answer.status).not.toBe(200);
      expect([...answer.messages, ...answer.validationErrors].join(' | ')).toMatch(data.error);
      expect((await terminologyManagementPage.fetchTerminology(district.id))?.fields.map((f) => f.name)).not.toContain(MAPPING_FIELD_NAME);
    });
  });

  test(`TC-${CASES.noField.azureId}: should refuse to save the mapping field when no referenced field is selected`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyFormDrawer,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.noField;
    const city = await terminologyIn({ name: data.city(), fields: levelFields('City Code') });
    const district = await terminologyIn({ name: data.district(), fields: levelFields('District Code') });
    let index = -1;

    await steps.critical('Opening District and adding a mapping field opens its configuration panel', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(district.name);
      await terminologyDetailPage.openEditForm();
      await terminologyFormDrawer.next();
      index = await terminologyFormDrawer.addConfiguredField({ name: MAPPING_FIELD_NAME, type: FIELD_TYPE.mapping });
    });

    await steps.step(`"${city.name}" is selected and the field selector stays unset`, async () => {
      await terminologyFormDrawer.choose(index, 'mappingTerminology', city.name);
      expect(await terminologyFormDrawer.getSelected(index, 'mappingField')).toMatch(/select/i);
    });

    await steps.step('Saving says a field must be selected and nothing is saved', async () => {
      const answer = await terminologyFormDrawer.save();
      expect(answer.status).not.toBe(200);
      expect([...answer.messages, ...answer.validationErrors].join(' | ')).toMatch(data.error);
      expect((await terminologyManagementPage.fetchTerminology(district.id))?.fields.map((f) => f.name)).not.toContain(MAPPING_FIELD_NAME);
    });
  });

  test(`TC-${CASES.notUnique.azureId}: should refuse the mapping when the referenced field is not marked unique`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyFormDrawer,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.notUnique;
    const city = await terminologyIn({ name: data.city(), fields: levelFields('City Code') });
    const district = await terminologyIn({ name: data.district(), fields: levelFields('District Code') });
    let index = -1;
    let attempt: { chosen: boolean; messages: string[] } = { chosen: false, messages: [] };

    await steps.critical('Opening District and adding a mapping field opens its configuration panel', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(district.name);
      await terminologyDetailPage.openEditForm();
      await terminologyFormDrawer.next();
      index = await terminologyFormDrawer.addConfiguredField({ name: MAPPING_FIELD_NAME, type: FIELD_TYPE.mapping });
    });

    await steps.step(`Selecting "${city.name}" shows City's field list`, async () => {
      await terminologyFormDrawer.choose(index, 'mappingTerminology', city.name);
      expect((await terminologyFormDrawer.getOptions(index, 'mappingField')).length).toBeGreaterThan(0);
    });

    await steps.step(`The non-unique field "${data.field}" is selected`, async () => {
      attempt = await terminologyFormDrawer.tryChoose(index, 'mappingField', data.field);
      expect(attempt.chosen, `"${data.field}" offered as a mapping target`).toBe(true);
    });

    await steps.step('Saving reports that the referenced field must be unique and nothing is saved', async () => {
      const answer = await terminologyFormDrawer.save();
      expect(answer.status).not.toBe(200);
      expect([...answer.messages, ...answer.validationErrors].join(' | ')).toMatch(data.error);
      expect((await terminologyManagementPage.fetchTerminology(district.id))?.fields.map((f) => f.name)).not.toContain(MAPPING_FIELD_NAME);
    });
  });

  test(`TC-${CASES.inactiveTarget.azureId}: should not resolve the mapping and should say why when the mapped terminology is inactive`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyRecordDialog,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.inactiveTarget;
    const country = await terminologyIn({ name: data.country(), fields: levelFields('Country Code'), records: [{ 'Country Code': data.value }], active: false });
    const city = await terminologyIn({ name: data.city(), fields: [...levelFields('City Code'), mappingTo(country.id, country.fieldIds['Country Code'], 'Country')] });

    await steps.critical('Navigate to the Terminology Management module - the module home page is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.critical('Viewing the City terminology shows the mapping field', async () => {
      await terminologyManagementPage.openDetails(city.name);
      expect((await terminologyDetailPage.readFields()).map((f) => f.name)).toContain('Country');
    });

    await steps.step('Resolving a value through the Country reference fails with a message that it is inactive', async () => {
      await terminologyDetailPage.openAddRecord();
      const panel = await terminologyRecordDialog.getSelectPanelText(city.fieldIds.Country);
      await terminologyRecordDialog.cancel();
      expect(panel, 'the reference should not offer the inactive terminology\'s values').not.toContain(data.value);
      expect(panel, 'a message that the referenced terminology is inactive').toMatch(MESSAGE.inactive);
    });
  });

  test(`TC-${CASES.activeTarget.azureId}: should resolve the mapping to the referenced records and allow selecting exactly one when the target is active`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyRecordDialog,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.activeTarget;
    const country = await terminologyIn({ name: data.country(), fields: levelFields('Country Code'), records: data.values.map((v) => ({ 'Country Code': v })) });
    const city = await terminologyIn({ name: data.city(), fields: [...levelFields('City Code'), mappingTo(country.id, country.fieldIds['Country Code'], 'Country')] });

    await steps.critical('Viewing the City terminology shows the mapping field', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(city.name);
      expect((await terminologyDetailPage.readFields()).map((f) => f.name)).toContain('Country');
    });

    await steps.step('The Country reference lists the Country records and exactly one can be selected', async () => {
      await terminologyDetailPage.openAddRecord();
      expect(await terminologyRecordDialog.getOptions(city.fieldIds.Country)).toEqual(expect.arrayContaining([...data.values]));
      await terminologyRecordDialog.choose(city.fieldIds.Country, data.values[0]);
      expect(await terminologyRecordDialog.getSelected(city.fieldIds.Country)).toBe(data.values[0]);
      await terminologyRecordDialog.cancel();
    });
  });

  test(`TC-${CASES.chain.azureId}: should resolve each level to exactly one parent when Country, City, District and Street are chained by mapping fields`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyFormDrawer,
    terminologyIn,
    recordIn,
    steps,
  }) => {
    const levels = CASES.chain.levels;
    const country = await terminologyIn({ name: levels[0].name(), fields: levelFields(levels[0].key) });
    const city = await terminologyIn({ name: levels[1].name(), fields: levelFields(levels[1].key) });
    const district = await terminologyIn({ name: levels[2].name(), fields: levelFields(levels[2].key) });
    const street = await terminologyIn({ name: levels[3].name(), fields: levelFields(levels[3].key) });

    await steps.critical('Navigate to the Terminology Management module - the module home page is displayed', async () => {
      await terminologyManagementPage.open();
    });

    for (const [child, parent, key] of [[city, country, levels[0].key], [district, city, levels[1].key], [street, district, levels[2].key]] as const) {
      await steps.critical(`${child.name} is linked to ${parent.name} and saved`, async () => {
        await terminologyDetailPage.open(child.id);
        await terminologyDetailPage.openEditForm();
        await terminologyFormDrawer.next();
        await terminologyFormDrawer.addConfiguredField({ name: MAPPING_FIELD_NAME, type: FIELD_TYPE.mapping, mappingTerminology: parent.name, mappingField: key, restriction: 'Single Select' });
        expect((await terminologyFormDrawer.save()).status).toBe(200);
      });
    }

    await steps.step('A Street record traced up the chain resolves to exactly one parent at each level', async () => {
      const ids = [await recordIn(country.id, { [levels[0].key]: levels[0].value })];
      ids.push(await recordIn(city.id, { [levels[1].key]: levels[1].value, [MAPPING_FIELD_NAME]: ids[0] }));
      ids.push(await recordIn(district.id, { [levels[2].key]: levels[2].value, [MAPPING_FIELD_NAME]: ids[1] }));
      ids.push(await recordIn(street.id, { [levels[3].key]: levels[3].value, [MAPPING_FIELD_NAME]: ids[2] }));
      const traced: string[][] = [];
      for (const [i, terminology] of [street, district, city].entries()) {
        const records = await terminologyManagementPage.fetchRecords(terminology.id);
        traced.push(records.filter((r) => r.cells[levels[3 - i].key] === levels[3 - i].value).map((r) => r.cells[MAPPING_FIELD_NAME]));
      }
      expect(traced).toEqual([[levels[2].value], [levels[1].value], [levels[0].value]]);
    });
  });

  test(`TC-${CASES.singleUnique.azureId}: should offer only the one unique field and save the mapping when the target has exactly one`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyFormDrawer,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.singleUnique;
    const region = await terminologyIn({ name: data.region(), fields: levelFields(data.key) });
    const host = await terminologyIn({ name: data.host(), fields: levelFields('Province Code') });
    let index = -1;

    await steps.step(`Adding a mapping field referencing "${region.name}" lists only its single unique field`, async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(host.name);
      await terminologyDetailPage.openEditForm();
      await terminologyFormDrawer.next();
      index = await terminologyFormDrawer.addConfiguredField({ name: MAPPING_FIELD_NAME, type: FIELD_TYPE.mapping, mappingTerminology: region.name });
      expect(await terminologyFormDrawer.getOptions(index, 'mappingField')).toEqual([data.key]);
    });

    await steps.step(`Selecting "${data.key}" and saving stores the mapping`, async () => {
      await terminologyFormDrawer.choose(index, 'mappingField', data.key);
      expect((await terminologyFormDrawer.save()).status).toBe(200);
      expect((await terminologyManagementPage.fetchTerminology(host.id))?.fields.find((f) => f.name === MAPPING_FIELD_NAME)?.mappingIdentifierFieldId).toBe(region.fieldIds[data.key]);
    });
  });

  test(`TC-${CASES.tracksStatus.azureId}: should stop and then resume resolving when the referenced terminology is deactivated and reactivated`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyRecordDialog,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.tracksStatus;
    const country = await terminologyIn({ name: data.country(), fields: levelFields('Country Code'), records: [{ 'Country Code': data.value }] });
    const city = await terminologyIn({ name: data.city(), fields: [...levelFields('City Code'), mappingTo(country.id, country.fieldIds['Country Code'], 'Country')] });

    await steps.critical('Navigate to the Terminology Management module - the module home page is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.critical('Country\'s status changes to inactive and is saved', async () => {
      await terminologyManagementPage.deactivate(country.name);
      expect((await terminologyManagementPage.fetchTerminology(country.id))?.isActive).toBe(false);
    });

    await steps.step('Resolving a reference on City fails with an inactive-terminology message', async () => {
      await terminologyDetailPage.open(city.id);
      await terminologyDetailPage.openAddRecord();
      const panel = await terminologyRecordDialog.getSelectPanelText(city.fieldIds.Country);
      await terminologyRecordDialog.cancel();
      expect(panel).not.toContain(data.value);
      expect(panel).toMatch(MESSAGE.inactive);
    });

    await steps.critical('Reactivating Country returns it to active', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.activate(country.name);
      expect((await terminologyManagementPage.fetchTerminology(country.id))?.isActive).toBe(true);
    });

    await steps.step('Resolving the reference on City succeeds again', async () => {
      await terminologyDetailPage.open(city.id);
      await terminologyDetailPage.openAddRecord();
      expect(await terminologyRecordDialog.getOptions(city.fieldIds.Country)).toContain(data.value);
      await terminologyRecordDialog.cancel();
    });
  });

  test(`TC-${CASES.selfMapping.azureId}: should refuse the mapping field when a terminology is mapped to itself`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyFormDrawer,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.selfMapping;
    const city = await terminologyIn({ name: data.city(), fields: levelFields(data.key) });
    let index = -1;

    await steps.critical('Opening City and adding a mapping field opens its configuration panel', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(city.name);
      await terminologyDetailPage.openEditForm();
      await terminologyFormDrawer.next();
      index = await terminologyFormDrawer.addConfiguredField({ name: MAPPING_FIELD_NAME, type: FIELD_TYPE.mapping });
    });

    let attempt: Awaited<ReturnType<typeof terminologyFormDrawer.attemptMappingTo>> = { offered: false, status: -1, validationErrors: [], messages: [], closed: false };
    await steps.step('City itself and one of its own fields are chosen in the form', async () => {
      attempt = await terminologyFormDrawer.attemptMappingTo(index, city.name, data.key);
      expect(!attempt.offered || attempt.status !== -1, 'the form should either withhold City as its own target or send the save').toBe(true);
    });

    await steps.step('Saving is refused because a terminology cannot map to itself', async () => {
      // Either refusal satisfies the case: City not offered as its own target, or the save refused with a reason.
      expect(!attempt.offered || attempt.status !== 200, `self-mapping was offered and saved (${attempt.status})`).toBe(true);
      expect(!attempt.offered || data.error.test([...attempt.messages, ...attempt.validationErrors].join(' | ')), 'a reason the mapping is refused').toBe(true);
      expect((await terminologyManagementPage.fetchTerminology(city.id))?.fields.map((f) => f.name)).not.toContain(MAPPING_FIELD_NAME);
    });
  });

  test(`TC-${CASES.rapidSwitch.azureId}: should accept only the unique field as the target when the field selections are switched rapidly`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyFormDrawer,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.rapidSwitch;
    const district = await terminologyIn({ name: data.district(), fields: [{ name: data.unique, type: 'text', required: true, unique: true }, { name: data.notUnique, type: 'text' }] });
    const street = await terminologyIn({ name: data.street(), fields: levelFields('Street Code') });
    let index = -1;

    await steps.critical('Opening Street and adding a mapping field to District shows District\'s fields', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(street.name);
      await terminologyDetailPage.openEditForm();
      await terminologyFormDrawer.next();
      index = await terminologyFormDrawer.addConfiguredField({ name: MAPPING_FIELD_NAME, type: FIELD_TYPE.mapping, mappingTerminology: district.name });
    });

    await steps.step('Switching between the non-unique and the unique field in different orders accepts only the unique one', async () => {
      const silent: string[] = [];
      for (const field of data.switches) {
        const attempt = await terminologyFormDrawer.tryChoose(index, 'mappingField', field);
        silent.push(...[field].filter(() => attempt.chosen && field === data.notUnique && !data.warning.test(attempt.messages.join(' '))));
      }
      expect(silent, 'the non-unique field accepted without a warning').toEqual([]);
    });

    await steps.step('Saving with the unique field selected stores the mapping', async () => {
      await terminologyFormDrawer.choose(index, 'mappingField', data.unique);
      expect((await terminologyFormDrawer.save()).status).toBe(200);
      expect((await terminologyManagementPage.fetchTerminology(street.id))?.fields.find((f) => f.name === MAPPING_FIELD_NAME)?.mappingIdentifierFieldId).toBe(district.fieldIds[data.unique]);
    });
  });

  test(`TC-${CASES.guidance.azureId}: should label both mapping selectors as required and highlight both when the form is submitted empty`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyFormDrawer,
    terminologyIn,
    steps,
  }) => {
    const host = await terminologyIn({ fields: levelFields('Code') });
    let index = -1;

    await steps.critical('Opening a terminology and adding a mapping field shows the configuration panel', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(host.name);
      await terminologyDetailPage.openEditForm();
      await terminologyFormDrawer.next();
      index = await terminologyFormDrawer.addConfiguredField({ name: MAPPING_FIELD_NAME, type: FIELD_TYPE.mapping });
    });

    await steps.step('The terminology and field selectors are both labelled and marked required', async () => {
      const required = (await terminologyFormDrawer.getRequiredLabels(index)).join(' | ');
      expect(required, 'the Mapping Terminology label marked required').toMatch(/terminology/i);
      expect(required, 'the Mapping Field label marked required').toMatch(/mapping field|field/i);
    });

    await steps.step('Submitting with both empty highlights both with validation messages and saves nothing', async () => {
      const answer = await terminologyFormDrawer.save();
      expect(answer.status).not.toBe(200);
      const messages = [...answer.messages, ...answer.validationErrors].join(' | ');
      expect(messages).toMatch(/terminology/i);
      expect(messages).toMatch(/field/i);
    });
  });

  test(`TC-${CASES.noPermission.azureId}: should block creating or changing a mapping field when the user is not a Reference Data Administrator`, async ({
    terminologyManagementPage,
    terminologyIn,
    shapedNonAdmin,
    requireListAccess,
    steps,
  }) => {
    const country = await terminologyIn({ fields: levelFields('Country Code') });
    const city = await terminologyIn({ fields: levelFields('City Code') });
    const session = await shapedNonAdmin(CASES.noPermission.granted);
    await requireListAccess(session);

    await steps.critical('Navigate to the Terminology Management module - the module home page is displayed', async () => {
      await session.terminologyDetail.openExpectingFailure(city.id);
      expect(await session.terminologyDetail.isLoaded()).toBe(true);
    });

    await steps.step('Viewing City offers no usable option to add or edit a mapping field', async () => {
      expect((await session.terminologyDetail.getActionState('edit')).availability).not.toBe('available');
    });

    await steps.step('Saving a mapping field directly is blocked with an insufficient-permissions answer', async () => {
      const answer = await session.terminologies.sendUpdate(city.id, { addFields: [mappingTo(country.id, country.fieldIds['Country Code'], MAPPING_FIELD_NAME)] });
      expect(answer.status, `the server answered ${answer.status}`).toBeGreaterThanOrEqual(400);
      expect((await terminologyManagementPage.fetchTerminology(city.id))?.fields.map((f) => f.name)).not.toContain(MAPPING_FIELD_NAME);
    });
  });
});
