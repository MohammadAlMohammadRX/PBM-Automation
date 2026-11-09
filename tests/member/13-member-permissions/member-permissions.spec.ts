import { test, expect, type MemberSession } from '../../../utils/member/memberRole';
import { blockedByPrecondition } from '../../../fixtures/testStatus.fixture';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { WRITER_D_ENDPOINT } from '../../../constants/member/writerDIds';
import type { MemberManagementPage } from '../../../pages/member/MemberManagementPage';
import type { MemberDetailPage } from '../../../pages/member/MemberDetailPage';
import { ACCESS_RESTRICTED, CASES } from '../../../data/member/memberPermissionCases.data';
import { memberRightCode } from '../../../data/member/memberPermissions.data';
import { readEffectivePermissions } from '../../../utils/EffectivePermissions';
import {
  memberBody,
  readMember,
  readMemberForEdit,
  suiteMemberDisplayName,
  updateMemberFields,
  type ProvisionedMember,
} from '../../../utils/MemberProvisioning';
import { asSession, memberTrail, refused } from '../../../utils/member/writerDHelpers';

/** A member row the session lists: the case's own member when the session sees it, else the first row on screen (read only). */
async function visibleMember(members: MemberManagementPage, preferred: ProvisionedMember): Promise<{ name: string; id: string } | null> {
  if (await members.isListed(preferred.displayNameEn)) return { name: preferred.displayNameEn, id: preferred.id };
  await members.openTable();
  const name = (await members.readNames().catch(() => [] as string[]))[0];
  return name ? { name, id: await members.memberIdOf(name) } : null;
}

/** Whether an action is usable (rendered AND enabled). */
const usable = (state: { availability: string } | undefined): boolean => state?.availability === 'available';

/** What a session is offered on the list (Add, the row's Edit / Delete) and on the record (Edit, Delete, the status switch). */
async function offeredActions(members: MemberManagementPage, detail: MemberDetailPage, member: { name: string; id: string } | null): Promise<Record<string, boolean>> {
  await members.openTable();
  const add = await members.isAddOffered();
  const row = member ? await members.readActionStates(member.name).catch(() => null) : null;
  if (member) await detail.open(member.id);
  const header = member ? await detail.readActionStates().catch(() => null) : null;
  return {
    create: add,
    rowEdit: usable(row?.edit),
    rowDelete: usable(row?.delete),
    edit: usable(header?.edit),
    delete: usable(header?.delete),
    status: usable(header?.toggleActive),
  };
}

/** Whether a catalogue row with exactly this label (a parent with its "(n/m)" counter) is listed. */
const listedOnce = (labels: string[], label: string): boolean =>
  labels.filter((l) => l === label || (l.startsWith(`${label} (`) && /\(\d+\/\d+\)$/.test(l))).length === 1;

/**
 * User story 14389: Member Permissions.
 * The administrator is the System Administrator (it holds every right); the
 * restricted roles are the Payer Admin role shaped per case through the shared
 * `memberRole` fixture and restored afterwards
 * (data/member/memberPermissionCases.data.ts). A "control is absent" case
 * baselines first: the administrator is offered the control.
 */
