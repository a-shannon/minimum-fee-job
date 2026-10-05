import { decodeAvalanchePublication } from '../../src/avalanche/publication';
import {
  requiredV2,
  uintPaths,
  publicationCases0,
  publicationCases2,
  publicationCases7,
  publicationCases8,
  publicationCases9,
  publicationCases12,
  publicationCases13,
  publicationCases14,
  publicationCases16,
  publicationCases20,
  publicationCases21,
  publicationCases22,
} from '../testData/avalanchePublicationSchema';
import {
  body,
  fixture,
  native,
  seal,
} from '../testUtils/avalanchePublicationFixture';
import {
  feeV2,
  evidenceV2,
  bodyV2,
  alterV2,
} from '../testUtils/avalanchePublicationSchema';

describe('decodeAvalanchePublication', () => {
  /**
   * @target decodeAvalanchePublication: V2 captures both chain %s variants without numeric amount conversion
   * @dependencies Independent canonical envelope/seal fixtures and the actual publication decoder; no network or signing.
   * @scenario Build V2 transaction and empty envelopes for both explicit chain IDs, then mutate the source fee string.
   * @expected Version, exact Long strings, zero activation delay, update count and deep freezing remain bound to the captured envelope.
   */
  it.each(publicationCases0)(
    'V2 captures both chain %s variants without numeric amount conversion',
    (chain) => {
      for (const empty of [false, true]) {
        const value = bodyV2(empty);
        value.chainId =
          value.feeEvidence.finalized.chainId =
          value.feeEvidence.quote.chainId =
            chain;
        const decoded = decodeAvalanchePublication(
          JSON.stringify(seal(value)),
          chain,
        );
        expect(decoded.version).toEqual(2);
        if (decoded.version !== 2) throw new Error('V2 expected');
        expect(decoded.feeEvidence.assets[0].fee.networkFee).toEqual(
          '9007199254740993',
        );
        expect(decoded.feeEvidence.policy.activationDelay).toEqual(0);
        expect(decoded.feeEvidence.updates.length).toEqual(empty ? 0 : 1);
        expect(Object.isFrozen(decoded.feeEvidence.updates)).toEqual(true);
        expect(Object.isFrozen(decoded.feeEvidence.assets[0].fee)).toEqual(
          true,
        );
        value.feeEvidence.assets[0].fee.networkFee = '1';
        expect(decoded.feeEvidence.assets[0].fee.networkFee).toEqual(
          '9007199254740993',
        );
        expect(decoded).not.toHaveProperty('eligibleForSigning');
      }
    },
  );

  /**
   * @target decodeAvalanchePublication: V2 accepts height-only candidate chains and legacy-only updates
   * @dependencies Independent canonical envelope/seal fixtures and the actual publication decoder; no network or signing.
   * @scenario Add a height-only Bitcoin candidate entry and an Ergo-only legacy update to a V2 envelope.
   * @expected The schema accepts version2 without claiming transaction or economic validity.
   */
  it('V2 accepts height-only candidate chains and legacy-only updates', () => {
    const value = bodyV2();
    Object.assign(value.feeEvidence.updates[0].candidate.heights, {
      bitcoin: 77,
    });
    value.feeEvidence.updates.push({
      selectedTokenId: 'legacy',
      ergoTokenId: 'erg',
      candidate: { heights: { ergo: 95 }, configs: { ergo: feeV2() } },
    } as never);
    expect(decodeAvalanchePublication(seal(value), 43113).version).toEqual(2);
  });

  /**
   * @target decodeAvalanchePublication: V2 rejects non-object evidence node %s
   * @dependencies Independent canonical envelope/seal fixtures and the actual publication decoder; no network or signing.
   * @scenario Replace each named V2 evidence node independently with null, an array, text or a number.
   * @expected Every non-object evidence replacement is rejected.
   */
  it.each(publicationCases2)(
    'V2 rejects non-object evidence node %s',
    (path) => {
      for (const wrong of [null, [], 'value', 1]) {
        const value = bodyV2();
        alterV2(value, 'feeEvidence.' + path, wrong);
        expect(() => decodeAvalanchePublication(seal(value), 43113)).toThrow();
      }
    },
  );

  /**
   * @target decodeAvalanchePublication: V2 preserves the exact 4096 entry capture boundary
   * @dependencies Independent canonical envelope/seal fixtures and the actual publication decoder; no network or signing.
   * @scenario Capture 4096 asset entries, then append one further entry.
   * @expected The exact 4096 boundary is accepted and entry 4097 is rejected.
   */
  it('V2 preserves the exact 4096 entry capture boundary', () => {
    const value = bodyV2();
    value.feeEvidence.assets = Array.from({ length: 4096 }, (_, i) => ({
      selectedTokenId: 'asset' + i,
      ergoTokenId: 'target' + i,
      activationHeight: 0,
      fee: feeV2(),
    }));
    expect(decodeAvalanchePublication(seal(value), 43113).version).toEqual(2);
    value.feeEvidence.assets.push({
      selectedTokenId: 'asset4096',
      ergoTokenId: 'target4096',
      activationHeight: 0,
      fee: feeV2(),
    });
    expect(() => decodeAvalanchePublication(seal(value), 43113)).toThrow();
  });

  /**
   * @target decodeAvalanchePublication: V1 rejects evidence instead of silently accepting the V2 extension
   * @dependencies Independent canonical envelope/seal fixtures and the actual publication decoder; no network or signing.
   * @scenario Add V2 fee evidence to a resealed V1 envelope.
   * @expected The unsupported V1 extension is rejected.
   */
  it('V1 rejects evidence instead of silently accepting the V2 extension', () => {
    expect(() =>
      decodeAvalanchePublication(
        seal({ ...body(), feeEvidence: evidenceV2() }),
        43113,
      ),
    ).toThrow();
  });

  /**
   * @target decodeAvalanchePublication: V2 evidence belongs to the digest but a resealed economic error is only schema-checked
   * @dependencies Independent canonical envelope/seal fixtures and the actual publication decoder; no network or signing.
   * @scenario Change maxFeePerGas after sealing, then seal the changed envelope again.
   * @expected The stale digest is rejected; the resealed economic disagreement remains schema-valid V2.
   */
  it('V2 evidence belongs to the digest but a resealed economic error is only schema-checked', () => {
    const value = bodyV2(),
      packet = seal(value);
    value.feeEvidence.quote.maxFeePerGas = '1';
    expect(() => decodeAvalanchePublication(packet, 43113)).toThrow();
    expect(decodeAvalanchePublication(seal(value), 43113).version).toEqual(2);
  });

  /**
   * @target decodeAvalanchePublication: V2 requires exact field %s
   * @dependencies Independent canonical envelope/seal fixtures and the actual publication decoder; no network or signing.
   * @scenario Delete each of 41 expanded required V2 field paths and recompute the digest.
   * @expected Every missing required field is rejected.
   */
  it.each(requiredV2)('V2 requires exact field %s', (path) => {
    const value = bodyV2();
    alterV2(value, path, undefined, true);
    expect(() => decodeAvalanchePublication(seal(value), 43113)).toThrow();
  });

  /**
   * @target decodeAvalanchePublication: V2 rejects unknown nested field in %s
   * @dependencies Independent canonical envelope/seal fixtures and the actual publication decoder; no network or signing.
   * @scenario Insert an unknown property at each named nested V2 evidence object.
   * @expected Every extra evidence field is rejected after resealing.
   */
  it.each(publicationCases7)(
    'V2 rejects unknown nested field in %s',
    (path) => {
      const value = bodyV2();
      alterV2(value, path + '.unknown', true);
      expect(() => decodeAvalanchePublication(seal(value), 43113)).toThrow();
    },
  );

  /**
   * @target decodeAvalanchePublication: V2 rejects isolated evidence %s=%j
   * @dependencies Independent canonical envelope/seal fixtures and the actual publication decoder; no network or signing.
   * @scenario Apply the 26 isolated chain, hash, margin, history, asset and candidate replacements from the preserved table.
   * @expected Each resealed evidence fault is rejected.
   */
  it.each(publicationCases8)(
    'V2 rejects isolated evidence %s=%j',
    (path, replacement) => {
      const value = bodyV2();
      alterV2(value, 'feeEvidence.' + path, replacement);
      expect(() => decodeAvalanchePublication(seal(value), 43113)).toThrow();
    },
  );

  /**
   * @target decodeAvalanchePublication: V2 rejects each duplicate %s identity separately
   * @dependencies Independent canonical envelope/seal fixtures and the actual publication decoder; no network or signing.
   * @scenario Duplicate only selectedTokenId or ergoTokenId within the asset or update collection.
   * @expected Each duplicate identity is independently rejected.
   */
  it.each(publicationCases9)(
    'V2 rejects each duplicate %s identity separately',
    (group) => {
      for (const field of ['selectedTokenId', 'ergoTokenId']) {
        const value = bodyV2(),
          entries = value.feeEvidence[group];
        const second = {
          ...entries[0],
          selectedTokenId: 'other',
          ergoTokenId: 'other',
        };
        Reflect.set(second, field, entries[0][field as 'selectedTokenId']);
        (entries as unknown[]).push(second);
        expect(() => decodeAvalanchePublication(seal(value), 43113)).toThrow();
      }
    },
  );

  /**
   * @target decodeAvalanchePublication: V2 empty publication cannot carry updates
   * @dependencies Independent canonical envelope/seal fixtures and the actual publication decoder; no network or signing.
   * @scenario Change a transaction envelope to empty while retaining nonempty V2 updates.
   * @expected An empty publication carrying updates is rejected.
   */
  it('V2 empty publication cannot carry updates', () => {
    const value = bodyV2();
    value.kind = 'empty';
    value.transaction = null;
    expect(() => decodeAvalanchePublication(seal(value), 43113)).toThrow();
  });

  /**
   * @target decodeAvalanchePublication: V2 rejects malformed or overflowing uint256 %s
   * @dependencies Independent canonical envelope/seal fixtures and the actual publication decoder; no network or signing.
   * @scenario Replace each uint256 path with numeric, signed, noncanonical, exponent, whitespace or overflowing values.
   * @expected All malformed or overflowing uint256 representations are rejected.
   */
  it.each(uintPaths)(
    'V2 rejects malformed or overflowing uint256 %s',
    (path) => {
      for (const invalid of [
        1,
        -1,
        '01',
        '-1',
        '+1',
        '1.0',
        '1e1',
        ' 1',
        (1n << 256n).toString(),
      ]) {
        const value = bodyV2();
        alterV2(value, 'feeEvidence.' + path, invalid);
        expect(() => decodeAvalanchePublication(seal(value), 43113)).toThrow();
      }
    },
  );

  /**
   * @target decodeAvalanchePublication: V2 rejects zero positive uint %s
   * @dependencies Independent canonical envelope/seal fixtures and the actual publication decoder; no network or signing.
   * @scenario Set each strictly positive quote or policy uint field to the string zero.
   * @expected Zero is rejected for every positive field.
   */
  it.each(publicationCases12)('V2 rejects zero positive uint %s', (path) => {
    const value = bodyV2();
    alterV2(value, 'feeEvidence.' + path, '0');
    expect(() => decodeAvalanchePublication(seal(value), 43113)).toThrow();
  });

  /**
   * @target decodeAvalanchePublication: V2 rejects non-int32 %s
   * @dependencies Independent canonical envelope/seal fixtures and the actual publication decoder; no network or signing.
   * @scenario Replace each int32 height, delay or guarantee with negative, fractional, overflowing, textual or null values.
   * @expected Each non-int32 field is rejected.
   */
  it.each(publicationCases13)('V2 rejects non-int32 %s', (path) => {
    for (const invalid of [-1, 0.5, 2147483648, '1', null]) {
      const value = bodyV2();
      alterV2(value, 'feeEvidence.' + path, invalid);
      expect(() => decodeAvalanchePublication(seal(value), 43113)).toThrow();
    }
  });

  /**
   * @target decodeAvalanchePublication: V2 exact Sigma Long field %s
   * @dependencies Independent canonical envelope/seal fixtures and the actual publication decoder; no network or signing.
   * @scenario Replace each Sigma Long fee field with numeric, noncanonical, negative or overflowing strings; also test a zero divisor.
   * @expected Invalid Long values are rejected in both asset fees and candidate configurations.
   */
  it.each(publicationCases14)('V2 exact Sigma Long field %s', (field) => {
    for (const base of [
      'assets.0.fee',
      'updates.0.candidate.configs.avalanche',
    ]) {
      for (const invalid of [
        1,
        '01',
        '-1',
        (1n << 63n).toString(),
        ...(field === 'rsnRatioDivisor' ? ['0'] : []),
      ]) {
        const value = bodyV2();
        alterV2(value, 'feeEvidence.' + base + '.' + field, invalid);
        expect(() => decodeAvalanchePublication(seal(value), 43113)).toThrow();
      }
    }
  });

  /**
   * @target decodeAvalanchePublication: V2 accepts exact upper integer bounds, zero allowed fields and equal margin
   * @dependencies Independent canonical envelope/seal fixtures and the actual publication decoder; no network or signing.
   * @scenario Use exact uint256, int32 and Sigma Long upper bounds, allowed zero fields and equal margin numerator/denominator.
   * @expected The canonical boundary values remain schema-valid V2.
   */
  it('V2 accepts exact upper integer bounds, zero allowed fields and equal margin', () => {
    const value = bodyV2(),
      evidence = value.feeEvidence,
      max = ((1n << 256n) - 1n).toString();
    evidence.quote = {
      chainId: 43113,
      baseFeePerGas: '0',
      maxPriorityFeePerGas: '0',
      maxFeePerGas: max,
    };
    evidence.policy = {
      gasBudget: max,
      margin: { numerator: max, denominator: max },
      activationDelay: 2147483647,
    };
    evidence.finalized.height =
      evidence.history.frontiers.avalanche = 2147483647;
    evidence.history.guarantees.ergo = 2147483647;
    for (const field of Object.keys(evidence.assets[0].fee))
      Reflect.set(evidence.assets[0].fee, field, ((1n << 63n) - 1n).toString());
    expect(decodeAvalanchePublication(seal(value), 43113).version).toEqual(2);
  });

  /**
   * @target decodeAvalanchePublication: V2 rejects sparse, inherited and extra-key array %s
   * @dependencies Independent canonical envelope/seal fixtures and the actual publication decoder; no network or signing.
   * @scenario Give each evidence array sparse, inherited, symbol, hidden or oversized membership.
   * @expected Every noncanonical array shape is rejected without accepting its old digest.
   */
  it.each(publicationCases16)(
    'V2 rejects sparse, inherited and extra-key array %s',
    (path) => {
      for (const fault of [
        'sparse',
        'inherited',
        'symbol',
        'hidden',
        'oversize',
      ]) {
        const value = bodyV2(),
          packet = seal(value);
        const array = path
          .split('.')
          .reduce<unknown>(
            (v, k) => Reflect.get(v as object, k),
            value.feeEvidence,
          ) as unknown[];
        if (fault === 'oversize') array.length = 4097;
        else if (fault === 'symbol')
          Object.defineProperty(array, Symbol('extra'), { value: 1 });
        else if (fault === 'hidden')
          Object.defineProperty(array, 'extra', { value: 1 });
        else {
          const first = array[0];
          delete array[0];
          if (fault === 'inherited') {
            const prototype = Object.create(Object.getPrototypeOf(array));
            Object.defineProperty(prototype, '0', { value: first });
            Object.setPrototypeOf(array, prototype);
          }
        }
        expect(() => decodeAvalanchePublication(packet, 43113)).toThrow();
      }
    },
  );

  /**
   * @target decodeAvalanchePublication: captures and deeply freezes exact decimal strings without number promotion
   * @dependencies Independent canonical envelope/seal fixtures and the actual publication decoder; no network or signing.
   * @scenario Decode an exact decimal price, mutate the original, and inspect frozen objects and prototypes.
   * @expected Exact decimal text and deep freezing survive; both prototype identity assertions remain strict references.
   */
  it('captures and deeply freezes exact decimal strings without number promotion', () => {
    const original = body();
    const result = decodeAvalanchePublication(seal(original), 43113);
    original.avalancheDecimalPrices.tokens.avax = '1';
    expect(result.avalancheDecimalPrices.tokens.avax).toEqual(
      '9007199254740993.000000001',
    );
    expect(Object.isFrozen(result.rawTokenMap[0].avalanche.extra)).toEqual(
      true,
    );
    expect(Object.isFrozen(result.supportedTokens[0].fee)).toEqual(true);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(result.avalancheDecimalPrices.tokens)).toBe(
      Object.prototype,
    );
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  /**
   * @target decodeAvalanchePublication: accepts canonical transaction transport fields without claiming WASM validity
   * @dependencies Independent canonical envelope/seal fixtures and the actual publication decoder; no network or signing.
   * @scenario Decode a resealed envelope containing canonical base64 transaction transport strings.
   * @expected The input bytes are preserved without claiming WASM validity.
   */
  it('accepts canonical transaction transport fields without claiming WASM validity', () => {
    const value = body();
    value.kind = 'transaction';
    value.transaction = {
      reducedTx: 'AQID',
      sender: '9'.repeat(51),
      inputs: ['BAUG'],
    };
    expect(
      decodeAvalanchePublication(JSON.stringify(seal(value)), 43113).transaction
        ?.inputs,
    ).toEqual(['BAUG']);
  });

  /**
   * @target decodeAvalanchePublication: supports the other explicitly selected chain
   * @dependencies Independent canonical envelope/seal fixtures and the actual publication decoder; no network or signing.
   * @scenario Reseal the independent V1 fixture for 43114 and decode using that same explicit chain.
   * @expected The captured chain ID is 43114.
   */
  it('supports the other explicitly selected chain', () => {
    const value = body();
    value.chainId = 43114;
    expect(decodeAvalanchePublication(seal(value), 43114).chainId).toEqual(
      43114,
    );
  });

  /**
   * @target decodeAvalanchePublication: rejects %s even with a recomputed digest
   * @dependencies Independent canonical envelope/seal fixtures and the actual publication decoder; no network or signing.
   * @scenario Run every preserved V1 shape mutator against a newly resealed fixture.
   * @expected All 36 shape faults throw Invalid even with a correct recomputed digest.
   */
  it.each(publicationCases20)(
    'rejects %s even with a recomputed digest',
    (_, mutate) => {
      const value = body();
      mutate(value);
      expect(() => decodeAvalanchePublication(seal(value), 43113)).toThrow(
        'Invalid',
      );
    },
  );

  /**
   * @target decodeAvalanchePublication: rejects malformed transaction %s
   * @dependencies Independent canonical envelope/seal fixtures and the actual publication decoder; no network or signing.
   * @scenario Change reduced transaction text, sender, inputs, an extra field or duplicate input independently.
   * @expected Each malformed transport record is rejected.
   */
  it.each(publicationCases21)('rejects malformed transaction %s', (fault) => {
    const value = body();
    value.kind = 'transaction';
    const tx = { reducedTx: 'AQID', sender: '9'.repeat(51), inputs: ['BAUG'] };
    if (fault === 'reducedTx') tx.reducedTx = 'not base64';
    if (fault === 'sender') tx.sender = 'not an address';
    if (fault === 'inputs') tx.inputs = [];
    if (fault === 'unknown') Object.assign(tx, { signedTx: 'secret' });
    if (fault === 'duplicate inputs') tx.inputs.push(tx.inputs[0]);
    value.transaction = tx;
    expect(() => decodeAvalanchePublication(seal(value), 43113)).toThrow();
  });

  /**
   * @target decodeAvalanchePublication: rejects invalid root %j
   * @dependencies Independent canonical envelope/seal fixtures and the actual publication decoder; no network or signing.
   * @scenario Pass null, arrays, empty objects, malformed or nested JSON strings and NaN as root values.
   * @expected Every invalid root representation is rejected.
   */
  it.each(publicationCases22)('rejects invalid root %j', (value) => {
    expect(() => decodeAvalanchePublication(value, 43113)).toThrow();
  });

  /**
   * @target decodeAvalanchePublication: rejects digest tampering independently of shape
   * @dependencies Independent canonical envelope/seal fixtures and the actual publication decoder; no network or signing.
   * @scenario Replace only the publication digest while retaining the canonical fixture shape.
   * @expected Digest tampering is rejected independently of schema shape.
   */
  it('rejects digest tampering independently of shape', () => {
    const value = fixture();
    Object.assign(value, { rsnTokenId: 'avax', publicationId: '0'.repeat(64) });
    expect(() => decodeAvalanchePublication(value, 43113)).toThrow();
  });

  /**
   * @target decodeAvalanchePublication: rejects a changed exact price without a new digest
   * @dependencies Independent canonical envelope/seal fixtures and the actual publication decoder; no network or signing.
   * @scenario Change only the exact AVAX price without resealing the fixture.
   * @expected The old digest cannot authenticate the changed price.
   */
  it('rejects a changed exact price without a new digest', () => {
    const value = fixture();
    (value as ReturnType<typeof body>).avalancheDecimalPrices.avax = '3';
    expect(() => decodeAvalanchePublication(value, 43113)).toThrow();
  });

  /**
   * @target decodeAvalanchePublication: rejects accessors without invoking them
   * @dependencies Independent canonical envelope/seal fixtures and the actual publication decoder; no network or signing.
   * @scenario Install an enumerable getter for rsnTokenId on the fixture.
   * @expected The accessor is rejected and its getter is never invoked.
   */
  it('rejects accessors without invoking them', () => {
    const get = vi.fn(() => native),
      value = fixture();
    Object.defineProperty(value, 'rsnTokenId', { get, enumerable: true });
    expect(() => decodeAvalanchePublication(value, 43113)).toThrow();
    expect(get).not.toHaveBeenCalled();
  });

  /**
   * @target decodeAvalanchePublication: rejects unsafe or non-JSON input values
   * @dependencies Independent canonical envelope/seal fixtures and the actual publication decoder; no network or signing.
   * @scenario Insert Infinity in metadata and separately pass a Date as the publication root.
   * @expected Both unsafe or non-JSON values are rejected.
   */
  it('rejects unsafe or non-JSON input values', () => {
    const value = body();
    Object.assign(value.rawTokenMap[0].avalanche.extra, { value: Infinity });
    expect(() => decodeAvalanchePublication(value, 43113)).toThrow();
    expect(() => decodeAvalanchePublication(new Date(), 43113)).toThrow();
  });
});
