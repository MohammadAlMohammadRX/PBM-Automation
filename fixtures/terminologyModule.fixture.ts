import { test as base } from '@playwright/test';
import type { Page } from '@playwright/test';
import { TerminologyManagementPage } from '../pages/terminology/TerminologyManagementPage';
import { TerminologyDetailPage } from '../pages/terminology/TerminologyDetailPage';
import { TerminologyFormDrawer } from '../pages/terminology/TerminologyFormDrawer';
import { TerminologyRecordDialog } from '../pages/terminology/TerminologyRecordDialog';
import { TerminologyImportDialog } from '../pages/terminology/TerminologyImportDialog';
import { TerminologyDeactivateDrawer } from '../pages/terminology/TerminologyDeactivateDrawer';
import { NotificationCentre } from '../pages/components/NotificationCentre';
import { ConfirmDialog } from '../pages/components/ConfirmDialog';
import { TERMINOLOGY_DEACTIVATE } from '../constants/ElementIds';
import { blockedByPrecondition } from './testStatus.fixture';
import { env } from '../constants/EnvironmentConfig';
import { Logger } from '../utils/Logger';
import { ScreenshotUtils } from '../utils/ScreenshotUtils';
import {
  FINISHED_IMPORT,
  applyChanges,
  deleteRecord,
  discardTerminology,
  findTerminology,
  predefinedTerminologies,
  provisionTerminology,
  readImportJob,
  readRecords,
  sampleRecord,
  upsertRecord,
  uploadImport,
  waitForImport,
  type ProvisionedTerminology,
  type SampleRecord,
  type TerminologyChange,
  type TerminologyImportJob,
  type TerminologyListItem,
  type TerminologySpec,
} from '../utils/TerminologyProvisioning';

/** Which predefined terminology a case needs. */
export interface PredefinedPick {
  /** One of the six by name ("Country", "City", ...). */
  name?: string;
  /** Needs to be unlocked (a case that writes values into it). */
  unlocked?: boolean;
  /** The one holding the fewest / most records. */
  records?: 'fewest' | 'most';
  /** Exactly this many records (e.g. 0). */
  recordCount?: number;
}

/** A second window of the SAME administrator session - for the concurrent cases. */
export interface SecondWindow {
  page: Page;
  terminologies: TerminologyManagementPage;
  detail: TerminologyDetailPage;
}

export interface TerminologyModuleFixtures {
  terminologyManagementPage: TerminologyManagementPage;
  terminologyDetailPage: TerminologyDetailPage;
  /**
   * The drawers and dialogs, as fixtures: each wraps the page only (no state),
   * so a case opens one through its screen and then drives it here without
   * holding a page object between steps.
   */
  terminologyFormDrawer: TerminologyFormDrawer;
  terminologyRecordDialog: TerminologyRecordDialog;
  terminologyImportDialog: TerminologyImportDialog;
  terminologyDeactivateDrawer: TerminologyDeactivateDrawer;
  /** The shared confirmation dialog (`#pbm-dialog`) - Lock, Unlock, Activate, Delete. */
  terminologyConfirmDialog: ConfirmDialog;
  notificationCentre: NotificationCentre;
  /**
   * Builds a terminology for this case (utils/TerminologyProvisioning.ts) in
   * the wanted state - fields, records, active / locked / subscribed - and
   * discards it at teardown. BLOCKED when the application refuses to build it.
   */
  terminologyIn: (spec?: TerminologySpec) => Promise<ProvisionedTerminology>;
  /**
   * A terminology built by `terminologyIn` and then CHANGED through the API in
   * the given order - the precondition of every audit-history case ("a
   * terminology with prior changes"). Discarded with the others at teardown;
   * BLOCKED when a change is refused.
   */
  terminologyWithHistory: (spec: TerminologySpec, history: readonly TerminologyChange[]) => Promise<ProvisionedTerminology>;
  /**
   * Registers a terminology the CASE creates through the screen (by name), so
   * it is discarded at teardown like a provisioned one.
   */
  discardTerminologyNamed: (name: string) => void;
  /**
   * One of the six predefined terminologies, chosen by `pick` - or BLOCKED
   * naming what the register lacks. Never modified by this fixture.
   */
  predefinedTerminology: (pick?: PredefinedPick) => Promise<TerminologyListItem>;
  /**
   * Writes a disposable record into an existing (e.g. predefined) terminology
   * and deletes it at teardown - the predefined lists are shared reference
   * data, so a case adds its own value rather than touching the seeded ones.
   * BLOCKED when the terminology is locked or refuses the record.
   */
  recordIn: (terminologyId: string, cells: Record<string, string>) => Promise<string>;
  /**
   * A record a terminology's own fields will accept (utils `sampleRecord`) -
   * for the predefined lists, whose fields the suite does not choose.
   */
  sampleRecordFor: (terminologyId: string, label: string) => Promise<SampleRecord>;
  /**
   * Registers a record the CASE adds through the screen, by the text it shows,
   * so it is deleted at teardown - the predefined lists are shared data.
   */
  discardRecordShowing: (terminologyId: string, text: string) => void;
  /**
   * Uploads an Excel file into a terminology through the import endpoint (the
   * Upload Data drawer's own call) and waits for the background job to
   * finish - the precondition of every Upload Errors case. BLOCKED when the
   * upload is refused or never finishes.
   */
  completedImport: (terminologyId: string, headers: readonly string[], rows: ReadonlyArray<readonly string[]>) => Promise<TerminologyImportJob>;
  /**
   * Starts a LARGE import and hands it back while it is still running - the
   * precondition of the one-import-at-a-time cases. BLOCKED when the
   * environment finishes it before it can be observed running (small imports
   * complete in about a second here).
   */
  runningImport: (terminologyId: string, headers: readonly string[], rows: ReadonlyArray<readonly string[]>) => Promise<TerminologyImportJob>;
  /** A second window of the administrator session, closed at teardown. */
  secondWindow: () => Promise<SecondWindow>;
  /**
   * BLOCKS the case unless the shaped session can read the terminology list.
   * The catalogue's GetTerminologies node is the PARENT of every write right,
   * and withholding a child was seen to take list access away with it
   * (2026-10-30) - a restricted user who sees nothing proves nothing about the
   * one control the case is about (the baseline rule, 2026-09-21).
   */
  requireListAccess: (session: { terminologies: TerminologyManagementPage }) => Promise<void>;
}

