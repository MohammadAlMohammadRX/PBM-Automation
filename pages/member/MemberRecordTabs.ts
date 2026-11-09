import type { Page } from '@playwright/test';
import { Timeouts } from '../../constants/Timeouts';
import {
  MEMBER_DETAIL,
  type MemberAddressValue,
  type MemberDetailTab,
  type MemberEmergencyValue,
  type MemberNonNationalValue,
  type MemberPatientValue,
} from '../../constants/member/memberIds';
import { Logger } from '../../utils/Logger';

/**
 * The four record tabs of a member's view page (verified live 2026-11-05) -
 * label / value grids rendered from the same GetMember answer. Every value
 * carries an id (`member-detail-{section}-{field}`); empty values show "—";
 * the labels carry no id (read off the value's row by `readLabels`).
 */
abstract class MemberValuesTab<Field extends string> {
  protected abstract readonly tabKey: MemberDetailTab;
  protected abstract readonly ids: Record<Field, string>;

  constructor(protected readonly page: Page) {}

  /** Clicks the tab and waits for its first value. */
  async open(): Promise<void> {
    Logger.step(`Opening the member's ${this.tabKey} tab`);
    await this.page.locator(`#${MEMBER_DETAIL.tab[this.tabKey]}`).click();
    await this.page.locator(`#${Object.values<string>(this.ids)[0]}`).first().waitFor({ state: 'visible', timeout: Timeouts.default }).catch(() => undefined);
  }

  async isOffered(): Promise<boolean> {
    return this.page.locator(`#${MEMBER_DETAIL.tab[this.tabKey]}`).isVisible().catch(() => false);
  }

  /** One value as shown ('' when not rendered; "—" when empty). */
  async readField(field: Field, index = 0): Promise<string> {
    return this.page.locator(`#${this.ids[field]}`).nth(index).innerText({ timeout: Timeouts.short }).then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => '');
  }

  /** Every value of the tab, by field. */
  async read(index = 0): Promise<Record<Field, string>> {
    const out = {} as Record<Field, string>;
    for (const field of Object.keys(this.ids) as Field[]) out[field] = await this.readField(field, index);
    return out;
  }

  async hasField(field: Field): Promise<boolean> {
    return this.page.locator(`#${this.ids[field]}`).first().isVisible().catch(() => false);
  }

  /** The tab's labels with their values ("Display Name" -> "QA Automation Member..."), read off the value rows. */
  async readLabels(): Promise<Record<string, string>> {
    const ids = Object.values<string>(this.ids);
    return this.page.locator(ids.map((id) => `#${id}`).join(', ')).evaluateAll((values) => {
      const out: Record<string, string> = {};
      for (const value of values) {
        const row = value.parentElement;
        const label = row ? Array.from(row.children).find((c) => c !== value) : undefined;
        out[(label as HTMLElement | undefined)?.innerText.trim() ?? value.id] = (value as HTMLElement).innerText.replace(/\s+/g, ' ').trim();
      }
      return out;
    });
  }

  /** The open tab's whole text. */
  async getText(): Promise<string> {
    return (await this.page.locator(`#${MEMBER_DETAIL.root}`).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }
}

/**
 * Member Information: Display Name, E-Health ID, Document ID, Identity Type,
 * Date of Birth (RAW `1990-05-15`), Hijri Date of Birth, Age (whole years),
 * Nationality, Gender, Place of Birth, Occupation, Marital Status, Member
 * Status, Special Needs ("Verified" / "Not verified"), Policy Holder, and
 * Record Information (Created By "CareConnect Admin User", Created On
 * "05/11/2026 02:03 AM", Modified By / On - "—" until the first edit).
 */
export class MemberInformationTab extends MemberValuesTab<MemberPatientValue> {
  protected readonly tabKey: MemberDetailTab = 'patient';
  protected readonly ids = MEMBER_DETAIL.patient;
}

/** Non-National Registry: Insurance Number, Country Dial Code ("+966 (Saudi Arabia)"), Mobile Number, Email, Preferred Contact Method, Preferred Language, Blood Group, VIP ("Verified" / "Not verified"). */
export class MemberNonNationalTab extends MemberValuesTab<MemberNonNationalValue> {
  protected readonly tabKey: MemberDetailTab = 'nonNational';
  protected readonly ids = MEMBER_DETAIL.nonNational;
}

/** Address: Country, City, District, Street, Building Number, Postal Code, Additional Number. */
export class MemberAddressTab extends MemberValuesTab<MemberAddressValue> {
  protected readonly tabKey: MemberDetailTab = 'address';
  protected readonly ids = MEMBER_DETAIL.address;
}

/**
 * Emergency Contacts: one block per contact (Name, Relationship, Phone Number,
 * Created On / By, Modified On / By). Every block repeats the ids - `index`
 * picks the block. Empty: "No emergency contacts on file.".
 */
export class MemberEmergencyContactsTab extends MemberValuesTab<MemberEmergencyValue> {
  protected readonly tabKey: MemberDetailTab = 'emergency';
  protected readonly ids = MEMBER_DETAIL.emergency;

  async countContacts(): Promise<number> {
    return this.page.locator(`#${MEMBER_DETAIL.emergency.name}`).count(); // locator-exception: every contact block repeats the id.
  }

  /** Every contact block, in order. */
  async readContacts(): Promise<Record<MemberEmergencyValue, string>[]> {
    const out: Record<MemberEmergencyValue, string>[] = [];
    for (let i = 0; i < (await this.countContacts()); i += 1) out.push(await this.read(i));
    return out;
  }

  /** "No emergency contacts on file." when none, else ''. */
  async getEmptyText(): Promise<string> {
    return (await this.getText()).includes('No emergency contacts on file.') ? 'No emergency contacts on file.' : '';
  }
}
