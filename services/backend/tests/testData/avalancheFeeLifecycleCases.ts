/** Ordered scenario data: Run Fuji and mainnet synthetic policies through real JSON configuration, SQLite migration, TokenHandler and fee construction; inspect stored prices, one KV envelope and independent structure/economic reports. */
export const lifecycleCases1 = [
  // Explicit Fuji policy; no live endpoint.
  43113,
  // Explicit mainnet identity with synthetic observations.
  43114,
] as const;
/** Ordered scenario data: Run the actual service with disabled, absent or malformed disabled optional Avalanche fields; inspect legacy KV keys, absent Avalanche RPC and SQLite prices. */
export const lifecycleCases2 = [
  // Avalanche is explicitly disabled.
  'disabled',
  // Avalanche configuration is absent.
  'absent',
  // Disabled optional fields are malformed but remain unread.
  'disabled malformed optional fields',
];
/** Ordered scenario data: Change only the table-selected chain, enabled flag, gas budget or pruning guarantee before importing the entrypoint; inspect initialization and every observation/publication side effect. */
export const lifecycleCases3 = [
  // Only chain identity is invalid.
  ['chain', 'Invalid Avalanche chain ID', { chainId: 1 }],

  // Only the enabled flag has the wrong type.
  ['enabled flag', 'Invalid Avalanche enabled flag', { enabled: 'true' }],

  // Only gas budget is zero.
  ['gas policy', 'Invalid Avalanche gas budget', { gasBudget: '0' }],

  // Only Avalanche fee pruning guarantee is zero.
  [
    'Avalanche history policy',
    'Invalid Avalanche fee guarantee blocks',
    { feeGuaranteeBlocks: 0 },
  ],

  // The callback changes only the legacy Ergo pruning guarantee.
  ['legacy history policy', 'Invalid Avalanche pruning guarantee', {}],
] as const;
/** Ordered scenario data: Run unsupported raw-map or disabled-history fixtures through actual initialization; await the caught job failure and inspect scheduling, notification, legacy observations and persisted prices. */
export const lifecycleCases4 = [
  // An unsupported map member survives actual initialization.
  ['unsupported map', 'but they are not supported'],

  // Existing Avalanche history conflicts with disabled policy.
  [
    'history disabled',
    'Stored Avalanche fee history requires enabled Avalanche policy',
  ],
] as const;
