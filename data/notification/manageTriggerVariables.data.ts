import { PREDEFINED_TRIGGER } from '../../utils/notification/notificationApi';

/**
 * US 20987 "Manage Trigger Variables" (notification folder 10, 17 cases, 21429-21447;
 * 21437 / 21444 / 21448 / 21453 wait for the BA and are not written).
 *
 * How it works in this build (foundation 2026-11-11 + the application bundle):
 * the trigger drawer's Content step has "Manage Variables", which REPLACES the step
 * with a "Variables" view: one block per variable of the action - the name (a plain
 * element, `nc-triggers-form-drawer-variable-<name>`), Sample Value, Description,
 * Default, Required, Sensitive; once Sensitive is ticked: Masking Mode (None / Full /
 * Keep First / Keep Last / Keep First & Last), Mask Character (maxlength 1, "*" by
 * default), Mask Keep First / Last (number boxes, shown for the modes that keep
 * characters) and "Recipient reads: <masked sample>" while a Sample Value is set.
 * The view's Save checks every variable (toast + a line under the variable) and,
 * when valid, hands the values back to the drawer; they are STORED only when the
 * trigger is saved (UpdateTrigger) - so "the configuration saves" = Variables Save,
 * then the drawer's Save, then read back with GetTrigger. Back / Cancel discard.
 *
 * Literal readings / decisions:
 * - "Navigate to the module - the list of trigger actions" = the Triggers tab; the
 *   suite's OWN trigger (created by the fixture on a FREE action, deleted after) is
 *   edited (lead decision 2). Its first NOT-required variable is the one changed, so
 *   the message templates stay valid.
 * - 21430 / 21434 use the predefined "Forget Password" trigger, owner of ResetLink, as
 *   the TC names it. NOTHING is saved on it: 21430 only reads; 21434's save is refused
 *   in the Variables view, which is then cancelled and the drawer closed. Its stored
 *   ResetLink is read before and after and must be unchanged.
 * - 21430 "Variable Name field ... read-only": the name is shown as plain text (no
 *   input, not content-editable); typing on it must leave "ResetLink".
 * - 21433 / 21447 (301 / 501 characters): the TC accepts "blocks the extra character
 *   OR shows a validation error" at the FIELD (step 2 / 4), and for 21433 step 3 "save
 *   is blocked or the value is limited to 300" (read back: never more than 300 stored).
 * - 21436 "Click Save or navigate away": the line under the variable is read after
 *   leaving the checkbox (Tab) - the app shows it at once; the view is then cancelled.
 * - 21438 "**": typed key by key; the box keeps one character or shows an error.
 * - 21439 "{{name}}" = the variable's own name.
 * - 21440 / 21441: 0 -> the box refuses it (shows another value) or the Variables Save
 *   is refused with an error; 1 -> saved and stored (read back).
 * - 21443: TC values used as they are (sample 1234567890, Keep First & Last 2 / 2, "*").
 * - 21445: "OldValue" is stored first through the API (UpdateTrigger on the suite
 *   trigger - the precondition), then the edit / Back / reopen run on screen.
 * - 21446 (exploratory): the toggle orders below are the scripted sequence. Before the
 *   final save the Mask Character box is left (Tab) and the lines get 3 s to settle (the
 *   clear-then-type of "*" flashes "needs a Mask Character"); a line still shown is stale.
 * - 21442 / 21443: read web-first (fields / preview render a moment after the pick / typing).
 * - 21433 / 21447: the field is left (Tab) before the length check is read; 21433 step 3
 *   "blocked" = not saved through AND stored value unchanged, "limited" = exactly the first
 *   300 characters stored.
 * - Variables are per TRIGGER: GetActionVariables answers a template (every id
 *   00000000-...), CreateTrigger stores copies with the trigger's own ids (probe api-c.json).
 *   Changes here live on the suite trigger's copies and go with it at teardown; nothing
 *   reaches the action's template or another trigger / definition.
 */
