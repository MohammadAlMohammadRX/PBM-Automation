import { test, expect } from '../../../fixtures';
import { MESSAGE } from '../../../data/terminology/terminology.data';
import { CASES, REFERENCE_MAX } from '../../../data/terminology/subscribedTerminology.data';

/**
 * User story 15159: Mark a Terminology as Externally Subscribed.
 * Recording that a terminology comes from an external source together with a
 * required source reference: the reference's rules, the subscribed /
 * unsubscribed transitions, how the catalogue shows it, safety with hostile
 * input, concurrency, its audit entry, and who may change it.
 */
test.describe('US 15159 - Mark a Terminology as Externally Subscribed', () => {
  test(`TC-${CASES.markSubscribed.azureId}: should store the subscription and source reference when a terminology is marked subscribed`, async ({
    terminologyManagementPage,
    terminologyFormDrawer,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.markSubscribed;
    const terminology = await terminologyIn({ name: data.name() });

    await steps.critical('Navigate to the Terminology Management module - the terminology list loads', async () => {
      await terminologyManagementPage.open();
    });

    await steps.critical('Opening the unsubscribed terminology shows its current attributes', async () => {
      await terminologyManagementPage.openEditForm(terminology.name);
      expect(await terminologyFormDrawer.isSubscribedChecked()).toBe(false);
    });

    await steps.step('Marking it subscribed makes a subscription reference input available', async () => {
      await terminologyFormDrawer.setSubscribed(true);
      expect(await terminologyFormDrawer.isSubscriptionReferenceEditable()).toBe(true);
    });

    await steps.step(`Entering "${data.reference}" and saving stores the record without errors`, async () => {
      await terminologyFormDrawer.fillSubscriptionReference(data.reference);
      const answer = await terminologyFormDrawer.attemptSave();
      expect(answer.status, answer.validationErrors.join('; ')).toBe(200);
    });

    await steps.step('Reopened, the record shows subscribed with the entered source reference', async () => {
      await terminologyManagementPage.openEditForm(terminology.name);
      expect(await terminologyFormDrawer.isSubscribedChecked()).toBe(true);
      expect(await terminologyFormDrawer.getSubscriptionReferenceValue()).toBe(data.reference);
      await terminologyFormDrawer.close();
    });
  });

  test(`TC-${CASES.referenceRequired.azureId}: should refuse the subscription when no source reference is given`, async ({
    terminologyManagementPage,
    terminologyFormDrawer,
    terminologyIn,
    steps,
  }) => {
    const terminology = await terminologyIn();

    await steps.critical('"Mark as Subscribed" shows the subscription reference field as required', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openEditForm(terminology.name);
      await terminologyFormDrawer.setSubscribed(true);
      expect(await terminologyFormDrawer.isSubscriptionReferenceShown()).toBe(true);
    });

    await steps.step('Saving with the reference empty highlights it with a required message and the terminology stays unsubscribed', async () => {
      const answer = await terminologyFormDrawer.attemptSave();
      const reference = await terminologyFormDrawer.getSubscriptionReferenceError();
      expect(answer.status, 'nothing should be saved').not.toBe(200);
      expect([reference, ...answer.messages].join(' | ')).toMatch(CASES.referenceRequired.required);
      expect((await terminologyManagementPage.fetchTerminology(terminology.id))?.isSubscribed).toBe(false);
    });
  });

  test(`TC-${CASES.referenceLength.azureId}: should accept 255 characters and reject 256 with a length message when the source reference is at and over the limit`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.referenceLength;
    const terminology = await terminologyIn();

    await steps.critical('Navigate to the Terminology Management module - the terminology list loads', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step(`A ${REFERENCE_MAX}-character reference is saved and kept in full`, async () => {
      const answer = await terminologyManagementPage.saveSubscription(terminology.name, true, data.atMax());
      expect(answer.status).toBe(200);
      expect((await terminologyManagementPage.fetchTerminology(terminology.id))?.subscriptionReference).toHaveLength(REFERENCE_MAX);
    });

    await steps.step(`A ${REFERENCE_MAX + 1}-character reference is refused with a maximum-length message and not saved`, async () => {
      const answer = await terminologyManagementPage.saveSubscription(terminology.name, true, data.overMax());
      expect(answer.status).not.toBe(200);
      expect([answer.referenceError, ...answer.messages, ...answer.validationErrors].join(' | ')).toMatch(MESSAGE.maxLength);
      expect(((await terminologyManagementPage.fetchTerminology(terminology.id))?.subscriptionReference ?? '').length).toBeLessThanOrEqual(REFERENCE_MAX);
    });
  });

  test(`TC-${CASES.decisionTable.azureId}: should apply the subscription rules when each combination of subscribed flag and reference is saved`, async ({
    terminologyManagementPage,
    terminologyFormDrawer,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.decisionTable;
    const terminology = await terminologyIn();

    await steps.critical('Navigate to the Terminology Management module - the terminology list loads', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('Subscribed with a valid reference saves as subscribed with the reference stored', async () => {
      expect((await terminologyManagementPage.saveSubscription(terminology.name, true, data.valid)).status).toBe(200);
      const stored = await terminologyManagementPage.fetchTerminology(terminology.id);
      expect({ subscribed: stored?.isSubscribed, reference: stored?.subscriptionReference }).toEqual({ subscribed: true, reference: data.valid });
    });

    await steps.step('Subscribed with no reference is blocked with a required-field message', async () => {
      const answer = await terminologyManagementPage.saveSubscription(terminology.name, true, '');
      expect(answer.status).not.toBe(200);
      expect([answer.referenceError, ...answer.messages].join(' | ')).toMatch(MESSAGE.required);
    });

    await steps.step('Not subscribed with no reference saves as not subscribed with no reference shown', async () => {
      expect((await terminologyManagementPage.saveSubscription(terminology.name, false)).status).toBe(200);
      const stored = await terminologyManagementPage.fetchTerminology(terminology.id);
      expect({ subscribed: stored?.isSubscribed, reference: stored?.subscriptionReference ?? '' }).toEqual({ subscribed: false, reference: '' });
    });

    await steps.step('Not subscribed with a reference typed: the field is disabled or the value is ignored on save', async () => {
      await terminologyManagementPage.openEditForm(terminology.name);
      await terminologyFormDrawer.setSubscribed(false);
      const editable = await terminologyFormDrawer.isSubscriptionReferenceEditable();
      await terminologyFormDrawer.close();
      await terminologyManagementPage.saveSubscription(terminology.name, false, data.ignored);
      const stored = await terminologyManagementPage.fetchTerminology(terminology.id);
      expect(stored?.isSubscribed).toBe(false);
      expect(!editable || stored?.subscriptionReference !== data.ignored, 'the reference must be disabled or ignored').toBe(true);
    });
  });

  test(`TC-${CASES.toggle.azureId}: should always show the latest reference when the terminology is subscribed, unsubscribed and subscribed again`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.toggle;
    const terminology = await terminologyIn();

    await steps.critical('Navigate to the Terminology Management module - the terminology list loads', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('Marking it subscribed with a reference shows "Subscribed" and the reference', async () => {
      expect((await terminologyManagementPage.saveSubscription(terminology.name, true, data.first)).status).toBe(200);
      expect((await terminologyManagementPage.fetchTerminology(terminology.id))?.subscriptionReference).toBe(data.first);
    });

    await steps.step('Unmarking it shows "Not Subscribed" and clears or hides the reference', async () => {
      expect((await terminologyManagementPage.saveSubscription(terminology.name, false)).status).toBe(200);
      const stored = await terminologyManagementPage.fetchTerminology(terminology.id);
      expect({ subscribed: stored?.isSubscribed, reference: stored?.subscriptionReference ?? '' }).toEqual({ subscribed: false, reference: '' });
    });

    await steps.step('Marking it subscribed again with a new reference shows "Subscribed" with the new reference', async () => {
      expect((await terminologyManagementPage.saveSubscription(terminology.name, true, data.second)).status).toBe(200);
      const stored = await terminologyManagementPage.fetchTerminology(terminology.id);
      expect({ subscribed: stored?.isSubscribed, reference: stored?.subscriptionReference }).toEqual({ subscribed: true, reference: data.second });
    });
  });

  test(`TC-${CASES.catalogue.azureId}: should show a Subscribed indicator with its reference only on subscribed terminologies when the catalogue is browsed`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.catalogue;
    const subscribed = await terminologyIn({ name: data.subscribed(), subscribed: true, subscriptionReference: data.reference });
    const plain = await terminologyIn({ name: data.plain() });

    await steps.critical('The catalogue view lists the terminologies with their attributes', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.search(subscribed.name);
      await terminologyManagementPage.switchToCards();
    });

    await steps.step('The subscribed terminology shows a "Subscribed" indicator alongside its source reference', async () => {
      expect((await terminologyManagementPage.readCard(subscribed.name)).subscribed).toMatch(data.yes);
      expect(await terminologyManagementPage.getCardText(subscribed.name), 'the source reference on the card').toContain(data.reference);
    });

    await steps.step('The non-subscribed terminology shows no subscription indicator', async () => {
      await terminologyManagementPage.switchToTable();
      await terminologyManagementPage.search(plain.name);
      await terminologyManagementPage.switchToCards();
      expect((await terminologyManagementPage.readCard(plain.name)).subscribed).toMatch(data.no);
      await terminologyManagementPage.switchToTable();
    });
  });

  test(`TC-${CASES.noPermission.azureId}: should block marking a terminology subscribed when the user lacks Reference Data Administrator rights`, async ({
    terminologyManagementPage,
    terminologyIn,
    shapedNonAdmin,
    requireListAccess,
    steps,
  }) => {
    const terminology = await terminologyIn();
    const session = await shapedNonAdmin(CASES.noPermission.granted);
    await requireListAccess(session);

    await steps.critical('The terminology list loads read-only or limited for this user', async () => {
      await session.terminologies.openExpectingDenial();
      expect(await session.terminologies.getPageText(), 'the module should render for the user').not.toBe('');
    });

    await steps.step('The "Mark as Subscribed" action (Edit) is hidden or disabled', async () => {
      expect((await session.terminologies.getActionStateIfListed(terminology.name, 'edit')).availability).not.toBe('available');
    });

    await steps.step('Invoking the subscription change directly is blocked with an access-denied answer', async () => {
      const answer = await session.terminologies.sendUpdate(terminology.id, { subscribed: true, subscriptionReference: CASES.noPermission.reference });
      expect(answer.status, `the server answered ${answer.status}`).toBeGreaterThanOrEqual(400);
      expect((await terminologyManagementPage.fetchTerminology(terminology.id))?.isSubscribed).toBe(false);
    });
  });

  test(`TC-${CASES.malicious.azureId}: should store it safely as plain text or reject it when the source reference holds script and SQL syntax`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.malicious;
    const terminology = await terminologyIn();
    let dialogs = -1;

    await steps.critical('"Mark as Subscribed" shows the subscription reference field', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('Saving the hostile reference is sanitized and stored as plain text, or rejected with a message', async () => {
      dialogs = await terminologyManagementPage.countNativeDialogsDuring(async () => {
        const answer = await terminologyManagementPage.saveSubscription(terminology.name, true, data.reference);
        expect(answer.status === 200 || answer.messages.length + answer.validationErrors.length > 0, 'stored, or rejected with a message').toBe(true);
      });
    });

    await steps.step('The catalogue shows the reference as harmless text with no script run and no error', async () => {
      dialogs += await terminologyManagementPage.countNativeDialogsDuring(async () => {
        await terminologyManagementPage.open();
        await terminologyManagementPage.search(terminology.name);
        await terminologyManagementPage.switchToCards();
        await terminologyManagementPage.getCardText(terminology.name);
        await terminologyManagementPage.switchToTable();
      });
      expect(dialogs, 'script dialogs raised').toBe(0);
      expect(await terminologyManagementPage.waitForVisibleMessages()).toEqual([]);
    });
  });

  test(`TC-${CASES.rapidToggles.azureId}: should stay stable and end in the last saved state when the subscription is toggled rapidly and from two tabs`, async ({
    terminologyManagementPage,
    terminologyIn,
    secondWindow,
    steps,
  }) => {
    const [a, b, c] = CASES.rapidToggles.references;
    const terminology = await terminologyIn();

    await steps.critical('Navigate to the Terminology Management module - the terminology list loads', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('Subscribe, unsubscribe and re-subscribe in quick succession each complete without errors', async () => {
      const statuses = [
        (await terminologyManagementPage.saveSubscription(terminology.name, true, a)).status,
        (await terminologyManagementPage.saveSubscription(terminology.name, false)).status,
        (await terminologyManagementPage.saveSubscription(terminology.name, true, b)).status,
      ];
      expect(statuses).toEqual([200, 200, 200]);
    });

    await steps.step('Conflicting saves from two tabs are serialized or warned about, never corrupting the record', async () => {
      const second = await secondWindow();
      await second.terminologies.open();
      const first = await terminologyManagementPage.saveSubscription(terminology.name, true, c);
      const other = await second.terminologies.saveSubscription(terminology.name, false);
      expect([first.status, other.status].filter((s) => s >= 500), 'server errors').toEqual([]);
    });

    await steps.step('The catalogue shows the subscription state and reference of the last successful save', async () => {
      const stored = await terminologyManagementPage.fetchTerminology(terminology.id);
      expect([`true|${c}`, 'false|']).toContain(`${stored?.isSubscribed}|${stored?.subscriptionReference ?? ''}`);
    });
  });

  test(`TC-${CASES.audit.azureId}: should record the user, time and reference in the audit history when a terminology is subscribed`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.audit;
    const terminology = await terminologyIn();

    await steps.critical('Marking the terminology subscribed with a reference saves it as subscribed', async () => {
      await terminologyManagementPage.open();
      expect((await terminologyManagementPage.saveSubscription(terminology.name, true, data.reference)).status).toBe(200);
    });

    await steps.step('Its audit history entry shows the administrator, the timestamp and the reference that was set', async () => {
      await terminologyDetailPage.open(terminology.id);
      await terminologyDetailPage.audit().open();
      const entry = await terminologyDetailPage.audit().openEntry(0);
      await terminologyDetailPage.audit().closeEntry();
      expect(entry.meta, 'the actor').toMatch(data.actor);
      expect(entry.meta, 'the timestamp').toMatch(/\d{2}\/\d{2}\/\d{4}/);
      expect(entry.changes.map((c) => c.after).join(' | '), 'the reference set').toContain(data.reference);
    });
  });

  test(`TC-${CASES.whitespace.azureId}: should treat it as empty when the reference is whitespace only and save a correctly formatted one exactly`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.whitespace;
    const terminology = await terminologyIn();

    await steps.critical('"Mark as Subscribed" shows the subscription reference field', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('A whitespace-only reference is treated as empty with a required-field message', async () => {
      const answer = await terminologyManagementPage.saveSubscription(terminology.name, true, data.blank);
      expect(answer.status).not.toBe(200);
      expect([answer.referenceError, ...answer.messages, ...answer.validationErrors].join(' | ')).toMatch(MESSAGE.required);
    });

    await steps.step('A correctly formatted reference is saved and shown exactly as entered', async () => {
      expect((await terminologyManagementPage.saveSubscription(terminology.name, true, data.valid)).status).toBe(200);
      expect((await terminologyManagementPage.fetchTerminology(terminology.id))?.subscriptionReference).toBe(data.valid);
    });
  });

  test(`TC-${CASES.immediate.azureId}: should show the new subscription in the catalogue when it is saved from another view`, async ({
    terminologyManagementPage,
    terminologyIn,
    secondWindow,
    steps,
  }) => {
    const terminology = await terminologyIn();

    await steps.critical('The catalogue view in one window and the terminology detail in another both show it not subscribed', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.search(terminology.name);
      await terminologyManagementPage.switchToCards();
      expect((await terminologyManagementPage.readCard(terminology.name)).subscribed).toMatch(/^no$/i);
    });

    await steps.step('Marking it subscribed with a valid reference in the detail window saves successfully', async () => {
      const second = await secondWindow();
      await second.terminologies.open();
      expect((await second.terminologies.saveSubscription(terminology.name, true, CASES.immediate.reference)).status).toBe(200);
    });

    await steps.step('Refreshing the catalogue shows the updated subscribed state and reference without a mismatch', async () => {
      await terminologyManagementPage.reload();
      await terminologyManagementPage.search(terminology.name);
      await terminologyManagementPage.switchToCards();
      expect((await terminologyManagementPage.readCard(terminology.name)).subscribed).toMatch(/^yes$/i);
      expect(await terminologyManagementPage.getCardText(terminology.name)).toContain(CASES.immediate.reference);
      await terminologyManagementPage.switchToTable();
    });
  });
});
