import { test as base } from '@playwright/test';
import { MemberManagementPage } from '../pages/member/MemberManagementPage';
import { MemberDetailPage } from '../pages/member/MemberDetailPage';
import { MemberFormDrawer } from '../pages/member/MemberFormDrawer';
import { MemberDeactivateDrawer } from '../pages/member/MemberDeactivateDrawer';
import { MemberImportDrawer } from '../pages/member/MemberImportDrawer';
import { MemberAddressTab, MemberEmergencyContactsTab, MemberInformationTab, MemberNonNationalTab } from '../pages/member/MemberRecordTabs';
import { MemberAccumulatorDashboardTab } from '../pages/member/MemberAccumulatorDashboardTab';
import { MemberCobTab } from '../pages/member/MemberCobTab';
import { ConfirmDialog } from '../pages/components/ConfirmDialog';
import { blockedByPrecondition } from './testStatus.fixture';
import { env } from '../constants/EnvironmentConfig';
import { Logger } from '../utils/Logger';
import { createJobClock } from '../utils/JobClock';
import type { RelationshipCode, SuitePolicySpec } from '../utils/PolicyProvisioning';
import {
  SUITE_MEMBER_PREFIX,
  buildMemberImportCsv,
  discardEnrolment,
  discardSuiteMember,
  enrolSuiteMember,
  findMemberByName,
  isSuiteMember,
  listMemberRegister,
  memberStamp,
  provisionSuiteMember,
  startMemberImport,
  suiteImportRow,
  suiteMemberDisplayName,
  suiteMemberLastName,
  waitForImport,
  type JobKey,
  type MemberEnrolment,
  type MemberState,
  type ProvisionedMember,
  type SuiteMemberSpec,
} from '../utils/MemberProvisioning';

/** A suite member enrolled in its own suite policies (approved unless asked otherwise). */
export interface EnrolledMember {
  member: ProvisionedMember;
  /** One per policy, in creation order (the first created starts earliest). */
  enrolments: MemberEnrolment[];
}

/** What memberEnrolled builds. */
export interface EnrolledMemberSpec {
  /** The member's state / spec (default Active, no flags). */
  state?: MemberState;
  member?: SuiteMemberSpec;
  /** How many suite policies (default 1). Each is a NEW Individual policy of "Al sharq". */
  policies?: number;
  /** false leaves the enrolment(s) in DRAFT policies (not listed on the Dashboard / COB tabs; the member is then deletable). Default true. */
  approve?: boolean;
  relationship?: RelationshipCode;
  /** Per-policy terms; `policySpecs[i]` overrides `policy` for the i-th policy. Default effective in 3 + i minutes, 90 days long. */
  policy?: SuitePolicySpec;
  policySpecs?: SuitePolicySpec[];
}

/** The administrator's scheduled-job clock (System Settings > Settings > General). */
export interface MemberJobClock {
  /** The job's stored CRON now (UTC `m h * * *`). */
  read: (key: JobKey) => Promise<string>;
  /**
   * Moves the job to fire `minutesFromNow` from now (daily UTC CRON) - the
   * ORIGINAL value is remembered on the first move and ALWAYS restored (and
   * re-read) at teardown. Returns `{ original, cron }`. Administrator only.
   */
  moveTo: (key: JobKey, minutesFromNow: number) => Promise<{ original: string; cron: string }>;
  /** Restores one job now (teardown restores the rest). */
  restore: (key: JobKey) => Promise<void>;
}

