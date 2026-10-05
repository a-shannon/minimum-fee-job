import fs from 'node:fs';
import { createServer, Server } from 'node:http';

import { pinnedFeeDependencies } from '../fixtures/pinnedFeeDependencies';
import {
  state,
  installIntegrationMocks,
} from '../mocked/avalancheFeeIntegration.mock';
import {
  native,
  asset,
  address,
  nft,
} from '../testData/avalancheFeeIntegration';

/** Builds a fresh native AVAX and wrapped Ergo pair. */
export const nativeSet = () => ({
  avalanche: {
    tokenId: 'avax',
    type: 'native',
    residency: 'native',
    decimals: 18,
    name: 'AVAX',
  },
  ergo: { tokenId: native, decimals: 9, type: 'EIP-004', residency: 'wrapped' },
});
/** Builds a fresh ERC20 and wrapped Ergo pair. */
export const assetSet = () => ({
  avalanche: {
    tokenId: address,
    type: 'ERC-20',
    residency: 'native',
    decimals: 18,
    name: 'TOKEN',
  },
  ergo: { tokenId: asset, decimals: 6, type: 'EIP-004', residency: 'wrapped' },
});
/** Builds fresh common fee fields. */
export const common = () => ({
  bridgeFee: 100n,
  networkFee: 1n,
  rsnRatio: 1n,
  rsnRatioDivisor: 1n,
  feeRatio: 1n,
});
/** Live fixture state initialized by the scoped lifecycle hooks. */
export let server: Server,
  url: string,
  methods: string[],
  rpc: Record<string, unknown>;
/** Live fixture state initialized by the scoped lifecycle hooks. */
export let deps: ReturnType<typeof pinnedFeeDependencies>;
/** Builds a policy pointing to the current loopback listener. */
export const raw = () => ({
  enabled: true,
  chainId: 43113,
  rpcUrl: url,
  requestTimeoutMs: 1000,
  gasBudget: '1000000000000000000',
  margin: { numerator: '1', denominator: '1' },
  activationDelay: 5,
  avaxPrice: '2',
  tokenPrices: { avax: '2', [address]: '0.5' },
  feeGuaranteeBlocks: 10,
  networkFeeTriggerPercent: '5',
});
/** Builds a fresh legacy finalized frontier. */
export const heights = () =>
  new Map(
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
    ].map((chain) => [chain, 100]),
  );
/** Builds fresh supported token and original/current raw map snapshots. */
export const source = () => ({
  tokens: [
    {
      tokenId: 'avax',
      ergoSideTokenId: native,
      decimals: 9,
      name: 'AVAX',
      fee: {},
    },
    {
      tokenId: address,
      ergoSideTokenId: asset,
      decimals: 6,
      name: 'TOKEN',
      fee: {},
    },
  ],
  rawMap: [nativeSet(), assetSet()],
  currentRawMap: [nativeSet(), assetSet()],
});
/** Finishes a generation using real loopback RPC and pinned fee models. */
export const setup = async () => {
  const module = await import('../../src/minimum-fee/avalancheFeeIntegration');
  const generation = module.beginAvalancheFeeGeneration(
    () => state.source as never,
  );
  const candidates = new Map<
    string,
    InstanceType<typeof deps.fees.MinimumFeeConfig>
  >();
  for (const id of ['avax', address])
    candidates.set(
      id,
      new deps.fees.MinimumFeeConfig().setChainConfig('ergo', 105, common()),
    );
  const frontier = heights();
  await module.finishAvalancheFeeGeneration(generation, candidates, frontier);
  return { module, generation, candidates, frontier };
};
/** Initializes the actual TokenHandler from an intercepted synthetic JSON file. */
export const initActualHandler = async (
  sets = [nativeSet(), assetSet()],
  legacy = false,
) => {
  const { DefaultLogger, DummyLogger } = await import(
    '@rosen-bridge/abstract-logger'
  );
  DefaultLogger.init(new DummyLogger());
  const policy = {
    bridgeFeeUSD: 1,
    feeRatioFloat: 0.01,
    delays: Object.fromEntries(
      heights()
        .keys()
        .map((key) => [key, 5]),
    ),
    ergNetworkFee: 0.001,
    adaNetworkFee: 1,
    bitcoinConfirmation: 1,
    dogeConfirmation: 1,
    rsnRatioDivisor: 1,
  };
  Reflect.set(
    state.fee as object,
    'supportedTokens',
    sets.map((set) => ({
      tokenId: set.avalanche.tokenId,
      priceBackend: 'manual',
      priceBackendParams: { price: 1 },
      fee: policy,
    })),
  );
  const originalRead = fs.readFileSync,
    originalExists = fs.existsSync;
  vi.spyOn(fs, 'existsSync').mockImplementation(
    (path) =>
      String(path) === 'synthetic-token-map.json' || originalExists(path),
  );
  vi.spyOn(fs, 'readFileSync').mockImplementation(((
    path: fs.PathOrFileDescriptor,
    ...args: unknown[]
  ) =>
    String(path) === 'synthetic-token-map.json'
      ? JSON.stringify({
          tokens: legacy
            ? sets.map(({ avalanche, ergo }) => ({ ethereum: avalanche, ergo }))
            : sets,
        })
      : Reflect.apply(originalRead, fs, [
          path,
          ...args,
        ])) as typeof fs.readFileSync);
  const { TokenHandler } = await import('../../src/tokenMap/tokenHandler');
  await TokenHandler.init('synthetic-token-map.json');
  return TokenHandler.getInstance();
};
/** Builds numeric native, fungible-asset and Ergo prices. */
export const numericPrices = () =>
  new Map([
    ['avax', 2],
    [address, 0.5],
    ['erg', 1],
  ]);