export const test = base.extend<TerminologyModuleFixtures>({
  terminologyManagementPage: async ({ page }, use) => {
    await use(new TerminologyManagementPage(page));
  },

  terminologyDetailPage: async ({ page }, use) => {
    await use(new TerminologyDetailPage(page));
  },

  terminologyFormDrawer: async ({ page }, use) => {
    await use(new TerminologyFormDrawer(page));
  },

  terminologyRecordDialog: async ({ page }, use) => {
    await use(new TerminologyRecordDialog(page));
  },

  terminologyImportDialog: async ({ page }, use) => {
    await use(new TerminologyImportDialog(page));
  },

  terminologyDeactivateDrawer: async ({ page }, use) => {
    // The list's namespace; the detail screen's drawer is reached through TerminologyDetailPage.
    await use(new TerminologyDeactivateDrawer(page, TERMINOLOGY_DEACTIVATE.list));
  },

  terminologyConfirmDialog: async ({ page }, use) => {
    await use(new ConfirmDialog(page));
  },

  notificationCentre: async ({ page }, use) => {
    await use(new NotificationCentre(page));
  },

  terminologyIn: async ({ page }, use, testInfo) => {
    const built: string[] = [];
    await use(async (spec = {}) => {
      try {
        if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
        const terminology = await provisionTerminology(page, spec);
        built.push(terminology.id);
        return terminology;
      } catch (error) {
        return blockedByPrecondition(testInfo, `a terminology ${JSON.stringify({ ...spec, records: spec.records?.length ?? 0 }).slice(0, 160)}`, error);
      }
    });
    // Newest first: a terminology mapped by a later one is freed by deleting that one first.
    for (const id of [...built].reverse()) await discardTerminology(page, id).catch(() => undefined);
  },

  terminologyWithHistory: async ({ page, terminologyIn }, use, testInfo) => {
    await use(async (spec, history) => {
      const terminology = await terminologyIn(spec);
      try {
        await applyChanges(page, terminology, history);
        return terminology;
      } catch (error) {
        return blockedByPrecondition(testInfo, `a terminology with ${history.length} prior change(s)`, error);
      }
    });
  },

  discardTerminologyNamed: async ({ page }, use) => {
    const names: string[] = [];
    await use((name) => names.push(name));
    for (const name of names) {
      const found = await findTerminology(page, name).catch(() => null);
      if (found !== null) await discardTerminology(page, found.id).catch(() => undefined);
    }
  },

  predefinedTerminology: async ({ page }, use, testInfo) => {
    await use(async (pick = {}) => {
      try {
        if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
        let candidates = await predefinedTerminologies(page);
        if (pick.name !== undefined) candidates = candidates.filter((t) => t.name === pick.name);
        if (pick.unlocked === true) candidates = candidates.filter((t) => !t.isLocked);
        if (pick.recordCount !== undefined) candidates = candidates.filter((t) => t.recordCount === pick.recordCount);
        const sorted = [...candidates].sort((a, b) => a.recordCount - b.recordCount);
        const chosen = pick.records === 'most' ? sorted[sorted.length - 1] : sorted[0];
        if (chosen === undefined) throw new Error(`the register holds no predefined terminology matching ${JSON.stringify(pick)}`);
        Logger.step(`[fixture] Predefined terminology "${chosen.name}" (${chosen.recordCount} records, ${chosen.isLocked ? 'locked' : 'unlocked'})`);
        return chosen;
      } catch (error) {
        return blockedByPrecondition(testInfo, `a predefined terminology ${JSON.stringify(pick)}`, error);
      }
    });
  },

  recordIn: async ({ page }, use, testInfo) => {
    const written: { terminologyId: string; rowId: string }[] = [];
    await use(async (terminologyId, cells) => {
      try {
        if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
        const listed = (await predefinedTerminologies(page)).find((t) => t.id === terminologyId);
        if (listed?.isLocked === true) throw new Error(`"${listed.name}" is locked in this environment, and unlocking shared reference data is not a case's to do`);
        const answer = await upsertRecord(page, terminologyId, cells);
        if (answer.rowId === null) throw new Error(`the record was refused: ${answer.status} ${answer.validationErrors.join('; ') || answer.text.slice(0, 200)}`);
        written.push({ terminologyId, rowId: answer.rowId });
        return answer.rowId;
      } catch (error) {
        return blockedByPrecondition(testInfo, `a disposable record in terminology ${terminologyId}`, error);
      }
    });
    for (const row of written) await deleteRecord(page, row.terminologyId, row.rowId).catch(() => undefined);
  },

  sampleRecordFor: async ({ page }, use, testInfo) => {
    await use(async (terminologyId, label) => {
      try {
        if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
        return await sampleRecord(page, terminologyId, label);
      } catch (error) {
        return blockedByPrecondition(testInfo, `a valid sample record for terminology ${terminologyId}`, error);
      }
    });
  },

  discardRecordShowing: async ({ page }, use) => {
    const marks: { terminologyId: string; text: string }[] = [];
    await use((terminologyId, text) => marks.push({ terminologyId, text }));
    for (const mark of marks) {
      const rows = await readRecords(page, mark.terminologyId).catch(() => []);
      for (const row of rows.filter((r) => Object.values(r.cells).some((v) => v.includes(mark.text)))) {
        await deleteRecord(page, mark.terminologyId, row.rowId).catch(() => undefined);
      }
    }
  },

  completedImport: async ({ page }, use, testInfo) => {
    await use(async (terminologyId, headers, rows) => {
      try {
        if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
        const upload = await uploadImport(page, terminologyId, headers, rows);
        if (upload.jobId === null) throw new Error(`the upload was refused: ${upload.status} ${upload.text.slice(0, 200)}`);
        return await waitForImport(page, terminologyId);
      } catch (error) {
        return blockedByPrecondition(testInfo, 'a finished import into the case\'s terminology', error);
      }
    });
  },

  runningImport: async ({ page }, use, testInfo) => {
    await use(async (terminologyId, headers, rows) => {
      try {
        if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
        const upload = await uploadImport(page, terminologyId, headers, rows);
        if (upload.jobId === null) throw new Error(`the upload was refused: ${upload.status} ${upload.text.slice(0, 200)}`);
        const job = await readImportJob(page, terminologyId);
        if (job === null || FINISHED_IMPORT.test(job.status)) {
          throw new Error(`the ${rows.length}-row import had already finished (${job?.status ?? 'no job'}) when it was first read, so no import could be observed RUNNING`);
        }
        return job;
      } catch (error) {
        return blockedByPrecondition(testInfo, 'an import still running for the case\'s terminology', error);
      }
    });
    // Nothing to undo: the terminology the import ran into is discarded by terminologyIn.
  },

  requireListAccess: async ({}, use, testInfo) => {
    await use(async (session) => {
      if (await session.terminologies.canListTerminologies()) return;
      blockedByPrecondition(
        testInfo,
        'a restricted role that can still view the terminology list',
        new Error('the shaped account is refused GetTerminologies - in this catalogue the list right is the parent of every '
          + 'write right, so withholding any of them takes the list away, and a role that may view but not change '
          + 'terminologies cannot be built'),
      );
    });
  },

  secondWindow: async ({ page }, use, testInfo) => {
    const opened: Page[] = [];
    await use(async () => {
      const second = await page.context().newPage();
      opened.push(second);
      ScreenshotUtils.registerSession(testInfo, second);
      return { page: second, terminologies: new TerminologyManagementPage(second), detail: new TerminologyDetailPage(second) };
    });
    for (const second of opened) await second.close().catch(() => undefined);
  },
});
