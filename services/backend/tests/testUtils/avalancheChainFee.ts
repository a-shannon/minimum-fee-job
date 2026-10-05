import { AvalancheChainFeeInput } from '../../src/minimum-fee/avalancheChainFee';
import { wrapped, token, ergoToken } from '../testData/avalancheChainFee';

/** Builds the unchanged native AVAX chain-fee fixture. */
export const input = (): AvalancheChainFeeInput => ({
  expectedChainId: 43113n,
  quote: {
    chainId: 43113n,
    baseFeePerGas: 1n,
    maxPriorityFeePerGas: 1n,
    maxFeePerGas: 3n,
  },
  policy: { gasBudget: 1000000000000000000n },
  tokenMap: [
    {
      avalanche: {
        tokenId: 'avax',
        type: 'native',
        residency: 'native',
        decimals: 18,
      },
      ergo: {
        tokenId: wrapped,
        decimals: 9,
        type: 'EIP-004',
        residency: 'wrapped',
      },
    },
  ],
  selectedTokenId: 'avax',
  avaxPrice: '12.50',
  tokenPrice: '1.25e1',
  finalizedHeight: 100,
  activationDelay: 5,
  common: {
    bridgeFee: 123n,
    rsnRatio: 7n,
    rsnRatioDivisor: 1000n,
    feeRatio: 50n,
  },
});
export type Member = {
  tokenId: string;
  decimals: number;
  type?: string;
  residency?: string;
};
/** Exposes the synthetic raw map for one isolated mutation. */
export const map = (value: AvalancheChainFeeInput) =>
  value.tokenMap as Record<string, Member>[];
/** Builds unchanged exact decimal price fixtures. */
export const prices = (
  avaxPrice = '1',
  tokenPrice = '1',
  tokenDecimals = 18,
) => ({
  avaxPrice,
  tokenPrice,
  tokenDecimals,
});

/** Builds the unchanged independently mapped fee-asset fixture. */
export const args = () => {
  const a = input();
  map(a).push({
    avalanche: {
      tokenId: token,
      decimals: 24,
      type: 'ERC-20',
      residency: 'native',
    },
    ergo: {
      tokenId: ergoToken,
      decimals: 24,
      type: 'EIP-004',
      residency: 'wrapped',
    },
  });
  a.selectedTokenId = ergoToken;
  a.tokenPrice = '2.5';
  a.policy.gasBudget = 1n;
  return a;
};
