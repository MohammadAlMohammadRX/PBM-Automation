import { test as base } from '@playwright/test';
import { LookupItemDrawer, LookupItemsPage, LookupRegisterPage } from '../pages/lookup/LookupPages';
import { Logger } from '../utils/Logger';
import { env } from '../constants/EnvironmentConfig';
import { blockedByPrecondition } from './testStatus.fixture';
import { linkLookupItemToRecord, type LookupItemLink } from '../utils/lookup/lookupInUse';
import {
  SUITE_ITEM_PREFIX,
  createLookupItem,
  deleteLookupItem,
  lookupByCode,
  readLookupItems,
  updateLookupItem,
  type LookupItem,
} from '../utils/lookup/lookupApi';

/**
 * Lookups Management fixtures (Feature 20852, 2026-11-09).
 *
 * Lookup items are SHARED: a list's active items appear in every form that
 * uses it, for every user. So the suite only ever adds, edits or deletes its
 * OWN items (code `QA-AUTO-...`, English name "QA Automation ..."), and this
 * fixture removes them:
 *
 *   const item = await suiteLookupItems.create('userDeactivationReason', { englishName: 'QA Automation Reason' });
 *   await suiteLookupItems.watch('userDeactivationReason');   // before the CASE adds one through the drawer
 *
 * Teardown, for every list created-in or watched: every `QA-AUTO-` item that
 * was not there when the list was first touched is DELETED; when the delete is
 * refused (the item is in use) it is made INACTIVE (no longer offered in any
 * form) and reported as a `leftover` annotation. Items the suite did not
 * create are never touched.
 */
export interface SuiteLookupItems {
  /** Creates an active suite item in `listCode` through the API (code made unique). BLOCKS the test with the answer if refused. */
  create(listCode: string, spec?: { code?: string; englishName?: string; arabicName?: string; index?: number; isActive?: boolean }): Promise<LookupItem>;
  /** Remembers the list's current items so suite items a case adds through the screen are cleaned up too. */
  watch(listCode: string): Promise<void>;
  /** A fresh unique suite code (`QA-AUTO-<stamp>`), at most `max` characters long. */
  newCode(max?: number): string;
}

export interface LookupModuleFixtures {
  suiteLookupItems: SuiteLookupItems;
  /**
   * Puts a SUITE item in use (a suite record holds it) - utils/lookup/lookupInUse.ts.
   * The link is undone at teardown BEFORE suiteLookupItems deletes the item.
   * BLOCKED (with the reason) when the link cannot be made.
   */
  linkLookupItem: (listCode: string, item: LookupItem) => Promise<LookupItemLink>;
  lookupRegister: LookupRegisterPage;
  lookupItemsPage: LookupItemsPage;
  lookupItemDrawer: LookupItemDrawer;
}

let counter = 0;
const stamp = (): string => `${Date.now().toString(36)}${(counter++).toString(36)}`.toUpperCase();

export const test = base.extend<LookupModuleFixtures>({
  suiteLookupItems: async ({ page }, use, testInfo) => {
    const before = new Map<string, Set<string>>();
    const onApp = async (): Promise<void> => {
      if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl, { waitUntil: 'domcontentloaded' });
    };
    const watch = async (listCode: string): Promise<void> => {
      if (before.has(listCode)) return;
      await onApp();
      before.set(listCode, new Set((await readLookupItems(page, listCode)).map((i) => i.id)));
    };
    const newCode = (max = 100): string => `${SUITE_ITEM_PREFIX}${stamp()}`.slice(0, max);
    await use({
      watch,
      newCode,
      create: async (listCode, spec = {}) => {
        await watch(listCode);
        const list = await lookupByCode(page, listCode);
        const code = spec.code ?? newCode();
        const answer = await createLookupItem(page, {
          lookupId: list.id,
          code,
          // Letters only: "English letters only." would refuse the stamp's digits (Writer E, 2026-11-09).
          englishName: spec.englishName ?? `QA Automation ${code.slice(SUITE_ITEM_PREFIX.length).replace(/[0-9]/g, (d) => 'ABCDEFGHIJ'[Number(d)]).replace(/[^A-Za-z]/g, '')}`,
          arabicName: spec.arabicName ?? 'قيمة اختبار آلي',
          index: spec.index ?? 0,
          isActive: spec.isActive ?? true,
        });
        // A refused precondition BLOCKS the case (it never reached the behaviour under test).
        if (answer.status >= 400) {
          return blockedByPrecondition(testInfo, `a suite item ${JSON.stringify({ listCode, ...spec }).slice(0, 160)}`, new Error(`CreateLookupItem answered ${answer.status}: ${answer.errors.join('; ') || answer.text.slice(0, 200)}`));
        }
        const made = (await readLookupItems(page, listCode)).find((i) => i.code === code);
        if (!made) return blockedByPrecondition(testInfo, `a suite item in ${listCode}`, new Error(`CreateLookupItem answered ${answer.status} but "${code}" is not in "${listCode}"`));
        Logger.step(`[suiteLookupItems] Created ${code} in ${listCode}`);
        return made;
      },
    });
    // Teardown: delete (or retire) every suite item the test left behind.
    try {
      await onApp();
    } catch {
      /* the API calls below report their own failure */
    }
    for (const [listCode, ids] of before) {
      const items = await readLookupItems(page, listCode).catch(() => [] as LookupItem[]);
      for (const item of items.filter((i) => !ids.has(i.id) && i.code.startsWith(SUITE_ITEM_PREFIX))) {
        const del = await deleteLookupItem(page, item.id).catch((e: unknown) => ({ status: 0, text: String(e), errors: [] }));
        if (del.status > 0 && del.status < 400) {
          Logger.step(`[suiteLookupItems] Deleted ${item.code} from ${listCode}`);
          continue;
        }
        const off = item.isActive ? await updateLookupItem(page, { ...item, isActive: false }).catch(() => ({ status: 0 })) : { status: 200 };
        testInfo.annotations.push({
          type: 'leftover',
          description: `lookup item ${item.code} in ${listCode} could not be deleted (${del.status}: ${del.text.slice(0, 120)}); ${off.status > 0 && off.status < 400 ? 'made inactive' : 'STILL ACTIVE - retire it by hand'}`,
        });
      }
    }
  },

  linkLookupItem: async ({ page, suiteLookupItems }, use, testInfo) => {
    void suiteLookupItems; // declared so this fixture tears down FIRST (before the items are deleted)
    const links: LookupItemLink[] = [];
    await use(async (listCode, item) => {
      try {
        const link = await linkLookupItemToRecord(page, listCode, item);
        links.push(link);
        return link;
      } catch (error) {
        return blockedByPrecondition(testInfo, `a record holding the suite item ${item.code} of ${listCode}`, error);
      }
    });
    for (const link of links.reverse()) {
      await link.dispose().catch((e: unknown) => testInfo.annotations.push({ type: 'leftover', description: `could not undo "${link.description}": ${String(e).slice(0, 160)}` }));
    }
  },

  lookupRegister: async ({ page }, use) => {
    await use(new LookupRegisterPage(page));
  },
  lookupItemsPage: async ({ page }, use) => {
    await use(new LookupItemsPage(page));
  },
  lookupItemDrawer: async ({ page }, use) => {
    await use(new LookupItemDrawer(page));
  },
});
