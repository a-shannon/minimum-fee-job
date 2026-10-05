import { AvalancheFeeQuote } from '../network/avalancheRpc';
import { AvalancheFeePolicy, calculateAvalancheFee } from './avalancheFee';

const MAX_LONG = (1n << 63n) - 1n;
const MAX_HEIGHT = 2147483647;
const MAX_UINT256 = (1n << 256n) - 1n;

/** Decimal text is the price authority; this cannot recover rounded API numbers. */
export interface AvalanchePriceConversion {
  avaxPrice: string;
  tokenPrice: string;
  tokenDecimals: number;
}

/** Converts bounded positive decimal price text into an exact rational pair. */
const decimal = (text: string): readonly [bigint, bigint] => {
  if (typeof text !== 'string' || text.length > 256)
    throw new Error('Invalid positive decimal price');
  const match =
    /^(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]{1,3}))?$/.exec(text);
  if (!match || match[0] !== text)
    throw new Error('Invalid positive decimal price');
  const exponent = Number(match[3] ?? '0');
  if (Math.abs(exponent) > 256)
    throw new Error('Decimal price exponent exceeds bound');
  const coefficient = BigInt(match[1] + (match[2] ?? ''));
  if (coefficient === 0n) throw new Error('Invalid positive decimal price');
  const scale = (match[2]?.length ?? 0) - exponent;
  return scale >= 0
    ? [coefficient, 10n ** BigInt(scale)]
    : [coefficient * 10n ** BigInt(-scale), 1n];
};

/** Exact ceiling in significant token units, bounded by the Sigma Long register. */
export const convertAvalancheFeeToToken = (
  wei: bigint,
  prices: AvalanchePriceConversion,
): bigint => {
  if (typeof wei !== 'bigint' || wei <= 0n || wei > MAX_UINT256)
    throw new Error('Invalid positive Avalanche fee in wei');
  if (!Number.isSafeInteger(prices.tokenDecimals) || prices.tokenDecimals < 0)
    throw new Error('Invalid Avalanche significant decimals');
  const [avaxNumerator, avaxDenominator] = decimal(prices.avaxPrice);
  const [tokenNumerator, tokenDenominator] = decimal(prices.tokenPrice);
  const denominator = 10n ** 18n * avaxDenominator * tokenNumerator;
  // Even a unit numerator would overflow. Bound allocation before exponentiation.
  if (prices.tokenDecimals > denominator.toString().length + 19)
    throw new Error('Avalanche token fee exceeds positive Sigma Long');
  const numerator =
    wei *
    avaxNumerator *
    tokenDenominator *
    10n ** BigInt(prices.tokenDecimals);
  const amount = (numerator + denominator - 1n) / denominator;
  if (amount <= 0n || amount > MAX_LONG)
    throw new Error('Avalanche token fee exceeds positive Sigma Long');
  return amount;
};

export interface AvalancheChainFee {
  readonly bridgeFee: bigint;
  readonly networkFee: bigint;
  readonly rsnRatio: bigint;
  readonly rsnRatioDivisor: bigint;
  readonly feeRatio: bigint;
}

export interface AvalancheChainFeeInput {
  expectedChainId: 43113n | 43114n;
  quote: AvalancheFeeQuote;
  policy: AvalancheFeePolicy;
  /** Full raw map, including unbridgeable sets, before any pruning. */
  tokenMap: unknown;
  selectedTokenId: string;
  avaxPrice: string;
  tokenPrice: string;
  finalizedHeight: number;
  activationDelay: number;
  common: Omit<AvalancheChainFee, 'networkFee'>;
}

