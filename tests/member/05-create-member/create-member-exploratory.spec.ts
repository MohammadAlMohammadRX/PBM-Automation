import { test, expect } from '../../../fixtures';
import type { MemberFormDrawer } from '../../../pages/member/MemberFormDrawer';
import { CASES } from '../../../data/member/createMember.data';
import { findMemberByName } from '../../../utils/MemberProvisioning';
import { WIZARD_LABEL, reloadMidWizard, validWizardData, watchPageErrors } from '../../../utils/member/writerBHelpers';

/**
 * User story 14380: Create Member - 19852, the exploratory case as a FIXED
 * script (Member-Writers-Brief.md): back / next with the data entered kept on
 * every step, rapid Nationality switching with the Identity Type rule applied
 * every time (Saudi -> National ID only; any other -> Iqama preset, no
 * National ID), and a browser refresh mid-wizard (the wizard cleanly discarded:
 * closed, no member created, a reopened wizard empty). Anything unexpected is
 * written down as an anomaly; the closing step asserts there is none and no
 * page error was raised.
 */
test.describe('US 14380 - Create Member - exploratory navigation', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.exploratory.azureId}: should keep the Create Member wizard stable, its data right and its identity locking consistent under varied navigation`, async ({
    page,
    memberManagementPage: list,
    discardMemberNamed,
    steps,
  }) => {
    const data = await validWizardData(page);
    discardMemberNamed(data.displayNameEn);
    const pageErrors = watchPageErrors(page);
    const anomalies: string[] = [];
    let drawer!: MemberFormDrawer;

    /** Compares what the wizard shows with what was entered; a difference is an anomaly. */
    const note = (what: string, shown: unknown, wanted: unknown): void => {
      if (JSON.stringify(shown) !== JSON.stringify(wanted)) anomalies.push(`${what}: shows ${JSON.stringify(shown)}, expected ${JSON.stringify(wanted)}`);
    };
    const readStep1 = async (): Promise<Record<string, string>> => ({
      englishLastName: await drawer.getValue('englishLastName'),
      arabicLastName: await drawer.getValue('arabicLastName'),
      documentId: await drawer.getValue('documentId'),
      dateOfBirth: await drawer.getValue('dateOfBirth'),
      nationality: await drawer.readSelect('nationality'),
      identityType: await drawer.readSelect('identityType'),
    });
    const wantedStep1 = {
      englishLastName: data.patient.englishLastName,
      arabicLastName: data.patient.arabicLastName,
      documentId: data.patient.documentId,
      dateOfBirth: data.patient.dateOfBirth,
      nationality: WIZARD_LABEL.saudi,
      identityType: WIZARD_LABEL.nationalId,
    };
    const readStep2 = async (): Promise<Record<string, string>> => ({ mobileNumber: await drawer.getValue('mobileNumber'), email: await drawer.getValue('email') });
    const wantedStep2 = { mobileNumber: data.nonNational.mobileNumber, email: data.nonNational.email };

    await steps.critical('Navigate to the Member Management module - the member list view is displayed', async () => {
      await list.openTable();
      expect(await list.countRows(), 'the member list rows').toBeGreaterThan(0);
    });

    await steps.step('Click "Create Member" and navigate back and forth between the steps (fill 1, Next, fill 2, Back, Next) - the wizard responds to each action', async () => {
      drawer = await list.openAddForm();
      await drawer.fillPatient(data.patient);
      expect(await drawer.next(), `step 1 errors: ${JSON.stringify(await drawer.getFieldErrors())}`).toBe(true);
      await drawer.fillNonNational(data.nonNational);
      await drawer.back();
      expect(await drawer.currentStep(), 'Back from step 2').toBe(1);
      note('step 1 after Back', await readStep1(), wantedStep1);
      expect(await drawer.next(), 'Next again from step 1').toBe(true);
      note('step 2 after Back / Next', await readStep2(), wantedStep2);
      expect(await drawer.next(), `Next from step 2: ${JSON.stringify(await drawer.getFieldErrors())}`).toBe(true);
      await drawer.back();
      await drawer.back();
      expect(await drawer.currentStep(), 'Back twice from step 3').toBe(1);
      note('step 1 after Back from step 3', await readStep1(), wantedStep1);
    });

    await steps.step('Switch the Nationality / Identity Type selections rapidly (Saudi, non-Saudi, Saudi, non-Saudi, Saudi) - the wizard responds to each action', async () => {
      const sequence = [WIZARD_LABEL.nonSaudi, WIZARD_LABEL.saudi, WIZARD_LABEL.nonSaudi, WIZARD_LABEL.saudi];
      for (const [i, nationality] of sequence.entries()) {
        await drawer.choose('nationality', nationality);
        const saudi = nationality === WIZARD_LABEL.saudi;
        const shown = await drawer.readSelect('identityType');
        const options = await drawer.getOptions('identityType').catch(() => [] as string[]);
        note(`switch ${i + 1} (${nationality}) Identity Type`, shown.includes(saudi ? WIZARD_LABEL.nationalId : WIZARD_LABEL.iqama), true);
        note(`switch ${i + 1} (${nationality}) National ID offered`, options.includes(WIZARD_LABEL.nationalId), saudi);
        if (saudi) note(`switch ${i + 1} (${nationality}) only National ID offered`, options, [WIZARD_LABEL.nationalId]);
      }
      expect(await drawer.readSelect('nationality'), 'the last choice').toContain(WIZARD_LABEL.saudi);
      // The Document ID may be kept or cleanly cleared when the identity type changes - anything else is an anomaly.
      const documentId = await drawer.getValue('documentId');
      note('step 1 Document ID after the switching (kept or cleared)', [wantedStep1.documentId, ''].includes(documentId as string), true);
      note('step 1 name after the switching', await drawer.getValue('englishLastName'), wantedStep1.englishLastName);
      if (documentId === '') await drawer.type('documentId', data.patient.documentId as string);
    });

    await steps.step('Refresh the browser mid-wizard (on step 2) - the wizard responds: it is closed and its data cleanly discarded', async () => {
      expect(await drawer.next(), `Next from step 1: ${JSON.stringify(await drawer.getFieldErrors())}`).toBe(true);
      const { prompted } = await reloadMidWizard(page);
      await list.openTable();
      const stillOpen = await drawer.isOpen();
      note('wizard after the refresh', stillOpen, false);
      note('member saved by the refresh', (await findMemberByName(page, data.displayNameEn)) !== null, false);
      drawer = await list.openAddForm();
      note('reopened wizard step', await drawer.currentStep(), 1);
      note('reopened wizard values', { englishLastName: await drawer.getValue('englishLastName'), documentId: await drawer.getValue('documentId'), dateOfBirth: await drawer.getValue('dateOfBirth') },
        { englishLastName: '', documentId: '', dateOfBirth: '' });
      expect(await drawer.isOpen(), `the wizard reopens after the refresh (leave-page prompt: ${prompted})`).toBe(true);
      await drawer.close(true);
    });

    await steps.step('Observe behaviour for data loss, inconsistent locking of Identity Type / Document ID fields, or crashes - any anomalies are noted (none: data retained or clearly discarded, locking consistent, no crash)', async () => {
      expect({ anomalies, pageErrors }).toEqual({ anomalies: [], pageErrors: [] });
    });
  });
});
