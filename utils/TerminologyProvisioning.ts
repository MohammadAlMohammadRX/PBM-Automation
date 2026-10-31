import type { Page } from '@playwright/test';
import { NetworkUtils } from './NetworkUtils';
import { Logger } from './Logger';
import { buildXlsx } from './XlsxUtils';
import { networkStamp } from './NetworkProvisioning';
import { ApiEndpoints } from '../constants/ApiEndpoints';
import { env } from '../constants/EnvironmentConfig';
import { ACCESS_TOKEN_KEY } from '../data/payers/lifecycleGuardrails.data';

/**
 * Terminologies built for a case through the application's own API
 * (2026-10-29) - the very calls the Add Terminology drawer, the record drawer
 * and the Upload Data drawer make. Mirrors utils/PlanProvisioning.ts.
 *
 * A terminology is created in one call with its fields AND its Active / Locked
 * flags; the application adds the automatic "Is Active" field itself. Changes
 * take effect at once - there is no approval step in this module. Records are
 * written with UpsertTerminologyRow, keyed by FIELD ID, which this module maps
 * from the field names a case speaks in.
 *
 * Every terminology built here is named with DISPOSABLE_TERMINOLOGY_PREFIX so a
 * leftover is recognisable, and is discarded at teardown by the fixture
 * (fixtures/terminologyModule.fixture.ts): unlocked, emptied of records and
 * failed upload rows, then deleted - the order the server insists on.
 */

export const DISPOSABLE_TERMINOLOGY_PREFIX = 'QA Automation Terminology';

/** Field type lookup codes (`/Lookups/Items/terminologyFieldType`). */
export type TerminologyFieldType = 'text' | 'number' | 'date' | 'boolean' | 'list' | 'mappingIdentifier';

/** Field restriction lookup codes (`/Lookups/Items/terminologyFieldRestriction`). */
export type TerminologyRestriction =
  | 'none' | 'englishOnly' | 'arabicOnly' | 'alphaNumeric' | 'numbersOnly'
  | 'dateTime' | 'dateOnly' | 'timeOnly' | 'boolean' | 'single' | 'multiSelect';

/** The restriction each type takes when a case names none - the drawer's own defaults. */
const DEFAULT_RESTRICTION: Record<TerminologyFieldType, TerminologyRestriction> = {
  text: 'none',
  number: 'numbersOnly',
  date: 'dateOnly',
  boolean: 'boolean',
  list: 'single',
  mappingIdentifier: 'single',
};

export interface TerminologyFieldSpec {
  name: string;
  type?: TerminologyFieldType;
  restriction?: TerminologyRestriction;
  /** 0 = unlimited. */
  maxLength?: number;
  required?: boolean;
  unique?: boolean;
  showOnTable?: boolean;
  /** A List field's source - a Lookup module list id. */
  listLookupId?: string;
  /** A Mapping Identifier field's target: another terminology and one of its fields. */
  mapsTo?: { terminologyId: string; fieldId: string };
}

export interface TerminologySpec {
  name?: string;
  description?: string;
  subscribed?: boolean;
  subscriptionReference?: string;
  /** Default true. */
  active?: boolean;
  /** Default false. Applied AFTER the records are written. */
  locked?: boolean;
  /** Default: one required, unique text field "Code". */
  fields?: TerminologyFieldSpec[];
  /** Records to write, keyed by field NAME ("Is Active" included). */
  records?: Record<string, string>[];
}

export interface ProvisionedTerminology {
  id: string;
  name: string;
  description: string;
  /** Field id by field name, the automatic "Is Active" included. */
  fieldIds: Record<string, string>;
  /** Row ids of the records written, in spec order. */
  recordIds: string[];
}

export interface TerminologyField {
  id: string;
  name: string;
  typeId: string;
  restrictionId: string;
  maxLength: number;
  isRequired: boolean;
  isUnique: boolean;
  skipCheckOnUpdate: boolean;
  showOnTable: boolean;
  order: number;
  isPredefined: boolean;
  listTypeId: string | null;
  mappingIdentifiedTerminologyId: string | null;
  mappingIdentifierFieldId: string | null;
}

