/** Parameter variants for reviews canonical V1 and V2 transactions on chain %s. */
export const reviewCases0 = [43113, 43114] as const;

/** Parameter variants for missing or invalid contract address %j is unavailable. */
export const reviewCases2 = [undefined, '', 'not-an-address', ' address '];

/** Parameter variants for missing or invalid NFT %j is unavailable. */
export const reviewCases3 = [
  undefined,
  '',
  '0'.repeat(64),
  'AB'.repeat(32),
  '12'.repeat(31),
];

/** Parameter variants for a valid but wrong configured %s cannot approve the transaction. */
export const reviewCases5 = ['address', 'NFT', 'chain'] as const;
