import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { LookupRegisterPage } from '../../../pages/lookup/LookupPages';
import { CASES, DELETED, DELETE_PROMPT, HOME_LIST, PROMPT_BUTTONS } from '../../../data/lookup/deleteLookupItem.data';
import {
  answerNo,
  answerYes,
  normText,
  promptQuestion,
  requestDelete,
  rowCells,
  sepless,
  stillInList,
  storedItem,
  type DeletePrompt,
} from '../../../utils/lookup/writerCHelpers';

/** Step 1 of every case: the register of lists. */
async function openModule(steps: TestSteps, register: LookupRegisterPage): Promise<void> {
  await steps.critical('Navigate to the Lookups Management module - the list of lookups is displayed', async () => {
    await register.open();
    await register.expectRowsRendered();
  });
}

/** A Delete answer counts as accepted when the request left and was answered below 400. */
const accepted = (status: number | null): boolean => status !== null && status < 400;

/**
 * User story 20859: Delete Lookup Item - the confirmation, Yes and No. Every
 * item deleted is the case's own suite item (QA-AUTO-...) in the home list;
 * teardown removes whatever is left. The availability matrix and the in-use
 * cases are in delete-availability.spec.ts. See the data file for the readings.
 */
test.describe('US 20859 - Delete Lookup Item', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.promptNamesItem.azureId}: should name the item in the delete confirmation and offer No and Yes`, async ({
    page,
    steps,
    lookupRegister,
    lookupItemsPage: items,
    suiteLookupItems,
  }) => {
    const item = await suiteLookupItems.create(HOME_LIST);
    let prompt!: DeletePrompt;
    await openModule(steps, lookupRegister);

    await steps.critical('Select Delete on an eligible item (the suite item) - a confirmation dialog appears', async () => {
      await items.open(HOME_LIST);
      await expect(items.row(item.id), `the suite item ${item.code}`).toBeVisible();
      prompt = await requestDelete(page, items, item.id);
      expect(prompt.visible, 'the confirmation dialog').toBe(true);
    });

    await steps.step('Inspect the dialog text and buttons - it reads "Do you want to delete <name>?" with "No" and "Yes" options', async () => {
      expect({ question: promptQuestion(prompt), buttons: [...prompt.buttons].sort() }, `title "${prompt.title}", message "${prompt.message}"`)
        .toEqual({ question: normText(DELETE_PROMPT(item.englishName)), buttons: [...PROMPT_BUTTONS] });
    });
  });

  test(`TC-${CASES.deleteUnused.azureId}: should delete an unused item the administrator added`, async ({
    page,
    steps,
    lookupRegister,
    lookupItemsPage: items,
    suiteLookupItems,
  }) => {
    const item = await suiteLookupItems.create(HOME_LIST);
    await openModule(steps, lookupRegister);

    await steps.critical('Select Delete on the eligible item (the suite item) - a confirmation prompt appears', async () => {
      await items.open(HOME_LIST);
      await expect(items.row(item.id), `the suite item ${item.code}`).toBeVisible();
      expect((await requestDelete(page, items, item.id)).visible, 'the confirmation prompt').toBe(true);
    });

    await steps.step('Confirm Yes - the item is removed from the list and "Item Deleted — The lookup item was removed." is shown', async () => {
      const answer = await answerYes(page, DELETED);
      expect(accepted(answer.status), `DeleteLookupItem answered ${answer.status ?? 'nothing'} ${answer.text}`).toBe(true);
      await expect(items.row(item.id), 'the deleted item\'s row').toHaveCount(0);
      expect(answer.toasts, 'the toasts after Yes').toContain(sepless(DELETED));
      expect(await stillInList(page, HOME_LIST, item.id), 'the item in GET Items').toBe(false);
    });
  });

  test(`TC-${CASES.cancelKeeps.azureId}: should keep the item unchanged when the delete confirmation is cancelled`, async ({
    page,
    steps,
    lookupRegister,
    lookupItemsPage: items,
    suiteLookupItems,
  }) => {
    const item = await suiteLookupItems.create(HOME_LIST);
    let before: Awaited<ReturnType<typeof rowCells>> | null = null;
    await openModule(steps, lookupRegister);

    await steps.critical('Select Delete on an eligible item (the suite item) - the confirmation dialog appears', async () => {
      await items.open(HOME_LIST);
      await expect(items.row(item.id), `the suite item ${item.code}`).toBeVisible();
      before = await rowCells(items, item.id);
      expect((await requestDelete(page, items, item.id)).visible, 'the confirmation dialog').toBe(true);
    });

    await steps.step('Select "No" - the dialog closes without deleting', async () => {
      expect(await answerNo(page), 'DeleteLookupItem requests sent, and whether the dialog closed').toEqual({ sent: 0, closed: true });
    });

    await steps.step('Check the lookup list - the item is still present and unchanged', async () => {
      await expect(items.row(item.id), 'the item\'s row after No').toBeVisible();
      expect(await rowCells(items, item.id), 'the row as shown').toEqual(before);
      expect(await storedItem(page, HOME_LIST, item.id), 'the stored item (GET Items)').toEqual(item);
    });
  });

  test(`TC-${CASES.confirmRemoves.azureId}: should remove the item and notify the administrator when the deletion is confirmed`, async ({
    page,
    steps,
    lookupRegister,
    lookupItemsPage: items,
    suiteLookupItems,
  }) => {
    const item = await suiteLookupItems.create(HOME_LIST);
    let toasts: string[] = [];
    await openModule(steps, lookupRegister);

    await steps.critical('Select Delete on an eligible item (the suite item) - the confirmation dialog appears', async () => {
      await items.open(HOME_LIST);
      await expect(items.row(item.id), `the suite item ${item.code}`).toBeVisible();
      expect((await requestDelete(page, items, item.id)).visible, 'the confirmation dialog').toBe(true);
    });

    await steps.step('Select "Yes" - the dialog closes', async () => {
      const answer = await answerYes(page, DELETED);
      toasts = answer.toasts;
      expect({ closed: answer.closed, accepted: accepted(answer.status) }, `DeleteLookupItem answered ${answer.status ?? 'nothing'} ${answer.text}`).toEqual({ closed: true, accepted: true });
    });

    await steps.step('Check the lookup list - the item no longer appears and "Item Deleted — The lookup item was removed." is shown', async () => {
      await expect(items.row(item.id), 'the deleted item\'s row').toHaveCount(0);
      expect(await stillInList(page, HOME_LIST, item.id), 'the item in GET Items').toBe(false);
      expect(toasts, 'the toasts after Yes').toContain(sepless(DELETED));
    });
  });
});