export interface TerminologyRecord {
  id: string;
  name: string;
  description: string;
  isSubscribed: boolean;
  subscriptionReference: string;
  isActive: boolean;
  isLocked: boolean;
  isPredefined: boolean;
  concurrencyStamp: string;
  fields: TerminologyField[];
}

export interface TerminologyListItem {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  isSubscribed: boolean;
  isLocked: boolean;
  isPredefined: boolean;
  fieldCount: number;
  recordCount: number;
}

export interface TerminologyRow {
  rowId: string;
  /** Cell value by field NAME. */
  cells: Record<string, string>;
}

export interface TerminologyErrorRow {
  rowId: string;
  cells: { fieldName: string; value: string; error: string }[];
}

export interface TerminologyImportJob {
  jobId: string;
  status: string;
  totalRows: number;
  processedRows: number;
  succeededRows: number;
  failedRows: number;
  errorMessage: string | null;
}

/** What the server answered a write with. */
export interface TerminologyAnswer {
  status: number;
  text: string;
  validationErrors: string[];
}

/** A disposable name: `QA Automation Terminology <label> <stamp>`. */
export const terminologyName = (label = ''): string =>
  `${DISPOSABLE_TERMINOLOGY_PREFIX}${label === '' ? '' : ` ${label}`} ${networkStamp()}`;

const payloadOf = <T>(text: string): T => (JSON.parse(text) as { payload: T }).payload;

/** JSON or null - for answers that may be an error page or empty. */
export function parseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Lookup item ids by code. */
async function lookupIds(page: Page, path: string): Promise<Record<string, string>> {
  const res = await NetworkUtils.requestAsSession(page, 'GET', path);
  if (res.status >= 300) throw new Error(`${path} answered ${res.status}`);
  return Object.fromEntries(payloadOf<{ id: string; code: string }[]>(res.text).map((item) => [item.code, item.id]));
}

export const fieldTypeIds = (page: Page): Promise<Record<string, string>> => lookupIds(page, ApiEndpoints.terminologyFieldTypeLookup);
export const restrictionIds = (page: Page): Promise<Record<string, string>> => lookupIds(page, ApiEndpoints.terminologyFieldRestrictionLookup);
export const deactivationReasonIds = (page: Page): Promise<Record<string, string>> =>
  lookupIds(page, ApiEndpoints.terminologyDeactivationReasonLookup);

/** The create / update body of one field. */
async function fieldBody(page: Page, field: TerminologyFieldSpec, order: number): Promise<Record<string, unknown>> {
  const types = await fieldTypeIds(page);
  const restrictions = await restrictionIds(page);
  const type = field.type ?? 'text';
  return {
    id: null,
    name: field.name,
    typeId: types[type],
    restrictionId: restrictions[field.restriction ?? DEFAULT_RESTRICTION[type]],
    maxLength: field.maxLength ?? 0,
    isRequired: field.required ?? false,
    isUnique: field.unique ?? false,
    skipCheckOnUpdate: false,
    showOnTable: field.showOnTable ?? true,
    order,
    listTypeId: field.listLookupId ?? null,
    mappingIdentifiedTerminologyId: field.mapsTo?.terminologyId ?? null,
    mappingIdentifierFieldId: field.mapsTo?.fieldId ?? null,
  };
}

/** The default field set: one required, unique text "Code". */
export const DEFAULT_TERMINOLOGY_FIELDS: TerminologyFieldSpec[] = [
  { name: 'Code', type: 'text', restriction: 'none', maxLength: 50, required: true, unique: true },
];

export async function readTerminology(page: Page, id: string): Promise<TerminologyRecord> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.terminologyDetail, { id });
  if (res.status >= 300) throw new Error(`GetTerminology answered ${res.status} ${res.text.slice(0, 200)}`);
  return payloadOf<TerminologyRecord>(res.text);
}

/** The whole register (it is small - eleven terminologies on 2026-10-29). */
export async function listTerminologies(page: Page): Promise<{ items: TerminologyListItem[]; totalRows: number }> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.terminologyList, { pageNumber: 1, rowsPerPage: 500, sortBy: 'CreatedOn desc' });
  if (res.status >= 300) throw new Error(`GetTerminologies answered ${res.status}`);
  const body = payloadOf<{ terminologies: { items: TerminologyListItem[]; totalRows: number } }>(res.text);
  return body.terminologies;
}

