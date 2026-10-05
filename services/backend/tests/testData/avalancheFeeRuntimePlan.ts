/** Synthetic wrapped AVAX identifier. */
export const nativeErgo = 'ab'.repeat(32);
/** Synthetic wrapped ERC20 identifier. */
export const tokenErgo = 'cd'.repeat(32);
/** Synthetic Avalanche fungible-asset contract. */
export const token = '0x' + 'ef'.repeat(20);
/** Valid Fuji identity, finalized block and guard fee quote replies. */
export const values: Record<string, unknown> = {
  eth_chainId: '0xa869',
  eth_getBlockByNumber: { number: '0x64', hash: '0x' + '12'.repeat(32) },
  eth_baseFee: '0x10',
  eth_maxPriorityFeePerGas: '0x1',
};
/** Change only the documented native or asset decimal price to Number, invoke collectPlan, inspect rejection and zero RPC calls, then dispose. */
export const planCases1 = [
  // Replace only the last asset tokenPrice string with a Number.
  'tokenPrice',
  // Replace only the shared avaxPrice string with a Number.
  'avaxPrice',
];
/** Change only the last asset price, selected token, Ergo decimals or rsnRatio named by the table; invoke collectPlan, inspect rejection before RPC, then dispose. */
export const planCases2 = [
  // Remove only the last asset tokenPrice.
  'missing price',
  // Replace only the last asset selectedTokenId with an unknown identifier.
  'invalid token',
  // Change only the last asset Ergo decimals to a negative value.
  'invalid decimals',
  // Change only the last asset common.rsnRatio to zero.
  'invalid common',
];
/** Replace the asset array with two native rows using the documented Avalanche or Ergo alias, invoke collectPlan and inspect duplicate-target rejection before RPC. */
export const planCases3 = [
  // Duplicate the native target through its Avalanche identifier.
  'avax',
  // Duplicate the same native target through its wrapped Ergo identifier.
  nativeErgo,
];
/** Replace only the assets array with the documented empty, sparse, missing or null form, invoke collectPlan and inspect rejection before RPC. */
export const planCases4 = [
  // Empty asset arrays cannot produce a fee plan.
  [],
  // A sparse array cannot supply the required asset row.
  new Array(1),
  // Missing assets cannot become an implicit empty plan.
  undefined,
  // Null assets cannot become an implicit empty plan.
  null,
];
/** Complete one batch, clear RPC calls, substitute only a lower finalized height or conflicting same-height hash, then attempt another batch and inspect rejection after the two identity/block reads. */
export const planCases8 = [
  // Lower only the finalized height after a successful batch.
  'regression',
  // Change only the block hash at the same finalized height.
  'conflict',
];
