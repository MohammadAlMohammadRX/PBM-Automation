import { HOME_LIST, LOOKUP_RIGHT, MESSAGE as EDIT_MESSAGE, RECORD_LIST } from './editLookupItem.data';

export { HOME_LIST, RECORD_LIST };

/**
 * US 20861 "Populate Drop-downs From Lookup Lists" (lookup folder 09, 9 cases:
 * 21207, 21209-21216) - Writer D.
 *
 * How the forms use a list (app bundle, the shared `pbm-deactivate-dialog` and
 * every module's lookup service): the form asks GET /api/Lookups/Items/<list>
 * EACH TIME it opens, keeps the answer's order, offers only `isActive` items,
 * and labels each one `arabicName || englishName` in Arabic and
 * `englishName || arabicName` in English. A failed load leaves the list empty.
 * A record shows its held value by looking the id up in the WHOLE list
 * (inactive items included).
 *
 * "Every form" = every consumer the suite can open (lead decision 9):
 * - `userDeactivationReason` (HOME_LIST): the user Deactivate drawer (Users
 *   Administration > row Inactivate) opened for an ACTIVE suite user (`userIn`)
 *   and closed with Cancel - nobody is deactivated.
 * - `gender` (RECORD_LIST, 21210 only - see below): the Add User drawer's Gender
 *   select (a NEW record) and the suite user's profile (the EXISTING record).
 *
 * Literal readings / decisions:
 * - "in display order, lowest number first": the offered labels must follow the
 *   stored `index` (ties in any order); expected = the list's ACTIVE items from
 *   GetItems, read in the same test.
 * - 21207: the suite item is deleted through the API in the precondition; the
 *   Lookup Items screen must not list it, the drawer must not offer it.
 * - 21209: two suite items at Display Order 0. Step 1 asserts the Order cell
 *   literally reads "0" (the foundation saw "—" for an index-0 item).
 * - 21210 (CONSUMER CHOICE): the home list's consumer never shows the held
 *   reason (GetUser has no reason field, the profile no reason row), so the case
 *   runs on RECORD_LIST `gender`: a suite user whose Gender is a suite item
 *   (`linkLookupItem`). Step 2 retires it through the screen (Edit > clear Is
 *   Active > Save) - the case's own action; AC 20858 says an in-use value's Edit
 *   is refused, so a refusal fails THAT step (the stories disagree) and is
 *   reported as what the screen did.
 * - 21211 / 21212 (lead decision 7): a suite item with the Arabic (English)
 *   name EMPTY is created through the API; when the server refuses it, the case
 *   is BLOCKED with the server's answer.
 * - 21213: "a form open elsewhere" = the Deactivate drawer open in a SECOND TAB
 *   of the admin session; the value is added through the Add Item drawer;
 *   "reopen the already-open form" = Cancel + reopen in that tab; "a second,
 *   different form" = the Deactivate drawer for ANOTHER suite user in the
 *   first tab (the only other consumer of the list the suite can open).
 * - 21214: a suite session holding Users rights only (no Lookups.* right); the
 *   Lookups screen must not render its register for it; its Deactivate drawer
 *   must offer every active value of the list (compared with the admin's
 *   GetItems).
 * - 21215 (lead decision 4): GET Items/<home list> answers 500 in the test's own
 *   browser (`page.route`); "save" = Deactivate with no reason chosen, which must
 *   show "This field is required." and send no request.
 * - 21216 (exploratory, scripted): the language is switched SWITCHES times
 *   (Arabic, English, ...), the drawer reopened after each switch; the
 *   "previously opened record" rechecked in English is the suite user's profile
 *   (Gender "Male").
 */

export const MESSAGE = {
  created: 'Item Created — The lookup item was added.',
  required: EDIT_MESSAGE.required,
} as const;

/** What the suite user's profile shows for the default suite user (UserProvisioning: male) in English. */
export const SUITE_USER_GENDER_EN = 'Male';

export const CASES = {
  deletedNotOffered: { azureId: '21207' },
  sameDisplayOrder: { azureId: '21209', order: 0, orderShown: '0' },
  retiredKeptOnRecord: { azureId: '21210' },
  englishFallback: {
    azureId: '21211',
    blocked: 'A lookup item with an EMPTY Arabic name cannot be created (the server refused it), so the English fallback cannot be observed',
  },
  arabicFallback: {
    azureId: '21212',
    blocked: 'A lookup item with an EMPTY English name cannot be created (the server refused it), so the Arabic fallback cannot be observed',
  },
  changeSeenNextOpen: { azureId: '21213' },
  noLookupsRight: {
    azureId: '21214',
    /** Users rights only: list, view, and Activate / Deactivate (opens the drawer). No Lookups.* right. */
    rights: ['Users.GetUsers', 'Users.GetUser', 'Users.ToggleUserActivation'],
    withheld: Object.values(LOOKUP_RIGHT),
  },
  listLoadFails: { azureId: '21215', status: 500 },
  languageSwitching: { azureId: '21216', switches: 3 },
} as const;
