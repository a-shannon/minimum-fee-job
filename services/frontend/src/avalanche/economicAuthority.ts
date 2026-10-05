// Server-only local snapshot capture. A configured digest identifies bytes;
// it does not establish independent provenance or observation freshness.
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import process from 'node:process';

import type {
  TrustedAvalancheFeeObservations,
  TrustedAvalancheFeePolicy,
} from './economics';
import type { AvalancheChainId } from './publication';

export interface EconomicAuthoritySnapshot {
  readonly schemaVersion: 1;
  readonly chainId: AvalancheChainId;
  readonly publicationId: string;
  readonly policy: TrustedAvalancheFeePolicy;
  readonly observations: TrustedAvalancheFeeObservations;
}
export type CapturedEconomicAuthority =
  | Readonly<{
      status: 'available';
      authoritySha256: string;
      snapshot: EconomicAuthoritySnapshot;
      assertFresh: () => void;
    }>
  | Readonly<{
      status: 'unavailable';
      reason: 'not-configured' | 'invalid-snapshot';
      assertFresh: () => void;
    }>;

const MAX_BYTES = 8_000_000;
/** Computes the SHA-256 identity of captured snapshot bytes. */
const digest = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
/** Returns an immutable unavailable result without admitting snapshot data. */
const unavailable = (reason: 'not-configured' | 'invalid-snapshot') =>
  Object.freeze({
    status: 'unavailable' as const,
    reason,
    /** Leaves freshness checks inert when no snapshot has been admitted. */
    assertFresh: () => {},
  });
/** Requires bounded absolute path syntax without controls or UNC paths; on Windows, also refuses device or stream paths. */
const localPath = (value: unknown): string => {
  if (
    typeof value !== 'string' ||
    value.length > 4096 ||
    !isAbsolute(value) ||
    value.startsWith('//') ||
    value.startsWith('\\\\') ||
    Array.from(value).some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    (process.platform === 'win32' &&
      (!/^[A-Za-z]:[\\/]/.test(value) ||
        value.slice(2).includes(':') ||
        value
          .split(/[\\/]/)
          .slice(1)
          .some((part) =>
            /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(
              part.replace(/[. ]+$/, ''),
            ),
          )))
  )
    throw new Error('Invalid local snapshot path');
  return value;
};

// The descriptor remains the same across stat/read. Limit reads independently
// of stat size, so a growing file cannot turn this into an unbounded read.
/** Reads a regular file through one descriptor with an independent byte cap. */
const readBounded = (path: string): Buffer => {
  // O_NONBLOCK prevents opening a POSIX FIFO from waiting before isFile().
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_BYTES)
      throw new Error('Invalid snapshot file');
    const bytes = Buffer.alloc(MAX_BYTES + 1);
    let size = 0;
    while (size <= MAX_BYTES) {
      const count = readSync(
        fd,
        bytes,
        size,
        Math.min(65536, bytes.length - size),
        null,
      );
      if (!count) return bytes.subarray(0, size);
      size += count;
    }
    throw new Error('Snapshot exceeds byte limit');
  } finally {
    closeSync(fd);
  }
};

