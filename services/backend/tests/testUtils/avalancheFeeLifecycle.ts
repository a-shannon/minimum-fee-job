import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type {
  TrustedAvalancheFeePolicy,
  TrustedAvalancheFeeObservations,
} from '../../../frontend/src/avalanche/economics';
import { pinnedFeeDependencies } from '../fixtures/pinnedFeeDependencies';
import {
  legacyChains,
  nft,
  avax,
  ada,
} from '../testData/avalancheFeeLifecycle';

export type Mode =
  | 'nominal'
  | 'disabled'
  | 'invalid chain'
  | 'unsupported map'
  | 'history disabled'
  | 'database failure';

/** Synthetic chain observations; actual token JSON, config JSON and SQLite live in an external artifact directory. */
export const lifecycleFixture = (
  directory: string,
  mode: Mode,
  chainId: 43113 | 43114 = 43113,
  existing = false,
) => {
  const deps = pinnedFeeDependencies(),
    w = deps.wasm;
  const feeKey =
    '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
  const address = w.Address.from_public_key(
    Buffer.from(feeKey, 'hex'),
  ).to_base58(0);
  const fundingAddress = w.Address.from_public_key(
    Buffer.from(
      '02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5',
      'hex',
    ),
  ).to_base58(0);
  const enabled = mode !== 'disabled' && mode !== 'history disabled';
  const rawMap: TrustedAvalancheFeePolicy['rawTokenMap'] = [
    {
      ergo: {
        tokenId: 'erg',
        name: 'ERG',
        decimals: 9,
        residency: 'native',
        type: 'native',
      },
    },
    {
      cardano: {
        tokenId: 'ada',
        name: 'ADA',
        decimals: 6,
        residency: 'native',
        type: 'native',
      },
      ergo: { tokenId: ada, decimals: 6 },
    },
    ...(enabled
      ? [
          {
            avalanche: {
              tokenId: 'avax',
              name: 'AVAX',
              decimals: 18,
              residency: 'native',
              type: 'native',
            },
            ergo: {
              tokenId: avax,
              decimals: 9,
              type: 'EIP-004',
              residency: 'wrapped',
            },
            ...(mode === 'unsupported map'
              ? { unsupported: { tokenId: 'other', decimals: 9 } }
              : {}),
          },
        ]
      : []),
  ];
  const selected = ['erg', 'ada', ...(enabled ? ['avax'] : [])];
  const prices = { erg: 1, ada: 1, avax: 2 };
  const guarantee = {
    'ergo': 720,
    'cardano': 4320,
    'bitcoin': 144,
    'ethereum': 7200,
    'binance': 28800,
    'doge': 1440,
    'bitcoin-runes': 144,
    'firo': 576,
    'handshake': 144,
    'avalanche': 10,
  };
  const policy: TrustedAvalancheFeePolicy = {
    contract: {
      expectedChainId: chainId,
      minimumFeeAddress: address,
      minimumFeeNFT: nft,
    },
    rawTokenMap: structuredClone(rawMap),
    selectedTokenIds: selected,
    gasBudget: '1000000000000000000',
    margin: { numerator: '1', denominator: '1' },
    activationDelay: 5,
    history: { chains: [...legacyChains, 'avalanche'], guarantees: guarantee },
    // Literal configured bridgeFeeUSD=1, AVAX price=2, decimals=9;
    // RSN=AVAX gives ratio1 at precision6, feeRatioFloat=.005 *10000=50.
    common: {
      avax: {
        bridgeFee: '500000000',
        rsnRatio: '100000',
        rsnRatioDivisor: '100000',
        feeRatio: '50',
      },
    },
  };
  const priorFeeBoxes: Record<string, string | null> = { [avax]: null };
  const observations: TrustedAvalancheFeeObservations = {
    finalized: { chainId, height: 100, hash: '0x' + '01'.repeat(32) },
    quote: {
      chainId,
      baseFeePerGas: '16',
      maxPriorityFeePerGas: '1',
      maxFeePerGas: '33',
    },
    frontiers: Object.fromEntries(
      [...legacyChains, 'avalanche'].map((chain) => [chain, 100]),
    ),
    prices: { avax: '2', tokens: { avax: '2' } },
    priorFeeBoxes,
  };
  const fee = {
    bridgeFeeUSD: 1,
    ergNetworkFee: 0.001,
    adaNetworkFee: 1,
    feeRatioFloat: 0.005,
    bitcoinConfirmation: 6,
    dogeConfirmation: 6,
    delays: Object.fromEntries(legacyChains.map((chain) => [chain, 5])),
  };
  const config = {
    logs: [{ type: 'console', level: 'error' }],
    interval: 991.337,
    tokensPath: join(directory, 'tokens.json'),
    database: {
      type: 'sqlite',
      path:
        mode === 'database failure'
          ? directory
          : join(directory, 'prices.sqlite'),
    },
    triggerPercent: {
      bridgeFee: 5,
      rsnRatio: 5,
      networkFee: Object.fromEntries(legacyChains.map((chain) => [chain, 5])),
    },
    auth: { koios: '', coingecko: '' },
    urls: {
      ...Object.fromEntries(
        [
          'coinMarketCap',
          'coingecko',
          'spectrum',
          'dexHunter',
          'ergoExplorer',
          'cardanoKoios',
          'bitcoinEsplora',
          'dogeBlockcypher',
          'ethereumRpc',
          'binanceRpc',
          'minswap',
          'handshakeRpc',
        ].map((name) => [name, 'https://external.invalid']),
      ),
      firoElectrumX: { host: 'external.invalid', port: 1, reconnectDelay: 1 },
    },
    kv: {
      restApiUrl: 'https://synthetic-kv.invalid',
      restApiToken: 'synthetic-token',
    },
    minimumFee: {
      RSN: enabled ? 'avax' : 'erg',
      NFT: nft,
      minimumFeeAddress: address,
      feeAddress: fundingAddress,
      minBoxErg: '1000000',
      defaultFee: fee,
      supportedTokens: selected.map((tokenId) => ({
        tokenId,
        priceBackend: 'manual',
        priceBackendParams: { price: prices[tokenId as keyof typeof prices] },
      })),
      fetchBoxRetry: 1,
      rsnRatioPrecision: 6,
      bitcoinTxVSize: 150,
      bitcoinMinUtxo: 0.00000546,
      dogeTxSize: 226,
      firoTxSize: 226,
      handshakeTxSize: 226,
      bitcoinRunesTxVSize: 383,
      dogeMinUtxo: 0.01,
      firoMinUtxo: 0.005,
      handshakeMinUtxo: 0.001,
      ethereumAvgGasPricePeriod: 1,
      ethereumNetworkFeeMultiplier: 1,
      binanceTxFee: 0.00002,
    },
    avalanche: enabled
      ? {
          enabled: true,
          chainId: mode === 'invalid chain' ? 1 : chainId,
          rpcUrl: 'https://avalanche.invalid',
          requestTimeoutMs: 1000,
          gasBudget: policy.gasBudget,
          margin: policy.margin,
          activationDelay: 5,
          avaxPrice: '2',
          tokenPrices: { avax: '2' },
          feeGuaranteeBlocks: 10,
          networkFeeTriggerPercent: '5',
        }
      : { enabled: false },
  };
  mkdirSync(directory, { recursive: true });
  writeFileSync(config.tokensPath, JSON.stringify({ tokens: rawMap }));
  writeFileSync(join(directory, 'default.json'), JSON.stringify(config));
  writeFileSync(join(directory, 'test.json'), '{}');
  const boxes = new Map<string, unknown>();
  if (existing || mode === 'history disabled') {
    const target = mode === 'history disabled' ? 'erg' : avax;
    const row = new deps.fees.MinimumFeeConfig()
      .setChainConfig('ergo', 1, {
        bridgeFee: 1n,
        networkFee: 1n,
        rsnRatio: 1n,
        rsnRatioDivisor: 1n,
        feeRatio: 1n,
      })
      .setChainConfig('avalanche', 1, {
        bridgeFee: 1n,
        networkFee: 1n,
        rsnRatio: 1n,
        rsnRatioDivisor: 1n,
        feeRatio: 1n,
      });
    const candidate = new deps.fees.MinimumFeeBoxBuilder(nft, address)
      .setToken(target)
      .setHeight(1)
      .setValue(1000000n)
      .addConfig(row)
      .build();
    const box = w.ErgoBox.from_box_candidate(candidate, w.TxId.zero(), 1);
    boxes.set(target, box);
    if (existing)
      priorFeeBoxes[avax] = Buffer.from(box.sigma_serialize_bytes()).toString(
        'base64',
      );
  }
  const funding = new w.ErgoBoxCandidateBuilder(
    w.BoxValue.from_i64(w.I64.from_str('100000000')),
    w.Contract.new(w.Address.from_base58(fundingAddress).to_ergo_tree()),
    1,
  );
  funding.add_token(
    w.TokenId.from_str(nft),
    w.TokenAmount.from_i64(w.I64.from_str(String(selected.length))),
  );
  funding.add_token(
    w.TokenId.from_str(ada),
    w.TokenAmount.from_i64(w.I64.from_str('1')),
  );
  if (enabled && !existing)
    funding.add_token(
      w.TokenId.from_str(avax),
      w.TokenAmount.from_i64(w.I64.from_str('1')),
    );
  const fundingBoxes = [
    w.ErgoBox.from_box_candidate(funding.build(), w.TxId.zero(), 20),
  ];
  // Same synthetic ten-header context as the reviewed construction fixture; no proof-validity claim.
  const zero = '0'.repeat(64);
  const headers = w.BlockHeaders.from_json(
    Array(10).fill({
      extensionId: zero,
      difficulty: '5275058176',
      votes: '000000',
      timestamp: 0,
      size: 220,
      stateRoot: '0'.repeat(66),
      height: 100,
      nBits: 0,
      version: 2,
      id: zero,
      adProofsRoot: zero,
      transactionsRoot: zero,
      extensionHash: zero,
      powSolutions: {
        pk: '03702266cae8daf75b7f09d4c23ad9cdc954849ee280eefae0d67bd97db4a68f6a',
        w: feeKey,
        n: '000000019cdfb631',
        d: 0,
      },
      adProofsId: zero,
      transactionsId: zero,
      parentId: zero,
    }),
  );
  const context = new w.ErgoStateContext(
    w.PreHeader.from_block_header(headers.get(0)),
    headers,
  );
  return {
    config,
    boxes,
    funding: fundingBoxes,
    context,
    policy,
    observations,
    selected,
  };
};
