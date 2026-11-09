import type { Page } from '@playwright/test';
import { test, expect } from '../../../utils/user/writerDHelpers';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { InvitationListPage } from '../../../pages/user/InvitationListPage';
import type { InvitationFormDrawer } from '../../../pages/user/InvitationFormDrawer';
import { CASES, DRAWER_LABELS, MESSAGE, PAYER, VALIDITY_HOURS, VALIDITY_TOLERANCE_HOURS } from '../../../data/user/createInvitation.data';
import {
  allSaved,
  drawerChecklist,
  drawerFieldError,
  drawerRequiredLabels,
  emailFile,
  emailOfLength,
  importAndRead,
  invitationsMatching,
  payerIsEmpty,
  payerSearch,
  stampTerm,
  stampedInvitationEmail,
  validityHours,
  wasShown,
} from '../../../utils/user/writerDHelpers';
import { findInvitationByEmail, suiteInvitationEmail, userStamp } from '../../../utils/UserProvisioning';

/** Step 1 of every case: the Invitations list. */
async function navigate(steps: TestSteps, list: InvitationListPage): Promise<void> {
  await steps.critical('Navigate to the User Management module - the Invitations list loads', async () => {
    await list.openTable();
    expect(await list.countRows()).toBeGreaterThan(0);
  });
}

/** Add Invitation (and a role) - the drawer. */
async function openDrawer(steps: TestSteps, list: InvitationListPage, roleName: string | null, name: string): Promise<InvitationFormDrawer> {
  let drawer: InvitationFormDrawer | null = null;
  await steps.critical(name, async () => {
    drawer = await list.openAddForm();
    await drawer.waitForOpen();
    if (roleName) await drawer.chooseRole(roleName);
    expect({ title: await drawer.getTitle(), chips: await drawer.readChips() }).toEqual({ title: 'Add New Invitation', chips: [] });
  });
  return drawer as unknown as InvitationFormDrawer;
}

/** Whether `email` was invited (admin API) and how often. */
const invitationsTo = async (page: Page, email: string): Promise<number> => (await invitationsMatching(page, email)).filter((i) => i.email.toLowerCase() === email.toLowerCase()).length;

/**
 * User story 20418: Create Invitation (System Administrator).
 * Payer-scoped and plain roles, several addresses, length limits, file import,
 * required fields, format, duplicates, one invitation per address, the payer
 * requirement, a mixed exploratory request and the drawer checklist. The
 * restricted-account cases (20650, 20651) are in create-invitation-scope.spec.ts,
 * the registration-dependent ones (20653, 20654) in create-invitation-lifecycle.spec.ts.
 * See the data file for how the cases map onto the live drawer.
 */