export async function findTerminology(page: Page, name: string): Promise<TerminologyListItem | null> {
  return (await listTerminologies(page)).items.find((item) => item.name === name) ?? null;
}

/** The names other screens are offered (active terminologies only). */
export async function offeredTerminologyNames(page: Page): Promise<string[]> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.terminologyDropdown, {});
  if (res.status >= 300) throw new Error(`GetTerminologiesDropdown answered ${res.status}`);
  return payloadOf<{ id: string; name: string }[]>(res.text).map((item) => item.name);
}

export async function readRecords(page: Page, terminologyId: string): Promise<TerminologyRow[]> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.terminologyData, {
    terminologyId, pageNumber: 1, rowsPerPage: 500, sortBy: 'CreatedOn desc', filters: [],
  });
  if (res.status >= 300) throw new Error(`GetTerminologyData answered ${res.status}`);
  const body = payloadOf<{ fields: { id: string; name: string }[]; rows: { rowId: string; cells: Record<string, string>; display?: Record<string, string> }[] }>(res.text);
  const nameOf = Object.fromEntries(body.fields.map((f) => [f.id, f.name]));
  return body.rows.map((row) => ({
    rowId: row.rowId,
    cells: Object.fromEntries(Object.entries(row.cells).map(([fieldId, value]) => [nameOf[fieldId] ?? fieldId, row.display?.[fieldId] ?? value])),
  }));
}

export async function readErrorRows(page: Page, terminologyId: string): Promise<TerminologyErrorRow[]> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.terminologyErrors, {
    terminologyId, pageNumber: 1, rowsPerPage: 500, sortBy: 'CreatedOn desc',
  });
  if (res.status >= 300) throw new Error(`GetTerminologyErrors answered ${res.status}`);
  return payloadOf<{ rows: TerminologyErrorRow[] }>(res.text).rows;
}

/** The values a mapping field offers its record drawer. */
export async function mappedValues(page: Page, fieldId: string): Promise<string[]> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.terminologyMappedValues, { fieldId, includeRowIds: [] });
  if (res.status >= 300) throw new Error(`GetMappedFieldValues answered ${res.status}`);
  return payloadOf<{ items: { display: string }[] }>(res.text).items.map((item) => item.display);
}

/** Field id by name for a terminology. */
export async function fieldIdsOf(page: Page, terminologyId: string): Promise<Record<string, string>> {
  return Object.fromEntries((await readTerminology(page, terminologyId)).fields.map((f) => [f.name, f.id]));
}

/** Writes one record (new when `rowId` is null), cells keyed by field NAME. */
export async function upsertRecord(
  page: Page,
  terminologyId: string,
  cellsByName: Record<string, string>,
  rowId: string | null = null,
): Promise<TerminologyAnswer & { rowId: string | null }> {
  const ids = await fieldIdsOf(page, terminologyId);
  const cells = Object.fromEntries(Object.entries(cellsByName).map(([name, value]) => [ids[name] ?? name, value]));
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.terminologyUpsertRow, { terminologyId, rowId, cells });
  const written = res.status < 300 ? payloadOf<{ rowId: string }>(res.text).rowId : null;
  return { ...res, rowId: written };
}

export async function deleteRecord(page: Page, terminologyId: string, rowId: string): Promise<TerminologyAnswer> {
  return NetworkUtils.postAsSession(page, ApiEndpoints.terminologyDeleteRow, { terminologyId, rowId });
}

export async function setTerminologyActive(page: Page, id: string, active: boolean): Promise<TerminologyAnswer> {
  const reason = active ? null : Object.values(await deactivationReasonIds(page))[0];
  return NetworkUtils.postAsSession(page, ApiEndpoints.terminologySetActive, {
    id, isActive: active, inactivationReasonId: reason, inactivationDetails: null,
  });
}

export async function setTerminologyLocked(page: Page, id: string, locked: boolean): Promise<TerminologyAnswer> {
  return NetworkUtils.postAsSession(page, ApiEndpoints.terminologySetLocked, { id, isLocked: locked });
}

