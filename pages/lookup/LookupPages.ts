import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ListPageBase } from '../components/ListPageBase';
import { BasePage } from '../BasePage';
import { AppRoutes } from '../../constants/AppRoutes';
import { Timeouts } from '../../constants/Timeouts';
import { LOOKUP_ITEMS, LOOKUP_ITEM_DRAWER, LOOKUP_REGISTER } from '../../constants/lookup/lookupIds';
import { Logger } from '../../utils/Logger';

/**
 * Lookups Management page objects (Feature 20852, 2026-11-09) - the lead's
 * shared base. Both screens are the shared list (ListPageBase does search,
 * rows, cells, row actions, pager); writers add their readers in
 * utils/lookup/writer<X>Helpers.ts, not here.
 */

/** System Settings > Lookups - the register of the 57 lists (no Add / Edit / Delete; row action View). */
export class LookupRegisterPage extends ListPageBase {
  constructor(page: Page) {
    super(page, LOOKUP_REGISTER.screen);
  }

  /**
   * Types the term and presses Enter. Overrides ListPageBase.search, whose
   * Table-view guard waits for a Table/Cards toggle these screens do not have
   * (it would wait and reload, losing the search - writers B/C, 2026-11-09).
   * Waits for the screen's own answer when the search goes to the server.
   */
  override async search(term: string): Promise<void> {
    Logger.step(`Searching the register for "${term}"`);
    const answered = this.page.waitForResponse((r) => r.url().includes('/api/Lookups/'), { timeout: 3_000 }).catch(() => null);
    await this.searchInput().fill(term);
    await this.searchInput().press('Enter');
    await answered;
    await this.waitForPageReady();
  }

  /** Opens the register and waits for its first answer (GetLookups) to render. */
  async open(): Promise<void> {
    const loaded = this.page.waitForResponse((r) => r.url().includes('/api/Lookups/GetLookups'), { timeout: Timeouts.default }).catch(() => null);
    await this.goto(AppRoutes.lookupManagement);
    await loaded;
    await expect(this.byId(`${LOOKUP_REGISTER.screen}-table-el`), 'the Lookup Register table should render').toBeVisible({ timeout: Timeouts.default });
  }

  control(id: Exclude<keyof typeof LOOKUP_REGISTER, 'column' | 'screen'>): Locator {
    return this.byId(LOOKUP_REGISTER[id]);
  }

  /** The View button of a list's row, by the list's register id. */
  viewButton(lookupId: string): Locator {
    return this.byId(`${LOOKUP_REGISTER.screen}-table-row-${lookupId}-view`);
  }

  /** The Code column as shown on the current page. */
  async codesOnPage(): Promise<string[]> {
    return this.readColumn(LOOKUP_REGISTER.column.code);
  }
}

/** One list's items: /system-settings/lookup-management/<list code>. */
export class LookupItemsPage extends ListPageBase {
  constructor(page: Page) {
    super(page, LOOKUP_ITEMS.screen);
  }

  /**
   * Types the term and presses Enter. Overrides ListPageBase.search, whose
   * Table-view guard waits for a Table/Cards toggle these screens do not have
   * (it would wait and reload, losing the search - writers B/C, 2026-11-09).
   * Waits for the screen's own answer when the search goes to the server.
   */
  override async search(term: string): Promise<void> {
    Logger.step(`Searching the items for "${term}"`);
    const answered = this.page.waitForResponse((r) => r.url().includes('/api/Lookups/'), { timeout: 3_000 }).catch(() => null);
    await this.searchInput().fill(term);
    await this.searchInput().press('Enter');
    await answered;
    await this.waitForPageReady();
  }

  /** Opens a list's items screen directly by its code and waits for the items to load. */
  async open(listCode: string): Promise<void> {
    const loaded = this.page.waitForResponse((r) => r.url().includes(`/api/Lookups/Items/${listCode}`), { timeout: Timeouts.default }).catch(() => null);
    await this.goto(`${AppRoutes.lookupManagement}/${listCode}`);
    await loaded;
    await expect(this.byId(`${LOOKUP_ITEMS.screen}-table-el`), 'the Lookup Items table should render').toBeVisible({ timeout: Timeouts.default });
  }

