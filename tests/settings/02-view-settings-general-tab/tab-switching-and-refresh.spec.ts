import { test, expect, normalise, otherCurrency } from '../../../utils/settings/writerBHelpers';
import { CASES, CURRENCY_LABEL, TAB_LABEL, TAB_SIGNATURE, VIEW_LABEL, type HubTab } from '../../../data/settings/viewSettingsGeneralTab.data';

/**
 * User story 20865: View Settings - General Tab - the exploratory cases
 * (lead decision 11: exactly the actions each case lists). 21089 switches tabs
 * and checks no content of the previous tab is left. 21090 saves the OTHER
 * currency in a second administrator window (allowed for this case only), then
 * re-opens the tab in the first window; the guard restores the currency
 * straight after the last step.
 */
test.describe('US 20865 - View Settings - General Tab', () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test(`TC-${CASES.tabSwitching.azureId}: should show each tab's own content with no residue when the administrator switches between Settings tabs`, async ({ steps, settingsGuard, settingsView }) => {
    const visited = CASES.tabSwitching.visit;

    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await settingsView.open();
      await expect(settingsView.tabStrip(), 'the Settings tab strip').toBeVisible();
    });

    await steps.step('Open System Settings > Settings - the Settings screen opens on the default (General) tab', async () => {
      const general = await settingsView.tabActiveState('general');
      expect.soft(await settingsView.shows(TAB_SIGNATURE.general), 'the General content on opening').toBe(true);
      expect(general.active, `General marked active on opening (${general.marker})`).toBe(true);
    });

    await steps.step('Select the Two-Factor Authentication and Password Policy tabs - each tab\'s content loads and the tab is clearly marked active', async () => {
      const seen: Record<string, { content: boolean; active: string; generalLeft: boolean }> = {};
      const wanted: Record<string, { content: boolean; active: string; generalLeft: boolean }> = {};
      for (const tab of visited) {
        await settingsView.openTab(tab);
        const state = await settingsView.tabActiveState(tab);
        seen[TAB_LABEL[tab]] = { content: await settingsView.shows(TAB_SIGNATURE[tab]), active: state.active ? 'active' : `NOT active (${state.marker})`, generalLeft: await settingsView.shows(TAB_SIGNATURE.general) };
        wanted[TAB_LABEL[tab]] = { content: true, active: 'active', generalLeft: false };
      }
      expect(seen, 'each tab: its content, its active marking, General content left over').toEqual(wanted);
    });

    await steps.step('Select the General tab - the General content loads, replacing the previous tab\'s content', async () => {
      await settingsView.openTab('general');
      const left = await settingsView.tabsWithContentShown(visited as HubTab[]);
      const general = await settingsView.tabActiveState('general');
      expect.soft(left, 'content of a previous tab still shown on General').toEqual([]);
      expect.soft(general.active, `General marked active (${general.marker})`).toBe(true);
      expect(await settingsView.shows(TAB_SIGNATURE.general), 'the General content').toBe(true);
    });
  });

  test(`TC-${CASES.changedElsewhere.azureId}: should show the currency saved in another session after the General tab is reopened`, async ({ steps, settingsGuard, settingsView, secondAdminWindow }) => {
    const original = settingsGuard.original['Currency.Code'];
    const target = otherCurrency(original);
    const second = await secondAdminWindow();

    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await settingsView.open();
      await expect(settingsView.tabButton('general'), 'the General tab').toBeVisible();
    });

    await steps.critical('Open System Settings > Settings > General tab and note the current Currency value - the current value is recorded', async () => {
      await settingsView.openTab('general');
      const shown = await settingsView.labelValue(VIEW_LABEL.currency);
      expect(normalise(shown), `the currency shown for the stored "${original}"`).toBe(normalise(CURRENCY_LABEL[original] ?? original));
    });

    await steps.critical(`In another session, edit and save a new Currency value (${target.code}) - the change is saved successfully in that session`, async () => {
      await second.view.open();
      const outcome = await second.view.saveCurrency(target.label);
      expect(outcome.status, `the second session's save: toast "${outcome.toast}", answer ${outcome.answer.slice(0, 200)}`).toBe(200);
      expect((await settingsGuard.current())['Currency.Code'], 'the currency stored after the second session saved').toBe(target.code);
    });

    await steps.step('Return to the original session and refresh / reopen the General tab - the tab now reflects the newly saved Currency value', async () => {
      await settingsView.open();
      await settingsView.openTab('general');
      const shown = await settingsView.labelValue(VIEW_LABEL.currency);
      expect(normalise(shown), 'the currency the original session shows after reopening').toBe(normalise(target.label));
    });

    // Short-lived by design: the currency is global (lead safety rule) - put it back now, the guard reads it back again at teardown.
    await second.close();
    await settingsGuard.restoreNow();
  });
});
