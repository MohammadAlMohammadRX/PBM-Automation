import { test, expect, controlAvailability, importAsSession, isListedFor, tierImportFile, type FormularySession } from '../../../utils/formulary/writerCHelpers';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { FORMULARY_TIERS, FORMULARY_TRADES } from '../../../constants/ElementIds';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { FORMULARY_STATUS, MESSAGE } from '../../../data/formulary/formulary.data';
import { CASES, FORMULARY_RIGHT, NO_ACCESS, SCOPED_PAYER } from '../../../data/formulary/formularyPermissions.data';
import {
  cloneFormulary,
  deleteFormulary,
  findFormularyByName,
  readTiers,
  readVersions,
  setFormularyActive,
  submitFormulary,
  suiteFormularyName,
} from '../../../utils/FormularyProvisioning';

/** A direct request refused for want of the right. */
const refused = (answer: { status: number; text: string }): boolean => answer.status === 401 || answer.status === 403 || (answer.status >= 400 && MESSAGE.denied.test(answer.text));

/**
 * User story 18525: Formulary Permissions - the action permissions (Send for
 * Approval, Activate, Inactivate, Delete, Clone, View, Import, Export), each
 * granted or withheld on its own and enforced on screen and on the server.
 * The Payer Admin role is shaped per case (fixture `formularyRole`,
 * data/formulary/formularyPermissions.data.ts); every formulary belongs to a
 * payer in that account's scope, so only the permission can explain what it
 * is offered.
 */
