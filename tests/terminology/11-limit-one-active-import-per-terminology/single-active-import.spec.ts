import { test, expect } from '../../../fixtures';
import { xlsxUpload } from '../../../data/terminology/terminology.data';
import { BLOCKED_START, CASES, IMPORT_FIELDS, IMPORT_HEADERS, RUNNING, failingFile, largeFile, smallFile } from '../../../data/terminology/singleActiveImport.data';

/**
 * User story 15157: Limit One Active Import per Terminology.
 * At most one import runs per terminology at a time: a second is refused while
 * one runs (however it is attempted), other terminologies are unaffected, the
 * slot frees when the import completes or fails, and the running import is
 * visible on the list and detail screens.
 */
test.describe('US 15157 - Limit One Active Import per Terminology', () => {
  test(`TC-${CASES.startWhenIdle.azureId}: should start an import and mark the terminology as running when no import is running for it`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyImportDialog,
    terminologyIn,
    steps,
  }) => {
    const terminology = await terminologyIn({ name: CASES.startWhenIdle.name(), fields: IMPORT_FIELDS });

    await steps.critical('Navigate to the Terminology Management module - the module home page is displayed', async () => {
      await terminologyManagementPage.open();
      expect(await terminologyManagementPage.fetchImportJob(terminology.id), 'no import running yet').toBeNull();
    });

    await steps.critical('The start import option shows the file selection dialog', async () => {
      await terminologyManagementPage.openDetails(terminology.name);
      await terminologyDetailPage.openImport();
    });

    await steps.step('A valid file is accepted, the import begins and the terminology is marked "Import Running"', async () => {
      await terminologyImportDialog.chooseFile(xlsxUpload(IMPORT_HEADERS, largeFile('IDLE')));
      const answer = await terminologyImportDialog.upload();
      expect(answer.status).toBe(200);
      expect(await terminologyDetailPage.getImportStatusText(), 'an import-running indicator').toMatch(RUNNING);
    });
  });

  test(`TC-${CASES.blockSecond.azureId}: should refuse a second import when one is already running for the same terminology`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyIn,
    runningImport,
    steps,
  }) => {
    const terminology = await terminologyIn({ name: CASES.blockSecond.name(), fields: IMPORT_FIELDS });
    const first = await runningImport(terminology.id, IMPORT_HEADERS, largeFile('FIRST'));

    await steps.critical('Opening the terminology while its import runs shows the import as running', async () => {
      await terminologyDetailPage.open(terminology.id);
      expect(await terminologyDetailPage.getImportStatusText()).toMatch(RUNNING);
    });

    await steps.step('Starting a new import is disabled or answered with an import-already-running message, and no second import starts', async () => {
      const attempt = await terminologyDetailPage.attemptImport(xlsxUpload(IMPORT_HEADERS, smallFile('SECOND')));
      expect(attempt.status, 'the second import should not be queued').not.toBe(200);
      expect((await terminologyManagementPage.fetchImportJob(terminology.id))?.jobId).toBe(first.jobId);
      expect(attempt.offered !== 'available' || BLOCKED_START.test(attempt.messages.join(' ')), 'a withheld Upload or an import-running message').toBe(true);
    });
  });

  test(`TC-${CASES.otherTerminology.azureId}: should start the import when another terminology's import is running`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyImportDialog,
    terminologyIn,
    runningImport,
    steps,
  }) => {
    const data = CASES.otherTerminology;
    const running = await terminologyIn({ name: data.running(), fields: IMPORT_FIELDS });
    const other = await terminologyIn({ name: data.other(), fields: IMPORT_FIELDS });
    await runningImport(running.id, IMPORT_HEADERS, largeFile('BUSY'));

    await steps.critical('Opening the other terminology shows no active import', async () => {
      await terminologyDetailPage.open(other.id);
      expect(await terminologyManagementPage.fetchImportJob(other.id)).toBeNull();
    });

    await steps.step('Starting an import for it succeeds and it is marked running', async () => {
      await terminologyDetailPage.openImport();
      await terminologyImportDialog.chooseFile(xlsxUpload(IMPORT_HEADERS, smallFile('OTHER')));
      const answer = await terminologyImportDialog.upload();
      expect(answer.status).toBe(200);
      expect(answer.jobId).not.toBeNull();
    });
  });

  test(`TC-${CASES.progressVisible.azureId}: should show its status, start time and progress on the terminology screen when an import is running`, async ({
    terminologyDetailPage,
    terminologyIn,
    runningImport,
    steps,
  }) => {
    const data = CASES.progressVisible;
    const terminology = await terminologyIn({ name: data.name(), fields: IMPORT_FIELDS });
    await runningImport(terminology.id, IMPORT_HEADERS, largeFile('PROGRESS'));

    await steps.step('The detail screen shows the running import with its status, start time and a progress indicator', async () => {
      await terminologyDetailPage.open(terminology.id);
      const text = await terminologyDetailPage.getImportStatusText();
      expect(text, 'the import status').toMatch(RUNNING);
      expect(text, 'the start time').toMatch(data.startTime);
      expect(text, 'a progress indicator').toMatch(data.progress);
    });
  });

  test(`TC-${CASES.afterCompletion.azureId}: should accept a new import when the running import has completed`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyImportDialog,
    terminologyIn,
    runningImport,
    steps,
  }) => {
    const terminology = await terminologyIn({ name: CASES.afterCompletion.name(), fields: IMPORT_FIELDS });
    await runningImport(terminology.id, IMPORT_HEADERS, largeFile('LIFE'));

    await steps.critical('Waiting for the running import shows its status change from Running to Completed', async () => {
      expect((await terminologyManagementPage.waitForImportToFinish(terminology.id)).status).toMatch(CASES.afterCompletion.completed);
      await terminologyDetailPage.open(terminology.id);
    });

    await steps.step('A new import starts and is marked running', async () => {
      await terminologyDetailPage.openImport();
      await terminologyImportDialog.chooseFile(xlsxUpload(IMPORT_HEADERS, smallFile('AFTER')));
      const answer = await terminologyImportDialog.upload();
      expect(answer.status).toBe(200);
      expect(answer.jobId).not.toBeNull();
    });
  });

  test(`TC-${CASES.afterFailure.azureId}: should accept a new import when the previous import for the terminology failed`, async ({
    terminologyDetailPage,
    terminologyImportDialog,
    terminologyIn,
    completedImport,
    steps,
  }) => {
    const terminology = await terminologyIn({ name: CASES.afterFailure.name(), fields: IMPORT_FIELDS });
    const failed = await completedImport(terminology.id, IMPORT_HEADERS, failingFile());

    await steps.critical('Opening the terminology after the failed import shows it failed and nothing running', async () => {
      expect(failed.status).toMatch(CASES.afterFailure.failed);
      await terminologyDetailPage.open(terminology.id);
      expect(await terminologyDetailPage.getImportProgressText()).not.toMatch(RUNNING);
    });

    await steps.step('A new import starts', async () => {
      await terminologyDetailPage.openImport();
      await terminologyImportDialog.chooseFile(xlsxUpload(IMPORT_HEADERS, smallFile('RETRY')));
      expect((await terminologyImportDialog.upload()).status).toBe(200);
    });
  });

  test(`TC-${CASES.simultaneous.azureId}: should accept only one request when two imports are started at the same instant for one terminology`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const terminology = await terminologyIn({ name: CASES.simultaneous.name(), fields: IMPORT_FIELDS });
    let statuses: number[] = [];

    await steps.critical('Navigate to the Terminology Management module - the module home page is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('Two start-import requests sent back to back are answered, and only one is accepted', async () => {
      const answers = await Promise.all([
        terminologyManagementPage.sendUpload(terminology.id, IMPORT_HEADERS, largeFile('TWIN-A')),
        terminologyManagementPage.sendUpload(terminology.id, IMPORT_HEADERS, largeFile('TWIN-B')),
      ]);
      statuses = answers.map((a) => a.status);
      expect(statuses.filter((s) => s === 200), `answers: ${statuses.join(', ')}`).toHaveLength(1);
    });

    await steps.step('Exactly one import is shown as running for the terminology', async () => {
      const job = await terminologyManagementPage.waitForImportToFinish(terminology.id);
      const codes = (await terminologyManagementPage.fetchRecords(terminology.id)).map((r) => r.cells.Code.split('-').slice(0, 2).join('-'));
      expect(new Set(codes).size, `imports that wrote records: ${[...new Set(codes)].join(', ')} (last job ${job.status})`).toBe(1);
    });
  });

  test(`TC-${CASES.indicators.azureId}: should indicate the running import on the list and the detail screen when an import is running`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyIn,
    runningImport,
    steps,
  }) => {
    const terminology = await terminologyIn({ name: CASES.indicators.name(), fields: IMPORT_FIELDS });
    await runningImport(terminology.id, IMPORT_HEADERS, largeFile('SHOWN'));

    await steps.step('The detail screen shows a running-import indicator, the terminology name and a disabled start-import control', async () => {
      await terminologyDetailPage.open(terminology.id);
      expect(await terminologyDetailPage.getName()).toBe(terminology.name);
      expect(await terminologyDetailPage.getImportStatusText()).toMatch(RUNNING);
      expect((await terminologyDetailPage.getToolbarState('upload')).availability).not.toBe('available');
    });

    await steps.step('The list view also shows that the terminology has an import in progress', async () => {
      await terminologyManagementPage.open();
      expect(await terminologyManagementPage.getRowText(terminology.name), 'an import indicator on the row').toMatch(RUNNING);
    });
  });

  test(`TC-${CASES.noPermission.azureId}: should withhold starting an import when the user lacks the import permission`, async ({
    terminologyManagementPage,
    terminologyIn,
    shapedNonAdmin,
    requireListAccess,
    steps,
  }) => {
    const terminology = await terminologyIn({ name: CASES.noPermission.name(), fields: IMPORT_FIELDS });
    const session = await shapedNonAdmin(CASES.noPermission.granted);
    await requireListAccess(session);

    await steps.critical('Navigate to the Terminology Management module - the module home page is displayed', async () => {
      await session.terminologyDetail.openExpectingFailure(terminology.id);
      expect(await session.terminologyDetail.isLoaded()).toBe(true);
    });

    await steps.step('The start import control is disabled or hidden for this user', async () => {
      expect((await session.terminologyDetail.getToolbarState('upload')).availability).not.toBe('available');
    });

    await steps.step('Triggering the import directly is denied with an insufficient-permissions answer', async () => {
      const answer = await session.terminologies.sendUpload(terminology.id, IMPORT_HEADERS, smallFile('NOPERM'));
      expect(answer.status, `the server answered ${answer.status}`).toBeGreaterThanOrEqual(400);
      expect(await terminologyManagementPage.fetchImportJob(terminology.id)).toBeNull();
    });
  });

  test(`TC-${CASES.zeroToOne.azureId}: should allow the first import and refuse another when one import is already running`, async ({
    terminologyManagementPage,
    terminologyIn,
    runningImport,
    steps,
  }) => {
    const terminology = await terminologyIn({ name: CASES.zeroToOne.name(), fields: IMPORT_FIELDS });
    let firstJob = '';

    await steps.critical('With zero imports running, an import starts and the running count becomes one', async () => {
      expect(await terminologyManagementPage.fetchImportJob(terminology.id)).toBeNull();
      firstJob = (await runningImport(terminology.id, IMPORT_HEADERS, largeFile('ZERO'))).jobId;
    });

    await steps.step('With one running, another import is refused because one is the maximum', async () => {
      const second = await terminologyManagementPage.sendUpload(terminology.id, IMPORT_HEADERS, smallFile('ONE'));
      expect(second.status, `the second import was answered ${second.status}`).not.toBe(200);
      expect((await terminologyManagementPage.fetchImportJob(terminology.id))?.jobId).toBe(firstJob);
    });
  });

  test(`TC-${CASES.repeatedClicks.azureId}: should never create a second concurrent import when the start is repeated, the page refreshed or reopened`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyImportDialog,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.repeatedClicks;
    const terminology = await terminologyIn({ name: data.name(), fields: IMPORT_FIELDS });
    let firstJob: string | null = null;

    await steps.critical('Starting an import on the terminology is accepted', async () => {
      await terminologyDetailPage.open(terminology.id);
      await terminologyDetailPage.openImport();
      await terminologyImportDialog.chooseFile(xlsxUpload(IMPORT_HEADERS, largeFile('CLICK')));
      firstJob = (await terminologyImportDialog.upload()).jobId;
      expect(firstJob).not.toBeNull();
    });

    await steps.step('Repeated starts, a refresh and reopening the terminology are each blocked or ignored, leaving only the original import', async () => {
      const repeats: number[] = [];
      for (let i = 0; i < data.clicks; i += 1) repeats.push((await terminologyManagementPage.sendUpload(terminology.id, IMPORT_HEADERS, smallFile(`REPEAT${i}`))).status);
      await terminologyDetailPage.reload();
      await terminologyDetailPage.open(terminology.id);
      expect(repeats.filter((s) => s === 200), `repeated starts accepted: ${repeats.join(', ')}`).toEqual([]);
      const job = await terminologyManagementPage.fetchImportJob(terminology.id);
      expect(job?.jobId).toBe(firstJob);
    });
  });
});