export const VARIABLES_STORY = { id: 20987, title: 'Manage Trigger Variables' } as const;

export const CASES = {
  listPlaceholders: { azureId: 21429 },
  nameReadOnly: { azureId: 21430 },
  noSampleNoDefault: { azureId: 21431 },
  sampleMax: { azureId: 21432, length: 300 },
  sampleOverMax: { azureId: 21433, length: 301, max: 300 },
  defaultNeedsSample: { azureId: 21434 },
  maskingShownWhenSensitive: { azureId: 21435 },
  requiredNotInBody: { azureId: 21436 },
  maskCharOne: { azureId: 21438, typed: '**', max: 1 },
  sensitiveNeedsChar: { azureId: 21439, mode: 'Full' },
  keepFirstMin: { azureId: 21440, mode: 'Keep First', invalid: '0', valid: '1' },
  keepLastMin: { azureId: 21441, mode: 'Keep Last', invalid: '0', valid: '1' },
  fieldsPerMode: { azureId: 21442 },
  recipientReads: { azureId: 21443, sample: '1234567890', mode: 'Keep First & Last', keepFirst: '2', keepLast: '2', maskChar: '*', shows: '12******90' },
  backDiscards: { azureId: 21445, oldValue: 'OldValue', newValue: 'NewValue' },
  toggleConsistency: { azureId: 21446, finalSample: 'QA final sample', finalMode: 'Full', finalChar: '*' },
  descriptionMax: { azureId: 21447, length: 500, over: 501 },
} as const;

/** 21430 / 21434: the predefined trigger that owns ResetLink. */
export const RESET_LINK = { triggerId: PREDEFINED_TRIGGER.forgetPassword, triggerName: 'Forget Password', variable: 'ResetLink' } as const;

/** Masking Mode labels (bundle 2026-11-11) and the API's stored names. */
export const MASKING_MODE = {
  none: 'None',
  full: 'Full',
  keepFirst: 'Keep First',
  keepLast: 'Keep Last',
  keepFirstLast: 'Keep First & Last',
} as const;
export const MASKING_MODE_LABELS = [MASKING_MODE.none, MASKING_MODE.full, MASKING_MODE.keepFirst, MASKING_MODE.keepLast, MASKING_MODE.keepFirstLast] as const;
/** What GetTrigger stores for the label (`maskingMode`). */
export const STORED_MODE: Readonly<Record<string, string>> = {
  None: 'None',
  Full: 'Full',
  'Keep First': 'KeepFirst',
  'Keep Last': 'KeepLast',
  'Keep First & Last': 'KeepFirstAndLast',
};

/** Messages the AC / cases quote ({{name}} = the variable). */
export const MESSAGE = {
  defaultNeedsSample: (name: string): string => `${name} is marked Default, so it needs a Sample Value to fall back to.`,
  sensitiveNeedsChar: (name: string): string => `${name} is marked Sensitive, so it needs a Mask Character.`,
  requiredNotInBody: 'Marked required but not used in every message body — insert it in the Message step.',
  /** "Recipient reads: <masked>" (the line under the variable). */
  recipientReads: (masked: string): string => `Recipient reads: ${masked}`,
  /** The keep-first / keep-last validation (bundle): any line naming the field. */
  keepFirst: /Mask Keep First must be at least 1/i,
  keepLast: /Mask Keep Last must be at least 1/i,
  /** A length validation: any line naming a limit. */
  tooLong: /(at most|maximum|cannot exceed|must not exceed|too long|characters)/i,
} as const;

/** 21446: the scripted toggle sequence (Default / Sensitive, in this order). */
export const TOGGLE_SEQUENCE: readonly { default: boolean; sensitive: boolean }[] = [
  { default: true, sensitive: false },
  { default: true, sensitive: true },
  { default: false, sensitive: true },
  { default: false, sensitive: false },
  { default: false, sensitive: true },
  { default: true, sensitive: true },
] as const;
