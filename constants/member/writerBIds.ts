import { MEMBER_FORM } from './memberIds';

/**
 * Ids Writer B's member folders (05 Create Member, 07 Edit Member) need beyond
 * constants/member/memberIds.ts.
 */

/**
 * The Country Dial Code control the Add New Member wizard would carry (20342).
 * The wizard has NO such control on 2026-11-05 (Member-Foundation-Notes.md:
 * the dial code follows the nationality); the form's naming convention
 * (`member-form-drawer-{field}-id-select`, the view's
 * `member-detail-non-national-country-dial-code`) gives this prefix, matched
 * with `id^=` so `-id-select`, `-select` or `-input` all count.
 */
export const MEMBER_FORM_DIAL_CODE_PREFIX = `${MEMBER_FORM.root}-country-dial-code`;
