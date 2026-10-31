import { TERMINOLOGY_VIEW_ONLY } from '../accounts/payerAdminRole.data';
import { PREDEFINED_TERMINOLOGIES, type TerminologyBlockedCase } from './terminology.data';

/**
 * US 17436 "Predefined Terminologies" (terminology folder 19).
 *
 * The six predefined lists are shared reference data. A case never edits or
 * deletes a seeded value: it adds its OWN value (fixtures `recordIn` /
 * `discardRecordShowing`) and works on that, and a case that would write into a
 * list that is LOCKED in this environment (District, on 2026-10-29) is BLOCKED
 * by the fixture rather than unlocking shared data. Values are built per list
 * from its own fields (fixture `sampleRecordFor`). A value's "Deactivate" is its
 * Is Active checkbox in the record drawer; the screen consuming a list's values
 * is a disposable terminology with a mapping field onto that list.
 */

export const SIX = PREDEFINED_TERMINOLOGIES;

/** A label unique per run, in the sheet's wording. */
export const valueLabel = (label: string): string => `${label} ${Date.now().toString(36).toUpperCase()}`;

export const CASES = {
  importedOnSetup: { azureId: '20272' },
  add: { azureId: '20273', list: 'City', value: () => valueLabel('Riyadh') },
  edit: { azureId: '20271', list: 'District', original: () => valueLabel('North District'), updated: ' - Zone A' },
  deleteUnused: { azureId: '20281', list: 'Trades', value: () => valueLabel('Carpentry - Unused') },
  deactivate: { azureId: '20276', list: 'Country', value: () => valueLabel('Test Country'), control: /deactivate/i },
  reactivate: { azureId: '20277', list: 'Street', value: () => valueLabel('Test Street'), control: /activate/i },
  blank: { azureId: '20278', list: 'City' },
  maxLength: { azureId: '20279', list: 'Trades', fallbackMax: 100 },
  duplicate: { azureId: '20280', list: 'District' },
  categoriesLocked: { azureId: '20282' },
  nonPrivileged: { azureId: '20283', granted: TERMINOLOGY_VIEW_ONLY },
  independentLists: { azureId: '20284', list: 'Policy Holder', value: () => valueLabel('Corporate Policy Holder') },
  invalidFormat: { azureId: '20285', list: 'City', invalid: ['###City@@@', '<script>alert(1)</script>'] },
  filterAndSearch: { azureId: '20286', list: 'Country', search: 'Sau', match: /Saudi/i },
  // The screen shows the server's own ErrorMessage; under the injected failure that is NetworkUtils'
  // 'Injected 500 for ... (resilience test).' - a shown error, so it counts (20287, 2026-10-30).
  saveFailure: { azureId: '20287', list: 'Street', value: () => valueLabel('Test Street - Retry'), error: /error|failed|could not|unable|went wrong|injected 500/i },
} as const;

export const BLOCKED_CASES: TerminologyBlockedCase[] = [
  {
    azureId: '20275',
    title: 'should block the deletion and keep the value when another module uses a Policy Holder value',
    reason:
      'Needs a Policy Holder value referenced by another module (e.g. an active policy record). Policy records do not '
      + 'reference the Policy Holder terminology in this environment, and which seeded values are in use cannot be '
      + 'read from the Terminology API; deleting a seeded value to probe it would destroy shared reference data. '
      + 'Runnable once a policy references a Policy Holder value the case can name.',
  },
];
