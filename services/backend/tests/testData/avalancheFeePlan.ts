/** Wrapped native AVAX identity used only by the raw-map snapshot fixture. */
export const wrappedAvax = 'ab'.repeat(32);

/** Values without child object authority must retain their exact identity. */
export const scalarCases = [
  // Null carries no object graph.
  null,
  // Missing values carry no object graph.
  undefined,
  // Exact integer fee units remain bigint.
  17n,
  // Decimal price strings retain their spelling.
  '2.00',
  // Disabled flags remain boolean.
  false,
];

/** Replace only assets; each form lacks at least one complete asset row. */
export const invalidAssetCases = [
  // No selected assets can be captured.
  [],
  // A missing asset collection is not an implicit default.
  undefined,
  // Null is not an asset collection.
  null,
  // An object cannot supply the ordered asset list.
  {},
  // A hole cannot supply the required row fields.
  new Array(1),
];
