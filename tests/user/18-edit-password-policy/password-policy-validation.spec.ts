import { test, expect } from '../../../fixtures';
import type { Page } from '@playwright/test';
import type { PolicyNumberField } from '../../../constants/user/userIds';
import { CASES } from '../../../data/user/editPasswordPolicy.data';
import type { PasswordPolicyTab } from '../../../pages/user/PasswordPolicyTab';
import { readPasswordPolicy, samePolicy } from '../../../utils/UserProvisioning';
import { ensurePolicyDrawer } from '../../../utils/user/writerFHelpers';

/**
 * Types `value` into `field` and presses Save. Reports whether the expected
 * message showed, whether a request was sent, whether the drawer stayed open
 * and whether the stored policy is still the one read just before the Save
 * ("Save does nothing"). The boxes CLAMP out-of-range values and Save
 * persists them (KNOWN FINDING) - `settingsRestore` puts the policy back.
 */
async function trySave(tab: PasswordPolicyTab, page: Page, message: string): Promise<{ outcome: Record<string, boolean>; detail: string }> {
  const before = await readPasswordPolicy(page);
  const r = await tab.save();
  const open = await tab.isDrawerOpen();
  const after = await readPasswordPolicy(page);
  return {
    outcome: { message: r.errors.includes(message), sent: r.status !== -1, drawerOpen: open, unchanged: samePolicy(before, after) },
    detail: `answer ${r.status}, errors ${JSON.stringify(r.errors)}, stored after ${JSON.stringify({ ...after, concurrencyStamp: undefined })}`,
  };
}

const NOTHING_SAVED = { message: true, sent: false, drawerOpen: true, unchanged: true };

/**
 * User story 20426: Edit Password Policy - the range and cross-field errors
 * ("Save does nothing"). The policy is GLOBAL: every test snapshots it through
 * `settingsRestore` BEFORE the first Save and restores it explicitly at its
 * end; the fixture restores + reads back again at teardown.
 */
