import type { PolicyShape } from './policyPermissions.data';
import { POLICY_SCOPED_PAYER } from '../../utils/policy/writerBHelpers';

/**
 * US 15174 "View Policy - Overview" (policy folder 07).
 *
 * The detail screen (verified live 2026-11-03): header (name, number, status,
 * version) and six tabs - Overview, Members (n), Network Assignment (n),
 * Documentation (n), Version History, Audit History. The Overview values are
 * `policy-detail-overview-*`: number, Arabic name, type, plan, payer, holder,
 * status, members ("n / limit"), effective / expiry date, grace period ("—" when
 * none), member limit ("Unlimited" when none), the four amounts ("SAR 1,000.00",
 * "20%") and the benefit year. There is NO English-name value on the Overview:
 * the header carries it.
 *
 * Literal readings and TC-vs-AC notes:
 * - 19498 "a policy with status Active": the Overview's fields do not depend on
 *   the status, so a Future (approved) policy with every field filled is used -
 *   Active policies are scarce seeds (brief). "Policy Name (English)" is looked
 *   for on the screen (the header) since the Overview has no value of its own for it.
 * - 19499: the sheet's names are used ("First Insurance Policy" behind the suite
 *   prefix). "Two separate fields" = the header's English name and the Overview's
 *   Arabic name; the Arabic one must RENDER right-to-left - read from where the
 *   screen draws its first and last characters (2026-11-04 triage: the CSS
 *   direction of the value is "ltr" while the Arabic is drawn right to left by
 *   the bidi algorithm, which is what the case looks at), and neither may be cut off.
 * - 19500 "maximum allowed value (e.g., 9999)": no maximum is documented; 9999
 *   is used as the sheet gives it. Thousands separators are allowed ("9,999").
 * - 19503 "Basic User": the Payer Admin role shaped without GetPolicy, on a Draft
 *   of that account's payer (the list may or may not stay - the case allows both).
 * - 19504 "Sublimit and Grace Period left unset": the grace period is null; the
 *   sublimit is cleared through UpdatePolicy (null) - the form's own hint is
 *   "0 = none", so a stored 0 shown as "SAR 0.00" is what the case calls a
 *   misleading zero.
 * - 19507 "25 members": the system holds about twenty members in all; five are
 *   enrolled (an approved Individual policy, so they are live and counted).
 * - 19508: the sheet's names (Gold Plan / Acme Insurance / John Smith) stand for
 *   the linked records - the suite plan, "Al sharq" and the holder Globex Corporation.
 * - 19510 "Family": the type select offers Individual and Group only; both are checked.
 */
export const CASES = {
  sixTabs: { azureId: '19496' },
  readMode: {
    azureId: '19498',
    spec: { gracePeriodDays: 5, maxMembers: 10, deductibleAmount: 500, coinsurancePercent: 20, outOfPocketMaximum: 5000, sublimitAmount: 2000 },
  },
  bilingualNames: { azureId: '19499', label: 'First Insurance Policy', nameAr: 'سياسة التأمين الأولى' },
  memberLimitBounds: { azureId: '19500', values: [1, 9999] as const },
  noViewAccess: { azureId: '19503', payerName: POLICY_SCOPED_PAYER, shape: { without: ['view'] } satisfies PolicyShape },
  unsetFields: { azureId: '19504' },
  notEditable: { azureId: '19505', typed: '999' },
  rapidTabs: { azureId: '19506', rounds: 3 },
  backToOverview: { azureId: '19507', members: 5 },
  linkedRecords: { azureId: '19508', holder: 'Globex Corporation' },
  coinsuranceShown: { azureId: '19509', values: [0, 50, 100] as const },
  policyTypes: { azureId: '19510', types: [['group', 'Group'], ['individual', 'Individual']] as const },
  sarFormat: {
    azureId: '19514',
    spec: { deductibleAmount: 500, outOfPocketMaximum: 10000, sublimitAmount: 2000 },
    shown: { deductible: 'SAR 500.00', outOfPocket: 'SAR 10,000.00', sublimit: 'SAR 2,000.00' },
  },
} as const;

/** A clear "nothing set" placeholder. */
export const PLACEHOLDER = /^(—|-|N\/A)$/;

/** An access-denied answer on the screen. */
export const DENIED = /permission|not authori[sz]ed|access denied|forbidden|not allowed|denied|unauthori[sz]ed|no access/i;

/** An error a tab may raise. */
export const TAB_ERROR = /error|failed|went wrong|could not|unable/i;
