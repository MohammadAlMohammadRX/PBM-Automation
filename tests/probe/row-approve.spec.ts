import { test, expect } from '../../fixtures';
import { Logger } from '../../utils/Logger';
import { buildUniquePayer } from '../../data/payers/payer.data';

/** Throwaway: drive the ROW approve exactly as the suite does, and watch the wire. */
test('probe: the row-level approve', async ({ payerManagementPage, approvalManagementPage, page, steps }) => {
  test.setTimeout(600_000);
  const payer = buildUniquePayer({});
  const calls: string[] = [];

  page.on('response', async (res) => {
    const u = res.url();
    if (!/\/api\//i.test(u)) return;
    if (!/approv|decision|payer/i.test(u)) return;
    if (res.request().method() === 'GET') return;
    let body = '';
    try { body = (await res.text()).slice(0, 180); } catch { body = '(unreadable)'; }
    calls.push(`${res.status()} ${res.request().method()} ${u.split('/api/')[1]} :: ${body}`);
  });

  await steps.step('Create and submit', async () => {
    await payerManagementPage.open();
    await payerManagementPage.createDraftPayer(payer);
    await payerManagementPage.open();
    await payerManagementPage.sendForApproval(payer.nameEn);
    expect(true).toBe(true);
  });

  await steps.step('Open the ROW approve dialog and read it', async () => {
    await approvalManagementPage.open();
    await approvalManagementPage.search(payer.nameEn);
    const rowId = await page.locator('tr[id^="approvals-payer-table-row-"]').first().getAttribute('id');
    Logger.info(`PROBE row id: ${rowId}`);
    calls.length = 0;

    await page.locator(`button#${rowId}-approve, #${rowId}-approve > button`).first().click();
    await page.waitForTimeout(3500);

    const title = await page.locator('#pbm-dialog-title').innerText().catch(() => '(none)');
    const message = await page.locator('#pbm-dialog-message').innerText().catch(() => '(none)');
    const items = await page.locator('[id^="pbm-dialog-item-"]').count();
    Logger.info(`PROBE dialog title  : ${title.replace(/\s+/g, ' ').trim()}`);
    Logger.info(`PROBE dialog message: ${message.replace(/\s+/g, ' ').trim().slice(0, 200)}`);
    Logger.info(`PROBE dialog items  : ${items}`);
    expect(true).toBe(true);
  });

  await steps.step('Acknowledge, confirm, and watch what the server answers', async () => {
    const ack = page.locator('#pbm-dialog-acknowledge-checkbox');
    if (await ack.count()) {
      await ack.locator('xpath=..').click();
      Logger.info(`PROBE acknowledgement ticked: ${await ack.isChecked()}`);
    }
    const confirm = page.locator('button#pbm-dialog-action-confirm, #pbm-dialog-action-confirm > button').first();
    Logger.info(`PROBE confirm enabled: ${await confirm.isEnabled()}`);
    await confirm.click();
    await page.waitForTimeout(9000);

    Logger.info(`PROBE dialog still open: ${await page.locator('#pbm-dialog').isVisible().catch(() => false)}`);
    for (const c of calls) Logger.info(`PROBE call ${c}`);
    const toast = await page.locator('[id*="toast"]').allInnerTexts().catch((): string[] => []);
    Logger.info(`PROBE toast: ${JSON.stringify(toast.map((t) => t.replace(/\s+/g, ' ').trim()).slice(0, 3))}`);
    expect(true).toBe(true);
  });

  await steps.step('And the payer afterwards', async () => {
    await payerManagementPage.open();
    await payerManagementPage.search(payer.nameEn);
    Logger.info(`PROBE payer: lifecycle="${await payerManagementPage.getLifecycleStatus(payer.nameEn).catch(() => '?')}" approval="${await payerManagementPage.getApprovalStatus(payer.nameEn).catch(() => '?')}"`);
    await payerManagementPage.deletePayer(payer.nameEn).catch(() => undefined);
    expect(true).toBe(true);
  });
});
