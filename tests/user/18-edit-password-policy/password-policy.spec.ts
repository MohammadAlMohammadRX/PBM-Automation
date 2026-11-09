import { test, expect } from '../../../fixtures';
import type { Page } from '@playwright/test';
import { PASSWORD_POLICY, type PolicyFlagField, type PolicyNumberField } from '../../../constants/user/userIds';
import { CASES, FLAG_LABEL, FORCE_EFFECT_BLOCKED } from '../../../data/user/editPasswordPolicy.data';
import type { PasswordPolicyTab } from '../../../pages/user/PasswordPolicyTab';
import { clickDialogAction, readDialog } from '../../../pages/user/userCommon';
import { readPasswordPolicy, type PasswordPolicy } from '../../../utils/UserProvisioning';
import { ensurePolicyDrawer, pasteIntoPolicyBox, policyDrawerClosed } from '../../../utils/user/writerFHelpers';

/** The read view's label of each number box. */
const NUMBER_LABEL: Record<PolicyNumberField, string> = {
  requiredLength: 'Minimum length',
  maximumLength: 'Maximum length',
  requiredUniqueChars: 'Minimum distinct characters',
  passwordHistoryCount: 'Passwords remembered',
  expiryDays: 'Password expires after (days)',
};

const NUMBER_FIELDS = Object.keys(NUMBER_LABEL) as PolicyNumberField[];
const FLAG_FIELDS = Object.keys(PASSWORD_POLICY.checkbox) as PolicyFlagField[];

/** Every number box and checkbox of the drawer, as typed in the stored policy. */
async function readDrawer(tab: PasswordPolicyTab): Promise<Partial<PasswordPolicy>> {
  const out: Record<string, number | boolean> = {};
  for (const f of NUMBER_FIELDS) out[f] = Number(await tab.readNumber(f));
  for (const f of FLAG_FIELDS) out[f] = await tab.isFlagTicked(f);
  return out as Partial<PasswordPolicy>;
}

/** The same fields of the stored policy. */
function pick(policy: PasswordPolicy): Partial<PasswordPolicy> {
  const out: Record<string, number | boolean> = {};
  for (const f of NUMBER_FIELDS) out[f] = policy[f];
  for (const f of FLAG_FIELDS) out[f] = policy[f];
  return out as Partial<PasswordPolicy>;
}

/** Save -> the answer, whether the drawer closed, and the policy stored afterwards. */
async function saveAndReadBack(tab: PasswordPolicyTab, page: Page): Promise<{ status: number; messages: string[]; errors: string[]; closed: boolean; stored: PasswordPolicy }> {
  const r = await tab.save();
  const closed = r.status === 200 ? await policyDrawerClosed(page) : !(await tab.isDrawerOpen());
  return { status: r.status, messages: r.messages, errors: r.errors, closed, stored: await readPasswordPolicy(page) };
}

/** Cancels the drawer, discarding an Unsaved Changes prompt when one is raised. */
async function cancelDrawer(tab: PasswordPolicyTab, page: Page): Promise<void> {
  await tab.cancel();
  if ((await readDialog(page)).visible) await clickDialogAction(page, 'discard').catch(() => undefined);
}

/**
 * User story 20426: Edit Password Policy - the admin's edits that SAVE (and
 * the read-only checks). The policy is GLOBAL: every test snapshots it through
 * `settingsRestore` BEFORE any Save, restores it explicitly at its end, and
 * the fixture restores + reads back again at teardown (a failed restore
 * fails the test). Range errors: password-policy-validation.spec.ts; the
 * policy's effect on users: password-policy-effect.spec.ts; the permission
 * case: password-policy-permission.spec.ts.
 */
