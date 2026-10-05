import type { AvalancheFeePlanInput } from '../../src/minimum-fee/avalancheFeePlan';
import { wrappedAvax } from '../testData/avalancheFeePlan';

/** Creates fresh caller-owned native identity, decimal prices and exact fee units. */
export const createPlanInput = () =>
  ({
    tokenMap: [
      {
        avalanche: {
          tokenId: 'avax',
          type: 'native',
          residency: 'native',
          decimals: 18,
        },
        ergo: {
          tokenId: wrappedAvax,
          decimals: 9,
          type: 'EIP-004',
          residency: 'wrapped',
        },
      },
    ],
    avaxPrice: '2.00',
    assets: [
      {
        selectedTokenId: 'avax',
        tokenPrice: '2.0',
        common: {
          bridgeFee: 1n,
          rsnRatio: 1n,
          rsnRatioDivisor: 1n,
          feeRatio: 0n,
        },
      },
    ],
  }) satisfies AvalancheFeePlanInput;
