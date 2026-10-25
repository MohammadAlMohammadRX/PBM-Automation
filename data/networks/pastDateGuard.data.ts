import { NETWORK_MESSAGE, pickerDateTime, pickerMinutesFromNow } from './network.data';
import { MESSAGE, buildNetwork } from './networkForm.data';

/**
 * Test data for US 14317 "Prevent effective and expiry dates in the past".
 *
 * The sheet's fixed dates (today = 2026-10-04, yesterday = 2026-10-03, ...)
 * are taken relative to the run day. "Today" for the EFFECTIVE date is a time
 * a few minutes ahead (an effective time already passed today is refused as
 * "in the past" since the date+time build); "today" for the EXPIRY date is
 * today at 23:59.
 */
const todayLate = () => pickerDateTime(0, '23:59');

export const PAST_DATES = {
  effectiveToday: { azureId: '18222', title: 'should create the network when the effective date is today', build: () => buildNetwork({ effectiveDate: pickerMinutesFromNow(5), expiryDate: pickerDateTime(90) }) },
  effectiveFuture: { azureId: '18223', title: 'should create the network when the effective date is in the future', build: () => buildNetwork({ effectiveDate: pickerDateTime(1), expiryDate: pickerDateTime(90) }) },
  expiryToday: { azureId: '18225', title: 'should create the network when the expiry date is today', build: () => buildNetwork({ effectiveDate: pickerMinutesFromNow(5), expiryDate: todayLate() }) },
  scheduled: { azureId: '18233', build: () => buildNetwork({ effectiveDate: pickerDateTime(6), expiryDate: pickerDateTime(371) }) },
} as const;

/** The refused partitions: the date(s) entered and the error(s) each must raise. */
export const REFUSED_DATES = [
  {
    azureId: '18224',
    title: 'should reject the effective date with an error when it is yesterday',
    build: () => buildNetwork({ effectiveDate: pickerDateTime(-1), expiryDate: pickerDateTime(90) }),
    effectiveError: true,
    expiryError: false,
  },
  {
    azureId: '18226',
    title: 'should reject the effective date with an error when it is far in the past',
    build: () => buildNetwork({ effectiveDate: pickerDateTime(-276), expiryDate: pickerDateTime(90) }),
    effectiveError: true,
    expiryError: false,
  },
  {
    azureId: '18227',
    title: 'should reject the expiry date with an error when it is yesterday',
    build: () => buildNetwork({ effectiveDate: pickerMinutesFromNow(5), expiryDate: pickerDateTime(-1) }),
    effectiveError: false,
    expiryError: true,
  },
  {
    azureId: '18228',
    title: 'should reject the expiry date with an error when it is far in the past',
    build: () => buildNetwork({ effectiveDate: pickerMinutesFromNow(5), expiryDate: pickerDateTime(-507) }),
    effectiveError: false,
    expiryError: true,
  },
  {
    azureId: '18230',
    title: 'should reject the record with both date errors when the effective and expiry dates are both in the past',
    build: () => buildNetwork({ effectiveDate: pickerDateTime(-33), expiryDate: pickerDateTime(-19) }),
    effectiveError: true,
    expiryError: true,
  },
  {
    azureId: '18229',
    title: 'should reject the record with an expiry error only when the effective date is valid and the expiry is past',
    build: () => buildNetwork({ effectiveDate: pickerDateTime(1), expiryDate: pickerDateTime(-33) }),
    effectiveError: false,
    expiryError: true,
  },
  {
    azureId: '18231',
    title: 'should reject the record with an effective-date error only when the effective date is past and the expiry is valid',
    build: () => buildNetwork({ effectiveDate: pickerDateTime(-33), expiryDate: pickerDateTime(89) }),
    effectiveError: true,
    expiryError: false,
  },
] as const;

/** The messages for each date rule. */
export const DATE_ERRORS = {
  effective: new RegExp(NETWORK_MESSAGE.effectiveInPast),
  expiry: MESSAGE.expiryInPast,
} as const;

export const STATE_TRANSITION = { azureId: '18232', past: () => pickerDateTime(-14), corrected: () => pickerMinutesFromNow(5) } as const;
export const BLANK_EFFECTIVE = { azureId: '18234' } as const;
export const FEEDBACK_CHECKLIST = { azureId: '18235', past: () => pickerDateTime(-50) } as const;
export const PICKER_CONSISTENCY = { azureId: '18237', yesterday: () => pickerDateTime(-1) } as const;
