/** Publication versions served through the same atomic SDK GET. */
export const versions = [1, 2];

/** Missing, malformed and mismatched contract configuration cases. */
export const contractFaults = ['missing', 'invalid', 'wrong'] as const;

/** Individual publication owners changed while the SDK request is pending. */
export const ownerChanges = [
  ['NEXT_PUBLIC_AVALANCHE_FEE_PUBLICATION_ENABLED', 'false'],
  ['NEXT_PUBLIC_AVALANCHE_CHAIN_ID', '43114'],
  ['KV_REST_API_URL', 'https://other.invalid'],
  ['KV_REST_API_TOKEN', 'other-synthetic-token'],
  ['MINIMUM_FEE_CONFIG_ADDRESS', 'bad'],
  ['MINIMUM_FEE_CONFIG_NFT', 'ff'.repeat(32)],
  ['AVALANCHE_FEE_REVIEW_AUTHORITY_FILE', '/other-reference.json'],
  ['AVALANCHE_FEE_REVIEW_AUTHORITY_SHA256', 'ff'.repeat(32)],
];

/** Invalid opt-in, chain and KV configuration values rejected before a request. */
export const invalidConfiguration: Array<[string, string | undefined]> = [
  ['NEXT_PUBLIC_AVALANCHE_FEE_PUBLICATION_ENABLED', undefined],
  ['NEXT_PUBLIC_AVALANCHE_FEE_PUBLICATION_ENABLED', 'false'],
  ['NEXT_PUBLIC_AVALANCHE_FEE_PUBLICATION_ENABLED', 'yes'],
  ['NEXT_PUBLIC_AVALANCHE_CHAIN_ID', undefined],
  ['NEXT_PUBLIC_AVALANCHE_CHAIN_ID', '1'],
  ['KV_REST_API_URL', undefined],
  ['KV_REST_API_URL', 'file:///invalid'],
  ['KV_REST_API_TOKEN', ''],
];

/** Supported Avalanche chain identifiers used for economic reference joins. */
export const chainIds = [43113, 43114] as const;

/** Individual missing or altered economic reference cases. */
export const referenceFaults = [
  'missing',
  'bad hash',
  'wrong publication',
  'divergent price',
] as const;

/** Reference mutations performed while the SDK request is pending. */
export const referenceRaces = ['replace bytes', 'remove file'] as const;
