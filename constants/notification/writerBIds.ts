/**
 * Writer B ids (Notification Center - folders 09, 10, 03, 20, 30), 2026-11-11.
 *
 * The Manage Variables masking fields were NOT rendered by the foundation
 * probe; their ids below were read from the application bundle the live site
 * serves (chunk with `qaVar(variable, "<suffix>")`, built by the same builder as
 * the ids the probe saw: `nc-triggers-form-drawer-variable-<name lower-case>-<suffix>`).
 * Use them through TRIGGER_DRAWER.variables.field(name, suffix).
 */
export const VARIABLE_FIELD = {
  /** pbm-select: None / Full / Keep First / Keep Last / Keep First & Last (shown while Sensitive is ticked). */
  maskingMode: 'masking-mode-select',
  /** pbm-input-text, maxlength 1, default "*" when Sensitive is ticked. */
  maskChar: 'mask-char-input',
  /** pbm-input-number - shown for Keep First and Keep First & Last. */
  keepFirst: 'mask-keep-first-input',
  /** pbm-input-number - shown for Keep Last and Keep First & Last. */
  keepLast: 'mask-keep-last-input',
  /** "Recipient reads: <masked sample>" - shown while Sensitive is ticked AND a Sample Value is set. */
  maskPreview: 'mask-preview',
  /** The variable's own validation line, shown after a Save attempt in the panel. */
  configError: 'config-error',
  /** "Marked required but not used in every message body — insert it in the Message step." (shown at once). */
  requiredError: 'required-error',
} as const;

/** Id prefixes used to count / list controls. */
export const WRITER_B_PREFIX = {
  /** Every variable block and field: `nc-triggers-form-drawer-variable-<name>[-<suffix>]`. */
  triggerVariable: 'nc-triggers-form-drawer-variable-',
  /** The Variables view's own buttons (back / cancel / save). */
  triggerVariablesView: 'nc-triggers-form-drawer-variables-',
  /** System Settings > General drawer: the expiry-reminder controls. */
  reminderControls: 'settings-general-notificonfig-',
  /** System Settings > General drawer: the archiving controls. */
  archiveControls: 'settings-general-notifi-',
  /** System Settings > General drawer: the SMTP controls. */
  smtpControls: 'settings-general-smtp-',
} as const;
