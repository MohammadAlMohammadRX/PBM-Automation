import { test, expect, normalise, requirePredefined } from '../../../utils/lookup/writerBHelpers';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { LookupRegisterPage } from '../../../pages/lookup/LookupPages';
import { readLookupItems } from '../../../utils/lookup/lookupApi';
import {
  ACTIVATION_SUFFIXES,
  CASES,
  HOME_LIST,
  IN_USE_MESSAGE,
  NO_PREDEFINED_BLOCKED,
  PREDEFINED_GUIDANCE,
} from '../../../data/lookup/viewLookupItemList.data';

/**
 * User story 20854: View Lookup Item List - the row actions: Edit / Delete
 * disabled on predefined values (with the guidance), usable on the suite's own
 * items, Delete refused for a value in use, and Activate / Inactivate only on
 * admin-added values. Predefined rows are inspected, never acted on.
 */

async function navigate(steps: TestSteps, register: LookupRegisterPage): Promise<void> {
  await steps.critical('Navigate to the Lookups Management module - the screen loads', async () => {
    await register.open();
    await expect(register.control('searchInput'), 'the Lookups register toolbar').toBeVisible();
  });
}

const ALL_ABSENT = Object.fromEntries(ACTIVATION_SUFFIXES.map((suffix) => [suffix, 'absent']));

