/** Unchanged settled frontier and dynamic-fee RPC replies. */
export const values: Record<string, unknown> = {
  eth_chainId: '0xa869',
  eth_getBlockByNumber: { number: '0x64', hash: '0x' + 'ab'.repeat(32) },
  eth_baseFee: '0x10',
  eth_maxPriorityFeePerGas: '0x1',
};
/** One failed collection reply before applying the sink. */
export const failedCollectionReplies = [
  // One failed collection reply before applying the sink: chain.
  ['chain', { eth_chainId: '0xa86a' }],

  // One failed collection reply before applying the sink: missing finalized.
  ['missing finalized', { eth_getBlockByNumber: null }],

  // One failed collection reply before applying the sink: bad hash.
  [
    'bad hash',
    {
      eth_getBlockByNumber: { number: '0x64', hash: '0x' + '00'.repeat(32) },
    },
  ],

  // One failed collection reply before applying the sink: noncanonical height.
  [
    'noncanonical height',
    {
      eth_getBlockByNumber: { number: '0x064', hash: '0x' + 'ab'.repeat(32) },
    },
  ],

  // One failed collection reply before applying the sink: unsafe activation.
  [
    'unsafe activation',
    {
      eth_getBlockByNumber: {
        number: '0x7fffffff',
        hash: '0x' + 'ab'.repeat(32),
      },
    },
  ],

  // One failed collection reply before applying the sink: bad quote.
  ['bad quote', { eth_baseFee: '0x01' }],

  // One failed collection reply before applying the sink: zero quote.
  ['zero quote', { eth_baseFee: '0x0', eth_maxPriorityFeePerGas: '0x0' }],
] as const;
