import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Row = { [key: string]: Json };
export type AvalancheChainId = 43113 | 43114;
interface AvalanchePublicationCommon {
  readonly schema: 'rosen-avalanche-fee-publication';
  readonly publicationId: string;
  readonly chain: 'avalanche';
  readonly chainId: AvalancheChainId;
  readonly kind: 'empty' | 'transaction';
  readonly transaction: null | Readonly<{
    reducedTx: string;
    sender: string;
    inputs: readonly string[];
  }>;
  readonly supportedTokens: readonly Readonly<{
    tokenId: string;
    ergoSideTokenId: string;
    name: string;
    decimals: number;
    fee: Readonly<Row>;
  }>[];
  readonly rawTokenMap: readonly Readonly<Record<string, Readonly<Row>>>[];
  readonly rsnTokenId: string;
  readonly legacyNumericPrices: readonly (readonly [string, number])[];
  readonly avalancheDecimalPrices: Readonly<{
    avax: string;
    tokens: Readonly<Record<string, string>>;
  }>;
}

export interface AvalancheFeeConfig {
  readonly bridgeFee: string;
  readonly networkFee: string;
  readonly rsnRatio: string;
  readonly rsnRatioDivisor: string;
  readonly feeRatio: string;
}
export interface AvalancheFeeRecord {
  readonly heights: Readonly<Record<string, number>>;
  readonly configs: Readonly<Record<string, AvalancheFeeConfig>>;
}
export interface AvalancheFeeEvidence {
  readonly finalized: Readonly<{
    chainId: AvalancheChainId;
    height: number;
    hash: string;
  }>;
  readonly quote: Readonly<{
    chainId: AvalancheChainId;
    baseFeePerGas: string;
    maxPriorityFeePerGas: string;
    maxFeePerGas: string;
  }>;
  readonly policy: Readonly<{
    gasBudget: string;
    margin: Readonly<{ numerator: string; denominator: string }>;
    activationDelay: number;
  }>;
  readonly history: Readonly<{
    chains: readonly string[];
    frontiers: Readonly<Record<string, number>>;
    guarantees: Readonly<Record<string, number>>;
  }>;
  readonly assets: readonly Readonly<{
    selectedTokenId: string;
    ergoTokenId: string;
    activationHeight: number;
    fee: AvalancheFeeConfig;
  }>[];
  readonly updates: readonly Readonly<{
    selectedTokenId: string;
    ergoTokenId: string;
    candidate: AvalancheFeeRecord;
  }>[];
}
export interface AvalanchePublicationV1 extends AvalanchePublicationCommon {
  readonly version: 1;
}
export interface AvalanchePublicationV2 extends AvalanchePublicationCommon {
  readonly version: 2;
  readonly feeEvidence: AvalancheFeeEvidence;
}
export type AvalanchePublication =
  | AvalanchePublicationV1
  | AvalanchePublicationV2;

/** Rejects malformed publication data with a fixed diagnostic. */
const fail = (): never => {
  throw new Error('Invalid Avalanche publication');
};
/** Requires an object row rather than a scalar, null or array. */
const record = (value: Json): Row => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  return value as Row;
};
/** Requires every mandatory field and refuses fields outside the declared schema. */
const keys = (row: Row, required: string[], optional: string[] = []) => {
  if (
    required.some((key) => !Object.hasOwn(row, key)) ||
    Object.keys(row).some((key) => ![...required, ...optional].includes(key))
  )
    fail();
};
/** Requires bounded, nonempty text without controls or surrounding whitespace. */
const text = (value: Json, limit = 256): string => {
  if (
    typeof value !== 'string' ||
    !value.length ||
    value.length > limit ||
    value.trim() !== value ||
    Array.from(value).some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    fail();
  return value as string;
};
/** Requires a safe integer within the supplied inclusive bounds. */
const integer = (value: Json, max: number, min = 0) => {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    fail();
};
/** Requires an array and, when requested, at least one entry. */
const array = (value: Json, nonempty = false): Json[] => {
  if (!Array.isArray(value) || (nonempty && !value.length)) fail();
  return value as Json[];
};
/** Requires an exact positive decimal spelling with a bounded exponent. */
const decimal = (value: Json) => {
  const input = text(value);
  const match =
    /^(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]{1,3}))?$/.exec(input);
  if (
    !match ||
    BigInt(match[1] + (match[2] ?? '')) === 0n ||
    Math.abs(Number(match[3] ?? '0')) > 256
  )
    fail();
};
/** Requires bounded Base64 text that survives an exact decode and encode round trip. */
const base64 = (value: Json) => {
  const input = text(value, 2_000_000);
  if (Buffer.from(input, 'base64').toString('base64') !== input) fail();
};
/** Serializes JSON with sorted object keys while retaining array order. */
const canonical = (value: Json): string =>
  Array.isArray(value)
    ? '[' + value.map(canonical).join(',') + ']'
    : value !== null && typeof value === 'object'
      ? '{' +
        Object.keys(value)
          .sort()
          .map((key) => JSON.stringify(key) + ':' + canonical(value[key]))
          .join(',') +
        '}'
      : JSON.stringify(value);

