import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { MemberManagementPage } from '../../../pages/member/MemberManagementPage';
import { CASES, WIZARD_MEMBER } from '../../../data/member/memberListDashboardCounters.data';
import { POLICY_SUITE_PAYER } from '../../../utils/PolicyProvisioning';
import {
  SUITE_MEMBER_ARABIC_FIRST,
  SUITE_MEMBER_ARABIC_SECOND,
  SUITE_MEMBER_FIRST_NAME,
  SUITE_MEMBER_SECOND_NAME,
  arabicLettersToken,
  memberDayText,
  readMemberDashboard,
  suiteMemberDisplayName,
  suiteMemberEmail,
  suiteMemberLastName,
  suiteMobileNumber,
  uniqueDocumentId,
  type MemberDashboard,
  type MemberState,
} from '../../../utils/MemberProvisioning';
import { countRegister, listInPayerScope, readTileStyles, readTiles, statusOf, wholeRegister } from '../../../utils/member/writerAHelpers';

/**
 * User story 14376: Member List - Dashboard Counters.
 * The four KPI tiles (Total, Active, Inactive, Special Needs): live updates on a
 * status change, each tile against the register, the flag-not-status rule, the
 * payer scope (breadcrumb payer select) and labels. See the data file for how
 * the cases map onto the live list.
 */
