/** Supported configuration chain. */
export const supportedChains = [
  // Supported configuration chain: 43113.
  43113,

  // Supported configuration chain: 43114.
  43114,
];
/** Malformed configuration section. */
export const malformedSections = [
  // Malformed configuration section: null.
  null,

  // Malformed configuration section: [].
  [],

  // Malformed configuration section: true.
  true,

  // Malformed configuration section: 'true'.
  'true',

  // Malformed configuration section: {}.
  {},
];
/** Non-boolean enabled flag. */
export const invalidEnabledFlags = [
  // Non-boolean enabled flag: undefined.
  undefined,

  // Non-boolean enabled flag: 0.
  0,

  // Non-boolean enabled flag: 1.
  1,

  // Non-boolean enabled flag: 'true'.
  'true',

  // Non-boolean enabled flag: 'false'.
  'false',

  // Non-boolean enabled flag: null.
  null,
];
/** Unsupported or wrongly typed configuration chain. */
export const invalidConfiguredChains = [
  // Unsupported or wrongly typed configuration chain: undefined.
  undefined,

  // Unsupported or wrongly typed configuration chain: 1.
  1,

  // Unsupported or wrongly typed configuration chain: 43113n.
  43113n,

  // Unsupported or wrongly typed configuration chain: '43113'.
  '43113',

  // Unsupported or wrongly typed configuration chain: NaN.
  NaN,
];
/** Invalid HTTP RPC URL. */
export const invalidRpcUrls = [
  // Invalid HTTP RPC URL: undefined.
  undefined,

  // Invalid HTTP RPC URL: ''.
  '',

  // Invalid HTTP RPC URL: 'wss://rpc.invalid'.
  'wss://rpc.invalid',

  // Invalid HTTP RPC URL: 'file:///x'.
  'file:///x',

  // Invalid HTTP RPC URL: 'ftp://rpc.invalid'.
  'ftp://rpc.invalid',

  // Invalid HTTP RPC URL: 'https://rpc.invalid/#fragment'.
  'https://rpc.invalid/#fragment',

  // Invalid HTTP RPC URL: ' https://rpc.invalid'.
  ' https://rpc.invalid',

  // Invalid HTTP RPC URL: 'garbage'.
  'garbage',

  // Invalid HTTP RPC URL: 1.
  1,
];
/** Out-of-range or wrongly typed configured integer. */
export const invalidIntegers = [
  // Out-of-range or wrongly typed configured integer: undefined.
  undefined,

  // Out-of-range or wrongly typed configured integer: -1.
  -1,

  // Out-of-range or wrongly typed configured integer: 1.5.
  1.5,

  // Out-of-range or wrongly typed configured integer: NaN.
  NaN,

  // Out-of-range or wrongly typed configured integer: Infinity.
  Infinity,

  // Out-of-range or wrongly typed configured integer: 2147483648.
  2147483648,

  // Out-of-range or wrongly typed configured integer: '100'.
  '100',

  // Out-of-range or wrongly typed configured integer: 1n.
  1n,
];
/** Noncanonical or out-of-range configured positive amount. */
export const invalidAmounts = [
  // Noncanonical or out-of-range configured positive amount: undefined.
  undefined,

  // Noncanonical or out-of-range configured positive amount: 0.
  0,

  // Noncanonical or out-of-range configured positive amount: 1n.
  1n,

  // Noncanonical or out-of-range configured positive amount: '0'.
  '0',

  // Noncanonical or out-of-range configured positive amount: '-1'.
  '-1',

  // Noncanonical or out-of-range configured positive amount: '01'.
  '01',

  // Noncanonical or out-of-range configured positive amount: '1.0'.
  '1.0',

  // Noncanonical or out-of-range configured positive amount: '1e3'.
  '1e3',

  // Noncanonical or out-of-range configured positive amount: '1\n'.
  '1\n',

  // Noncanonical or out-of-range configured positive amount: (1n << 256n).toString().
  (1n << 256n).toString(),
];
/** Missing or malformed explicit margin. */
export const invalidMargins = [
  // Missing or malformed explicit margin: undefined.
  undefined,

  // Missing or malformed explicit margin: null.
  null,

  // Missing or malformed explicit margin: [].
  [],

  // Missing or malformed explicit margin: {}.
  {},
];
