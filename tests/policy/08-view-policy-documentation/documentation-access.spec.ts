import { test, expect, type PolicySession } from '../../../utils/policy/policyRole';
import { CASES, DENIED, DESCRIPTION } from '../../../data/policy/policyDocumentation.data';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { PolicyDocumentsTab } from '../../../pages/policy/PolicyDocumentsTab';
import { documentTypeId, readPolicyDocuments } from '../../../utils/PolicyProvisioning';
import { expectRefused, isListedFor, requestAs, said } from '../../../utils/policy/writerBHelpers';

/**
 * User story 15175: View Policy - Documentation - a user without documentation
 * management rights. The Viewer is the Payer Admin role given
 * GetPolicyEndorsements and withheld CreatePolicyEndorsement /
 * DeletePolicyEndorsement (fixture `policyRole`), on a Draft of its own payer.
 */
test.describe('US 15175 - View Policy - Documentation - access', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.viewerAccess.azureId}: should show documentation read-only to a user without documentation rights and block any change`, async ({
    policyDetailPage,
    policyDocumentsTab,
    policyIn,
    policyRole,
    requirePolicyListAccess,
    requireBaseline,
    page,
    steps,
  }) => {
    const data = CASES.viewerAccess;
    const policy = await policyIn('Draft', { payerName: data.payerName, networks: 0, documents: [{ title: 'Viewer Access Entry', type: 'Other', description: DESCRIPTION }] });
    const title = policy.documents[0]?.title ?? 'Viewer Access Entry';
    let session!: PolicySession;
    let documents!: PolicyDocumentsTab;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyDetailPage.open(policy.id);
      await policyDocumentsTab.open();
      requireBaseline((await policyDocumentsTab.getAddAvailability()) === 'available', 'Add Documentation for a user holding the documentation rights');
      session = await policyRole.signIn(data.shape);
      await requirePolicyListAccess(session);
      if (!(await isListedFor(session, policy.nameEn))) {
        steps.blocked(`the shaped Payer Admin is not shown the "${data.payerName}" policy "${policy.nameEn}" - it is outside that account's payer scope`);
      }
      documents = new PolicyDocumentsTab(session.page);
      expect(await session.policies.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Open the Documentation tab of a policy as the restricted user - the documentation list is visible in read-only form', async () => {
      await session.detail.open(policy.id);
      await documents.open();
      expect((await documents.readCard(title))?.title).toBe(title);
    });

    await steps.step('Attempt to access Add Documentation, or the Edit / Delete actions on an existing entry - they are disabled or hidden, and a direct attempt is blocked with a permissions message', async () => {
      const card = await documents.readCard(title);
      expect({ add: await documents.getAddAvailability(), edit: await documents.isEditOffered(title), delete: card?.deleteOffered })
        .toEqual({ add: expect.not.stringMatching(/^available$/), edit: false, delete: false });
      const answer = await requestAs(session, 'POST', ApiEndpoints.policyAddDocument, {
        policyId: policy.id,
        title: 'Restricted user attempt',
        endorsementTypeId: await documentTypeId(page, 'Other'),
        effectiveDate: new Date().toISOString().slice(0, 10),
        description: DESCRIPTION,
        attachmentUri: null,
        attachmentFileName: null,
        attachmentContentType: null,
        attachmentSizeBytes: null,
        confirmRevertToDraft: true,
      });
      expectRefused(answer, 'CreatePolicyEndorsement without the right');
      expect(said(answer)).toMatch(DENIED);
      expect((await readPolicyDocuments(page, policy.id)).map((d) => d.title)).not.toContain('Restricted user attempt');
    });
  });
});
