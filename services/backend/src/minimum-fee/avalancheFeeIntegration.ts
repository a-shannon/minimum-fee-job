import config from 'config';
import * as wasm from 'ergo-lib-wasm-nodejs';

import type { Fee, MinimumFeeConfig } from '@rosen-bridge/minimum-fee';

import { feeGuaranteeDuration, minimumFeeConfigs } from '../configs';
import { readAvalancheFeeConfig } from '../configs/avalancheFee';
import { AvalancheFeeRuntime } from '../network/avalancheFeeRuntime';
import type { TransactionEIP19 } from '../transaction/types';
import type { SupportedTokenConfig, UpdatedFeeConfig } from '../types';
import { SUPPORTED_CHAINS } from '../utils/consts';
import {
  buildAvalancheChainFee,
  convertAvalancheFeeToToken,
} from './avalancheChainFee';
import { AvalancheFeePlan, freezeAvalancheFeePlan } from './avalancheFeePlan';

type Source = {
  tokens: readonly SupportedTokenConfig[];
  rawMap: unknown;
  currentRawMap: unknown;
};
/** Encodes typed primitive values, ordered arrays and sorted object keys for identity checks. */
const canonical = (value: unknown): string => {
  if (value === null) return 'null';
  if (typeof value === 'object')
    return Array.isArray(value)
      ? '[' + Array.from(value, canonical).join(',') + ']'
      : '{' +
          Object.keys(value)
            .sort()
            .map(
              (key) =>
                JSON.stringify(key) +
                ':' +
                canonical((value as Record<string, unknown>)[key]),
            )
            .join(',') +
          '}';
  return JSON.stringify([typeof value, String(value)]);
};
/** Requires a raw-map array and compares its canonical entries independently of set order. */
const mapIdentity = (value: unknown) => {
  if (!Array.isArray(value))
    throw new Error('Invalid original Avalanche token map');
  return value.map(canonical).sort().join('\n');
};
/** Reads the optional Avalanche configuration section without enabling a generation. */
const rawPolicy = (): unknown =>
  config.has('avalanche') ? config.get('avalanche') : undefined;