// Capture JSON data without invoking accessors or retaining caller-owned objects.
/** Copies bounded JSON data from value descriptors and rejects unsafe object shapes. */
const capture = (value: unknown, depth = 0, strictArrays = false): Json => {
  if (depth > 12) fail();
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.length > 2_000_000) fail();
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail();
    return value;
  }
  if (!value || typeof value !== 'object') return fail();
  if (Array.isArray(value)) {
    if (value.length > 4096 || Object.keys(value).length !== value.length)
      fail();
    if (strictArrays && Reflect.ownKeys(value).length !== value.length + 1)
      fail();
    return Array.from({ length: value.length }, (_, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !('value' in descriptor)) fail();
      return capture(descriptor!.value, depth + 1, strictArrays);
    });
  }
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail();
  const output: Row = {};
  if (Reflect.ownKeys(value).length > 4096) fail();
  for (const key of Reflect.ownKeys(value)) {
    if (
      typeof key !== 'string' ||
      ['__proto__', 'constructor', 'prototype'].includes(key)
    )
      fail();
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!descriptor.enumerable || !('value' in descriptor)) fail();
    output[key as string] = capture(descriptor.value, depth + 1, strictArrays);
  }
  return output;
};
/** Recursively freezes the captured JSON containers. */
const freeze = (value: Json): void => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
};

