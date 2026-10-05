/** Synthetic minimum-fee NFT identifier. */
export const nft = '12'.repeat(32);
/** Synthetic wrapped AVAX identifier. */
export const native = 'ab'.repeat(32);
/** Independent rejects %s before network reads scenarios. */
export const constructionCases2 = [
  // detach is isolated in this scenario.
  'detach',
  // replace is isolated in this scenario.
  'replace',
  // empty is isolated in this scenario.
  'empty',
  // new fees is isolated in this scenario.
  'new fees',
  // new value is isolated in this scenario.
  'new value',
  // new height is isolated in this scenario.
  'new height',
  // new token is isolated in this scenario.
  'new token',
  // current box is isolated in this scenario.
  'current box',
  // policy is isolated in this scenario.
  'policy',
  // token map is isolated in this scenario.
  'token map',
  // superseded is isolated in this scenario.
  'superseded',
];
/** Independent rejects delayed policy mutation at %s scenarios. */
export const constructionCases3 = [
  // address is isolated in this scenario.
  'address',
  // cover is isolated in this scenario.
  'cover',
  // height is isolated in this scenario.
  'height',
  // context is isolated in this scenario.
  'context',
];
/** Independent rejects delayed new fee mutation at %s scenarios. */
export const constructionCases4 = [
  // address is isolated in this scenario.
  'address',
  // cover is isolated in this scenario.
  'cover',
  // height is isolated in this scenario.
  'height',
  // context is isolated in this scenario.
  'context',
];
/** Independent rejects delayed old input mutation at %s scenarios. */
export const constructionCases5 = [
  // address is isolated in this scenario.
  'address',
  // cover is isolated in this scenario.
  'cover',
  // height is isolated in this scenario.
  'height',
  // context is isolated in this scenario.
  'context',
];
/** Independent rejects delayed %s authority at final context scenarios. */
export const constructionCases10 = [
  // superseded is isolated in this scenario.
  'superseded',
  // raw map is isolated in this scenario.
  'raw map',
];
