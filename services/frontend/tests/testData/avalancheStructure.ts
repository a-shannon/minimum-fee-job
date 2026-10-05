/** Parameter variants for rejects invalid explicit contract %s. */
export const structureCases3 = [
  'NFT',
  'address',
  'chain',
  'missing NFT',
  'zero NFT',
];

/** Parameter variants for rejects %s with recomputed envelope digest. */
export const structureCases4 = [
  'count',
  'reversed',
  'bytes',
  'trailing box',
  'trailing reduced',
  'sender',
  'signed',
];

/** Parameter variants for rejects duplicate fee target in %s. */
export const structureCases6 = ['output', 'input'];

/** Parameter variants for rejects malformed fee output %s. */
export const structureCases8 = [
  'NFT',
  'NFT amount',
  'target',
  'target amount',
  'extra token',
  'token order',
  'missing NFT',
];

/** Parameter variants for rejects wrong Sigma type in %s. */
export const structureCases9 = ['R4', 'R5', 'R6', 'R7', 'R8', 'R9'];

/** Parameter variants for rejects missing R9 from %s fee box. */
export const structureCases10 = ['output', 'input'];

/** Parameter variants for rejects lossy or invalid registers: %s. */
export const structureCases11 = [
  'duplicate chains',
  'invalid chain',
  'extra column',
  'extra row',
  'sentinel',
  'negative fee',
  'zero divisor',
  'negative height',
];

/** Parameter variants for rejects an isolated negative Long %s. */
export const structureCases13 = [
  'bridgeFee',
  'networkFee',
  'rsnRatio',
  'rsnRatioDivisor',
  'feeRatio',
];
/** Synthetic fee marker NFT used by real WASM boxes. */
export const nft = '12'.repeat(32);
