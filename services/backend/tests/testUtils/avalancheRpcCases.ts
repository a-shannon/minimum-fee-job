import { responses, malformed } from '../testData/avalancheRpc';

/** Independently paired RPC method and malformed quantity. */
export const malformedMethodReplies = Object.keys(responses).flatMap((method) =>
  malformed.map((value) => [method, value] as const),
);
