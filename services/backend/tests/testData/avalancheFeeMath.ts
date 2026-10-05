import type { AvalancheFeeQuote } from '../../src/network/avalancheRpc';

/** Maximum representable unsigned 256-bit fee output. */
export const MAX_UINT256 = (1n << 256n) - 1n;
/** Consistent Fuji fee quote: one base, one tip and a three-wei guard cap. */
export const quote: AvalancheFeeQuote = {
  chainId: 43113n,
  baseFeePerGas: 1n,
  maxPriorityFeePerGas: 1n,
  maxFeePerGas: 3n,
};
/** Both supported chain IDs with the same verified quote and a workload of 7 units. */
export const mathCases1 = [
  // Fuji uses the default unit margin and the verified three-wei cap.
  43113n,
  // Mainnet uses the same default unit margin and verified cap.
  43114n,
] as const;
/** Use a one-unit workload and each documented numerator/denominator pair, then compare the exact upward-rounded wei result. */
export const mathCases2 = [
  // A unit margin leaves the three-wei fee unchanged.
  [1n, 1n, 3n],
  // A ten-percent margin rounds 3.3 wei up to four.
  [11n, 10n, 4n],
  // A four-thirds margin returns an exact four wei.
  [4n, 3n, 4n],
  // Doubling the margin returns an exact six wei.
  [2n, 1n, 6n],
];
/** Change only gasBudget to each documented invalid type or bound while preserving the verified quote. */
export const mathCases5 = [
  // Missing gasBudget cannot become an implicit default.
  undefined,
  // A zero workload violates the strictly positive gas-budget bound.
  0n,
  // A negative workload violates the unsigned gas-budget bound.
  -1n,
  // A workload one above uint256 cannot enter fee multiplication.
  MAX_UINT256 + 1n,
  // A Number workload cannot be silently coerced to BigInt.
  1,
  // A string workload cannot be silently coerced to BigInt.
  '1',
  // A fractional Number cannot represent an exact integer workload.
  1.5,
  // NaN cannot represent an exact integer workload.
  NaN,
];
/** Substitute each documented max-fee cap inconsistent with twice the base plus tip while leaving the other quote fields intact. */
export const mathCases10 = [
  // A cap below twice the base plus tip violates quote consistency.
  2n,
  // A cap above twice the base plus tip also violates quote consistency.
  4n,
];