/** Parses canonical unsigned decimal text within the supplied bigint bound. */
const uint = (value: Json, max: bigint, positive = false): bigint => {
  const input = text(value, 78);
  if (!/^(?:0|[1-9][0-9]*)$/.test(input)) fail();
  const result = BigInt(input);
  if (result > max || (positive && result === 0n)) fail();
  return result;
};
/** Requires a bounded chain label and rejects reserved object-key names. */
const chainName = (value: Json): string => {
  const name = text(value, 64);
  if (
    !/^[a-z][a-z0-9-]{0,63}$/.test(name) ||
    ['constructor', 'prototype', '__proto__'].includes(name)
  )
    fail();
  return name;
};
/** Checks all five fee fields against Sigma Long bounds with a positive divisor. */
const feeConfig = (value: Json) => {
  const config = record(value);
  const fields = [
    'bridgeFee',
    'networkFee',
    'rsnRatio',
    'rsnRatioDivisor',
    'feeRatio',
  ];
  keys(config, fields);
  for (const field of fields)
    uint(config[field], (1n << 63n) - 1n, field === 'rsnRatioDivisor');
};
/** Checks a fee history row's chain labels, activation heights and fee fields. */
const feeRecord = (value: Json) => {
  const fee = record(value);
  keys(fee, ['heights', 'configs']);
  const heights = record(fee.heights),
    configs = record(fee.configs);
  if (!Object.keys(heights).length || !Object.keys(configs).length) fail();
  for (const [chain, height] of Object.entries(heights)) {
    chainName(chain);
    integer(height, 2147483647);
  }
  for (const [chain, config] of Object.entries(configs)) {
    chainName(chain);
    if (!Object.hasOwn(heights, chain)) fail();
    feeConfig(config);
  }
};
/** Checks evidence schema, chain binding and asset/update shape without certifying economics. */
const feeEvidence = (
  value: Json,
  chainId: AvalancheChainId,
  empty: boolean,
) => {
  const evidence = record(value);
  keys(evidence, [
    'finalized',
    'quote',
    'policy',
    'history',
    'assets',
    'updates',
  ]);
  const finalized = record(evidence.finalized),
    quote = record(evidence.quote);
  keys(finalized, ['chainId', 'height', 'hash']);
  keys(quote, [
    'chainId',
    'baseFeePerGas',
    'maxPriorityFeePerGas',
    'maxFeePerGas',
  ]);
  if (finalized.chainId !== chainId || quote.chainId !== chainId) fail();
  integer(finalized.height, 2147483647);
  if (!/^0x[0-9a-f]{64}$/.test(text(finalized.hash))) fail();
  const max = (1n << 256n) - 1n;
  uint(quote.baseFeePerGas, max);
  uint(quote.maxPriorityFeePerGas, max);
  uint(quote.maxFeePerGas, max, true);
  const policy = record(evidence.policy);
  keys(policy, ['gasBudget', 'margin', 'activationDelay']);
  uint(policy.gasBudget, max, true);
  integer(policy.activationDelay, 2147483647);
  const margin = record(policy.margin);
  keys(margin, ['numerator', 'denominator']);
  if (uint(margin.numerator, max, true) < uint(margin.denominator, max, true))
    fail();
  const history = record(evidence.history);
  keys(history, ['chains', 'frontiers', 'guarantees']);
  const chains = array(history.chains, true).map(chainName);
  if (new Set(chains).size !== chains.length || !chains.includes('avalanche'))
    fail();
  const frontiers = record(history.frontiers),
    guarantees = record(history.guarantees);
  keys(frontiers, chains);
  keys(guarantees, chains);
  for (const chain of chains) {
    integer(frontiers[chain], 2147483647);
    integer(guarantees[chain], 2147483647, 1);
  }
  if (frontiers.avalanche !== finalized.height) fail();
  for (const group of ['assets', 'updates']) {
    const entries = array(evidence[group], group === 'assets');
    if (group === 'updates' && (entries.length === 0) !== empty) fail();
    const selected = new Set<string>(),
      targets = new Set<string>();
    for (const value of entries) {
      const entry = record(value);
      keys(
        entry,
        group === 'assets'
          ? ['selectedTokenId', 'ergoTokenId', 'activationHeight', 'fee']
          : ['selectedTokenId', 'ergoTokenId', 'candidate'],
      );
      const id = text(entry.selectedTokenId),
        target = text(entry.ergoTokenId);
      if (selected.has(id) || targets.has(target)) fail();
      selected.add(id);
      targets.add(target);
      if (group === 'assets') {
        integer(entry.activationHeight, 2147483647);
        feeConfig(entry.fee);
      } else feeRecord(entry.candidate);
    }
  }
};

