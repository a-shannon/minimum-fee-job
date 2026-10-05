import type { AvalancheFeePlanInput } from '../../src/minimum-fee/avalancheFeePlan';
import { AvalancheFeeRuntime } from '../../src/network/avalancheFeeRuntime';
import { createPlanTransport } from '../mocked/avalancheFeeRuntimePlan.mock';
import {
  nativeErgo,
  tokenErgo,
  token,
  values,
} from '../testData/avalancheFeeRuntimePlan';

/** Builds a fresh enabled Fuji policy with exact native gas units and a unit margin. */
export const config = () => ({
  enabled: true,
  chainId: 43113,
  rpcUrl: 'https://rpc.invalid',
  requestTimeoutMs: 100,
  gasBudget: '1000000000000000000',
  margin: { numerator: '1', denominator: '1' },
  activationDelay: 5,
});
/** Builds fresh exact common fee fields for each asset. */
export const common = () => ({
  bridgeFee: 1n,
  rsnRatio: 1n,
  rsnRatioDivisor: 1n,
  feeRatio: 0n,
});
/** Builds a fresh two-asset map and paired exact decimal prices before collection. */
export const input = (): AvalancheFeePlanInput => ({
  tokenMap: [
    // Native AVAX maps to its nine-decimal wrapped Ergo counterpart.
    {
      avalanche: {
        tokenId: 'avax',
        type: 'native',
        residency: 'native',
        decimals: 18,
      },
      ergo: {
        tokenId: nativeErgo,
        decimals: 9,
        type: 'EIP-004',
        residency: 'wrapped',
      },
    },
    // The fungible asset maps to a distinct six-decimal Ergo counterpart.
    {
      avalanche: {
        tokenId: token,
        type: 'ERC-20',
        decimals: 18,
        residency: 'native',
      },
      ergo: {
        tokenId: tokenErgo,
        decimals: 6,
        type: 'EIP-004',
        residency: 'wrapped',
      },
    },
  ],
  avaxPrice: '2',
  assets: [
    // Native price equals the AVAX gas currency price.
    { selectedTokenId: 'avax', tokenPrice: '2.0', common: common() },
    // The fungible asset uses its wrapped Ergo alias and a lower exact price.
    { selectedTokenId: tokenErgo, tokenPrice: '0.5', common: common() },
  ],
});
/** Creates an actual runtime and an independent mutable reply map for one collection scenario. */
export const setup = () => {
  const state = structuredClone(values);
  const transport = createPlanTransport(state);
  return {
    state,
    transport,
    runtime: new AvalancheFeeRuntime(config(), () => transport),
  };
};
