import { NETWORK_TYPES, pickerDateTime } from './network.data';
import { buildNetwork, networkEffectiveToday } from './networkForm.data';

/**
 * Test data for US 14124 "Specify network type and effective period".
 *
 * The sheet's fixed dates (2026-10-04, 2026-11-01, ...) are expressed relative
 * to the run day, because the form refuses the past: "today" is a time a few
 * minutes ahead, "tomorrow" +1 day. The wizard takes `DD/MM/YYYY HH:mm`.
 *
 * "Advance the system date to the effective date" is done for real: the
 * lifecycle job runs every minute here, so a network approved with an
 * effective time two minutes ahead is the sheet's "effective tomorrow".
 */
export const PERIOD = {
  validPpo: { azureId: '17847', title: 'should create the network and persist its type and dates when type, effective and expiry dates are valid', build: () => networkEffectiveToday({ type: 'PPO' }) },
  effectiveToday: { azureId: '17848', title: 'should accept the effective date and save when it is today', build: () => networkEffectiveToday({ type: 'HMO', expiryDate: pickerDateTime(1, '23:00') }) },
  /** Same calendar day: effective 10:00, expiry 12:00 - the sheet's same-day period. */
  sameDay: { azureId: '17849', title: 'should reject the period with a validation error when the expiry falls on the same day as the effective date', build: () => buildNetwork({ type: 'EPO', effectiveDate: pickerDateTime(6, '10:00'), expiryDate: pickerDateTime(6, '12:00') }) },
  oneDayGap: { azureId: '17850', title: 'should accept the period and save when the expiry is one day after the effective date', build: () => buildNetwork({ type: 'POS', effectiveDate: pickerDateTime(11, '10:00'), expiryDate: pickerDateTime(12, '10:00') }) },
  pastEffective: { azureId: '17851', title: 'should reject the effective date with a validation error when it is in the past', build: () => buildNetwork({ type: 'HMO', effectiveDate: pickerDateTime(-50), expiryDate: pickerDateTime(72) }) },
  pastExpiry: { azureId: '17852', title: 'should reject the expiry date with a validation error when it has already passed', build: () => buildNetwork({ type: 'PPO', effectiveDate: pickerDateTime(1), expiryDate: pickerDateTime(-293) }) },
  typeMissing: { azureId: '17853', build: () => buildNetwork({ effectiveDate: pickerDateTime(6), expiryDate: pickerDateTime(70) }) },
  eachType: { azureId: '17854', selectInTurn: ['HMO', 'EPO', 'POS'] as const },
  statusNotice: { azureId: '17858' },
  pendingToActive: { azureId: '17855', effectiveInMinutes: 2 },
  staysPending: { azureId: '17856', effectiveInMinutes: 1 },
  endToEnd: { azureId: '17857', build: () => networkEffectiveToday({ type: 'HMO' }) },
  reversed: { azureId: '17859', title: 'should reject the period with a validation error when the expiry date is before the effective date', build: () => buildNetwork({ type: 'PPO', effectiveDate: pickerDateTime(58), expiryDate: pickerDateTime(28) }) },
  unusualDates: { azureId: '17860', title: 'should store leap-day and far-future dates unchanged when they are entered', build: () => buildNetwork({ effectiveDate: '29/02/2028 10:00', expiryDate: '31/12/2099 23:00' }) },
  mandatoryChecklist: { azureId: '17861', build: () => buildNetwork() },
  registrationRole: { azureId: '17862' },
  typeList: { azureId: '17863' },
} as const;

/** The administrator-maintained type list (lookup `networkType`), exactly. */
export const CONFIGURED_TYPES = [...NETWORK_TYPES];

/**
 * The status notice the sheet expects per facility/payer combination. The
 * live form shows ONE static notice ("Initial status will be set to Pending
 * and will automatically become Active on the effective date."), and has no
 * facility or payer input at all, so the unmet-conditions wording is a finding.
 */
export const NOTICE = {
  unmet: /remain Pending|until a (pharmacy )?facility|active payer/i,
  met: /become Active|automatically become Active/i,
  conditions: /facility|payer/i,
} as const;
