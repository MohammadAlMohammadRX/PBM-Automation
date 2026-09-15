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
}
