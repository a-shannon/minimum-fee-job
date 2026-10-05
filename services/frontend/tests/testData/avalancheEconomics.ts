/** Parameter variants for accepts actual canonical WASM output on %s. */
export const economicsCases0 = [43113, 43114] as const;

/** Parameter variants for rejects resealed canonical %s output after structural acceptance. */
export const economicsCases4 = ['networkFee', 'common'] as const;

/** Parameter variants for rejects independent prior mismatch: %s. */
export const economicsCases5 = [
  'null with input',
  'bytes substituted',
  'missing key',
  'extra key',
];

/** Parameter variants for rejects trusted quote arithmetic fault %s. */
export const economicsCases6 = [
  'baseFeePerGas',
  'maxPriorityFeePerGas',
  'maxFeePerGas',
] as const;

/** Parameter variants for rejects authority drift %s. */
export const economicsCases7 = [
  'gasBudget',
  'numerator',
  'denominator',
  'activationDelay',
  'guarantee',
  'frontier',
  'hash',
  'common',
  'price',
  'map',
  'selected',
];

/** Parameter variants for refuses unsupported certification %s. */
export const economicsCases10 = ['V1', 'empty', 'no AV update'];

/** Parameter variants for rejects arithmetic bound %s. */
export const economicsCases13 = [
  'wei overflow',
  'fee overflow',
  'activation overflow',
  'margin below one',
];

/** Parameter variants for accepts bounded activation delay %s. */
export const economicsCases14 = [0, 2147483547];

/** Parameter variants for uses exact passed-height boundary for %s. */
export const economicsCases15 = ['avalanche', 'ergo'];

/** Parameter variants for rejects history fault %s. */
export const economicsCases18 = [
  'unknown candidate chain',
  'unknown input chain',
  'extra output history',
  'changed old networkFee',
];

/** Parameter variants for rejects paired candidate common tampering %s. */
export const economicsCases19 = [
  'bridgeFee',
  'rsnRatio',
  'rsnRatioDivisor',
  'feeRatio',
] as const;

/** Parameter variants for cannot mask Avalanche output through %s metadata. */
export const economicsCases20 = ['asset', 'update', 'output alias'];

/** Parameter variants for rejects independently admitted but invalid token mapping %s. */
export const economicsCases23 = [
  'native decimals',
  'native type',
  'native residency',
  'native Ergo decimals',
  'alias collision',
];

/** Parameter variants for rejects isolated trusted contract fault %s. */
export const economicsCases24 = [
  'zero ratio',
  'zero divisor',
  'Long overflow',
  'negative fee',
  'common unknown',
  'price missing',
  'price extra',
  'guarantee zero',
  'frontier zero',
  'duplicate selected',
  'duplicate chains',
  'chain mismatch',
  'frontier height',
  'combined byte cap',
];

/** Parameter variants for rejects malformed gas %s. */
export const economicsCases27 = [
  '0',
  '-1',
  '01',
  '1.0',
  '1e0',
  ' ' + '1',
  (1n << 256n).toString(),
];

/** Parameter variants for rejects malformed exact price %s. */
export const economicsCases28 = [
  '0',
  '-1',
  'NaN',
  'Infinity',
  '1e257',
  '1e-257',
  '01',
  '2\n',
];

/** Parameter variants for rejects malformed trusted capture %s without invoking accessors. */
export const economicsCases29 = [
  'getter',
  'symbol',
  'hidden',
  'sparse',
  'inherited',
  'oversize',
  'unknown',
  'deep',
];
