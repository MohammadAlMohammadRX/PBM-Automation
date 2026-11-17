import { test, expect } from '../../../fixtures';
import type { Page } from '@playwright/test';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { LookupRegisterPage } from '../../../pages/lookup/LookupPages';
import type { LookupSortField } from '../../../constants/lookup/writerAIds';
import { BLOCKED, CASES, DEFAULT_SORT, DEFAULT_SORT_LABEL, SORT_COLUMN } from '../../../data/lookup/sortAndExportLookups.data';
import { readAllLookups } from '../../../utils/lookup/lookupApi';
import {
  distinctValues,
  firstDateOutOfOrder,
  openCapturing,
  orderOk,
  orderOutcome,
  replayRegister,
  requireOrBlock,
  rowIdsOnScreen,
  sortLabel,
  sortRegister,
  type RegisterCall,
} from '../../../utils/lookup/writerAHelpers';

/**
 * User story 20855: Sort and Export Lookups - Sort By: Code, English Name and
 * Arabic Name both ways, Created On and Last Modified both ways, and the
 * Newest-first default. Each order is checked on the page shown AND on the
 * whole register re-read with the same request. Read-only. See the data file.
 */

async function openModule(steps: TestSteps, page: Page, register: LookupRegisterPage, name: string): Promise<RegisterCall> {
  let call: RegisterCall = { status: -1, request: {}, answer: { totalRows: -1, items: [] }, requeried: false };
  await steps.critical(name, async () => {
    call = await openCapturing(page, register);
    expect(call.status, `GetLookups answered ${call.status}`).toBe(200);
  });
  return call;
}

/** One Sort By choice, asserted as a step. */
async function sortStep(steps: TestSteps, page: Page, name: string, field: LookupSortField, direction: 'asc' | 'desc'): Promise<void> {
  await steps.step(name, async () => {
    const s = await sortRegister(page, field, direction);
    const { outcome, evidence } = await orderOutcome(page, s, field, direction, SORT_COLUMN[field]);
    expect(outcome, evidence).toEqual(orderOk(direction));
  });
}

/** Precondition: two lists differ in Created On, else the order is not observable (BLOCKED). */
async function differentCreationDates(steps: TestSteps, page: Page): Promise<void> {
  await steps.critical('Precondition: the lookup lists carry different creation dates', async () => {
    const all = await readAllLookups(page);
    const distinct = distinctValues(all.items.map((i) => i.createdOn));
    requireOrBlock(steps, distinct > 1, BLOCKED.sameCreationDates);
    expect(distinct, `different Created On values among ${all.totalRows} lists`).toBeGreaterThan(1);
  });
}