export interface MemberModuleFixtures {
  /** The list (`/member-management`). */
  memberManagementPage: MemberManagementPage;
  /** The view page (`/member-management/{id}`). */
  memberDetailPage: MemberDetailPage;
  /** The Add / Edit wizard (`member-form-drawer`, list and detail alike). */
  memberFormDrawer: MemberFormDrawer;
  /** The DETAIL's Deactivate drawer (`member-detail-deactivate-drawer`). */
  memberDeactivateDrawer: MemberDeactivateDrawer;
  /** The LIST's Deactivate drawer (`member-deactivate-drawer`). */
  memberListDeactivateDrawer: MemberDeactivateDrawer;
  memberInformationTab: MemberInformationTab;
  memberNonNationalTab: MemberNonNationalTab;
  memberAddressTab: MemberAddressTab;
  memberEmergencyContactsTab: MemberEmergencyContactsTab;
  /** The PBM Accumulator Dashboard tab (the Member Benefit Accumulator page itself is the Policy suite's `memberAccumulatorPage`). */
  memberAccumulatorDashboardTab: MemberAccumulatorDashboardTab;
  /** The Coverage Ordering (COB) tab. */
  memberCobTab: MemberCobTab;
  /** The list's bulk Import drawer (`member-list-bulk-import`). */
  memberImportDrawer: MemberImportDrawer;
  /** The shared confirmation dialog (`#pbm-dialog`) - Delete Member ID (No / Yes), Activate Member (Cancel / Activate), Unsaved Changes, Export / template format. */
  memberConfirmDialog: ConfirmDialog;
  /**
   * Builds a suite member ("QA Automation Member<stamp>", Arabic letters only,
   * unique document ID / e-mail / mobile) in `state` through the API and
   * DISCARDS it at teardown (deleted; deactivated when an enrolment blocks the
   * delete). BLOCKED, with the server's answer, when the application refuses.
   */
  memberIn: (state?: MemberState, spec?: SuiteMemberSpec) => Promise<ProvisionedMember>;
  /**
   * A suite member enrolled in `policies` NEW suite policies (Individual,
   * "Al sharq", approved -> Future; ~15 s each) - what the PBM Accumulator
   * Dashboard and Coverage Ordering tabs need. Teardown retires the policies
   * (an approved Individual policy cannot be deleted) and DEACTIVATES the
   * member (an approved enrolment blocks the delete: 409 "Member cannot be
   * deleted because they have active policy enrollments.").
   */
  memberEnrolled: (spec?: EnrolledMemberSpec) => Promise<EnrolledMember>;
  /**
   * Imports `count` fresh suite members through the bulk import API (one CSV,
   * last names `MemberVol<batch>n<i>`) and waits for the import to finish -
   * the volume cases (19863). Teardown deletes every member of the batch.
   */
  memberVolume: (count: number) => Promise<{ batch: string; operation: Record<string, unknown>; members: { id: string; displayNameEn: string }[] }>;
  /** Registers a member the CASE creates through the screen (or an import), by display name, for teardown. Suite names only. */
  discardMemberNamed: (displayNameEn: string) => void;
  /** Registers a member the case creates, by id, for teardown. */
  discardMemberId: (id: string) => void;
  /** Moves scheduled jobs (Jobs.AccumulatorAnnualResetCron ...) and ALWAYS restores them at teardown. */
  memberJobClock: MemberJobClock;
}

const newSuiteName = (): { lastName: string; displayNameEn: string } => {
  const lastName = suiteMemberLastName(memberStamp());
  return { lastName, displayNameEn: suiteMemberDisplayName(lastName) };
};