test.describe('US 20854 - View Lookup Item List (row actions)', () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test(`TC-${CASES.predefinedLocked.azureId}: should disable Edit and Delete on a predefined value and explain why`, async ({ page, steps, lookupRegister, itemsView }) => {
    const system = requirePredefined(steps, await readLookupItems(page, HOME_LIST), NO_PREDEFINED_BLOCKED);
    const systemId = system?.id ?? '';
    await navigate(steps, lookupRegister);

    await steps.critical('Open the "Lookup Items" screen - the grid lists items including the predefined one', async () => {
      await itemsView.openList(HOME_LIST);
      expect(await itemsView.findRow(systemId), `the predefined item ${system?.code} on the grid`).toBe(true);
    });

    await steps.step('Locate the predefined item\'s row and check the Edit and Delete buttons - Edit and Delete are disabled on the predefined item', async () => {
      await itemsView.findRow(systemId);
      await expect.poll(() => itemsView.actionStates(systemId, ['edit', 'delete']), { message: `Edit / Delete on ${system?.code}` }).toEqual({ edit: 'disabled', delete: 'disabled' });
    });

    await steps.step(`Check the screen for guidance text - the message "${PREDEFINED_GUIDANCE}" is displayed`, async () => {
      const seen = await itemsView.predefinedGuidance(systemId);
      const wanted = normalise(PREDEFINED_GUIDANCE);
      expect(
        [seen.screen, seen.hints, seen.tooltips].some((text) => normalise(text).includes(wanted)),
        `"${PREDEFINED_GUIDANCE}" - screen text: "${seen.screen.slice(0, 300)}"; Edit / Delete titles: "${seen.hints}"; tooltips on hover: "${seen.tooltips}"`,
      ).toBe(true);
    });
  });

  test(`TC-${CASES.editDeleteOwn.azureId}: should offer Edit and Delete on an admin-added value and remove it when Delete is confirmed`, async ({
    page,
    steps,
    suiteLookupItems,
    lookupRegister,
    itemsView,
  }) => {
    const own = await suiteLookupItems.create(HOME_LIST);
    await navigate(steps, lookupRegister);

    await steps.critical('Open the "Lookup Items" screen - the grid lists items', async () => {
      await itemsView.openList(HOME_LIST);
      expect(await itemsView.findRow(own.id), `the suite item ${own.code} on the grid`).toBe(true);
    });

    await steps.step('Locate the non-predefined item\'s row - Edit and Delete buttons are enabled and visible', async () => {
      await itemsView.findRow(own.id);
      await expect.poll(() => itemsView.actionStates(own.id, ['edit', 'delete']), { message: `Edit / Delete on ${own.code}` }).toEqual({ edit: 'available', delete: 'available' });
    });

    await steps.step('Select Delete on the item and confirm - the item is removed from the grid', async () => {
      const outcome = await itemsView.attemptDelete(own.id);
      await expect
        .poll(async () => ({ onGrid: await itemsView.findRow(own.id), stored: (await readLookupItems(page, HOME_LIST)).some((i) => i.id === own.id) }), {
          message: `${own.code} after Delete: ${JSON.stringify(outcome)}`,
        })
        .toEqual({ onGrid: false, stored: false });
    });
  });

  test(`TC-${CASES.linkedDelete.azureId}: should refuse to delete a value still linked to a record and say it is in use`, async ({
    page,
    steps,
    suiteLookupItems,
    linkLookupItem,
    lookupRegister,
    itemsView,
  }) => {
    const own = await suiteLookupItems.create(HOME_LIST);
    const link = await linkLookupItem(HOME_LIST, own);
    await navigate(steps, lookupRegister);

    await steps.critical('Open the "Lookup Items" screen - the grid lists items', async () => {
      await itemsView.openList(HOME_LIST);
      expect(await itemsView.findRow(own.id), `the linked suite item ${own.code} on the grid`).toBe(true);
    });

    await steps.step('Select Delete on the linked item - the system blocks the deletion and shows a message indicating the value is in use', async () => {
      const outcome = await itemsView.attemptDelete(own.id);
      const said = [outcome.hint, outcome.dialog, ...outcome.toasts].join(' | ');
      await expect
        .poll(async () => ({ stillStored: (await readLookupItems(page, HOME_LIST)).some((i) => i.id === own.id), saysInUse: IN_USE_MESSAGE.test(said) }), {
          message: `Delete on ${own.code} (${link.description}): ${JSON.stringify(outcome)}`,
        })
        .toEqual({ stillStored: true, saysInUse: true });
    });
  });

  test(`TC-${CASES.activation.azureId}: should offer Activate / Inactivate only on admin-added values and not on predefined ones`, async ({
    page,
    steps,
    suiteLookupItems,
    lookupRegister,
    itemsView,
  }) => {
    const system = requirePredefined(steps, await readLookupItems(page, HOME_LIST), NO_PREDEFINED_BLOCKED);
    const systemId = system?.id ?? '';
    const own = await suiteLookupItems.create(HOME_LIST);
    await navigate(steps, lookupRegister);

    await steps.critical('Open the "Lookup Items" screen - the grid lists all items', async () => {
      await itemsView.openList(HOME_LIST);
      expect({ system: await itemsView.findRow(systemId), admin: await itemsView.findRow(own.id) }, `${system?.code} and ${own.code}`).toEqual({ system: true, admin: true });
    });

    await steps.step('Check the predefined item\'s row - Activate/Inactivate actions are not shown', async () => {
      await itemsView.findRow(systemId);
      await expect.poll(() => itemsView.actionStates(systemId, ACTIVATION_SUFFIXES), { message: `Activate / Inactivate on ${system?.code}` }).toEqual(ALL_ABSENT);
    });

    await steps.step('Check the admin-added non-predefined item\'s row - Activate/Inactivate actions are shown and usable', async () => {
      await itemsView.findRow(own.id);
      const offered = await itemsView.actionStates(own.id, ACTIVATION_SUFFIXES);
      const used = await itemsView.useActivation(own.id, ACTIVATION_SUFFIXES);
      await expect
        .poll(async () => (await readLookupItems(page, HOME_LIST)).find((i) => i.id === own.id)?.isActive, {
          message: `Activate / Inactivate on the active ${own.code}: offered ${JSON.stringify(offered)}; used "${used.suffix || 'none'}" (dialog "${used.dialog}", toasts ${JSON.stringify(used.toasts)}) - the item should become inactive`,
        })
        .toBe(false);
    });
  });
});