test.describe('US 20418 - Create Invitation', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.payerScoped.azureId}: should create one Pending five-day invitation when a colleague is invited to a payer-scoped role with the administrator's payer`, async ({
    invitationListPage: list,
    page,
    suiteRole,
    discardInvitationsOf,
    steps,
  }) => {
    const role = await suiteRole({ hasAssignedPayers: true });
    const email = suiteInvitationEmail();
    discardInvitationsOf(email);

    await navigate(steps, list);
    const d = await openDrawer(steps, list, null, 'Select Add Invitation - the Add New Invitation drawer opens');

    await steps.step(`Select a payer-scoped Role Name ("${role.name}") - the Payer Name field becomes enabled and mandatory`, async () => {
      await d.chooseRole(role.name);
      expect({ payerDisabled: await d.isPayerDisabled(), payerMandatory: (await drawerRequiredLabels(page)).some((l) => /^payer/i.test(l)) }).toEqual({ payerDisabled: false, payerMandatory: true });
    });

    await steps.critical(`Select the payer "${PAYER}" from the inviter's payers, enter a valid e-mail and select (+) - the e-mail is added as a chip`, async () => {
      await d.choosePayer(PAYER);
      await d.addEmail(email, true);
      expect({ payer: await d.readPayer(), chips: await d.readChips() }).toEqual({ payer: PAYER, chips: [email] });
    });

    await steps.step(`Select Save - the confirmation "${MESSAGE.created}" is displayed`, async () => {
      const saved = await d.attemptSave();
      expect({ sent: saved.requests.length, saved: allSaved(saved.answers), messages: saved.messages }, saved.answers.map((a) => `${a.status} ${a.text.slice(0, 160)}`).join(' | '))
        .toEqual({ sent: 1, saved: true, messages: expect.arrayContaining([MESSAGE.created]) });
    });

    await steps.step('Review the invitations list - one invitation, Pending, valid for 5 days, shown as Pending', async () => {
      const item = await findInvitationByEmail(page, email);
      await list.revealRow(email);
      const row = item ? await list.readRowById(item.id) : null;
      expect({
        count: await invitationsTo(page, email),
        status: item?.statusName,
        payerSet: !!item?.payerId,
        validFiveDays: item ? Math.abs(validityHours(item) - VALIDITY_HOURS) <= VALIDITY_TOLERANCE_HOURS : false,
        shown: row?.status,
      }, item ? `created ${item.createdOn}, expires ${item.expiresOn}` : 'not created').toEqual({ count: 1, status: 'Pending', payerSet: true, validFiveDays: true, shown: 'Pending' });
    });
  });

  test(`TC-${CASES.notPayerScoped.azureId}: should disable and leave Payer empty and create the invitation without a payer when the role is not payer-scoped`, async ({
    invitationListPage: list,
    page,
    suiteRole,
    discardInvitationsOf,
    steps,
  }) => {
    const role = await suiteRole();
    const email = suiteInvitationEmail();
    discardInvitationsOf(email);

    await navigate(steps, list);
    const drawer = await openDrawer(steps, list, null, 'Select Add Invitation - the Add New Invitation drawer opens');

    await steps.step(`Select a non-payer-scoped Role Name ("${role.name}") - the Payer Name field becomes disabled and remains empty`, async () => {
      await drawer.chooseRole(role.name);
      const payer = await drawer.readPayer();
      expect({ disabled: await drawer.isPayerDisabled(), empty: payerIsEmpty(payer) }, `payer shows "${payer}"`).toEqual({ disabled: true, empty: true });
    });

    await steps.step('Enter a valid e-mail and select Save - the invitation is created without a payer value, with a confirmation', async () => {
      await drawer.addEmail(email);
      const saved = await drawer.attemptSave();
      const item = await findInvitationByEmail(page, email);
      expect({ sentPayer: saved.requests[0]?.payerId ?? null, saved: allSaved(saved.answers), created: !!item, payer: item?.payerId ?? null, role: item?.roleName, confirmed: saved.messages.length > 0 })
        .toEqual({ sentPayer: null, saved: true, created: true, payer: null, role: role.name, confirmed: true });
    });
  });

  test(`TC-${CASES.severalEmails.azureId}: should show each address as a chip and send one invitation per address when several colleagues are added`, async ({
    invitationListPage: list,
    page,
    suiteRole,
    discardInvitationsOf,
    steps,
  }) => {
    const role = await suiteRole();
    const stamp = userStamp();
    const first = stampedInvitationEmail(stamp, 'a');
    const second = stampedInvitationEmail(stamp, 'b');
    discardInvitationsOf(first);
    discardInvitationsOf(second);

    await navigate(steps, list);
    const drawer = await openDrawer(steps, list, role.name, `Select Add Invitation and a valid Role Name ("${role.name}") - the drawer is ready for e-mail entry`);

    await steps.step('Type a valid e-mail and select the (+) icon - the e-mail appears as a chip', async () => {
      await drawer.addEmail(first, true);
      expect(await drawer.readChips()).toEqual([first]);
    });

    await steps.step('Type a second valid e-mail and press Enter - it appears as a separate chip', async () => {
      await drawer.addEmail(second);
      expect(await drawer.readChips()).toEqual([first, second]);
    });

    await steps.step('Select Save - the system processes the request: one separate invitation per address', async () => {
      const saved = await drawer.attemptSave();
      expect({
        sent: saved.requests.map((r) => String(r.email)).sort(),
        saved: allSaved(saved.answers),
        created: [await invitationsTo(page, first), await invitationsTo(page, second)],
      }).toEqual({ sent: [first, second].sort(), saved: true, created: [1, 1] });
    });
  });

  test(`TC-${CASES.emailTooLong.azureId}: should refuse an e-mail address longer than 256 characters when it is entered`, async ({
    invitationListPage: list,
    page,
    suiteRole,
    steps,
  }) => {
    const role = await suiteRole();
    const email = emailOfLength(CASES.emailTooLong.length);

    await navigate(steps, list);
    const drawer = await openDrawer(steps, list, role.name, `Select Add Invitation and a valid Role Name ("${role.name}") - the drawer is ready for e-mail entry`);

    await steps.step(`Attempt to enter an e-mail address of ${email.length} characters - it is not added as a chip, or a length message is shown`, async () => {
      await drawer.addEmail(email, true);
      const chips = await drawer.readChips();
      const error = await drawerFieldError(page, 'emails');
      expect({ refused: !chips.includes(email) || error !== '' }, `chips ${chips.length}, maxlength ${await drawer.getEmailMaxLength()}, error "${error}"`)
        .toEqual({ refused: true });
    });
  });

  test(`TC-${CASES.emailAtMax.azureId}: should accept a 256-character e-mail address as a chip when it is entered`, async ({
    invitationListPage: list,
    page,
    suiteRole,
    steps,
  }) => {
    const role = await suiteRole();
    const email = emailOfLength(CASES.emailAtMax.length);

    await navigate(steps, list);
    const drawer = await openDrawer(steps, list, role.name, `Select Add Invitation and a valid Role Name ("${role.name}") - the drawer is ready for e-mail entry`);

    await steps.step(`Enter a valid-format e-mail of exactly ${email.length} characters and select (+) - it is accepted and shown as a chip`, async () => {
      await drawer.addEmail(email, true);
      expect({ chips: await drawer.readChips(), error: await drawerFieldError(page, 'emails') }).toEqual({ chips: [email], error: '' });
    });
  });

  test(`TC-${CASES.importFile.azureId}: should add every address of the file's Email column as a chip with a count message when a spreadsheet is imported`, async ({
    invitationListPage: list,
    suiteRole,
    steps,
  }) => {
    const role = await suiteRole();
    const stamp = userStamp();
    const emails = Array.from({ length: CASES.importFile.count }, (_, i) => stampedInvitationEmail(stamp, `f${i}`));
    let seen = { messages: [] as string[], text: '', chips: [] as string[] };

    await navigate(steps, list);
    const drawer = await openDrawer(steps, list, role.name, `Select Add Invitation and a valid Role Name ("${role.name}") - the drawer is ready`);

    await steps.critical(`Select Browse Files under Import Email from Excel and choose a .xlsx holding ${emails.length} addresses - the file uploads and is processed`, async () => {
      seen = await importAndRead(drawer, emailFile('xlsx', emails));
      expect(seen.chips.length + seen.messages.length, 'something happened after the upload').toBeGreaterThan(0);
    });

    await steps.step(`Review the message and chips - "${MESSAGE.imported(emails.length)}" and the ${emails.length} addresses as chips`, async () => {
      expect({ message: wasShown(seen, MESSAGE.imported(emails.length)), chips: [...seen.chips].sort() }, seen.messages.join(' | ')).toEqual({ message: true, chips: [...emails].sort() });
    });
  });

  test(`TC-${CASES.importNoEmailColumn.azureId}: should say no addresses were found and add no chip when the imported file has no Email column`, async ({
    invitationListPage: list,
    suiteRole,
    steps,
  }) => {
    const role = await suiteRole();

    await navigate(steps, list);
    const drawer = await openDrawer(steps, list, role.name, `Select Add Invitation and a valid Role Name ("${role.name}") - the drawer is ready`);

    await steps.step(`Select Browse Files and upload a file without an Email column - "${MESSAGE.noEmailColumn}" and no chips`, async () => {
      const seen = await importAndRead(drawer, emailFile('noEmailColumn'));
      expect({ message: wasShown(seen, MESSAGE.noEmailColumn), chips: seen.chips }, seen.messages.join(' | ')).toEqual({ message: true, chips: [] });
    });
  });

  test(`TC-${CASES.importUnreadable.azureId}: should report the unreadable file and add no chip when a corrupted file is uploaded`, async ({
    invitationListPage: list,
    suiteRole,
    steps,
  }) => {
    const role = await suiteRole();

    await navigate(steps, list);
    const drawer = await openDrawer(steps, list, role.name, `Select Add Invitation and a valid Role Name ("${role.name}") - the drawer is ready`);

    await steps.step(`Select Browse Files and upload a corrupted .xlsx - "${MESSAGE.unreadable}" and no chips`, async () => {
      const seen = await importAndRead(drawer, emailFile('corrupt'));
      expect({ message: wasShown(seen, MESSAGE.unreadable), chips: seen.chips }, seen.messages.join(' | ')).toEqual({ message: true, chips: [] });
    });
  });

  test(`TC-${CASES.roleRequired.azureId}: should block Save with a required message on Role Name when no role is selected`, async ({
    invitationListPage: list,
    page,
    discardInvitationsOf,
    steps,
  }) => {
    const email = suiteInvitationEmail();
    discardInvitationsOf(email);

    await navigate(steps, list);
    const drawer = await openDrawer(steps, list, null, 'Select Add Invitation - the drawer opens with Role Name empty');

    await steps.step(`Leave Role Name empty, enter a valid e-mail and select Save - "${MESSAGE.required}" next to Role Name and no invitation`, async () => {
      await drawer.addEmail(email);
      const saved = await drawer.attemptSave(2_000);
      expect({ roleError: await drawerFieldError(page, 'role'), sent: saved.requests.length, created: await invitationsTo(page, email) }).toEqual({ roleError: MESSAGE.required, sent: 0, created: 0 });
    });
  });

  test(`TC-${CASES.emailRequired.azureId}: should block Save with a required message on Email Address when no address is entered`, async ({
    invitationListPage: list,
    page,
    suiteRole,
    steps,
  }) => {
    const role = await suiteRole();

    await navigate(steps, list);
    const drawer = await openDrawer(steps, list, role.name, `Select Add Invitation and a valid Role Name ("${role.name}") - the drawer is ready`);

    await steps.step(`Leave Email Address empty and select Save - "${MESSAGE.required}" next to Email Address and no invitation`, async () => {
      const saved = await drawer.attemptSave(2_000);
      expect({ emailError: await drawerFieldError(page, 'emails'), sent: saved.requests.length }).toEqual({ emailError: MESSAGE.required, sent: 0 });
    });
  });

  test(`TC-${CASES.invalidEmail.azureId}: should show the invalid-format message and add no chip when an invalid e-mail is entered`, async ({
    invitationListPage: list,
    page,
    suiteRole,
    steps,
  }) => {
    const role = await suiteRole();
    const data = CASES.invalidEmail;

    await navigate(steps, list);
    const drawer = await openDrawer(steps, list, role.name, `Select Add Invitation and a valid Role Name ("${role.name}") - the drawer is ready`);

    await steps.step(`Enter "${data.email}" and try to add it as a chip - "${MESSAGE.invalidEmail}" and no chip`, async () => {
      await drawer.addEmail(data.email, true);
      expect({ error: await drawerFieldError(page, 'emails'), chips: await drawer.readChips() }).toEqual({ error: MESSAGE.invalidEmail, chips: [] });
    });
  });

  test(`TC-${CASES.duplicatePending.azureId}: should block a second invitation with the duplicate message when the same address is invited to the same role while one is Pending`, async ({
    invitationListPage: list,
    page,
    suiteRole,
    suiteInvitation,
    discardInvitationsOf,
    steps,
  }) => {
    const role = await suiteRole();
    const existing = await suiteInvitation({ roleId: role.id });
    discardInvitationsOf(existing.email);

    await steps.critical('Navigate to the User Management module - the Invitations list shows the existing Pending invitation', async () => {
      await list.openTable();
      await list.revealRow(existing.email);
      expect((await list.readRowById(existing.id)).status).toBe('Pending');
    });

    const drawer = await openDrawer(steps, list, role.name, `Select Add Invitation and the same Role Name ("${role.name}") - the drawer is ready`);

    await steps.step(`Enter the same address and select Save - "${MESSAGE.duplicate}" and no duplicate invitation`, async () => {
      await drawer.addEmail(existing.email);
      const saved = await drawer.attemptSave();
      expect({ shown: [...saved.messages, ...saved.errors].some((m) => m.includes(MESSAGE.duplicate)), invitations: await invitationsTo(page, existing.email) }, [...saved.messages, ...saved.errors].join(' | '))
        .toEqual({ shown: true, invitations: 1 });
    });
  });

  test(`TC-${CASES.registeredUser.azureId}: should block inviting the address of an already registered user with the duplicate message`, async ({
    invitationListPage: list,
    page,
    suiteRole,
    userIn,
    discardInvitationsOf,
    steps,
  }) => {
    const user = await userIn('Active');
    const role = await suiteRole();
    discardInvitationsOf(user.email);

    await navigate(steps, list);
    const drawer = await openDrawer(steps, list, role.name, `Select Add Invitation and a Role Name ("${role.name}") - the drawer is ready`);

    await steps.step(`Enter the address of the registered suite user and select Save - "${MESSAGE.duplicate}" and no invitation`, async () => {
      await drawer.addEmail(user.email);
      const saved = await drawer.attemptSave();
      expect({ shown: [...saved.messages, ...saved.errors].some((m) => m.includes(MESSAGE.duplicate)), invitations: await invitationsTo(page, user.email) }, [...saved.messages, ...saved.errors].join(' | '))
        .toEqual({ shown: true, invitations: 0 });
    });
  });

  test(`TC-${CASES.oneInvitationPerEmail.azureId}: should create one separate Pending five-day invitation per address when a request with several addresses is saved`, async ({
    invitationListPage: list,
    page,
    suiteRole,
    discardInvitationsOf,
    steps,
  }) => {
    const role = await suiteRole();
    const stamp = userStamp();
    const emails = Array.from({ length: CASES.oneInvitationPerEmail.count }, (_, i) => stampedInvitationEmail(stamp, `m${i}`));
    emails.forEach((e) => discardInvitationsOf(e));

    await navigate(steps, list);
    const drawer = await openDrawer(steps, list, role.name, `Select Add Invitation and a valid Role Name ("${role.name}") - the drawer is ready`);

    await steps.critical(`Add ${emails.length} distinct valid addresses as chips - ${emails.length} chips are displayed`, async () => {
      for (const e of emails) await drawer.addEmail(e);
      expect(await drawer.readChips()).toEqual(emails);
    });

    await steps.step(`Select Save - the confirmation "${MESSAGE.created}" is displayed`, async () => {
      const saved = await drawer.attemptSave();
      expect({ sent: saved.requests.length, saved: allSaved(saved.answers), messages: saved.messages }).toEqual({ sent: emails.length, saved: true, messages: expect.arrayContaining([MESSAGE.created]) });
    });

    await steps.step(`Review the Invitations list - ${emails.length} separate invitations, each Pending and valid for 5 days`, async () => {
      const answer = await list.searchFor(stampTerm(stamp));
      const rows = await list.readRows();
      const items = await invitationsMatching(page, stampTerm(stamp));
      expect({
        listed: rows.map((r) => r.email).sort(),
        statuses: rows.map((r) => r.status),
        fiveDays: items.map((i) => Math.abs(validityHours(i) - VALIDITY_HOURS) <= VALIDITY_TOLERANCE_HOURS),
        total: answer.totalRows,
      }).toEqual({ listed: [...emails].sort(), statuses: emails.map(() => 'Pending'), fiveDays: emails.map(() => true), total: emails.length });
    });
  });

  test(`TC-${CASES.payerRequired.azureId}: should block Save with a required message on Payer when a payer-required role has no payer selected`, async ({
    invitationListPage: list,
    page,
    suiteRole,
    discardInvitationsOf,
    steps,
  }) => {
    const role = await suiteRole({ hasAssignedPayers: true });
    const email = suiteInvitationEmail();
    discardInvitationsOf(email);

    await navigate(steps, list);
    const drawer = await openDrawer(steps, list, null, 'Select Add Invitation - the drawer opens');

    await steps.step(`Select a payer-scoped Role Name ("${role.name}") - the Payer Name field becomes mandatory`, async () => {
      await drawer.chooseRole(role.name);
      expect({ enabled: !(await drawer.isPayerDisabled()), mandatory: (await drawerRequiredLabels(page)).some((l) => /^payer/i.test(l)) }).toEqual({ enabled: true, mandatory: true });
    });

    await steps.step(`Leave Payer Name unselected, enter a valid e-mail and select Save - saving is blocked and "${MESSAGE.required}" shows for Payer Name`, async () => {
      await drawer.addEmail(email);
      const saved = await drawer.attemptSave(2_000);
      expect({ payerError: await drawerFieldError(page, 'payer'), sent: saved.requests.length, created: await invitationsTo(page, email) }).toEqual({ payerError: MESSAGE.required, sent: 0, created: 0 });
    });
  });

  test(`TC-${CASES.importTypedAndRoleSwitch.azureId}: should keep unique chips and save every address under the final role when import, typed addresses and a role switch are combined`, async ({
    invitationListPage: list,
    page,
    suiteRole,
    discardInvitationsOf,
    steps,
  }) => {
    const scoped = await suiteRole({ hasAssignedPayers: true });
    const plain = await suiteRole();
    const stamp = userStamp();
    const imported = Array.from({ length: CASES.importTypedAndRoleSwitch.imported }, (_, i) => stampedInvitationEmail(stamp, `i${i}`));
    const typed = stampedInvitationEmail(stamp, 't');
    const unique = [...imported, typed];
    unique.forEach((e) => discardInvitationsOf(e));

    await navigate(steps, list);

    const drawer = await openDrawer(steps, list, null, 'Select Add Invitation - the drawer opens');

    await steps.step(`Select a payer-scoped role and "${PAYER}", import ${imported.length} addresses, then type 2 more (one a duplicate of an imported one) - the chips hold every unique address once`, async () => {
      await drawer.chooseRole(scoped.name);
      await drawer.choosePayer(PAYER);
      await importAndRead(drawer, emailFile('csv', imported));
      await drawer.addEmail(typed, true);
      await drawer.addEmail(imported[0]);
      expect([...(await drawer.readChips())].sort()).toEqual([...unique].sort());
    });

    await steps.step(`Switch Role Name to a non-payer-scoped role ("${plain.name}") - Payer becomes disabled and clears, the chips stay`, async () => {
      await drawer.chooseRole(plain.name);
      const payer = await drawer.readPayer();
      expect({ disabled: await drawer.isPayerDisabled(), cleared: payerIsEmpty(payer), chips: [...(await drawer.readChips())].sort() }, `payer shows "${payer}"`)
        .toEqual({ disabled: true, cleared: true, chips: [...unique].sort() });
    });

    await steps.step('Select Save - every unique address is invited under the final role, with no payer', async () => {
      const saved = await drawer.attemptSave(6_000);
      const items = (await invitationsMatching(page, stampTerm(stamp)));
      expect({
        sent: saved.requests.map((r) => String(r.email)).sort(),
        roles: [...new Set(saved.requests.map((r) => r.roleId))],
        payers: [...new Set(saved.requests.map((r) => r.payerId ?? null))],
        saved: allSaved(saved.answers),
        created: items.map((i) => i.email).sort(),
        createdRoles: [...new Set(items.map((i) => i.roleName))],
      }).toEqual({ sent: [...unique].sort(), roles: [plain.id], payers: [null], saved: true, created: [...unique].sort(), createdRoles: [plain.name] });
    });
  });

  test(`TC-${CASES.drawerChecklist.azureId}: should present every required field and control when the Add New Invitation drawer opens`, async ({
    invitationListPage: list,
    page,
    suiteRole,
    steps,
  }) => {
    const scoped = await suiteRole({ hasAssignedPayers: true });

    await navigate(steps, list);
    const drawer = await openDrawer(steps, list, null, 'Select Add Invitation - the Add New Invitation drawer opens');

    await steps.step('Check the drawer against the checklist: Role Name, Payer Name with search, Email Address with (+), Import Email from Excel / Browse Files, Save - all present and labelled', async () => {
      const text = await drawer.getText();
      const controls = await drawerChecklist(page);
      await drawer.chooseRole(scoped.name);
      const payer = await payerSearch(page, PAYER);
      expect({
        missingLabels: DRAWER_LABELS.filter((l) => !text.includes(l)),
        controls,
        payerSearch: payer.searchOffered,
        payerFound: payer.options.includes(PAYER),
      }, text).toEqual({
        missingLabels: [],
        controls: { roleSelect: true, payerSelect: true, emailInput: true, addEmailButton: true, fileInput: true, saveButton: true },
        payerSearch: true,
        payerFound: true,
      });
    });
  });
});
