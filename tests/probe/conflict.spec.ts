import { test, expect } from '../../fixtures';
import { Logger } from '../../utils/Logger';
import { buildUniquePayer } from '../../data/payers/payer.data';

/** Throwaway: the full 409 ValidationErrors, on the suite's own approve path. */
test('probe: the approve conflict, in full', async ({
  payerManagementPage,
  approvalManagementPage,
  page,
  steps,
}) => {
  test.setTimeout(600_000);
  const payer = buildUniquePayer({});
  const bodies: { status: number; text: string }[] = [];

  page.on('response', async (res) => {
    if (!/ApproveRequest|RejectRequest/i.test(res.url())) return;
    const text = await res.text().catch(() => '(unreadable)');
    bodies.push({ status: res.status(), text });
  });

  await steps.step('Create and submit a payer', async () => {
    await payerManagementPage.open();
    await payerManagementPage.createDraftPayer(payer);
    await payerManagementPage.open();
    await payerManagementPage.sendForApproval(payer.nameEn);
    expect(true).toBe(true);
  });

  await steps.step('Approve it exactly as the suite does', async () => {
    await approvalManagementPage.open();
    const outcome = await approvalManagementPage
      .approve(payer.nameEn)
      .then(() => 'SUCCEEDED')
      .catch((e: Error) => `FAILED: ${e.message.split('\n')[0].slice(0, 80)}`);
    Logger.info(`PROBE approve() ${outcome}`);

    for (const b of bodies) {
      Logger.info(`PROBE response status ${b.status}`);
      try {
        const parsed = JSON.parse(b.text) as {
          Title?: string;
          ValidationErrors?: { Name?: string; Reason?: string }[];
        };
        Logger.info(`PROBE title: ${parsed.Title}`);
        const errors = parsed.ValidationErrors ?? [];
        Logger.info(`PROBE validation errors: ${errors.length}`);
        for (const v of errors) Logger.info(`PROBE   ${v.Name} => ${v.Reason}`);
      } catch {
        Logger.info(`PROBE unparseable, raw tail: ${b.text.slice(-260)}`);
      }
    }
    expect(true).toBe(true);
  });

  await steps.step('Clean up', async () => {
    await payerManagementPage.open();
    await payerManagementPage.deletePayer(payer.nameEn).catch(() => undefined);
    expect(true).toBe(true);
  });
});
