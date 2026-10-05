/** Construct once, change only the table-selected captured quote/frontier/asset/candidate/chain policy, attempt publication, inspect zero enqueue and restore shared history policy in finally. */
export const publicationCases3 = [
  // Only the quote cap changes.
  'plan quote',

  // Only the finalized plan height changes.
  'plan frontier',

  // Only the plan activation height changes.
  'plan asset',

  // Only the bound Ergo candidate changes.
  'candidate',

  // Only the legacy frontier map changes.
  'frontier',

  // Only the captured pruning guarantee changes.
  'guarantee',

  // Only the ordered supported-chain list changes.
  'chain list',
];
/** Construct an authentic transaction, replace only its publication source with the table-selected string, copied object, empty map or nonempty updated map, then observe enqueue. */
export const publicationCases6 = [
  // A string cannot replace the bound transaction.
  'string',
  // An equal-field copy lacks original transaction identity.
  'copy',
  // An arbitrary empty map lacks generation binding.
  'fake empty',
  // A nonempty update map is not a reduced transaction source.
  'nonempty map',
];
/** Construct authentic bytes, mutate only the table-selected original price, RSN, raw map, decimal price or generation authority, then attempt enqueue. */
export const publicationCases7 = [
  // Only original numeric price authority changes.
  'legacy price',

  // Only RSN token identity changes.
  'RSN',

  // Only the raw Ergo decimals change.
  'raw token map',

  // Only the exact native decimal price changes.
  'decimal price',

  // Only active generation authority is superseded.
  'generation',
];
/** Install a first-await legacy fee observation hook that changes only original numeric price or RSN authority, invoke actual generateNewFeeConfig and await its rejection. */
export const publicationCases14 = [
  // Change only original numeric price on the first legacy fee await.
  'price',
  // Change only original RSN identity on the first legacy fee await.
  'RSN',
];
/** Prepare one valid source and replace only the captured legacy numeric price with each documented invalid scalar before calling begin generation. */
export const publicationCases15 = [
  // NaN is not a finite original price.
  NaN,
  // Infinity is not a finite original price.
  Infinity,
  // Zero is not a positive original price.
  0,
  // A negative price cannot be captured.
  -1,
];