/**
 * Saves a terminology's details the way the Edit drawer does: the current
 * fields WITHOUT the automatic Is Active one (the server answers 422 "a
 * reserved field name" when it is sent back), plus the concurrency stamp.
 */
export async function updateTerminology(
  page: Page,
  id: string,
  changes: { name?: string; description?: string; subscribed?: boolean; subscriptionReference?: string; addFields?: TerminologyFieldSpec[]; dropFields?: string[] } = {},
): Promise<TerminologyAnswer> {
  const current = await readTerminology(page, id);
  const kept = current.fields
    .filter((f) => f.name !== 'Is Active' && !(changes.dropFields ?? []).includes(f.name))
    .map((f) => ({ ...f }));
  const added: Record<string, unknown>[] = [];
  for (const [i, field] of (changes.addFields ?? []).entries()) added.push(await fieldBody(page, field, kept.length + i + 1));
  return NetworkUtils.requestAsSession(page, 'PUT', ApiEndpoints.terminologyUpdate, {
    id,
    name: changes.name ?? current.name,
    description: changes.description ?? current.description,
    isSubscribed: changes.subscribed ?? current.isSubscribed,
    subscriptionReference: changes.subscriptionReference ?? current.subscriptionReference,
    fields: [...kept, ...added],
    concurrencyStamp: current.concurrencyStamp,
  });
}

export async function deleteTerminology(page: Page, id: string): Promise<TerminologyAnswer> {
  return NetworkUtils.requestAsSession(page, 'DELETE', `${ApiEndpoints.terminologyDelete}/${id}`);
}

/** Uploads an Excel file as the Upload Data drawer does (multipart `file` + `terminologyId`). */
export async function uploadImport(
  page: Page,
  terminologyId: string,
  headers: readonly string[],
  rows: ReadonlyArray<readonly string[]>,
): Promise<{ status: number; jobId: string | null; text: string }> {
  const token = await page.evaluate((key) => window.localStorage.getItem(key), ACCESS_TOKEN_KEY);
  const response = await page.request.post(`${env.baseUrl}${ApiEndpoints.terminologyUpload}`, {
    headers: { Authorization: `Bearer ${token ?? ''}` },
    multipart: {
      terminologyId,
      file: { name: 'terminology-upload.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: buildXlsx(headers, rows) },
    },
    failOnStatusCode: false,
  });
  const text = await response.text();
  Logger.step(`POST ${ApiEndpoints.terminologyUpload} returned ${response.status()}`);
  const jobId = response.ok() ? payloadOf<{ jobId: string }>(text).jobId : null;
  return { status: response.status(), jobId, text };
}

export async function readImportJob(page: Page, terminologyId: string, includeCompleted = true): Promise<TerminologyImportJob | null> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.terminologyImportJob, { terminologyId, includeCompleted });
  if (res.status >= 300) throw new Error(`GetActiveTerminologyImportJob answered ${res.status}`);
  return payloadOf<TerminologyImportJob | null>(res.text);
}

/** Final import statuses - a job in any other status is still running. */
export const FINISHED_IMPORT = /^(Completed|CompletedWithErrors|Failed)$/;

/** Polls the import job until it reaches a final status (the job is processed in the background). */
export async function waitForImport(page: Page, terminologyId: string, timeoutMs = 120_000): Promise<TerminologyImportJob> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const job = await readImportJob(page, terminologyId);
    if (job !== null && FINISHED_IMPORT.test(job.status)) return job;
    if (Date.now() > deadline) throw new Error(`the import of terminology ${terminologyId} did not finish within ${timeoutMs / 1000} s (last status ${job?.status ?? 'none'})`);
    await page.waitForTimeout(1_000);
  }
}

/** Sends one CreateTerminology (unlocked) and returns the answer with the new id, when one was created. */
export async function requestCreate(page: Page, spec: TerminologySpec & { name: string }): Promise<TerminologyAnswer & { id: string | null }> {
  const fields = spec.fields ?? DEFAULT_TERMINOLOGY_FIELDS;
  const bodies: Record<string, unknown>[] = [];
  for (const [i, field] of fields.entries()) bodies.push(await fieldBody(page, field, i + 1));
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.terminologyCreate, {
    name: spec.name,
    description: spec.description ?? 'Built by the automation suite for one case; safe to delete.',
    isSubscribed: spec.subscribed ?? false,
    subscriptionReference: spec.subscriptionReference ?? '',
    isActive: spec.active ?? true,
    isLocked: false,
    fields: bodies,
  });
  return { ...res, id: res.status < 300 ? payloadOf<{ id: string }>(res.text).id : null };
}

