import { test, expect } from '../../../fixtures';
import { APPROVAL_STATUS, PAYER_COLUMN } from '../../../constants/ElementIds';
import {
  BROKEN_LABEL_PATTERNS,
  EXPECTED_APPROVAL_STATUSES,
  EXPECTED_VOCABULARY,
  WITHDRAWN_STATUS,
} from '../../../data/payers/approvalStatus.data';

/**
 * User story: Provide Arabic Labels for All Approval Status Values, Including
 * Withdrawn.
 *
 * WHERE EACH STATUS LIVES, verified across the live list and a payer's Version
 * History. Getting this wrong is the main way these cases go astray:
 *
 *   Pending Approval, Published  -> the payer LIST's Approval Status cell
 *   Superseded, Rejected         -> a payer's VERSION HISTORY tab only
 *
 * Superseded can never appear on the list, because the list shows a payer's
 * CURRENT version and a current version is by definition not superseded. A case
 * that hunted the list for "a record with status Superseded" would report the
 * environment as lacking data it holds in quantity.
 *
 * THE GOOD NEWS, and it is most of the story: four of the five Arabic labels
 * already match the sheet exactly - بانتظار الموافقة, منشور, مُستبدَل, مرفوض.
 *
 * THE GAP: Withdrawn (مسحوب) does not exist. Verified three ways - the status
 * appears in no list row and no version history; no Withdraw action exists on a
 * list row, a version row, or in the approvals hub; and the only status filter
 * offered is the LIFECYCLE one, not an approval one. So the cases covering it
 * FAIL against a reachable, working screen, which is the correct result: the
 * feature is absent, not unobservable.
 */
