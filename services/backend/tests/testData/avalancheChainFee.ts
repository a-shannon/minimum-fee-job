/** Maximum positive Sigma Long fee. */
export const LONG = (1n << 63n) - 1n;
/** Maximum positive Sigma Int activation height. */
export const HEIGHT = 2147483647;
/** Unchanged wrapped native AVAX identifier. */
export const wrapped = 'ab'.repeat(32);
/** Unchanged mapped execution-layer fee token address. */
export const token = '0x' + 'cd'.repeat(20);
/** Unchanged Ergo-side identifier for the mapped fee token. */
export const ergoToken = 'ef'.repeat(32);
/** Exact AVAX price, token price, decimals, wei and expected ceiling. */
export const exactPriceConversions = [
  // Exact AVAX price, token price, decimals, wei and expected ceiling: 1.
  ['1', '1', 18, 9007199254740993n, 9007199254740993n],

  // Exact AVAX price, token price, decimals, wei and expected ceiling: 12.50.
  ['12.50', '2.5', 9, 3000000000000000000n, 15000000000n],

  // Exact AVAX price, token price, decimals, wei and expected ceiling: 1.
  ['1', '3', 18, 1n, 1n],

  // Exact AVAX price, token price, decimals, wei and expected ceiling: 1.
  ['1', '3', 18, 4n, 2n],

  // Exact AVAX price, token price, decimals, wei and expected ceiling: 1e-2.
  ['1e-2', '1E+1', 18, 1001n, 2n],

  // Exact AVAX price, token price, decimals, wei and expected ceiling: 0.000000000000000001.
  ['0.000000000000000001', '1', 0, 1n, 1n],

  // Exact AVAX price, token price, decimals, wei and expected ceiling: 1e256.
  ['1e256', '1e256', 18, 1n, 1n],

  // Exact AVAX price, token price, decimals, wei and expected ceiling: 1e-256.
  ['1e-256', '1e-256', 18, 1n, 1n],
] as const;
/** Noncanonical, nonpositive or overlong decimal price. */
export const invalidDecimalPrices = [
  // Noncanonical, nonpositive or overlong decimal price: ''.
  '',

  // Noncanonical, nonpositive or overlong decimal price: '0'.
  '0',

  // Noncanonical, nonpositive or overlong decimal price: '0.000e2'.
  '0.000e2',

  // Noncanonical, nonpositive or overlong decimal price: '-1'.
  '-1',

  // Noncanonical, nonpositive or overlong decimal price: '+1'.
  '+1',

  // Noncanonical, nonpositive or overlong decimal price: ' 1'.
  ' 1',

  // Noncanonical, nonpositive or overlong decimal price: '1 '.
  '1 ',

  // Noncanonical, nonpositive or overlong decimal price: '1\n'.
  '1\n',

  // Noncanonical, nonpositive or overlong decimal price: '1\r'.
  '1\r',

  // Noncanonical, nonpositive or overlong decimal price: '1\r\n'.
  '1\r\n',

  // Noncanonical, nonpositive or overlong decimal price: '01'.
  '01',

  // Noncanonical, nonpositive or overlong decimal price: '.5'.
  '.5',

  // Noncanonical, nonpositive or overlong decimal price: '1.'.
  '1.',

  // Noncanonical, nonpositive or overlong decimal price: 'NaN'.
  'NaN',

  // Noncanonical, nonpositive or overlong decimal price: 'Infinity'.
  'Infinity',

  // Noncanonical, nonpositive or overlong decimal price: '1/3'.
  '1/3',

  // Noncanonical, nonpositive or overlong decimal price: '1e257'.
  '1e257',

  // Noncanonical, nonpositive or overlong decimal price: '1e-257'.
  '1e-257',

  // Noncanonical, nonpositive or overlong decimal price: '1e1000'.
  '1e1000',

  // Noncanonical, nonpositive or overlong decimal price: '1'.repeat(257).
  '1'.repeat(257),

  // Noncanonical, nonpositive or overlong decimal price: undefined.
  undefined,

  // Noncanonical, nonpositive or overlong decimal price: 1.
  1,
];
/** Nonpositive, out-of-range or wrongly typed wei amount. */
export const invalidWeiAmounts = [
  // Nonpositive, out-of-range or wrongly typed wei amount: 0n.
  0n,

  // Nonpositive, out-of-range or wrongly typed wei amount: -1n.
  -1n,

  // Nonpositive, out-of-range or wrongly typed wei amount: 1n << 256n.
  1n << 256n,

  // Nonpositive, out-of-range or wrongly typed wei amount: 1.
  1,

  // Nonpositive, out-of-range or wrongly typed wei amount: '1'.
  '1',

  // Nonpositive, out-of-range or wrongly typed wei amount: undefined.
  undefined,
];
/** Invalid significant-decimal count. */
export const invalidSignificantDecimals = [
  // Invalid significant-decimal count: -1.
  -1,

  // Invalid significant-decimal count: 1.5.
  1.5,

  // Invalid significant-decimal count: NaN.
  NaN,

  // Invalid significant-decimal count: Infinity.
  Infinity,

  // Invalid significant-decimal count: Number.MAX_SAFE_INTEGER + 1.
  Number.MAX_SAFE_INTEGER + 1,

  // Invalid significant-decimal count: '9'.
  '9',

  // Invalid significant-decimal count: undefined.
  undefined,
];
/** Explicit chain shared by policy and quote. */
export const configuredQuoteChains = [
  // Explicit chain shared by policy and quote: 43113n.
  43113n,

  // Explicit chain shared by policy and quote: 43114n.
  43114n,
] as const;
/** Unsupported or wrongly typed expected quote chain. */
export const invalidExpectedChains = [
  // Unsupported or wrongly typed expected quote chain: 1n.
  1n,

  // Unsupported or wrongly typed expected quote chain: 43113.
  43113,

  // Unsupported or wrongly typed expected quote chain: '43113'.
  '43113',

  // Unsupported or wrongly typed expected quote chain: undefined.
  undefined,
];
/** Third-member decimals limiting the native significant scale. */
export const nativeSetDecimals = [
  // Third-member decimals limiting the native significant scale: 0.
  0,

  // Third-member decimals limiting the native significant scale: 6.
  6,

  // Third-member decimals limiting the native significant scale: 24.
  24,
];
/** Unique native asset selection alias. */
export const nativeAssetAliases = [
  // Unique native asset selection alias: 'avax'.
  'avax',

  // Unique native asset selection alias: wrapped.
  wrapped,
];
/** Invalid token-set member decimals. */
export const invalidMemberDecimals = [
  // Invalid token-set member decimals: -1.
  -1,

  // Invalid token-set member decimals: NaN.
  NaN,

  // Invalid token-set member decimals: Infinity.
  Infinity,

  // Invalid token-set member decimals: 1.5.
  1.5,

  // Invalid token-set member decimals: Number.MAX_SAFE_INTEGER + 1.
  Number.MAX_SAFE_INTEGER + 1,

  // Invalid token-set member decimals: '9'.
  '9',

  // Invalid token-set member decimals: undefined.
  undefined,
];
/** Invalid height or activation-delay integer. */
export const invalidActivationIntegers = [
  // Invalid height or activation-delay integer: -1.
  -1,

  // Invalid height or activation-delay integer: NaN.
  NaN,

  // Invalid height or activation-delay integer: Infinity.
  Infinity,

  // Invalid height or activation-delay integer: 0.5.
  0.5,

  // Invalid height or activation-delay integer: HEIGHT + 1.
  HEIGHT + 1,

  // Invalid height or activation-delay integer: '1'.
  '1',

  // Invalid height or activation-delay integer: undefined.
  undefined,
];
/** Invalid common Sigma Long fee field. */
export const invalidCommonFees = [
  // Invalid common Sigma Long fee field: -1n.
  -1n,

  // Invalid common Sigma Long fee field: LONG + 1n.
  LONG + 1n,

  // Invalid common Sigma Long fee field: 1.
  1,

  // Invalid common Sigma Long fee field: '1'.
  '1',

  // Invalid common Sigma Long fee field: undefined.
  undefined,
];
/** Ratio field that must be strictly positive. */
export const positiveRatioFields = [
  // Ratio field that must be strictly positive: 'rsnRatio'.
  'rsnRatio',

  // Ratio field that must be strictly positive: 'rsnRatioDivisor'.
  'rsnRatioDivisor',
] as const;
/** Noncanonical or zero ERC-20 fee-asset address. */
export const invalidTokenAddresses = [
  // Noncanonical or zero ERC-20 fee-asset address: 'garbage'.
  'garbage',

  // Noncanonical or zero ERC-20 fee-asset address: '0x' + '00'.repeat(20).
  '0x' + '00'.repeat(20),

  // Noncanonical or zero ERC-20 fee-asset address: '0x' + 'CD'.repeat(20).
  '0x' + 'CD'.repeat(20),

  // Noncanonical or zero ERC-20 fee-asset address: '0x' + 'cd'.repeat(19).
  '0x' + 'cd'.repeat(19),

  // Noncanonical or zero ERC-20 fee-asset address: token + '\n'.
  token + '\n',
];
/** Unsupported mapped fee-asset type. */
export const invalidTokenTypes = [
  // Unsupported mapped fee-asset type: 'unknown'.
  'unknown',

  // Unsupported mapped fee-asset type: 'ERC20'.
  'ERC20',

  // Unsupported mapped fee-asset type: undefined.
  undefined,
];
/** Unique mapped fee-asset selection alias. */
export const mappedAssetAliases = [
  // Unique mapped fee-asset selection alias: token.
  token,

  // Unique mapped fee-asset selection alias: ergoToken.
  ergoToken,
];
/** Third-member decimals limiting the mapped significant scale. */
export const mappedSetDecimals = [
  // Third-member decimals limiting the mapped significant scale: 0.
  0,

  // Third-member decimals limiting the mapped significant scale: 6.
  6,

  // Third-member decimals limiting the mapped significant scale: 24.
  24,
];
/** Invalid selected token-set member decimals. */
export const invalidSelectedDecimals = [
  // Invalid selected token-set member decimals: -1.
  -1,

  // Invalid selected token-set member decimals: 1.5.
  1.5,

  // Invalid selected token-set member decimals: NaN.
  NaN,

  // Invalid selected token-set member decimals: Infinity.
  Infinity,

  // Invalid selected token-set member decimals: Number.MAX_SAFE_INTEGER + 1.
  Number.MAX_SAFE_INTEGER + 1,

  // Invalid selected token-set member decimals: '24'.
  '24',

  // Invalid selected token-set member decimals: undefined.
  undefined,
];
