import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ListPageBase } from '../components/ListPageBase';
import { AppRoutes } from '../../constants/AppRoutes';
import { Timeouts } from '../../constants/Timeouts';
import { AUDIT_LOG, AUDIT_LOG_COLUMN } from '../../constants/ElementIds';

/** One row of the system audit log, every cell as rendered. */
export interface AuditLogRow {
  occurredAt: string;
  actionType: string;
  entityType: string;
  entityId: string;
  actor: string;
}

/**
 * System Settings > Audit Logs (`/system-settings/audit-logs`), System Log tab.
 *
 * The one place an action's audit record can be read OUTSIDE the payer's own
 * Audit History tab - which matters for the stories that ask whether a
 * settings save or a withdrawn request left a trace at all. The list is in
 * the shared list shape, so ListPageBase supplies search and paging; this
 * class adds a one-pass row reader (see ListPageBase.getRowPairs for why one
 * pass, not one column at a time).
 */
export class AuditLogsPage extends ListPageBase {
  constructor(page: Page) {
    super(page, AUDIT_LOG.screen);
  }

  async open(): Promise<void> {
    await this.goto(AppRoutes.auditLogs);
  }

  /** Opens the log and guarantees its table is on screen. */
  async openList(): Promise<void> {
    await this.open();
    await expect(this.tableFor(this.screen), 'the audit log table should render').toBeVisible({
      timeout: Timeouts.default,
    });
    await this.expectRowsRendered();
  }

  /** Every rendered row, read in one pass. */
  async getRows(): Promise<AuditLogRow[]> {
    return this.rows().evaluateAll(
      (rows, keys) =>
        rows.map((row) => {
          const read = (key: string): string => {
            const cell = row.querySelector(`[id$="-cell-${key}"]`);
            return cell ? (cell as HTMLElement).innerText.trim() : '';
          };
          return {
            occurredAt: read(keys.occurredAt),
            actionType: read(keys.actionType),
            entityType: read(keys.entityType),
            entityId: read(keys.entityId),
            actor: read(keys.actor),
          };
        }),
      AUDIT_LOG_COLUMN,
    );
  }

  /** The rows on the first page whose entity type matches `pattern`. */
  async findRowsByEntity(pattern: RegExp): Promise<AuditLogRow[]> {
    await this.openList();
    return (await this.getRows()).filter((row) => pattern.test(row.entityType));
  }

  // ---- story 23 additions (network code retention) --------------------------

  /**
   * Opens the log and reports whether this session reached it - a restricted
   * account is bounced to the dashboard ("Access Restricted", verified
   * 2026-09-12 for the Payer Admin account). Never throws.
   */
  async openAndReportAccess(): Promise<{ reachable: boolean; url: string; text: string }> {
    await this.open();
    const reachable = await this.tableFor(this.screen)
      .waitFor({ state: 'visible', timeout: Timeouts.default })
      .then(() => true)
      .catch(() => false);
    const text = (await this.page.locator('main, #app-layout').first().innerText().catch(() => '')).trim();
    return { reachable, url: this.page.url(), text };
  }

  /**
   * Rows on the first `maxPages` pages whose Entity ID cell mentions `text`
   * (a network code or id). The log's own search box searches ACTORS only
   * ("Search by actor…"), so a record is found by reading, newest first.
   */
  async findRowsMentioning(text: string, maxPages = 5): Promise<AuditLogRow[]> {
    await this.openList();
    const found: AuditLogRow[] = [];
    for (let page = 1; page <= maxPages; page += 1) {
      found.push(...(await this.getRows()).filter((row) => row.entityId.includes(text)));
      if (found.length > 0 || !(await this.hasNextPage())) break;
      await this.goToNextPage();
    }
    return found;
  }
}
