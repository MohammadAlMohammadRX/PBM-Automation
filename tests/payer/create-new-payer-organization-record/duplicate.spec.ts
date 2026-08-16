import { test } from '../../../fixtures';
import { buildUniquePayer } from '../../../data/payers/payer.data';
import { DateUtils } from '../../../utils/DateUtils';

/**
 * User story: Create New Payer Organization Record.
 * A payer whose identifying details duplicate an already-approved payer must be
 * flagged - never accepted silently.
 *
 * NOTE: verified live that the current app performs NO duplicate detection
 * (identical name + license saves silently), so this test is expected to FAIL
 * against the current build - that failure is the intended defect signal for the
 * dev team, not a test error.
 */
test.describe('Create New Payer Organization Record - Duplicate detection', () => {
  test('TC-015: should flag a potential duplicate when a new payer matches an approved payer', async ({
    payerManagementPage,
    approvalManagementPage,
    cleanup,
  }) => {
    // 1) Establish an approved payer (real PayerCode) to duplicate.
    const original = buildUniquePayer({ effectiveDate: DateUtils.pastDate(10) });
    cleanup.register(() => payerManagementPage.deletePayer(original.nameEn));

    await payerManagementPage.open();
    await payerManagementPage.createDraftPayer(original);
    await payerManagementPage.sendForApproval(original.nameEn);
    await approvalManagementPage.open();
    await approvalManagementPage.approve(original.nameEn);

    // 2) Attempt to create a second payer with identical identifying details.
    const duplicate = buildUniquePayer({
      nameEn: original.nameEn,
      licenseNumber: original.licenseNumber,
      email: original.email,
    });

    await payerManagementPage.open();
    await payerManagementPage.createDraftPayer(duplicate);

    // 3) The system must warn/flag the duplicate rather than accept it silently.
    await payerManagementPage.expectDuplicateWarning();
  });
});