test.describe('US 20426 - Edit Password Policy', () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  for (const c of [
    { data: CASES.minLengthOutOfRange, field: 'requiredLength' as PolicyNumberField, label: 'Minimum length' },
    { data: CASES.maxLengthOutOfRange, field: 'maximumLength' as PolicyNumberField, label: 'Maximum length' },
  ]) {
    test(`TC-${c.data.azureId}: should show "${c.data.message}" and save nothing when ${c.label} is ${c.data.low} or ${c.data.high}`, async ({ page, steps, passwordPolicyTab, settingsRestore }) => {
      await settingsRestore.snapshotPolicy();

      await steps.critical('Navigate to the User Management module - the Password Policy tab is accessible', async () => {
        await passwordPolicyTab.open();
        expect(await passwordPolicyTab.isEditOffered(), 'the Edit button').toBe(true);
      });

      await steps.critical('Select Edit - the drawer opens', async () => {
        await passwordPolicyTab.openEdit();
        expect(await passwordPolicyTab.isDrawerOpen(), 'the drawer').toBe(true);
      });

      for (const value of [c.data.low, c.data.high]) {
        await steps.step(`Set ${c.label} to ${value} and select Save - "${c.data.message}" is shown under the field and Save does nothing`, async () => {
          await ensurePolicyDrawer(passwordPolicyTab);
          await passwordPolicyTab.typeNumber(c.field, value);
          const { outcome, detail } = await trySave(passwordPolicyTab, page, c.data.message);
          expect(outcome, `${c.label} ${value} (box read "${await passwordPolicyTab.readNumber(c.field).catch(() => '?')}"): ${detail}`).toEqual(NOTHING_SAVED);
        });
      }
      await settingsRestore.restorePolicyNow();
    });
  }

  test(`TC-${CASES.maxBelowMin.azureId}: should show "${CASES.maxBelowMin.message}" and save nothing when the maximum length is below the minimum`, async ({ page, steps, passwordPolicyTab, settingsRestore }) => {
    await settingsRestore.snapshotPolicy();
    const d = CASES.maxBelowMin;

    await steps.critical('Navigate to the User Management module - the Password Policy tab is accessible', async () => {
      await passwordPolicyTab.open();
      expect(await passwordPolicyTab.isEditOffered(), 'the Edit button').toBe(true);
    });

    await steps.critical('Select Edit - the drawer opens', async () => {
      await passwordPolicyTab.openEdit();
      expect(await passwordPolicyTab.isDrawerOpen(), 'the drawer').toBe(true);
    });

    await steps.step(`Set Minimum length to ${d.min} - the value is accepted`, async () => {
      await passwordPolicyTab.typeNumber('requiredLength', d.min);
      expect(await passwordPolicyTab.readNumber('requiredLength'), 'Minimum length').toBe(d.min);
    });

    await steps.step(`Set Maximum length to ${d.max} and select Save - "${d.message}" is displayed and Save does nothing`, async () => {
      await passwordPolicyTab.typeNumber('maximumLength', d.max);
      const { outcome, detail } = await trySave(passwordPolicyTab, page, d.message);
      expect(outcome, `Maximum ${d.max} under Minimum ${d.min}: ${detail}`).toEqual(NOTHING_SAVED);
    });
    await settingsRestore.restorePolicyNow();
  });

  test(`TC-${CASES.distinctInvalid.azureId}: should show the range and exceed messages and save nothing when minimum distinct characters is 0 or above the minimum length`, async ({ page, steps, passwordPolicyTab, settingsRestore }) => {
    await settingsRestore.snapshotPolicy();
    const d = CASES.distinctInvalid;

    await steps.critical('Navigate to the User Management module - the Password Policy tab is accessible', async () => {
      await passwordPolicyTab.open();
      expect(await passwordPolicyTab.isEditOffered(), 'the Edit button').toBe(true);
    });

    await steps.critical(`Select Edit - the drawer opens (precondition: Minimum length ${d.minLength})`, async () => {
      await passwordPolicyTab.openEdit();
      await passwordPolicyTab.typeNumber('requiredLength', d.minLength);
      expect(await passwordPolicyTab.readNumber('requiredLength'), 'Minimum length').toBe(d.minLength);
    });

    await steps.step(`Set Minimum distinct characters to ${d.zero} and select Save - "${d.rangeMessage}" is shown and Save does nothing`, async () => {
      await passwordPolicyTab.typeNumber('requiredUniqueChars', d.zero);
      const { outcome, detail } = await trySave(passwordPolicyTab, page, d.rangeMessage);
      expect(outcome, `distinct ${d.zero}: ${detail}`).toEqual(NOTHING_SAVED);
    });

    await steps.step(`Set Minimum distinct characters to ${d.aboveMin} while Minimum length remains ${d.minLength} and select Save - "${d.exceedMessage}" is shown and Save does nothing`, async () => {
      await ensurePolicyDrawer(passwordPolicyTab);
      if ((await passwordPolicyTab.readNumber('requiredLength')) !== d.minLength) await passwordPolicyTab.typeNumber('requiredLength', d.minLength);
      await passwordPolicyTab.typeNumber('requiredUniqueChars', d.aboveMin);
      const { outcome, detail } = await trySave(passwordPolicyTab, page, d.exceedMessage);
      expect(outcome, `distinct ${d.aboveMin} over Minimum ${d.minLength}: ${detail}`).toEqual(NOTHING_SAVED);
    });
    await settingsRestore.restorePolicyNow();
  });

  for (const c of [
    { data: CASES.rememberedOutOfRange, field: 'passwordHistoryCount' as PolicyNumberField, label: 'Passwords remembered' },
    { data: CASES.expiryOutOfRange, field: 'expiryDays' as PolicyNumberField, label: 'Password expires after (days)' },
  ]) {
    test(`TC-${c.data.azureId}: should show "${c.data.message}" and save nothing when ${c.label} is ${c.data.value}`, async ({ page, steps, passwordPolicyTab, settingsRestore }) => {
      await settingsRestore.snapshotPolicy();

      await steps.critical('Navigate to the User Management module - the Password Policy tab is accessible', async () => {
        await passwordPolicyTab.open();
        expect(await passwordPolicyTab.isEditOffered(), 'the Edit button').toBe(true);
      });

      await steps.critical('Select Edit - the drawer opens', async () => {
        await passwordPolicyTab.openEdit();
        expect(await passwordPolicyTab.isDrawerOpen(), 'the drawer').toBe(true);
      });

      await steps.step(`Set ${c.label} to ${c.data.value} and select Save - "${c.data.message}" is shown and Save does nothing`, async () => {
        await passwordPolicyTab.typeNumber(c.field, c.data.value);
        const { outcome, detail } = await trySave(passwordPolicyTab, page, c.data.message);
        expect(outcome, `${c.label} ${c.data.value} (box read "${await passwordPolicyTab.readNumber(c.field).catch(() => '?')}"): ${detail}`).toEqual(NOTHING_SAVED);
      });
      await settingsRestore.restorePolicyNow();
    });
  }

  test(`TC-${CASES.anyFieldInvalid.azureId}: should keep the drawer open and save nothing when one setting is out of range and the others are valid`, async ({ page, steps, passwordPolicyTab, settingsRestore }) => {
    const snapshot = await settingsRestore.snapshotPolicy();
    const d = CASES.anyFieldInvalid;

    await steps.critical('Navigate to the User Management module - the Password Policy tab is accessible', async () => {
      await passwordPolicyTab.open();
      expect(await passwordPolicyTab.isEditOffered(), 'the Edit button').toBe(true);
    });

    await steps.critical('Select Edit - the drawer opens', async () => {
      await passwordPolicyTab.openEdit();
      expect(await passwordPolicyTab.isDrawerOpen(), 'the drawer').toBe(true);
    });

    await steps.step(`Enter a valid Minimum length (${d.minLength}) but set Minimum distinct characters to ${d.distinct} - the range message displays under that field`, async () => {
      await passwordPolicyTab.typeNumber('requiredLength', d.minLength);
      await passwordPolicyTab.typeNumber('requiredUniqueChars', d.distinct);
      const errors = await passwordPolicyTab.getErrors();
      expect(errors, `errors before Save (distinct box read "${await passwordPolicyTab.readNumber('requiredUniqueChars')}")`).toContain(d.message);
    });

    await steps.step('Select Save - the drawer does not close, no values are saved, and the out-of-range message remains visible', async () => {
      const r = await passwordPolicyTab.save();
      const stored = await readPasswordPolicy(page);
      expect({
        drawerOpen: await passwordPolicyTab.isDrawerOpen(),
        sent: r.status !== -1,
        unchanged: samePolicy(stored, snapshot),
        message: (await passwordPolicyTab.getErrors()).includes(d.message),
      }, `the Save (answer ${r.status}, errors ${JSON.stringify(r.errors)})`).toEqual({ drawerOpen: true, sent: false, unchanged: true, message: true });
    });
    await settingsRestore.restorePolicyNow();
  });
});
