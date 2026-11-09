/**
 * US 14376 "Member List - Dashboard Counters" (member folder 01), 10 cases.
 *
 * How the cases map onto the live list (2026-11-05, Member-Foundation-Notes.md):
 *  - The "dashboard" is the list's KPI band: Total Members, Active Members,
 *    Inactive Members, Special Needs (`member-list-kpi-*`). The values count up
 *    from 0 - read settled. Special Needs counts the FLAG whatever the status.
 *  - The "Member Administrator" is the ADMIN account (no such role / account
 *    exists - writers brief); the administrator holds every payer
 *    (`allowAllPayers`), so "an administrator assigned to Payer A" is the admin
 *    with Payer A chosen in the breadcrumb payer select (`X-Selected-Payer-Id`).
 *  - Members belong to a payer only through policy enrolments: Payer A is the
 *    Policy suite's payer "Al sharq" with a suite member enrolled in a NEW suite
 *    policy (`memberEnrolled`), next to a suite member enrolled nowhere.
 *  - The shared register is never changed: counts are compared with what the
 *    register holds at the moment (read through GetMembers), the case's own
 *    members built through the API and discarded at teardown.
 *  - 19776 "Payer A: 50 / 30 / 15 / 5" cannot be seeded on the shared register:
 *    the tiles are compared with the register's real counts (the case's own
 *    Active, Inactive and flagged members added so every category is present).
 *  - 19780 needs a payer whose scope holds EXACTLY ONE member. The suite cannot
 *    create a payer, and the suite payer's scope also holds earlier runs' retired
 *    enrolments: the case reads the suite payer's scope and is data-driven
 *    BLOCKED when it does not hold exactly one member.
 *  - 19781 "Payer A and Payer B": Payer A = the suite payer "Al sharq", Payer B =
 *    the first other payer the select offers (read-only).
 *  - 19784's "add a member" goes through the Add New Member wizard; "inactivate
 *    another" and "delete a third" through the row actions - the tiles are
 *    watched after each action without reloading.
 */
export const CASES = {
  statusChange: { azureId: '19773' },
  activeCounter: { azureId: '19774', status: 'Active' },
  inactiveCounter: { azureId: '19775', status: 'Inactive' },
  fourCounters: { azureId: '19776', labels: [/total/i, /active/i, /inactive/i, /special needs/i] },
  specialNeedsFlag: { azureId: '19777' },
  payerScoped: { azureId: '19778' },
  oneMember: { azureId: '19780' },
  switchPayers: { azureId: '19781' },
  sequence: { azureId: '19784' },
  tileLabels: { azureId: '19785', labels: [/^total/i, /^active/i, /^inactive/i, /^special needs/i] },
} as const;

/** The wizard data of 19784's added member (the suite's own name is set by the test). */
export const WIZARD_MEMBER = {
  nationality: 'Saudi (SAU)',
  dateOfBirth: '1990-05-15',
  gender: 'Male',
  memberStatus: 'Alive',
  preferredContactMethod: 'Email',
  preferredLanguage: 'English',
  country: 'Saudi Arabia',
} as const;
