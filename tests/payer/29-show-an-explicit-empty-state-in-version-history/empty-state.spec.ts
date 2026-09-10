import { test, expect } from '../../../fixtures';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import {
  APPROVED_COPY_FROM_STORY,
  EMPTY_STATE_COPY,
  EMPTY_STATE_MEANING,
  ERROR_STYLE_MARKERS,
  FAILURE_WORDS,
} from '../../../data/payers/versionHistoryEmptyState.data';

/**
 * User story: Show an Explicit Empty State in Version History.
 *
 * READ THIS BEFORE CHANGING ANYTHING HERE. The obvious model of this screen is
 * wrong, and the first version of this suite was built on it: the tab lists
 * approved versions, so a payer that has never been approved should have none.
 * It does not work that way. A payer's own version is listed from creation, so
 * a brand-new draft shows a table, not the empty state, and every case that
 * expected otherwise failed while the application was behaving correctly.
 *
 * What is actually true, and what these cases are built on:
 *
 *   - No payer reaches the empty state by data. TC-001 goes looking and reports
 *     the result; that is the story's own precondition failing to exist, which
 *     is worth knowing and is not something to assert around.
 *   - The empty state nevertheless EXISTS, and the honest way to reach it is to
 *     answer the versions endpoint with an empty result set. The cases that
 *     examine the panel - its copy, its icon, its layout, whether it resolves -
 *     do that, so they test the application's rendering of an empty history at
 *     the one seam where an empty history occurs.
 *   - It is also what the panel shows when the load FAILS, which is a defect.
 *     That is TC-012's subject, in the edges file, and it is kept strictly
 *     apart from the cases above: the whole point is that the two states must
 *     not look the same.
 */
