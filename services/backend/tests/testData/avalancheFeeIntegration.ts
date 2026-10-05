/** Synthetic wrapped AVAX identifier on Ergo. */
export const native = 'ab'.repeat(32);
/** Synthetic wrapped fungible asset identifier on Ergo. */
export const asset = 'cd'.repeat(32);
/** Synthetic native fungible asset contract on Avalanche. */
export const address = '0x' + 'ef'.repeat(20);
/** Synthetic minimum-fee NFT identifier. */
export const nft = '12'.repeat(32);
/** Parameter scenarios for beginAvalancheFeeGeneration. */
export const integrationCases2 = [
  // A getter must be rejected without executing it.
  'accessor',
  // A function-valued source field is not capturable data.
  'function',
  // A symbol-valued source field is not capturable data.
  'symbol',
  // A Date instance must not be accepted as a plain source object.
  'class',
  // A self-reference must fail finite snapshot capture.
  'cycle',
  // A nested source object exceeds the capture depth limit.
  'depth',
  // One source array exceeds the per-array element limit.
  'array length',
  // Two individually sized arrays exceed the aggregate capture bound.
  'nodes',
];
/** Parameter scenarios for consumeAvalancheUpdatedConfigs. */
export const integrationCases3 = [
  // No prior box and a legacy new config remain valid while disabled.
  'absent',
  // A new Avalanche config requires a construction binding while disabled.
  'new avalanche',
  // Retained prior Avalanche history requires a construction binding.
  'prior avalanche',
  // Malformed prior config evidence propagates its failure.
  'malformed prior',
];
/** Parameter scenarios for finishAvalancheFeeGeneration. */
export const integrationCases5 = [
  // Remove only the fungible asset price from tokenPrices.
  'missing price',
  // Substitute a numeric fungible asset price for its exact string.
  'number price',
  // Remove only the native AVAX gas price.
  'missing gas price',
  // Set feeGuaranteeBlocks to the invalid zero bound.
  'bad guarantee',
  // Substitute exponent notation for the exact trigger string.
  'bad trigger',
  // Change only the supported asset decimals away from its raw map.
  'wrong source decimals',
  // Substitute the native wrapped ID for the asset Ergo counterpart.
  'wrong Ergo identity',
  // Add a supported-token identifier alias colliding with the native wrapped ID.
  'alias',
];
/** Parameter scenarios for consumeAvalancheFeeGeneration. */
export const integrationCases6 = [
  // Replace the native candidate with an equal-value detached instance.
  'replacement',
  // Mutate only the native candidate Ergo bridgeFee.
  'fee',
  // Change only the captured Avalanche frontier height.
  'height',
  // Pass an equal-value detached frontier Map.
  'frontier map',
  // Disable the captured enabled Avalanche policy.
  'policy',
  // Mutate only the supported native token name.
  'source',
  // Append an unbound candidate row to the captured batch.
  'extra row',
];
/** Parameter scenarios for updateAndGenerateFeeConfig. */
export const integrationCases13 = [
  // During box fetch, mutate only the candidate Ergo bridgeFee.
  'candidate',
  // During box fetch, disable only the captured Avalanche policy.
  'policy',
  // During box fetch, change only the Avalanche finalized frontier.
  'frontier',
  // During box fetch, mutate only supported-token decimals.
  'token source',
];
/** Parameter scenarios for updateAndGenerateFeeConfig. */
export const integrationCases18 = [
  // Seed equal AVAX network fees so the strict threshold is not exceeded.
  false,
  // Seed the lower AVAX network fee so the strict threshold is exceeded.
  true,
];
