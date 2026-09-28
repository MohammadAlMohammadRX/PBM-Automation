import { test, expect } from '../../../fixtures';
import { Logger } from '../../../utils/Logger';
import { DETAIL_ACTIONS_OBSERVED, NEEDS_CLONE_FEATURE } from '../../../data/payers/clonePayer.data';

/**
 * User story: Clone an Existing Payer Record (Azure US 16219).
 *
 * THE FEATURE IS NOT BUILT - see clonePayer.data.ts for what was probed and
 * when. One case asserts the action is offered and FAILS, which is the finding.
 * The other eleven are blocked behind it rather than repeating it eleven times:
 * a suite that reported twelve failures for one missing button would bury the
 * single fact a developer needs under eleven copies of itself.
 *
 * These cases were written before Azure had issued ids for them, against the
 * local ids the 2026-09-27 sheet carried, and were restamped to their Azure
 * ids (16444-16455) from the 2026-09-28 sheet.
 */
test.describe('Clone an existing payer record', () => {
  test('16444: should offer a Clone action on a payer record', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();
    let offered: string[] = [];

    await steps.critical('Open a payer\'s detail screen', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.waitForLoaded();
      offered = await detail.getHeaderActionIds();
      Logger.info(`the detail header offers: ${offered.join(', ') || '(nothing)'}`);
    });

    // THE FINDING. This is the only case in the story that can be observed
    // today, and it is expected to fail: the story asks for a Clone action and
    // the module has none. A failure here is the dev team's signal, not a
    // defect in the test - and the moment Clone ships, this passes and the
    // eleven cases below can be written.
    await steps.step('A Clone action is among them', async () => {
      const clone = offered.filter((id) => /clone|copy|duplicat/i.test(id));
      expect(
        clone,
        'the story requires a Clone action on a payer record. The detail header offers '
          + `[${offered.join(', ') || 'nothing'}]; when last probed it offered only `
          + `[${DETAIL_ACTIONS_OBSERVED.join(', ')}]. If this now passes, the feature has landed `
          + 'and the eleven BLOCKED cases in this story can be implemented.',
      ).not.toEqual([]);
    });
  });

  for (const [azureId, what] of [
    ['16445', 'copy every field except the Effective Date and the Expiry Date'],
    ['16446', 'enforce the blank Effective Date as mandatory before a clone is submitted'],
    ['16447', 'create the clone as a Draft whatever status the source holds'],
    ['16448', 'put a cloned draft through the same approval workflow as any other payer'],
    ['16449', 'offer no Clone action on a payer network assignment record'],
    ['16451', 'block the submission of a cloned draft whose Effective Date is blank'],
    ['16450', 'withhold the Clone action from a role without the create right'],
    ['16452', 'leave the source untouched when a Draft payer is cloned'],
    ['16453', 'produce an independent draft when a clone is itself cloned'],
    ['16454', 'reproduce long, special-character and empty field values in a clone'],
    ['16455', 'copy every supported field type accurately into the clone'],
  ] as const) {
    test(`${azureId}: should ${what}`, async ({ steps }) => {
      steps.blocked(NEEDS_CLONE_FEATURE);
      // steps.blocked() does not narrow the type for the compiler.
      return;
    });
  }
});
