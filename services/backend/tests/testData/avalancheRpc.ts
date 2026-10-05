import { hex } from '../testUtils/avalancheRpc';

/** Unchanged synthetic finalized block identifier. */
export const hash = '0x' + 'a1'.repeat(32);
/** Maximum unsigned execution-layer integer. */
export const MAX_UINT256 = (1n << 256n) - 1n;
/** Unchanged synthetic RPC fee responses. */
export const responses: Record<string, unknown> = {
  eth_chainId: hex(43113n),
  eth_baseFee: '0x10',
  eth_maxPriorityFeePerGas: '0x1',
};
/** Each malformed quantity is paired with each RPC method independently. */
export const malformed = [
  // Each malformed quantity is paired with each RPC method independently: undefined.
  undefined,

  // Each malformed quantity is paired with each RPC method independently: null.
  null,

  // Each malformed quantity is paired with each RPC method independently: 1.
  1,

  // Each malformed quantity is paired with each RPC method independently: 1n.
  1n,

  // Each malformed quantity is paired with each RPC method independently: {}.
  {},

  // Each malformed quantity is paired with each RPC method independently: ''.
  '',

  // Each malformed quantity is paired with each RPC method independently: '0x'.
  '0x',

  // Each malformed quantity is paired with each RPC method independently: '0x00'.
  '0x00',

  // Each malformed quantity is paired with each RPC method independently: '0x01'.
  '0x01',

  // Each malformed quantity is paired with each RPC method independently: '0X1'.
  '0X1',

  // Each malformed quantity is paired with each RPC method independently: '0xA'.
  '0xA',

  // Each malformed quantity is paired with each RPC method independently: '-0x1'.
  '-0x1',

  // Each malformed quantity is paired with each RPC method independently: '0x1 '.
  '0x1 ',

  // Each malformed quantity is paired with each RPC method independently: hex(MAX_UINT256 + 1n).
  hex(MAX_UINT256 + 1n),
];
/** Explicit finalized-query chain. */
export const finalizedChains = [
  // Explicit finalized-query chain: 43113n.
  43113n,

  // Explicit finalized-query chain: 43114n.
  43114n,
] as const;
/** Missing or malformed finalized block object. */
export const invalidFinalizedBlocks = [
  // Missing or malformed finalized block object: undefined.
  undefined,

  // Missing or malformed finalized block object: null.
  null,

  // Missing or malformed finalized block object: [].
  [],

  // Missing or malformed finalized block object: 123.
  123,

  // Missing or malformed finalized block object: '0x123'.
  '0x123',
];
/** Noncanonical finalized block number. */
export const invalidFinalizedNumbers = [
  // Noncanonical finalized block number: undefined.
  undefined,

  // Noncanonical finalized block number: null.
  null,

  // Noncanonical finalized block number: 0.
  0,

  // Noncanonical finalized block number: 1n.
  1n,

  // Noncanonical finalized block number: ''.
  '',

  // Noncanonical finalized block number: '0x'.
  '0x',

  // Noncanonical finalized block number: '0x00'.
  '0x00',

  // Noncanonical finalized block number: '0x01'.
  '0x01',

  // Noncanonical finalized block number: '0X1'.
  '0X1',

  // Noncanonical finalized block number: '0xA'.
  '0xA',

  // Noncanonical finalized block number: '-0x1'.
  '-0x1',

  // Noncanonical finalized block number: '0x1 '.
  '0x1 ',

  // Noncanonical finalized block number: hex(MAX_UINT256 + 1n).
  hex(MAX_UINT256 + 1n),
];
/** Missing or malformed finalized block hash. */
export const invalidFinalizedHashes = [
  // Missing or malformed finalized block hash: undefined.
  undefined,

  // Missing or malformed finalized block hash: null.
  null,

  // Missing or malformed finalized block hash: 1.
  1,

  // Missing or malformed finalized block hash: ''.
  '',

  // Missing or malformed finalized block hash: '0x'.
  '0x',

  // Missing or malformed finalized block hash: '0x' + '0'.repeat(64).
  '0x' + '0'.repeat(64),

  // Missing or malformed finalized block hash: '0x' + 'a1'.repeat(31).
  '0x' + 'a1'.repeat(31),

  // Missing or malformed finalized block hash: '0x' + 'a1'.repeat(33).
  '0x' + 'a1'.repeat(33),

  // Missing or malformed finalized block hash: hash.toUpperCase().
  hash.toUpperCase(),

  // Missing or malformed finalized block hash: hash + ' '.
  hash + ' ',
];
/** Exactly representable finalized height. */
export const exactFinalizedHeights = [
  // Exactly representable finalized height: 0n.
  0n,

  // Exactly representable finalized height: BigInt(Number.MAX_SAFE_INTEGER).
  BigInt(Number.MAX_SAFE_INTEGER),
];
/** Failing finalized-query RPC method. */
export const finalizedFailureMethods = [
  // Failing finalized-query RPC method: 'eth_chainId'.
  'eth_chainId',

  // Failing finalized-query RPC method: 'eth_getBlockByNumber'.
  'eth_getBlockByNumber',
];
/** Explicit fee-query chain. */
export const quotedChains = [
  // Explicit fee-query chain: 43113n.
  43113n,

  // Explicit fee-query chain: 43114n.
  43114n,
] as const;
/** Unsupported or wrongly typed constructor chain. */
export const invalidConstructorChains = [
  // Unsupported or wrongly typed constructor chain: 1n.
  1n,

  // Unsupported or wrongly typed constructor chain: 0n.
  0n,

  // Unsupported or wrongly typed constructor chain: 43112n.
  43112n,

  // Unsupported or wrongly typed constructor chain: 43113.
  43113,

  // Unsupported or wrongly typed constructor chain: '43113'.
  '43113',
];
/** Failing fee-query RPC method. */
export const feeFailureMethods = Object.keys(responses);
/** Dynamic-fee components whose cap exceeds uint256. */
export const overflowingCaps = [
  // Dynamic-fee components whose cap exceeds uint256: { eth_baseFee: hex(MAX_UINT256 / 2n + 1n), eth_maxPriorityFeePerGas: '0x0', }.
  {
    eth_baseFee: hex(MAX_UINT256 / 2n + 1n),
    eth_maxPriorityFeePerGas: '0x0',
  },

  // Dynamic-fee components whose cap exceeds uint256: { eth_baseFee: hex(MAX_UINT256 / 2n), eth_maxPriorityFeePerGas: '0x2' }.
  { eth_baseFee: hex(MAX_UINT256 / 2n), eth_maxPriorityFeePerGas: '0x2' },
];
