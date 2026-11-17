import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { LookupRegisterPage } from '../../../pages/lookup/LookupPages';
import { CASES, DELETED, HOME_LIST, NO_PREDEFINED_BLOCK, PREDEFINED_TOOLTIP, UPDATED } from '../../../data/lookup/deleteLookupItem.data';
import {
  answerYes,
  deleteControl,
  disabledDeleteTooltip,
  firstPredefined,
  normText,
  requestDelete,
  requireOrBlock,
  retireThroughDrawer,
  sepless,
  stillInList,
  tryDeleteInUse,
} from '../../../utils/lookup/writerCHelpers';

/** Step 1 of every case: the register of lists. */
async function openModule(steps: TestSteps, register: LookupRegisterPage): Promise<void> {
  await steps.critical('Navigate to the Lookups Management module - the list of lookups is displayed', async () => {
    await register.open();
    await register.expectRowsRendered();
  });
}

/**
 * User story 20859: Delete Lookup Item - when Delete is offered: an unused
 * suite item, an IN-USE suite item (held by a suite record through the
 * `linkLookupItem` fixture, made BEFORE the steps so a link that cannot be made
 * blocks the case before anything is observed), and a predefined item (read and
 * pointed at only, never clicked). 21185 retires the in-use suite item through
 * Is Active instead. See the data file for the readings.
 */
test.describe('US 20859 - Delete Lookup Item (availability)', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.availabilityMatrix.azureId}: should offer Delete only on an unused item that is not predefined`, async ({
    page,
    steps,
    lookupRegister,
    lookupItemsPage: items,
    suiteLookupItems,
    linkLookupItem,
  }) => {
    const unused = await suiteLookupItems.create(HOME_LIST);
    const inUse = await suiteLookupItems.create(HOME_LIST);
    const link = await linkLookupItem(HOME_LIST, inUse);
    await openModule(steps, lookupRegister);

    await steps.step('Inspect an item that is Predefined = No and unused (a suite item) - Delete is enabled and functional', async () => {
      await items.open(HOME_LIST);
      expect(await deleteControl(items, unused.id), `Delete on the unused suite item ${unused.code}`).toEqual({ present: true, enabled: true });
      const prompt = await requestDelete(page, items, unused.id);
      const answer = await answerYes(page, DELETED);
      expect({ prompt: prompt.visible, deleted: !(await stillInList(page, HOME_LIST, unused.id)), toast: answer.toasts.includes(sepless(DELETED)) },
        `DeleteLookupItem answered ${answer.status ?? 'nothing'} ${answer.text}; toasts [${answer.toasts.join(' | ')}]`).toEqual({ prompt: true, deleted: true, toast: true });
    });

    await steps.step('Inspect an item that is Predefined = No and in use (a suite item held by a suite record) - Delete is refused', async () => {
      await items.open(HOME_LIST);
      const attempt = await tryDeleteInUse(page, items, HOME_LIST, inUse.id, DELETED);
      expect(attempt.refused, `${inUse.code} held by ${link.description}: ${attempt.detail}`).toBe(true);
    });

    await steps.step('Inspect an item that is Predefined = Yes (regardless of use) - Delete is disabled with the predefined tooltip', async () => {
      const predefined = requireOrBlock(steps, await firstPredefined(page, HOME_LIST), NO_PREDEFINED_BLOCK);
      await items.open(HOME_LIST);
      const control = await deleteControl(items, predefined.id);
      const tooltip = await disabledDeleteTooltip(page, items, predefined.id);
      expect({ control, tooltip }, `the predefined item ${predefined.code}`).toEqual({ control: { present: true, enabled: false }, tooltip: normText(PREDEFINED_TOOLTIP) });
    });
  });

  test(`TC-${CASES.retireInUse.azureId}: should let the administrator retire an in-use item through Is Active instead of deleting it`, async ({
    page,
    steps,
    lookupRegister,
    lookupItemsPage: items,
    lookupItemDrawer,
    suiteLookupItems,
    linkLookupItem,
  }) => {
    const item = await suiteLookupItems.create(HOME_LIST);
    const link = await linkLookupItem(HOME_LIST, item);
    await openModule(steps, lookupRegister);

    await steps.step('Attempt to delete the in-use item (a suite item held by a suite record) - deletion is refused', async () => {
      await items.open(HOME_LIST);
      const attempt = await tryDeleteInUse(page, items, HOME_LIST, item.id, DELETED);
      expect(attempt.refused, `${item.code} held by ${link.description}: ${attempt.detail}`).toBe(true);
    });

    await steps.step('Instead, open Edit on the item, clear Is Active and save - "Item Updated — The lookup item was updated." is shown and the item is retired, not deleted', async () => {
      await items.open(HOME_LIST);
      const retired = await retireThroughDrawer(page, items, lookupItemDrawer, HOME_LIST, item.id, UPDATED);
      expect({
        drawerOpened: retired.opened,
        unticked: retired.unticked,
        saved: retired.status !== null && retired.status < 400,
        toast: retired.toasts.includes(sepless(UPDATED)),
        storedActive: retired.isActiveAfter,
      }, `UpdateLookupItem answered ${retired.status ?? 'nothing'} ${retired.text}; toasts [${retired.toasts.join(' | ')}]`)
        .toEqual({ drawerOpened: true, unticked: true, saved: true, toast: true, storedActive: false });
    });
  });
});