test.describe('US 14389 - Member Permissions', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.viewOnly.azureId}: should let a view-only user see members but offer no Create, Edit or Delete control`, async ({
    memberIn,
    memberManagementPage,
    memberDetailPage,
    memberRole,
    requireMemberListAccess,
    requireShapeApplied,
    requireBaseline,
    steps,
  }) => {
    const member = await memberIn('Active');
    let session!: MemberSession;

    await steps.critical('Navigate to the Member Management module - the module landing page loads and shows the member list option', async () => {
      const admin = await offeredActions(memberManagementPage, memberDetailPage, { name: member.displayNameEn, id: member.id });
      requireBaseline(admin.create && admin.rowEdit && admin.rowDelete && admin.edit && admin.delete, 'Add New Member and the row / record Edit and Delete offered to a user holding the rights (the administrator)');
      expect(admin.create).toBe(true);
    });

    await steps.critical('Log in as a user whose role has only the View permission assigned - the user is authenticated and the Member Management module is accessible', async () => {
      session = await memberRole.signIn(CASES.viewOnly.shape);
      requireShapeApplied(session);
      await requireMemberListAccess(session);
      expect(await session.members.canListMembers()).toBe(true);
    });

    await steps.step('Open the member list - the list of members loads and displays member records', async () => {
      await session.members.openTable();
      expect(await session.members.countRows().catch(() => 0), 'member rows shown').toBeGreaterThan(0);
    });

    await steps.step('Attempt to locate Create, Edit, or Delete controls on the list and member detail screens - no Create, Edit, or Delete controls are visible or enabled', async () => {
      const target = await visibleMember(session.members, member);
      const offered = await offeredActions(session.members, session.detail, target);
      expect({ memberShown: target !== null, create: offered.create, rowEdit: offered.rowEdit, rowDelete: offered.rowDelete, edit: offered.edit, delete: offered.delete },
        `offered without ${session.removed.join(', ')}`)
        .toEqual({ memberShown: true, create: false, rowEdit: false, rowDelete: false, edit: false, delete: false });
    });
  });

  test(`TC-${CASES.noView.azureId}: should deny the member list and show no member data to a user without the view permission`, async ({
    memberManagementPage,
    memberRole,
    requireShapeApplied,
    steps,
  }) => {
    let session!: MemberSession;

    await steps.critical('Navigate to the Member Management module - the module entry point is presented', async () => {
      await memberManagementPage.openTable();
      expect(await memberManagementPage.countRows(), 'members listed to a user holding the view right (the administrator)').toBeGreaterThan(0);
    });

    await steps.critical("Log in as a user whose role has no View Member permission assigned - authentication succeeds and the system evaluates the user's permission set", async () => {
      session = await memberRole.signIn(CASES.noView.shape);
      requireShapeApplied(session);
      expect(session.page.url()).toMatch(/^https?:/);
    });

    await steps.step('Attempt to open the member list - access is denied, a permission-restricted message is displayed, and no member data is shown', async () => {
      await session.members.open();
      const text = await session.members.getPageText();
      const rows = await session.members.countRows().catch(() => 0);
      expect({ listAnswered: await session.members.canListMembers(), rows }, `the screen read: ${text.slice(0, 200)}`).toEqual({ listAnswered: false, rows: 0 });
      expect(text, 'a permission-restricted message').toMatch(ACCESS_RESTRICTED);
    });
  });

  test(`TC-${CASES.singleAction.azureId}: should offer each single-permission role exactly its one member action`, async ({
    memberIn,
    memberManagementPage,
    memberDetailPage,
    memberRole,
    requireMemberListAccess,
    requireShapeApplied,
    requireBaseline,
    steps,
  }) => {
    const data = CASES.singleAction;
    const member = await memberIn('Active');
    let session!: MemberSession;

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      const admin = await offeredActions(memberManagementPage, memberDetailPage, { name: member.displayNameEn, id: member.id });
      requireBaseline(admin.create && admin.edit && admin.delete, 'Create, Edit and Delete offered to a user holding the rights (the administrator)');
      expect(admin).toMatchObject({ create: true, edit: true, delete: true });
    });

    await steps.critical('Log in as the user whose role holds only the Create permission - the system authenticates the user', async () => {
      session = await memberRole.signIn(data.createOnly);
      requireShapeApplied(session);
      await requireMemberListAccess(session);
      expect(await session.members.canListMembers()).toBe(true);
    });

    await steps.step('Open the member list and check for a Create option - a Create Member option is available, and Edit and Delete options are not available', async () => {
      const offered = await offeredActions(session.members, session.detail, await visibleMember(session.members, member));
      expect({ create: offered.create, edit: offered.rowEdit || offered.edit, delete: offered.rowDelete || offered.delete }).toEqual({ create: true, edit: false, delete: false });
    });

    await steps.critical('Log out and log in as the user whose role holds only the Edit permission - the system authenticates the user', async () => {
      session = await memberRole.signIn(data.editOnly);
      requireShapeApplied(session);
      await requireMemberListAccess(session);
      expect(await session.members.canListMembers()).toBe(true);
    });

    await steps.step('Open an existing member record and check for an Edit option - an Edit option is available, and Create and Delete options are not available', async () => {
      const offered = await offeredActions(session.members, session.detail, await visibleMember(session.members, member));
      expect({ create: offered.create, edit: offered.edit, delete: offered.delete }).toEqual({ create: false, edit: true, delete: false });
    });

    await steps.critical('Log out and log in as the user whose role holds only the Delete permission - the system authenticates the user', async () => {
      session = await memberRole.signIn(data.deleteOnly);
      requireShapeApplied(session);
      await requireMemberListAccess(session);
      expect(await session.members.canListMembers()).toBe(true);
    });

    await steps.step('Open an existing member record and check for a Delete option - a Delete option is available, and Create and Edit options are not available', async () => {
      const offered = await offeredActions(session.members, session.detail, await visibleMember(session.members, member));
      expect({ create: offered.create, edit: offered.edit, delete: offered.delete }).toEqual({ create: false, edit: false, delete: true });
    });
  });

  test(`TC-${CASES.statusOnly.azureId}: should let a status-only user deactivate a member but not edit its details`, async ({
    page,
    memberIn,
    memberManagementPage,
    memberDetailPage,
    memberRole,
    requireMemberListAccess,
    requireShapeApplied,
    requireBaseline,
    steps,
  }) => {
    const data = CASES.statusOnly;
    const member = await memberIn('Active');
    let session!: MemberSession;

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(member.displayNameEn)).toBe(true);
      await memberDetailPage.open(member.id);
      requireBaseline(usable(await memberDetailPage.getActionState('toggleActive')), 'the Active switch offered to a user holding SetMemberActive (the administrator)');
    });

    await steps.critical('Log in as the user whose role holds only the Activate/Deactivate permission - authentication succeeds', async () => {
      session = await memberRole.signIn(data.shape);
      requireShapeApplied(session);
      await requireMemberListAccess(session);
      expect(await session.members.canListMembers()).toBe(true);
    });

    await steps.critical("Open an active member's record - the member detail screen loads, showing status as Active", async () => {
      await session.detail.open(member.id);
      expect(await session.detail.getStatus()).toBe('Active');
    });

    await steps.step('Select the Deactivate action - the member status changes to Inactive and the change is recorded', async () => {
      const drawer = await session.detail.openDeactivate();
      const answer = await drawer.deactivate(data.details);
      expect(answer.status, `SetMemberActive answered ${answer.text.slice(0, 200)}`).toBe(200);
      await session.detail.expectStatus('Inactive');
      const record = await readMember(page, member.id);
      const recorded = (await memberTrail(page, member.id)).some((l) => l.kind === 'deactivate');
      expect({ inactive: record.isActive === false, recorded }).toEqual({ inactive: true, recorded: true });
    });

    await steps.step("Attempt to edit the member's demographic fields - the edit controls are not available or the action is rejected", async () => {
      await session.detail.open(member.id);
      const control = await session.detail.getActionAvailability('edit');
      const attempt = await updateMemberFields(session.page, member.id, { occupation: data.occupation }).catch((e: unknown) => ({ status: -2, text: String(e) }));
      const occupation = (await readMember(page, member.id)).occupation;
      expect({ editControl: control === 'available', rejected: attempt.status === -2 || refused(attempt), saved: occupation === data.occupation },
        `UpdateMember as the status-only user answered ${attempt.status} ${attempt.text.slice(0, 160)}`)
        .toEqual({ editControl: false, rejected: true, saved: false });
    });
  });

  test(`TC-${CASES.crudNoCob.azureId}: should not open Coordination of Benefits to a role holding every member right but no COB right`, async ({
    memberIn,
    memberManagementPage,
    memberDetailPage,
    memberCobTab,
    memberRole,
    requireMemberListAccess,
    requireShapeApplied,
    requireBaseline,
    steps,
  }) => {
    const member = await memberIn('Active');
    let session!: MemberSession;

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(member.displayNameEn)).toBe(true);
      await memberDetailPage.open(member.id);
      requireBaseline(await memberCobTab.isOffered(), 'the Coverage Ordering (COB) tab offered to a user holding Cob.GetMemberCobTimeline (the administrator)');
    });

    await steps.critical('Log in as the user whose role holds View, Create, Edit, and Delete but not Coordination of Benefits - authentication succeeds', async () => {
      session = await memberRole.signIn(CASES.crudNoCob.shape);
      requireShapeApplied(session);
      await requireMemberListAccess(session);
      expect(await session.members.canListMembers()).toBe(true);
    });

    await steps.step('Open a member record and attempt to access the Coordination of Benefits function - the function is not available or access is denied', async () => {
      const target = await visibleMember(session.members, member);
      if (target) await session.detail.open(target.id);
      const tab = await session.cob.isOffered();
      const api = await asSession(session.page, 'POST', ApiEndpoints.cobTimeline, { memberId: target?.id ?? member.id });
      expect({ recordOpened: target !== null, cobTab: tab, cobAnswered: !refused(api) }, `GetMemberCobTimeline answered ${api.status} ${api.text.slice(0, 160)}`)
        .toEqual({ recordOpened: true, cobTab: false, cobAnswered: false });
    });
  });

  test(`TC-${CASES.cobOnly.azureId}: should open Coordination of Benefits to a user holding only the COB permission`, async ({
    memberEnrolled,
    memberManagementPage,
    memberDetailPage,
    memberCobTab,
    memberRole,
    requireShapeApplied,
    requireBaseline,
    steps,
  }) => {
    let session!: MemberSession;
    let enrolled!: Awaited<ReturnType<typeof memberEnrolled>>;

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await memberManagementPage.openTable();
      expect(await memberManagementPage.countRows()).toBeGreaterThan(0);
    });

    await steps.critical('Log in as the user whose role holds only the Coordination of Benefits permission - authentication succeeds', async () => {
      session = await memberRole.signIn(CASES.cobOnly.shape);
      requireShapeApplied(session);
      // The member - enrolled in a suite policy so the COB function has data - is built once the role is known to be usable.
      enrolled = await memberEnrolled({ policies: 1 });
      await memberDetailPage.open(enrolled.member.id);
      const entries = await memberCobTab.open();
      requireBaseline(entries.length > 0, "the member's coverage ordering shown to a user holding the COB right (the administrator)");
      expect(session.page.url()).toMatch(/^https?:/);
    });

    await steps.step('Open a member record and access the Coordination of Benefits function - the screen opens and displays Coordination of Benefits data', async () => {
      await session.detail.openExpectingFailure(enrolled.member.id);
      const opened = await session.detail.isLoaded();
      const tab = opened && (await session.cob.isOffered());
      const entries = tab ? await session.cob.open() : [];
      const shown = tab ? await session.cob.readPolicyNumbers() : [];
      expect({ recordOpened: opened, cobTab: tab, cobData: entries.length > 0 && shown.includes(enrolled.enrolments[0].policy.policyNumber) },
        `the screen read: ${(await session.detail.getScreenText()).slice(0, 200)}`)
        .toEqual({ recordOpened: true, cobTab: true, cobData: true });
    });
  });

  test(`TC-${CASES.zero.azureId}: should block or hide every member management function from a user with no member permission`, async ({
    page,
    memberIn,
    memberManagementPage,
    memberDetailPage,
    memberCobTab,
    memberRole,
    discardMemberNamed,
    requireShapeApplied,
    requireBaseline,
    steps,
  }) => {
    const member = await memberIn('Active');
    let session!: MemberSession;
    let lookupReached = false;

    await steps.critical('Navigate to the Member Management module - the module entry point is presented', async () => {
      const admin = await offeredActions(memberManagementPage, memberDetailPage, { name: member.displayNameEn, id: member.id });
      const cob = await memberCobTab.isOffered();
      requireBaseline(admin.create && admin.edit && admin.delete && admin.status && cob, 'every member function offered to a user holding the rights (the administrator)');
      lookupReached = (await asSession(page, 'POST', WRITER_D_ENDPOINT.benefitLookup, { patientId: member.id })).status < 400;
      expect(admin.create).toBe(true);
    });

    await steps.critical('Log in as the user whose role has zero permissions assigned - authentication succeeds', async () => {
      session = await memberRole.signIn(CASES.zero.shape);
      requireShapeApplied(session);
      expect(session.page.url()).toMatch(/^https?:/);
    });

    await steps.step('Attempt to access each member management function in turn (view, create, edit, delete, activate/deactivate, benefit lookup, Coordination of Benefits) - every function is blocked or hidden', async () => {
      const s = session.page;
      const results: Record<string, string> = {};
      // view: the list and the record
      await session.members.open();
      results.view = (await session.members.canListMembers()) || (await asSession(s, 'POST', ApiEndpoints.memberGet, { id: member.id })).status < 300 ? 'reached' : 'blocked';
      // create: the body is a suite member's, registered for teardown in case it is accepted
      const body = await memberBody(page);
      discardMemberNamed(suiteMemberDisplayName(body.englishLastName));
      results.create = refused(await asSession(s, 'POST', ApiEndpoints.memberCreate, body)) ? 'blocked' : 'reached';
      // edit
      const current = await readMemberForEdit(page, member.id);
      const { memberCode: _code, policyHolderIds: _holders, ...fields } = current;
      results.edit = refused(await asSession(s, 'PUT', ApiEndpoints.memberUpdate, { ...fields, occupation: CASES.zero.occupation })) ? 'blocked' : 'reached';
      // activate / deactivate
      results.activateDeactivate = refused(await asSession(s, 'POST', ApiEndpoints.memberSetActive, { id: member.id, isActive: true, inactivationReasonId: null, inactivationDetails: null })) ? 'blocked' : 'reached';
      // benefit lookup - counted only when the administrator's own call reached it
      if (lookupReached) results.benefitLookup = refused(await asSession(s, 'POST', WRITER_D_ENDPOINT.benefitLookup, { patientId: member.id })) ? 'blocked' : 'reached';
      // Coordination of Benefits
      results.cob = refused(await asSession(s, 'POST', ApiEndpoints.cobTimeline, { memberId: member.id })) ? 'blocked' : 'reached';
      // delete - last
      results.delete = refused(await asSession(s, 'DELETE', `${ApiEndpoints.memberDelete}/${member.id}`)) ? 'blocked' : 'reached';
      expect(Object.entries(results).filter(([, v]) => v !== 'blocked').map(([k]) => k), `functions reached with no member permission${lookupReached ? '' : ' (benefit lookup left out: its endpoint did not answer the administrator either)'}`)
        .toEqual([]);
    });
  });

  test(`TC-${CASES.configure.azureId}: should list each member permission as its own entry and save any combination of them`, async ({
    memberManagementPage,
    memberRole,
    steps,
  }) => {
    const data = CASES.configure;
    let labels: string[] = [];

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await memberManagementPage.openTable();
      expect(await memberManagementPage.countRows()).toBeGreaterThan(0);
    });

    await steps.critical('Open the role/permission configuration screen - the configuration screen displays a list of available permissions', async () => {
      const catalogue = await memberRole.openCatalogue();
      labels = await catalogue.getAllLabels();
      expect(labels.length).toBeGreaterThan(0);
    });

    await steps.step('Check that View, Create, Edit, Delete, Activate/Deactivate, Benefit Lookup, and Coordination of Benefits each appear as separate entries - each of the seven is its own, independently toggleable entry', async () => {
      const missing = Object.entries(data.seven).filter(([, label]) => !listedOnce(labels, label)).map(([name, label]) => `${name} (${label})`);
      expect(missing, 'permissions not listed as their own single entry').toEqual([]);
    });

    await steps.step('Toggle each permission individually and save - each toggle is set independently and the saved role reflects the exact combination chosen', async () => {
      await memberRole.reshape(data.combination);
      const catalogue = await memberRole.openCatalogue();
      const saved: Record<string, boolean | null> = {};
      for (const [name, label] of Object.entries(data.seven)) saved[name] = await catalogue.isPermissionChecked(label).catch(() => null);
      expect(saved).toEqual(data.expected);
    });
  });

  test(`TC-${CASES.revoke.azureId}: should refuse an edit at once to a signed-in user whose Edit permission is revoked`, async ({
    page,
    memberIn,
    memberManagementPage,
    memberRole,
    requireMemberListAccess,
    requireBaseline,
    steps,
  }) => {
    const data = CASES.revoke;
    const member = await memberIn('Active');
    let session!: MemberSession;

    await steps.critical('Navigate to the Member Management module - the module loads (the user signed in with the Edit permission active)', async () => {
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(member.displayNameEn)).toBe(true);
      session = await memberRole.signIn(data.granted);
      await requireMemberListAccess(session);
      await session.detail.openExpectingFailure(member.id);
      requireBaseline((await session.detail.isLoaded()) && usable(await session.detail.getActionState('edit')), "Edit offered on the member's record to the signed-in user before the revocation");
    });

    await steps.critical("As an administrator in a separate session, remove the Edit permission from the signed-in user's role - the role update is saved", async () => {
      const { removed } = await memberRole.reshape(data.revoke);
      expect(removed).toEqual(expect.arrayContaining(['UpdateMember', 'GetMemberForEdit']));
    });

    await steps.step('As the originally signed-in user, attempt to edit a member record - the edit action is refused and no changes are saved', async () => {
      const effective = await readEffectivePermissions(session.page).catch(() => [] as string[]);
      await session.detail.open(member.id);
      const control = await session.detail.getActionAvailability('edit');
      const attempt = await updateMemberFields(session.page, member.id, { occupation: data.occupation }).catch((e: unknown) => ({ status: -2, text: String(e) }));
      const occupation = (await readMember(page, member.id)).occupation;
      expect({ refused: attempt.status === -2 || refused(attempt), saved: occupation === data.occupation },
        `Edit control ${control}; UpdateMember answered ${attempt.status} ${attempt.text.slice(0, 160)}; the account is ${effective.includes(memberRightCode('edit')) ? 'STILL told it holds' : 'told it no longer holds'} ${memberRightCode('edit')}`)
        .toEqual({ refused: true, saved: false });
    });
  });

  test(`TC-${CASES.deleteOnlyNoView.azureId}: should not open the member list to a user holding Delete but not View`, async ({
    memberManagementPage,
    memberRole,
    requireShapeApplied,
    steps,
  }) => {
    const data = CASES.deleteOnlyNoView;
    let session!: MemberSession;

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await memberManagementPage.openTable();
      expect(await memberManagementPage.countRows()).toBeGreaterThan(0);
    });

    await steps.critical('Log in as the user whose role holds only the Delete permission - authentication succeeds', async () => {
      await memberRole.reshape(data.clear);
      session = await memberRole.signIn(data.grant);
      requireShapeApplied(session);
      const effective = await readEffectivePermissions(session.page).catch(() => [] as string[]);
      if (effective.includes(memberRightCode('list'))) {
        blockedByPrecondition(test.info(), 'a role holding DeleteMember without the View (GetMembers) right', new Error(
          `the catalogue keeps ${memberRightCode('list')} held once its child ${memberRightCode('delete')} is ticked (the parent trap) - a Delete-only role without View cannot be built`));
      }
      expect(session.page.url()).toMatch(/^https?:/);
    });

    await steps.step('Attempt to open the member list to locate a member to delete - the member list is not accessible without the View permission', async () => {
      await session.members.open();
      const rows = await session.members.countRows().catch(() => 0);
      expect({ listAnswered: await session.members.canListMembers(), rows }, `the screen read: ${(await session.members.getPageText()).slice(0, 200)}`)
        .toEqual({ listAnswered: false, rows: 0 });
    });
  });
});
