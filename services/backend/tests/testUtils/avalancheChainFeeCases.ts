import { AvalancheChainFeeInput } from '../../src/minimum-fee/avalancheChainFee';
import { wrapped, token, ergoToken } from '../testData/avalancheChainFee';
import { map } from './avalancheChainFee';

/** Each row mutates one native map or quote boundary independently. */
export const faults: [string, (args: AvalancheChainFeeInput) => void][] = [
  // Each row mutates one native map or quote boundary independently: missing native.
  [
    'missing native',
    (a) => {
      delete map(a)[0].avalanche;
    },
  ],

  // Each row mutates one native map or quote boundary independently: duplicate native.
  [
    'duplicate native',
    (a) => {
      map(a).push(structuredClone(map(a)[0]));
    },
  ],

  // Each row mutates one native map or quote boundary independently: native token ID.
  [
    'native token ID',
    (a) => {
      map(a)[0].avalanche.tokenId = 'other';
    },
  ],

  // Each row mutates one native map or quote boundary independently: native type.
  [
    'native type',
    (a) => {
      map(a)[0].avalanche.type = 'token';
    },
  ],

  // Each row mutates one native map or quote boundary independently: native residency.
  [
    'native residency',
    (a) => {
      map(a)[0].avalanche.residency = 'wrapped';
    },
  ],

  // Each row mutates one native map or quote boundary independently: native decimals.
  [
    'native decimals',
    (a) => {
      map(a)[0].avalanche.decimals = 9;
    },
  ],

  // Each row mutates one native map or quote boundary independently: missing Ergo.
  [
    'missing Ergo',
    (a) => {
      delete map(a)[0].ergo;
    },
  ],

  // Each row mutates one native map or quote boundary independently: noncanonical Ergo ID.
  [
    'noncanonical Ergo ID',
    (a) => {
      map(a)[0].ergo.tokenId = wrapped.toUpperCase();
    },
  ],

  // Each row mutates one native map or quote boundary independently: zero Ergo ID.
  [
    'zero Ergo ID',
    (a) => {
      map(a)[0].ergo.tokenId = '00'.repeat(32);
    },
  ],

  // Each row mutates one native map or quote boundary independently: short Ergo ID.
  [
    'short Ergo ID',
    (a) => {
      map(a)[0].ergo.tokenId = 'ab';
    },
  ],

  // Each row mutates one native map or quote boundary independently: newline Ergo ID.
  [
    'newline Ergo ID',
    (a) => {
      map(a)[0].ergo.tokenId += '\n';
    },
  ],

  // Each row mutates one native map or quote boundary independently: Ergo decimals above18.
  [
    'Ergo decimals above18',
    (a) => {
      map(a)[0].ergo.decimals = 19;
    },
  ],

  // Each row mutates one native map or quote boundary independently: unrelated selection.
  [
    'unrelated selection',
    (a) => {
      a.selectedTokenId = 'missing';
    },
  ],

  // Each row mutates one native map or quote boundary independently: empty selection.
  [
    'empty selection',
    (a) => {
      a.selectedTokenId = '';
    },
  ],

  // Each row mutates one native map or quote boundary independently: null map.
  [
    'null map',
    (a) => {
      a.tokenMap = null;
    },
  ],

  // Each row mutates one native map or quote boundary independently: null set.
  [
    'null set',
    (a) => {
      a.tokenMap = [null];
    },
  ],

  // Each row mutates one native map or quote boundary independently: sparse map.
  [
    'sparse map',
    (a) => {
      map(a).length = 2;
    },
  ],

  // Each row mutates one native map or quote boundary independently: null member.
  [
    'null member',
    (a) => {
      (map(a)[0] as Record<string, unknown>).other = null;
    },
  ],

  // Each row mutates one native map or quote boundary independently: unbridgeable AVAX collision.
  [
    'unbridgeable AVAX collision',
    (a) => {
      map(a).unshift({ other: { tokenId: 'avax', decimals: 18 } });
    },
  ],

  // Each row mutates one native map or quote boundary independently: unbridgeable Ergo collision.
  [
    'unbridgeable Ergo collision',
    (a) => {
      map(a).push({ other: { tokenId: wrapped, decimals: 9 } });
    },
  ],

  // Each row mutates one native map or quote boundary independently: zero calculated fee.
  [
    'zero calculated fee',
    (a) => {
      a.quote = {
        ...a.quote,
        baseFeePerGas: 0n,
        maxPriorityFeePerGas: 0n,
        maxFeePerGas: 0n,
      };
    },
  ],

  // Each row mutates one native map or quote boundary independently: wrong quote chain.
  [
    'wrong quote chain',
    (a) => {
      a.quote.chainId = 1n as 43113n;
    },
  ],

  // Each row mutates one native map or quote boundary independently: wrong quote cap.
  [
    'wrong quote cap',
    (a) => {
      a.quote.maxFeePerGas = 4n;
    },
  ],
];
/** One invalid mapped-asset identity or collision. */
export const mappedAssetMutations = [
  // One invalid mapped-asset identity or collision: missing AV.
  [
    'missing AV',
    (a: AvalancheChainFeeInput) => {
      delete map(a)[1].avalanche;
    },
  ],

  // One invalid mapped-asset identity or collision: missing Ergo.
  [
    'missing Ergo',
    (a: AvalancheChainFeeInput) => {
      delete map(a)[1].ergo;
    },
  ],

  // One invalid mapped-asset identity or collision: uppercase Ergo.
  [
    'uppercase Ergo',
    (a: AvalancheChainFeeInput) => {
      map(a)[1].ergo.tokenId = ergoToken.toUpperCase();
      a.selectedTokenId = token;
    },
  ],

  // One invalid mapped-asset identity or collision: zero Ergo.
  [
    'zero Ergo',
    (a: AvalancheChainFeeInput) => {
      map(a)[1].ergo.tokenId = '00'.repeat(32);
      a.selectedTokenId = token;
    },
  ],

  // One invalid mapped-asset identity or collision: empty AV ID.
  [
    'empty AV ID',
    (a: AvalancheChainFeeInput) => {
      map(a)[1].avalanche.tokenId = '';
    },
  ],

  // One invalid mapped-asset identity or collision: missing native.
  [
    'missing native',
    (a: AvalancheChainFeeInput) => {
      map(a).shift();
    },
  ],

  // One invalid mapped-asset identity or collision: native decimals.
  [
    'native decimals',
    (a: AvalancheChainFeeInput) => {
      map(a)[0].avalanche.decimals = 9;
    },
  ],

  // One invalid mapped-asset identity or collision: selected AV collision.
  [
    'selected AV collision',
    (a: AvalancheChainFeeInput) => {
      map(a).push({ other: { tokenId: token, decimals: 24 } });
    },
  ],

  // One invalid mapped-asset identity or collision: selected Ergo collision.
  [
    'selected Ergo collision',
    (a: AvalancheChainFeeInput) => {
      map(a).push({ other: { tokenId: ergoToken, decimals: 24 } });
    },
  ],

  // One invalid mapped-asset identity or collision: native counterpart collision.
  [
    'native counterpart collision',
    (a: AvalancheChainFeeInput) => {
      map(a).push({ other: { tokenId: wrapped, decimals: 9 } });
    },
  ],

  // One invalid mapped-asset identity or collision: selected third-member collision.
  [
    'selected third-member collision',
    (a: AvalancheChainFeeInput) => {
      map(a)[1].other = { tokenId: 'third', decimals: 1 };
      map(a).push({ other: { tokenId: 'third', decimals: 1 } });
    },
  ],
] as const;