// JSON.parse keeps the last occurrence of a key. Check the original lexical
// object members so two parsers cannot disagree about the selected reference.
/** Rejects duplicate JSON object keys and excessive lexical container shape. */
const rejectDuplicateJsonKeys = (text: string): void => {
  type Frame =
    | {
        kind: 'object';
        state: 'key' | 'colon' | 'value' | 'end';
        keys: Set<string>;
      }
    | { kind: 'array'; state: 'value' | 'end'; count: number };
  type Token = { kind: string; start: number; end: number };
  const frames: Frame[] = [];
  const root = { state: 'value' as 'value' | 'done' };
  let position = 0;
  let nodes = 0;
  /** Recognizes the four whitespace characters permitted between JSON tokens. */
  const whitespace = (character: string) =>
    character === ' ' ||
    character === '\n' ||
    character === '\r' ||
    character === '\t';
  /** Advances the lexical cursor over a string, punctuation or scalar token. */
  const nextToken = (): Token | undefined => {
    while (position < text.length && whitespace(text[position])) position++;
    if (position === text.length) return undefined;
    const start = position;
    const first = text[position++];
    if (first === '"') {
      while (position < text.length) {
        const character = text[position++];
        if (character === '\\') position++;
        else if (character === '"') break;
      }
      return { kind: 'string', start, end: position };
    }
    if ('{}[]:,'.includes(first)) return { kind: first, start, end: position };
    while (
      position < text.length &&
      !whitespace(text[position]) &&
      !'{}[]:,'.includes(text[position])
    )
      position++;
    return { kind: 'scalar', start, end: position };
  };
  /** Consumes a value in its parent frame and enforces node and array limits. */
  const takeValue = (token: Token) => {
    const frame = frames.at(-1);
    if (!frame) {
      if (root.state !== 'value') throw new Error('Invalid snapshot JSON');
      root.state = 'done';
    } else if (frame.kind === 'object') {
      if (frame.state !== 'value') throw new Error('Invalid snapshot JSON');
      frame.state = 'end';
    } else {
      if (frame.state !== 'value') throw new Error('Invalid snapshot JSON');
      if (++frame.count > 4096) throw new Error('Snapshot exceeds array limit');
      frame.state = 'end';
    }
    if (++nodes > 200000 || frames.length > 20)
      throw new Error('Snapshot exceeds shape limit');
    if (token.kind === '{')
      frames.push({ kind: 'object', state: 'key', keys: new Set() });
    else if (token.kind === '[')
      frames.push({ kind: 'array', state: 'value', count: 0 });
    else if (token.kind !== 'string' && token.kind !== 'scalar')
      throw new Error('Invalid snapshot JSON');
  };
  for (let token = nextToken(); token; token = nextToken()) {
    const frame = frames.at(-1);
    if (!frame) {
      takeValue(token);
      continue;
    }
    if (frame.kind === 'object') {
      if (frame.state === 'key') {
        if (token.kind === '}') {
          frames.pop();
          continue;
        }
        if (token.kind !== 'string') throw new Error('Invalid snapshot JSON');
        const key: string = JSON.parse(text.slice(token.start, token.end));
        if (frame.keys.has(key)) throw new Error('Duplicate snapshot key');
        frame.keys.add(key);
        if (frame.keys.size > 4096)
          throw new Error('Snapshot exceeds object limit');
        frame.state = 'colon';
      } else if (frame.state === 'colon') {
        if (token.kind !== ':') throw new Error('Invalid snapshot JSON');
        frame.state = 'value';
      } else if (frame.state === 'value') {
        takeValue(token);
      } else if (token.kind === ',') {
        frame.state = 'key';
      } else if (token.kind === '}') {
        frames.pop();
      } else {
        throw new Error('Invalid snapshot JSON');
      }
    } else if (frame.state === 'value') {
      if (token.kind === ']') frames.pop();
      else takeValue(token);
    } else if (token.kind === ',') {
      frame.state = 'value';
    } else if (token.kind === ']') {
      frames.pop();
    } else {
      throw new Error('Invalid snapshot JSON');
    }
  }
  if (frames.length || root.state !== 'done')
    throw new Error('Invalid snapshot JSON');
};

/** Freezes decoded JSON containers after checking size, depth and reserved keys. */
const freezeJson = (input: unknown): unknown => {
  const pending = [{ value: input, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    if (++nodes > 200000 || depth > 20)
      throw new Error('Snapshot exceeds shape limit');
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean'
    )
      continue;
    if (typeof value === 'number' && Number.isFinite(value)) continue;
    if (!value || typeof value !== 'object')
      throw new Error('Invalid snapshot value');
    if (Array.isArray(value) && value.length > 4096)
      throw new Error('Snapshot exceeds array limit');
    const entries = Object.entries(value);
    if (entries.length > 4096) throw new Error('Snapshot exceeds object limit');
    for (const [key, child] of entries) {
      if (['__proto__', 'constructor', 'prototype'].includes(key))
        throw new Error('Invalid snapshot key');
      pending.push({ value: child, depth: depth + 1 });
    }
    Object.freeze(value);
  }
  return input;
};
/** Identifies a non-null, non-array object for snapshot schema checks. */
const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Captures independently configured bytes before any publication request. */
export const captureEconomicAuthority = (
  expectedChainId: AvalancheChainId,
  path: unknown,
  expectedSha256: unknown,
): CapturedEconomicAuthority => {
  if (path === undefined && expectedSha256 === undefined)
    return unavailable('not-configured');
  try {
    if (
      ![43113, 43114].includes(expectedChainId) ||
      typeof expectedSha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(expectedSha256)
    )
      throw new Error('Invalid snapshot configuration');
    const filename = localPath(path);
    const bytes = readBounded(filename);
    if (digest(bytes) !== expectedSha256) throw new Error('Snapshot digest');
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const input: unknown = JSON.parse(decoded);
    rejectDuplicateJsonKeys(decoded);
    if (
      !isObject(input) ||
      Object.keys(input).sort().join(',') !==
        'chainId,observations,policy,publicationId,schemaVersion' ||
      input.schemaVersion !== 1 ||
      input.chainId !== expectedChainId ||
      typeof input.publicationId !== 'string' ||
      !/^[0-9a-f]{64}$/.test(input.publicationId) ||
      !isObject(input.policy) ||
      !isObject(input.observations)
    )
      throw new Error('Invalid snapshot schema');
    const snapshot = freezeJson(input) as EconomicAuthoritySnapshot;
    return Object.freeze({
      status: 'available',
      authoritySha256: expectedSha256,
      snapshot,
      /** Rereads the bounded file and refuses changed or unreadable snapshot bytes. */
      assertFresh: () => {
        try {
          if (digest(readBounded(filename)) !== expectedSha256)
            throw new Error('Snapshot digest');
        } catch {
          throw new Error('Economic authority snapshot changed');
        }
      },
    });
  } catch {
    return unavailable('invalid-snapshot');
  }
};
