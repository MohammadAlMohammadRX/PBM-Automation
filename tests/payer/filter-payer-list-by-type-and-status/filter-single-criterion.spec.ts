import { test } from '../../../fixtures';
import { STATUS_BOUNDARY_CASES } from '../../../data/payers/filterPayer.data';

/**
 * User story: Filter Payer List by Type and Status.
 * Filtering on one criterion at a time.
 */
test.describe('Filter Payer List by Type and Status - Single criterion', () => {
  test('TC-001: should list only private payers when the Payer Type filter is set to Private', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    await payerManagementPage.filterByType('Private');

    await payerManagementPage.expectAllRowsOfType('Private');
  });

  test('TC-002: should list only government payers when the Payer Type filter is set to Government', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    await payerManagementPage.filterByType('Government');

    await payerManagementPage.expectAllRowsOfType('Government');
  });

  test('TC-003: should list only active payers when the Status filter is set to Active', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    await payerManagementPage.filterByStatus('Active');

    // Pending, Inactive and Expired payers must all be excluded.
    await payerManagementPage.expectAllRowsOfStatus('Active');
  });

  // TC-006: the first and last selectable status must filter correctly - proving
  // there is no off-by-one error in the dropdown selection.
  for (const boundary of STATUS_BOUNDARY_CASES) {
    test(`TC-006: should filter to only ${boundary.status} payers when the ${boundary.position} Status option is selected`, async ({
      payerManagementPage,
    }) => {
      await payerManagementPage.open();

      await payerManagementPage.filterByStatus(boundary.status);

      await payerManagementPage.expectStatusFilterOutcome(boundary.status);
    });
  }
});