/** Builds a real prior fee box containing the supplied history. */
export const makeOldBox = (
  tokenId: string,
  fees: {
    heights: Record<string, number>;
    configs: Record<string, ReturnType<typeof common>>;
  }[],
) => {
  const settings = state.fee as { minimumFeeAddress: string };
  const builder = new deps.fees.MinimumFeeBoxBuilder(
    nft,
    settings.minimumFeeAddress,
  )
    .setHeight(100)
    .setValue(1000000n)
    .setToken(tokenId);
  for (const fee of fees)
    builder.addConfig(new deps.fees.MinimumFeeConfig(structuredClone(fee)));
  return deps.wasm.ErgoBox.from_box_candidate(
    builder.build(),
    deps.wasm.TxId.zero(),
    0,
  );
};
/** Registers the real HTTP generation fixture only within its owning describe context. */
export const registerIntegrationContext = () => {
  beforeEach(() => {
    vi.doUnmock('../../src/tokenMap/tokenHandler');
    vi.doUnmock('../../src/network/avalancheFeeRuntime');
    installIntegrationMocks();
  });
  beforeAll(async () => {
    deps = pinnedFeeDependencies();
    methods = [];
    rpc = {
      eth_chainId: '0xa869',
      eth_getBlockByNumber: { number: '0x64', hash: '0x' + '56'.repeat(32) },
      eth_baseFee: '0x10',
      eth_maxPriorityFeePerGas: '0x1',
    };
    server = createServer((request, response) => {
      let text = '';
      request.on('data', (chunk) => {
        text += chunk;
      });
      request.on('end', () => {
        const p = JSON.parse(text);
        methods.push(p.method);
        response.setHeader('content-type', 'application/json');
        response.end(
          JSON.stringify({ jsonrpc: '2.0', id: p.id, result: rpc[p.method] }),
        );
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw Error('listener');
    url = `http://127.0.0.1:${addr.port}`;
  });
  afterAll(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  beforeEach(() => {
    vi.resetModules();
    state.raw = raw();
    state.source = source();
    state.boxes.clear();
    state.fetchHook = undefined;
    methods.length = 0;
    state.fee = {
      minimumFeeNFT: nft,
      minimumFeeAddress: deps.wasm.Address.from_public_key(
        Buffer.from(
          '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
          'hex',
        ),
      ).to_base58(0),
      minBoxErg: 1000000n,
      fetchBoxRetry: 1,
      RSNTokenId: 'avax',
      rsnRatioPrecision: 6,
      ethereumAvgGasPricePeriod: 1,
      ethereumNetworkFeeMultiplier: 1,
      bitcoinTxVSize: 1,
      bitcoinMinUtxo: 0,
      dogeTxSize: 1,
      dogeMinUtxo: 0,
      firoTxSize: 1,
      firoMinUtxo: 0,
      handshakeTxSize: 1,
      handshakeMinUtxo: 0,
      binanceTxFee: 1,
      bitcoinRunesTxVSize: 1,
    };
  });
  afterEach(() => vi.restoreAllMocks());
};
