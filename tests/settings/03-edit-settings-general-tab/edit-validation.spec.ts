import { test, expect, normalise, otherTimeZone } from '../../../utils/settings/writerBHelpers';
import { CASES, MESSAGE } from '../../../data/settings/editSettingsGeneralTab.data';

/**
 * User story 20866: Edit Settings - General Tab - one invalid value blocks the
 * whole save. Each case types valid AND invalid values, presses Save, and
 * expects: no request accepted, the drawer still open, the invalid field's
 * message, and NOTHING stored changed (settingsGuard.current() equals the
 * snapshot). Should the drawer save anyway, that is the finding - the guard
 * restores and reads back every key at teardown.
 */
test.describe('US 20866 - Edit Settings - General Tab', () => {
  test.describe.configure({ timeout: 3 * 60_000 });

  test(`TC-${CASES.oneInvalidBlocks.azureId}: should save nothing and keep the panel open with the rate's error when a valid title is saved with an out-of-range rate`, async ({ steps, settingsGuard, settingsView }) => {
    const d = CASES.oneInvalidBlocks;

    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await settingsView.open();
      await expect(settingsView.editButton(), 'the Edit button').toBeVisible();
    });

    await steps.critical('Open System Settings > Settings > General tab and select Edit - the Edit Setting side panel opens', async () => {
      await settingsView.openEdit();
      await expect(settingsView.drawerTitle(), 'the Edit Setting drawer').toBeVisible();
    });

    await steps.step(`Change Site Title to a valid new value and Exchange Rate to an invalid out-of-range value (${d.rate}) - both fields show their newly entered values`, async () => {
      await settingsView.setSiteTitle(d.title);
      await settingsView.setRate(d.rate);
      const v = await settingsView.drawerValues();
      expect({ title: v.title, rate: v.rate }, 'what the two fields show').toEqual({ title: d.title, rate: d.rate });
    });

    await steps.step('Select Save - the save is blocked: nothing is saved, the panel stays open and only the Exchange Rate error shows', async () => {
      const outcome = await settingsView.saveAndCapture();
      const messages = normalise(`${outcome.toast} | ${await settingsView.messagesShown()}`);
      const said = `Save -> ${outcome.status ?? 'no request'}, sent ${JSON.stringify(outcome.sent?.settings ?? null).slice(0, 200)}, answer ${outcome.answer.slice(0, 160)}; shown: ${messages.slice(0, 300)}`;
      expect.soft(outcome.status === null || outcome.status >= 400, `the save should be blocked - ${said}`).toBe(true);
      expect.soft(outcome.drawerOpen, `the drawer after Save - ${said}`).toBe(true);
      expect.soft(messages, 'the Exchange Rate error').toContain(MESSAGE.rateInvalid);
      expect.soft(messages, 'the Site Title error (the title is valid)').not.toContain(MESSAGE.titleInvalid);
      expect(await settingsGuard.current(), `the stored settings after the blocked save - ${said}`).toEqual(settingsGuard.original);
    });
  });

  test(`TC-${CASES.mixedInvalid.azureId}: should save none of the edits on any attempt when valid and invalid values across sections are saved repeatedly`, async ({ steps, settingsGuard, settingsView, settingsPage }) => {
    const d = CASES.mixedInvalid;
    const zone = otherTimeZone(settingsGuard.original['Site.TimeZone']);

    await steps.critical('Navigate to the System Setting Management module - the module landing page loads', async () => {
      await settingsView.open();
      await expect(settingsView.editButton(), 'the Edit button').toBeVisible();
    });

    await steps.critical('Open System Settings > Settings > General tab and select Edit - the Edit Setting side panel opens', async () => {
      await settingsView.openEdit();
      await expect(settingsView.drawerTitle(), 'the Edit Setting drawer').toBeVisible();
    });

    await steps.step(`Rapidly change Time Zone (${zone.label}, valid), Site Title (${d.title.length} characters, invalid), Exchange Rate (${d.rate}, invalid) and the Policy status clock (${d.jobTime}, valid) - all four fields display their newly entered values`, async () => {
      await settingsView.pick('timeZoneSelect', zone.label, zone.filter);
      await settingsView.setSiteTitle(d.title);
      await settingsView.setRate(d.rate);
      await settingsPage.setJobTime(d.job, d.jobTime);
      const v = await settingsView.drawerValues();
      expect({ timeZone: v.timeZone, title: v.title, rate: v.rate, clock: v.jobs[d.job].time }, 'what the four fields show')
        .toEqual({ timeZone: normalise(zone.label), title: d.title, rate: d.rate, clock: d.jobTime });
    });

    await steps.step(`Select Save ${d.saves} times in quick succession - the save stays blocked on every attempt, both errors show, nothing is saved`, async () => {
      const r = await settingsView.saveRepeatedly(d.saves);
      const said = `${r.clicked}/${r.attempts} clicks; answers [${r.answers.map((a) => `${a.status} ${a.keys.join('+')}`).join('; ') || 'none'}]; shown: ${r.messages.slice(0, 300)}`;
      expect.soft(r.answers.filter((a) => a.status < 400).length, `accepted saves - ${said}`).toBe(0);
      expect.soft(r.drawerOpen, `the drawer after the saves - ${said}`).toBe(true);
      expect.soft(r.messages, 'the Site Title error').toContain(MESSAGE.titleInvalid);
      expect.soft(r.messages, 'the Exchange Rate error').toContain(MESSAGE.rateInvalid);
      expect(await settingsGuard.current(), `the stored settings after the blocked saves - ${said}`).toEqual(settingsGuard.original);
    });
  });
});
