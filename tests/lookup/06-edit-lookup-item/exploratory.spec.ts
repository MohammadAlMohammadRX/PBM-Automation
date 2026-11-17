import { test, expect, WriterDLookups, asShown, normalise, storedItem, suiteNames, type SaveReport } from '../../../utils/lookup/writerDHelpers';
import type { LookupItem } from '../../../utils/lookup/lookupApi';
import { CASES, MESSAGE } from '../../../data/lookup/editLookupItem.data';

/** One list's edit, as observed. */
interface ExploredEdit {
  list: string;
  item: LookupItem;
  layout: string;
  save: SaveReport;
  stored: LookupItem | undefined;
}

/**
 * User story 20858: Edit Lookup Item - exploratory, scripted (lead decision 10):
 * the same edit (an Arabic name, the highest Display Order, a long mixed-case
 * English name) on a suite item of each list in CASES.exploratory.lists.
 */
test.describe('US 20858 - Edit Lookup Item', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.exploratory.azureId}: should open and save the Edit panel consistently across different lookups`, async ({ page, steps, suiteLookupItems, lookupRegister }) => {
    const d = CASES.exploratory;
    const view = new WriterDLookups(page);
    const items: { list: string; item: LookupItem }[] = [];
    const explored: ExploredEdit[] = [];

    await steps.critical('Navigate to the Lookups Management module - the list of lookups is displayed', async () => {
      for (const list of d.lists) items.push({ list, item: await suiteLookupItems.create(list, suiteNames()) });
      await lookupRegister.open();
      await expect(lookupRegister.control('searchInput'), 'the Lookups register search').toBeVisible();
    });

    await steps.step(`Explore editing items across several lookups (${d.lists.join(', ')}) with an Arabic name, Display Order ${d.order} and a long mixed-case valid name - each edit panel opens and saves`, async () => {
      for (const { list, item } of items) {
        await view.openList(list);
        await view.openEdit(list, item);
        const layout = await view.drawerText();
        await view.drawer.fill({ englishName: d.englishName, arabicName: d.arabicName, order: d.order });
        const save = await view.save();
        explored.push({ list, item, layout, save, stored: await storedItem(page, list, item.id) });
      }
      expect(
        explored.map((e) => ({ list: e.list, saved: e.save.status !== null && e.save.status < 300, closed: !e.save.drawerOpen, toast: normalise(e.save.toast).includes(asShown(MESSAGE.updated)) })),
        `the edits: ${explored.map((e) => `${e.list}: ${e.save.status ?? 'not sent'} "${e.save.toast}" ${JSON.stringify(e.save.errors)}`).join(' / ')}`,
      ).toEqual(explored.map((e) => ({ list: e.list, saved: true, closed: true, toast: true })));
    });

    await steps.step('Watch for any inconsistent validation, layout, or save behavior - none is found; editing behaves consistently across the explored lookups', async () => {
      expect.soft(new Set(explored.map((e) => e.layout)).size, `the drawer layouts: ${explored.map((e) => `${e.list}: "${e.layout}"`).join(' / ')}`).toBe(1);
      expect(
        explored.map((e) => ({ list: e.list, englishName: e.stored?.englishName, arabicName: e.stored?.arabicName, index: e.stored?.index })),
        'the stored values',
      ).toEqual(explored.map((e) => ({ list: e.list, englishName: d.englishName, arabicName: d.arabicName, index: Number(d.order) })));
    });
  });
});
