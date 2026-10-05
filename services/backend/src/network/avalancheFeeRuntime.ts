import { FetchRequest, JsonRpcProvider } from 'ethers';

import { readAvalancheFeeConfig } from '../configs/avalancheFee';
import {
  applyAvalancheChainFee,
  AvalancheChainFeeInput,
  buildAvalancheChainFee,
} from '../minimum-fee/avalancheChainFee';
import {
  AvalancheFeePlan,
  AvalancheFeePlanInput,
  captureAvalancheFeePlanInput,
  freezeAvalancheFeePlan,
} from '../minimum-fee/avalancheFeePlan';
import {
  AvalancheFinalizedBlock,
  AvalancheRpc,
  AvalancheRpcTransport,
} from './avalancheRpc';

export type AvalancheFeeCollectionInput = Pick<
  AvalancheChainFeeInput,
  'tokenMap' | 'selectedTokenId' | 'avaxPrice' | 'tokenPrice' | 'common'
>;
export type AvalancheFeeTarget = Parameters<typeof applyAvalancheChainFee>[0];
export type AvalancheFeeTransportFactory = (
  request: FetchRequest,
  chainId: 43113n | 43114n,
) => AvalancheRpcTransport & { destroy?(): void };

/** Construction is inert; each collect call is one explicitly requested fee run. */
export class AvalancheFeeRuntime {
  readonly #config: ReturnType<typeof readAvalancheFeeConfig>;
  readonly #transport?: ReturnType<AvalancheFeeTransportFactory>;
  readonly #rpc?: AvalancheRpc;
  #disposed = false;
  #collecting = false;
  #lastFinalized?: AvalancheFinalizedBlock;

  /** Captures validated configuration and creates the optional bounded RPC transport. */
  constructor(
    rawConfig?: unknown,
    factory: AvalancheFeeTransportFactory = (request, chainId) =>
      new JsonRpcProvider(request, Number(chainId), {
        staticNetwork: true,
        batchMaxCount: 1,
        cacheTimeout: -1,
      }),
  ) {
    this.#config = readAvalancheFeeConfig(rawConfig);
    if (!this.#config.enabled) return;
    const request = new FetchRequest(this.#config.rpcUrl);
    request.timeout = this.#config.requestTimeoutMs;
    this.#transport = factory(request, this.#config.chainId);
    this.#rpc = new AvalancheRpc(
      {
        /** Delegates an RPC request only while this runtime remains undisposed. */
        send: (method, params) => {
          if (this.#disposed)
            return Promise.reject(
              new Error('Avalanche fee runtime is disposed'),
            );
          return this.#transport!.send(method, params);
        },
      },
      this.#config.chainId,
    );
  }

  /** Builds one qualified asset fee, applies its captured sink and advances local history. */
  collect = async (
    target: AvalancheFeeTarget,
    input: AvalancheFeeCollectionInput,
  ) =>
    this.#exclusive(async () => {
      const setChainConfig = target?.setChainConfig;
      if (typeof setChainConfig !== 'function')
        throw new Error('Invalid Avalanche fee target');
      const sink = setChainConfig.bind(target);
      const plan = await this.#plan({
        tokenMap: input.tokenMap,
        avaxPrice: input.avaxPrice,
        assets: [
          {
            selectedTokenId: input.selectedTokenId,
            tokenPrice: input.tokenPrice,
            common: input.common,
          },
        ],
      });
      if (this.#disposed) throw new Error('Avalanche fee runtime is disposed');
      const asset = plan.assets[0];
      sink('avalanche', asset.activationHeight, asset.fee);
      this.#lastFinalized = plan.finalized;
      return Object.freeze({
        activationHeight: asset.activationHeight,
        fee: asset.fee,
      });
    });

  /** All assets validate and build before the complete immutable plan is returned. */
  collectPlan = async (
    input: AvalancheFeePlanInput,
  ): Promise<AvalancheFeePlan> =>
    this.#exclusive(async () => {
      const plan = await this.#plan(input);
      if (this.#disposed) throw new Error('Avalanche fee runtime is disposed');
      this.#lastFinalized = plan.finalized;
      return plan;
    });

  /** Runs one enabled collection at a time and releases its lease on every outcome. */
  async #exclusive<T>(action: () => Promise<T>): Promise<T> {
    if (!this.#config.enabled)
      throw new Error('Avalanche fee runtime is disabled');
    if (this.#disposed) throw new Error('Avalanche fee runtime is disposed');
    if (this.#collecting)
      throw new Error('Avalanche fee collection already in progress');
    this.#collecting = true;
    try {
      return await action();
    } finally {
      this.#collecting = false;
    }
  }

  /** Captures asset policy, qualifies the finalized frontier and builds the immutable fee plan. */
  async #plan(input: AvalancheFeePlanInput): Promise<AvalancheFeePlan> {
    const config = this.#config;
    if (!config.enabled) throw new Error('Avalanche fee runtime is disabled');
    // Snapshot every caller-controlled value before the first asynchronous boundary.
    const captured = captureAvalancheFeePlanInput(input);
    const targetIds = new Set<string>();
    const bases = captured.assets.map((asset) => ({
      ...asset,
      tokenMap: captured.tokenMap,
      avaxPrice: captured.avaxPrice,
      expectedChainId: config.chainId,
      policy: { gasBudget: config.gasBudget, margin: config.margin },
      activationDelay: config.activationDelay,
    }));
    // The smallest positive gas price validates inputs before RPC. Any accepted
    // actual positive cap is >=1; this is validation only, never an applied quote.
    const prepared = bases.map((base) => {
      buildAvalancheChainFee({
        ...base,
        finalizedHeight: 0,
        quote: {
          chainId: config.chainId,
          baseFeePerGas: 0n,
          maxPriorityFeePerGas: 1n,
          maxFeePerGas: 1n,
        },
      });
      // The adapter has validated this full raw map and unique selected set.
      const set = (base.tokenMap as Record<string, { tokenId: string }>[]).find(
        (set) =>
          Object.values(set).some(
            (member) => member?.tokenId === base.selectedTokenId,
          ),
      )!;
      const ergoTokenId = set.ergo.tokenId;
      if (targetIds.has(ergoTokenId))
        throw new Error('Duplicate Avalanche fee asset or alias');
      targetIds.add(ergoTokenId);
      return { base, ergoTokenId };
    });
    const finalized = await this.#rpc!.getFinalizedBlock();
    if (this.#disposed) throw new Error('Avalanche fee runtime is disposed');
    // Instance-local monotonic history, not a persistent source or fork proof.
    if (
      this.#lastFinalized &&
      (finalized.height < this.#lastFinalized.height ||
        (finalized.height === this.#lastFinalized.height &&
          finalized.hash !== this.#lastFinalized.hash))
    )
      throw new Error('Avalanche finalized frontier regressed or conflicted');
    const quote = await this.#rpc!.getFeeQuote();
    if (this.#disposed) throw new Error('Avalanche fee runtime is disposed');
    if (
      finalized.chainId !== config.chainId ||
      quote.chainId !== config.chainId
    )
      throw new Error('Avalanche fee collection chain mismatch');
    const assets = prepared.map(({ base, ergoTokenId }) => ({
      selectedTokenId: base.selectedTokenId,
      ergoTokenId,
      ...buildAvalancheChainFee({
        ...base,
        quote,
        finalizedHeight: finalized.height,
      }),
    }));
    return freezeAvalancheFeePlan({ finalized, quote, assets });
  }

  /** Marks the runtime disposed and destroys its optional transport at most once. */
  dispose = () => {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#transport?.destroy?.();
  };
}