// node-config wraps nested data in immutable Proxies, which structuredClone
// cannot copy. Capture data descriptors without retaining or freezing its owners.
/** Copies bounded plain data through descriptors without retaining input owners or invoking accessors. */
const captureData = <T>(input: T): T => {
  const active = new WeakSet<object>();
  let nodes = 0;
  /** Copies one bounded value and refuses cycles, accessors and unsupported prototypes. */
  const capture = (value: unknown, depth: number): unknown => {
    if (++nodes > 200000 || depth > 64)
      throw new Error('Avalanche generation data exceeds capture bounds');
    if (typeof value === 'function' || typeof value === 'symbol')
      throw new Error('Invalid Avalanche generation data');
    if (value === null || typeof value !== 'object') return value;
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (
      active.has(value) ||
      (array
        ? prototype !== Array.prototype || value.length > 200000
        : prototype !== Object.prototype && prototype !== null)
    )
      throw new Error('Invalid Avalanche generation data');
    active.add(value);
    const result = array ? new Array(value.length) : {};
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (!descriptor.enumerable) continue;
      if (typeof key !== 'string' || !Object.hasOwn(descriptor, 'value'))
        throw new Error('Invalid Avalanche generation data');
      Object.defineProperty(result, key, {
        value: capture(descriptor.value, depth + 1),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    active.delete(value);
    return result;
  };
  return capture(input, 0) as T;
};
/** Validates enabled runtime, decimal prices, history guarantees and fee triggers into a frozen policy. */
const readPolicy = () => {
  const raw = rawPolicy();
  const runtime = readAvalancheFeeConfig(raw);
  if (!runtime.enabled) return undefined;
  const values = raw as Record<string, unknown>;
  const avaxPrice = values.avaxPrice;
  /** Requires a decimal string accepted by the exact fee conversion validator. */
  const price = (value: unknown): string => {
    if (typeof value !== 'string')
      throw new Error('Explicit Avalanche decimal price is required');
    convertAvalancheFeeToToken(1n, {
      avaxPrice: value,
      tokenPrice: value,
      tokenDecimals: 0,
    });
    return value;
  };
  const tokenPrices = values.tokenPrices;
  if (
    !tokenPrices ||
    typeof tokenPrices !== 'object' ||
    Array.isArray(tokenPrices)
  )
    throw new Error('Explicit Avalanche token prices are required');
  const prices: Record<string, string> = Object.create(null);
  for (const [id, value] of Object.entries(tokenPrices))
    prices[id] = price(value);
  const guarantee = values.feeGuaranteeBlocks;
  if (
    typeof guarantee !== 'number' ||
    !Number.isSafeInteger(guarantee) ||
    guarantee <= 0 ||
    guarantee > 2147483647
  )
    throw new Error('Invalid Avalanche fee guarantee blocks');
  const trigger = values.networkFeeTriggerPercent;
  if (
    typeof trigger !== 'string' ||
    trigger.length > 256 ||
    !/^(0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(trigger)
  )
    throw new Error('Invalid Avalanche network fee trigger percent');
  const [whole, fraction = ''] = trigger.split('.');
  return freezeAvalancheFeePlan({
    raw: captureData(raw),
    runtime,
    avaxPrice: price(avaxPrice),
    prices,
    guarantee,
    triggerNumerator: BigInt(whole + fraction),
    triggerDenominator: 10n ** BigInt(fraction.length),
  });
};
type Policy = NonNullable<ReturnType<typeof readPolicy>>;
/** Captures validated pruning guarantees for every legacy chain and Avalanche. */
const captureHistoryPolicy = (policy: Policy) => {
  const chains = [...SUPPORTED_CHAINS, 'avalanche'];
  if (new Set(chains).size !== chains.length)
    throw new Error('Duplicate Avalanche pruning chain');
  const guarantees = Object.fromEntries(
    chains.map((chain) => {
      if (
        !/^[a-z][a-z0-9-]{0,63}$/.test(chain) ||
        ['constructor', 'prototype'].includes(chain)
      )
        throw new Error('Invalid Avalanche pruning chain');
      const value =
        chain === 'avalanche'
          ? policy.guarantee
          : feeGuaranteeDuration.get(chain);
      if (
        typeof value !== 'number' ||
        !Number.isSafeInteger(value) ||
        value <= 0 ||
        value > 2147483647
      )
        throw new Error('Invalid Avalanche pruning guarantee');
      return [chain, value];
    }),
  );
  return freezeAvalancheFeePlan({ chains, guarantees });
};

/** Validate configuration before service initialization; no generation or RPC. */
export const validateAvalancheFeeStartup = (): void => {
  const policy = readPolicy();
  if (policy) captureHistoryPolicy(policy);
};

let runtime: { identity: string; value: AvalancheFeeRuntime } | undefined;
let latestGeneration = 0;

export interface AvalancheFeeGeneration {
  readonly source: Source;
  readonly policy: Policy;
  readonly historyPolicy: ReturnType<typeof captureHistoryPolicy>;
  readonly assertFresh: () => void;
  readonly publicationInputs?: Readonly<{
    legacyNumericPrices: readonly (readonly [string, number])[];
    rsnTokenId: string;
  }>;
}

/** Captures one validated policy/source snapshot and binds its generation to the configured runtime. */
export const beginAvalancheFeeGeneration = (
  readSource: () => Source,
  readPublicationInputs?: () => {
    legacyNumericPrices: [string, number][];
    rsnTokenId: string;
  },
): AvalancheFeeGeneration | undefined => {
  const policy = readPolicy();
  if (!policy) return undefined;
  const historyPolicy = captureHistoryPolicy(policy);
  const historyIdentity = canonical(historyPolicy);
  const source = freezeAvalancheFeePlan(captureData(readSource()));
  const publicationInputs = readPublicationInputs
    ? freezeAvalancheFeePlan(captureData(readPublicationInputs()))
    : undefined;
  if (publicationInputs) {
    const ids = new Set<string>();
    for (const [id, value] of publicationInputs.legacyNumericPrices) {
      if (
        typeof id !== 'string' ||
        !id ||
        ids.has(id) ||
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value <= 0
      )
        throw new Error('Invalid original legacy numeric prices');
      ids.add(id);
    }
    if (
      typeof publicationInputs.rsnTokenId !== 'string' ||
      !publicationInputs.rsnTokenId ||
      !source.tokens.some(
        (token) => token.tokenId === publicationInputs.rsnTokenId,
      )
    )
      throw new Error('Invalid original RSN publication identity');
  }
  const publicationIdentity = canonical(publicationInputs);
  if (mapIdentity(source.rawMap) !== mapIdentity(source.currentRawMap))
    throw new Error('Avalanche token map changed since initialization');
  const sourceIdentity = canonical(source),
    policyIdentity = canonical(policy);
  const selected = source.tokens.filter((token) =>
    (source.rawMap as Record<string, { tokenId: string }>[]).some(
      (set) =>
        set.avalanche &&
        Object.values(set).some((member) => member?.tokenId === token.tokenId),
    ),
  );
  if (!selected.length)
    throw new Error('Enabled Avalanche fee policy requires a supported asset');
  const ids = new Set<string>();
  for (const token of source.tokens) {
    if (ids.has(token.tokenId))
      throw new Error('Duplicate supported fee token');
    ids.add(token.tokenId);
  }
  const targets = new Set<string>();
  for (const token of selected) {
    if (!Object.hasOwn(policy.prices, token.tokenId))
      throw new Error('Explicit Avalanche selected token price is required');
    buildAvalancheChainFee({
      tokenMap: source.rawMap,
      selectedTokenId: token.tokenId,
      avaxPrice: policy.avaxPrice,
      tokenPrice: policy.prices[token.tokenId],
      expectedChainId: policy.runtime.chainId,
      quote: {
        chainId: policy.runtime.chainId,
        baseFeePerGas: 0n,
        maxPriorityFeePerGas: 1n,
        maxFeePerGas: 1n,
      },
      policy: {
        gasBudget: policy.runtime.gasBudget,
        margin: policy.runtime.margin,
      },
      finalizedHeight: 0,
      activationDelay: policy.runtime.activationDelay,
      common: {
        bridgeFee: 0n,
        rsnRatio: 1n,
        rsnRatioDivisor: 1n,
        feeRatio: 0n,
      },
    });
    const set = (
      source.rawMap as Record<string, { tokenId: string; decimals: number }>[]
    ).find((set) =>
      Object.values(set).some((member) => member?.tokenId === token.tokenId),
    )!;
    if (
      set.ergo.tokenId !== token.ergoSideTokenId ||
      Math.min(...Object.values(set).map((member) => member.decimals)) !==
        token.decimals
    )
      throw new Error(
        'Avalanche supported token identity or decimals mismatch',
      );
    if (targets.has(token.ergoSideTokenId))
      throw new Error('Duplicate Avalanche supported asset alias');
    targets.add(token.ergoSideTokenId);
  }
  const sequence = latestGeneration + 1;
  /** Refuses superseded generations or changes to captured policy, source, pruning or publication inputs. */
  const assertFresh = () => {
    if (sequence !== latestGeneration)
      throw new Error('Avalanche fee generation was superseded');
    if (
      canonical(readPolicy()) !== policyIdentity ||
      canonical(readSource()) !== sourceIdentity
    )
      throw new Error('Avalanche fee generation inputs changed');
    if (canonical(captureHistoryPolicy(policy)) !== historyIdentity)
      throw new Error('Avalanche pruning policy changed');
    if (
      readPublicationInputs &&
      canonical(readPublicationInputs()) !== publicationIdentity
    )
      throw new Error('Avalanche original publication inputs changed');
  };
  // Configuration changes require a new process; do not silently switch endpoints.
  if (runtime && runtime.identity !== policyIdentity)
    throw new Error('Avalanche fee runtime configuration changed');
  if (!runtime)
    runtime = {
      identity: policyIdentity,
      value: new AvalancheFeeRuntime(policy.raw),
    };
  latestGeneration = sequence;
  return { source, policy, historyPolicy, assertFresh, publicationInputs };
};

type Binding = {
  generation: AvalancheFeeGeneration;
  height: number;
  heights: Map<string, number>;
  plan: AvalancheFeePlan;
  candidates: Readonly<Record<string, Fee>>;
  assertFresh: () => void;
  constructionPolicy?: ReturnType<typeof captureTransactionPolicy>;
};
const consumedGenerations = new WeakSet<Binding>();
const bindings = new WeakMap<Map<string, MinimumFeeConfig>, Binding>();

/** Preserve the enabled generation route even if configuration changes later. */
export const usesAvalancheFeePublication = (
  candidates: Map<string, MinimumFeeConfig>,
): boolean => bindings.has(candidates) || readPolicy() !== undefined;

/** Collects the complete Avalanche plan, applies it to private candidates and binds their fresh identities. */
export const finishAvalancheFeeGeneration = async (
  generation: AvalancheFeeGeneration | undefined,
  candidates: Map<string, MinimumFeeConfig>,
  heights: Map<string, number>,
) => {
  if (!generation) return;
  generation.assertFresh();
  const assets = generation.source.tokens
    .filter((token) =>
      (generation.source.rawMap as Record<string, { tokenId: string }>[]).some(
        (set) =>
          set.avalanche &&
          Object.values(set).some(
            (member) => member?.tokenId === token.tokenId,
          ),
      ),
    )
    .map((token) => {
      const fee = candidates.get(token.tokenId)?.getConfig().configs.ergo;
      if (!fee)
        throw new Error('Avalanche fee candidate requires an Ergo counterpart');
      return {
        selectedTokenId: token.tokenId,
        tokenPrice: generation.policy.prices[token.tokenId],
        common: {
          bridgeFee: fee.bridgeFee,
          rsnRatio: fee.rsnRatio,
          rsnRatioDivisor: fee.rsnRatioDivisor,
          feeRatio: fee.feeRatio,
        },
      };
    });
  const collectedPlan = await runtime!.value.collectPlan({
    tokenMap: generation.source.rawMap,
    avaxPrice: generation.policy.avaxPrice,
    assets,
  });
  const plan = freezeAvalancheFeePlan(structuredClone(collectedPlan));
  const planIdentity = canonical(plan);
  generation.assertFresh();
  // Candidates are private to the generator. The entire plan built before this
  // synchronous commit; callers receive no partial map on validation failure.
  for (const asset of plan.assets)
    candidates
      .get(asset.selectedTokenId)!
      .setChainConfig('avalanche', asset.activationHeight, asset.fee);
  heights.set('avalanche', plan.finalized.height);
  const rows = Array.from(candidates, ([id, row]) => ({
    id,
    row,
    identity: canonical(row.getConfig()),
  }));
  const heightIdentity = canonical(Array.from(heights));
  const candidateSnapshots = freezeAvalancheFeePlan(
    Object.fromEntries(
      rows.map(({ id, row }) => [id, structuredClone(row.getConfig())]),
    ),
  );
  /** Checks generation freshness, collected-plan identity, candidate references and contents, and heights. */
  const assertFresh = () => {
    generation.assertFresh();
    if (canonical(collectedPlan) !== planIdentity)
      throw new Error('Avalanche collected plan changed');
    if (
      candidates.size !== rows.length ||
      canonical(Array.from(heights)) !== heightIdentity
    )
      throw new Error('Avalanche candidate batch changed');
    for (const item of rows)
      if (
        candidates.get(item.id) !== item.row ||
        canonical(item.row.getConfig()) !== item.identity
      )
        throw new Error('Avalanche candidate row changed');
    for (const asset of plan.assets) {
      const fee = candidates.get(asset.selectedTokenId)!.getConfig();
      if (
        fee.heights.avalanche !== asset.activationHeight ||
        canonical(fee.configs.avalanche) !== canonical(asset.fee)
      )
        throw new Error('Avalanche plan binding changed');
    }
  };
  assertFresh();
  bindings.set(candidates, {
    generation,
    height: plan.finalized.height,
    heights,
    plan,
    candidates: candidateSnapshots,
    assertFresh,
  });
};

/** Consume once; a failed asynchronous consumer must regenerate its candidates. */
export const consumeAvalancheFeeGeneration = (
  candidates: Map<string, MinimumFeeConfig>,
  heights: Map<string, number>,
): Binding | undefined => {
  const binding = bindings.get(candidates);
  if (!binding) {
    if (
      readPolicy() ||
      Array.from(candidates.values()).some(
        (row) =>
          Object.hasOwn(row.getConfig().heights, 'avalanche') ||
          Object.hasOwn(row.getConfig().configs, 'avalanche'),
      )
    )
      throw new Error('Missing or consumed Avalanche fee plan');
    return undefined;
  }
  if (binding.heights !== heights)
    throw new Error('Avalanche fee frontier map does not match plan');
  binding.assertFresh();
  const policy = captureTransactionPolicy();
  const policyIdentity = canonical(policy);
  const previousAssert = binding.assertFresh;
  binding.assertFresh = () => {
    previousAssert();
    if (canonical(captureTransactionPolicy()) !== policyIdentity)
      throw new Error('Avalanche transaction policy changed');
  };
  binding.constructionPolicy = policy;
  consumedGenerations.add(binding);
  bindings.delete(candidates);
  return binding;
};

/** Freezes the configured fee NFT, addresses and transaction/box amounts for construction. */
const captureTransactionPolicy = () =>
  freezeAvalancheFeePlan({
    minimumFeeNFT: minimumFeeConfigs.minimumFeeNFT,
    minimumFeeAddress: minimumFeeConfigs.minimumFeeAddress,
    feeAddress: minimumFeeConfigs.feeAddress,
    minBoxErg: minimumFeeConfigs.minBoxErg,
    txFee: minimumFeeConfigs.txFee,
  });

/** Encodes the exact Sigma-serialized box bytes as base64 for later identity comparison. */
export const avalancheBoxBytes = (box: wasm.ErgoBox): string =>
  Buffer.from(box.sigma_serialize_bytes()).toString('base64');

/** Serializes a candidate with a fixed zero transaction ID and output index for identity comparison. */
export const avalancheCandidateBytes = (box: wasm.ErgoBoxCandidate): string =>
  avalancheBoxBytes(wasm.ErgoBox.from_box_candidate(box, wasm.TxId.zero(), 0));

/** Reconstruct through public WASM fields; never mutate a caller's fee builder. */
export const cloneAvalancheCandidate = (
  bytes: string,
  value?: bigint,
): wasm.ErgoBoxCandidate => {
  const box = wasm.ErgoBox.sigma_parse_bytes(Buffer.from(bytes, 'base64'));
  const builder = new wasm.ErgoBoxCandidateBuilder(
    value === undefined
      ? box.value()
      : wasm.BoxValue.from_i64(wasm.I64.from_str(value.toString())),
    wasm.Contract.new(box.ergo_tree()),
    box.creation_height(),
  );
  const tokens = box.tokens();
  for (let i = 0; i < tokens.len(); i++) {
    const token = tokens.get(i);
    builder.add_token(token.id(), token.amount());
  }
  for (let id = 4; id <= 9; id++) {
    const register = box.register_value(id);
    if (register) builder.set_register_value(id, register);
  }
  return builder.build();
};

type ConstructionEntry = Readonly<{
  tokenId: string;
  ergoTokenId: string;
  current?: string;
  candidate: string;
}>;
export interface AvalancheFeeConstruction {
  readonly policy: ReturnType<typeof captureTransactionPolicy>;
  readonly entries: readonly ConstructionEntry[];
  readonly assertFresh: () => void;
}
const updatedBindings = new WeakMap<
  Map<string, UpdatedFeeConfig>,
  AvalancheFeeConstruction
>();
const authenticConstructions = new WeakSet<AvalancheFeeConstruction>();
const enteredConstructions = new WeakSet<AvalancheFeeConstruction>();
const constructionBindings = new WeakMap<AvalancheFeeConstruction, Binding>();
const transactionBindings = new WeakMap<
  TransactionEIP19,
  { construction: AvalancheFeeConstruction; identity: string }
>();

/** Binds an ordered update batch to a consumed generation and its captured current/candidate box bytes. */
export const bindAvalancheUpdatedConfigs = (
  binding: Binding | undefined,
  updated: Map<string, UpdatedFeeConfig>,
): void => {
  if (!binding) return;
  if (!consumedGenerations.has(binding) || !binding.constructionPolicy)
    throw new Error('Unbound Avalanche generation');
  binding.assertFresh();
  const entries: ConstructionEntry[] = [];
  const rows = Array.from(updated, ([tokenId, row]) => {
    const token = binding.generation.source.tokens.find(
      (item) => item.tokenId === tokenId,
    );
    if (!token) throw new Error('Unexpected Avalanche fee candidate token');
    const oldBox = row.current.getBox();
    const current = oldBox ? avalancheBoxBytes(oldBox) : undefined;
    const candidate = avalancheCandidateBytes(row.new.build());
    entries.push(
      Object.freeze({
        tokenId,
        ergoTokenId: token.ergoSideTokenId,
        current,
        candidate,
      }),
    );
    return {
      tokenId,
      row,
      currentRef: row.current,
      newRef: row.new,
      current,
      candidate,
      fees: canonical(row.new.getConfigs()),
    };
  });
  /** Checks the original generation and ordered rows, references, builder bytes and fee configurations. */
  const assertFresh = () => {
    binding.assertFresh();
    if (updated.size !== rows.length)
      throw new Error('Avalanche updated fee map changed');
    let index = 0;
    for (const [id, row] of updated) {
      const expected = rows[index++];
      const old = row.current.getBox();
      if (
        id !== expected.tokenId ||
        row !== expected.row ||
        row.current !== expected.currentRef ||
        row.new !== expected.newRef ||
        (old ? avalancheBoxBytes(old) : undefined) !== expected.current ||
        avalancheCandidateBytes(row.new.build()) !== expected.candidate ||
        canonical(row.new.getConfigs()) !== expected.fees
      )
        throw new Error('Avalanche updated fee entry changed');
    }
  };
  assertFresh();
  const construction = Object.freeze({
    policy: binding.constructionPolicy,
    entries: Object.freeze(entries),
    assertFresh,
  });
  authenticConstructions.add(construction);
  constructionBindings.set(construction, binding);
  updatedBindings.set(updated, construction);
  consumedGenerations.delete(binding);
};

/** Consumes a fresh update binding once and validates its nonempty construction and amount/address policy. */
export const consumeAvalancheUpdatedConfigs = (
  updated: Map<string, UpdatedFeeConfig>,
): AvalancheFeeConstruction | undefined => {
  const construction = updatedBindings.get(updated);
  if (!construction) {
    if (
      readPolicy() ||
      Array.from(updated.values()).some((row) =>
        [
          ...row.new.getConfigs(),
          ...(row.current.getBox() ? row.current.getConfigs() : []),
        ].some(
          (fee) =>
            Object.hasOwn(fee.heights, 'avalanche') ||
            Object.hasOwn(fee.configs, 'avalanche'),
        ),
      )
    )
      throw new Error('Missing or consumed Avalanche construction binding');
    return undefined;
  }
  construction.assertFresh();
  updatedBindings.delete(updated);
  if (!construction.entries.length)
    throw new Error('No Avalanche fee updates to construct');
  const policy = construction.policy;
  for (const value of [policy.minBoxErg, policy.txFee])
    if (typeof value !== 'bigint' || value <= 0n || value > (1n << 63n) - 1n)
      throw new Error('Invalid Avalanche transaction amount policy');
  if (
    typeof policy.minimumFeeNFT !== 'string' ||
    !/^[0-9a-f]{64}$/.test(policy.minimumFeeNFT)
  )
    throw new Error('Invalid Avalanche fee NFT policy');
  wasm.Address.from_base58(policy.minimumFeeAddress);
  wasm.Address.from_base58(policy.feeAddress);
  return construction;
};

/** Admits a fresh authentic construction permit once and refuses an unbound enabled route. */
export const enterAvalancheFeeConstruction = (
  construction?: AvalancheFeeConstruction,
): void => {
  if (!construction) {
    if (readPolicy())
      throw new Error('Avalanche fee construction requires a bound permit');
    return;
  }
  if (
    !authenticConstructions.has(construction) ||
    enteredConstructions.has(construction)
  )
    throw new Error('Invalid or reused Avalanche construction permit');
  construction.assertFresh();
  enteredConstructions.add(construction);
};

/** Freezes a transaction copy and binds its identity to the admitted construction permit. */
export const bindAvalancheFeeTransaction = (
  construction: AvalancheFeeConstruction,
  tx: TransactionEIP19,
): TransactionEIP19 => {
  if (
    !authenticConstructions.has(construction) ||
    !enteredConstructions.has(construction)
  )
    throw new Error('Invalid Avalanche construction permit');
  construction.assertFresh();
  const captured = freezeAvalancheFeePlan(structuredClone(tx));
  transactionBindings.set(captured, {
    construction,
    identity: canonical(captured),
  });
  return captured;
};

/** Construction provenance only; an eventual publisher must call this again. */
export const assertAvalancheFeeTransaction = (tx: TransactionEIP19): void => {
  const binding = transactionBindings.get(tx);
  if (!binding || canonical(tx) !== binding.identity)
    throw new Error('Unbound Avalanche fee transaction');
  binding.construction.assertFresh();
};

/** Original public metadata only: never include raw policy or RPC credentials. */
export const captureAvalanchePublication = (
  source: TransactionEIP19 | Map<string, UpdatedFeeConfig>,
) => {
  const construction =
    source instanceof Map
      ? updatedBindings.get(source)
      : transactionBindings.get(source)?.construction;
  if (
    !construction ||
    (source instanceof Map && construction.entries.length !== 0)
  )
    throw new Error('Unbound Avalanche publication source');
  if (!(source instanceof Map)) assertAvalancheFeeTransaction(source);
  construction.assertFresh();
  const binding = constructionBindings.get(construction)!;
  const { generation } = binding;
  if (!generation.publicationInputs)
    throw new Error('Original Avalanche publication inputs were not captured');
  const snapshot = freezeAvalancheFeePlan(
    structuredClone({
      chain: 'avalanche' as const,
      chainId: Number(generation.policy.runtime.chainId),
      kind:
        source instanceof Map ? ('empty' as const) : ('transaction' as const),
      transaction: source instanceof Map ? null : source,
      supportedTokens: generation.source.tokens.map((token) => ({
        tokenId: token.tokenId,
        ergoSideTokenId: token.ergoSideTokenId,
        name: token.name,
        decimals: token.decimals,
        fee: Object.fromEntries(
          [
            'delays',
            'bridgeFeeUSD',
            'ergNetworkFee',
            'adaNetworkFee',
            'bitcoinConfirmation',
            'dogeConfirmation',
            'feeRatioFloat',
            'rsnRatioDivisor',
          ]
            .filter((key) => Object.hasOwn(token.fee, key))
            .map((key) => [key, Reflect.get(token.fee, key)]),
        ),
      })),
      rawTokenMap: generation.source.rawMap,
      rsnTokenId: generation.publicationInputs.rsnTokenId,
      legacyNumericPrices: generation.publicationInputs.legacyNumericPrices,
      avalancheDecimalPrices: {
        avax: generation.policy.avaxPrice,
        tokens: generation.policy.prices,
      },
      feeEvidence: publicFeeEvidence(binding, construction),
    }),
  );
  return Object.freeze({ snapshot, assertFresh: construction.assertFresh });
};

/** Requires an exactly representable nonnegative Sigma Int evidence height. */
const publicHeight = (value: number) => {
  if (!Number.isSafeInteger(value) || value < 0 || value > 2147483647)
    throw new Error('Invalid Avalanche evidence height');
  return value;
};
/** Converts a bounded unsigned bigint, optionally positive, to its exact decimal evidence string. */
const publicInteger = (value: bigint, bits: number, positive = false) => {
  if (
    typeof value !== 'bigint' ||
    value < (positive ? 1n : 0n) ||
    value > (1n << BigInt(bits)) - 1n
  )
    throw new Error('Invalid Avalanche evidence integer');
  return value.toString();
};
/** Projects all fee amounts and ratios as validated exact decimal strings. */
const publicFee = (fee: Fee['configs'][string]) => ({
  bridgeFee: publicInteger(fee.bridgeFee, 63),
  networkFee: publicInteger(fee.networkFee, 63),
  rsnRatio: publicInteger(fee.rsnRatio, 63),
  rsnRatioDivisor: publicInteger(fee.rsnRatioDivisor, 63, true),
  feeRatio: publicInteger(fee.feeRatio, 63),
});
/** Projects validated candidate heights and fee configurations, including height-only disabled-chain markers. */
const publicCandidate = (fee: Fee) => ({
  // Height-only disabled-chain markers are part of the original candidate.
  heights: Object.fromEntries(
    Object.entries(fee.heights).map(([chain, height]) => [
      chain,
      publicHeight(height),
    ]),
  ),
  configs: Object.fromEntries(
    Object.entries(fee.configs).map(([chain, value]) => [
      chain,
      publicFee(value),
    ]),
  ),
});
/** Evidence projection only; neither publisher authentication nor economics verification. */
const publicFeeEvidence = (
  binding: Binding,
  construction: AvalancheFeeConstruction,
) => {
  const { plan, generation } = binding;
  const chainId = Number(generation.policy.runtime.chainId);
  if (
    Number(plan.finalized.chainId) !== chainId ||
    Number(plan.quote.chainId) !== chainId ||
    !/^0x[0-9a-f]{64}$/.test(plan.finalized.hash)
  )
    throw new Error('Invalid Avalanche evidence identity');
  return {
    finalized: {
      chainId,
      height: publicHeight(plan.finalized.height),
      hash: plan.finalized.hash,
    },
    quote: {
      chainId,
      baseFeePerGas: publicInteger(plan.quote.baseFeePerGas, 256),
      maxPriorityFeePerGas: publicInteger(plan.quote.maxPriorityFeePerGas, 256),
      maxFeePerGas: publicInteger(plan.quote.maxFeePerGas, 256, true),
    },
    policy: {
      gasBudget: publicInteger(generation.policy.runtime.gasBudget, 256, true),
      margin: {
        numerator: publicInteger(
          generation.policy.runtime.margin.numerator,
          256,
          true,
        ),
        denominator: publicInteger(
          generation.policy.runtime.margin.denominator,
          256,
          true,
        ),
      },
      activationDelay: publicHeight(generation.policy.runtime.activationDelay),
    },
    history: {
      chains: generation.historyPolicy.chains,
      frontiers: Object.fromEntries(
        generation.historyPolicy.chains.map((chain) => [
          chain,
          publicHeight(binding.heights.get(chain)!),
        ]),
      ),
      guarantees: generation.historyPolicy.guarantees,
    },
    assets: plan.assets.map((asset) => ({
      selectedTokenId: asset.selectedTokenId,
      ergoTokenId: asset.ergoTokenId,
      activationHeight: publicHeight(asset.activationHeight),
      fee: publicFee(asset.fee),
    })),
    updates: construction.entries.map((entry) => ({
      selectedTokenId: entry.tokenId,
      ergoTokenId: entry.ergoTokenId,
      candidate: publicCandidate(binding.candidates[entry.tokenId]),
    })),
  };
};

/** Checks bound generation freshness and refuses Avalanche history without an enabled generation binding. */
export const assertAvalancheFeeHistory = (
  binding: Binding | undefined,
  fees: Fee[],
) => {
  binding?.assertFresh();
  if (
    !binding &&
    fees.some(
      (fee) =>
        Object.hasOwn(fee.heights, 'avalanche') ||
        Object.hasOwn(fee.configs, 'avalanche'),
    )
  )
    throw new Error(
      'Stored Avalanche fee history requires enabled Avalanche policy',
    );
};

/** Exact directional percent: increases relative to old, decreases to new. */
export const avalancheFeeChangeRequired = (
  binding: Binding | undefined,
  current: Fee,
  next: Fee,
): boolean => {
  if (!binding) return false;
  const old = current.configs.avalanche?.networkFee,
    newValue = next.configs.avalanche?.networkFee;
  if (newValue === undefined) return old !== undefined;
  if (typeof newValue !== 'bigint' || newValue <= 0n)
    throw new Error('Invalid new Avalanche fee');
  if (old === undefined || old === 0n) return true;
  if (typeof old !== 'bigint' || old < 0n)
    throw new Error('Invalid stored Avalanche fee');
  const diff = old > newValue ? old - newValue : newValue - old;
  const divisor = old > newValue ? newValue : old;
  return (
    diff * 100n * binding.generation.policy.triggerDenominator >
    divisor * binding.generation.policy.triggerNumerator
  );
};