/** The Lookup module's list names - the sources a List field may use. */
export async function lookupListNames(page: Page): Promise<string[]> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.lookupList, { rowsPerPage: 1000 });
  if (res.status >= 300) throw new Error(`GetLookups answered ${res.status}`);
  return payloadOf<{ items: { englishName: string }[] }>(res.text).items.map((item) => item.englishName);
}

/** Builds a terminology in the wanted state. */
export async function provisionTerminology(page: Page, spec: TerminologySpec = {}): Promise<ProvisionedTerminology> {
  const name = spec.name ?? terminologyName();
  const description = spec.description ?? 'Built by the automation suite for one case; safe to delete.';
  Logger.step(`[fixture] Creating terminology "${name}"`);
  const res = await requestCreate(page, { ...spec, name, description });
  if (res.id === null) throw new Error(`CreateTerminology answered ${res.status} ${res.text.slice(0, 300)}`);
  const id = res.id;
  const fieldIds = await fieldIdsOf(page, id);
  const recordIds: string[] = [];
  for (const record of spec.records ?? []) {
    const written = await upsertRecord(page, id, record);
    if (written.rowId === null) throw new Error(`a record of "${name}" was refused: ${written.status} ${written.validationErrors.join('; ') || written.text.slice(0, 200)}`);
    recordIds.push(written.rowId);
  }
  if (spec.locked === true) {
    const locked = await setTerminologyLocked(page, id, true);
    if (locked.status >= 300) throw new Error(`SetTerminologyLocked answered ${locked.status}`);
  }
  return { id, name, description, fieldIds, recordIds };
}

/**
 * Removes a terminology the suite built - unlocks it, deletes its records and
 * failed upload rows, then the terminology. Best effort: a leftover is named
 * with DISPOSABLE_TERMINOLOGY_PREFIX and does no harm.
 */
export async function discardTerminology(page: Page, id: string): Promise<void> {
  const current = await readTerminology(page, id).catch(() => null);
  if (current === null) return;
  // A running import keeps adding rows; let it finish so they can all be removed.
  if ((await readImportJob(page, id, false).catch(() => null)) !== null) await waitForImport(page, id).catch(() => undefined);
  await setTerminologyLocked(page, id, false).catch(() => undefined);
  // A subscribed terminology is refused deletion (409) - the 2026-10-30 run left every subscribed one behind.
  if (current.isSubscribed) await updateTerminology(page, id, { subscribed: false, subscriptionReference: '' }).catch(() => undefined);
  // readRecords returns one page of 500 and the import cases load 5000 rows, so delete page by page,
  // twenty at a time. There is no bulk delete and the server takes ~0.1 s a row (5000 rows outlasted
  // 20192's teardown, 2026-10-30), so the rows get 90 s; a terminology still holding rows then is
  // left behind and logged rather than failing the case it served.
  const deadline = Date.now() + 90_000;
  for (let pass = 0; pass < 20 && Date.now() < deadline; pass += 1) {
    const rows = await readRecords(page, id).catch(() => [] as TerminologyRow[]);
    if (rows.length === 0) break;
    for (let i = 0; i < rows.length; i += 20) {
      await Promise.all(rows.slice(i, i + 20).map((row) => deleteRecord(page, id, row.rowId).catch(() => undefined)));
    }
  }
  for (const row of await readErrorRows(page, id).catch(() => [] as TerminologyErrorRow[])) {
    await NetworkUtils.postAsSession(page, ApiEndpoints.terminologyDeleteErrorRow, { terminologyId: id, rowId: row.rowId }).catch(() => undefined);
  }
  if (Date.now() >= deadline) Logger.warn(`[fixture] Terminology ${id} (${current.name}) still holds records after 90 s of deletions; it is left behind`);
  const deleted = await deleteTerminology(page, id).catch(() => null);
  Logger.step(`[fixture] Discarded terminology ${id}: ${deleted?.status ?? 'not answered'}`);
}

