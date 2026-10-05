import { AvalancheFeeCollectionInput } from '../../src/network/avalancheFeeRuntime';

/** Builds the unchanged enabled runtime configuration. */
export const config = () => ({
  enabled: true,
  chainId: 43113,
  rpcUrl: 'https://rpc.invalid',
  requestTimeoutMs: 100,
  gasBudget: '21000',
  margin: { numerator: '11', denominator: '10' },
  activationDelay: 5,
});
/** Builds the unchanged native AVAX policy and token-map fixture. */
export const input = (): AvalancheFeeCollectionInput => ({
  tokenMap: [
    {
      avalanche: {
        tokenId: 'avax',
        type: 'native',
        residency: 'native',
        decimals: 18,
      },
      ergo: {
        tokenId: 'ab'.repeat(32),
        decimals: 9,
        type: 'EIP-004',
        residency: 'wrapped',
      },
    },
  ],
  selectedTokenId: 'avax',
  avaxPrice: '1',
  tokenPrice: '1',
  common: { bridgeFee: 1n, rsnRatio: 1n, rsnRatioDivisor: 1n, feeRatio: 0n },
});