  control(id: 'searchInput' | 'filterButton' | 'advancedSearch' | 'exportTrigger' | 'addButton'): Locator {
    return id === 'addButton' ? this.btn(LOOKUP_ITEMS.addButton) : this.byId(LOOKUP_ITEMS[id]);
  }

  row(itemId: string): Locator {
    return this.byId(`${LOOKUP_ITEMS.screen}-table-row-${itemId}`);
  }

  rowAction(itemId: string, action: 'edit' | 'delete' | 'activate' | 'inactivate'): Locator {
    return this.byId(`${LOOKUP_ITEMS.screen}-table-row-${itemId}-${action}`);
  }

  cellOf(itemId: string, key: keyof typeof LOOKUP_ITEMS.column): Locator {
    return this.byId(`${LOOKUP_ITEMS.screen}-table-row-${itemId}-cell-${LOOKUP_ITEMS.column[key]}`);
  }

  itemStatusBadge(itemId: string): Locator {
    return this.byId(LOOKUP_ITEMS.statusBadge(itemId));
  }

  predefinedBadge(itemId: string): Locator {
    return this.byId(LOOKUP_ITEMS.predefinedBadge(itemId));
  }
}

/** What one Save in the item drawer produced - returned, never asserted. */
export interface ItemSaveOutcome {
  /** HTTP status of the Create/Update request, or null when none left the browser (client validation stopped it). */
  status: number | null;
  sent: unknown;
  answer: string;
  toast: string;
  drawerOpen: boolean;
}

/** The Add / Edit Lookup Item drawer. */
export class LookupItemDrawer extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  field(id: Exclude<keyof typeof LOOKUP_ITEM_DRAWER, 'drawer'>): Locator {
    return ['cancel', 'save'].includes(id) ? this.btn(LOOKUP_ITEM_DRAWER[id]) : this.byId(LOOKUP_ITEM_DRAWER[id]);
  }

  async isOpen(timeout: number = Timeouts.short): Promise<boolean> {
    return this.byId(LOOKUP_ITEM_DRAWER.title).waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
  }

  /** Fills the given fields (undefined = untouched). Display Order is a number box: it is left (Tab) so the value applies. */
  async fill(values: { code?: string; englishName?: string; arabicName?: string; order?: string }): Promise<void> {
    if (values.code !== undefined) await this.field('code').fill(values.code);
    if (values.englishName !== undefined) await this.field('englishName').fill(values.englishName);
    if (values.arabicName !== undefined) await this.field('arabicName').fill(values.arabicName);
    if (values.order !== undefined) {
      await this.field('order').fill(values.order);
      await this.field('order').press('Tab');
    }
  }

  /** Presses Save and reports what happened (request, answer, toast, drawer state). */
  async saveAndCapture(): Promise<ItemSaveOutcome> {
    const req = this.page
      .waitForResponse((r) => /\/api\/Lookups\/(Create|Update)LookupItem/.test(r.url()), { timeout: Timeouts.short })
      .then(async (r) => ({ status: r.status() as number | null, sent: r.request().postDataJSON() as unknown, answer: (await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 400) }))
      .catch(() => ({ status: null, sent: null, answer: '' }));
    Logger.step('Pressing Save in the lookup item drawer');
    await this.field('save').click();
    const { status, sent, answer } = await req;
    const toast = await this.getToastMessage(Timeouts.short).catch(() => '');
    await this.byId(LOOKUP_ITEM_DRAWER.title).waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => undefined);
    const drawerOpen = await this.byId(LOOKUP_ITEM_DRAWER.title).isVisible().catch(() => false);
    Logger.step(`Item save -> ${status ?? 'no request'}; toast "${toast}"; drawer ${drawerOpen ? 'open' : 'closed'}`);
    return { status, sent, answer, toast: toast.replace(/\s+/g, ' ').trim(), drawerOpen };
  }
}
