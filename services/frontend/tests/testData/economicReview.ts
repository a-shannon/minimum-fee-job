/** Literal parameter tables for inspectEconomicReview scenarios. */
/** Parameter variants for compares actual V2 WASM on chain %s against a separately captured snapshot. */
export const economicReviewCases0 = [43113, 43114] as const;

/** Parameter variants for structure passes while independent snapshot %s disagreement is rejected. */
export const economicReviewCases1 = [
  'price',
  'common',
  'prior',
  'quote',
  'frontier',
] as const;

/** Parameter variants for rejects a resealed real WASM %s tamper after structure succeeds. */
export const economicReviewCases2 = ['network fee', 'paired common'] as const;

/** Parameter variants for rejects independently captured snapshot %s mismatch. */
export const economicReviewCases3 = [
  'publicationId',
  'chain',
  'address',
  'nft',
] as const;

/** Parameter variants for rejects structural report %s mismatch. */
export const economicReviewCases4 = [
  'publicationId',
  'chain',
  'transactionId',
  'scope',
] as const;

/** Parameter variants for does not infer authority from publication for %s. */
export const economicReviewCases5 = [
  'not-configured',
  'invalid-snapshot',
] as const;

/** Parameter variants for does not treat %s as economic evidence. */
export const economicReviewCases6 = ['V1', 'empty'] as const;

/** Parameter variants for requires successful structure when %s. */
export const economicReviewCases7 = ['unavailable', 'rejected'] as const;
