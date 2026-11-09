/**
 * US 14379 "Search and Filter Members" (member folder 04), 11 cases.
 *
 * How the cases map onto the live list (2026-11-05, Member-Foundation-Notes.md):
 *  - The keyword box (`member-list-search-input`) is DEBOUNCED - there is no
 *    Search button: the case's "Click the Search button" is the list answering
 *    THIS keyword (each search awaits its own GetMembers `searchText`).
 *  - The search matches the English first name, the last name, the Arabic first
 *    name, the member code, the document ID and the mobile number (partially) -
 *    NOT the full display name, the second name, the e-mail, the NATIONALITY or
 *    the STATUS (AC: name, nationality, status). 19807 ("Saudi") and 19809
 *    ("Active") assert the case - the findings.
 *  - The Filters button opens NOTHING (no advanced search: no gender or
 *    special-needs filter anywhere). 19812 / 19817 assert the case's panel - the
 *    findings; the quick filters (Status, Nationality) and "Clear" exist.
 *  - Test data the shared register cannot hold is replaced by the case's own
 *    suite members (decision): 19805 "M1001" -> the case's member's code
 *    (MBR-000000nn); 19806 "Ahmed Al-Saleh" -> two suite members whose last name
 *    carries "Ahmed" (first / second names stay "QA" / "Automation"), keyword
 *    "Ahmed" kept; 19808 "+966512345678" -> a suite member with mobile
 *    512345678, keyword "512345678" kept.
 *  - "All members whose name contains X are displayed" is checked against the
 *    whole register (read through GetMembers without a keyword).
 */
export const CASES = {
  byMemberId: { azureId: '19805' },
  byName: { azureId: '19806', keyword: 'Ahmed', lastNameToken: 'MemberAhmed' },
  byNationality: { azureId: '19807', keyword: 'Saudi' },
  byMobile: { azureId: '19808', keyword: '512345678', mobileNumber: '512345678' },
  byStatus: { azureId: '19809', keyword: 'Active' },
  noMatch: { azureId: '19810', keyword: 'ZZZNOTEXIST', emptyText: /no (results|records)( found)?/i },
  injection: { azureId: '19811', keyword: "'; DROP TABLE Members;--" },
  advancedCombined: { azureId: '19812', nationality: 'Saudi (SAU)', gender: 'Female', status: 'Active', specialNeeds: 'Yes' },
  singleCharacter: { azureId: '19813', keyword: 'A', minimumMessage: /at least|minimum|characters/i },
  clearFilters: { azureId: '19814', status: 'Inactive', defaultStatus: /all statuses/i },
  controlsPresent: { azureId: '19817' },
} as const;
