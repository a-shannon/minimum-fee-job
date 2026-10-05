// Server-only, pure inspection. The caller supplies observation and policy authority.
import { Buffer } from 'node:buffer';

import {
  AvalancheFeeConfig,
  AvalancheFeeEvidence,
  AvalancheFeeRecord,
  AvalanchePublicationV2,
  decodeAvalanchePublication,
} from './publication';
import { AvalancheFeeContract } from './transaction';
import { inspectAvalancheFeeStructure } from './validation';

type Common = Omit<AvalancheFeeConfig, 'networkFee'>;
export interface TrustedAvalancheFeePolicy {
  readonly contract: AvalancheFeeContract;
  readonly rawTokenMap: AvalanchePublicationV2['rawTokenMap'];
  readonly selectedTokenIds: readonly string[];
  readonly gasBudget: string;
  readonly margin: Readonly<{ numerator: string; denominator: string }>;
  readonly activationDelay: number;
  readonly history: Readonly<{
    chains: readonly string[];
    guarantees: Readonly<Record<string, number>>;
  }>;
  readonly common: Readonly<Record<string, Common>>;
}
export interface TrustedAvalancheFeeObservations {
  readonly finalized: AvalancheFeeEvidence['finalized'];
  readonly quote: AvalancheFeeEvidence['quote'];
  readonly frontiers: Readonly<Record<string, number>>;
  readonly prices: AvalanchePublicationV2['avalancheDecimalPrices'];
  readonly priorFeeBoxes: Readonly<Record<string, string | null>>;
}
export interface AvalancheFeeEconomicsReport {
  readonly scope: 'published-avalanche-updates-only';
  readonly publicationId: string;
  readonly transactionId: string;
  readonly checkedUpdates: readonly Readonly<{
    selectedTokenId: string;
    ergoTokenId: string;
    outputIndex: number;
    activationHeight: number;
    fee: AvalancheFeeConfig;
  }>[];
  readonly structuralOnlyTargets: readonly string[];
}

