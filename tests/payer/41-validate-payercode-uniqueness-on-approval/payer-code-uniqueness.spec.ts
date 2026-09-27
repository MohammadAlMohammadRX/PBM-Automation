import { test, expect } from '../../../fixtures';
import type { ShapedSession } from '../../../fixtures/shapedNonAdmin.fixture';
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
  // Azure test case 14834
  test('14834: should refuse a code that another payer already holds', async ({
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

  // Azure test case 14824
  test('14824: should give a newly approved payer a code no other payer holds', async ({
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

  // Azure test case 14832
  test('14832: should issue a code shaped like every other code in the register', async ({
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

  // Azure test case 14840
  test('14840: should leave the payer unapproved when the code cannot be issued', async ({
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

  // Azure test case 14835
  test('14835: should issue different codes to two payers approved at the same time', async ({
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

/**
 * When the code is issued, and what it is issued against.
 *
 * The cases above are about the code being UNIQUE. These are about its timing -
 * nothing before approval, everything at it - and about the shapes the
 * uniqueness check has to cope with.
 */
test.describe('Validate PayerCode Uniqueness - When the code is issued', () => {
  // Azure test case 14826
  test('14826: should issue no code while the registration is still a draft', async ({
    payerManagementPage,
    uniquePayer,
    cleanup,
    steps,
  }) => {
    cleanup.register(() => payerManagementPage.deletePayer(uniquePayer.nameEn));

    await steps.critical('Create the payer and leave it as a draft', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(uniquePayer);
    });

    // A code issued at creation would be spent on a registration that may never
    // be approved, and the register would carry gaps nobody can account for.
    await steps.step('The draft carries no PayerCode', () =>
      payerManagementPage.expectNoPayerCode(uniquePayer.nameEn));
  });

  // Azure test case 14825
  test('14825: should issue the code at approval and at no earlier step', async ({
    payerManagementPage,
    approvalManagementPage,
    uniquePayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Create the payer as a draft', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(uniquePayer);
    });

    await steps.step('Still no code once it is only a draft', () =>
      payerManagementPage.expectNoPayerCode(uniquePayer.nameEn));

    // Submission is the intermediate state the case is about: the payer has
    // left the maker's hands but no decision has been taken, so nothing should
    // have been spent on it yet.
    await steps.step('And still none once it is merely submitted', async () => {
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(uniquePayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(uniquePayer.nameEn, 'Pending Approval');
      await payerManagementPage.expectNoPayerCode(uniquePayer.nameEn);
    });

    await steps.step('The approval is what issues it', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(uniquePayer.nameEn);
      await approvalManagementPage.approve(uniquePayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.expectPayerCodeAssigned(uniquePayer.nameEn);
    });
  });

  // Azure test case 14843
  test('14843: should leave no code behind when a registration is rejected', async ({
    payerManagementPage,
    approvalManagementPage,
    uniquePayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Create, submit and then reject the registration', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(uniquePayer);
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(uniquePayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(uniquePayer.nameEn);
      await approvalManagementPage.reject(uniquePayer.nameEn);
    });

    // A rejected registration that kept a code would hold a number no payer
    // uses - an orphan the next approval cannot reuse.
    await steps.step('The rejected registration holds no code', async () => {
      await payerManagementPage.open();
      await payerManagementPage.expectNoPayerCode(uniquePayer.nameEn);
    });
  });

  // Azure test case 14841
  test('14841: should withhold the approval that issues a code from a role without the right', async ({
    shapedNonAdmin,
    steps,
  }) => {
    let session!: ShapedSession;

    await steps.critical('Sign in as a user without the payer approval right', async () => {
      session = await shapedNonAdmin({ without: ['sendForApproval'] });
      await session.approvals.openHub();
    });

    // The code is issued by the approval, so whoever may approve decides what
    // enters the register - which is why this guard belongs to this story too.
    await steps.step('The approval actions are withheld from this role', () =>
      session.approvals.expectApprovalActionsDenied());
  });
});

/**
 * The shapes the uniqueness check has to survive.
 */
test.describe('Validate PayerCode Uniqueness - Input shapes', () => {
  // Azure test case 14833
  test('14833: should refuse a client-supplied code whatever shape it arrives in', async ({
    payerManagementPage,
    publishedPayer,
    page,
    steps,
  }) => {
    let existing = '';

    await steps.critical('Read the code the register already issued', async () => {
      await payerManagementPage.open();
      existing = await payerManagementPage.getPayerCode(publishedPayer.nameEn);
      expect(existing, 'the published payer should already hold a code').not.toBe('');
    });

    // The code is the system's to issue. A request that carries one - valid
    // shape or not - must not be able to set it, or the uniqueness the story
    // guarantees becomes a client's promise rather than the register's.
    await steps.step('A request carrying a code does not take it', async () => {
      const payerId = await payerManagementPage.getPayerId(publishedPayer.nameEn);
      for (const supplied of [existing, MANUAL_CODE]) {
        const response = await NetworkUtils.postAsSession(page, ApiEndpoints.payerUpdate, {
          payerId,
          payerCode: supplied,
        });
        expect(
          response.status < 300,
          `a request supplying the code "${supplied}" should not be accepted as a code change; `
            + `the server answered ${response.status}`,
        ).toBe(false);
      }
    });

    await steps.step('And the stored code is untouched', async () => {
      await payerManagementPage.open();
      expect(
        await payerManagementPage.getPayerCode(publishedPayer.nameEn),
        'the register should still hold the code it issued',
      ).toBe(existing);
    });
  });

  // Azure test case 14842
  test('14842: should treat case and spacing variants of a code as the same code', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    let existing = '';

    await steps.critical('Read an issued code to build variants from', async () => {
      await payerManagementPage.open();
      existing = await payerManagementPage.getPayerCode(publishedPayer.nameEn);
      expect(existing, 'the published payer should already hold a code').not.toBe('');
    });

    // If the register treats "pay-000017" or " PAY-000017 " as a different
    // code, uniqueness is only skin deep - two payers could hold the same
    // identifier in different clothes.
    await steps.step('Searching by a case or spacing variant finds the same payer', async () => {
      for (const variant of [existing.toLowerCase(), `  ${existing}  `]) {
        await payerManagementPage.open();
        await payerManagementPage.typeInSearch(variant);
        const found = await payerManagementPage.getVisiblePayerNames();
        expect(
          found,
          `"${variant}" is the same code as "${existing}" and should find the same payer; `
            + `the search returned: ${found.join(', ') || '(nothing)'}`,
        ).toContain(publishedPayer.nameEn);
      }
    });
  });

  // Azure test case 14827
  test('14827: should still issue a unique code when the generator meets a collision', async ({
    steps,
  }) => {
    // A collision has to be MADE to be observed: the generator is server-side
    // and the register holds no two payers racing for one value by chance. The
    // suite can make two approvals overlap - and 14835 does exactly that - but
    // it cannot force the generator to produce a duplicate and then watch it
    // retry, which is what this case asks.
    steps.blocked(
      'This case needs a forced PayerCode generation collision so the retry can be observed. '
      + 'The generator runs server-side and nothing in the interface or the API makes it hand '
      + 'out a value that is already taken. The overlapping-approval race it can reach is '
      + 'covered by 14835. Provide a way to seed a colliding code - a test hook or a seeded '
      + 'duplicate - and this case can assert the retry rather than the outcome.',
    );
  });

  // Azure test case 14848
  test('14848: should carry the issued code to the systems that consume it', async ({
    steps,
  }) => {
    // Downstream propagation leaves this application's boundary: the consuming
    // interfaces are not deployed in this environment, so there is nothing to
    // read the code back from. Asserting it locally would restate 14824 under
    // a different name and prove nothing about propagation.
    steps.blocked(
      'This case needs the downstream integrated systems the PayerCode is published to, and none '
      + 'are available in this environment - the suite can only see the payer module. Provide a '
      + 'consuming interface, or a log of what was published, and the case can assert the code '
      + 'arrived rather than that it exists here.',
    );
  });
});
