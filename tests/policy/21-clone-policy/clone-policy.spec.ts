import type { Page } from '@playwright/test';
import { test, expect } from '../../../fixtures';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { DRAFT_NUMBER_RE, PUBLISHED_NUMBER_RE } from '../../../data/policy/policy.data';
import { BLOCKED_CASES, CASES, NOT_FOUND, UNAPPROVED, cloneName } from '../../../data/policy/clonePolicy.data';
import type { PolicyCloneDrawer } from '../../../pages/policy/PolicyCloneDrawer';
import type { PolicySaveAnswer } from '../../../pages/policy/PolicyFormDrawer';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import {
  clonePolicy,
  deletePolicy,
  findPolicyByName,
  listPolicyRegister,
  publishPolicyChange,
  readPolicy,
  readPolicyDocuments,
  readPolicyMembers,
  readPolicyNetworks,
  readPolicyOrNull,
  samplePdf,
  waitForPolicy,
} from '../../../utils/PolicyProvisioning';
import { ERROR_MESSAGE, clonePeriod, downloadAttachment, provisionOrBlock, visibleMessages } from '../../../utils/policy/writerAHelpers';

/** Saves the open clone drawer with the case's name and period; returns the answer and the clone's id ('' when none). */
async function saveClone(page: Page, drawer: PolicyCloneDrawer, name: string): Promise<{ answer: PolicySaveAnswer; id: string }> {
  const answer = await drawer.clone(clonePeriod(), { nameEn: name });
  const id = answer.status < 300 ? ((await findPolicyByName(page, name))?.id ?? '') : '';
  return { answer, id };
}

/** A save in words, for failure messages. */
const told = (answer: PolicySaveAnswer): string => `ClonePolicy ${answer.status} ${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`;

/**
 * User story 18433: Clone Policy.
 * A clone carries the source's members, network assignments and documentation,
 * starts unapproved with a temporary code and gets its own code on approval;
 * an unapproved, rejected or member-less source clones cleanly; a deleted one
 * is refused. The expired / inactive network cases are BLOCKED (the data file
 * says why).
 */
