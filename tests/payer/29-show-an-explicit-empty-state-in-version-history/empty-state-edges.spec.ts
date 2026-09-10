import { test, expect } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import {
  EMPTY_STATE_COPY,
  FAILURE_WORDS,
  MATRIX_SAMPLE_SIZE,
  RESTRICTED_ROLE_REQUIREMENT,
  SWITCH_ROUNDS,
} from '../../../data/payers/versionHistoryEmptyState.data';

/**
 * User story: Show an Explicit Empty State in Version History.
 * The state matrix, the failure path, and access control.
 *
 * TC-012 is the case that matters here, and it is expected to FAIL. The panel
 * shows its no-history message when the versions request fails, so a reviewer
 * whose request errored is told the payer has no version history - a false
 * statement about the record rather than a report of a failed load. That is the
 * exact confusion this story exists to prevent, which is why the case asserts
 * against it rather than accommodating it.
 */
test.describe('Version history empty state - Edges', () => {
  test('TC-008: should match each payer to its own history state, whatever its status', async ({
    payerManagementPage,
    payerSample,
    draftPayer,
    publishedPayer,
    steps,
  }) => {
    const observed: { label: string; entries: number; empty: boolean }[] = [];

    const readPanel = async (label: string, name: string): Promise<void> => {
      await payerManagementPage.open();
      await payerManagementPage.search(name);
      const detail = await payerManagementPage.openDetails(name);
      const versions = detail.versionHistory();
      await versions.open();
      observed.push({
        label,
        entries: await versions.getEntryCount(),
        empty: await versions.isEmptyStateShown(),
      });
    };

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.expectRowsRendered();
    });

    await steps.step('An Active payer with history lists its versions', async () => {
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
      await readPanel('Active, approved', publishedPayer.nameEn);
      expect(observed.at(-1)!.entries, 'it should list its approved version').toBeGreaterThan(0);
    });

    await steps.step('A never-approved draft lists its own version, not an empty state', async () => {
      // The correction at the heart of this suite. A draft was taken to be the
      // empty case; it is not - its own version is listed from creation, which
      // is why the empty state cannot be reached by data at all.
      await readPanel('never approved (draft)', draftPayer.nameEn);
      const draft = observed.at(-1)!;
      expect(
        draft.entries,
        'a payer lists its own version from the moment it exists, approved or not',
      ).toBeGreaterThan(0);
      expect(draft.empty, 'so the empty state must not be shown for it either').toBe(false);
    });

    await steps.step('An Inactive payer with history lists its versions too', async () => {
      // The status must not change the answer: the panel reports the payer's
      // version history, which has nothing to do with whether it is live.
      const [inactiveName] = await payerSample(
        'Inactive',
        LIFECYCLE_STATUS.inactive.en,
        MATRIX_SAMPLE_SIZE,
      );
      await readPanel('Inactive, approved', inactiveName);
      expect(
        observed.at(-1)!.empty,
        'an inactive payer that has been approved has history like any other',
      ).toBe(false);
    });

    await steps.step('Every payer got a listing, and none got the empty state', async () => {
      const summary = observed
        .map((o) => `${o.label} -> ${o.entries} entr${o.entries === 1 ? 'y' : 'ies'}`)
        .join('; ');
      expect(
        observed.filter((o) => o.empty).map((o) => o.label),
        `no payer state reaches the empty state; observed: ${summary}`,
      ).toEqual([]);
      expect(
        observed.every((o) => o.entries > 0),
        `every payer should list at least its own version; observed: ${summary}`,
      ).toBe(true);
    });
  });

  test('TC-010: should present the empty panel with a message, an icon and a consistent layout', async ({
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

    await steps.critical('The empty panel loads', async () => {
      const versions = payerManagementPage.detail().versionHistory();
      await versions.open();
      expect(await versions.isEmptyStateShown()).toBe(true);
    });

    await steps.step('It carries the message', async () => {
      const versions = payerManagementPage.detail().versionHistory();
      expect(await versions.getEmptyStateText()).toBe(EMPTY_STATE_COPY);
    });

    await steps.step('It carries an icon', async () => {
      const versions = payerManagementPage.detail().versionHistory();
      const appearance = await versions.getEmptyStateAppearance();
      expect(
        appearance.icons,
        `the empty state should be illustrated, as the application's other empty states are; `
          + `classes: "${appearance.classes}"`,
      ).not.toEqual([]);
    });

    await steps.step('And it sits inside the versions panel rather than replacing the screen', async () => {
      // The layout half of the checklist, asserted structurally: the tab strip
      // and the payer's own header must still be there, so the empty state is a
      // panel state rather than an error page.
      const detail = payerManagementPage.detail();
      await detail.expectAllTabsEnabled();
      expect(
        await detail.getName(),
        'the payer header should still identify the record',
      ).not.toBe('');
    });
  });

  test('TC-011: should follow the current history rather than keep a stale empty state', async ({
    page,
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    const sequence: boolean[] = [];

    await steps.critical('Navigate to the module and open a payer with history', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.waitForLoaded();
    });

    await steps.step('The panel is reopened repeatedly, empty and populated in turn', async () => {
      // Alternating the SERVER's answer rather than the payer, because that is
      // the question: does the panel render the response it just received, or
      // the state it happened to be in before? Switching payers would have
      // tested the same thing only if two payers differed in emptiness, and
      // none does - no payer has an empty history.
      for (let round = 0; round < SWITCH_ROUNDS; round += 1) {
        await NetworkUtils.emptyListEndpoint(page, ApiEndpoints.payerVersions);
        await payerManagementPage.detail().reload();
        let versions = payerManagementPage.detail().versionHistory();
        await versions.open();
        sequence.push(await versions.isEmptyStateShown());

        await NetworkUtils.restoreEndpoint(page, ApiEndpoints.payerVersions);
        await payerManagementPage.detail().reload();
        versions = payerManagementPage.detail().versionHistory();
        await versions.open();
        sequence.push(await versions.isEmptyStateShown());
      }
      expect(sequence, 'both readings should have been taken each round').toHaveLength(
        SWITCH_ROUNDS * 2,
      );
    });

    await steps.step('Every reading matched the history the panel had just been given', async () => {
      const expected = Array.from({ length: SWITCH_ROUNDS * 2 }, (_, index) => index % 2 === 0);
      expect(
        sequence,
        `expected the empty state to follow the response; got: ${sequence
          .map((empty) => (empty ? 'empty' : 'listed'))
          .join(' -> ')}`,
      ).toEqual(expected);
    });
  });

  test('TC-012: should report a load failure distinctly from an absence of history', async ({
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

    await steps.critical('The history endpoint is made to fail', async () => {
      // The versions feed specifically - failing anything broader would break
      // the navigation that reaches this screen, which is why this endpoint is
      // named in ApiEndpoints in the first place.
      await NetworkUtils.failEndpoint(page, ApiEndpoints.payerVersions);
    });

    await steps.step('Opening the panel attempts the load and does not hang', async () => {
      const versions = payerManagementPage.detail().versionHistory();
      await payerManagementPage.detail().reload();
      await versions.open().catch(() => undefined);
      expect(
        await versions.isStillLoading(),
        'a failed load should resolve rather than spin forever',
      ).toBe(false);
    });

    await steps.step('The panel does not present the failure as an absence of history', async () => {
      // KNOWN DEFECT, and the reason this case exists. The panel shows its
      // no-history message for a request that returned 500: the reviewer is
      // told this payer has no version history when in truth the history could
      // not be loaded. Two different facts, one message.
      //
      // A tolerant assertion here would be the wrong call - it would hide the
      // one finding the story was written to surface - so this fails until the
      // panel distinguishes them.
      const versions = payerManagementPage.detail().versionHistory();
      const shownEmpty = await versions.isEmptyStateShown();
      if (!shownEmpty) {
        const messages = await payerManagementPage.detail().waitForVisibleMessages();
        expect(messages, 'a failed load should say so somewhere on screen').not.toEqual([]);
        return;
      }
      const text = (await versions.getEmptyStateText()).toLowerCase();
      expect(
        FAILURE_WORDS.some((word) => text.includes(word)),
        `the panel showed the no-history message ("${text}") for a load that FAILED - an `
          + 'absence and a failure must not look the same, and a payer with versions was '
          + 'reported as having none',
      ).toBe(true);
    });

    await steps.step('And the panel recovers once the endpoint does', async () => {
      await NetworkUtils.restoreEndpoint(page, ApiEndpoints.payerVersions);
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const versions = detail.versionHistory();
      await versions.open();
      expect(
        await versions.getEntryCount(),
        'the history should load normally again',
      ).toBeGreaterThan(0);
    });
  });
});

/** Access control, signed out of the shared administrator session. */
test.describe('Version history empty state - Access control', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('TC-009: should withhold the Version History tab from a user without history rights', async ({
    loginPage,
    payerManagementPage,
    steps,
  }) => {
    if (!env.nonAdminUsername || !env.nonAdminPassword) {
      steps.blocked(
        `NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD are not configured in .env. ${
          RESTRICTED_ROLE_REQUIREMENT.reason
        } Set them to an account holding ${RESTRICTED_ROLE_REQUIREMENT.role}, then re-run this `
          + 'case.',
      );
    }

    let payerName!: string;

    await steps.critical('Open the payer list as the restricted user', async () => {
      await loginPage.open();
      await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);
      await payerManagementPage.navigate();
      await payerManagementPage.expectRowsRendered();
      payerName = (await payerManagementPage.getVisiblePayerNames())[0];
      expect(payerName, 'the restricted user should see at least one payer').not.toBe(undefined);
    });

    await steps.step('The Version History tab is withheld or refuses access', async () => {
      const detail = await payerManagementPage.openDetails(payerName);
      const versions = detail.versionHistory();
      expect(
        await versions.isAvailable(),
        'a role without history rights should not be offered the tab',
      ).toBe(false);
    });
  });
});
