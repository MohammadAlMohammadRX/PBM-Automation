import { test, expect } from '../../../fixtures';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { PAYER_COLUMN } from '../../../constants/ElementIds';
import {
  CODE_RACE_EDIT,
  EMPTY_CODE_MARKERS,
  GENERATION_FAILURE,
  MANUAL_CODE,
  OBSERVED_CODE_PATTERN,
  UNIQUENESS_SAMPLE,
} from '../../../data/payers/payerCodeUniqueness.data';

/**
 * User story: Validate PayerCode Uniqueness on Approval.
 *
 * Seven cases. That a code is generated only on approval, and not consumed by a
 * rejection, is already proven by the create-new-payer story; approval
 * eligibility and the unauthorised approver belong to publish-and-revert; and
 * the edit story already proves no user can type a code, because the field is
 * not on the form. See the traceability matrix.
 *
 * THE COLLISION ITSELF CANNOT BE INJECTED - generation happens inside the
 * approval call on the server, with no seam this framework can reach. TC-002
 * therefore asserts the invariant the retry logic exists to protect: no two
 * payers share a code. A broken retry surfaces there.
 */
test.describe('PayerCode uniqueness', () => {
  test('TC-001: should refuse a code that another payer already holds', async ({
    page,
    payerManagementPage,
    publishedPayer,
    draftPayer,
    steps,
  }) => {
    let existingCode = '';
    let outcome!: { status: number; text: string; validationErrors: string[] };

    await steps.critical('Navigate to the module and read a code already in use', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      existingCode = (
        await payerManagementPage.getCellValue(publishedPayer.nameEn, PAYER_COLUMN.code)
      ).trim();
      expect(
        existingCode,
        'an approved payer should carry a code for another to collide with',
      ).not.toBe('');
    });

    await steps.critical('A second payer is told to take that same code', async () => {
      // The sheet's "force a duplicate via the test harness". There is no
      // client-supplied code in the normal flow, so the duplicate has to be
      // pushed on the wire - and what is being tested is whether the server
      // will take it.
      // Searched for FIRST. The previous step left the list filtered to the
      // published payer, so the draft's row was not on screen and reading its
      // id timed out against a row that was simply not rendered.
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      const payerId = await payerManagementPage.getPayerId(draftPayer.nameEn);
      outcome = await NetworkUtils.postAsSession(page, ApiEndpoints.payerUpdate, {
        id: payerId,
        payerCode: existingCode,
      });
      expect(outcome.status, 'the request should have reached the server').toBeGreaterThan(0);
    });

    await steps.step('The duplicate is not accepted', async () => {
      // Either answer protects the register: a refusal, or an acceptance that
      // ignored the field. What must not happen is a second payer wearing the
      // first one's code, which the next step checks directly.
      expect(
        outcome.status >= 400 || outcome.status === 200,
        `the server answered ${outcome.status}: ${outcome.text.slice(0, 200)}`,
      ).toBe(true);
    });

    await steps.step('And no second payer ends up holding that code', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      const code = (
        await payerManagementPage.getCellValue(draftPayer.nameEn, PAYER_COLUMN.code)
      ).trim();
      expect(
        code,
        `"${draftPayer.nameEn}" took the code "${existingCode}" that `
          + `"${publishedPayer.nameEn}" already holds`,
      ).not.toBe(existingCode);
    });
  });

  test('TC-002: should give a newly approved payer a code no other payer holds', async ({
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
    steps,
  }) => {
    test.slow();

    let assignedCode = '';
    let registerCodes: string[] = [];

    await steps.critical('Navigate to the module and note the codes already issued', async () => {
      await payerManagementPage.open();
      await payerManagementPage.expectRowsRendered();
      // Read from the COLUMN, one value per row - not per payer name. Two
      // payers in this register share a name, so a per-name read resolved both
      // to the same row, returned one code twice, and reported it as a
      // duplicate held by two payers. That is a false positive, and a
      // convincing one.
      registerCodes = (await payerManagementPage.getColumnValues('code'))
        .slice(0, UNIQUENESS_SAMPLE)
        .map((code) => code.trim())
        .filter(
          (code) => !EMPTY_CODE_MARKERS.includes(code as (typeof EMPTY_CODE_MARKERS)[number]),
        );
      expect(registerCodes.length, 'the register should already hold issued codes').toBeGreaterThan(
        0,
      );
    });

    await steps.step('No two payers already share a code', async () => {
      // The invariant, read across the register. This is what a broken
      // collision-retry would break, and it is checkable without being able to
      // force the collision itself.
      const duplicates = registerCodes.filter(
        (code, index) => registerCodes.indexOf(code) !== index,
      );
      expect(
        [...new Set(duplicates)],
        `these codes are held by more than one payer: ${[...new Set(duplicates)].join(', ')}`,
      ).toEqual([]);
    });

    await steps.step('A newly approved payer receives its own code', async () => {
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(draftPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(draftPayer.nameEn);
      await approvalManagementPage.approve(draftPayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      assignedCode = (
        await payerManagementPage.getCellValue(draftPayer.nameEn, PAYER_COLUMN.code)
      ).trim();
      expect(
        assignedCode,
        'approval should have issued a code',
      ).not.toBe('');
    });

    await steps.step('And that code was not already in use', async () => {
      expect(
        registerCodes,
        `the new payer was issued "${assignedCode}", which the register already held`,
      ).not.toContain(assignedCode);
    });
  });

  test('TC-003: should issue a code shaped like every other code in the register', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    let code = '';

    await steps.critical('Navigate to the module and read an approved payer\'s code', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      code = (
        await payerManagementPage.getCellValue(publishedPayer.nameEn, PAYER_COLUMN.code)
      ).trim();
      expect(code, 'an approved payer should carry a code').not.toBe('');
    });

    await steps.step('It follows the shape the register uses', async () => {
      // NO FORMAT WAS SPECIFIED. The sheet asks whether the code "conforms to
      // the defined format/length boundary" and never defines one, and no
      // specification came with the story - recorded as a gap rather than
      // guessed. The pattern here was inferred from the codes the environment
      // already holds, so this case catches a truncated or overflowing code
      // without asserting a rule nobody wrote down.
      expect(
        code,
        `"${code}" does not match the shape the register's other codes take `
          + `(${OBSERVED_CODE_PATTERN}); if the format has changed deliberately, this pattern `
          + 'needs updating - and the story needs a specification',
      ).toMatch(OBSERVED_CODE_PATTERN);
    });

    await steps.step('And the detail screen shows the same code, in full', async () => {
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const onDetail = (await detail.getFieldValue('Payer Code')).trim();
      expect(
        onDetail,
        `the list shows "${code}" and the detail screen shows "${onDetail}"`,
      ).toContain(code);
    });
  });

  test('TC-004: should record the code assignment in the payer\'s history', async ({
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
    steps,
  }) => {
    test.slow();

    let assignedCode = '';

    await steps.critical('Navigate to the module and approve a draft payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(draftPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(draftPayer.nameEn);
      await approvalManagementPage.approve(draftPayer.nameEn);
    });

    await steps.critical('It now carries a code', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      assignedCode = (
        await payerManagementPage.getCellValue(draftPayer.nameEn, PAYER_COLUMN.code)
      ).trim();
      expect(assignedCode, 'approval should have issued a code').not.toBe('');
    });

    await steps.step('The history records the approval that issued it', async () => {
      const detail = await payerManagementPage.openDetails(draftPayer.nameEn);
      await detail.openAuditHistory();
      const entries = await detail.getAuditEntryTexts();
      expect(
        entries,
        'the approval that issued the code should be on the record',
      ).not.toEqual([]);
    });

    await steps.step('And the code itself is traceable to that event', async () => {
      // A code that appears with no recorded moment of assignment cannot be
      // audited later - which is the point of the sheet's case.
      const detail = payerManagementPage.detail();
      const entries = await detail.getAuditEntryTexts();
      const trail = entries.join(' | ');
      expect(
        trail.includes(assignedCode),
        `the trail should tie "${assignedCode}" to the event that issued it; it holds: `
          + `${trail.slice(0, 300) || '(nothing)'}`,
      ).toBe(true);
    });
  });

  test('TC-005: should ignore a code supplied by the client rather than storing it', async ({
    page,
    payerManagementPage,
    draftPayer,
    steps,
  }) => {
    let outcome!: { status: number; text: string; validationErrors: string[] };

    await steps.critical('Navigate to the module with a draft payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      await payerManagementPage.waitForRowVisible(draftPayer.nameEn);
    });

    await steps.critical('A code is pushed onto the record on the wire', async () => {
      // The form offers no PayerCode field at all - the edit story already
      // proves that - so the only way to attempt this is directly. What is
      // being tested is whether the server trusts a client-supplied code.
      const payerId = await payerManagementPage.getPayerId(draftPayer.nameEn);
      outcome = await NetworkUtils.postAsSession(page, ApiEndpoints.payerUpdate, {
        id: payerId,
        payerCode: MANUAL_CODE,
      });
      expect(outcome.status, 'the request should have reached the server').toBeGreaterThan(0);
    });

    await steps.step('The payer does not end up wearing it', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      const code = (
        await payerManagementPage.getCellValue(draftPayer.nameEn, PAYER_COLUMN.code)
      ).trim();
      expect(
        code,
        `a client-supplied code was stored: the payer now reads "${code}"`,
      ).not.toBe(MANUAL_CODE);
    });

    await steps.step('And a draft still holds no code at all', async () => {
      // The other half of the rule: codes belong to approval. A draft that
      // acquired one - any one - would mean the generator ran too early.
      const code = (
        await payerManagementPage.getCellValue(draftPayer.nameEn, PAYER_COLUMN.code)
      ).trim();
      expect(
        EMPTY_CODE_MARKERS.includes(code as (typeof EMPTY_CODE_MARKERS)[number]),
        `an unapproved payer should carry no code; it reads "${code}"`,
      ).toBe(true);
    });
  });

  test('TC-006: should leave the payer unapproved when the code cannot be issued', async ({
    page,
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
    steps,
  }) => {
    test.slow();

    let approvalEndpoint = '';

    await steps.critical('Navigate to the module and submit a draft for approval', async () => {
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(draftPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(draftPayer.nameEn);
    });

    await steps.critical('The approval call - which issues the code - is made to fail', async () => {
      // Generation is server-side and has no endpoint of its own to break, so
      // the call that triggers it is broken instead. Discovered rather than
      // named, for the reason the publish story documents: failing a guessed
      // path breaks nothing and looks like graceful degradation.
      approvalEndpoint = (await NetworkUtils.captureRequestUrl(page, /approv/i, () =>
        approvalManagementPage.approve(draftPayer.nameEn).catch(() => undefined))) ?? '';
      expect(
        approvalEndpoint,
        'approving should have called an endpoint that can be broken',
      ).not.toBe('');
    });

    await steps.step('A failed approval issues no code', async () => {
      await NetworkUtils.failEndpoint(page, approvalEndpoint);
      await approvalManagementPage.open();
      await approvalManagementPage.approve(draftPayer.nameEn).catch(() => undefined);
      await NetworkUtils.restoreEndpoint(page, approvalEndpoint);
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      const code = (
        await payerManagementPage.getCellValue(draftPayer.nameEn, PAYER_COLUMN.code)
      ).trim();
      expect(
        EMPTY_CODE_MARKERS.includes(code as (typeof EMPTY_CODE_MARKERS)[number]),
        `${GENERATION_FAILURE.forbidden} - the payer reads code "${code}" after a failed approval`,
      ).toBe(true);
    });

    await steps.step('And the request is still there to approve again', async () => {
      // The change must not be consumed by the failure. A request that
      // disappeared would leave the payer permanently unapprovable.
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(draftPayer.nameEn);
    });
  });

  test('TC-007: should issue different codes to two payers approved at the same time', async ({
    payerManagementPage,
    approvalManagementPage,
    staleSession,
    draftPayer,
    secondPublishedPayer,
    steps,
  }) => {
    test.slow();

    const codes: string[] = [];

    await steps.critical('Navigate to the module with two payers to approve', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      await payerManagementPage.waitForRowVisible(draftPayer.nameEn);
    });

    await steps.critical('Both are put in the queue', async () => {
      await payerManagementPage.sendForApproval(draftPayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.editSingleFieldAndSave(
        secondPublishedPayer.nameEn,
        CODE_RACE_EDIT.label,
        CODE_RACE_EDIT.value,
        'text',
      );
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(secondPublishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(draftPayer.nameEn);
    });

    await steps.step('Two sessions approve them without waiting for each other', async () => {
      // Both decisions dispatched before either is awaited, so the two code
      // generations overlap. Awaiting the first would serialise them and the
      // race the case is named for would never happen.
      await Promise.all([
        approvalManagementPage.approve(draftPayer.nameEn).catch(() => undefined),
        staleSession.approvalPage
          .approve(secondPublishedPayer.nameEn)
          .catch(() => undefined),
      ]);
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      codes.push(
        (await payerManagementPage.getCellValue(draftPayer.nameEn, PAYER_COLUMN.code)).trim(),
      );
      expect(codes[0], 'the first payer should have been issued a code').not.toBe('');
    });

    await steps.step('The second payer has its own code too', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(secondPublishedPayer.nameEn);
      codes.push(
        (
          await payerManagementPage.getCellValue(secondPublishedPayer.nameEn, PAYER_COLUMN.code)
        ).trim(),
      );
      expect(codes[1], 'the second payer should have a code').not.toBe('');
    });

    await steps.step('And the two codes are different', async () => {
      expect(
        codes[0],
        `both payers were issued the code "${codes[0]}" - the generator handed the same value `
          + 'to two overlapping approvals',
      ).not.toBe(codes[1]);
    });
  });
});
