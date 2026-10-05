import { createHash } from 'node:crypto';

import { native } from '../testData/avalanchePublicationFixture';

export { native } from '../testData/avalanchePublicationFixture';
/** Create a new synthetic publication body with native AVAX metadata and exact decimal price strings. */
export const body = () => ({
  schema: 'rosen-avalanche-fee-publication',
  version: 1,
  chain: 'avalanche',
  chainId: 43113,
  kind: 'empty',
  transaction: null as unknown,
  supportedTokens: [
    {
      tokenId: 'avax',
      ergoSideTokenId: native,
      name: 'AVAX',
      decimals: 9,
      fee: { delays: { ergo: 10 }, bridgeFeeUSD: 0.1, rsnRatioDivisor: 1000 },
    },
  ],
  rawTokenMap: [
    {
      avalanche: {
        tokenId: 'avax',
        decimals: 18,
        name: 'AVAX',
        type: 'native',
        residency: 'native',
        extra: { note: 'metadata', scale: 1, active: true },
      },
      ergo: {
        tokenId: native,
        decimals: 9,
        type: 'EIP-004',
        residency: 'wrapped',
      },
    },
  ],
  rsnTokenId: 'avax',
  legacyNumericPrices: [['avax', 2]],
  avalancheDecimalPrices: {
    avax: '9007199254740993.000000001',
    tokens: { avax: '9007199254740993.000000001' },
  },
});
// Independent equivalent of the backend's recursively sorted JSON contract.
/** Sort every object recursively so the independent fixture digest matches the publication canonical JSON contract. */
const ordered = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, child]) => [key, ordered(child)]),
    );
  return value;
};
/** Return a new fixture envelope with its SHA-256 publication identity derived from canonical body bytes. */
export const seal = <T extends object>(value: T) => ({
  ...value,
  publicationId: createHash('sha256')
    .update(JSON.stringify(ordered(value)))
    .digest('hex'),
});
/** Create and seal a fresh synthetic publication body for one test. */
export const fixture = () => seal(body());
