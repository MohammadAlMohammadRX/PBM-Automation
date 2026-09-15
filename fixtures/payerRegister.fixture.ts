import { test as base } from '@playwright/test';
import { ExportMenu } from '../pages/components/ExportMenu';
import { PayerManagementPage } from '../pages/payer/PayerManagementPage';
import { Logger } from '../utils/Logger';
import { blockedByPrecondition } from './testStatus.fixture';

/** One payer as the register's own export reports it. */
export interface RegisteredPayer {
  code: string;
  nameEn: string;
  status: string;
  effectiveDate: string;
  expiryDate: string;
  /** Midnight UTC of the expiry date, or null when the export carries none. */
  expiresOn: Date | null;
}

/**
 * Every payer in the register, already sorted into the three classes the
 * expiry rule turns on.
 */
export interface PayerRegister {
  all: RegisteredPayer[];
  /** Expiry date strictly before today - the job should have expired these. */
  lapsed: RegisteredPayer[];
  /** Expiry date exactly today - NOT yet passed, so nothing should change. */
  dueToday: RegisteredPayer[];
  /** Expiry date after today. */
  future: RegisteredPayer[];
  /** Today, as midnight UTC, so a caller can report the comparison it made. */
  today: Date;
  describe: (payer: RegisteredPayer) => string;
}

export interface PayerRegisterFixtures {
  payerRegister: PayerRegister;
}

/**
 * Reads every payer's status and expiry date straight out of the register.
 *
 * WHY THIS EXISTS ALONGSIDE THE SEED. The seeded rows answer the one question
 * the register cannot - an INACTIVE payer past its expiry, which no record here
 * has ever held - and they take a day to ripen. But the batch-level cases ask
 * something the register answers in full, today: is EVERY lapsed payer Expired,
 * and is every payer still inside its window left alone? That is a question
 * about the whole population, and the population is right there. Sourcing it
 * from the register also makes those cases permanent - they re-check the rule
 * on every run instead of depending on a seed someone remembered to plant.
 *
 * The list export is the reading, not the table: it returns all 300-odd rows in
 * one request, with Status and Expiry Date as columns, where paging the table
 * would take a minute per case and could drift between pages.
 */
const EXPIRY_COLUMN = 'Expiry Date';
const EFFECTIVE_COLUMN = 'Effective Date';
const STATUS_COLUMN = 'Status';
const NAME_COLUMN = 'Payer Name';
const CODE_COLUMN = 'Payer Code';

/** Accepts either shape the application uses: DD/MM/YYYY or YYYY-MM-DD. */
export const parseRegisterDate = (value: string): Date | null => {
  const trimmed = (value ?? '').trim();
  const slashed = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (slashed !== null) {
    return new Date(Date.UTC(Number(slashed[3]), Number(slashed[2]) - 1, Number(slashed[1])));
  }
  const dashed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dashed !== null) {
    return new Date(Date.UTC(Number(dashed[1]), Number(dashed[2]) - 1, Number(dashed[3])));
  }
  return null;
};

/** Midnight UTC today, so every comparison is date-only. */
const startOfToday = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
};

export const test = base.extend<PayerRegisterFixtures>({
  payerRegister: async ({ page }, use, testInfo) => {
    const payerPage = new PayerManagementPage(page);
    const exportMenu = new ExportMenu(page);

    await payerPage.open();
    const csv = await exportMenu.exportCsv('all').catch((error: Error) => {
      blockedByPrecondition(testInfo, 'the payer register as an export', error);
      return null;
    });
    if (csv === null) return;

    const today = startOfToday();
    const all: RegisteredPayer[] = csv.rows.map((row) => ({
      code: (row[CODE_COLUMN] ?? '').trim(),
      nameEn: (row[NAME_COLUMN] ?? '').trim(),
      status: (row[STATUS_COLUMN] ?? '').trim(),
      effectiveDate: (row[EFFECTIVE_COLUMN] ?? '').trim(),
      expiryDate: (row[EXPIRY_COLUMN] ?? '').trim(),
      expiresOn: parseRegisterDate(row[EXPIRY_COLUMN] ?? ''),
    }));

    const dated = all.filter((payer) => payer.expiresOn !== null);
    const register: PayerRegister = {
      all,
      lapsed: dated.filter((payer) => payer.expiresOn!.getTime() < today.getTime()),
      dueToday: dated.filter((payer) => payer.expiresOn!.getTime() === today.getTime()),
      future: dated.filter((payer) => payer.expiresOn!.getTime() > today.getTime()),
      today,
      describe: (payer) =>
        `${payer.code} "${payer.nameEn}" expiring ${payer.expiryDate} reads "${payer.status}"`,
    };

    Logger.info(
      `[fixture] register: ${all.length} payer(s) - ${register.lapsed.length} past their expiry, `
        + `${register.dueToday.length} expiring today, ${register.future.length} still in window`,
    );
    await use(register);
  },
});
