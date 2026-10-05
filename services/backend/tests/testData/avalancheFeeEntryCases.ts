/** Ordered scenario data: Set transaction, empty, missing-KV or legacy dispatch mode in the documented business mocks; import the actual entrypoint and await its scheduled next run while inspecting construction, publication arguments and intercepted KV commands. */
export const publicationEntryCases1 = [
  // Construct and publish the supplied transaction.
  'transaction',

  // Publish the empty updated map without construction.
  'empty',

  // Publication observes missing KV and emits the asserted notification.
  'missing KV',

  // Legacy transaction writes the original separate store keys.
  'legacy transaction',

  // Legacy empty generation flushes the original store.
  'legacy empty',
];