test.describe('US 18525 - Formulary Permissions - actions', () => {
  test.describe.configure({ timeout: 20 * 60_000 });

  test(`TC-${CASES.grantSubmit.azureId}: should give a role exactly the Send for Approval action when only that permission is granted`, async ({
    formularyManagementPage,
    formularyIn,
    formularyRole,
    steps,
  }) => {
    const data = CASES.grantSubmit;
    const formulary = await formularyIn('Draft', { payerName: SCOPED_PAYER, tiers: 1, trades: 1 });
    const actionLabels = (['submit', 'setActive', 'delete', 'clone', 'view', 'import', 'export'] as const).map((r) => FORMULARY_RIGHT[r]);
    let session!: FormularySession;

    await steps.critical('Navigate to the Formulary Management module - the landing page loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
      await formularyRole.reshape(data.shape);
    });

    await steps.critical('Open Role & Permission administration and select the role - every formulary action checkbox is unchecked', async () => {
      const catalogue = await formularyRole.openCatalogue();
      const checked: string[] = [];
      for (const label of actionLabels) if (await catalogue.isPermissionChecked(label)) checked.push(label);
      expect(checked, 'formulary actions already granted').toEqual([]);
    });

    await steps.critical('Enable only the Send for Approval permission - its checkbox shows checked', async () => {
      expect(await formularyRole.toggle(FORMULARY_RIGHT[data.grant])).toBe(true);
    });

    await steps.critical('Save the permission changes - a confirmation message is displayed', async () => {
      await formularyRole.save();
      const catalogue = await formularyRole.openCatalogue();
      expect(await catalogue.isPermissionChecked(FORMULARY_RIGHT[data.grant]), 'saved as checked').toBe(true);
      await formularyRole.closeCatalogue();
    });

    await steps.step('Log in as a user of the role and open a Draft formulary - Send for Approval is visible and enabled', async () => {
      session = await formularyRole.signIn({});
      await session.detail.openExpectingFailure(formulary.id);
      expect(await session.detail.isLoaded(), 'the formulary record opens').toBe(true);
      expect(await session.detail.getActionAvailability('submit')).toBe('available');
    });
  });

  test(`TC-${CASES.noSubmit.azureId}: should hide Send for Approval and refuse a direct submission when the user lacks that permission`, async ({
    page,
    formularyIn,
    formularyRole,
    requireFormularyListAccess,
    steps,
  }) => {
    const formulary = await formularyIn('Draft', { payerName: SCOPED_PAYER, tiers: 1, trades: 1 });
    let session!: FormularySession;

    await steps.critical('Navigate to the Formulary Management module - the landing page loads', async () => {
      session = await formularyRole.signIn(CASES.noSubmit.shape);
      await requireFormularyListAccess(session);
      await session.formularies.open();
      expect(await session.formularies.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Draft formulary - the detail page shows the Draft status', async () => {
      await session.detail.open(formulary.id);
      expect(await session.detail.getVersionBadge()).toMatch(/Draft/);
    });

    await steps.step('Look for the Send for Approval control - it is hidden or disabled', async () => {
      expect(await session.detail.getActionAvailability('submit')).not.toBe('available');
    });

    await steps.step('Trigger the action directly - it is blocked with an access-denied message', async () => {
      const answer = await submitFormulary(session.page, formulary.id);
      expect(refused(answer), `answered ${answer.status} ${answer.text.slice(0, 200)}`).toBe(true);
      expect((await readVersions(page, formulary.id)).some((v) => v.versionStatusCode === 'pendingApproval'), 'nothing submitted').toBe(false);
    });
  });

  test(`TC-${CASES.noActivate.azureId}: should hide Activate and refuse a direct activation of a pending formulary when the user lacks that permission`, async ({
    page,
    formularyDetailPage,
    formularyIn,
    formularyRole,
    requireFormularyListAccess,
    steps,
  }) => {
    const formulary = await formularyIn('PendingApproval', { payerName: SCOPED_PAYER });
    let session!: FormularySession;

    await steps.critical('Navigate to the Formulary Management module - the landing page loads', async () => {
      session = await formularyRole.signIn(CASES.noActivate.shape);
      await requireFormularyListAccess(session);
      await session.formularies.open();
      expect(await session.formularies.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the formulary in Pending Approval - the record shows Pending Approval', async () => {
      await session.detail.open(formulary.id);
      expect(await session.detail.getVersionBadge()).toMatch(/Pending Approval/);
    });

    await steps.step('Check for the Activate action - it is hidden or disabled', async () => {
      expect(await session.detail.getActionAvailability('activate')).not.toBe('available');
    });

    await steps.step('Invoke Activate directly - the request is denied and the status is unchanged', async () => {
      const answer = await setFormularyActive(session.page, formulary.id, true, { confirmRevertToDraft: false });
      expect(refused(answer), `answered ${answer.status} ${answer.text.slice(0, 200)}`).toBe(true);
      expect((await readVersions(page, formulary.id)).some((v) => v.versionStatusCode === 'pendingApproval'), 'still Pending Approval').toBe(true);
      expect(await formularyDetailPage.readStatusCodeViaApi(formulary.id)).not.toBe('active');
    });
  });

  test(`TC-${CASES.noInactivate.azureId}: should hide Inactivate and refuse a direct deactivation of an Active formulary when the user lacks that permission`, async ({
    formularyDetailPage,
    formularyIn,
    formularyRole,
    requireFormularyListAccess,
    steps,
  }) => {
    const formulary = await formularyIn('Active', { payerName: SCOPED_PAYER });
    let session!: FormularySession;

    await steps.critical('Navigate to the Formulary Management module - the landing page loads', async () => {
      session = await formularyRole.signIn(CASES.noInactivate.shape);
      await requireFormularyListAccess(session);
      await session.formularies.open();
      expect(await session.formularies.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Active formulary - the record shows Active', async () => {
      await session.detail.open(formulary.id);
      expect(await session.detail.getStatus()).toBe(FORMULARY_STATUS.active);
    });

    await steps.step('Check for the Inactivate control - it is hidden or disabled', async () => {
      expect(await session.detail.getActionAvailability('setActive')).not.toBe('available');
    });

    await steps.step('Invoke Inactivate directly - the request is denied and the formulary stays Active', async () => {
      const answer = await setFormularyActive(session.page, formulary.id, false);
      expect(refused(answer), `answered ${answer.status} ${answer.text.slice(0, 200)}`).toBe(true);
      expect(await formularyDetailPage.readStatusCodeViaApi(formulary.id)).toBe('active');
      expect((await formularyDetailPage.readViaApi(formulary.id)).hasDraft, 'no deactivation staged').not.toBe(true);
    });
  });

  test(`TC-${CASES.deleteOnlyWithRight.azureId}: should offer and carry out Delete only for the user holding the Delete permission`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyIn,
    formularyRole,
    requireFormularyListAccess,
    steps,
  }) => {
    const data = CASES.deleteOnlyWithRight;
    const formulary = await formularyIn('Draft', { payerName: SCOPED_PAYER });
    let userA!: FormularySession;

    await steps.critical('Navigate to the Formulary Management module - the landing page loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Log in as User B (no Delete permission) and open the Draft - Delete is hidden or disabled', async () => {
      const userB = await formularyRole.signIn(data.viewOnly);
      await requireFormularyListAccess(userB);
      await userB.detail.open(formulary.id);
      expect(await userB.detail.getActionAvailability('delete')).not.toBe('available');
    });

    await steps.critical('Log in as User A (Delete permission) and open the same formulary - Delete is visible and enabled', async () => {
      userA = await formularyRole.signIn(data.withDelete);
      await userA.detail.open(formulary.id);
      expect(await userA.detail.getActionAvailability('delete')).toBe('available');
    });

    await steps.step('Select Delete and confirm - the formulary is removed and a success confirmation is shown', async () => {
      const outcome = await userA.detail.deleteAndCapture();
      expect(outcome.status, outcome.text.slice(0, 200)).toBe(200);
      expect(outcome.messages.join(' | ')).toMatch(/discarded|deleted|removed|success/i);
      expect(await formularyDetailPage.readViaApiOrNull(formulary.id)).toBeNull();
    });
  });

  test(`TC-${CASES.noView.azureId}: should block opening a formulary and every tab when the user lacks the View permission`, async ({
    formularyIn,
    formularyRole,
    steps,
  }) => {
    const formulary = await formularyIn('Draft', { payerName: SCOPED_PAYER });
    let session!: FormularySession;
    let listed = false;

    await steps.critical('Navigate to the Formulary Management module - the landing page loads', async () => {
      session = await formularyRole.signIn(CASES.noView.shape);
      await session.formularies.openExpectingDenial();
      expect(session.removed).toContain(FORMULARY_RIGHT.view);
    });

    await steps.step('Look for formulary records in the list - they are hidden, or shown without an open / view option', async () => {
      listed = await isListedFor(session, formulary.nameEn);
      const view = listed ? (await session.formularies.getActionState(formulary.nameEn, 'view')).availability : 'absent';
      expect({ listed, view }).toEqual({ listed: expect.any(Boolean), view: expect.not.stringMatching(/^available$/) });
    });

    await steps.step('Open a formulary record directly - access is denied with a message and no tab is rendered', async () => {
      await session.detail.openExpectingFailure(formulary.id);
      expect(await session.detail.readOfferedTabs(), 'tabs rendered').toEqual([]);
      expect(await session.detail.getScreenText()).toMatch(MESSAGE.denied);
    });
  });

  test(`TC-${CASES.noImport.azureId}: should hide Import and refuse a direct upload when the user lacks the Import permission`, async ({
    page,
    formularyIn,
    formularyRole,
    requireFormularyListAccess,
    steps,
  }) => {
    const formulary = await formularyIn('Draft', { payerName: SCOPED_PAYER });
    let session!: FormularySession;

    await steps.critical('Navigate to the Formulary Management module - the landing page loads', async () => {
      session = await formularyRole.signIn(CASES.noImport.shape);
      await requireFormularyListAccess(session);
      await session.formularies.open();
      expect(await session.formularies.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Look for Import on the formulary list and detail toolbars - it is hidden or disabled', async () => {
      const list = await session.formularies.isImportOffered();
      await session.detail.open(formulary.id);
      await session.tiers.open();
      const tiers = await controlAvailability(session.page, FORMULARY_TIERS.importTrigger);
      await session.trades.open();
      const trades = await controlAvailability(session.page, FORMULARY_TRADES.importTrigger);
      expect({ list, tiers, trades }).toEqual({ list: false, tiers: expect.not.stringMatching(/^available$/), trades: expect.not.stringMatching(/^available$/) });
    });

    await steps.step('Upload a file directly through an exposed entry point - rejected with access denied and nothing imported', async () => {
      const before = (await readTiers(page, formulary.id)).length;
      const answer = await importAsSession(session.page, ApiEndpoints.formularyImportTiers, tierImportFile([['Automation Bypass Tier', 'مستوى', '50', '9', '', '']]), formulary.id);
      expect(refused(answer), `answered ${answer.status} ${answer.text.slice(0, 200)}`).toBe(true);
      expect((await readTiers(page, formulary.id)).length).toBe(before);
    });
  });

  test(`TC-${CASES.noClone.azureId}: should hide Clone and create no duplicate when the user lacks the Clone permission`, async ({
    page,
    formularyIn,
    formularyRole,
    discardFormularyNamed,
    requireFormularyListAccess,
    steps,
  }) => {
    const formulary = await formularyIn('Draft', { payerName: SCOPED_PAYER, tiers: 1, trades: 1 });
    const cloneName = suiteFormularyName('denied clone');
    discardFormularyNamed(cloneName);
    let session!: FormularySession;

    await steps.critical('Navigate to the Formulary Management module - the landing page loads', async () => {
      session = await formularyRole.signIn(CASES.noClone.shape);
      await requireFormularyListAccess(session);
      await session.formularies.open();
      expect(await session.formularies.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the existing formulary record - its details are shown', async () => {
      await session.detail.open(formulary.id);
      expect(await session.detail.getName()).toBe(formulary.nameEn);
    });

    await steps.step('Check for the Clone action - it is hidden or disabled', async () => {
      expect(await session.detail.getActionAvailability('clone'), 'the header Clone').not.toBe('available');
      expect((await session.formularies.getActionState(formulary.nameEn, 'clone')).availability, 'the list row Clone').not.toBe('available');
    });

    await steps.step('Trigger the clone directly - denied, and no duplicate formulary is created', async () => {
      const answer = await cloneFormulary(session.page, formulary.id, { nameEn: cloneName });
      expect(refused(answer), `answered ${answer.status} ${answer.text.slice(0, 200)}`).toBe(true);
      expect(await findFormularyByName(page, cloneName)).toBeNull();
    });
  });

  test(`TC-${CASES.noExport.azureId}: should hide Export and produce no file when the user lacks the Export permission`, async ({
    formularyIn,
    formularyRole,
    requireFormularyListAccess,
    steps,
  }) => {
    const formulary = await formularyIn('Draft', { payerName: SCOPED_PAYER });
    let session!: FormularySession;

    await steps.critical('Navigate to the Formulary Management module - the landing page loads', async () => {
      session = await formularyRole.signIn(CASES.noExport.shape);
      await requireFormularyListAccess(session);
      await session.formularies.open();
      expect(await session.formularies.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Look for Export on the formulary list - it is hidden or disabled', async () => {
      expect(await session.formularies.isExportOffered()).toBe(false);
    });

    await steps.step('Trigger an export directly - denied, and no export file is generated', async () => {
      const answer = await NetworkUtils.postAsSession(session.page, ApiEndpoints.formularyExport, { pageNumber: 1, rowsPerPage: 100 });
      expect(refused(answer), `answered ${answer.status} ${answer.text.slice(0, 200)}`).toBe(true);
    });
  });

  test(`TC-${CASES.workflowSequence.azureId}: should offer each status action only in the state the workflow allows, whatever the permissions`, async ({
    formularyApprovalsPage,
    formularyIn,
    formularyRole,
    requireFormularyListAccess,
    steps,
  }) => {
    const formulary = await formularyIn('Draft', { payerName: SCOPED_PAYER, tiers: 1, trades: 1 });
    let session!: FormularySession;

    await steps.critical('Navigate to the Formulary Management module - the landing page loads', async () => {
      session = await formularyRole.signIn(CASES.workflowSequence.shape);
      await requireFormularyListAccess(session);
      await session.formularies.open();
      expect(await session.formularies.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Open the Draft and try to Activate it without sending it for approval - Activate is unavailable while Draft', async () => {
      await session.detail.open(formulary.id);
      expect(await session.detail.getActionAvailability('activate')).not.toBe('available');
    });

    await steps.critical('Select Send for Approval on the Draft - the status is Pending Approval and Send for Approval is no longer available', async () => {
      expect((await session.detail.sendForApproval()).status).toBe(200);
      await session.detail.open(formulary.id);
      expect(await session.detail.getVersionBadge()).toMatch(/Pending Approval/);
      expect(await session.detail.getActionAvailability('submit')).not.toBe('available');
    });

    await steps.critical('Select Activate on the Pending Approval formulary - the status is Active, Inactivate available and Activate no longer shown', async () => {
      expect(await session.detail.getActionAvailability('activate'), 'Activate on a Pending Approval formulary').toBe('available');
      const activated = await session.detail.activate();
      expect(activated.status, activated.text.slice(0, 200)).toBe(200);
      await session.detail.expectStatus(FORMULARY_STATUS.active);
      expect(await session.detail.getActionAvailability('setActive')).toBe('available');
      expect(await session.detail.getActionAvailability('activate')).not.toBe('available');
    });

    await steps.step('Select Inactivate on the Active formulary - the status is Inactive', async () => {
      const drawer = await session.detail.openDeactivate();
      expect((await drawer.deactivate()).status).toBe(200);
      await session.detail.open(formulary.id);
      expect((await session.detail.sendForApproval()).status).toBe(200);
      await formularyApprovalsPage.open();
      await formularyApprovalsPage.approve(formulary.nameEn);
      await session.detail.expectStatus(FORMULARY_STATUS.inactive);
    });
  });

  test(`TC-${CASES.independentRights.azureId}: should grant and enforce each formulary permission on its own, with no permission implying another`, async ({
    formularyManagementPage,
    formularyIn,
    formularyRole,
    steps,
  }) => {
    const data = CASES.independentRights;
    const formulary = await formularyIn('Draft', { payerName: SCOPED_PAYER });
    const others = (['submit', 'setActive', 'delete', 'clone', 'view', 'import'] as const).map((r) => FORMULARY_RIGHT[r]);
    let session!: FormularySession;

    await steps.critical('Navigate to the Formulary Management module - the landing page loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Open the role permission matrix - every formulary action, tab and sub-permission is its own checkbox', async () => {
      const catalogue = await formularyRole.openCatalogue();
      const missing: string[] = [];
      for (const label of [...others, FORMULARY_RIGHT.export, FORMULARY_RIGHT.versions, FORMULARY_RIGHT.audit, FORMULARY_RIGHT.exportTiers, FORMULARY_RIGHT.exportTrades]) {
        if (!(await catalogue.hasPermissionLabelled(label))) missing.push(label);
      }
      await formularyRole.closeCatalogue();
      expect(missing, 'permissions without a checkbox of their own').toEqual([]);
    });

    await steps.critical('Enable only Export and save - only Export is checked; the other actions stay unchecked', async () => {
      // Two passes: withholding the GetFormularies parent also unticks Export (its child),
      // so granting Export in the same pass left it unticked (2026-11-03).
      await formularyRole.reshape(NO_ACCESS);
      await formularyRole.reshape(data.exportOnly);
      const catalogue = await formularyRole.openCatalogue();
      const checked: string[] = [];
      for (const label of others) if (await catalogue.isPermissionChecked(label)) checked.push(label);
      const exportChecked = await catalogue.isPermissionChecked(FORMULARY_RIGHT.export);
      await formularyRole.closeCatalogue();
      expect({ exportChecked, checked }).toEqual({ exportChecked: true, checked: [] });
    });

    await steps.step('Log in as a user of the role and open the formulary list - only Export is available; no View, so no formulary opens', async () => {
      // View is already unticked; naming it records whether the account is still told it holds it.
      session = await formularyRole.signIn({ without: ['view'] });
      const listed = await isListedFor(session, formulary.nameEn);
      const exportOffered = await session.formularies.isExportOffered();
      const view = listed ? (await session.formularies.getActionState(formulary.nameEn, 'view')).availability : 'absent';
      expect({ exportOffered, view }).toEqual({ exportOffered: true, view: expect.not.stringMatching(/^available$/) });
    });

    await steps.step('Enable View as well and retry - the user opens the formulary and Export is accessible', async () => {
      session = await formularyRole.signIn(data.exportAndView);
      await session.detail.openExpectingFailure(formulary.id);
      expect(await session.detail.isLoaded(), 'the formulary opens').toBe(true);
      await session.formularies.openExpectingDenial();
      expect(await session.formularies.isExportOffered()).toBe(true);
    });
  });

  test(`TC-${CASES.bypass.azureId}: should reject direct Delete, Activate and Export requests from a view-only user and change nothing`, async ({
    formularyDetailPage,
    formularyIn,
    formularyRole,
    requireFormularyListAccess,
    steps,
  }) => {
    const formulary = await formularyIn('Draft', { payerName: SCOPED_PAYER, tiers: 1, trades: 1 });
    let session!: FormularySession;

    await steps.critical('Navigate to the Formulary Management module - the landing page loads', async () => {
      session = await formularyRole.signIn(CASES.bypass.shape);
      await requireFormularyListAccess(session);
      await session.formularies.open();
      expect(await session.formularies.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Open a formulary record - the Delete control is not rendered', async () => {
      await session.detail.open(formulary.id);
      expect(await session.detail.getActionAvailability('delete')).not.toBe('available');
    });

    await steps.step('Replay the Delete request directly - rejected as unauthorized and the formulary is not deleted', async () => {
      const answer = await deleteFormulary(session.page, formulary.id);
      expect(refused(answer), `answered ${answer.status} ${answer.text.slice(0, 200)}`).toBe(true);
      expect(await formularyDetailPage.readViaApiOrNull(formulary.id)).not.toBeNull();
    });

    await steps.step('Repeat for Activate and Export - each request is rejected and nothing changes', async () => {
      const activate = await setFormularyActive(session.page, formulary.id, true, { confirmRevertToDraft: false });
      const exported = await NetworkUtils.postAsSession(session.page, ApiEndpoints.formularyExport, { pageNumber: 1, rowsPerPage: 100 });
      expect({ activate: refused(activate), export: refused(exported) }, `activate ${activate.status}, export ${exported.status}`).toEqual({ activate: true, export: true });
      expect(await formularyDetailPage.readStatusCodeViaApi(formulary.id), 'the draft was not activated').not.toBe('active');
      expect(await formularyDetailPage.readViaApiOrNull(formulary.id), 'the formulary is still there').not.toBeNull();
    });
  });
});
