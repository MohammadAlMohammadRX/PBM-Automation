import { test, expect } from '../../../fixtures';
import {
  BUDGET,
  FACILITY_ACTIVE,
  PHARMACY_TYPE,
  codeOfOption,
} from '../../../data/networks/facilities.data';
import { BLOCKED_CASES, CASE, MEMBERSHIP, REFUSAL } from '../../../data/networks/proposeFacilities.data';

/**
 * User story 14131: Propose pharmacy facility assignments for approval.
 * The assignable pool and the eligibility rules a proposal is checked against.
 *
 * The sheet's "Propose Facility Assignment" screen is the detail page's Assign
 * Facilities drawer. Eligibility partitions (inactive pharmacy, non-pharmacy)
 * need facilities the environment may not hold: the `facilityOfClass` fixture
 * DISCOVERS one and reports BLOCKED, naming the class, when none exists.
 */
test.describe('US 14131 - Assignable pool and eligibility', () => {
  test(`TC-${CASE.pool}: should offer only active pharmacies not yet linked when the assignable pool is opened`, async ({
    networkDetailPage,
    networkIn,
    facilityDirectory,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [MEMBERSHIP.existing.code] });
    let pool: string[] = [];

    await steps.critical('Navigate to the module and open the network - its detail screen loads', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().getCodes()).toContain(MEMBERSHIP.existing.code);
    });

    await steps.critical('Open Assign Facilities - the assignment drawer opens with its pool', async () => {
      const tab = networkDetailPage.facilities();
      await tab.openAssignDrawer();
      pool = (await tab.getAssignableOptions()).map(codeOfOption);
      expect(pool.length, 'the pool should offer at least one facility').toBeGreaterThan(0);
    });

    await steps.step('The pool excludes the facility already linked to the network', async () => {
      expect(pool, 'an already-linked facility must not be offered again').not.toContain(MEMBERSHIP.existing.code);
    });

    await steps.step('Every facility offered is an active pharmacy', async () => {
      const directory = await facilityDirectory();
      const offered = directory.filter((facility) => pool.includes(facility.code));
      expect(offered.map((f) => f.code).sort(), 'every pooled facility should be in the facility directory').toEqual([...pool].sort());
      for (const facility of offered) {
        expect(facility.type, `${facility.code} should be a pharmacy`).toMatch(PHARMACY_TYPE);
        expect(facility.status, `${facility.code} should be Active`).toBe(FACILITY_ACTIVE);
      }
      await networkDetailPage.facilities().cancelAssign();
    });
  });

  test(`TC-${CASE.partitions}: should list only the active unassigned pharmacy when each eligibility partition is searched in the pool`, async ({
    networkDetailPage,
    networkIn,
    facilityOfClass,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const inactivePharmacy = await facilityOfClass({ pharmacy: true, active: false });
    const clinic = await facilityOfClass({ pharmacy: false, active: true });
    const eligible = await facilityOfClass({ pharmacy: true, active: true });
    const network = await networkIn('Active', { facilityCodes: [MEMBERSHIP.existing.code] });
    let pool: string[] = [];

    await steps.critical('Navigate to the network and open the pool - the candidates load', async () => {
      await networkDetailPage.open(network.id);
      const tab = networkDetailPage.facilities();
      await tab.open();
      await tab.openAssignDrawer();
      pool = (await tab.getAssignableOptions()).map(codeOfOption);
      expect(pool.length).toBeGreaterThan(0);
    });

    await steps.step('Only the active, unassigned pharmacy appears; the other partitions do not', async () => {
      expect(pool, 'active + pharmacy + unassigned').toContain(eligible.code);
      expect(pool, 'inactive pharmacy').not.toContain(inactivePharmacy.code);
      expect(pool, 'non-pharmacy facility').not.toContain(clinic.code);
      expect(pool, 'already-assigned pharmacy').not.toContain(MEMBERSHIP.existing.code);
      await networkDetailPage.facilities().cancelAssign();
    });
  });

  test(`TC-${CASE.nonPharmacy}: should reject a non-pharmacy facility when it is proposed bypassing the pool`, async ({
    networkDetailPage,
    networkIn,
    facilityOfClass,
    steps,
  }) => {
    const clinic = await facilityOfClass({ pharmacy: false, active: true });
    const network = await networkIn('Draft', { facilityCodes: [MEMBERSHIP.existing.code] });
    let answer = { status: 0, text: '' };

    await steps.critical('Navigate to the network - the Facility Assignment tab loads', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().getCodes()).toContain(MEMBERSHIP.existing.code);
    });

    await steps.step('Submitting the non-pharmacy directly is refused with a pharmacy-only validation error', async () => {
      answer = await networkDetailPage.facilities().assignViaApi(network.id, [clinic.id]);
      expect(answer.status, `assigning ${clinic.code} (${clinic.type}) should be refused: ${answer.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
      expect(answer.text, 'the refusal should say only pharmacies can be assigned').toMatch(REFUSAL.nonPharmacy);
    });

    await steps.step('The non-pharmacy is not added to the network', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().getCodes()).not.toContain(clinic.code);
    });
  });

  test(`TC-${CASE.alreadyAssigned}: should reject a facility already assigned when it is proposed again bypassing the pool`, async ({
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Draft', { facilityCodes: [MEMBERSHIP.existing.code] });

    await steps.critical('Navigate to the network - the already-assigned facility is listed', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().getCodes()).toEqual([MEMBERSHIP.existing.code]);
    });

    await steps.step('Submitting it again directly is refused with an "already assigned" validation error', async () => {
      const answer = await networkDetailPage.facilities().assignViaApi(network.id, network.facilityIds);
      expect(answer.status, `re-assigning ${MEMBERSHIP.existing.code} should be refused: ${answer.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
      expect(answer.text, 'the refusal should say the facility is already assigned').toMatch(REFUSAL.alreadyAssigned);
    });

    await steps.step('No duplicate assignment appears', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().getCodes()).toEqual([MEMBERSHIP.existing.code]);
    });
  });

  test(`TC-${CASE.decisionTable}: should accept only the active unassigned pharmacy when every eligibility combination is proposed`, async ({
    networkDetailPage,
    networkIn,
    facilityOfClass,
    steps,
  }) => {
    const eligible = await facilityOfClass({ pharmacy: true, active: true });
    const inactivePharmacy = await facilityOfClass({ pharmacy: true, active: false });
    const clinic = await facilityOfClass({ pharmacy: false, active: true });
    const network = await networkIn('Draft', { facilityCodes: [MEMBERSHIP.existing.code] });
    const assigned = network.facilityIds[0];

    await steps.critical('Navigate to the network - the Facility Assignment tab loads', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      expect(await networkDetailPage.facilities().getCodes()).toContain(MEMBERSHIP.existing.code);
    });

    await steps.step('Rule 2 (pharmacy, active, assigned) is rejected', async () => {
      const answer = await networkDetailPage.facilities().assignViaApi(network.id, [assigned]);
      expect(answer.status, 'an already-assigned pharmacy').toBeGreaterThanOrEqual(400);
    });

    await steps.step('Rule 3 (pharmacy, inactive, unassigned) is rejected', async () => {
      const answer = await networkDetailPage.facilities().assignViaApi(network.id, [inactivePharmacy.id]);
      expect(answer.status, `inactive pharmacy ${inactivePharmacy.code}`).toBeGreaterThanOrEqual(400);
      expect(answer.text).toMatch(REFUSAL.inactive);
    });

    await steps.step('Rule 4 (non-pharmacy, active, unassigned) is rejected', async () => {
      const answer = await networkDetailPage.facilities().assignViaApi(network.id, [clinic.id]);
      expect(answer.status, `non-pharmacy ${clinic.code}`).toBeGreaterThanOrEqual(400);
      expect(answer.text).toMatch(REFUSAL.nonPharmacy);
    });

    await steps.step('Rule 1 (pharmacy, active, unassigned) is accepted', async () => {
      const answer = await networkDetailPage.facilities().assignViaApi(network.id, [eligible.id]);
      expect(answer.status, `eligible pharmacy ${eligible.code}: ${answer.text.slice(0, 200)}`).toBeLessThan(300);
    });
  });

  test(`TC-${CASE.zeroSelected}: should block the proposal and create no draft when no facility is selected`, async ({
    networkDetailPage,
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(BUDGET.oneLiveNetwork);
    const network = await networkIn('Active', { facilityCodes: [MEMBERSHIP.existing.code] });
    let attempt = { sent: true, enabled: true, messages: [] as string[] };

    await steps.critical('Navigate to the network and open the assignment drawer with nothing selected', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.facilities().open();
      await networkDetailPage.facilities().openAssignDrawer();
      expect((await networkDetailPage.facilities().getAssignableOptions()).length).toBeGreaterThan(0);
    });

    await steps.step('Submitting the empty selection sends nothing', async () => {
      attempt = await networkDetailPage.facilities().attemptConfirmAssign();
      expect(attempt.sent, 'an empty proposal must not reach the server').toBe(false);
    });

    await steps.step('A validation message requires at least one facility', async () => {
      expect(attempt.messages.join(' | '), 'the user should be told to select at least one facility').toMatch(REFUSAL.atLeastOne);
    });

    await steps.step('No draft change is created for the network', async () => {
      await networkManagementPage.openList();
      expect(await networkManagementPage.readRow(network.name), 'the approval cell should still read the published version')
        .toMatchObject({ approvalStatus: expect.stringMatching(/Published/) });
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
