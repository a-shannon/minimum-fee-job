import { createHash } from 'node:crypto';

/** Computes the SHA-256 identity of the supplied synthetic snapshot bytes. */
export const hash = (bytes: string | Buffer) =>
  createHash('sha256').update(bytes).digest('hex');

/** Creates fresh minimal snapshot containers with the selected default Fuji identity. */
export const snapshot = () => ({
  schemaVersion: 1,
  chainId: 43113,
  publicationId: 'ab'.repeat(32),
  policy: {},
  observations: {},
});
