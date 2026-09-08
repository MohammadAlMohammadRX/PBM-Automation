import { test, expect } from '../../../fixtures';
import { APPROVAL_STATUS } from '../../../constants/ElementIds';
import {
  EXPECTED_APPROVAL_STATUSES,
  WITHDRAWN_STATUS,
} from '../../../data/payers/approvalStatus.data';

/**
 * User story: Provide Arabic Labels for All Approval Status Values, Including
 * Withdrawn.
 * The Withdraw action, and the status filter that should offer all five values.
 *
 * NONE OF THIS EXISTS YET, verified rather than assumed:
 *
 *   - No Withdraw action anywhere. Row actions on the payer list are view, edit,
 *     delete, networks, inactivate, activate and submit-for-approval. Version
 *     history rows offer view and revert. The approvals hub offers review,
 *     reject and approve. Nothing on any of those surfaces mentions withdrawing.
 *   - No approval-status filter. The list's only status filter is the LIFECYCLE
 *     one, offering All Statuses / Pending / Active / Inactive / Expired - four
 *     lifecycle values, not the five approval values this story enumerates.
 *
 * The filter cases are written to assert the filter's options against the
 * APPROVAL checklist, so they FAIL and say what is offered instead. That is
 * deliberate: the lifecycle filter does happen to present exactly five entries,
 * so a case that only counted options would PASS for entirely the wrong reason
 * and hide the gap.
 */