test.describe('US 14376 - Member List - Dashboard Counters', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test(`TC-${CASES.statusChange.azureId}: should move one member from the Active to the Inactive counter at once when its status changes`, async ({
    memberManagementPage: list,
    memberDetailPage: detail,
    memberIn,
    steps,
  }) => {
    const member = await memberIn('Active');
    let before!: MemberDashboard;

    await steps.critical('Navigate to the Member Management module - the dashboard loads with current counters visible', async () => {
      await list.openTable();
      expect(await list.isKpiBandVisible(), 'the KPI tiles').toBe(true);
    });

    await steps.critical('Note the current Active and Inactive counter values - the values are recorded', async () => {
      before = await readTiles(list);
      expect({ active: Number.isFinite(before.active), inactive: Number.isFinite(before.inactive) }, JSON.stringify(before)).toEqual({ active: true, inactive: true });
    });

    await steps.critical(`Open the active member "${member.displayNameEn}" and change its status to Inactive - the status update is saved`, async () => {
      await detail.open(member.id);
      const drawer = await detail.openDeactivate();
      const answer = await drawer.deactivate('Deactivated by the automation suite (counters case).');
      expect(answer.status, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBe(200);
      await detail.expectStatus('Inactive');
    });

    await steps.step('Return to the dashboard - it refreshes with the updated data', async () => {
      await list.openTable();
      expect(await list.isKpiBandVisible(), 'the KPI tiles').toBe(true);
    });

    await steps.step('Observe the Active and Inactive counters - Active decreased by 1 and Inactive increased by 1', async () => {
      const after = await readTiles(list);
      expect({ active: after.active, inactive: after.inactive, total: after.total })
        .toEqual({ active: before.active - 1, inactive: before.inactive + 1, total: before.total });
    });
  });

  /** 19774 / 19775: the tile against the status filter's count. */
  const counterMatchesFilter = async (
    { list, memberIn, steps }: { list: MemberManagementPage; memberIn: (state?: MemberState) => Promise<unknown>; steps: TestSteps },
    status: 'Active' | 'Inactive',
  ): Promise<void> => {
    await memberIn('Active');
    await memberIn('Inactive');
    let tile = -1;
    let count = -1;

    await steps.critical('Navigate to the Member Management module - the dashboard loads', async () => {
      await list.openTable();
      tile = (await readTiles(list))[status === 'Active' ? 'active' : 'inactive'];
      expect(Number.isFinite(tile), 'a settled tile value').toBe(true);
    });

    await steps.critical(`Filter the member list by Status = ${status} - only ${status.toLowerCase()} members are listed, giving count N`, async () => {
      const answer = await list.filterBy('status', status);
      count = answer.totalRows;
      const shown = await list.readColumnValues('status');
      expect({ others: shown.filter((s) => s !== status), othersInAnswer: answer.items.filter((i) => statusOf(i) !== status).length, someListed: count > 0 }, shown.join(' | '))
        .toEqual({ others: [], othersInAnswer: 0, someListed: true });
    });

    await steps.step(`Compare N with the dashboard ${status} counter - the counter equals N`, async () => {
      expect(tile, `the ${status} tile vs the ${status} filter's ${count} members`).toBe(count);
    });
  };

  test(`TC-${CASES.activeCounter.azureId}: should show in the Active counter exactly the members the Active status filter lists`, async ({
    memberManagementPage: list,
    memberIn,
    steps,
  }) => {
    await counterMatchesFilter({ list, memberIn, steps }, CASES.activeCounter.status);
  });

  test(`TC-${CASES.inactiveCounter.azureId}: should show in the Inactive counter exactly the members the Inactive status filter lists`, async ({
    memberManagementPage: list,
    memberIn,
    steps,
  }) => {
    await counterMatchesFilter({ list, memberIn, steps }, CASES.inactiveCounter.status);
  });

  test(`TC-${CASES.fourCounters.azureId}: should show the four counters Total, Active, Inactive and Special Needs matching the members of the administrator's scope`, async ({
    memberManagementPage: list,
    memberIn,
    page,
    steps,
  }) => {
    await memberIn('Active');
    await memberIn('Inactive');
    await memberIn('SpecialNeeds');

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.critical('Log in as the Member Administrator (the administrator) and open the dashboard - the dashboard shows member data', async () => {
      expect(await list.isKpiBandVisible(), 'the KPI tiles').toBe(true);
    });

    await steps.step('Observe the dashboard counters section - four counters labelled Total, Active, Inactive and Special Needs', async () => {
      const labels = await list.readKpiLabels();
      expect({ count: labels.length, matched: CASES.fourCounters.labels.map((re) => labels.some((l) => re.test(l))) }, labels.join(' | '))
        .toEqual({ count: 4, matched: [true, true, true, true] });
    });

    await steps.step('Compare each counter value with the member records of the scope - each counter matches the actual count', async () => {
      const tiles = await readTiles(list);
      expect(tiles).toEqual(countRegister(await wholeRegister(page)));
    });
  });

  test(`TC-${CASES.specialNeedsFlag.azureId}: should count every flagged member in Special Needs whether active or inactive`, async ({
    memberManagementPage: list,
    memberIn,
    page,
    steps,
  }) => {
    const combos = [
      { label: 'Active + Flagged', member: await memberIn('SpecialNeeds'), active: true, flagged: true },
      { label: 'Active + Not flagged', member: await memberIn('Active'), active: true, flagged: false },
      { label: 'Inactive + Flagged', member: await memberIn('InactiveSpecialNeeds'), active: false, flagged: true },
      { label: 'Inactive + Not flagged', member: await memberIn('Inactive'), active: false, flagged: false },
    ];

    await steps.critical('Navigate to the Member Management module - the dashboard loads', async () => {
      await list.openTable();
      expect(await list.isKpiBandVisible(), 'the KPI tiles').toBe(true);
    });

    await steps.critical('Verify the four combinations of status and Special Needs flag exist in the member list - the test data is present', async () => {
      const register = await wholeRegister(page);
      const found = combos.map((c) => {
        const item = register.find((i) => i.id === c.member.id);
        return { label: c.label, listed: item !== undefined, active: item?.isActive, flagged: item?.isSpecialNeeds };
      });
      expect(found).toEqual(combos.map((c) => ({ label: c.label, listed: true, active: c.active, flagged: c.flagged })));
      for (const c of combos) expect((await list.readRow(c.member.displayNameEn)).status, c.label).toBe(c.active ? 'Active' : 'Inactive');
    });

    await steps.step('Observe the Special Needs counter - it equals every member with the flag, Active or Inactive', async () => {
      await list.openTable();
      const tile = (await readTiles(list)).specialNeeds;
      const register = await wholeRegister(page);
      expect({ tile, inactiveFlaggedCounted: register.some((i) => i.id === combos[2].member.id && i.isSpecialNeeds) })
        .toEqual({ tile: register.filter((i) => i.isSpecialNeeds).length, inactiveFlaggedCounted: true });
    });
  });

  test(`TC-${CASES.payerScoped.azureId}: should limit the counters to the members of the selected payer`, async ({
    memberManagementPage: list,
    memberEnrolled,
    page,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const { member: inPayer, enrolments } = await memberEnrolled({ policies: 1 });
    // A member with NO enrolment is not "a member of another payer" (the smoke of
    // 2026-11-05 found such a member listed under every payer scope), and the
    // suite holds no policy of a second payer - so "no counts from other payers"
    // is checked as: the tiles count exactly the scope's own members, and the
    // scope holds fewer members than All Payers.
    const payer = enrolments[0].policy;
    let allPayers!: MemberDashboard;

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await list.openTable();
      allPayers = await readTiles(list);
      expect(await list.readPayerScope(), 'the breadcrumb payer select').not.toBe('');
    });

    await steps.critical(`Log in as an administrator assigned only to Payer A ("${payer.payerName}", chosen in the payer select) - the dashboard loads`, async () => {
      const { header } = await list.selectPayerScope(payer.payerName);
      expect({ header, tiles: await list.isKpiBandVisible() }).toEqual({ header: payer.payerId, tiles: true });
    });

    await steps.step(`Observe the counters - they reflect only "${payer.payerName}" members, no counts from other payers`, async () => {
      const tiles = await readTiles(list);
      const scoped = await listInPayerScope(page, payer.payerId);
      const ids = scoped.items.map((i) => i.id);
      expect({
        tiles,
        apiTiles: await readMemberDashboard(page, payer.payerId),
        payerMemberListed: ids.includes(inPayer.id),
        fewerThanAllPayers: tiles.total < allPayers.total,
      }).toEqual({ tiles: countRegister(scoped.items), apiTiles: countRegister(scoped.items), payerMemberListed: true, fewerThanAllPayers: true });
    });
  });

  test(`TC-${CASES.oneMember.azureId}: should show a Total of 1 and that member's status and flag when the payer has exactly one member`, async ({
    memberManagementPage: list,
    page,
    steps,
  }) => {
    let payerId = '';
    let only: MemberDashboard | null = null;

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await list.openTable();
      expect(await list.isKpiBandVisible(), 'the KPI tiles').toBe(true);
    });

    await steps.critical(`Log in as a user assigned to the payer with exactly one member (the suite payer "${POLICY_SUITE_PAYER}" in the payer select) - the dashboard loads for that payer`, async () => {
      const { header } = await list.selectPayerScope(POLICY_SUITE_PAYER);
      payerId = header ?? '';
      expect(payerId, 'the X-Selected-Payer-Id sent').not.toBe('');
      const scoped = await listInPayerScope(page, payerId);
      if (scoped.totalRows !== 1) {
        steps.blocked(`a payer whose scope holds exactly one member: the suite payer "${POLICY_SUITE_PAYER}" holds ${scoped.totalRows} `
          + '(members belong to a payer through enrolments, and earlier runs leave retired enrolments); the suite cannot create a payer');
      }
      only = countRegister(scoped.items);
    });

    await steps.step('Observe the counters - Total displays 1 and the status / flag counters reflect that single member', async () => {
      const tiles = await readTiles(list);
      expect({ total: tiles.total, tiles }).toEqual({ total: 1, tiles: only });
    });
  });

  test(`TC-${CASES.switchPayers.azureId}: should update the counters to the selected payer each time the payer selection changes`, async ({
    memberManagementPage: list,
    page,
    steps,
  }) => {
    let payerB = '';

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await list.openTable();
      expect(await list.isKpiBandVisible(), 'the KPI tiles').toBe(true);
    });

    await steps.critical('Log in as an administrator assigned to Payer A and Payer B - a payer selector control is displayed', async () => {
      const options = await list.getPayerScopeOptions();
      payerB = options.find((o) => !/all payers/i.test(o) && o.trim() !== POLICY_SUITE_PAYER) ?? '';
      expect({ selector: await list.readPayerScope() !== '', hasA: options.includes(POLICY_SUITE_PAYER), hasB: payerB !== '' }, options.slice(0, 10).join(' | '))
        .toEqual({ selector: true, hasA: true, hasB: true });
    });

    await steps.step(`Select Payer A ("${POLICY_SUITE_PAYER}") - the counters update to Payer A's members only`, async () => {
      const { header, dashboard } = await list.selectPayerScope(POLICY_SUITE_PAYER);
      const tiles = await readTiles(list);
      const expected = header ? await readMemberDashboard(page, header) : null;
      expect({ header: header !== null, tiles, captured: dashboard }).toEqual({ header: true, tiles: expected, captured: expected });
    });

    await steps.step('Switch the selection to Payer B - the counters update to Payer B\'s members only, replacing Payer A\'s values', async () => {
      const { header, dashboard } = await list.selectPayerScope(payerB);
      const tiles = await readTiles(list);
      const expected = header ? await readMemberDashboard(page, header) : null;
      expect({ payer: payerB, header: header !== null, tiles, captured: dashboard }).toEqual({ payer: payerB, header: true, tiles: expected, captured: expected });
    });
  });

  test(`TC-${CASES.sequence.azureId}: should keep the counters accurate after adding, inactivating and deleting members in a row`, async ({
    memberManagementPage: list,
    memberIn,
    discardMemberNamed,
    page,
    steps,
  }) => {
    const toInactivate = await memberIn('Active');
    const toDelete = await memberIn('Active');
    const lastName = suiteMemberLastName();
    const added = suiteMemberDisplayName(lastName);
    discardMemberNamed(added);
    let tiles!: MemberDashboard;
    const settlesTo = async (expected: MemberDashboard, what: string): Promise<void> => {
      await expect.poll(async () => readTiles(list), { message: `the tiles after ${what}`, timeout: 20_000 }).toEqual(expected);
    };

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await list.openTable();
      tiles = await readTiles(list);
      expect(Number.isFinite(tiles.total), JSON.stringify(tiles)).toBe(true);
    });

    await steps.step('Perform a sequence of actions - add a member, inactivate another, then delete a third, observing the counters after each - they update consistently', async () => {
      const form = await list.openAddForm();
      const answer = await form.create({
        englishFirstName: SUITE_MEMBER_FIRST_NAME, englishSecondName: SUITE_MEMBER_SECOND_NAME, englishLastName: lastName,
        arabicFirstName: SUITE_MEMBER_ARABIC_FIRST, arabicSecondName: SUITE_MEMBER_ARABIC_SECOND, arabicLastName: arabicLettersToken(),
        nationality: WIZARD_MEMBER.nationality, documentId: await uniqueDocumentId(page), dateOfBirth: memberDayText(WIZARD_MEMBER.dateOfBirth),
        gender: WIZARD_MEMBER.gender, memberStatus: WIZARD_MEMBER.memberStatus,
      }, { mobileNumber: suiteMobileNumber(), email: suiteMemberEmail(), preferredContactMethod: WIZARD_MEMBER.preferredContactMethod, preferredLanguage: WIZARD_MEMBER.preferredLanguage }, { country: WIZARD_MEMBER.country });
      expect(answer.status, `add: ${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBe(200);
      tiles = { ...tiles, total: tiles.total + 1, active: tiles.active + 1 };
      await settlesTo(tiles, 'adding a member');

      const drawer = await list.openDeactivateDrawer(toInactivate.displayNameEn);
      const inactivated = await drawer.deactivate('Deactivated by the automation suite (counters sequence).');
      expect(inactivated.status, `inactivate: ${inactivated.text.slice(0, 200)}`).toBe(200);
      tiles = { ...tiles, active: tiles.active - 1, inactive: tiles.inactive + 1 };
      await settlesTo(tiles, 'inactivating a member');

      const deleted = await list.deleteMember(toDelete.displayNameEn);
      expect(deleted.status, `delete: ${deleted.text.slice(0, 200)} ${deleted.messages.join(' | ')}`).toBe(200);
      tiles = { ...tiles, total: tiles.total - 1, active: tiles.active - 1 };
      await settlesTo(tiles, 'deleting a member');
    });

    await steps.step('Refresh the page after the sequence - the counters still reflect the accurate current state', async () => {
      const answered = await list.reloadCapturingDashboard();
      const shown = await readTiles(list);
      expect({ shown, answered }).toEqual({ shown: countRegister(await wholeRegister(page)), answered: shown });
    });
  });

  test(`TC-${CASES.tileLabels.azureId}: should label the four counter tiles Total, Active, Inactive and Special Needs with legible, consistently styled values`, async ({
    memberManagementPage: list,
    page,
    steps,
  }) => {
    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await list.openTable();
      expect(await list.isKpiBandVisible(), 'the KPI tiles').toBe(true);
    });

    await steps.step('Check each counter tile for its label, a visible numeric value and consistent styling - the four tiles read Total, Active, Inactive and Special Needs with their values', async () => {
      const kpis = await list.readKpis();
      const tiles = [kpis.total, kpis.active, kpis.inactive, kpis.specialNeeds];
      const styles = Object.values(await readTileStyles(page));
      expect({
        labels: tiles.map((t, i) => CASES.tileLabels.labels[i].test(t.label)),
        numeric: tiles.map((t) => /^\d[\d,]*$/.test(t.value)),
        consistentStyle: new Set(styles).size === 1 && styles[0] !== '',
      }, `${tiles.map((t) => `${t.label}=${t.value}`).join(' | ')} - styles ${styles.join(' / ')}`)
        .toEqual({ labels: [true, true, true, true], numeric: [true, true, true, true], consistentStyle: true });
    });
  });
});
