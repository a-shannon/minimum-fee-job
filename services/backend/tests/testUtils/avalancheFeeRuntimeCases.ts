import { AvalancheFeeCollectionInput } from '../../src/network/avalancheFeeRuntime';

/** One invalid caller field before RPC. */
export const invalidPreflightMutations = [
  // One invalid caller field before RPC: token.
  [
    'token',
    (a: AvalancheFeeCollectionInput) => {
      a.selectedTokenId = 'missing';
    },
  ],

  // One invalid caller field before RPC: price.
  [
    'price',
    (a: AvalancheFeeCollectionInput) => {
      a.tokenPrice = '0';
    },
  ],

  // One invalid caller field before RPC: common.
  [
    'common',
    (a: AvalancheFeeCollectionInput) => {
      a.common = { ...a.common, rsnRatio: 0n };
    },
  ],
] as const;
