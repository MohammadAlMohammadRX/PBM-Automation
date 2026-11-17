import type { NcTab } from './notificationIds';

/**
 * Writer A ids (Notification Center folders 04-08 and 14) that the lead's
 * notificationIds.ts does not hold. Read from the foundation probe dumps
 * (reports/notification/probe/foundation-2026-11-11, b05 / e11 / b08 / e19).
 */
export const WRITER_A_IDS = {
  /** The toolbar's "Clear" button (Clear All: drops the search text and every filter chip) - b05, e11. */
  clearAll: (tab: NcTab): string => `nc-${tab}-search-clear-button`,
  /** The x inside the search box (clears the text only) - e11. */
  searchClearIcon: (tab: NcTab): string => `nc-${tab}-search-clear-icon`,
  /** The row's action strip (Edit / Activate|Deactivate / Delete) - e11. */
  rowActions: (tab: NcTab, id: string): string => `nc-${tab}-table-row-${id}-actions`,
  trigger: {
    /** Prefix of every message template card control (`...-template-idx-<t>-channel-select`). */
    templatePrefix: 'nc-triggers-form-drawer-template-idx-',
    /** Prefix of the Insert variable menu buttons (right-click a body / subject). */
    insertVariablePrefix: 'nc-triggers-form-drawer-insert-variable-',
    /** The rich editor's "Template" button (branded layout listing the action's placeholders) - b10. */
    insertTemplateButton: (t: number, b = 0): string => `nc-triggers-form-drawer-template-idx-${t}-body-idx-${b}-body-editor-insert-template-button`,
  },
} as const;