test.describe('US 20855 - Sort and Export Lookups (sorting)', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.codeAscending.azureId}: should list the lookups by code from A to Z when Code A-Z is selected`, async ({ page, steps, lookupRegister: register }) => {
    await steps.critical('Navigate to the Lookups Management module - the lookups register loads showing newest first', async () => {
      const call = await openCapturing(page, register);
      expect({ status: call.status, sortBy: call.request.sortBy, label: await sortLabel(page) }).toEqual({ status: 200, sortBy: DEFAULT_SORT, label: DEFAULT_SORT_LABEL });
    });
    await sortStep(steps, page, 'Open Sort By and select Code, A-Z - the list re-orders so Codes appear from A to Z', 'code', 'asc');
  });

  test(`TC-${CASES.codeDescending.azureId}: should list the lookups by code from Z to A when Code Z-A is selected`, async ({ page, steps, lookupRegister: register }) => {
    await openModule(steps, page, register, 'Navigate to the Lookups Management module - the register loads');
    await sortStep(steps, page, 'Open Sort By and select Code, Z-A - the list re-orders so Codes appear from Z to A', 'code', 'desc');
  });

  test(`TC-${CASES.dateSorts.azureId}: should order the lookups by Created On and by Last Modified in both directions`, async ({ page, steps, lookupRegister: register }) => {
    await openModule(steps, page, register, 'Navigate to the Lookups Management module - the register loads');
    await differentCreationDates(steps, page);
    await sortStep(steps, page, 'Open Sort By and select Created On, Newest to Oldest - the list orders with the most recently created lookups first', 'createdOn', 'desc');
    await sortStep(steps, page, 'Open Sort By and select Created On, Oldest to Newest - the list orders with the earliest created lookups first', 'createdOn', 'asc');

    await steps.step('Open Sort By and select Last Modified, Newest to Oldest then Oldest to Newest - the list re-orders accordingly by last modified date', async () => {
      const all = await readAllLookups(page);
      requireOrBlock(steps, distinctValues(all.items.map((i) => i.modifiedOn ?? i.createdOn)) > 1, BLOCKED.sameModifiedDates);
      const newest = await sortRegister(page, 'modifiedOn', 'desc');
      const first = await orderOutcome(page, newest, 'modifiedOn', 'desc', SORT_COLUMN.modifiedOn);
      const oldest = await sortRegister(page, 'modifiedOn', 'asc');
      const second = await orderOutcome(page, oldest, 'modifiedOn', 'asc', SORT_COLUMN.modifiedOn);
      expect({ newestToOldest: first.outcome, oldestToNewest: second.outcome }, `${first.evidence} || ${second.evidence}`)
        .toEqual({ newestToOldest: orderOk('desc'), oldestToNewest: orderOk('asc') });
    });
  });

  test(`TC-${CASES.newestByDefault.azureId}: should list the newest lookups first before any sort is applied`, async ({ page, steps, lookupRegister: register }) => {
    const call = await openModule(steps, page, register, 'Navigate to the Lookups Management module - the register loads');
    await differentCreationDates(steps, page);

    await steps.step('Check the order of rows without applying any Sort By option - rows are ordered Newest to Oldest by default', async () => {
      const whole = await replayRegister(page, call.request);
      const all = await readAllLookups(page);
      const newest = Math.max(...all.items.map((i) => Date.parse(i.createdOn)));
      const shown = await rowIdsOnScreen(page);
      expect({
        sortBy: call.request.sortBy,
        label: await sortLabel(page),
        screenIsAnswer: shown.join() === call.answer.items.map((i) => i.id).join(),
        firstIsNewest: Date.parse(call.answer.items[0]?.createdOn ?? '') === newest,
        pageOutOfOrderAt: firstDateOutOfOrder(call.answer.items.map((i) => i.createdOn), 'desc'),
        registerOutOfOrderAt: firstDateOutOfOrder(whole.items.map((i) => i.createdOn), 'desc'),
      }, `Created On on screen: ${call.answer.items.map((i) => `${i.code} ${i.createdOn}`).join(' | ')}`).toEqual({
        sortBy: DEFAULT_SORT,
        label: DEFAULT_SORT_LABEL,
        screenIsAnswer: true,
        firstIsNewest: true,
        pageOutOfOrderAt: -1,
        registerOutOfOrderAt: -1,
      });
    });
  });

  test(`TC-${CASES.nameSorts.azureId}: should order the lookups by English name and by Arabic name in both directions`, async ({ page, steps, lookupRegister: register }) => {
    await openModule(steps, page, register, 'Navigate to the Lookups Management module - the register loads');
    await sortStep(steps, page, 'Open Sort By and select English Name, A-Z - the list re-orders by English Name ascending', 'englishName', 'asc');
    await sortStep(steps, page, 'Open Sort By and select English Name, Z-A - the list re-orders by English Name descending', 'englishName', 'desc');

    await steps.step('Open Sort By and select Arabic Name, A-Z then Z-A - the list re-orders by Arabic Name ascending then descending accordingly', async () => {
      const up = await sortRegister(page, 'arabicName', 'asc');
      const first = await orderOutcome(page, up, 'arabicName', 'asc', SORT_COLUMN.arabicName);
      const down = await sortRegister(page, 'arabicName', 'desc');
      const second = await orderOutcome(page, down, 'arabicName', 'desc', SORT_COLUMN.arabicName);
      expect({ ascending: first.outcome, descending: second.outcome }, `${first.evidence} || ${second.evidence}`)
        .toEqual({ ascending: orderOk('asc'), descending: orderOk('desc') });
    });
  });
});
