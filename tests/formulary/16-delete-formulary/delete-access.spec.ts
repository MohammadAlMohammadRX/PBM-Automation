import { test, expect, formularyShape, openScopedList, submitDeletion } from '../../../utils/formulary/writerAHelpers';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { CASES, DELETE_MESSAGE } from '../../../data/formulary/deleteFormulary.data';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { pendingFormularyRequestId, readFormularyOrNull } from '../../../utils/FormularyProvisioning';

/**
 * User story 15213: Delete Formulary (who may request and who may decide).
 * The Viewer / non-approver is the Payer Admin account shaped to the formulary
 * read rights, without DeleteFormulary (writerAHelpers.formularySession); the
 * account holds no approval rights by its role's definition. The formulary is
 * the case's own, of that account's payer, so the account can open it.
 */
test.describe('US 15213 - Delete Formulary access', () => {
  test(`TC-${CASES.viewerCannotDelete.azureId}: should give a Viewer no Delete action and refuse a direct deletion request`, async ({
    formularyIn,
    formularySession,
    page,
    steps,
  }) => {
    const formulary = await formularyIn('Draft', { payerName: CASES.viewerCannotDelete.payer });
    const session = await formularySession(formularyShape());

    await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
      await openScopedList(session);
      expect(await session.formularies.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Open the formulary record - the details page opens', async () => {
      await session.detail.open(formulary.id);
      expect(await session.detail.getName()).toBe(formulary.nameEn);
    });

    await steps.step('The Delete action is hidden or disabled', async () => {
      expect(await session.detail.getActionAvailability('delete'), `Delete without ${session.removed.filter((r) => r === 'DeleteFormulary').join(', ')}`).not.toBe('available');
    });

    await steps.step('Triggering the delete directly is denied with an access-restricted message', async () => {
      const answer = await NetworkUtils.requestAsSession(session.page, 'DELETE', `${ApiEndpoints.formularyDelete}/${formulary.id}`);
      expect(answer.status, `DeleteFormulary answered ${answer.status}: ${answer.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
      expect(answer.text).toMatch(DELETE_MESSAGE.denied);
      expect(await readFormularyOrNull(page, formulary.id), 'the formulary must still exist').not.toBeNull();
    });
  });

  test(`TC-${CASES.nonApprover.azureId}: should show a pending deletion request to a non-approver without Approve or Reject and refuse a direct approval`, async ({
    formularyIn,
    formularySession,
    page,
    steps,
  }) => {
    const formulary = await formularyIn('Future', { payerName: CASES.nonApprover.payer });
    await submitDeletion(page, formulary.id);
    const requestId = await pendingFormularyRequestId(page, formulary.nameEn);
    const session = await formularySession(formularyShape());

    await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
      await openScopedList(session);
      expect(await session.formularies.isListRendered()).toBe(true);
      expect(requestId, 'the pending deletion request').not.toBe('');
    });

    await steps.step('Open the pending deletion request as a non-approver - its details are visible but Approve / Reject are not available', async () => {
      await session.approvals.open();
      expect(await session.approvals.getDecisionAvailability(formulary.nameEn)).toEqual({ inQueue: true, approve: false, reject: false });
    });

    await steps.step('Invoking the approval directly is denied with a permissions error', async () => {
      const answer = await session.approvals.approveRequestViaApi(requestId);
      expect(answer.status, `ApproveRequest answered ${answer.status}: ${answer.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
      expect(answer.text).toMatch(DELETE_MESSAGE.denied);
      expect(await readFormularyOrNull(page, formulary.id), 'the formulary must not be deleted').not.toBeNull();
    });
  });
});
