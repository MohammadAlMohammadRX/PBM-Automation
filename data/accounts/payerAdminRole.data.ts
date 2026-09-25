/**
 * The role the non-administrator account holds, and the permissions that can be
 * taken off it to build the account a case needs.
 *
 * WHY THIS EXISTS. Sixty-eight cases in the run of 12-13 September were blocked
 * for one reason: they prove an action is REFUSED to a role that lacks a right,
 * and the only non-administrator credential available holds every right they
 * wanted withheld. Rather than wait for eight new accounts to be provisioned,
 * the suite now shapes the one account it has - an administrator removes the
 * permission, the case runs, and the permission goes back.
 *
 * THE CATALOGUE NAMES ARE CODES, not the friendly names the story asks for.
 * VERIFIED live: the Payers group holds 20 rows and all but one are raw code
 * names - `ExportPayers`, `GetPayer`, `UpdatePayer`. Only "View Audit Logs"
 * carries a human name. That gap is the subject of the bilingual-names story;
 * here it is simply the vocabulary this screen speaks, so the codes are what a
 * caller names.
 */

/** The role the configured non-administrator account holds. */
export const PAYER_ADMIN_ROLE = 'Payer Admin';

/** What the application says when a role has been saved. */
export const ROLE_SAVED = 'Role updated';

/**
 * Every payer permission the catalogue offers, keyed by what it lets a user do.
 *
 * Read off the live Payers section on 19 September 2026. The keys are how a
 * case should name what it needs; the values are what the tree displays.
 */
export const PAYER_PERMISSION = {
  viewAuditLogs: 'View Audit Logs',
  assignNetworks: 'AssignNetworksToPayer',
  createPayer: 'CreatePayer',
  deletePayer: 'DeletePayer',
  exportPayers: 'ExportPayers',
  viewAssignableNetworks: 'GetAssignableNetworks',
  viewPayerDetails: 'GetPayer',
  viewAuditTrail: 'GetPayerAuditTrail',
  viewImpactPreview: 'GetPayerImpactPreview',
  viewLinkedPolicies: 'GetPayerLinkedPolicies',
  viewLinkedNetworks: 'GetPayerNetworks',
  viewDashboard: 'GetPayersDashboard',
  viewPayerDropdown: 'GetPayersDropdown',
  viewVersionHistory: 'GetPayerVersions',
  inactivatePayer: 'InactivatePayer',
  revertPayer: 'RevertPayer',
  activatePayer: 'SetPayerActive',
  sendForApproval: 'SubmitPayerForApproval',
  unassignNetwork: 'UnassignNetworkFromPayer',
  editPayer: 'UpdatePayer',
} as const;

export type PayerPermissionKey = keyof typeof PAYER_PERMISSION;

/** The catalogue label for a permission, by the name a case uses. */
export const permissionLabel = (key: PayerPermissionKey): string => PAYER_PERMISSION[key];

/**
 * Every permission that lets a role READ payer data.
 *
 * WHY THIS GROUP EXISTS. Several cases need an account that cannot see the
 * payer list at all, and the catalogue has NO single "view payer list" row -
 * the Payers group offers `GetPayer`, `GetPayersDashboard`, `GetPayersDropdown`
 * and the per-tab feeds, but nothing that gates the list itself. "No access to
 * the module" is therefore modelled as the absence of every read right the
 * catalogue does offer, which is the closest this screen can express.
 *
 * Named here rather than spelled out in each spec so that the cases which mean
 * the same thing ask for the same thing, and so a new read permission is added
 * in one place.
 */
export const PAYER_READ_PERMISSIONS = [
  'viewPayerDetails',
  'viewDashboard',
  'viewPayerDropdown',
  'viewLinkedNetworks',
  'viewLinkedPolicies',
  'viewVersionHistory',
  'viewAuditTrail',
  'viewAssignableNetworks',
  'viewImpactPreview',
] as const satisfies readonly PayerPermissionKey[];

/** The two rights that together let a role change a payer's lifecycle status. */
export const PAYER_STATUS_PERMISSIONS = [
  'inactivatePayer',
  'activatePayer',
] as const satisfies readonly PayerPermissionKey[];

/**
 * Every payer permission the catalogue offers.
 *
 * For the one case that asks what a role with NO payer rights at all can do.
 * Derived from the map rather than listed again, so a permission added above is
 * automatically part of "all of them".
 */
export const ALL_PAYER_PERMISSIONS = Object.keys(PAYER_PERMISSION) as readonly PayerPermissionKey[];

/**
 * HOW THE CATALOGUE IS ACTUALLY SHAPED, read live on 21 September 2026 - and it
 * is not the flat list the map above implies.
 *
 *   Payers (21/21)
 *     GetPayers (19/19)   <- a PARENT node, not a leaf: the 19 codes above hang
 *                            off it, so toggling it toggles all of them
 *     View Audit Logs     <- renders as `Payers.AuditLogs` in the effective set
 *     ... one further row
 *
 * TWO CONSEQUENCES. A case that wants "no access to the payer list" should
 * toggle the `GetPayers` parent rather than enumerate its children. And the map
 * above is missing `GetPayers` and `AuditLogs` as codes in their own right -
 * both appear in the account's effective permissions.
 *
 * THE FINDING THIS UNCOVERED, which matters more than either. The role and the
 * account DISAGREE with nothing in flight: the role has `CreatePayer` and
 * `DeletePayer` CHECKED, and the account does not hold `Payers.CreatePayer` or
 * `Payers.DeletePayer`; the role has "View Audit Logs" UNCHECKED, and the
 * account holds `Payers.AuditLogs`. A permission set derived from the role could
 * not differ from it. The account's set is a COPY taken when the role was
 * assigned, so editing the role afterwards changes nothing for anyone already
 * holding it - which is why every shaped case had to be re-read, and why
 * `utils/EffectivePermissions.ts` now verifies the shaping before a case is
 * allowed to speak about enforcement.
 */
export const PAYER_PERMISSION_PARENT = 'GetPayers';