test.describe('US 20426 - Edit Password Policy', () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test(`TC-${CASES.updatePolicy.azureId}: should save and show the new minimum length, remembered count and expiry with no confirmation when valid values are saved`, async ({ page, steps, passwordPolicyTab, settingsRestore }) => {
    const before = await settingsRestore.snapshotPolicy();
    const d = CASES.updatePolicy.changes;

    await steps.critical('Navigate to the User Management module - the System Settings area is accessible', async () => {
      await passwordPolicyTab.open();
      expect(await passwordPolicyTab.isTabOffered(), 'the Password Policy tab').toBe(true);
    });

    await steps.step('Open System Settings and select the Password Policy tab - the current policy values display with an Edit button', async () => {
      const view = await passwordPolicyTab.readView();
      expect(Object.fromEntries(NUMBER_FIELDS.map((f) => [f, view[NUMBER_LABEL[f]]])), 'the values shown').toEqual(Object.fromEntries(NUMBER_FIELDS.map((f) => [f, String(before[f])])));
      expect(await passwordPolicyTab.isEditOffered(), 'the Edit button').toBe(true);
    });

    await steps.critical('Select Edit - the "Edit Password Policy" drawer opens pre-filled with the current values', async () => {
      await passwordPolicyTab.openEdit();
      expect(await readDrawer(passwordPolicyTab), 'the drawer values').toEqual(pick(before));
    });

    await steps.step('Update Minimum length, Passwords remembered, and Password expires after (days) to valid values within range - the fields accept the new values', async () => {
      for (const [f, v] of Object.entries(d) as [PolicyNumberField, string][]) await passwordPolicyTab.typeNumber(f, v);
      expect({
        requiredLength: await passwordPolicyTab.readNumber('requiredLength'),
        passwordHistoryCount: await passwordPolicyTab.readNumber('passwordHistoryCount'),
        expiryDays: await passwordPolicyTab.readNumber('expiryDays'),
      }, 'the boxes').toEqual(d);
    });

    await steps.step('Select Save - the policy is saved, the new values are displayed, and no confirmation message is shown', async () => {
      const saved = await saveAndReadBack(passwordPolicyTab, page);
      expect({ status: saved.status, closed: saved.closed, messages: saved.messages }, `the Save (errors ${JSON.stringify(saved.errors)})`).toEqual({ status: 200, closed: true, messages: [] });
      expect({ requiredLength: saved.stored.requiredLength, passwordHistoryCount: saved.stored.passwordHistoryCount, expiryDays: saved.stored.expiryDays }, 'the stored policy').toEqual({ requiredLength: 10, passwordHistoryCount: 5, expiryDays: 90 });
      await expect.poll(async () => (await passwordPolicyTab.readView())['Minimum length'], { message: 'Minimum length on the tab', timeout: 10_000 }).toBe(d.requiredLength);
    });
    await settingsRestore.restorePolicyNow();
  });

  test(`TC-${CASES.prefilled.azureId}: should pre-fill every drawer field with the saved policy when Edit is selected`, async ({ page, steps, passwordPolicyTab, settingsRestore }) => {
    await settingsRestore.snapshotPolicy();

    await steps.critical('Navigate to the User Management module - the Password Policy tab is accessible', async () => {
      await passwordPolicyTab.open();
      expect(await passwordPolicyTab.isEditOffered(), 'the Edit button').toBe(true);
    });

    await steps.critical('Select Edit - the "Edit Password Policy" drawer opens', async () => {
      await passwordPolicyTab.openEdit();
      expect(await passwordPolicyTab.isDrawerOpen(), 'the drawer').toBe(true);
    });

    await steps.step('Compare each field’s displayed value against the currently saved policy - every field matches the saved policy exactly before any edits are made', async () => {
      expect(await readDrawer(passwordPolicyTab), 'the drawer values').toEqual(pick(await readPasswordPolicy(page)));
      await cancelDrawer(passwordPolicyTab, page);
    });
  });

  test(`TC-${CASES.minLengthBounds.azureId}: should accept and save a minimum length of 8 and then 16 when each boundary is saved`, async ({ page, steps, passwordPolicyTab, settingsRestore }) => {
    await settingsRestore.snapshotPolicy();
    const d = CASES.minLengthBounds;

    await steps.critical('Navigate to the User Management module - the Password Policy tab is accessible', async () => {
      await passwordPolicyTab.open();
      expect(await passwordPolicyTab.isEditOffered(), 'the Edit button').toBe(true);
    });

    await steps.critical('Select Edit - the drawer opens', async () => {
      await passwordPolicyTab.openEdit();
      expect(await passwordPolicyTab.isDrawerOpen(), 'the drawer').toBe(true);
    });

    await steps.step(`Set Minimum length to ${d.low} and select Save - the value is accepted and saved`, async () => {
      await passwordPolicyTab.typeNumber('requiredLength', d.low);
      const saved = await saveAndReadBack(passwordPolicyTab, page);
      expect({ status: saved.status, stored: saved.stored.requiredLength }, `the Save (errors ${JSON.stringify(saved.errors)})`).toEqual({ status: 200, stored: Number(d.low) });
    });

    await steps.step(`Reopen Edit and set Minimum length to ${d.high} and select Save - the value is accepted and saved`, async () => {
      await ensurePolicyDrawer(passwordPolicyTab);
      await passwordPolicyTab.typeNumber('requiredLength', d.high);
      const saved = await saveAndReadBack(passwordPolicyTab, page);
      expect({ status: saved.status, stored: saved.stored.requiredLength }, `the Save (errors ${JSON.stringify(saved.errors)})`).toEqual({ status: 200, stored: Number(d.high) });
    });
    await settingsRestore.restorePolicyNow();
  });

  test(`TC-${CASES.distinctBounds.azureId}: should accept minimum distinct characters of 1 and of 16 when the minimum length is 16`, async ({ page, steps, passwordPolicyTab, settingsRestore }) => {
    await settingsRestore.snapshotPolicy();
    const d = CASES.distinctBounds;

    await steps.critical('Navigate to the User Management module - the Password Policy tab is accessible', async () => {
      await passwordPolicyTab.open();
      expect(await passwordPolicyTab.isEditOffered(), 'the Edit button').toBe(true);
    });

    await steps.critical('Select Edit - the drawer opens', async () => {
      await passwordPolicyTab.openEdit();
      expect(await passwordPolicyTab.isDrawerOpen(), 'the drawer').toBe(true);
    });

    await steps.step(`Set Minimum distinct characters to ${d.low} (Minimum length ${d.minLength}) and select Save - the value is accepted and saved`, async () => {
      await passwordPolicyTab.typeNumber('requiredLength', d.minLength);
      await passwordPolicyTab.typeNumber('requiredUniqueChars', d.low);
      const saved = await saveAndReadBack(passwordPolicyTab, page);
      expect({ status: saved.status, minLength: saved.stored.requiredLength, distinct: saved.stored.requiredUniqueChars }, `the Save (errors ${JSON.stringify(saved.errors)})`)
        .toEqual({ status: 200, minLength: Number(d.minLength), distinct: Number(d.low) });
    });

    await steps.step(`Reopen Edit, set Minimum distinct characters to ${d.high} while Minimum length is ${d.minLength}, and select Save - the value is accepted and saved`, async () => {
      await ensurePolicyDrawer(passwordPolicyTab);
      expect(await passwordPolicyTab.readNumber('requiredLength'), 'Minimum length in the drawer').toBe(d.minLength);
      await passwordPolicyTab.typeNumber('requiredUniqueChars', d.high);
      const saved = await saveAndReadBack(passwordPolicyTab, page);
      expect({ status: saved.status, distinct: saved.stored.requiredUniqueChars }, `the Save (errors ${JSON.stringify(saved.errors)})`).toEqual({ status: 200, distinct: Number(d.high) });
    });
    await settingsRestore.restorePolicyNow();
  });

  test(`TC-${CASES.characterFlags.azureId}: should save and show each character requirement as Yes or No when the checkboxes are toggled`, async ({ page, steps, passwordPolicyTab, settingsRestore }) => {
    await settingsRestore.snapshotPolicy();
    const final = CASES.characterFlags.final;
    const flags = Object.keys(final) as (keyof typeof final)[];

    await steps.critical('Navigate to the User Management module - the Password Policy tab is accessible', async () => {
      await passwordPolicyTab.open();
      expect(await passwordPolicyTab.isEditOffered(), 'the Edit button').toBe(true);
    });

    await steps.critical('Select Edit - the drawer opens', async () => {
      await passwordPolicyTab.openEdit();
      expect(await passwordPolicyTab.isDrawerOpen(), 'the drawer').toBe(true);
    });

    await steps.step('Toggle Require an uppercase letter, lowercase letter, digit and symbol checkboxes on and off individually - each checkbox reflects Yes when checked and No when unchecked', async () => {
      const seen: Record<string, boolean[]> = {};
      for (const f of flags) {
        await passwordPolicyTab.setFlag(f, true);
        const on = await passwordPolicyTab.isFlagTicked(f);
        await passwordPolicyTab.setFlag(f, false);
        const off = await passwordPolicyTab.isFlagTicked(f);
        await passwordPolicyTab.setFlag(f, final[f]);
        seen[f] = [on, off, await passwordPolicyTab.isFlagTicked(f)];
      }
      expect(seen, 'ticks after on / off / chosen').toEqual(Object.fromEntries(flags.map((f) => [f, [true, false, final[f]]])));
    });

    await steps.step('Select Save - the saved policy tab displays each requirement’s chosen Yes/No state', async () => {
      const saved = await saveAndReadBack(passwordPolicyTab, page);
      expect(saved.status, `the Save (errors ${JSON.stringify(saved.errors)})`).toBe(200);
      expect(Object.fromEntries(flags.map((f) => [f, saved.stored[f]])), 'the stored requirements').toEqual({ ...final });
      await expect.poll(async () => {
        const view = await passwordPolicyTab.readView();
        return Object.fromEntries(flags.map((f) => [f, view[FLAG_LABEL[f]]]));
      }, { message: 'the requirements on the tab', timeout: 10_000 }).toEqual(Object.fromEntries(flags.map((f) => [f, final[f] ? 'Yes' : 'No'])));
    });
    await settingsRestore.restorePolicyNow();
  });

  test(`TC-${CASES.forceChange.azureId}: should save the force-change setting on and off and force a change of system-issued passwords only when it is on`, async ({ page, steps, passwordPolicyTab, settingsRestore }) => {
    await settingsRestore.snapshotPolicy();
    const toggle = async (value: boolean): Promise<void> => {
      await ensurePolicyDrawer(passwordPolicyTab);
      await passwordPolicyTab.setFlag('requireChangeForNewUsers', value);
      const saved = await saveAndReadBack(passwordPolicyTab, page);
      expect({ status: saved.status, stored: saved.stored.requireChangeForNewUsers }, `the Save (errors ${JSON.stringify(saved.errors)})`).toEqual({ status: 200, stored: value });
      await expect.poll(async () => (await passwordPolicyTab.readView())['Force a change on system-issued passwords'], { message: 'the setting on the tab', timeout: 10_000 }).toBe(value ? 'Yes' : 'No');
    };

    await steps.critical('Navigate to the User Management module - the Password Policy tab is accessible', async () => {
      await passwordPolicyTab.open();
      expect(await passwordPolicyTab.isEditOffered(), 'the Edit button').toBe(true);
    });

    await steps.step('Select Edit, enable "Force a change on system-issued passwords", and select Save - the setting is saved as enabled', async () => {
      await toggle(true);
      expect(await passwordPolicyTab.isDrawerOpen(), 'the drawer after Save').toBe(false);
    });

    await steps.step('Repeat with the checkbox disabled and select Save - the setting is saved as disabled', async () => {
      await toggle(false);
      expect(await passwordPolicyTab.isDrawerOpen(), 'the drawer after Save').toBe(false);
    });
    await settingsRestore.restorePolicyNow();
    steps.blocked(FORCE_EFFECT_BLOCKED);
  });

  for (const c of [
    { data: CASES.rememberedBounds, field: 'passwordHistoryCount' as const, what: 'remembered passwords', zero: 'Reuse allowed' },
    { data: CASES.expiryBounds, field: 'expiryDays' as const, what: 'expiry days', zero: 'Never expires' },
  ]) {
    test(`TC-${c.data.azureId}: should show "${c.zero}" for 0 and accept ${c.data.high} when the ${c.what} boundaries are saved`, async ({ page, steps, passwordPolicyTab, settingsRestore }) => {
      await settingsRestore.snapshotPolicy();
      const label = NUMBER_LABEL[c.field];

      await steps.critical('Navigate to the User Management module - the Password Policy tab is accessible', async () => {
        await passwordPolicyTab.open();
        expect(await passwordPolicyTab.isEditOffered(), 'the Edit button').toBe(true);
      });

      await steps.critical('Select Edit - the drawer opens', async () => {
        await passwordPolicyTab.openEdit();
        expect(await passwordPolicyTab.isDrawerOpen(), 'the drawer').toBe(true);
      });

      await steps.step(`Set ${label} to ${c.data.low} and select Save - the Password Policy tab displays "${c.data.lowShown}" for this field`, async () => {
        await passwordPolicyTab.typeNumber(c.field, c.data.low);
        const saved = await saveAndReadBack(passwordPolicyTab, page);
        expect({ status: saved.status, stored: saved.stored[c.field] }, `the Save (errors ${JSON.stringify(saved.errors)})`).toEqual({ status: 200, stored: Number(c.data.low) });
        await expect.poll(async () => (await passwordPolicyTab.readView())[label], { message: `${label} on the tab`, timeout: 10_000 }).toBe(c.data.lowShown);
      });

      await steps.step(`Reopen Edit, set ${label} to ${c.data.high}, and select Save - the value is accepted and displayed as ${c.data.high}`, async () => {
        await ensurePolicyDrawer(passwordPolicyTab);
        await passwordPolicyTab.typeNumber(c.field, c.data.high);
        const saved = await saveAndReadBack(passwordPolicyTab, page);
        expect({ status: saved.status, stored: saved.stored[c.field] }, `the Save (errors ${JSON.stringify(saved.errors)})`).toEqual({ status: 200, stored: Number(c.data.high) });
        await expect.poll(async () => (await passwordPolicyTab.readView())[label], { message: `${label} on the tab`, timeout: 10_000 }).toBe(c.data.high);
      });
      await settingsRestore.restorePolicyNow();
    });
  }

  test(`TC-${CASES.whenItApplies.azureId}: should state that the policy applies to every new password and existing ones are not revalidated when the tab is read`, async ({ steps, passwordPolicyTab }) => {
    const d = CASES.whenItApplies;
    let text = '';

    await steps.critical('Navigate to the User Management module - the Password Policy tab is accessible', async () => {
      await passwordPolicyTab.open();
      expect(await passwordPolicyTab.isTabOffered(), 'the Password Policy tab').toBe(true);
    });

    await steps.step('Open the Password Policy tab and locate the "When it applies" text - the text is visible under the policy fields', async () => {
      const view = await passwordPolicyTab.readView();
      text = view['When it applies'] ?? '';
      expect(text, 'the "When it applies" text').not.toBe('');
      expect(view['Password expires after (days)'] ?? '', 'the policy fields above it').not.toBe('');
    });

    await steps.step('Read the text content - it states the policy applies immediately to every new password and that existing passwords are not revalidated', async () => {
      expect({ immediately: d.immediately.test(text), notRevalidated: d.notRevalidated.test(text) }, `"${text}"`).toEqual({ immediately: true, notRevalidated: true });
    });
  });

  test(`TC-${CASES.exploratory.azureId}: should reject or flag odd input, show no stale values and save coherent combinations when the policy editor is explored`, async ({ page, steps, passwordPolicyTab, settingsRestore }) => {
    const before = await settingsRestore.snapshotPolicy();
    const d = CASES.exploratory;

    await steps.critical('Navigate to the User Management module - the Password Policy tab is accessible', async () => {
      await passwordPolicyTab.open();
      expect(await passwordPolicyTab.isEditOffered(), 'the Edit button').toBe(true);
    });

    await steps.critical('Select Edit - the drawer opens with all fields pre-filled', async () => {
      await passwordPolicyTab.openEdit();
      expect(await readDrawer(passwordPolicyTab), 'the drawer values').toEqual(pick(before));
    });

    await steps.step('Freely explore interactions such as rapidly toggling checkboxes, pasting non-numeric text into numeric fields, and switching between fields without saving - the drawer rejects or flags invalid input, without displaying stale values', async () => {
      const original = await passwordPolicyTab.isFlagTicked('requireUppercase');
      for (let i = 0; i < d.toggles; i += 1) await passwordPolicyTab.setFlag('requireUppercase', !(await passwordPolicyTab.isFlagTicked('requireUppercase')));
      const afterToggles = await passwordPolicyTab.isFlagTicked('requireUppercase');
      await pasteIntoPolicyBox(page, PASSWORD_POLICY.input.requiredLength, d.pasted);
      const pastedValue = await passwordPolicyTab.readNumber('requiredLength');
      const errors = await passwordPolicyTab.getErrors();
      for (const f of NUMBER_FIELDS) await page.locator(`#${PASSWORD_POLICY.input[f]}`).focus();
      await cancelDrawer(passwordPolicyTab, page);
      await passwordPolicyTab.openEdit();
      const reopened = await readDrawer(passwordPolicyTab);
      expect({
        toggledToOpposite: afterToggles === !original,
        pastedRejectedOrFlagged: !/[a-z]/i.test(pastedValue) || errors.length > 0,
        reopenedShowsSaved: JSON.stringify(reopened) === JSON.stringify(pick(await readPasswordPolicy(page))),
      }, `after ${d.toggles} toggles / pasting "${d.pasted}" (box "${pastedValue}", errors ${JSON.stringify(errors)}) / re-opening (${JSON.stringify(reopened)})`).toEqual({
        toggledToOpposite: true, pastedRejectedOrFlagged: true, reopenedShowsSaved: true,
      });
    });

    await steps.step('Try unscripted combinations, such as Minimum length equal to Maximum length, or all character requirements at the lowest Minimum length - the drawer validates and saves coherently or shows a clear range message', async () => {
      await ensurePolicyDrawer(passwordPolicyTab);
      await passwordPolicyTab.typeNumber('requiredLength', d.sameLength);
      await passwordPolicyTab.typeNumber('maximumLength', d.sameLength);
      const same = await saveAndReadBack(passwordPolicyTab, page);
      const sameCoherent = (same.status === 200 && same.stored.requiredLength === Number(d.sameLength) && same.stored.maximumLength === Number(d.sameLength))
        || (same.status === -1 && same.errors.length > 0);

      await ensurePolicyDrawer(passwordPolicyTab);
      await passwordPolicyTab.typeNumber('requiredLength', d.lowestMinimum);
      for (const f of ['requireUppercase', 'requireLowercase', 'requireDigit', 'requireNonAlphanumeric'] as const) await passwordPolicyTab.setFlag(f, true);
      const all = await saveAndReadBack(passwordPolicyTab, page);
      const allCoherent = (all.status === 200 && all.stored.requiredLength === Number(d.lowestMinimum)
        && all.stored.requireUppercase && all.stored.requireLowercase && all.stored.requireDigit && all.stored.requireNonAlphanumeric)
        || (all.status === -1 && all.errors.length > 0);
      expect({ sameCoherent, allCoherent }, `min = max: ${same.status} ${JSON.stringify(same.errors)}; all requirements at min ${d.lowestMinimum}: ${all.status} ${JSON.stringify(all.errors)}`)
        .toEqual({ sameCoherent: true, allCoherent: true });
    });
    await settingsRestore.restorePolicyNow();
  });
});