export const test = base.extend<MemberModuleFixtures>({
  memberManagementPage: async ({ page }, use) => {
    await use(new MemberManagementPage(page));
  },

  memberDetailPage: async ({ page }, use) => {
    await use(new MemberDetailPage(page));
  },

  memberFormDrawer: async ({ page }, use) => {
    await use(new MemberFormDrawer(page));
  },

  memberDeactivateDrawer: async ({ page }, use) => {
    await use(new MemberDeactivateDrawer(page, 'detail'));
  },

  memberListDeactivateDrawer: async ({ page }, use) => {
    await use(new MemberDeactivateDrawer(page, 'list'));
  },

  memberInformationTab: async ({ page }, use) => {
    await use(new MemberInformationTab(page));
  },

  memberNonNationalTab: async ({ page }, use) => {
    await use(new MemberNonNationalTab(page));
  },

  memberAddressTab: async ({ page }, use) => {
    await use(new MemberAddressTab(page));
  },

  memberEmergencyContactsTab: async ({ page }, use) => {
    await use(new MemberEmergencyContactsTab(page));
  },

  memberAccumulatorDashboardTab: async ({ page }, use) => {
    await use(new MemberAccumulatorDashboardTab(page));
  },

  memberCobTab: async ({ page }, use) => {
    await use(new MemberCobTab(page));
  },

  memberImportDrawer: async ({ page }, use) => {
    await use(new MemberImportDrawer(page));
  },

  memberConfirmDialog: async ({ page }, use) => {
    await use(new ConfirmDialog(page));
  },

  memberIn: async ({ page }, use, testInfo) => {
    const built: string[] = [];
    await use(async (state = 'Active', spec = {}) => {
      // Named BEFORE it is built, so a step refused half-way still discards what was created.
      const { lastName, displayNameEn } = spec.lastName ? { lastName: spec.lastName, displayNameEn: suiteMemberDisplayName(spec.lastName) } : newSuiteName();
      try {
        if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
        const member = await provisionSuiteMember(page, state, { ...spec, lastName }).catch(async (error: unknown) => {
          const partial = await findMemberByName(page, displayNameEn).catch(() => null);
          if (partial) built.push(partial.id);
          throw error;
        });
        built.push(member.id);
        return member;
      } catch (error) {
        return blockedByPrecondition(testInfo, `a suite member in state ${state} ${JSON.stringify(spec).slice(0, 160)}`, error);
      }
    });
    for (const id of [...built].reverse()) await discardSuiteMember(page, id);
  },

  memberEnrolled: async ({ page }, use, testInfo) => {
    const members: string[] = [];
    const enrolments: MemberEnrolment[] = [];
    await use(async (spec = {}) => {
      const { lastName, displayNameEn } = spec.member?.lastName ? { lastName: spec.member.lastName, displayNameEn: suiteMemberDisplayName(spec.member.lastName) } : newSuiteName();
      try {
        if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
        const member = await provisionSuiteMember(page, spec.state ?? 'Active', { ...spec.member, lastName }).catch(async (error: unknown) => {
          const partial = await findMemberByName(page, displayNameEn).catch(() => null);
          if (partial) members.push(partial.id);
          throw error;
        });
        members.push(member.id);
        const own: MemberEnrolment[] = [];
        for (let i = 0; i < (spec.policies ?? 1); i += 1) {
          const policy: SuitePolicySpec = { effectiveInMinutes: 3 + i, expiryInDays: 90, ...spec.policy, ...(spec.policySpecs?.[i] ?? {}) };
          const enrolment = await enrolSuiteMember(page, member.id, { approve: spec.approve, relationship: spec.relationship, policy });
          enrolments.push(enrolment);
          own.push(enrolment);
        }
        return { member, enrolments: own };
      } catch (error) {
        return blockedByPrecondition(testInfo, `a suite member enrolled in ${spec.policies ?? 1} suite polic${(spec.policies ?? 1) === 1 ? 'y' : 'ies'} ${JSON.stringify(spec).slice(0, 160)}`, error);
      }
    });
    for (const enrolment of [...enrolments].reverse()) {
      const outcome = await discardEnrolment(page, enrolment).catch(() => 'left');
      Logger.step(`[fixture] Policy ${enrolment.policy.nameEn}: ${outcome}`);
    }
    for (const id of [...members].reverse()) {
      const outcome = await discardSuiteMember(page, id);
      Logger.step(`[fixture] Enrolled member ${id}: ${outcome}`);
    }
  },

  memberVolume: async ({ page }, use, testInfo) => {
    const batches: string[] = [];
    await use(async (count) => {
      const batch = `MemberVol${memberStamp()}`;
      batches.push(batch);
      try {
        if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
        const rows: Record<string, string>[] = [];
        for (let i = 0; i < count; i += 1) rows.push(await suiteImportRow(page, { 'Last Name (English) *': `${batch}n${i}` }));
        const started = await startMemberImport(page, { name: `${batch}.csv`, mimeType: 'text/csv', buffer: buildMemberImportCsv(rows) });
        if (started.status >= 300 || !started.operationId) throw new Error(`ImportMembers answered ${started.status} ${started.text.slice(0, 300)}`);
        const operation = await waitForImport(page, started.operationId, Math.max(120_000, count * 2_000));
        const found = (await listMemberRegister(page, { searchText: batch }, Math.max(100, count + 10))).items
          .filter((m) => isSuiteMember(m) && m.englishLastName.startsWith(batch));
        Logger.step(`[fixture] Imported ${found.length}/${count} volume members (${batch}): ${String(operation.status)}`);
        return { batch, operation, members: found.map((m) => ({ id: m.id, displayNameEn: m.displayNameEn })) };
      } catch (error) {
        return blockedByPrecondition(testInfo, `${count} suite members imported in bulk`, error);
      }
    });
    for (const batch of batches) {
      const left = (await listMemberRegister(page, { searchText: batch }, 500).catch(() => ({ items: [] }))).items.filter((m) => isSuiteMember(m) && m.englishLastName.startsWith(batch));
      for (const m of left) await discardSuiteMember(page, m.id);
      Logger.step(`[fixture] Discarded ${left.length} volume members (${batch})`);
    }
  },

  discardMemberNamed: async ({ page }, use) => {
    const names: string[] = [];
    await use((displayNameEn) => {
      if (!displayNameEn.startsWith(`${SUITE_MEMBER_PREFIX} `)) throw new Error(`"${displayNameEn}" is not a suite member name (prefix "${SUITE_MEMBER_PREFIX}")`);
      names.push(displayNameEn);
    });
    for (const name of names) {
      const found = await findMemberByName(page, name).catch(() => null);
      if (found) {
        Logger.step(`[fixture] Discarding the case's member "${name}"`);
        await discardSuiteMember(page, found.id);
      }
    }
  },

  discardMemberId: async ({ page }, use) => {
    const ids: string[] = [];
    await use((id) => ids.push(id));
    for (const id of ids.reverse()) await discardSuiteMember(page, id);
  },

  memberJobClock: async ({ page }, use) => {
    // Delegates to the shared clock (utils/JobClock.ts, 2026-11-08): same
    // move / restore / read-back, one implementation for every suite.
    const clock = createJobClock(page, { label: 'memberJobClock', reauth: async () => { await page.goto(env.baseUrl); } });
    await use({
      read: (key) => clock.read(key),
      moveTo: async (key, minutesFromNow) => {
        const { original, cron } = await clock.moveTo(key, minutesFromNow);
        return { original, cron };
      },
      restore: async (key) => {
        await clock.restore(key);
      },
    });
    await clock.restoreAll();
  },
});
