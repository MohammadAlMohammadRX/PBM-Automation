import { nonAdminBlockReason } from '../accounts/nonAdminAccount.data';
import type { BlockedCase } from './payerTypes';

/**
 * Test data for "View Comprehensive Payer Details with Tabs".
 *
 * The tab strip and Version History are the version-history story's (folder
 * 10); the Linked Networks and Linked Policies sections have their own stories
 * (folders 55, 54). This sheet's own ground is the detail view as a whole: the
 * Overview is read-only and complete, sections show empty states, switching
 * tabs loses nothing, and rapid switching or browser navigation leaves a
 * consistent view. Cases needing policies, pagination or other roles are
 * BLOCKED on those resources.
 */

/** The Overview and contact attributes the checklist requires, by their labels. */
export const OVERVIEW_LABELS = [
  'Payer Code',
  'License Number',
  'Effective Date',
  'Expiry Date',
  'Created By',
  'Created At',
  'Email Address',
  'Phone Number',
  'Preferred Language',
  'Preferred Contact Method',
] as const;

/**
 * How each attribute is expected to be formatted.
 *
 * VERIFIED: the Overview renders its dates as ISO (`2026-08-13`) while the
 * audit trail renders `DD/MM/YYYY`; either is a complete, unambiguous date,
 * so both are accepted.
 */
export const ATTRIBUTE_FORMAT: Readonly<Record<string, RegExp>> = {
  'Effective Date': /\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}/,
  'Expiry Date': /\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}/,
  'Created At': /\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}|\d{4}/,
  'Email Address': /.+@.+\..+/,
  'Phone Number': /\d{6,}/,
  'Payer Code': /^PAY-\d+$/,
};

/** How many times the tabs are cycled in the rapid-switching case. */
export const RAPID_TAB_CYCLES = 3;

/**
 * The management action the role case expects withheld from the Payer Admin,
 * whose role is defined without payer deletion (see nonAdminAccount.data).
 */
export const ACTION_WITHHELD_FROM_PAYER_ADMIN = 'delete';

/** The tabs every role that can open a payer is expected to see. */
export const DETAIL_TAB_LABELS = ['Overview', 'Linked Networks', 'Linked Policies', 'Version History', 'Audit History'] as const;

/** The sheet's cases this environment cannot exercise, in renumbered order. */
export const BLOCKED_CASES: readonly BlockedCase[] = [
  {
    id: '003',
    title: 'should show the required columns with accurate data on the Linked Policies tab',
    reason: 'This case needs a payer that OWNS policies; none exists here and the Policies module is outside this framework (see folder 54).',
  },
  {
    id: '005',
    title: 'should paginate the Linked Policies tab correctly at the page-size boundary',
    reason: 'This case needs a payer with one more policy than the page size (e.g. 21); no payer here owns a policy.',
  },
  {
    id: '008',
    title: 'should display a linked policy with missing optional fields without breaking the view',
    reason: 'This case needs a linked policy with an optional field left empty - created in the Policies module, outside this framework.',
  },
  {
    id: '011',
    title: 'should deny the Payer Details view to a user without Payer Management view permission',
    reason: `${nonAdminBlockReason({ lacking: ['viewPayerDetails'] })} The case needs an account without the view permission.`,
  },
  {
    id: '012',
    title: 'should reflect an external policy update on the Linked Policies tab after reload',
    reason: 'This case needs a linked policy whose status is changed in the Policies module during the run - outside this framework.',
  },
];