test.describe('US 18433 - Clone Policy', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test(`TC-${CASES.carryOver.azureId}: should carry the source's members, network assignments and documentation into the clone`, async ({
    policyManagementPage: list,
    policyDetailPage: detail,
    policyIn,
    discardPolicyNamed,
    page,
    steps,
  }) => {
    const source = await policyIn('Future', { type: 'individual', members: CASES.carryOver.members, documents: CASES.carryOver.documents });
    const name = cloneName();
    discardPolicyNamed(name);
    let drawer!: PolicyCloneDrawer;
    let cloneId = '';

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await list.openTable();
    });

    await steps.step(`Open policy ${source.policyNumber} and select Clone Policy - a clone confirmation / preview is shown`, async () => {
      await detail.open(source.id);
      drawer = await detail.openClone();
      const included = { members: await drawer.isIncluded('includeMembers'), networks: await drawer.isIncluded('includeNetworks'), documentation: await drawer.isIncluded('includeDocumentation') };
      expect({ preview: (await drawer.getSourceMessage()).includes(source.nameEn), included }).toEqual({ preview: true, included: { members: true, networks: true, documentation: true } });
    });

    await steps.step('Confirm the clone action - a new policy is created', async () => {
      const saved = await saveClone(page, drawer, name);
      cloneId = saved.id;
      expect({ saved: saved.answer.status < 300, created: cloneId !== '' }, told(saved.answer)).toEqual({ saved: true, created: true });
    });

    await steps.step('Open the newly created clone - it holds the same members, active network assignments and documentation as the source', async () => {
      await detail.open(cloneId);
      const codes = (items: { memberCode: string }[]) => items.map((m) => m.memberCode).sort();
      expect({
        members: codes(await readPolicyMembers(page, cloneId)),
        networks: (await readPolicyNetworks(page, cloneId)).map((n) => n.networkCode).sort(),
        documentation: (await readPolicyDocuments(page, cloneId)).map((d) => d.title).sort(),
      }).toEqual({
        members: codes(source.members),
        networks: source.networks.filter((n) => n.assignmentState === 'live').map((n) => n.networkCode).sort(),
        documentation: source.documents.map((d) => d.title).sort(),
      });
    });
  });

  test(`TC-${CASES.unapproved.azureId}: should create the clone as an unapproved Not Live draft rather than an active policy`, async ({
    policyManagementPage: list,
    policyDetailPage: detail,
    policyIn,
    discardPolicyNamed,
    page,
    steps,
  }) => {
    const source = await policyIn('Future');
    const name = cloneName();
    discardPolicyNamed(name);
    let drawer!: PolicyCloneDrawer;
    let cloneId = '';

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await list.openTable();
    });

    await steps.step(`Open policy ${source.policyNumber} and select Clone Policy - a clone confirmation is shown`, async () => {
      await detail.open(source.id);
      drawer = await detail.openClone();
      expect(await drawer.getSourceMessage()).toContain(source.nameEn);
    });

    await steps.step('Confirm the clone action - a new policy is created', async () => {
      const saved = await saveClone(page, drawer, name);
      cloneId = saved.id;
      expect(cloneId, told(saved.answer)).not.toBe('');
    });

    await steps.step('Review the new clone\'s status - it is shown as a Not Live draft', async () => {
      await detail.open(cloneId);
      const header = await detail.readHeader();
      expect({ status: header.status, version: header.version }).toEqual(UNAPPROVED);
    });
  });

  test(`TC-${CASES.codeOnApproval.azureId}: should give a clone a temporary policy code while unapproved and a permanent one once approved`, async ({
    policyManagementPage: list,
    policyDetailPage: detail,
    policyIn,
    discardPolicyNamed,
    page,
    steps,
  }) => {
    const source = await policyIn('Future');
    const name = cloneName();
    discardPolicyNamed(name);
    const clone = await provisionOrBlock('a freshly cloned, unapproved policy', async () => {
      const made = await clonePolicy(page, source.id, { nameEn: name });
      if (made.id === null) throw new Error(`ClonePolicy answered ${made.status} ${made.text.slice(0, 200)}`);
      return { id: made.id, nameEn: name };
    });

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await list.openTable();
    });

    await steps.step('Open the newly cloned, unapproved policy - the policy details are shown', async () => {
      await detail.open(clone.id);
      expect(await detail.getName()).toBe(name);
    });

    await steps.step('Review the Policy code - a temporary code during cloning, a permanent policy code once the clone is approved', async () => {
      const temporary = await detail.readOverviewField('number');
      await publishPolicyChange(page, clone.id, name);
      await waitForPolicy(page, clone.id, (p) => !p.isPendingCreate && p.currentVersion >= 1, 'approved (v1)');
      await detail.open(clone.id);
      const permanent = await detail.readOverviewField('number');
      expect({ temporary: DRAFT_NUMBER_RE.test(temporary), permanent: PUBLISHED_NUMBER_RE.test(permanent), changed: temporary !== permanent }, `"${temporary}" -> "${permanent}"`)
        .toEqual({ temporary: true, permanent: true, changed: true });
    });
  });

  test(`TC-${CASES.uniqueCode.azureId}: should give an approved clone its own unique policy code, distinct from the source's`, async ({
    policyManagementPage: list,
    policyDetailPage: detail,
    policyIn,
    discardPolicyNamed,
    page,
    steps,
  }) => {
    const source = await policyIn('Future');
    const name = cloneName();
    discardPolicyNamed(name);
    const clone = await provisionOrBlock('a cloned policy awaiting approval', async () => {
      const made = await clonePolicy(page, source.id, { nameEn: name });
      if (made.id === null) throw new Error(`ClonePolicy answered ${made.status} ${made.text.slice(0, 200)}`);
      return { id: made.id, nameEn: name };
    });

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await list.openTable();
    });

    await steps.step('Open the cloned, unapproved policy - its details are shown with no policy code yet', async () => {
      await detail.open(clone.id);
      const number = await detail.readOverviewField('number');
      expect(PUBLISHED_NUMBER_RE.test(number), `the clone shows "${number}" before approval`).toBe(false);
    });

    await steps.step('Approve the policy - its status changes to Approved', async () => {
      await publishPolicyChange(page, clone.id, name);
      await waitForPolicy(page, clone.id, (p) => !p.isPendingCreate && p.currentVersion >= 1, 'approved (v1)');
      await detail.open(clone.id);
      expect(await detail.getVersionBadge()).toMatch(/Approved$/);
    });

    await steps.step('Review the Policy code field - a new, unique policy code has been assigned, distinct from the source\'s', async () => {
      const number = await detail.readOverviewField('number');
      const holders = (await listPolicyRegister(page, { searchText: number }, 20)).items.filter((p) => p.policyNumber === number).length;
      expect({ permanent: PUBLISHED_NUMBER_RE.test(number), distinct: number !== source.policyNumber, unique: holders === 1 }, `clone "${number}", source "${source.policyNumber}"`)
        .toEqual({ permanent: true, distinct: true, unique: true });
    });
  });

  test(`TC-${CASES.zeroMembers.azureId}: should create a valid clone with zero members from a source without members`, async ({
    policyManagementPage: list,
    policyDetailPage: detail,
    policyMembersTab: members,
    policyIn,
    discardPolicyNamed,
    page,
    steps,
  }) => {
    const source = await policyIn('Future');
    const name = cloneName();
    discardPolicyNamed(name);
    let drawer!: PolicyCloneDrawer;
    let cloneId = '';

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await list.openTable();
    });

    await steps.step(`Open policy ${source.policyNumber} (no members) and select Clone Policy - a clone confirmation is shown`, async () => {
      await detail.open(source.id);
      drawer = await detail.openClone();
      expect(await drawer.getSourceMessage()).toContain(source.nameEn);
    });

    await steps.step('Confirm the clone action - the new policy is created without error', async () => {
      const saved = await saveClone(page, drawer, name);
      cloneId = saved.id;
      expect({ created: cloneId !== '', errors: (await visibleMessages(page)).filter((m) => ERROR_MESSAGE.test(m)) }, told(saved.answer)).toEqual({ created: true, errors: [] });
    });

    await steps.step('Review the clone\'s member list - it shows zero members, as the source does', async () => {
      await detail.open(cloneId);
      await members.open();
      expect({ listed: await members.countRows(), recorded: (await readPolicyMembers(page, cloneId)).length }).toEqual({ listed: 0, recorded: 0 });
    });
  });

  test(`TC-${CASES.documentsCopied.azureId}: should copy every document of the source to the clone with the same file name and content`, async ({
    policyManagementPage: list,
    policyDetailPage: detail,
    policyDocumentsTab: documents,
    policyIn,
    discardPolicyNamed,
    page,
    steps,
  }) => {
    const data = CASES.documentsCopied;
    const source = await policyIn('Future', { documents: [{ title: data.title, attachment: samplePdf(data.fileName) }] });
    const name = cloneName();
    discardPolicyNamed(name);
    let drawer!: PolicyCloneDrawer;
    let cloneId = '';

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await list.openTable();
    });

    await steps.step(`Open policy ${source.policyNumber} and select Clone Policy - a clone confirmation is shown`, async () => {
      await detail.open(source.id);
      drawer = await detail.openClone();
      expect({ preview: (await drawer.getSourceMessage()).includes(source.nameEn), documentation: await drawer.isIncluded('includeDocumentation') }).toEqual({ preview: true, documentation: true });
    });

    await steps.step('Confirm the clone action - the new policy is created', async () => {
      const saved = await saveClone(page, drawer, name);
      cloneId = saved.id;
      expect(cloneId, told(saved.answer)).not.toBe('');
    });

    await steps.step('Open the clone\'s documentation and compare each document with the source - each is present with the same file name and content', async () => {
      await detail.open(cloneId);
      await documents.open();
      const shown = (await documents.readCards()).map((c) => c.title);
      const copies = await readPolicyDocuments(page, cloneId);
      const problems: string[] = [];
      for (const original of await readPolicyDocuments(page, source.id)) {
        const copy = copies.find((d) => d.title === original.title);
        if (!copy) { problems.push(`"${original.title}" missing`); continue; }
        if (!shown.includes(original.title)) problems.push(`"${original.title}" not shown on the tab`);
        if (copy.attachmentFileName !== original.attachmentFileName) problems.push(`"${original.title}": file "${copy.attachmentFileName}" vs "${original.attachmentFileName}"`);
        const [a, b] = [await downloadAttachment(page, original.attachmentUri ?? ''), await downloadAttachment(page, copy.attachmentUri ?? '')];
        if (a.status >= 300 || b.status >= 300 || !a.bytes.equals(b.bytes)) problems.push(`"${original.title}": content differs (downloads ${a.status} / ${b.status}, ${a.bytes.length} / ${b.bytes.length} bytes)`);
      }
      expect(problems).toEqual([]);
    });
  });

  test(`TC-${CASES.deletedSource.azureId}: should refuse to clone a deleted policy with a clear not-found message and no partial clone`, async ({
    policyManagementPage: list,
    policyDetailPage: detail,
    policyIn,
    discardPolicyNamed,
    page,
    steps,
  }) => {
    const gone = await policyIn('Draft');
    await provisionOrBlock('a reference to a deleted policy', async () => {
      const res = await deletePolicy(page, gone.id);
      if (res.status >= 300 || (await readPolicyOrNull(page, gone.id)) !== null) throw new Error(`DeletePolicy answered ${res.status} ${res.text.slice(0, 200)}`);
    });
    const name = cloneName();
    discardPolicyNamed(name);
    let screen = '';
    let located = '';

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await list.openTable();
    });

    await steps.step(`Attempt to open or clone the deleted policy ${gone.policyNumber} by its reference - the system is unable to locate the source`, async () => {
      await detail.openExpectingFailure(gone.id);
      // Read the messages straight away: isLoaded waits up to 30 s for a header that never
      // comes, and a toast is gone by then (2026-11-04: the screen read was only the list).
      const said = await detail.waitForMessages();
      const loaded = await detail.isLoaded();
      screen = `${await detail.getScreenText()} ${said.join(' ')}`.trim();
      const forClone = await NetworkUtils.postAsSession(page, ApiEndpoints.policyForClone, { id: gone.id });
      located = `GetPolicyForClone ${forClone.status} ${forClone.text.slice(0, 160)}`;
      expect({ loaded, located: forClone.status < 300 }, `GetPolicyForClone ${forClone.status} ${forClone.text.slice(0, 200)}`).toEqual({ loaded: false, located: false });
    });

    await steps.step('Observe the response - a clear "policy not found" message is shown and no partial or broken clone is created', async () => {
      // The clone action loads its source first (GetPolicyForClone - the drawer's own call);
      // ClonePolicy is then sent from what that answered, so with no source its 422 "model
      // validation" is about the request, not the deleted policy (2026-11-04). The case asks
      // for the message ON SCREEN, so only the screen counts; the API's own text is quoted.
      const attempt = await clonePolicy(page, gone.id, { nameEn: name });
      expect({ message: NOT_FOUND.test(screen), refused: attempt.status >= 400, created: (await findPolicyByName(page, name)) !== null }, `screen "${screen.slice(0, 160)}"; ${located}; ClonePolicy ${attempt.status} ${attempt.text.slice(0, 200)}`)
        .toEqual({ message: true, refused: true, created: false });
    });
  });

  test(`TC-${CASES.unapprovedSource.azureId}: should clone an unapproved source into its own independent unapproved policy`, async ({
    policyManagementPage: list,
    policyDetailPage: detail,
    policyIn,
    discardPolicyNamed,
    page,
    steps,
  }) => {
    const source = await policyIn('Draft', { type: 'individual', members: 1 });
    const name = cloneName();
    discardPolicyNamed(name);
    let drawer!: PolicyCloneDrawer;

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await list.openTable();
    });

    await steps.step(`Open the unapproved source ${source.policyNumber} and check whether Clone Policy is available - it is available and can be selected`, async () => {
      await detail.open(source.id);
      expect(await detail.getActionAvailability('clone')).toBe('available');
      drawer = await detail.openClone();
      expect(await drawer.getSourceMessage()).toContain(source.nameEn);
    });

    await steps.step('Confirm the clone and review its data, status and relationship to the source - an independent unapproved policy without errors, duplicate codes or broken links', async () => {
      const saved = await saveClone(page, drawer, name);
      expect(saved.id, told(saved.answer)).not.toBe('');
      const clone = await readPolicy(page, saved.id);
      const own = await Promise.all([readPolicyMembers(page, saved.id), readPolicyNetworks(page, saved.id), readPolicyDocuments(page, saved.id)])
        .then(([m, , d]) => m.every((x) => x.policyId === saved.id) && d.every((x) => x.policyId === saved.id)).catch(() => false);
      await detail.open(saved.id);
      expect({
        status: await detail.getStatus(),
        draftCode: DRAFT_NUMBER_RE.test(clone.policyNumber),
        ownCode: clone.policyNumber !== source.policyNumber,
        clonedFrom: clone.clonedFromPolicyId,
        ownRecords: own,
        sourceKept: (await readPolicyMembers(page, source.id)).length,
        errors: (await visibleMessages(page)).filter((m) => ERROR_MESSAGE.test(m)),
      }).toEqual({ status: UNAPPROVED.status, draftCode: true, ownCode: true, clonedFrom: source.id, ownRecords: true, sourceKept: source.members.length, errors: [] });
    });
  });

  test(`TC-${CASES.rejectedSource.azureId}: should clone a rejected policy that has no network, member or documentation`, async ({
    policyManagementPage: list,
    policyDetailPage: detail,
    policyIn,
    discardPolicyNamed,
    page,
    steps,
  }) => {
    const source = await policyIn('Rejected', { networks: 0 });
    const name = cloneName();
    discardPolicyNamed(name);

    await steps.critical('Navigate to the Policy Management module - the rejected policy opens', async () => {
      await list.openTable();
      await detail.open(source.id);
    });

    await steps.step('Clone the rejected policy that has no network, member or documentation - the system allows it without copying any network, member or documentation', async () => {
      const drawer = await detail.openClone();
      const saved = await saveClone(page, drawer, name);
      const counts = saved.id === ''
        ? null
        : { members: (await readPolicyMembers(page, saved.id)).length, networks: (await readPolicyNetworks(page, saved.id)).length, documents: (await readPolicyDocuments(page, saved.id)).length };
      expect({ allowed: saved.id !== '', counts }, told(saved.answer)).toEqual({ allowed: true, counts: { members: 0, networks: 0, documents: 0 } });
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