test.describe('Provide Arabic Labels for All Approval Status Values - Labels', () => {
  const listStatuses = EXPECTED_APPROVAL_STATUSES.filter(
    (status) => status.surface === 'list' && status.implemented,
  );

  for (const status of listStatuses) {
    test(`${status.caseId}: should display the Arabic label "${status.ar}" when the interface language is Arabic and a payer is ${status.en}`, async ({
      payerManagementPage,
      languageSwitcher,
      steps,
    }) => {
      let recordId!: string;
      let payerCode!: string;

      await steps.critical('Navigate to the Payer Management module', async () => {
        await languageSwitcher.switchTo('en');
        await payerManagementPage.open();
        await payerManagementPage.expectRowsRendered();
      });

      await steps.step(`A payer row showing ${status.en} is on screen`, async () => {
        const pairs = await payerManagementPage.getApprovalStatusTonePairs();
        expect(
          pairs.map((pair) => pair.status).join(' | '),
          `the list should contain at least one payer whose approval status is ${status.en}`,
        ).toContain(status.en);
        // The row is remembered by its RECORD ID, not its name. Payer names are
        // not unique in this register, so re-finding the row by name returns
        // whichever duplicate the search ranks first - which is how this check
        // once read "Pending Approval" from a row it had never looked at. The id
        // is also stable across the language switch below.
        const found = await payerManagementPage.findPayerWithApprovalStatus(status.en);
        recordId = found.recordId;
        // The payer CODE is captured too, and it is what brings the row back after
        // the language switch. The record id stays valid but its PAGE does not:
        // the list orders by name, Arabic names sort differently, and the row
        // moves off page one. The code is identical in both languages.
        payerCode = await payerManagementPage.getPayerCode(found.name);
      });

      await steps.step(`In English the status column reads "${status.en}"`, async () => {
        await languageSwitcher.expectLanguage('en');
        await payerManagementPage.expectCellByIdContains(
          recordId,
          PAYER_COLUMN.approvalStatus,
          status.en,
        );
      });

      await steps.step('Switching to Arabic re-renders the interface right to left', async () => {
        await languageSwitcher.switchTo('ar');
        await languageSwitcher.expectRightToLeft();
      });

      await steps.step(`The same record's status column reads "${status.ar}"`, async () => {
        await payerManagementPage.open();
        await payerManagementPage.search(payerCode);
        await payerManagementPage.expectCellByIdContains(
          recordId,
          PAYER_COLUMN.approvalStatus,
          status.ar,
        );
      });
    });
  }

  const historyStatuses = EXPECTED_APPROVAL_STATUSES.filter(
    (status) => status.surface === 'versionHistory' && status.implemented,
  );

  for (const status of historyStatuses) {
    test(`${status.caseId}: should display the Arabic label "${status.ar}" when the interface language is Arabic and a version is ${status.en}`, async ({
      payerManagementPage,
      payerWithVersionStatus,
      languageSwitcher,
      steps,
    }) => {
      let payerName!: string;
      let payerId!: string;

      await steps.critical('Navigate to the Payer Management module', async () => {
        await languageSwitcher.switchTo('en');
        // A payer with several versions is the precondition here, and it cannot
        // be manufactured cheaply - see the fixture. BLOCKED when none exists.
        ({ name: payerName, payerId } = await payerWithVersionStatus(status.en));
      });

      await steps.step(`A version entry showing ${status.en} is listed`, async () => {
        // Opened by ID, not by name: the Arabic list renders Arabic payer
        // names, so a search for the English name finds nothing once the
        // interface has switched.
        await payerManagementPage.openPayerById(payerId);
        const detail = payerManagementPage.detail();
        const history = detail.versionHistory();
        await history.open();
        const statuses = await history.getListedStatuses();
        expect(
          statuses.join(' | '),
          `"${payerName}" should carry at least one ${status.en} version`,
        ).toContain(status.en);
      });

      await steps.step('Switching to Arabic re-renders the interface right to left', async () => {
        await languageSwitcher.switchTo('ar');
        await languageSwitcher.expectRightToLeft();
      });

      await steps.step(`The version entry's status reads "${status.ar}"`, async () => {
        // Opened by ID, not by name: the Arabic list renders Arabic payer
        // names, so a search for the English name finds nothing once the
        // interface has switched.
        await payerManagementPage.openPayerById(payerId);
        const detail = payerManagementPage.detail();
        const history = detail.versionHistory();
        await history.open();
        const statuses = await history.getListedStatuses();
        expect(statuses.join(' | ')).toContain(status.ar);
      });
    });
  }

  test(`TC-005: should offer Withdrawn with the Arabic label "${WITHDRAWN_STATUS.ar}" when the approval status vocabulary is inspected`, async ({
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

    // Asserted as a VOCABULARY question rather than by hunting for a Withdrawn
    // record. "No record has this status" and "the application has no such
    // status" look identical from the list, and only the second is the defect
    // this story is about - so the check is against the set of statuses the
    // application is capable of emitting.
    await steps.step('The approval status vocabulary includes Withdrawn', async () => {
      const implemented = Object.values(APPROVAL_STATUS).map((status) => status.en);
      expect(
        implemented,
        'The application emits only these approval statuses. "Withdrawn" is required by this '
          + 'story and is absent from the vocabulary entirely - no status value, and no '
          + 'Withdraw action on any payer surface.',
      ).toContain(WITHDRAWN_STATUS.en);
    });

    await steps.step('A record displaying Withdrawn can be found', async () => {
      // Opened by ID: the Arabic list renders Arabic payer names, so the
      // English name captured earlier no longer matches a row.
      await payerManagementPage.openPayerById(payerId);
      const history = payerManagementPage.detail().versionHistory();
      await history.open();
      expect(await history.getListedStatuses()).toContain(WITHDRAWN_STATUS.en);
    });

    await steps.step('Switching to Arabic re-renders the interface', async () => {
      await languageSwitcher.switchTo('ar');
      await languageSwitcher.expectRightToLeft();
    });

    await steps.step(`The status reads "${WITHDRAWN_STATUS.ar}" in Arabic`, async () => {
      // Opened by ID: the Arabic list renders Arabic payer names, so the
      // English name captured earlier no longer matches a row.
      await payerManagementPage.openPayerById(payerId);
      const history = payerManagementPage.detail().versionHistory();
      await history.open();
      expect(await history.getListedStatuses()).toContain(WITHDRAWN_STATUS.ar);
    });
  });

  test('TC-008: should pair every status with its correct Arabic label when all five are compared row by row', async ({
    payerManagementPage,
    payerWithVersionStatus,
    languageSwitcher,
    steps,
  }) => {
    let payerName!: string;
    let payerId!: string;
    let englishLabels: string[] = [];
    let arabicLabels: string[] = [];

    await steps.critical('Navigate to the Payer Management module', async () => {
      await languageSwitcher.switchTo('en');
      ({ name: payerName, payerId } = await payerWithVersionStatus(APPROVAL_STATUS.superseded.en));
    });

    await steps.step('Every English status label on screen is captured', async () => {
      // Opened by ID: the Arabic list renders Arabic payer names, so the
      // English name captured earlier no longer matches a row.
      await payerManagementPage.openPayerById(payerId);
      const history = payerManagementPage.detail().versionHistory();
      await history.open();
      const fromHistory = await history.getListedStatuses();
      await payerManagementPage.open();
      const fromList = (await payerManagementPage.getApprovalStatusTonePairs()).map(
        (pair) => pair.status,
      );
      englishLabels = [...new Set([...fromHistory, ...fromList])];
      expect(englishLabels.length).toBeGreaterThan(0);
    });

    await steps.step('The interface is switched to Arabic', async () => {
      await languageSwitcher.switchTo('ar');
      await languageSwitcher.expectRightToLeft();
    });

    await steps.step('Every Arabic status label on screen is captured', async () => {
      // Opened by ID: the Arabic list renders Arabic payer names, so the
      // English name captured earlier no longer matches a row.
      await payerManagementPage.openPayerById(payerId);
      const history = payerManagementPage.detail().versionHistory();
      await history.open();
      const fromHistory = await history.getListedStatuses();
      await payerManagementPage.open();
      const fromList = (await payerManagementPage.getApprovalStatusTonePairs()).map(
        (pair) => pair.status,
      );
      arabicLabels = [...new Set([...fromHistory, ...fromList])];
      expect(arabicLabels.length).toBeGreaterThan(0);
    });

    // The pairing is asserted against the verified map rather than positionally:
    // the two captures come from different renders, so matching them by index
    // would pair labels by luck.
    await steps.step('All five statuses pair with their expected Arabic labels', async () => {
      const missing = EXPECTED_APPROVAL_STATUSES.filter(
        (status) => !englishLabels.includes(status.en) || !arabicLabels.includes(status.ar),
      ).map((status) => `${status.en} / ${status.ar}`);
      expect(
        missing,
        `Every status in ${JSON.stringify(EXPECTED_VOCABULARY)} should have been observed in `
          + 'both languages. Anything listed here was not displayed at all.',
      ).toEqual([]);
    });
  });

  test('TC-010: should show readable Arabic text for every status when the interface is switched to Arabic', async ({
    payerManagementPage,
    payerWithVersionStatus,
    languageSwitcher,
    steps,
  }) => {
    let payerName!: string;
    let payerId!: string;
    let observed: string[] = [];

    await steps.critical('Navigate to the Payer Management module', async () => {
      await languageSwitcher.switchTo('en');
      ({ name: payerName, payerId } = await payerWithVersionStatus(APPROVAL_STATUS.superseded.en));
    });

    await steps.step('The interface is switched to Arabic', async () => {
      await languageSwitcher.switchTo('ar');
      await languageSwitcher.expectRightToLeft();
    });

    await steps.step(
      'Every status shown in the list, the detail view and the version history is readable Arabic',
      async () => {
        await payerManagementPage.open();
        const fromList = (await payerManagementPage.getApprovalStatusTonePairs()).map(
          (pair) => pair.status,
        );
        // Opened by ID, not by name: the Arabic list renders Arabic payer
        // names, so a search for the English name finds nothing once the
        // interface has switched.
        await payerManagementPage.openPayerById(payerId);
        const detail = payerManagementPage.detail();
        const history = detail.versionHistory();
        await history.open();
        const fromHistory = await history.getListedStatuses();
        observed = [...new Set([...fromList, ...fromHistory])].filter((text) => text !== '');
        expect(observed.length).toBeGreaterThan(0);
        // Readable Arabic means it is not the English label still showing.
        const untranslated = observed.filter((label) =>
          Object.values(APPROVAL_STATUS).some((status) => status.en === label));
        expect(untranslated, 'These statuses are still showing their English labels').toEqual([]);
      },
    );

    await steps.step('No raw translation keys, blank cells or "undefined" values appear', async () => {
      for (const broken of BROKEN_LABEL_PATTERNS) {
        const offenders = observed.filter((label) => broken.pattern.test(label));
        expect(offenders, `No status should render as ${broken.label}`).toEqual([]);
      }
    });
  });
});
