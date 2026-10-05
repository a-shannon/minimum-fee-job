import { mkdirSync, mkdtempSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { captureEconomicAuthority } from '../../src/avalanche/economicAuthority';
import {
  economicAuthorityCases0,
  economicAuthorityCases2,
  economicAuthorityCases3,
  economicAuthorityCases5,
  economicAuthorityCases6,
  economicAuthorityCases7,
  economicAuthorityCases9,
  economicAuthorityCases10,
  economicAuthorityCases14,
} from '../testData/economicAuthority';
import { hash, snapshot } from '../testUtils/economicAuthority';

const io = vi.hoisted(() => ({
  smallStat: false,
  nonRegular: false,
  throwRead: false,
  readBytes: 0,
  opens: [] as number[],
  closes: [] as number[],
}));
vi.mock('node:fs', async (original) => {
  const actual = await original<typeof import('node:fs')>();
  return {
    ...actual,
    /** Opens the actual synthetic file and records its descriptor. */
    openSync: (...args: Parameters<typeof actual.openSync>) => {
      const fd = actual.openSync(...args);
      io.opens.push(fd);
      return fd;
    },
    /** Delegates stat and applies only the controlled size or regular-file fault. */
    fstatSync: (fd: number) => {
      const stat = actual.fstatSync(fd);
      if (io.nonRegular)
        return {
          ...stat,
          /** Reports the controlled nonregular descriptor fault. */
          isFile: () => false,
        };
      return io.smallStat
        ? {
            ...stat,
            size: 1,
            /** Preserves the actual regular-file predicate. */
            isFile: () => stat.isFile(),
          }
        : stat;
    },
    /** Reads actual bytes or injects the selected exception, recording the read count. */
    readSync: (
      fd: number,
      buffer: Buffer,
      offset: number,
      length: number,
      position: number | null,
    ) => {
      if (io.throwRead) throw new Error('secret path/read failure');
      const count = actual.readSync(fd, buffer, offset, length, position);
      io.readBytes += count;
      return count;
    },
    /** Records closure before closing the actual descriptor. */
    closeSync: (fd: number) => {
      io.closes.push(fd);
      return actual.closeSync(fd);
    },
  };
});
describe('captureEconomicAuthority', () => {
  let directory: string;
  /** Writes one snapshot in the current hook-owned directory and returns its exact bytes and SHA-256. */
  const file = (value: unknown = snapshot(), raw?: string | Buffer) => {
    const bytes = raw ?? JSON.stringify(value),
      path = join(directory, 'authority.json');
    writeFileSync(path, bytes);
    return { path, sha: hash(bytes), bytes };
  };
  beforeEach(() => {
    const root = process.env.AVALANCHE_AUTHORITY_ARTIFACT_ROOT;
    if (!root) throw Error('Required external authority artifact root');
    mkdirSync(root, { recursive: true });
    directory = mkdtempSync(join(root, 'authority-'));
    io.smallStat = false;
    io.nonRegular = false;
    io.throwRead = false;
    io.readBytes = 0;
    io.opens = [];
    io.closes = [];
  });
  /**
   * @target captureEconomicAuthority — captures and deeply freezes chain %s without retaining an owner object
   * @dependencies Real captureEconomicAuthority and synthetic local files; the node:fs mock delegates open/read/close while counting descriptors and controlling stat/read faults.
   * @scenario Capture each explicit chain from a synthetic file, mutate the caller policy, and inspect nested freezing, freshness and descriptor closure.
   * @expected Available snapshot keeps the original policy values, freezes every observed container, remains fresh and closes every opened descriptor.
   */
  it.each(economicAuthorityCases0)(
    'captures and deeply freezes chain %s without retaining an owner object',
    (chainId) => {
      const value = {
          ...snapshot(),
          chainId,
          policy: { nested: { values: ['1'] } },
        },
        f = file(value);
      const result = captureEconomicAuthority(chainId, f.path, f.sha);
      expect(result.status).toEqual('available');
      if (result.status !== 'available') throw Error('capture');
      value.policy.nested.values[0] = '2';
      expect(result.snapshot.policy).toEqual({ nested: { values: ['1'] } });
      expect(Object.isFrozen(result)).toEqual(true);
      expect(Object.isFrozen(result.snapshot.policy)).toEqual(true);
      expect(
        Object.isFrozen(
          (result.snapshot.policy as unknown as typeof value.policy).nested
            .values,
        ),
      ).toEqual(true);
      expect(() => result.assertFresh()).not.toThrow();
      expect(io.opens).toEqual(io.closes);
    },
  );
  /**
   * @target captureEconomicAuthority — missing configuration remains unavailable even if a file is later supplied
   * @dependencies Real captureEconomicAuthority and synthetic local files; the node:fs mock delegates open/read/close while counting descriptors and controlling stat/read faults.
   * @scenario Capture with both configuration values absent, then create a local file without recapturing.
   * @expected The result stays unavailable/not-configured, its freshness check is inert and no descriptor opens.
   */
  it('missing configuration remains unavailable even if a file is later supplied', () => {
    const result = captureEconomicAuthority(43113, undefined, undefined);
    file();
    expect(result.status).toEqual('unavailable');
    expect(result).toMatchObject({ reason: 'not-configured' });
    expect(() => result.assertFresh()).not.toThrow();
    expect(io.opens).toEqual([]);
  });
  /**
   * @target captureEconomicAuthority — rejects nonlocal or device path %j before open
   * @dependencies Real captureEconomicAuthority and synthetic local files; the node:fs mock delegates open/read/close while counting descriptors and controlling stat/read faults.
   * @scenario Supply each relative, POSIX, UNC, device, reserved-name, stream or control-character path with a well-shaped digest.
   * @expected Capture refuses the path before opening any descriptor and returns unavailable/invalid-snapshot.
   */
  it.each(economicAuthorityCases2)(
    'rejects nonlocal or device path %j before open',
    (path) => {
      expect(
        captureEconomicAuthority(43113, path, 'ab'.repeat(32)),
      ).toMatchObject({
        status: 'unavailable',
        reason: 'invalid-snapshot',
      });
      expect(io.opens).toEqual([]);
    },
  );
  /**
   * @target captureEconomicAuthority — rejects invalid configured digest %j
   * @dependencies Real captureEconomicAuthority and synthetic local files; the node:fs mock delegates open/read/close while counting descriptors and controlling stat/read faults.
   * @scenario Create a valid file and replace only the configured digest with each absent, wrong-length, uppercase or non-string value.
   * @expected Capture returns unavailable and opens no descriptor.
   */
  it.each(economicAuthorityCases3)(
    'rejects invalid configured digest %j',
    (sha) => {
      const f = file();
      expect(captureEconomicAuthority(43113, f.path, sha).status).toEqual(
        'unavailable',
      );
      expect(io.opens).toEqual([]);
    },
  );
  /**
   * @target captureEconomicAuthority — rejects a digest mismatch without exposing path or bytes
   * @dependencies Real captureEconomicAuthority and synthetic local files; the node:fs mock delegates open/read/close while counting descriptors and controlling stat/read faults.
   * @scenario Read a valid local snapshot using a different SHA-256 digest.
   * @expected Capture returns unavailable/invalid-snapshot, omits the local path from serialized output and closes the descriptor.
   */
  it('rejects a digest mismatch without exposing path or bytes', () => {
    const f = file();
    const result = captureEconomicAuthority(43113, f.path, '00'.repeat(32));
    expect(result).toMatchObject({
      status: 'unavailable',
      reason: 'invalid-snapshot',
    });
    expect(JSON.stringify(result)).not.toContain(f.path);
    expect(io.opens).toEqual(io.closes);
  });
  /**
   * @target captureEconomicAuthority — sanitizes %s and closes any opened descriptor
   * @dependencies Real captureEconomicAuthority and synthetic local files; the node:fs mock delegates open/read/close while counting descriptors and controlling stat/read faults.
   * @scenario Remove the file, supply its directory, or make the read mock throw while keeping the original digest.
   * @expected Each fault returns the sanitized invalid-snapshot result and every opened descriptor is closed.
   */
  it.each(economicAuthorityCases5)(
    'sanitizes %s and closes any opened descriptor',
    (fault) => {
      const f = file();
      if (fault === 'missing') renameSync(f.path, f.path + '.moved');
      if (fault === 'read-error') io.throwRead = true;
      const result = captureEconomicAuthority(
        43113,
        fault === 'directory' ? directory : f.path,
        f.sha,
      );
      expect(result).toMatchObject({
        status: 'unavailable',
        reason: 'invalid-snapshot',
      });
      expect(io.opens).toEqual(io.closes);
    },
  );
  /**
   * @target captureEconomicAuthority — rejects isolated root %s schema fault
   * @dependencies Real captureEconomicAuthority and synthetic local files; the node:fs mock delegates open/read/close while counting descriptors and controlling stat/read faults.
   * @scenario Change only schema version, chain, publication ID, extra root key, policy type or observations type in otherwise valid bytes.
   * @expected Each root fault returns unavailable and opened descriptors equal closed descriptors.
   */
  it.each(economicAuthorityCases6)(
    'rejects isolated root %s schema fault',
    (fault) => {
      const value: Record<string, unknown> = snapshot();
      if (fault === 'schema') value.schemaVersion = 2;
      if (fault === 'chain') value.chainId = 43114;
      if (fault === 'publicationId') value.publicationId = 'AB'.repeat(32);
      if (fault === 'extra') value.extra = true;
      if (fault === 'policy') value.policy = [];
      if (fault === 'observations') value.observations = null;
      const f = file(value);
      expect(captureEconomicAuthority(43113, f.path, f.sha).status).toEqual(
        'unavailable',
      );
      expect(io.opens).toEqual(io.closes);
    },
  );
  /**
   * @target captureEconomicAuthority — rejects duplicate JSON object keys in %s
   * @dependencies Real captureEconomicAuthority and synthetic local files; the node:fs mock delegates open/read/close while counting descriptors and controlling stat/read faults.
   * @scenario Insert each duplicate lexical JSON key, including escaped equivalence and nested objects inside arrays, into parseable JSON.
   * @expected The raw inserted fragment is present and JSON.parse accepts it, but capture returns invalid-snapshot and closes the descriptor.
   */
  it.each(economicAuthorityCases7)(
    'rejects duplicate JSON object keys in %s',
    (_label, before, after) => {
      const raw = JSON.stringify(snapshot()).replace(before, after);
      expect(raw).toContain(after);
      expect(() => JSON.parse(raw)).not.toThrow();
      const f = file(undefined, raw);
      expect(captureEconomicAuthority(43113, f.path, f.sha)).toMatchObject({
        status: 'unavailable',
        reason: 'invalid-snapshot',
      });
      expect(io.opens).toEqual(io.closes);
    },
  );
  /**
   * @target captureEconomicAuthority — accepts ordinary whitespace, escaped keys and matching keys in separate objects
   * @dependencies Real captureEconomicAuthority and synthetic local files; the node:fs mock delegates open/read/close while counting descriptors and controlling stat/read faults.
   * @scenario Write indented JSON with an escaped rate key and the same rate key in two separate objects.
   * @expected Capture is available, preserves policy rate 1 and observation rate 2, and closes the descriptor.
   */
  it('accepts ordinary whitespace, escaped keys and matching keys in separate objects', () => {
    const raw = JSON.stringify(
      { ...snapshot(), policy: { rate: 1 }, observations: { rate: 2 } },
      null,
      2,
    ).replace('"rate": 1', String.raw`"r\u0061te": 1`);
    const f = file(undefined, raw);
    const result = captureEconomicAuthority(43113, f.path, f.sha);
    expect(result.status).toEqual('available');
    if (result.status !== 'available') throw Error('capture');
    expect(result.snapshot.policy).toEqual({ rate: 1 });
    expect(result.snapshot.observations).toEqual({ rate: 2 });
    expect(io.opens).toEqual(io.closes);
  });
  /**
   * @target captureEconomicAuthority — rejects dangerous JSON key %s
   * @dependencies Real captureEconomicAuthority and synthetic local files; the node:fs mock delegates open/read/close while counting descriptors and controlling stat/read faults.
   * @scenario Insert each reserved prototype-related JSON key into the policy of a digest-matched snapshot.
   * @expected Capture returns unavailable for every reserved key.
   */
  it.each(economicAuthorityCases9)('rejects dangerous JSON key %s', (key) => {
    const f = file(
      undefined,
      JSON.stringify(snapshot()).replace(
        '"policy":{}',
        `"policy":{"${key}":{}}`,
      ),
    );
    expect(captureEconomicAuthority(43113, f.path, f.sha).status).toEqual(
      'unavailable',
    );
  });
  /**
   * @target captureEconomicAuthority — rejects bounded JSON fault %s
   * @dependencies Real captureEconomicAuthority and synthetic local files; the node:fs mock delegates open/read/close while counting descriptors and controlling stat/read faults.
   * @scenario Isolate excessive depth, node count, array length, nonfinite number, syntax or invalid UTF-8 bytes.
   * @expected Each bounded JSON fault returns unavailable and every opened descriptor closes.
   */
  it.each(economicAuthorityCases10)(
    'rejects bounded JSON fault %s',
    (fault) => {
      const value = snapshot() as ReturnType<typeof snapshot> & {
        policy: unknown;
      };
      let raw: string | Buffer | undefined;
      if (fault === 'depth') {
        let nested: unknown = {};
        for (let i = 0; i < 25; i++) nested = { nested };
        value.policy = { nested };
      }
      if (fault === 'nodes')
        value.policy = {
          rows: Array.from({ length: 101 }, () => Array(2000).fill(null)),
        };
      if (fault === 'array') value.policy = { rows: Array(4097).fill(null) };
      if (fault === 'nonfinite')
        raw = JSON.stringify(snapshot()).replace(
          '"policy":{}',
          '"policy":{"n":1e999}',
        );
      if (fault === 'syntax') raw = '{';
      if (fault === 'utf8') raw = Buffer.from([0xc3, 0x28]);
      const f = file(value, raw);
      expect(captureEconomicAuthority(43113, f.path, f.sha).status).toEqual(
        'unavailable',
      );
      expect(io.opens).toEqual(io.closes);
    },
  );
  /**
   * @target captureEconomicAuthority — accepts exactly the byte bound and refuses one byte above
   * @dependencies Real captureEconomicAuthority and synthetic local files; the node:fs mock delegates open/read/close while counting descriptors and controlling stat/read faults.
   * @scenario Capture exactly 8,000,000 bytes, append one byte and retry with its matching new digest.
   * @expected The exact bound is available; the oversized file is unavailable with zero read bytes.
   */
  it('accepts exactly the byte bound and refuses one byte above', () => {
    const raw = JSON.stringify(snapshot()).padEnd(8_000_000, ' '),
      f = file(undefined, raw);
    expect(captureEconomicAuthority(43113, f.path, f.sha).status).toEqual(
      'available',
    );
    writeFileSync(f.path, raw + ' ');
    io.readBytes = 0;
    expect(
      captureEconomicAuthority(43113, f.path, hash(raw + ' ')).status,
    ).toEqual('unavailable');
    expect(io.readBytes).toEqual(0);
  });
  /**
   * @target captureEconomicAuthority — a file growing after stat remains bounded and its descriptor closes
   * @dependencies Real captureEconomicAuthority and synthetic local files; the node:fs mock delegates open/read/close while counting descriptors and controlling stat/read faults.
   * @scenario Write 8,000,002 bytes but let the stat mock report one byte, then perform capture.
   * @expected The independent read cap stops at 8,000,001 bytes, returns unavailable and closes the descriptor.
   */
  it('a file growing after stat remains bounded and its descriptor closes', () => {
    const f = file(
      undefined,
      JSON.stringify(snapshot()).padEnd(8_000_002, ' '),
    );
    io.smallStat = true;
    expect(captureEconomicAuthority(43113, f.path, f.sha).status).toEqual(
      'unavailable',
    );
    expect(io.readBytes).toEqual(8_000_001);
    expect(io.opens).toEqual(io.closes);
  });
  /**
   * @target captureEconomicAuthority — refuses a nonregular descriptor before any read and closes it
   * @dependencies Real captureEconomicAuthority and synthetic local files; the node:fs mock delegates open/read/close while counting descriptors and controlling stat/read faults.
   * @scenario Let a real opened descriptor report a nonregular file through the controlled stat mock.
   * @expected Capture returns unavailable before reading any bytes and closes the descriptor.
   */
  it('refuses a nonregular descriptor before any read and closes it', () => {
    const f = file();
    io.nonRegular = true;
    expect(captureEconomicAuthority(43113, f.path, f.sha).status).toEqual(
      'unavailable',
    );
    expect(io.readBytes).toEqual(0);
    expect(io.opens).toEqual(io.closes);
  });
  /**
   * @target captureEconomicAuthority — freshness assertion rejects %s without exposing internals
   * @dependencies Real captureEconomicAuthority and synthetic local files; the node:fs mock delegates open/read/close while counting descriptors and controlling stat/read faults.
   * @scenario Capture valid bytes, then change, remove or grow the file or inject a read exception before assertFresh.
   * @expected The captured freshness method throws the sanitized snapshot-changed error and every opened descriptor closes.
   */
  it.each(economicAuthorityCases14)(
    'freshness assertion rejects %s without exposing internals',
    (fault) => {
      const f = file(),
        authority = captureEconomicAuthority(43113, f.path, f.sha);
      expect(authority.status).toEqual('available');
      if (fault === 'changed')
        writeFileSync(
          f.path,
          JSON.stringify({ ...snapshot(), publicationId: 'cd'.repeat(32) }),
        );
      if (fault === 'removed') renameSync(f.path, f.path + '.moved');
      if (fault === 'growth') writeFileSync(f.path, ' '.repeat(8_000_001));
      if (fault === 'read-error') io.throwRead = true;
      expect(() => authority.assertFresh()).toThrow(
        'Economic authority snapshot changed',
      );
      expect(io.opens).toEqual(io.closes);
    },
  );
});