test.describe('Version history empty state', () => {
  test('TC-001: should state that no history exists when the payer has none', async ({
    payerWithoutVersionHistory,
    payerManagementPage,
    steps,
  }) => {
    let payerName!: string;

    await steps.critical('A payer with no version history is located', async () => {
      // The story's precondition, and the case's real finding. The fixture
      // opens each candidate's history and returns the first that lists
      // nothing; when every payer lists at least its own version it reports
      // BLOCKED naming what it examined, rather than letting the case assert an
      // empty state against a record that legitimately has one.
      payerName = await payerWithoutVersionHistory();
      expect(payerName, 'the fixture should have named the payer it found').not.toBe('');
    });

    await steps.step('Its Version History panel shows an explicit empty state', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(payerName);
      const detail = await payerManagementPage.openDetails(payerName);
      const versions = detail.versionHistory();
      await versions.open();
      expect(
        await versions.isEmptyStateShown(),
        'the panel should say why it is empty, not simply be empty',
      ).toBe(true);
    });

    await steps.step('And it says so in words rather than leaving a blank panel', async () => {
      const versions = payerManagementPage.detail().versionHistory();
      const text = await versions.getEmptyStateText();
      expect(text, 'an empty state with no message is a blank panel').not.toBe('');
      expect(text, `the message should state the absence; it said "${text}"`).toMatch(
        EMPTY_STATE_MEANING,
      );
    });
  });

  test('TC-002: should list the entries and hide the empty state when the payer has history', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module with a payer that has been approved', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.waitForRowVisible(publishedPayer.nameEn);
    });

    await steps.critical('Its detail screen opens', async () => {
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.waitForLoaded();
    });

    await steps.step('The Version History panel lists its versions with dates', async () => {
      const versions = payerManagementPage.detail().versionHistory();
      await versions.open();
      await versions.expectTableVisible();
      const entries = await versions.getEntries();
      expect(entries.length, 'an approved payer should have at least one version').toBeGreaterThan(
        0,
      );
      expect(
        entries.every((entry) => entry.requestedOn.trim().length > 0),
        'every entry should carry the date it was requested',
      ).toBe(true);
    });

    await steps.step('And the empty state is not shown', async () => {
      const versions = payerManagementPage.detail().versionHistory();
      expect(
        await versions.isEmptyStateShown(),
        'a panel with entries must not also claim to be empty',
      ).toBe(false);
    });
  });

  test('TC-003: should word the empty state exactly as the application defines it', async ({
    page,
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and open a payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.waitForLoaded();
    });

    await steps.critical('Its history comes back empty', async () => {
      // An empty RESULT SET, not a failure - the two must be reachable
      // separately or this suite could not tell them apart at all. See
      // NetworkUtils.emptyListEndpoint for why the real envelope is preserved.
      await NetworkUtils.emptyListEndpoint(page, ApiEndpoints.payerVersions);
      await payerManagementPage.detail().reload();
      const versions = payerManagementPage.detail().versionHistory();
      await versions.open();
      expect(await versions.isEmptyStateShown(), 'the empty state should appear').toBe(true);
    });

    await steps.step('The message matches the copy the application ships', async () => {
      // A regression lock on the application's own string. The story's draft
      // copy is quoted in the failure message for comparison: the two differ by
      // one word today, which is a copy-review item and not a defect, so the
      // assertion is against what ships rather than against the sheet.
      const versions = payerManagementPage.detail().versionHistory();
      const text = await versions.getEmptyStateText();
      expect(
        text,
        `the panel said "${text}"; the shipped copy is "${EMPTY_STATE_COPY}" and the story's `
          + `draft wording was "${APPROVED_COPY_FROM_STORY}"`,
      ).toBe(EMPTY_STATE_COPY);
    });

    await steps.step('And it carries no placeholder or debug text', async () => {
      const versions = payerManagementPage.detail().versionHistory();
      const text = (await versions.getEmptyStateText()).toLowerCase();
      for (const marker of ['lorem', 'todo', 'undefined', 'null', '{{']) {
        expect(text, `the copy should not contain "${marker}"`).not.toContain(marker);
      }
    });
  });

  test('TC-004: should resolve to the empty state rather than sit on a spinner', async ({
    page,
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module with a payer whose history is empty', async () => {
      await NetworkUtils.emptyListEndpoint(page, ApiEndpoints.payerVersions);
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.waitForLoaded();
    });

    await steps.step('The panel settles on the empty state, not on a loading indicator', async () => {
      const versions = payerManagementPage.detail().versionHistory();
      await versions.open();
      expect(await versions.isEmptyStateShown(), 'the empty state should appear').toBe(true);
      expect(
        await versions.isStillLoading(),
        'and no loading indicator should be left behind',
      ).toBe(false);
    });

    await steps.step('And it does the same after a reload', async () => {
      // The repeat matters: a panel that resolves only because of a cached
      // response would pass the first check and hang on the second.
      await payerManagementPage.detail().reload();
      const versions = payerManagementPage.detail().versionHistory();
      await versions.open();
      expect(await versions.isEmptyStateShown(), 'consistently, not once').toBe(true);
      expect(await versions.isStillLoading()).toBe(false);
    });
  });

  test('TC-005: should dress the empty state as information rather than as an error', async ({
    page,
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module with a payer whose history is empty', async () => {
      await NetworkUtils.emptyListEndpoint(page, ApiEndpoints.payerVersions);
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.waitForLoaded();
    });

    await steps.critical('The Version History panel shows its empty state', async () => {
      const versions = payerManagementPage.detail().versionHistory();
      await versions.open();
      expect(await versions.isEmptyStateShown()).toBe(true);
    });

    await steps.step('Its styling carries no error or warning markers', async () => {
      const versions = payerManagementPage.detail().versionHistory();
      const appearance = await versions.getEmptyStateAppearance();
      for (const marker of ERROR_STYLE_MARKERS) {
        expect(
          `${appearance.classes} ${appearance.icons.join(' ')}`.toLowerCase(),
          `an absence of history is not a failure, so the panel should not be styled `
            + `"${marker}"`,
        ).not.toContain(marker);
      }
    });

    await steps.step('And its wording does not read as a failure either', async () => {
      const versions = payerManagementPage.detail().versionHistory();
      const text = (await versions.getEmptyStateText()).toLowerCase();
      for (const word of FAILURE_WORDS) {
        expect(text, `"${word}" would make an absence look like a fault`).not.toContain(word);
      }
    });
  });

  test('TC-006: should list a single entry without showing the empty state', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module with a payer approved exactly once', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.waitForLoaded();
    });

    await steps.step('The panel lists its versions rather than nothing', async () => {
      // The boundary is one-versus-none, so the assertion is that the panel is
      // on the "some" side of it. A fixed count would be asserting how many
      // times this payer has been through approval, which is the provisioning
      // fixture's business and not this story's.
      const versions = payerManagementPage.detail().versionHistory();
      await versions.open();
      await versions.expectTableVisible();
      expect(
        await versions.getEntryCount(),
        'a payer that has been approved should have at least one version entry',
      ).toBeGreaterThan(0);
    });

    await steps.step('And the empty state is not shown alongside it', async () => {
      const versions = payerManagementPage.detail().versionHistory();
      expect(
        await versions.isEmptyStateShown(),
        'one entry is not none - the boundary this case exists for',
      ).toBe(false);
    });
  });

  test('TC-007: should replace the empty state with the entries as soon as there are any', async ({
    page,
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module with a payer that has history', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.waitForLoaded();
    });

    await steps.critical('While its history reads as empty, the empty state is shown', async () => {
      await NetworkUtils.emptyListEndpoint(page, ApiEndpoints.payerVersions);
      await payerManagementPage.detail().reload();
      const versions = payerManagementPage.detail().versionHistory();
      await versions.open();
      expect(await versions.isEmptyStateShown(), 'nothing to list yet').toBe(true);
    });

    await steps.step('Once entries exist the panel lists them', async () => {
      // The transition the story asks for. Driven from the data side rather
      // than by putting a payer through approval: what is being verified is
      // that the panel reflects the CURRENT history and does not hold on to an
      // empty state it has already shown - and an approval run would prove that
      // far more slowly while depending on the approval queue behaving.
      await NetworkUtils.restoreEndpoint(page, ApiEndpoints.payerVersions);
      await payerManagementPage.detail().reload();
      const versions = payerManagementPage.detail().versionHistory();
      await versions.open();
      expect(
        await versions.getEntryCount(),
        'the payer has versions, so they should be listed',
      ).toBeGreaterThan(0);
    });

    await steps.step('And the empty state has given way to them', async () => {
      const versions = payerManagementPage.detail().versionHistory();
      expect(
        await versions.isEmptyStateShown(),
        'a panel that keeps its empty state beside real entries is lying about one of them',
      ).toBe(false);
    });
  });
});