/** One change applied to a terminology to give it a history (fixture `terminologyWithHistory`). */
export type TerminologyChange =
  | { description: string }
  | { addField: TerminologyFieldSpec }
  | { dropField: string }
  | { addRecord: Record<string, string> }
  | { updateRecord: number; cells: Record<string, string> }
  | { deleteRecord: number }
  | { lockToggles: number }
  | { deactivate: true };

/** Applies changes in order; `recordIds` collects the rows added, for later updates / deletions by index. */
export async function applyChanges(page: Page, terminology: ProvisionedTerminology, changes: readonly TerminologyChange[]): Promise<void> {
  const fail = (what: string, answer: TerminologyAnswer): never => {
    throw new Error(`${what} answered ${answer.status} ${answer.validationErrors.join('; ') || answer.text.slice(0, 200)}`);
  };
  for (const change of changes) {
    if ('description' in change) {
      const answer = await updateTerminology(page, terminology.id, { description: change.description });
      if (answer.status >= 300) fail('UpdateTerminology', answer);
    } else if ('addField' in change) {
      const answer = await updateTerminology(page, terminology.id, { addFields: [change.addField] });
      if (answer.status >= 300) fail('UpdateTerminology (add field)', answer);
    } else if ('dropField' in change) {
      const answer = await updateTerminology(page, terminology.id, { dropFields: [change.dropField] });
      if (answer.status >= 300) fail('UpdateTerminology (remove field)', answer);
    } else if ('addRecord' in change) {
      const answer = await upsertRecord(page, terminology.id, change.addRecord);
      if (answer.rowId === null) fail('UpsertTerminologyRow', answer);
      terminology.recordIds.push(answer.rowId ?? '');
    } else if ('updateRecord' in change) {
      const answer = await upsertRecord(page, terminology.id, change.cells, terminology.recordIds[change.updateRecord]);
      if (answer.status >= 300) fail('UpsertTerminologyRow (update)', answer);
    } else if ('deleteRecord' in change) {
      const answer = await deleteRecord(page, terminology.id, terminology.recordIds[change.deleteRecord]);
      if (answer.status >= 300) fail('DeleteTerminologyRow', answer);
    } else if ('lockToggles' in change) {
      for (let i = 0; i < change.lockToggles; i += 1) {
        const answer = await setTerminologyLocked(page, terminology.id, i % 2 === 0);
        if (answer.status >= 300) fail('SetTerminologyLocked', answer);
      }
    } else {
      const answer = await setTerminologyActive(page, terminology.id, false);
      if (answer.status >= 300) fail('SetTerminologyActive', answer);
    }
  }
}

/** How many audit entries the server holds for a terminology. */
export async function auditEntryCount(page: Page, terminologyId: string): Promise<number> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.auditLogList, {
    entityType: 'Terminology', entityId: terminologyId, actionType: null, pageNumber: 1, rowsPerPage: 1,
  });
  if (res.status >= 300) throw new Error(`GetAuditLogs answered ${res.status}`);
  return payloadOf<{ totalRows: number }>(res.text).totalRows;
}

/**
 * Rewrites a value so a text restriction accepts it: digits become letters for
 * English-only, Latin characters become Arabic letters for Arabic-only,
 * separators are dropped for alphanumeric. Each mapping is one-to-one, so a
 * unique label stays unique.
 */
export function fitRestriction(value: string, restriction: string | undefined): string {
  const digitsToLetters = (v: string): string => v.replace(/\d/g, (d) => String.fromCharCode(65 + Number(d)));
  if (restriction === 'englishOnly') return digitsToLetters(value).replace(/[^A-Za-z ]/g, '').replace(/\s+/g, ' ').trim();
  if (restriction === 'arabicOnly') {
    const latin = digitsToLetters(value).toUpperCase().replace(/[^A-Z ]/g, '');
    return [...latin].map((ch) => (ch === ' ' ? ' ' : String.fromCharCode(0x0627 + ((ch.charCodeAt(0) - 65) % 26)))).join('').replace(/\s+/g, ' ').trim();
  }
  if (restriction === 'alphaNumeric') return value.replace(/[^A-Za-z0-9]/g, '');
  if (restriction === 'numbersOnly') return value.replace(/\D/g, '') || '1';
  return value;
}