test.describe('Provide Arabic Labels for All Approval Status Values - Withdraw and filtering', () => {
  test('TC-006: should set the request to Withdrawn when a pending payer change is withdrawn', async ({
    payerManagementPage,
    approvalManagementPage,
    uniquePayer,
    steps,
  }) => {
    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(uniquePayer);
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(uniquePayer.nameEn);
    });

    await steps.step('The request is open and awaiting approval', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(uniquePayer.nameEn);
    });

    // The step this case fails on: there is no Withdraw action to select.
    await steps.critical('A Withdraw action is offered on the pending request', async () => {
      const actions = await approvalManagementPage.getRowActionKeys(uniquePayer.nameEn);
      expect(
        actions,
        'The approvals hub offers only review / reject / approve. No Withdraw action exists '
          + 'here, on a payer list row, or on a version history row.',
      ).toContain('withdraw');
    });

    await steps.step('Confirming the withdrawal removes the request from the queue', () =>
      approvalManagementPage.expectNotInQueue(uniquePayer.nameEn));

    await steps.step(
      `Reopening the request shows "${WITHDRAWN_STATUS.en}" / "${WITHDRAWN_STATUS.ar}"`,
      async () => {
        await payerManagementPage.open();
        expect(await payerManagementPage.getApprovalState(uniquePayer.nameEn)).toBe(
          WITHDRAWN_STATUS.en,
        );
      },
    );
  });

  test('TC-007: should refuse the withdrawal when the request has already been decided', async ({
    approvalManagementPage,
    steps,
  }) => {
    // BLOCKED rather than FAIL. This case is about a GUARD on the Withdraw
    // action - that a decided request can no longer be withdrawn. With no
    // Withdraw action anywhere in the application there is no guard to observe:
    // the rule was never exercised, so neither a pass nor a failure would be a
    // true statement about it. TC-006 is where the absence is reported.
    steps.blocked(
      'the application offers no Withdraw action on any payer surface - not on a list row, a '
        + 'version history row, or in the approvals hub - so there is no withdrawal for a '
        + 'decided request to refuse. This case becomes testable once TC-006\'s finding is '
        + 'addressed and a Withdraw action exists.',
    );

    await steps.step('The approvals hub is reachable', () => approvalManagementPage.open());
  });

  test('TC-011: should list all five approval statuses in Arabic when the status filter is opened', async ({
    payerManagementPage,
    languageSwitcher,
    steps,
  }) => {
    let options: string[] = [];

    await steps.critical('Navigate to the Payer Management module', async () => {
      await languageSwitcher.switchTo('en');
      await payerManagementPage.open();
      await payerManagementPage.expectRowsRendered();
    });

    await steps.step('The interface is switched to Arabic', async () => {
      await languageSwitcher.switchTo('ar');
      await languageSwitcher.expectRightToLeft();
    });

    await steps.step('The status filter offers all five approval statuses in Arabic', async () => {
      await payerManagementPage.open();
      options = await payerManagementPage.getFilterOptions('status');
      expect(options.length).toBeGreaterThan(0);
      const missing = EXPECTED_APPROVAL_STATUSES.filter(
        (status) => !options.some((option) => option.includes(status.ar)),
      ).map((status) => `${status.en} (${status.ar})`);
      expect(
        missing,
        `The only status filter on the payer list is the LIFECYCLE filter, which offered `
          + `${JSON.stringify(options)}. There is no approval-status filter, so none of these `
          + 'approval values can be selected.',
      ).toEqual([]);
    });

    await steps.step(`Selecting "${WITHDRAWN_STATUS.ar}" filters the list`, async () => {
      await payerManagementPage.filterByStatus(WITHDRAWN_STATUS.ar);
      await payerManagementPage.expectResultsFound();
    });

    await steps.step(`Every returned record displays "${WITHDRAWN_STATUS.ar}"`, async () => {
      const pairs = await payerManagementPage.getApprovalStatusTonePairs();
      expect(pairs.map((pair) => pair.status).join(' | ')).toContain(WITHDRAWN_STATUS.ar);
    });
  });

  test('TC-012: should offer exactly the five approval statuses when the status dropdown is inspected in both languages', async ({
    payerManagementPage,
    languageSwitcher,
    steps,
  }) => {
    let englishOptions: string[] = [];

    await steps.critical('Navigate to the Payer Management module', async () => {
      await languageSwitcher.switchTo('en');
      await payerManagementPage.open();
      await payerManagementPage.expectRowsRendered();
    });

    await steps.step('The status filter lists its selectable options', async () => {
      englishOptions = await payerManagementPage.getFilterOptions('status');
      expect(englishOptions.length).toBeGreaterThan(0);
    });

    // The count is asserted against the APPROVAL statuses, not just against the
    // number five. The lifecycle filter presents five entries ("All Statuses"
    // plus four lifecycle values), so counting alone would pass while offering
    // none of the values this story is about.
    await steps.step('Exactly the five approval statuses are offered', async () => {
      const selectable = englishOptions.filter((option) => !/^all\b/i.test(option));
      const offered = selectable.filter((option) =>
        EXPECTED_APPROVAL_STATUSES.some((status) => option.includes(status.en)));
      expect(
        offered.length,
        `Of the options offered (${JSON.stringify(selectable)}), these are approval statuses: `
          + `${JSON.stringify(offered)}. The filter is the lifecycle one.`,
      ).toBe(EXPECTED_APPROVAL_STATUSES.length);
    });

    await steps.step('Each of the five checklist values is present exactly once', async () => {
      const duplicated = EXPECTED_APPROVAL_STATUSES.filter(
        (status) => englishOptions.filter((option) => option.includes(status.en)).length > 1,
      ).map((status) => status.en);
      const absent = EXPECTED_APPROVAL_STATUSES.filter(
        (status) => !englishOptions.some((option) => option.includes(status.en)),
      ).map((status) => status.en);
      expect(duplicated, 'No approval status should be listed twice').toEqual([]);
      expect(absent, 'Every approval status on the checklist should be selectable').toEqual([]);
    });

    await steps.step('The same five options appear with correct Arabic labels', async () => {
      await languageSwitcher.switchTo('ar');
      await payerManagementPage.open();
      const arabicOptions = await payerManagementPage.getFilterOptions('status');
      const missing = EXPECTED_APPROVAL_STATUSES.filter(
        (status) => !arabicOptions.some((option) => option.includes(status.ar)),
      ).map((status) => `${status.en} (${status.ar})`);
      expect(missing, `Arabic options offered: ${JSON.stringify(arabicOptions)}`).toEqual([]);
    });
  });

  test('TC-013: should keep every status label correct when the language is toggled while reading a payer\'s history', async ({
    payerManagementPage,
    payerWithVersionStatus,
    languageSwitcher,
    steps,
  }) => {
    let payerName!: string;
    let payerId!: string;

    await steps.critical('Navigate to the Payer Management module', async () => {
      await languageSwitcher.switchTo('en');
      ({ name: payerName, payerId } = await payerWithVersionStatus(APPROVAL_STATUS.superseded.en));
    });

    await steps.step('The payer\'s history is displayed in chronological order', async () => {
      // Opened by ID: the Arabic list renders Arabic payer names, and payer
      // names are not unique, so a name lookup is unreliable in both directions.
      await payerManagementPage.openPayerById(payerId);
      const history = payerManagementPage.detail().versionHistory();
      await history.open();
      await history.expectReverseChronologicalOrder();
    });

    // More than one round trip: a label translated on first render but not
    // re-translated on the way back is a real failure mode that a single toggle
    // cannot see.
    await steps.step('Every entry\'s status label updates correctly on each toggle', async () => {
      for (const language of ['ar', 'en', 'ar'] as const) {
        await languageSwitcher.switchTo(language);
        // By ID on every pass. Reaching the record by name would work in
        // English and silently fail in Arabic, which is precisely the toggle
        // this step is checking.
        await payerManagementPage.openPayerById(payerId);
        const history = payerManagementPage.detail().versionHistory();
        await history.open();
        const statuses = await history.getListedStatuses();
        expect(statuses.length).toBeGreaterThan(0);
        const wrongLanguage = statuses.filter((label) =>
          Object.values(APPROVAL_STATUS).some((status) =>
            language === 'ar' ? status.en === label : status.ar === label));
        expect(
          wrongLanguage,
          `After switching to "${language}" these statuses kept the other language's label`,
        ).toEqual([]);
      }
    });

    await steps.step('The Arabic view renders right to left with no truncated labels', async () => {
      await languageSwitcher.switchTo('ar');
      await languageSwitcher.expectRightToLeft();
      // Opened by ID: the Arabic list renders Arabic payer names, and payer
      // names are not unique, so a name lookup is unreliable in both directions.
      await payerManagementPage.openPayerById(payerId);
      const history = payerManagementPage.detail().versionHistory();
      await history.open();
      await history.expectNoTruncatedCells();
    });

    await steps.step('The most recent entry shows its status beside its timestamp and actor', async () => {
      // Opened by ID: the Arabic list renders Arabic payer names, and payer
      // names are not unique, so a name lookup is unreliable in both directions.
      await payerManagementPage.openPayerById(payerId);
      const history = payerManagementPage.detail().versionHistory();
      await history.open();
      await history.expectEveryEntryComplete();
    });
  });
});
