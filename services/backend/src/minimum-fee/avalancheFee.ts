import { AvalancheFeeQuote } from '../network/avalancheRpc';

export interface AvalancheFeePolicy {
  /** Operator-selected gas units for the intended transaction workload. */
  gasBudget: bigint;
  /** Optional multiplier >= 1; for example, 11/10 adds a 10% margin. */
  margin?: { numerator: bigint; denominator: bigint };
}

const MAX_UINT256 = (1n << 256n) - 1n;

/**
 * Validates a bigint against the selected minimum and uint256 maximum.
 * @param value - Integer to validate.
 * @param field - Field name used when reporting an invalid value.
 * @param minimum - Smallest accepted value; defaults to zero.
 * @returns The unchanged value after validation.
 */
const uint256 = (value: bigint, field: string, minimum = 0n): bigint => {
  if (typeof value !== 'bigint' || value < minimum || value > MAX_UINT256)
    throw new Error(`Invalid Avalanche ${field}`);
  return value;
};

/**
 * Returns native AVAX network fee in wei (10^-18 AVAX), never a float.
 * ceil(gasBudget * (2 * baseFeePerGas + tip) * numerator / denominator).
 * BigInt intermediates are exact; the returned amount must fit uint256.
 * Token-price conversion and minimum-fee contract encoding remain separate.
 */
export const calculateAvalancheFee = (
  quote: AvalancheFeeQuote,
  policy: AvalancheFeePolicy,
): bigint => {
  if (quote.chainId !== 43113n && quote.chainId !== 43114n)
    throw new Error('Unsupported Avalanche quote chain ID');
  const base = uint256(quote.baseFeePerGas, 'base fee per gas');
  const tip = uint256(quote.maxPriorityFeePerGas, 'priority fee per gas');
  const cap = uint256(quote.maxFeePerGas, 'max fee per gas');
  if (cap !== 2n * base + tip)
    throw new Error('Avalanche quote does not match guard fee policy');
  const gasBudget = uint256(policy.gasBudget, 'gas budget', 1n);
  const numerator = uint256(
    policy.margin === undefined ? 1n : policy.margin.numerator,
    'margin numerator',
    1n,
  );
  const denominator = uint256(
    policy.margin === undefined ? 1n : policy.margin.denominator,
    'margin denominator',
    1n,
  );
  if (numerator < denominator)
    throw new Error('Avalanche margin must not reduce the guard fee cap');
  const scaled = gasBudget * cap * numerator;
  const fee = (scaled + denominator - 1n) / denominator;
  if (fee > MAX_UINT256)
    throw new Error('Avalanche network fee exceeds uint256');
  return fee;
};
