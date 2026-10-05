import { MAX_UINT256 } from '../testData/avalancheFeeMath';

/** Generate every numerator/denominator field and invalid-value pair, change only that margin field and call the calculator. */
export const mathCases6 = [
  // Validate the multiplier numerator independently.
  'numerator',
  // Validate the multiplier denominator independently.
  'denominator',
].flatMap((field) =>
  [
    // No implicit default for an explicit incomplete margin.
    undefined,
    // Both margin fields must be strictly positive.
    0n,
    // Neither margin field may be negative.
    -1n,
    // Neither margin field may exceed uint256.
    MAX_UINT256 + 1n,
    // Number values must not be coerced to exact integers.
    1,
    // String values must not be coerced to exact integers.
    '1',
  ].map((value) => [field, value] as const),
);
/** Generate each base, priority and max fee field with every documented invalid value, replace only that quote field and call the calculator. */
export const mathCases8 = [
  // Validate the quoted base fee independently.
  'baseFeePerGas',
  // Validate the quoted priority fee independently.
  'maxPriorityFeePerGas',
  // Validate the quoted cap independently.
  'maxFeePerGas',
].flatMap((field) =>
  [
    // Every quote field must be present.
    undefined,
    // Every quote field must be nonnegative.
    -1n,
    // Every quote field must fit uint256.
    MAX_UINT256 + 1n,
    // Quote fields cannot use Number coercion.
    1,
    // Quote fields cannot use string coercion.
    '1',
  ].map((value) => [field, value] as const),
);