const U256 = (1n << 256n) - 1n;
const I64 = (1n << 63n) - 1n;
const I32 = 2147483647;
/** Rejects an economic input or comparison with a bounded diagnostic reason. */
const reject = (reason: string): never => {
  throw new Error(`Invalid Avalanche economics: ${reason}`);
};
/** Requires a non-null object that is not an array. */
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return reject('trusted shape');
  return value as Record<string, unknown>;
};
/** Requires the object's own enumerable keys to match the supplied key set. */
const exact = (value: unknown, keys: readonly string[]) => {
  const actual = Object.keys(object(value)).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...keys].sort()))
    reject('trusted keys');
};
/** Serializes a captured JSON value with recursively sorted object keys. */
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`;
  return JSON.stringify(value);
};
/** Rejects values whose canonical captured JSON representations differ. */
const same = (actual: unknown, expected: unknown, reason: string) => {
  if (canonical(actual) !== canonical(expected)) reject(reason);
};
/** Recursively freezes a captured value and all of its child values. */
const freeze = <T>(value: T): T => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
// Read descriptors rather than invoking caller getters; cap both shape and bytes.
/** Captures bounded plain JSON data through descriptors without invoking getters. */
const capture = <T>(input: T): T => {
  let budget = 8_000_000;
  let nodes = 200_000;
  /** Copies one value while enforcing depth, node, byte and descriptor limits. */
  const visit = (value: unknown, depth: number): unknown => {
    if (--nodes < 0 || depth > 16) return reject('trusted size');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      budget -= Buffer.byteLength(value);
      if (budget < 0) reject('trusted size');
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (!value || typeof value !== 'object') return reject('trusted shape');
    const array = Array.isArray(value);
    if (array && value.length > 4096) reject('trusted size');
    if (
      !array &&
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    )
      reject('trusted prototype');
    const keys = Reflect.ownKeys(value);
    if (keys.length > 4097) reject('trusted size');
    const result: Record<string, unknown> = Object.create(null);
    for (const key of keys) {
      if (array && key === 'length') continue;
      if (
        typeof key !== 'string' ||
        ['__proto__', 'constructor', 'prototype'].includes(key)
      )
        return reject('trusted key');
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value'))
        reject('trusted accessor');
      budget -= Buffer.byteLength(key);
      if (budget < 0) reject('trusted size');
      result[key] = visit(descriptor.value, depth + 1);
    }
    if (!array) return result;
    if (Object.keys(result).length !== value.length) reject('trusted array');
    return Array.from({ length: value.length }, (_, i) => {
      if (!Object.hasOwn(result, String(i))) reject('trusted array');
      return result[String(i)];
    });
  };
  return freeze(visit(input, 0)) as T;
};
/** Requires a bounded, nonempty identifier without padding or control characters. */
const id = (value: unknown): string => {
  if (
    typeof value !== 'string' ||
    !value.length ||
    value.length > 256 ||
    value.trim() !== value ||
    Array.from(value).some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    return reject('trusted identifier');
  return value;
};
/** Requires a nonempty array of valid, distinct identifiers. */
const list = (value: unknown): string[] => {
  if (!Array.isArray(value) || !value.length) return reject('trusted list');
  const ids = value.map(id);
  if (new Set(ids).size !== ids.length) reject('trusted duplicate');
  return ids;
};
/** Requires a safe integer height between the supplied minimum and signed 32-bit maximum. */
const height = (value: unknown, min = 0): number => {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > I32
  )
    return reject('trusted height');
  return value;
};
/** Parses a canonical unsigned decimal string within the supplied bigint bounds. */
const uint = (value: unknown, max: bigint, min = 0n): bigint => {
  if (
    typeof value !== 'string' ||
    value.length > 78 ||
    !/^(0|[1-9][0-9]*)$/.test(value)
  )
    return reject('trusted integer');
  const parsed = BigInt(value);
  if (parsed < min || parsed > max) reject('trusted integer bound');
  return parsed;
};
/** Parses a bounded positive decimal price into an exact integer ratio. */
const rational = (value: unknown): readonly [bigint, bigint] => {
  if (typeof value !== 'string' || value.length > 256) return reject('price');
  const match =
    /^(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]{1,3}))?$/.exec(value);
  if (!match || match[0] !== value || Math.abs(Number(match[3] ?? 0)) > 256)
    return reject('price');
  const coefficient = BigInt(match[1] + (match[2] ?? ''));
  if (!coefficient) reject('price');
  const scale = (match[2]?.length ?? 0) - Number(match[3] ?? 0);
  return scale >= 0
    ? [coefficient, 10n ** BigInt(scale)]
    : [coefficient * 10n ** BigInt(-scale), 1n];
};
/** Compares two decimal prices by exact cross multiplication. */
const equalPrice = (a: unknown, b: unknown) => {
  const [an, ad] = rational(a),
    [bn, bd] = rational(b);
  if (an * bd !== bn * ad) reject('price authority');
};
const commonFields = [
  'bridgeFee',
  'rsnRatio',
  'rsnRatioDivisor',
  'feeRatio',
] as const;
/** Rounds a nonnegative integer ratio upward using its positive denominator. */
const ceil = (n: bigint, d: bigint) => (n + d - 1n) / d;

/** Reconstructs retained fee history using chain frontiers, guarantees and active configurations. */
const retainedHistory = (
  input: readonly AvalancheFeeRecord[],
  candidate: AvalancheFeeRecord,
  chains: readonly string[],
  frontiers: Readonly<Record<string, number>>,
  guarantees: Readonly<Record<string, number>>,
) => {
  const rows = [...input];
  for (const row of [...rows, candidate])
    if (Object.keys(row.heights).some((chain) => !chains.includes(chain)))
      reject('history chain');
  while (
    rows.length &&
    !chains.some((chain) => {
      const h = rows.at(-1)!.heights[chain];
      return (
        h !== undefined &&
        (chain === 'avalanche' ? h < frontiers[chain] : h <= frontiers[chain])
      );
    })
  )
    rows.pop();
  for (let i = rows.length - 1; i >= 0; i--) {
    if (
      !chains.some(
        (chain) =>
          Object.hasOwn(rows[i].heights, chain) &&
          rows[i].heights[chain] >= frontiers[chain] - guarantees[chain],
      )
    ) {
      rows.splice(0, i);
      break;
    }
  }
  rows.push(candidate);
  // Canonical decoded configs have no -1 sentinels: config presence is active.
  const active = new Set(rows.flatMap((row) => Object.keys(row.configs)));
  return rows.map((row) => ({
    heights: Object.fromEntries(
      Object.entries(row.heights).filter(([chain]) => active.has(chain)),
    ),
    configs: Object.fromEntries(
      Object.entries(row.configs).filter(([chain]) => active.has(chain)),
    ),
  }));
};

/** Checks only published Avalanche updates against caller-supplied authority. */
export const inspectAvalancheFeeEconomics = (
  publication: unknown,
  policy: TrustedAvalancheFeePolicy,
  observations: TrustedAvalancheFeeObservations,
): AvalancheFeeEconomicsReport => {
  const [p, o] = capture([policy, observations] as const);
  exact(p, [
    'contract',
    'rawTokenMap',
    'selectedTokenIds',
    'gasBudget',
    'margin',
    'activationDelay',
    'history',
    'common',
  ]);
  exact(p.contract, ['expectedChainId', 'minimumFeeAddress', 'minimumFeeNFT']);
  if (![43113, 43114].includes(p.contract.expectedChainId)) reject('chain');
  exact(o, ['finalized', 'quote', 'frontiers', 'prices', 'priorFeeBoxes']);
  exact(o.finalized, ['chainId', 'height', 'hash']);
  exact(o.quote, [
    'chainId',
    'baseFeePerGas',
    'maxPriorityFeePerGas',
    'maxFeePerGas',
  ]);
  if (
    o.finalized.chainId !== p.contract.expectedChainId ||
    o.quote.chainId !== p.contract.expectedChainId ||
    typeof o.finalized.hash !== 'string' ||
    !/^0x[0-9a-f]{64}$/.test(o.finalized.hash)
  )
    reject('chain/frontier');
  height(o.finalized.height);
  exact(p.margin, ['numerator', 'denominator']);
  const gas = uint(p.gasBudget, U256, 1n),
    numerator = uint(p.margin.numerator, U256, 1n),
    denominator = uint(p.margin.denominator, U256, 1n);
  if (numerator < denominator) reject('margin');
  const activationHeight = height(
    o.finalized.height + height(p.activationDelay),
  );
  const cap = uint(o.quote.maxFeePerGas, U256, 1n);
  if (
    cap !==
    2n * uint(o.quote.baseFeePerGas, U256) +
      uint(o.quote.maxPriorityFeePerGas, U256)
  )
    reject('quote cap');
  const wei = ceil(gas * cap * numerator, denominator);
  if (wei <= 0n || wei > U256) reject('wei bound');
  exact(p.history, ['chains', 'guarantees']);
  const chains = list(p.history.chains);
  if (
    !chains.includes('avalanche') ||
    chains.some((chain) => !/^[a-z][a-z0-9-]{0,63}$/.test(chain))
  )
    reject('history chains');
  exact(p.history.guarantees, chains);
  exact(o.frontiers, chains);
  for (const chain of chains) {
    height(p.history.guarantees[chain], 1);
    height(o.frontiers[chain], chain === 'avalanche' ? 0 : 1);
  }
  if (o.frontiers.avalanche !== o.finalized.height) reject('frontier');
  exact(o.prices, ['avax', 'tokens']);
  const [priceN, priceD] = rational(o.prices.avax);
  const selected = list(p.selectedTokenIds);
  const decoded = decodeAvalanchePublication(
    publication,
    p.contract.expectedChainId,
  );
  if (decoded.version !== 2 || decoded.kind !== 'transaction')
    return reject('V2 transaction required');
  const structure = inspectAvalancheFeeStructure(decoded, p.contract);
  same(decoded.rawTokenMap, p.rawTokenMap, 'raw token map');
  same(
    [...selected].sort(),
    decoded.supportedTokens.map((token) => token.tokenId).sort(),
    'selected tokens',
  );
  const e = decoded.feeEvidence;
  same(e.finalized, o.finalized, 'finalized authority');
  same(e.quote, o.quote, 'quote authority');
  same(
    e.policy,
    {
      gasBudget: p.gasBudget,
      margin: p.margin,
      activationDelay: p.activationDelay,
    },
    'policy authority',
  );
  same(
    e.history,
    {
      chains: p.history.chains,
      frontiers: o.frontiers,
      guarantees: p.history.guarantees,
    },
    'history authority',
  );
  equalPrice(decoded.avalancheDecimalPrices.avax, o.prices.avax);
  const sets = decoded.rawTokenMap;
  const allMembers = sets.flatMap((set) => Object.values(set));
  /** Finds every token set containing the selected token identifier on any chain. */
  const matching = (tokenId: string) =>
    sets.filter((set) =>
      Object.values(set).some(
        (member) =>
          String(member.tokenId).toLowerCase() === tokenId.toLowerCase(),
      ),
    );
  const nativeSets = sets.filter(
    (set) =>
      set.avalanche?.tokenId === 'avax' || set.avalanche?.type === 'native',
  );
  const native = nativeSets[0];
  if (
    nativeSets.length !== 1 ||
    native.avalanche.tokenId !== 'avax' ||
    native.avalanche.type !== 'native' ||
    native.avalanche.residency !== 'native' ||
    native.avalanche.decimals !== 18 ||
    !native.ergo ||
    typeof native.ergo.decimals !== 'number' ||
    native.ergo.decimals > 18
  )
    reject('native mapping');
  const selectedSets = selected.map((tokenId) => {
    const matches = matching(tokenId);
    if (matches.length !== 1) reject('selected mapping');
    return { tokenId, set: matches[0] };
  });
  const av = selectedSets.filter(({ set }) => set.avalanche);
  exact(
    p.common,
    av.map(({ tokenId }) => tokenId),
  );
  exact(
    o.prices.tokens,
    av.map(({ tokenId }) => tokenId),
  );
  same(
    e.assets.map((asset) => asset.selectedTokenId).sort(),
    av.map(({ tokenId }) => tokenId).sort(),
    'plan asset set',
  );
  const expected = new Map<
    string,
    { ergoTokenId: string; fee: AvalancheFeeConfig }
  >();
  for (const { tokenId, set } of av) {
    for (const candidate of new Set([native, set])) {
      if (
        !candidate.ergo ||
        !['EIP-004', 'token'].includes(String(candidate.ergo.type)) ||
        !['native', 'wrapped'].includes(String(candidate.ergo.residency)) ||
        (candidate === native && candidate.ergo.residency !== 'wrapped') ||
        typeof candidate.ergo.tokenId !== 'string' ||
        !/^[0-9a-f]{64}$/.test(candidate.ergo.tokenId) ||
        /^0+$/.test(candidate.ergo.tokenId)
      )
        reject('Ergo mapping');
      if (
        Object.values(candidate).filter(
          (member) => member.residency === 'native',
        ).length !== 1
      )
        reject('native origin');
      for (const member of Object.values(candidate))
        if (
          allMembers.filter(
            (other) =>
              String(other.tokenId).toLowerCase() ===
              String(member.tokenId).toLowerCase(),
          ).length !== 1
        )
          reject('map alias');
    }
    if (
      set !== native &&
      (set.avalanche.type !== 'ERC-20' ||
        typeof set.avalanche.tokenId !== 'string' ||
        !/^0x[0-9a-f]{40}$/.test(set.avalanche.tokenId) ||
        /^0x0{40}$/.test(set.avalanche.tokenId))
    )
      reject('ERC20 mapping');
    const decimals = Math.min(
      ...Object.values(set).map((member) => Number(member.decimals)),
    );
    const metadata = decoded.supportedTokens.find(
      (token) => token.tokenId === tokenId,
    )!;
    if (
      metadata.ergoSideTokenId !== set.ergo.tokenId ||
      metadata.decimals !== decimals
    )
      reject('asset metadata');
    const common = p.common[tokenId];
    exact(common, commonFields);
    for (const field of commonFields)
      uint(
        common[field],
        I64,
        field === 'rsnRatio' || field === 'rsnRatioDivisor' ? 1n : 0n,
      );
    equalPrice(
      decoded.avalancheDecimalPrices.tokens[tokenId],
      o.prices.tokens[tokenId],
    );
    if (set === native) equalPrice(o.prices.avax, o.prices.tokens[tokenId]);
    const [tokenN, tokenD] = rational(o.prices.tokens[tokenId]);
    const networkFee = ceil(
      wei * priceN * tokenD * 10n ** BigInt(decimals),
      10n ** 18n * priceD * tokenN,
    );
    if (networkFee <= 0n || networkFee > I64) reject('network fee bound');
    const fee = { ...common, networkFee: networkFee.toString() };
    const ergoTokenId = String(set.ergo.tokenId);
    const asset = e.assets.find((entry) => entry.selectedTokenId === tokenId)!;
    same(
      asset,
      { selectedTokenId: tokenId, ergoTokenId, activationHeight, fee },
      'plan asset economics',
    );
    expected.set(tokenId, { ergoTokenId, fee });
  }
  same(
    e.updates.map((update) => update.ergoTokenId).sort(),
    structure.feeOutputs.map((output) => output.tokenId).sort(),
    'update/output bijection',
  );
  const checked = e.updates.filter((update) =>
    expected.has(update.selectedTokenId),
  );
  if (!checked.length) reject('no Avalanche update');
  exact(
    o.priorFeeBoxes,
    checked.map((update) => update.ergoTokenId),
  );
  const checkedUpdates: AvalancheFeeEconomicsReport['checkedUpdates'][number][] =
    [];
  const structuralOnlyTargets: string[] = [];
  for (const update of e.updates) {
    const selectedSet = selectedSets.find(
      (entry) => entry.tokenId === update.selectedTokenId,
    );
    if (!selectedSet || selectedSet.set.ergo?.tokenId !== update.ergoTokenId)
      reject('update identity');
    if (!expected.has(update.selectedTokenId)) {
      structuralOnlyTargets.push(update.ergoTokenId);
      continue;
    }
    const calculated = expected.get(update.selectedTokenId)!;
    if (calculated.ergoTokenId !== update.ergoTokenId)
      reject('target identity');
    same(
      update.candidate.configs.avalanche,
      calculated.fee,
      'candidate Avalanche fee',
    );
    same(
      update.candidate.heights.avalanche,
      activationHeight,
      'candidate activation',
    );
    for (const config of Object.values(update.candidate.configs))
      for (const field of commonFields)
        same(
          config[field],
          p.common[update.selectedTokenId][field],
          'candidate common authority',
        );
    const prior = o.priorFeeBoxes[update.ergoTokenId];
    const input = structure.feeInputs.find(
      (entry) => entry.tokenId === update.ergoTokenId,
    );
    if (
      prior !== null &&
      (typeof prior !== 'string' ||
        !prior.length ||
        Buffer.from(prior, 'base64').toString('base64') !== prior)
    )
      reject('prior encoding');
    if (prior === null ? input !== undefined : input?.serialized !== prior)
      reject('prior box authority');
    const output = structure.feeOutputs.find(
      (entry) => entry.tokenId === update.ergoTokenId,
    )!;
    same(
      output.fees,
      retainedHistory(
        input?.fees ?? [],
        update.candidate,
        chains,
        o.frontiers,
        p.history.guarantees,
      ),
      'retained history',
    );
    checkedUpdates.push({
      selectedTokenId: update.selectedTokenId,
      ergoTokenId: update.ergoTokenId,
      outputIndex: output.index,
      activationHeight,
      fee: calculated.fee,
    });
  }
  return freeze({
    scope: 'published-avalanche-updates-only',
    publicationId: decoded.publicationId,
    transactionId: structure.transactionId!,
    checkedUpdates,
    structuralOnlyTargets,
  });
};