/** Identifies a non-null object record while excluding arrays. */
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Validates the full asset map and resolves the selected fee set with unique identifiers. */
const selectedAsset = (raw: unknown, selectedId: string) => {
  if (
    !Array.isArray(raw) ||
    !Array.from(raw).every(record) ||
    typeof selectedId !== 'string' ||
    !selectedId
  )
    throw new Error('Invalid Avalanche token map');
  const sets = raw as Record<string, unknown>[];
  // Compare identifiers as TokenMap consumers do, including EVM case aliases.
  /** Compare token identifiers using the case-insensitive identity used by TokenMap consumers. */
  const identity = (id: string) => id.toLowerCase();
  const allMembers = sets.flatMap((candidate) => Object.values(candidate));
  const native = sets.filter(
    (set) =>
      record(set.avalanche) &&
      (set.avalanche.tokenId === 'avax' || set.avalanche.type === 'native'),
  );
  const set = native[0];
  const asset = set?.avalanche;
  const wrapped = set?.ergo;
  if (
    native.length !== 1 ||
    !record(asset) ||
    !record(wrapped) ||
    asset.tokenId !== 'avax' ||
    asset.type !== 'native' ||
    asset.residency !== 'native' ||
    asset.decimals !== 18 ||
    typeof wrapped.tokenId !== 'string' ||
    wrapped.tokenId.length !== 64 ||
    !/^[0-9a-f]{64}$/.test(wrapped.tokenId) ||
    /^0+$/.test(wrapped.tokenId) ||
    typeof wrapped.decimals !== 'number' ||
    !Number.isSafeInteger(wrapped.decimals) ||
    wrapped.decimals < 0 ||
    wrapped.decimals > 18
  )
    throw new Error('Invalid bridgeable native AVAX mapping');
  /** Finds every raw token set containing the supplied identifier on any chain. */
  const findSets = (id: string) =>
    sets.filter((candidate) =>
      Object.values(candidate).some(
        (member) =>
          record(member) &&
          typeof member.tokenId === 'string' &&
          identity(member.tokenId) === identity(id),
      ),
    );
  const selected = findSets(selectedId);
  if (selected.length !== 1)
    throw new Error('Ambiguous or unrelated Avalanche token identifier');
  const feeSet = selected[0];
  if (feeSet !== set) {
    const token = feeSet.avalanche;
    if (
      !record(token) ||
      token.type !== 'ERC-20' ||
      typeof token.tokenId !== 'string' ||
      !/^0x[0-9a-f]{40}$/.test(token.tokenId) ||
      /^0x0{40}$/.test(token.tokenId)
    )
      throw new Error('Invalid Avalanche ERC-20 fee asset');
  }
  for (const candidate of new Set([set, feeSet])) {
    const av = candidate.avalanche;
    const ergo = candidate.ergo;
    if (
      !record(av) ||
      !record(ergo) ||
      !['EIP-004', 'token'].includes(String(ergo.type)) ||
      !['native', 'wrapped'].includes(String(ergo.residency)) ||
      (candidate === set && ergo.residency !== 'wrapped') ||
      typeof ergo.tokenId !== 'string' ||
      ergo.tokenId.length !== 64 ||
      !/^[0-9a-f]{64}$/.test(ergo.tokenId) ||
      /^0+$/.test(ergo.tokenId)
    )
      throw new Error('Invalid bridgeable Avalanche fee asset');
    if (
      Object.values(candidate).filter(
        (member) => record(member) && member.residency === 'native',
      ).length !== 1
    )
      throw new Error('Invalid Avalanche fee asset native origin');
    for (const member of Object.values(candidate)) {
      if (
        !record(member) ||
        typeof member.decimals !== 'number' ||
        !Number.isSafeInteger(member.decimals) ||
        member.decimals < 0
      )
        throw new Error('Invalid Avalanche token-set decimals');
      if (typeof member.tokenId !== 'string' || !member.tokenId)
        throw new Error('Invalid Avalanche token identifier');
      const matches = allMembers.filter(
        (other) =>
          record(other) &&
          typeof other.tokenId === 'string' &&
          identity(other.tokenId) === identity(member.tokenId as string),
      );
      if (matches.length !== 1)
        throw new Error('Ambiguous or unrelated Avalanche token identifier');
    }
  }
  return {
    native: feeSet === set,
    decimals: Math.min(
      ...Object.values(feeSet).map(
        (member) => (member as { decimals: number }).decimals,
      ),
    ),
  };
};

/** Builds a mapped Avalanche asset fee without RPC, clock reads or configuration writes. */
export const buildAvalancheChainFee = (input: AvalancheChainFeeInput) => {
  if (
    (input.expectedChainId !== 43113n && input.expectedChainId !== 43114n) ||
    input.quote.chainId !== input.expectedChainId
  )
    throw new Error(
      'Avalanche fee quote chain does not match configured chain',
    );
  const { decimals, native } = selectedAsset(
    input.tokenMap,
    input.selectedTokenId,
  );
  if (native) {
    const [a, b] = decimal(input.avaxPrice);
    const [c, d] = decimal(input.tokenPrice);
    if (a * d !== c * b)
      throw new Error('Native AVAX fee requires equal asset prices');
  }
  for (const height of [input.finalizedHeight, input.activationDelay])
    if (!Number.isSafeInteger(height) || height < 0 || height > MAX_HEIGHT)
      throw new Error('Invalid Avalanche activation height');
  const activationHeight = input.finalizedHeight + input.activationDelay;
  if (activationHeight > MAX_HEIGHT)
    throw new Error('Avalanche activation height exceeds Sigma Int');
  const common = { ...input.common };
  for (const field of [
    'bridgeFee',
    'rsnRatio',
    'rsnRatioDivisor',
    'feeRatio',
  ] as const) {
    const value = common[field];
    const minimum =
      field === 'rsnRatio' || field === 'rsnRatioDivisor' ? 1n : 0n;
    if (typeof value !== 'bigint' || value < minimum || value > MAX_LONG)
      throw new Error(`Invalid Avalanche ${field}`);
  }
  const networkFee = convertAvalancheFeeToToken(
    calculateAvalancheFee(input.quote, input.policy),
    {
      avaxPrice: input.avaxPrice,
      tokenPrice: input.tokenPrice,
      tokenDecimals: decimals,
    },
  );
  const fee: AvalancheChainFee = Object.freeze({
    bridgeFee: common.bridgeFee,
    networkFee,
    rsnRatio: common.rsnRatio,
    rsnRatioDivisor: common.rsnRatioDivisor,
    feeRatio: common.feeRatio,
  });
  return Object.freeze({ activationHeight, fee });
};

/** Structural boundary compatible with MinimumFeeConfig 3.1.2 and 4.0.1. */
export const applyAvalancheChainFee = (
  target: {
    setChainConfig(
      chain: string,
      height: number,
      fee: AvalancheChainFee,
    ): unknown;
  },
  input: AvalancheChainFeeInput,
) => {
  if (typeof target?.setChainConfig !== 'function')
    throw new Error('Invalid Avalanche fee configuration target');
  const result = buildAvalancheChainFee(input);
  target.setChainConfig('avalanche', result.activationHeight, result.fee);
  return result;
};
