import { test, expect } from '../../../fixtures';
import { CASES, REQUIRED_COLUMNS, VARIED_MEMBERS } from '../../../data/member/memberList.data';
import { flat, listInPayerScope } from '../../../utils/member/writerAHelpers';
import type { MemberRowValues } from '../../../pages/member/MemberManagementPage';
import type { ProvisionedMember } from '../../../utils/MemberProvisioning';

/** Which of the required columns a header list lacks. */
const missingColumns = (headers: readonly string[]): string[] =>
  REQUIRED_COLUMNS.filter(([, pattern]) => !headers.some((h) => pattern.test(h.trim()))).map(([name]) => name);

/**
 * User story 14377: Member List.
 * The table (default view, columns, formats), the cards (fields, switching back
 * to the table), Edit and View from a row, and the payer scope. The read-only
 * role case is in member-list-permission.spec.ts. See the data file for how the
 * cases map onto the live list.
 */
test.describe('US 14377 - Member List', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test(`TC-${CASES.tableDefault.azureId}: should open the member list in Table view by default with every required column`, async ({
    memberManagementPage: list,
    memberIn,
    steps,
  }) => {
    await memberIn('Active');

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await list.open();
      expect(await list.countRows(), 'the list rows').toBeGreaterThan(0);
    });

    await steps.step('Open the Member List without changing any view setting - the list loads in Table View', async () => {
      expect(await list.readView()).toBe('table');
    });

    await steps.step('Verify the columns - Member Name, Member ID, Document ID, Nationality, Identity Type, Mobile Number, Status, Member Status and Actions', async () => {
      await list.switchToTable();
      const headers = await list.getHeaderTexts();
      expect(missingColumns(headers), `headers shown: ${headers.join(' | ')}`).toEqual([]);
    });
  });

  test(`TC-${CASES.cardsToTable.azureId}: should show the same records and values after switching from Card View back to Table View`, async ({
    memberManagementPage: list,
    memberIn,
    page,
    steps,
  }) => {
    const member = await memberIn('Active');
    let card: Record<string, string> = {};

    await steps.critical('Navigate to the Member Management module (the list in Card View) - the module loads', async () => {
      await list.openTable();
      await list.revealRow(member.displayNameEn);
      await list.switchToCards();
      expect(await list.loadCardsUntilShown(member.displayNameEn), `a card for "${member.displayNameEn}"`).toBe(true);
      card = await list.readCard(member.displayNameEn);
    });

    await steps.critical('While in Card View, click the Table View toggle - the list switches back to Table View', async () => {
      await list.switchToTable();
      expect(await list.readView()).toBe('table');
    });

    await steps.step('Verify the records shown - the same records and values as in Card View', async () => {
      const row = await list.readRow(member.displayNameEn);
      const onPage = page.url();
      expect({
        name: row.name,
        documentId: row.documentId,
        nationality: row.nationality,
        mobile: flat(card.mobile).includes(member.mobileNumber) && row.mobileNumber.includes(member.mobileNumber),
        code: card.header.includes(row.memberCode),
      }, `card ${JSON.stringify(card)} - row ${JSON.stringify(row)} (${onPage})`)
        .toEqual({ name: member.displayNameEn, documentId: card.documentId, nationality: card.nationality, mobile: true, code: true });
    });
  });

  test(`TC-${CASES.cardFields.azureId}: should show every required member field and action on each card in Card View`, async ({
    memberManagementPage: list,
    memberIn,
    steps,
  }) => {
    const member = await memberIn('Active');

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await list.openTable();
      await list.revealRow(member.displayNameEn);
      expect(await list.readView()).toBe('table');
    });

    await steps.critical('Click the Card View toggle - the list switches to the Card View layout', async () => {
      await list.switchToCards();
      expect(await list.readView()).toBe('cards');
    });

    await steps.step('Verify the card against the required fields - Member Name, Member ID, Document ID, Nationality, Identity Type, Mobile Number, Status, Member Status and Actions', async () => {
      expect(await list.loadCardsUntilShown(member.displayNameEn), `a card for "${member.displayNameEn}"`).toBe(true);
      const card = await list.readCard(member.displayNameEn);
      const text = `${card.header} ${Object.values(card).join(' ')}`;
      const actions = {
        view: (await list.getCardActionState(member.displayNameEn, 'view')).availability,
        edit: (await list.getCardActionState(member.displayNameEn, 'edit')).availability,
        delete: (await list.getCardActionState(member.displayNameEn, 'delete')).availability,
        activeSwitch: (await list.readCardSwitch(member.displayNameEn)).present,
      };
      expect({
        memberName: card.header.includes(member.displayNameEn),
        memberId: text.includes(member.code),
        documentId: card.documentId,
        nationality: card.nationality !== '',
        identityType: card.identityType,
        mobileNumber: card.mobile.includes(member.mobileNumber),
        status: /\bActive\b/.test(text),
        memberStatus: /\b(Alive|Deceased)\b/.test(card.header),
        actions,
      }, `card: ${JSON.stringify(card)}`).toEqual({
        memberName: true,
        memberId: true,
        documentId: member.documentId,
        nationality: true,
        identityType: 'National ID',
        mobileNumber: true,
        status: true,
        memberStatus: true,
        actions: { view: 'available', edit: 'available', delete: 'available', activeSwitch: true },
      });
    });
  });

  test(`TC-${CASES.editMobile.azureId}: should save an edited mobile number and show it in the member list at once`, async ({
    memberManagementPage: list,
    memberIn,
    steps,
  }) => {
    const member = await memberIn('Active');
    const data = CASES.editMobile;
    const form = { drawer: null as Awaited<ReturnType<typeof list.openEditForm>> | null };

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.critical(`Click Edit for "${member.displayNameEn}" - the edit form opens pre-populated with the member's data`, async () => {
      form.drawer = await list.openEditForm(member.displayNameEn);
      const lastName = await form.drawer.getValue('englishLastName');
      await form.drawer.ensureStep(2);
      expect({ lastName, mobile: await form.drawer.getValue('mobileNumber'), email: await form.drawer.getValue('email') })
        .toEqual({ lastName: member.lastName, mobile: member.mobileNumber, email: member.email });
    });

    await steps.critical(`Change the Mobile Number to "${data.mobileNumber}" and save - a success confirmation is shown`, async () => {
      const drawer = form.drawer as NonNullable<typeof form.drawer>;
      await drawer.type('mobileNumber', data.mobileNumber);
      const answer = await drawer.save();
      expect(answer.messages.join(' | '), `UpdateMember answered ${answer.status}`).toMatch(/updated/i);
    });

    await steps.step('Return to the list and locate the member - the list shows the new mobile number', async () => {
      await list.openTable();
      const row = await list.readRow(member.displayNameEn);
      expect(row.mobileNumber.replace(/\D/g, ''), `the row: ${JSON.stringify(row)}`).toContain(data.mobileNumber.replace(/\D/g, ''));
    });
  });

  test(`TC-${CASES.viewRecord.azureId}: should open the member's complete record from the View action`, async ({
    memberManagementPage: list,
    memberIn,
    steps,
  }) => {
    const member = await memberIn('Complete');

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.critical(`Locate "${member.displayNameEn}" in the list - the record is visible`, async () => {
      await list.revealRow(member.displayNameEn);
      expect(await list.isRowVisible(member.displayNameEn)).toBe(true);
    });

    await steps.step('Click View for that member - its detail page opens with the full record', async () => {
      const detail = await list.openDetails(member.displayNameEn);
      const strip = await detail.readHeaderStrip();
      expect({
        id: detail.idFromUrl(),
        name: flat(await detail.getName()),
        documentId: strip.documentId,
        mobile: strip.mobileNumber.includes(member.mobileNumber),
        tabs: (await detail.readTabLabels()).length >= 4,
      }).toEqual({ id: member.id, name: member.displayNameEn, documentId: member.documentId, mobile: true, tabs: true });
    });
  });

  test(`TC-${CASES.payerList.azureId}: should list only the members of the selected payer`, async ({
    memberManagementPage: list,
    memberEnrolled,
    memberIn,
    page,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const { member: inPayer, enrolments } = await memberEnrolled({ policies: 1 });
    const outside = await memberIn('Active');
    const payer = enrolments[0].policy;

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.critical(`Log in as a user assigned to Payer A ("${payer.payerName}", chosen in the payer select) - the member list loads`, async () => {
      const { header, list: answer } = await list.selectPayerScope(payer.payerName);
      expect({ header, answered: answer.totalRows >= 0 }).toEqual({ header: payer.payerId, answered: true });
    });

    await steps.step('Verify the records displayed - only Payer A members are listed, none of Payer B', async () => {
      const payerMemberShown = await list.isListed(inPayer.displayNameEn);
      const otherMemberShown = await list.isListed(outside.displayNameEn);
      const scoped = await listInPayerScope(page, payer.payerId);
      expect({ payerMemberShown, otherMemberShown, otherInScope: scoped.items.some((i) => i.id === outside.id) })
        .toEqual({ payerMemberShown: true, otherMemberShown: false, otherInScope: false });
    });
  });

  test(`TC-${CASES.formats.azureId}: should show every field of varied member records in its expected format`, async ({
    memberManagementPage: list,
    memberIn,
    steps,
  }) => {
    const members: ProvisionedMember[] = [];
    for (const spec of VARIED_MEMBERS) members.push(await memberIn('Active', { nationality: spec.nationality, identityType: spec.identityType }));
    let headers: string[] = [];

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await list.openTable();
      headers = await list.getHeaderTexts();
      expect(headers.length, 'the table headers').toBeGreaterThan(0);
    });

    await steps.step('Review the sample of members - Member name, Member ID, Document ID, Nationality, Identity Type, Mobile Number, Status, Member Status and Actions are shown in their expected formats', async () => {
      const problems: string[] = [];
      for (const member of members) {
        const row: MemberRowValues = await list.readRow(member.displayNameEn);
        const actions = await list.readOfferedActions(member.displayNameEn);
        const check = (ok: boolean, what: string): void => { if (!ok) problems.push(`${member.code} ${what}: ${JSON.stringify(row)}`); };
        check(row.name === member.displayNameEn, 'name');
        check(/^MBR-\d{8}$/.test(row.memberCode) && row.memberCode === member.code, 'member ID');
        check(row.documentId === member.documentId, 'document ID');
        check(row.nationality !== '', 'nationality');
        check(row.mobileNumber.replace(/\D/g, '').endsWith(member.mobileNumber), 'mobile number');
        check(row.status === 'Active', 'status');
        check(['View', 'Edit', 'Inactivate', 'Delete'].every((a) => actions.includes(a)), `actions ${actions.join(', ')}`);
      }
      expect({ problems, missingColumns: missingColumns(headers) }, `headers: ${headers.join(' | ')}`).toEqual({ problems: [], missingColumns: [] });
    });
  });
});
