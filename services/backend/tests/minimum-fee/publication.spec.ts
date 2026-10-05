import { createHash } from 'node:crypto';

import { decodeAvalanchePublication } from '../../../frontend/src/avalanche/publication';
import { state as publicationState } from '../mocked/avalancheFeePublication.mock';
import { native } from '../testData/avalancheFeePublication';
import {
  publicationCases3,
  publicationCases6,
  publicationCases7,
} from '../testData/avalancheFeePublicationCases';
import {
  deps,
  setup as publicationSetup,
  common as publicationCommon,
  heights as publicationHeights,
  registerPublicationContext as publicationRegisterPublicationContext,
} from '../testUtils/avalancheFeePublication';

describe('publishAvalancheFee', () => {
  publicationRegisterPublicationContext();
  const state = publicationState;
  const setup = publicationSetup;
  const common = publicationCommon,
    heights = publicationHeights;
  /**
   * @target publishAvalancheFee publishes one immutable envelope from actual constructed WASM, without mixing numeric and decimal prices
   * @dependencies Actual generation/update/construction/publisher and pinned minimum-fee3/WASM; original injected runtime plan, supported-token and external box observations; actual decoder and KV SDK where called.
   * @scenario Construct the authentic WASM transaction, publish through an observed enqueue, compare captured price forms and digest, roundtrip WASM and decode the exact published bytes.
   * @expected One immutable V2 envelope retains exact original numeric/decimal authority and roundtrips all transaction and map fields.
   */
  it('publishes one immutable envelope from actual constructed WASM, without mixing numeric and decimal prices', async () => {
    const f = await setup();
    const tx = await f.updateConfigsTransaction(f.updated);
    const { publishAvalancheFee, AVALANCHE_PUBLICATION_KEY } = await import(
      '../../src/minimum-fee/publication'
    );
    const enqueue = vi.fn(async () => 'OK');
    const envelope = await publishAvalancheFee(tx, enqueue);
    expect(enqueue).toHaveBeenCalledOnce();
    const [key, bytes] = enqueue.mock.calls[0] as unknown as [string, string];
    expect(key).toEqual(AVALANCHE_PUBLICATION_KEY);
    expect(JSON.parse(bytes)).toEqual(envelope);
    expect(envelope.transaction).toEqual(tx);
    expect(envelope.kind).toEqual('transaction');
    expect(envelope.version).toEqual(2);
    expect(envelope.chainId).toEqual(43113);
    expect(envelope.rsnTokenId).toEqual('avax');
    expect(envelope.legacyNumericPrices).toEqual([
      ['avax', 2.0000000000000004],
    ]);
    expect(envelope.avalancheDecimalPrices).toEqual({
      avax: '2',
      tokens: { avax: '2' },
    });
    expect(envelope.rawTokenMap).toEqual(
      Reflect.get(state.source as object, 'rawMap'),
    );
    expect(Object.isFrozen(envelope)).toEqual(true);
    expect(Object.isFrozen(envelope.transaction!.inputs)).toEqual(true);
    expect(Object.isFrozen(envelope.supportedTokens[0].fee)).toEqual(true);
    expect(bytes).not.toContain('fixture.invalid');
    expect(bytes).not.toContain('rpcUrl');
    expect(envelope.publicationId).toMatch(/^[0-9a-f]{64}$/);
    const { publicationId, ...body } = JSON.parse(bytes);
    expect(publicationId).toEqual(
      createHash('sha256').update(JSON.stringify(body)).digest('hex'),
    );
    const parsed = deps.wasm.ReducedTransaction.sigma_parse_bytes(
      Buffer.from(envelope.transaction!.reducedTx, 'base64'),
    );
    expect(
      Buffer.from(parsed.sigma_serialize_bytes()).toString('base64'),
    ).toEqual(tx.reducedTx);
    const decoded = decodeAvalanchePublication(bytes, 43113);
    expect(decoded).toEqual(envelope);
    expect(decoded.transaction).toEqual(tx);
    expect(decoded.transaction!.inputs).toEqual(tx.inputs);
    expect(decoded.rawTokenMap).toEqual(envelope.rawTokenMap);
    expect(decoded.supportedTokens).toEqual(envelope.supportedTokens);
    expect(decoded.avalancheDecimalPrices).toEqual(
      envelope.avalancheDecimalPrices,
    );
    expect(decoded.legacyNumericPrices).toEqual(envelope.legacyNumericPrices);
    expect(Object.isFrozen(decoded.transaction!.inputs)).toEqual(true);
  });
  /**
   * @target publishAvalancheFee captures full plan and original candidate with height-only disabled chains
   * @dependencies Actual generation/update/construction/publisher and pinned minimum-fee3/WASM; original injected runtime plan, supported-token and external box observations; actual decoder and KV SDK where called.
   * @scenario Prepare the height-only Cardano candidate, construct and publish it, then inspect frontier, quote, gas policy, original candidate fields and their frozen projection.
   * @expected The projection retains the disabled chain height without a fabricated chain config and preserves every captured fee field.
   */
  it('captures full plan and original candidate with height-only disabled chains', async () => {
    const f = await setup(true);
    const tx = await f.updateConfigsTransaction(f.updated);
    const { publishAvalancheFee } = await import(
      '../../src/minimum-fee/publication'
    );
    const envelope = await publishAvalancheFee(
      tx,
      vi.fn(async () => 'OK'),
    );
    const evidence = envelope.feeEvidence;
    expect(evidence.finalized).toEqual({
      chainId: 43113,
      height: 100,
      hash: '0x' + '01'.repeat(32),
    });
    expect(evidence.quote).toEqual({
      chainId: 43113,
      baseFeePerGas: '16',
      maxPriorityFeePerGas: '1',
      maxFeePerGas: '33',
    });
    expect(evidence.policy).toEqual({
      gasBudget: '1000000000000000000',
      margin: { numerator: '1', denominator: '1' },
      activationDelay: 5,
    });
    const { SUPPORTED_CHAINS } = await import('../../src/utils/consts');
    expect(evidence.history.chains).toEqual([...SUPPORTED_CHAINS, 'avalanche']);
    expect(evidence.history.frontiers).toEqual(
      Object.fromEntries(evidence.history.chains.map((c) => [c, 100])),
    );
    expect(evidence.history.guarantees).toEqual(
      Object.fromEntries(evidence.history.chains.map((c) => [c, 10])),
    );
    expect(evidence.assets).toHaveLength(1);
    expect(evidence.updates).toHaveLength(1);
    expect(evidence.assets[0]).toEqual({
      selectedTokenId: 'avax',
      ergoTokenId: native,
      activationHeight: 105,
      fee: evidence.updates[0].candidate.configs.avalanche,
    });
    expect(evidence.updates[0].candidate.heights).toEqual({
      ergo: 105,
      cardano: 105,
      avalanche: 105,
    });
    expect(evidence.updates[0].candidate.configs).not.toHaveProperty('cardano');
    expect(evidence.updates[0].candidate.configs.ergo).toEqual(
      Object.fromEntries(
        Object.entries(common()).map(([key, value]) => [key, value.toString()]),
      ),
    );
    expect(Object.isFrozen(evidence)).toEqual(true);
    expect(Object.isFrozen(evidence.assets[0].fee)).toEqual(true);
    expect(Object.isFrozen(evidence.updates[0].candidate.heights)).toEqual(
      true,
    );
  });
  /**
   * @target publishAvalancheFee rejects captured %s mutation before enqueue
   * @dependencies Actual generation/update/construction/publisher and pinned minimum-fee3/WASM; original injected runtime plan, supported-token and external box observations; actual decoder and KV SDK where called.
   * @scenario Construct once, change only the table-selected captured quote/frontier/asset/candidate/chain policy, attempt publication, inspect zero enqueue and restore shared history policy in finally.
   * @expected Each captured-authority mutation rejects before enqueue without leaving shared guarantees or chain order changed.
   */
  it.each(publicationCases3)(
    'rejects captured %s mutation before enqueue',
    async (fault) => {
      const f = await setup();
      const tx = await f.updateConfigsTransaction(f.updated);
      const { feeGuaranteeDuration } = await import('../../src/configs');
      const { SUPPORTED_CHAINS } = await import('../../src/utils/consts');
      const originalChains = [...SUPPORTED_CHAINS],
        guarantee = feeGuaranteeDuration.get('ergo');
      try {
        if (fault === 'plan quote')
          Reflect.get(state.plan as object, 'quote').maxFeePerGas++;
        if (fault === 'plan frontier')
          Reflect.get(state.plan as object, 'finalized').height++;
        if (fault === 'plan asset')
          Reflect.get(state.plan as object, 'assets')[0].activationHeight++;
        if (fault === 'candidate')
          f.candidates.get('avax')!.setChainConfig('ergo', 106, common());
        if (fault === 'frontier') f.frontier.set('ergo', 101);
        if (fault === 'guarantee') feeGuaranteeDuration.set('ergo', 11);
        if (fault === 'chain list') SUPPORTED_CHAINS.reverse();
        const { publishAvalancheFee } = await import(
          '../../src/minimum-fee/publication'
        );
        const enqueue = vi.fn();
        await expect(publishAvalancheFee(tx, enqueue)).rejects.toThrow();
        expect(enqueue).not.toHaveBeenCalled();
      } finally {
        SUPPORTED_CHAINS.splice(0, SUPPORTED_CHAINS.length, ...originalChains);
        feeGuaranteeDuration.set('ergo', guarantee!);
      }
    },
  );
  /**
   * @target publishAvalancheFee preserves zero activation delay and excludes private config sentinels
   * @dependencies Actual generation/update/construction/publisher and pinned minimum-fee3/WASM; original injected runtime plan, supported-token and external box observations; actual decoder and KV SDK where called.
   * @scenario Set activationDelay to zero and add a synthetic private-field sentinel, construct and publish, then inspect activation heights, enqueue bytes and decoder roundtrip.
   * @expected Zero delay stays zero and the private sentinel is absent from the published projection.
   */
  it('preserves zero activation delay and excludes private config sentinels', async () => {
    Reflect.set(state.raw as object, 'activationDelay', 0);
    Reflect.set(
      state.raw as object,
      'privateCredential',
      'PRIVATE_EVIDENCE_SENTINEL',
    );
    const f = await setup();
    const { publishAvalancheFee } = await import(
      '../../src/minimum-fee/publication'
    );
    const enqueue = vi.fn(async () => 'OK');
    const envelope = await publishAvalancheFee(
      await f.updateConfigsTransaction(f.updated),
      enqueue,
    );
    expect(envelope.feeEvidence.policy.activationDelay).toEqual(0);
    expect(envelope.feeEvidence.assets[0].activationHeight).toEqual(100);
    expect(JSON.stringify(enqueue.mock.calls)).not.toContain(
      'PRIVATE_EVIDENCE_SENTINEL',
    );
    expect(decodeAvalanchePublication(JSON.stringify(envelope), 43113)).toEqual(
      envelope,
    );
  });
  /**
   * @target publishAvalancheFee carries every construction update independently of the Avalanche asset list
   * @dependencies Actual generation/update/construction/publisher and pinned minimum-fee3/WASM; original injected runtime plan, supported-token and external box observations; actual decoder and KV SDK where called.
   * @scenario Add a distinct legacy candidate beside native AVAX, construct both actual updates, publish and compare the independent asset list and complete update list.
   * @expected The envelope includes the legacy construction update even though its Avalanche asset list contains only AVAX.
   */
  it('carries every construction update independently of the Avalanche asset list', async () => {
    const f = await setup(false, true);
    const { publishAvalancheFee } = await import(
      '../../src/minimum-fee/publication'
    );
    const envelope = await publishAvalancheFee(
      await f.updateConfigsTransaction(f.updated),
      vi.fn(async () => 'OK'),
    );
    expect(
      envelope.feeEvidence.assets.map((asset) => asset.selectedTokenId),
    ).toEqual(['avax']);
    expect(
      envelope.feeEvidence.updates.map((update) => update.selectedTokenId),
    ).toEqual(['avax', 'legacy']);
    expect(envelope.feeEvidence.updates[1]).toEqual({
      selectedTokenId: 'legacy',
      ergoTokenId: 'cd'.repeat(32),
      candidate: {
        heights: { ergo: 105 },
        configs: {
          ergo: {
            bridgeFee: '100',
            networkFee: '10000',
            rsnRatio: '1',
            rsnRatioDivisor: '1',
            feeRatio: '1',
          },
        },
      },
    });
    expect(decodeAvalanchePublication(JSON.stringify(envelope), 43113)).toEqual(
      envelope,
    );
  });
  /**
   * @target publishAvalancheFee rejects %s publication without enqueue
   * @dependencies Actual generation/update/construction/publisher and pinned minimum-fee3/WASM; original injected runtime plan, supported-token and external box observations; actual decoder and KV SDK where called.
   * @scenario Construct an authentic transaction, replace only its publication source with the table-selected string, copied object, empty map or nonempty updated map, then observe enqueue.
   * @expected Every unbound source rejects and cannot enqueue.
   */
  it.each(publicationCases6)(
    'rejects %s publication without enqueue',
    async (fault) => {
      const f = await setup();
      const tx = await f.updateConfigsTransaction(f.updated);
      const { publishAvalancheFee } = await import(
        '../../src/minimum-fee/publication'
      );
      const input =
        fault === 'string'
          ? JSON.stringify(tx)
          : fault === 'copy'
            ? { ...tx }
            : fault === 'fake empty'
              ? new Map()
              : f.updated;
      const enqueue = vi.fn();
      await expect(
        publishAvalancheFee(input as never, enqueue),
      ).rejects.toThrow('Unbound');
      expect(enqueue).not.toHaveBeenCalled();
    },
  );
  /**
   * @target publishAvalancheFee rejects stale %s authority before enqueue
   * @dependencies Actual generation/update/construction/publisher and pinned minimum-fee3/WASM; original injected runtime plan, supported-token and external box observations; actual decoder and KV SDK where called.
   * @scenario Construct authentic bytes, mutate only the table-selected original price, RSN, raw map, decimal price or generation authority, then attempt enqueue.
   * @expected Each stale authority rejects before enqueue.
   */
  it.each(publicationCases7)(
    'rejects stale %s authority before enqueue',
    async (fault) => {
      const f = await setup();
      const tx = await f.updateConfigsTransaction(f.updated);
      if (fault === 'legacy price') state.legacyPrices.set('avax', 3);
      if (fault === 'RSN')
        Reflect.set(state.fee as object, 'RSNTokenId', 'changed');
      if (fault === 'raw token map')
        Reflect.get(state.source as object, 'rawMap')[0].ergo.decimals = 8;
      if (fault === 'decimal price')
        Reflect.set(state.raw as object, 'avaxPrice', '3');
      if (fault === 'generation')
        f.api.beginAvalancheFeeGeneration(() => state.source as never);
      const { publishAvalancheFee } = await import(
        '../../src/minimum-fee/publication'
      );
      const enqueue = vi.fn();
      await expect(publishAvalancheFee(tx, enqueue)).rejects.toThrow();
      expect(enqueue).not.toHaveBeenCalled();
    },
  );
  /**
   * @target publishAvalancheFee requires original metadata capture rather than labeling later values as original
   * @dependencies Actual generation/update/construction/publisher and pinned minimum-fee3/WASM; original injected runtime plan, supported-token and external box observations; actual decoder and KV SDK where called.
   * @scenario Begin a primitive generation without publication metadata, finish and consume it, bind its empty update map and attempt publication through an observed enqueue.
   * @expected Later publication cannot relabel uncaptured original metadata and never enqueues.
   */
  it('requires original metadata capture rather than labeling later values as original', async () => {
    const f = await setup();
    // A primitive caller may construct without publication metadata, but cannot publish.
    const generation = f.api.beginAvalancheFeeGeneration(
      () => state.source as never,
    );
    const candidates = new Map([
      [
        'avax',
        new deps.fees.MinimumFeeConfig().setChainConfig('ergo', 105, common()),
      ],
    ]);
    const frontier = heights();
    await f.api.finishAvalancheFeeGeneration(generation, candidates, frontier);
    const binding = f.api.consumeAvalancheFeeGeneration(candidates, frontier);
    const empty = new Map();
    f.api.bindAvalancheUpdatedConfigs(binding, empty);
    const { publishAvalancheFee } = await import(
      '../../src/minimum-fee/publication'
    );
    const enqueue = vi.fn();
    await expect(publishAvalancheFee(empty, enqueue)).rejects.toThrow(
      'not captured',
    );
    expect(enqueue).not.toHaveBeenCalled();
  });
  /**
   * @target publishAvalancheFee publishes an explicit tombstone only from a current bound empty generation
   * @dependencies Actual generation/update/construction/publisher and pinned minimum-fee3/WASM; original injected runtime plan, supported-token and external box observations; actual decoder and KV SDK where called.
   * @scenario Capture original metadata, finish and consume its real candidate binding, bind an empty update map, publish and decode the tombstone, then supersede the generation and retry.
   * @expected Only the current bound empty generation publishes one immutable tombstone; the superseded retry cannot enqueue again.
   */
  it('publishes an explicit tombstone only from a current bound empty generation', async () => {
    const f = await setup();
    const generation = f.api.beginAvalancheFeeGeneration(
      () => state.source as never,
      () => ({
        legacyNumericPrices: Array.from(state.legacyPrices),
        rsnTokenId: 'avax',
      }),
    );
    const candidates = new Map([
      [
        'avax',
        new deps.fees.MinimumFeeConfig().setChainConfig('ergo', 105, common()),
      ],
    ]);
    const frontier = heights();
    await f.api.finishAvalancheFeeGeneration(generation, candidates, frontier);
    const binding = f.api.consumeAvalancheFeeGeneration(candidates, frontier);
    const empty = new Map();
    f.api.bindAvalancheUpdatedConfigs(binding, empty);
    const { publishAvalancheFee } = await import(
      '../../src/minimum-fee/publication'
    );
    const enqueue = vi.fn(async () => 'OK');
    const envelope = await publishAvalancheFee(empty, enqueue);
    expect(envelope).toMatchObject({
      kind: 'empty',
      transaction: null,
      chainId: 43113,
    });
    expect(enqueue).toHaveBeenCalledOnce();
    const [, bytes] = enqueue.mock.calls[0] as unknown as [string, string];
    const decoded = decodeAvalanchePublication(bytes, 43113);
    expect(decoded).toEqual(envelope);
    expect(decoded.kind).toEqual('empty');
    expect(decoded.transaction).toBeNull();
    expect(decoded.rawTokenMap).toEqual(envelope.rawTokenMap);
    expect(decoded.supportedTokens).toEqual(envelope.supportedTokens);
    expect(decoded.avalancheDecimalPrices).toEqual(
      envelope.avalancheDecimalPrices,
    );
    expect(decoded.legacyNumericPrices).toEqual(envelope.legacyNumericPrices);
    expect(Object.isFrozen(decoded.supportedTokens[0].fee)).toEqual(true);
    f.api.beginAvalancheFeeGeneration(() => state.source as never);
    await expect(publishAvalancheFee(empty, enqueue)).rejects.toThrow(
      'superseded',
    );
    expect(enqueue).toHaveBeenCalledOnce();
  });
  /**
   * @target publishAvalancheFee rejects concurrent publication until the first enqueue settles, then releases ownership
   * @dependencies Actual generation/update/construction/publisher and pinned minimum-fee3/WASM; original injected runtime plan, supported-token and external box observations; actual decoder and KV SDK where called.
   * @scenario Hold the first enqueue on an explicit promise gate, attempt overlapping publication, release the gate, then publish again after the first completion.
   * @expected Concurrent publication rejects until ownership releases and the later attempt enqueues successfully.
   */
  it('rejects concurrent publication until the first enqueue settles, then releases ownership', async () => {
    const f = await setup();
    const tx = await f.updateConfigsTransaction(f.updated);
    const { publishAvalancheFee } = await import(
      '../../src/minimum-fee/publication'
    );
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const enqueue = vi.fn(() => waiting);
    const first = publishAvalancheFee(tx, enqueue);
    expect(enqueue).toHaveBeenCalledOnce();
    await expect(publishAvalancheFee(tx, enqueue)).rejects.toThrow(
      'in progress',
    );
    expect(enqueue).toHaveBeenCalledOnce();
    release();
    await first;
    await publishAvalancheFee(tx, enqueue);
    expect(enqueue).toHaveBeenCalledTimes(2);
  });
  /**
   * @target publishAvalancheFee a transport failure before accepting SET preserves the previous complete envelope and releases ownership
   * @dependencies Actual generation/update/construction/publisher and pinned minimum-fee3/WASM; original injected runtime plan, supported-token and external box observations; actual decoder and KV SDK where called.
   * @scenario Reject enqueue before accepting SET while retaining the previous stored string, then retry with an enqueue that writes the new bytes.
   * @expected Transport failure preserves the prior complete envelope and releases ownership for the successful retry.
   */
  it('a transport failure before accepting SET preserves the previous complete envelope and releases ownership', async () => {
    const f = await setup();
    const tx = await f.updateConfigsTransaction(f.updated);
    const { publishAvalancheFee } = await import(
      '../../src/minimum-fee/publication'
    );
    let stored = 'previous-complete-envelope';
    await expect(
      publishAvalancheFee(tx, async () => {
        throw new Error('not accepted');
      }),
    ).rejects.toThrow('not accepted');
    expect(stored).toEqual('previous-complete-envelope');
    await publishAvalancheFee(tx, async (_key, bytes) => {
      stored = bytes;
    });
    expect(JSON.parse(stored).transaction).toEqual(tx);
  });
  /**
   * @target publishAvalancheFee does not claim rollback if generation is superseded after synchronous enqueue
   * @dependencies Actual generation/update/construction/publisher and pinned minimum-fee3/WASM; original injected runtime plan, supported-token and external box observations; actual decoder and KV SDK where called.
   * @scenario Construct, accept bytes synchronously in enqueue and supersede generation inside that callback, then compare the accepted result and attempt another publish.
   * @expected Already accepted bytes are returned without rollback claims; another stale publish rejects.
   */
  it('does not claim rollback if generation is superseded after synchronous enqueue', async () => {
    const f = await setup();
    const tx = await f.updateConfigsTransaction(f.updated);
    const { publishAvalancheFee } = await import(
      '../../src/minimum-fee/publication'
    );
    let stored = '';
    const result = await publishAvalancheFee(tx, async (_key, bytes) => {
      stored = bytes;
      f.api.beginAvalancheFeeGeneration(() => state.source as never);
    });
    expect(JSON.parse(stored)).toEqual(result);
    await expect(publishAvalancheFee(tx, vi.fn())).rejects.toThrow(
      'superseded',
    );
  });
  /**
   * @target publishAvalancheFee does not publish token price-provider parameters or raw RPC policy
   * @dependencies Actual generation/update/construction/publisher and pinned minimum-fee3/WASM; original injected runtime plan, supported-token and external box observations; actual decoder and KV SDK where called.
   * @scenario Add a synthetic token price-provider secret parameter, prepare a fresh generation and publish its authentic constructed transaction, then inspect the serialized result.
   * @expected The public envelope excludes the private price-provider value and parameter field.
   */
  it('does not publish token price-provider parameters or raw RPC policy', async () => {
    const f = await setup();
    // New generation captures additional private operator fields, but its public projection excludes them.
    Reflect.get(state.source as object, 'tokens')[0].priceBackendParams = {
      apiKey: 'PRIVATE_SYNTHETIC',
    };
    const next = await setup();
    const tx = await next.updateConfigsTransaction(next.updated);
    const { publishAvalancheFee } = await import(
      '../../src/minimum-fee/publication'
    );
    const send = vi.fn(async () => undefined);
    const result = await publishAvalancheFee(tx, send);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_SYNTHETIC');
    expect(JSON.stringify(result)).not.toContain('priceBackendParams');
    expect(f.updated).toBeDefined();
  });
  /**
   * @target publishAvalancheFee joins actual construction provenance to the actual KV SDK with intercepted fetch
   * @dependencies Actual generation/update/construction/publisher and pinned minimum-fee3/WASM; original injected runtime plan, supported-token and external box observations; actual decoder and KV SDK where called.
   * @scenario Intercept actual KV3/Redis1.34.2 fetch, construct authentic provenance, publish through actual saveAvalanchePublication and inspect its one pipeline SET.
   * @expected One complete envelope joins the real publisher, store and KV SDK with the supplied transaction unchanged.
   */
  it('joins actual construction provenance to the actual KV SDK with intercepted fetch', async () => {
    const f = await setup();
    const tx = await f.updateConfigsTransaction(f.updated);
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify([{ result: 'OK' }]), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetch);
    const { publishAvalancheFee, AVALANCHE_PUBLICATION_KEY } = await import(
      '../../src/minimum-fee/publication'
    );
    const { saveAvalanchePublication } = await import('../../src/store');
    const envelope = await publishAvalancheFee(tx, saveAvalanchePublication);
    expect(fetch).toHaveBeenCalledOnce();
    const [, options] = fetch.mock.calls[0] as unknown as [
      string,
      { body: string },
    ];
    const [command] = JSON.parse(options.body as string);
    expect(command.slice(0, 2)).toEqual(['set', AVALANCHE_PUBLICATION_KEY]);
    expect(JSON.parse(command[2])).toEqual(envelope);
    expect(envelope.transaction).toEqual(tx);
  });
  /**
   * @target publishAvalancheFee a pending old generation cannot overwrite a newer same-process publication
   * @dependencies Actual generation/update/construction/publisher and pinned minimum-fee3/WASM; original injected runtime plan, supported-token and external box observations; actual decoder and KV SDK where called.
   * @scenario Hold the old accepted enqueue on a gate, produce a newer generation, test serialization, release the older write, publish the new one and attempt the stale old publication.
   * @expected The newer complete envelope wins after ownership releases; superseded authority cannot enqueue again.
   */
  it('a pending old generation cannot overwrite a newer same-process publication', async () => {
    const first = await setup();
    const old = await first.updateConfigsTransaction(first.updated);
    const { publishAvalancheFee } = await import(
      '../../src/minimum-fee/publication'
    );
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let stored = '';
    const olderWrite = publishAvalancheFee(old, async (_key, payload) => {
      await gate;
      stored = payload;
    });
    state.legacyPrices.set('avax', 3);
    const second = await setup();
    const fresh = await second.updateConfigsTransaction(second.updated);
    const enqueue = vi.fn(async (_key: string, payload: string) => {
      stored = payload;
    });
    await expect(publishAvalancheFee(fresh, enqueue)).rejects.toThrow(
      'in progress',
    );
    expect(enqueue).not.toHaveBeenCalled();
    finish();
    await olderWrite;
    const latest = await publishAvalancheFee(fresh, enqueue);
    await expect(publishAvalancheFee(old, enqueue)).rejects.toThrow(
      'superseded',
    );
    expect(JSON.parse(stored)).toEqual(latest);
    expect(latest.legacyNumericPrices).toEqual([['avax', 3]]);
    expect(enqueue).toHaveBeenCalledOnce();
  });
});