/** A record that satisfies a terminology's own fields, for terminologies the suite did not build. */
export interface SampleRecord {
  /** Cells by field NAME, for the API (mapping fields hold the referenced row id). */
  cells: Record<string, string>;
  /** Text-like inputs by FIELD ID, for the record drawer. */
  text: Record<string, string>;
  /** List / mapping selects by FIELD ID - the drawer picks their first option. */
  selectFirst: string[];
  /** The field whose value identifies the record on screen, and that value. */
  labelField: string;
  labelValue: string;
  /** That field's id and maximum length (0 = unlimited). */
  labelFieldId: string;
  labelMaxLength: number;
}

/**
 * Builds a record that a terminology's fields will accept - for the predefined
 * lists, whose field sets the suite does not choose. The first text field
 * carries `label` (made unique), other text fields a short value, numbers 1,
 * dates a fixed day, booleans true, and mapping fields the first value their
 * target offers.
 */
export async function sampleRecord(page: Page, terminologyId: string, label: string): Promise<SampleRecord> {
  const types = Object.fromEntries(Object.entries(await fieldTypeIds(page)).map(([code, id]) => [id, code]));
  const restrictions = Object.fromEntries(Object.entries(await restrictionIds(page)).map(([code, id]) => [id, code]));
  // The identifying value goes into a text field a Latin label can satisfy
  // (no restriction, English or alphanumeric) - an Arabic-only field cannot take it.
  const latinFirst = (f: TerminologyField): number => (restrictions[f.restrictionId] === 'arabicOnly' ? 1 : 0);
  const fields = (await readTerminology(page, terminologyId)).fields
    .filter((f) => f.name !== 'Is Active')
    .sort((a, b) => latinFirst(a) - latinFirst(b));
  const sample: SampleRecord = { cells: {}, text: {}, selectFirst: [], labelField: '', labelValue: '', labelFieldId: '', labelMaxLength: 0 };
  for (const field of fields) {
    const type = types[field.typeId];
    const restriction = restrictions[field.restrictionId];
    const cap = (raw: string): string => {
      const value = fitRestriction(raw, restriction);
      return field.maxLength > 0 ? value.slice(0, field.maxLength) : value;
    };
    if (type === 'mappingIdentifier') {
      const res = await NetworkUtils.postAsSession(page, ApiEndpoints.terminologyMappedValues, { fieldId: field.id, includeRowIds: [] });
      const first = res.status < 300 ? payloadOf<{ items: { rowId: string }[] }>(res.text).items[0]?.rowId : undefined;
      if (first !== undefined) sample.cells[field.name] = first;
      sample.selectFirst.push(field.id);
    } else if (type === 'list') {
      sample.selectFirst.push(field.id);
    } else if (type === 'number') {
      sample.cells[field.name] = '1';
      sample.text[field.id] = '1';
    } else if (type === 'date') {
      sample.cells[field.name] = '2026-01-15';
      sample.text[field.id] = '2026-01-15';
    } else if (type === 'boolean') {
      sample.cells[field.name] = 'true';
    } else if (sample.labelField === '') {
      sample.labelField = field.name;
      sample.labelFieldId = field.id;
      sample.labelMaxLength = field.maxLength;
      sample.labelValue = cap(label);
      sample.cells[field.name] = sample.labelValue;
      sample.text[field.id] = sample.labelValue;
    } else {
      const value = cap(`${label.slice(0, 6)}${networkStamp().slice(-4)}`);
      sample.cells[field.name] = value;
      sample.text[field.id] = value;
    }
  }
  return sample;
}

/** The predefined (platform) terminologies of the register. */
export async function predefinedTerminologies(page: Page): Promise<TerminologyListItem[]> {
  return (await listTerminologies(page)).items.filter((item) => item.isPredefined);
}

/** A string of exactly `length` characters (a readable, repeating pattern). */
export const textOfLength = (length: number, seed = 'Terminology'): string =>
  seed.repeat(Math.ceil(length / seed.length)).slice(0, length);
