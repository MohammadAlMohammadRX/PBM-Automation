import {
  test,
  expect,
  WriterEItems,
  createAsSession,
  described,
  englishNameFor,
  itemsOf,
  itemsWithCode,
  norm,
  openAddForm,
  openDeactivateFor,
  orderProblems,
  pick,
  uniform,
  wasSaved,
} from '../../../utils/lookup/writerEHelpers';
import type { UserDeactivateDrawer } from '../../../pages/user/UserDeactivateDrawer';
import {
  ARABIC_NAME,
  CASES,
  CONSUMER_ORDER,
  DENIED_STATUSES,
  EMPTY_FIELDS,
  HOME_LIST,
  MESSAGES,
  NO_ADD_RIGHTS,
} from '../../../data/lookup/addLookupItem.data';

/**
 * User story 20860: Add Lookup Item - the new value in the forms that use the
 * list, and who may add. The consumer of the home list is the user Deactivate
 * drawer, opened on the case's own suite user (`userIn`); its reason drop-down
 * is read and the drawer is CANCELLED - nobody is deactivated. The restricted
 * account is a suite session whose role holds only the view rights.
 */
test.describe('US 20860 - Add Lookup Item', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.availableInForms.azureId}: should offer the new value at once in its display-order position when a form uses the list`, async ({ page, steps, suiteLookupItems, userIn, userListPage, addItems, addDrawer }) => {
    const user = await userIn('Active');
    await suiteLookupItems.watch(HOME_LIST);
    const code = suiteLookupItems.newCode();
    const englishName = englishNameFor(code);
    let deactivate!: UserDeactivateDrawer;

    await steps.critical('Navigate to the Lookups Management module - the module loads', async () => {
      await addItems.open(HOME_LIST);
      await expect(addItems.control('addButton'), 'the Add Item action on the list').toBeVisible();
    });

    await steps.critical(`Add a new item to the target list with Display Order ${CONSUMER_ORDER} and Save - "${MESSAGES.created}" is displayed`, async () => {
      await openAddForm(addItems, addDrawer);
      await addDrawer.fill({ code, englishName, arabicName: ARABIC_NAME, order: String(CONSUMER_ORDER) });
      const outcome = await addDrawer.attemptSave();
      expect(wasSaved(outcome), `${described(outcome)}; field errors: ${(await addDrawer.fieldErrors()).join(' | ')}`).toBe(true);
      expect(norm(outcome.toast), 'the confirmation').toBe(norm(MESSAGES.created));
      expect((await itemsWithCode(page, HOME_LIST, code)).map((i) => ({ index: i.index, isActive: i.isActive })), `the stored item ${code}`).toEqual([{ index: CONSUMER_ORDER, isActive: true }]);
    });

    await steps.critical(`Open a form that consumes ${HOME_LIST} (Users > Inactivate on a suite user) - the form loads with its drop-down`, async () => {
      deactivate = await openDeactivateFor(userListPage, user);
      expect(await deactivate.isOpen(), 'the Deactivate User drawer').toBe(true);
    });

    await steps.step('Open the Deactivation Reason drop-down - the new value is offered at once, in its display-order position', async () => {
      const options = await deactivate.getReasonOptions();
      const items = await itemsOf(page, HOME_LIST);
      expect(options, 'the reasons offered').toContain(englishName);
      expect(orderProblems(options, items, englishName, CONSUMER_ORDER), `the reasons offered, in order: ${options.join(', ')}`).toEqual([]);
      await deactivate.cancel();
      expect(await deactivate.isOpen(), 'the Deactivate drawer after Cancel (nobody deactivated)').toBe(false);
    });
  });

  test(`TC-${CASES.inactiveAtCreate.azureId}: should save an inactive item that no drop-down offers when Is Active is cleared`, async ({ page, steps, suiteLookupItems, userIn, userListPage, addItems, addDrawer }) => {
    const user = await userIn('Active');
    await suiteLookupItems.watch(HOME_LIST);
    const code = suiteLookupItems.newCode();
    const englishName = englishNameFor(code);

    await steps.critical('Navigate to the Lookups Management module - the module loads', async () => {
      await addItems.open(HOME_LIST);
      await expect(addItems.control('addButton'), 'the Add Item action on the list').toBeVisible();
    });

    await steps.critical('Open the "Add Lookup Item" form - an empty form is displayed with Is Active ticked', async () => {
      await openAddForm(addItems, addDrawer);
      expect(pick(await addDrawer.values(), EMPTY_FIELDS), 'the Code / English / Arabic boxes').toEqual(uniform(EMPTY_FIELDS, ''));
      await expect(addDrawer.field('isActive'), 'Is Active on opening').toBeChecked();
    });

    await steps.step('Enter a valid Code, English Name and Arabic Name, then untick Is Active - the checkbox shows unticked', async () => {
      await addDrawer.fill({ code, englishName, arabicName: ARABIC_NAME });
      await addDrawer.setActive(false);
      await expect(addDrawer.field('isActive'), 'Is Active').not.toBeChecked();
    });

    await steps.step(`Click Save - the item is saved as inactive and the drop-downs that show active values (${HOME_LIST} in Deactivate User) do not offer it`, async () => {
      const outcome = await addDrawer.attemptSave();
      expect(wasSaved(outcome), `${described(outcome)}; field errors: ${(await addDrawer.fieldErrors()).join(' | ')}`).toBe(true);
      expect(norm(outcome.toast), 'the confirmation').toBe(norm(MESSAGES.created));
      expect((await itemsWithCode(page, HOME_LIST, code)).map((i) => i.isActive), `the stored item ${code} is inactive`).toEqual([false]);
      const deactivate = await openDeactivateFor(userListPage, user);
      const options = await deactivate.getReasonOptions();
      expect(options, `the reasons offered: ${options.join(', ')}`).not.toContain(englishName);
      await deactivate.cancel();
      expect(await deactivate.isOpen(), 'the Deactivate drawer after Cancel (nobody deactivated)').toBe(false);
    });
  });

  test(`TC-${CASES.nonAdmin.azureId}: should not let a user add a lookup item when the role lacks the add permission`, async ({ page, steps, suiteLookupItems, suiteSession, addItems }) => {
    await suiteLookupItems.watch(HOME_LIST);
    const code = suiteLookupItems.newCode();
    const englishName = englishNameFor(code);

    await steps.critical('Baseline: the administrator, who may add lookup items, is offered an enabled Add Item on the list', async () => {
      await addItems.open(HOME_LIST);
      expect(await addItems.addState(), 'Add Item for the administrator').toEqual({ shown: true, enabled: true });
    });

    const s = await suiteSession({ rights: [...NO_ADD_RIGHTS] });
    const sessionItems = new WriterEItems(s.page);

    await steps.step(`Navigate to the Lookups Management module as "${s.role.name}" (${NO_ADD_RIGHTS.join(', ')}) - access is denied or the list loads read-only`, async () => {
      const view = await sessionItems.visit(HOME_LIST);
      expect(['denied', 'read-only'], `what the restricted user got: ${JSON.stringify(view)}`).toContain(view.mode);
    });

    await steps.step('Attempt to locate or trigger "Add Item" on the lookup list - the action is not available or is disabled', async () => {
      const add = await sessionItems.addState();
      expect(add.shown && add.enabled, `Add Item for the restricted user: ${JSON.stringify(add)}`).toBe(false);
    });

    await steps.step('Attempt to add a lookup item directly (CreateLookupItem with the user\'s own session) - access is refused and nothing is added', async () => {
      const answer = await createAsSession(s.page, page, HOME_LIST, { code, englishName, arabicName: ARABIC_NAME });
      expect([...DENIED_STATUSES] as number[], `CreateLookupItem as the restricted user answered ${answer.status}: ${answer.text}`).toContain(answer.status);
      expect(await itemsWithCode(page, HOME_LIST, code), `items stored with code ${code}`).toEqual([]);
    });
  });
});
