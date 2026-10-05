import { createHash } from 'node:crypto';

import { TransactionEIP19 } from '../transaction/types';
import { UpdatedFeeConfig } from '../types';
import { captureAvalanchePublication } from './avalancheFeeIntegration';
import { freezeAvalancheFeePlan } from './avalancheFeePlan';

export const AVALANCHE_PUBLICATION_KEY = 'avalanche-fee-publication-v1';

/** Encodes supported JSON values with sorted object keys for deterministic publication hashing. */
const json = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return '[' + value.map(json).join(',') + ']';
  if (typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map(
          (key) =>
            JSON.stringify(key) +
            ':' +
            json((value as Record<string, unknown>)[key]),
        )
        .join(',') +
      '}'
    );
  if (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return JSON.stringify(value);
  throw new Error('Unsupported Avalanche publication value');
};

let publishing = false;

/** Single-process admission serialization, not a final SDK transport hook. */
export const publishAvalancheFee = async (
  source: TransactionEIP19 | Map<string, UpdatedFeeConfig>,
  enqueue: (key: string, payload: string) => Promise<unknown>,
) => {
  if (publishing) throw new Error('Avalanche publication already in progress');
  publishing = true;
  try {
    const captured = captureAvalanchePublication(source);
    const body = {
      schema: 'rosen-avalanche-fee-publication',
      version: 2,
      ...captured.snapshot,
    };
    const envelope = freezeAvalancheFeePlan({
      ...body,
      publicationId: createHash('sha256').update(json(body)).digest('hex'),
    });
    const payload = json(envelope);
    // No await between this check and the synchronous enqueue invocation.
    captured.assertFresh();
    await enqueue(AVALANCHE_PUBLICATION_KEY, payload);
    // An accepted SET cannot be rolled back by a later local freshness check.
    return envelope;
  } finally {
    publishing = false;
  }
};