/** Verifies one publication's schema and digest, not authenticity or freshness. */
export const decodeAvalanchePublication = (
  input: unknown,
  expectedChainId: AvalancheChainId,
): AvalanchePublication => {
  if (expectedChainId !== 43113 && expectedChainId !== 43114) fail();
  if (typeof input === 'string') {
    if (input.length > 8_000_000) fail();
    try {
      input = JSON.parse(input);
    } catch {
      fail();
    }
  }
  const isV2 =
    input !== null &&
    typeof input === 'object' &&
    Object.getOwnPropertyDescriptor(input, 'version')?.value === 2;
  const root = record(capture(input, 0, isV2));
  if (canonical(root).length > 8_000_000) fail();
  keys(root, [
    'schema',
    'version',
    'publicationId',
    'chain',
    'chainId',
    'kind',
    'transaction',
    'supportedTokens',
    'rawTokenMap',
    'rsnTokenId',
    'legacyNumericPrices',
    'avalancheDecimalPrices',
    ...(root.version === 2 ? ['feeEvidence'] : []),
  ]);
  if (
    root.schema !== 'rosen-avalanche-fee-publication' ||
    (root.version !== 1 && root.version !== 2) ||
    root.chain !== 'avalanche' ||
    root.chainId !== expectedChainId ||
    !/^[0-9a-f]{64}$/.test(text(root.publicationId))
  )
    fail();
  if (root.kind === 'empty') {
    if (root.transaction !== null) fail();
  } else if (root.kind === 'transaction') {
    const tx = record(root.transaction);
    keys(tx, ['reducedTx', 'sender', 'inputs']);
    base64(tx.reducedTx);
    if (!/^[1-9A-HJ-NP-Za-km-z]{40,120}$/.test(text(tx.sender))) fail();
    const inputs = array(tx.inputs, true);
    inputs.forEach(base64);
    if (new Set(inputs).size !== inputs.length) fail();
  } else fail();
  if (root.version === 2)
    feeEvidence(root.feeEvidence, expectedChainId, root.kind === 'empty');

  const tokens = array(root.supportedTokens, true).map(record);
  const ids = new Set<string>(),
    targets = new Set<string>();
  for (const token of tokens) {
    keys(token, ['tokenId', 'ergoSideTokenId', 'name', 'decimals', 'fee']);
    const id = text(token.tokenId),
      target = text(token.ergoSideTokenId);
    if (
      ids.has(id) ||
      targets.has(target) ||
      !(target === 'erg' || /^[0-9a-f]{64}$/.test(target))
    )
      fail();
    ids.add(id);
    targets.add(target);
    text(token.name);
    integer(token.decimals, 255);
    const fee = record(token.fee);
    keys(
      fee,
      [],
      [
        'delays',
        'bridgeFeeUSD',
        'ergNetworkFee',
        'adaNetworkFee',
        'bitcoinConfirmation',
        'dogeConfirmation',
        'feeRatioFloat',
        'rsnRatioDivisor',
      ],
    );
    for (const [key, value] of Object.entries(fee)) {
      if (key === 'delays') {
        const delays = record(value);
        keys(
          delays,
          [],
          [
            'ergo',
            'cardano',
            'bitcoin',
            'ethereum',
            'binance',
            'doge',
            'bitcoin-runes',
            'firo',
            'handshake',
            'avalanche',
          ],
        );
        Object.values(delays).forEach((delay) => integer(delay, 2147483647));
      } else if (
        ['bitcoinConfirmation', 'dogeConfirmation', 'rsnRatioDivisor'].includes(
          key,
        )
      )
        integer(value, 2147483647, key === 'rsnRatioDivisor' ? 1 : 0);
      else if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < 0
      )
        fail();
    }
  }
  if (!ids.has(text(root.rsnTokenId))) fail();
  const sets = array(root.rawTokenMap, true).map(record);
  for (const set of sets) {
    if (!Object.keys(set).length) fail();
    for (const [chain, value] of Object.entries(set)) {
      if (!/^[a-z][a-z0-9-]{0,63}$/.test(chain)) fail();
      const member = record(value);
      keys(
        member,
        ['tokenId', 'decimals'],
        ['name', 'type', 'residency', 'extra'],
      );
      text(member.tokenId);
      integer(member.decimals, 255);
      for (const key of ['name', 'type', 'residency'])
        if (Object.hasOwn(member, key)) text(member[key]);
      if (Object.hasOwn(member, 'extra'))
        for (const [key, metadata] of Object.entries(record(member.extra))) {
          text(key);
          if (!['string', 'boolean', 'number'].includes(typeof metadata))
            fail();
        }
    }
  }
  const prices = record(root.avalancheDecimalPrices);
  keys(prices, ['avax', 'tokens']);
  decimal(prices.avax);
  const exactPrices = record(prices.tokens);
  for (const [id, value] of Object.entries(exactPrices)) {
    text(id);
    decimal(value);
  }
  let avalancheAssets = 0;
  for (const token of tokens) {
    const matches = sets.filter((set) =>
      Object.values(set).some(
        (member) => record(member).tokenId === token.tokenId,
      ),
    );
    if (
      matches.length !== 1 ||
      !matches[0].ergo ||
      record(matches[0].ergo).tokenId !== token.ergoSideTokenId
    )
      fail();
    if (matches[0].avalanche) {
      avalancheAssets++;
      if (!Object.hasOwn(exactPrices, token.tokenId as string)) fail();
    }
  }
  if (!avalancheAssets) fail();
  const legacyIds = new Set<string>();
  for (const item of array(root.legacyNumericPrices)) {
    const entry = array(item);
    if (entry.length !== 2) fail();
    const id = text(entry[0]);
    if (legacyIds.has(id) || typeof entry[1] !== 'number' || entry[1] <= 0)
      fail();
    legacyIds.add(id);
  }
  const { publicationId, ...body } = root;
  if (
    createHash('sha256').update(canonical(body)).digest('hex') !== publicationId
  )
    fail();
  freeze(root);
  return root as unknown as AvalanchePublication;
};
