import type { AvalancheFeeRecord } from '../../src/avalanche/publication';
import { inspectAvalancheFeeStructure } from '../../src/avalanche/validation';
import {
  economicsCases0,
  economicsCases4,
  economicsCases5,
  economicsCases6,
  economicsCases7,
  economicsCases10,
  economicsCases13,
  economicsCases14,
  economicsCases15,
  economicsCases18,
  economicsCases19,
  economicsCases20,
  economicsCases23,
  economicsCases24,
  economicsCases27,
  economicsCases28,
  economicsCases29,
} from '../testData/avalancheEconomics';
import {
  economicsFixture,
  check,
  output,
  alignFee,
} from '../testUtils/avalancheEconomics';
import { native, seal } from '../testUtils/avalanchePublicationFixture';

vi.mock('@rosen-bridge/minimum-fee', async () => {
  const { pinnedFeeDependencies } = await import(
    '../../../backend/tests/fixtures/pinnedFeeDependencies'
  );
  return pinnedFeeDependencies().fees;
});
describe('inspectAvalancheFeeEconomics', () => {
  /**
   * @target inspectAvalancheFeeEconomics — accepts actual canonical WASM output
   * on %s
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Generate canonical WASM outputs for the selected explicit chain
   * and compare the economic result scope, output index and exact fee.
   * @expected expect(result).toMatchObject({ scope:
   * 'published-avalanche-updates-only', structuralOnlyTargets: [],
   * checkedUpdates: [ { selectedTokenId: 'avax', ergoTokenId: native,
   * outputIndex: 1, activationHeight: 105, fee: { networkFee: '3000000000' }, },
   * ], }); expect(Object.isFrozen(result.checkedUpdates[0].fee)).toEqual(true);
   * expect(result).not.toHaveProperty('eligibleForSigning')
   */
  it.each(economicsCases0)(
    'accepts actual canonical WASM output on %s',
    (chainId) => {
      const f = economicsFixture({ chainId });
      const result = check(f);
      expect(result).toMatchObject({
        scope: 'published-avalanche-updates-only',
        structuralOnlyTargets: [],
        checkedUpdates: [
          {
            selectedTokenId: 'avax',
            ergoTokenId: native,
            outputIndex: 1,
            activationHeight: 105,
            fee: { networkFee: '3000000000' },
          },
        ],
      });
      expect(Object.isFrozen(result.checkedUpdates[0].fee)).toEqual(true);
      expect(result).not.toHaveProperty('eligibleForSigning');
    },
  );
  /**
   * @target inspectAvalancheFeeEconomics — checks retained prior rows against
   * independently supplied actual box bytes
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Generate an existing fee box with retained prior rows and
   * independently supply its original serialized bytes to the economic check.
   * @expected expect( check(economicsFixture({ existing: true
   * })).checkedUpdates, ).toHaveLength(1)
   */
  it('checks retained prior rows against independently supplied actual box bytes', () => {
    expect(
      check(economicsFixture({ existing: true })).checkedUpdates,
    ).toHaveLength(1);
  });
  /**
   * @target inspectAvalancheFeeEconomics — rejects substituted canonical prior
   * and coherent output in a newly reduced resealed packet
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Change the original prior network fee, build a coherent
   * replacement transaction, retain the independent original prior bytes and
   * verify structural acceptance before economics.
   * @expected expect( inspectAvalancheFeeStructure( replacement.packet,
   * replacement.policy.contract, ).feeInputs, ).toHaveLength(1); expect(() =>
   * check(replacement)).toThrow('prior box authority')
   */
  it('rejects substituted canonical prior and coherent output in a newly reduced resealed packet', () => {
    const original = economicsFixture({ existing: true });
    const changed = structuredClone(original.old);
    Object.assign(changed.configs.avalanche, { networkFee: '2' });
    const replacement = economicsFixture({
      existing: true,
      inputRows: [changed],
    });
    Object.assign(replacement.observations, {
      priorFeeBoxes: original.observations.priorFeeBoxes,
    });
    expect(
      inspectAvalancheFeeStructure(
        replacement.packet,
        replacement.policy.contract,
      ).feeInputs,
    ).toHaveLength(1);
    expect(() => check(replacement)).toThrow('prior box authority');
  });
  /**
   * @target inspectAvalancheFeeEconomics — rejects reordered retained rows even
   * when equal heights remain structurally canonical
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Build equal-height retained rows in the reverse order; establish
   * structural acceptance before checking economics.
   * @expected expect( inspectAvalancheFeeStructure(f.packet,
   * f.policy.contract).feeOutputs, ).toHaveLength(1); expect(() =>
   * check(f)).toThrow('retained history')
   */
  it('rejects reordered retained rows even when equal heights remain structurally canonical', () => {
    const seed = economicsFixture();
    const other = structuredClone(seed.old);
    Object.assign(other.configs.avalanche, { networkFee: '2' });
    const f = economicsFixture({
      existing: true,
      inputRows: [seed.old, other],
      outputRows: [other, seed.old, seed.candidate],
    });
    expect(
      inspectAvalancheFeeStructure(f.packet, f.policy.contract).feeOutputs,
    ).toHaveLength(1);
    expect(() => check(f)).toThrow('retained history');
  });
  /**
   * @target inspectAvalancheFeeEconomics — rejects resealed canonical %s output
   * after structural acceptance
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Change the selected network or common fee in canonical output
   * rows, rebuild, verify structural acceptance and check economics.
   * @expected expect( inspectAvalancheFeeStructure(f.packet,
   * f.policy.contract).feeOutputs, ).toHaveLength(1); expect(() =>
   * check(f)).toThrow('retained history')
   */
  it.each(economicsCases4)(
    'rejects resealed canonical %s output after structural acceptance',
    (fault) => {
      const seed = economicsFixture();
      const row = structuredClone(seed.candidate);
      if (fault === 'networkFee')
        Object.assign(row.configs.avalanche, { networkFee: '3000000001' });
      else
        for (const config of Object.values(row.configs))
          Object.assign(config, { bridgeFee: '2' });
      const f = economicsFixture({ outputRows: [row] });
      expect(
        inspectAvalancheFeeStructure(f.packet, f.policy.contract).feeOutputs,
      ).toHaveLength(1);
      expect(() => check(f)).toThrow('retained history');
    },
  );
  /**
   * @target inspectAvalancheFeeEconomics — rejects independent prior mismatch:
   * %s
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Change only the selected prior authority entry to null,
   * substituted bytes, a missing key or an extra key; check economics.
   * @expected expect(() => check(f)).toThrow(/prior box authority|trusted keys/)
   */
  it.each(economicsCases5)(
    'rejects independent prior mismatch: %s',
    (fault) => {
      const f = economicsFixture({ existing: true });
      if (fault === 'null with input')
        Object.assign(f.observations.priorFeeBoxes, { [native]: null });
      if (fault === 'bytes substituted')
        Object.assign(f.observations.priorFeeBoxes, {
          [native]: Buffer.from(f.f.funding.sigma_serialize_bytes()).toString(
            'base64',
          ),
        });
      if (fault === 'missing key')
        Reflect.deleteProperty(f.observations.priorFeeBoxes, native);
      if (fault === 'extra key')
        Object.assign(f.observations.priorFeeBoxes, { extra: null });
      expect(() => check(f)).toThrow(/prior box authority|trusted keys/);
    },
  );
  /**
   * @target inspectAvalancheFeeEconomics — rejects trusted quote arithmetic
   * fault %s
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Set only the selected independently supplied quote component to
   * nine and check quote arithmetic.
   * @expected expect(() => check(f)).toThrow('quote cap')
   */
  it.each(economicsCases6)(
    'rejects trusted quote arithmetic fault %s',
    (field) => {
      const f = economicsFixture();
      Object.assign(f.observations.quote, { [field]: '9' });
      expect(() => check(f)).toThrow('quote cap');
    },
  );
  /**
   * @target inspectAvalancheFeeEconomics — rejects authority drift %s
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Change only the selected independent authority field. For
   * denominator drift first establish a coherent doubled-fee positive, then
   * alter its denominator and check economics.
   * @expected
   * expect(check(f).checkedUpdates[0].fee.networkFee).toEqual('6000000000');
   * expect(() => check(f)).toThrow( field === 'denominator' ? 'policy authority'
   * : /authority|plan asset economics|raw token map|selected tokens/, )
   */
  it.each(economicsCases7)('rejects authority drift %s', (field) => {
    const f = economicsFixture();
    if (field === 'gasBudget')
      Object.assign(f.policy, { gasBudget: '2000000000000000000' });
    if (field === 'numerator')
      Object.assign(f.policy.margin, { numerator: '2' });
    if (field === 'denominator') {
      Object.assign(f.policy.margin, { numerator: '2' });
      Object.assign(f.body.feeEvidence.policy.margin, { numerator: '2' });
      alignFee(f, '6000000000');
      expect(check(f).checkedUpdates[0].fee.networkFee).toEqual('6000000000');
      Object.assign(f.policy.margin, { denominator: '2' });
    }
    if (field === 'activationDelay')
      Object.assign(f.policy, { activationDelay: 6 });
    if (field === 'guarantee')
      Object.assign(f.policy.history.guarantees, { ergo: 21 });
    if (field === 'frontier')
      Object.assign(f.observations.frontiers, { ergo: 101 });
    if (field === 'hash')
      Object.assign(f.observations.finalized, { hash: '0x' + '02'.repeat(32) });
    if (field === 'common')
      Object.assign(f.policy.common.avax, { bridgeFee: '2' });
    if (field === 'price') Object.assign(f.observations.prices, { avax: '3' });
    if (field === 'map')
      Object.assign(f.policy.rawTokenMap[0].ergo, { decimals: 8 });
    if (field === 'selected')
      Object.assign(f.policy, { selectedTokenIds: [native] });
    expect(() => check(f)).toThrow(
      field === 'denominator'
        ? 'policy authority'
        : /authority|plan asset economics|raw token map|selected tokens/,
    );
  });
  /**
   * @target inspectAvalancheFeeEconomics — binds an independently coherent quote
   * even when its fee cap remains identical
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Supply an independently coherent quote with base fee zero and
   * priority three while retaining the original fee cap; check its publication
   * binding.
   * @expected expect(() => check(f)).toThrow('quote authority')
   */
  it('binds an independently coherent quote even when its fee cap remains identical', () => {
    const f = economicsFixture();
    Object.assign(f.observations.quote, {
      baseFeePerGas: '0',
      maxPriorityFeePerGas: '3',
    });
    expect(() => check(f)).toThrow('quote authority');
  });
  /**
   * @target inspectAvalancheFeeEconomics — binds a coherently advanced finalized
   * height and Avalanche frontier
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Advance the independent finalized height and Avalanche frontier
   * together while retaining the published observation; check economics.
   * @expected expect(() => check(f)).toThrow('finalized authority')
   */
  it('binds a coherently advanced finalized height and Avalanche frontier', () => {
    const f = economicsFixture();
    Object.assign(f.observations.finalized, { height: 101 });
    Object.assign(f.observations.frontiers, { avalanche: 101 });
    expect(() => check(f)).toThrow('finalized authority');
  });
  /**
   * @target inspectAvalancheFeeEconomics — refuses unsupported certification %s
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Convert the packet to V1, empty, or an update without the selected
   * Avalanche asset, adjusting that branch metadata; check economics.
   * @expected expect(() => check(f)).toThrow( /V2 transaction required|no
   * Avalanche update/, )
   */
  it.each(economicsCases10)('refuses unsupported certification %s', (fault) => {
    const f = economicsFixture();
    if (fault === 'V1') {
      f.body.version = 1;
      Reflect.deleteProperty(f.body, 'feeEvidence');
    }
    if (fault === 'empty') {
      f.body.kind = 'empty';
      f.body.transaction = null;
      f.body.feeEvidence.updates = [];
    }
    if (fault === 'no AV update') {
      const legacy = 'cd'.repeat(32);
      f.body.rawTokenMap.push({
        ergo: { tokenId: legacy, decimals: 9 },
      } as never);
      f.body.supportedTokens.push({
        ...f.body.supportedTokens[0],
        tokenId: legacy,
        ergoSideTokenId: legacy,
      });
      Object.assign(f.policy, {
        rawTokenMap: structuredClone(f.body.rawTokenMap),
        selectedTokenIds: ['avax', legacy],
      });
      f.body.feeEvidence.updates[0].selectedTokenId = legacy;
      f.body.feeEvidence.updates[0].ergoTokenId = native;
    }
    expect(() => check(f)).toThrow(
      /V2 transaction required|no Avalanche update/,
    );
  });
  /**
   * @target inspectAvalancheFeeEconomics — calculates two ceilings without
   * losing one wei at the significant-unit boundary
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Use a one-wei gas increment and a three-halves margin, establish
   * the double-ceiling fee positive, then decrease the fee by one.
   * @expected
   * expect(check(f).checkedUpdates[0].fee.networkFee).toEqual('4500000001');
   * expect(() => check(f)).toThrow('plan asset economics')
   */
  it('calculates two ceilings without losing one wei at the significant-unit boundary', () => {
    const f = economicsFixture();
    Object.assign(f.policy, {
      gasBudget: '1000000000000000001',
      margin: { numerator: '3', denominator: '2' },
    });
    Object.assign(f.body.feeEvidence.policy, {
      gasBudget: f.policy.gasBudget,
      margin: f.policy.margin,
    });
    alignFee(f, '4500000001');
    expect(check(f).checkedUpdates[0].fee.networkFee).toEqual('4500000001');
    alignFee(f, '4500000000');
    expect(() => check(f)).toThrow('plan asset economics');
  });
  /**
   * @target inspectAvalancheFeeEconomics — accepts the exact Sigma Long maximum
   * above safe Number precision
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Derive gas for the exact signed 64-bit fee maximum, align
   * publication evidence and real output bytes, then check economics.
   * @expected
   * expect(check(f).checkedUpdates[0].fee.networkFee).toEqual(max.toString())
   */
  it('accepts the exact Sigma Long maximum above safe Number precision', () => {
    const f = economicsFixture();
    const max = (1n << 63n) - 1n;
    const gas = ((max * 1000000000n - 2n) / 3n).toString();
    Object.assign(f.policy, { gasBudget: gas });
    f.body.feeEvidence.policy.gasBudget = gas;
    alignFee(f, max.toString());
    expect(check(f).checkedUpdates[0].fee.networkFee).toEqual(max.toString());
  });
  /**
   * @target inspectAvalancheFeeEconomics — rejects arithmetic bound %s
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Change the selected wei, fee, activation or margin bound while
   * keeping required publication evidence coherent; check economics.
   * @expected expect(() => check(f)).toThrow( /wei bound|network fee
   * bound|trusted height|margin/, )
   */
  it.each(economicsCases13)('rejects arithmetic bound %s', (fault) => {
    const f = economicsFixture();
    if (fault === 'wei overflow')
      Object.assign(f.policy, { gasBudget: ((1n << 256n) - 1n).toString() });
    if (fault === 'fee overflow') {
      const gas = ((((1n << 63n) - 1n) * 1000000000n) / 3n + 1n).toString();
      Object.assign(f.policy, { gasBudget: gas });
      f.body.feeEvidence.policy.gasBudget = gas;
    }
    if (fault === 'activation overflow')
      Object.assign(f.policy, { activationDelay: 2147483647 });
    if (fault === 'margin below one')
      Object.assign(f.policy.margin, { denominator: '2' });
    expect(() => check(f)).toThrow(
      /wei bound|network fee bound|trusted height|margin/,
    );
  });
  /**
   * @target inspectAvalancheFeeEconomics — accepts bounded activation delay %s
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Set the selected bounded activation delay, align asset and
   * candidate activation heights and rebuild the real output before checking.
   * @expected
   * expect(check(f).checkedUpdates[0].activationHeight).toEqual(activation)
   */
  it.each(economicsCases14)('accepts bounded activation delay %s', (delay) => {
    const f = economicsFixture();
    const activation = 100 + delay;
    Object.assign(f.policy, { activationDelay: delay });
    f.body.feeEvidence.policy.activationDelay = delay;
    f.body.feeEvidence.assets[0].activationHeight = activation;
    Object.assign(f.body.feeEvidence.updates[0].candidate.heights, {
      avalanche: activation,
    });
    output(f, [f.body.feeEvidence.updates[0].candidate]);
    expect(check(f).checkedUpdates[0].activationHeight).toEqual(activation);
  });
  /**
   * @target inspectAvalancheFeeEconomics — uses exact passed-height boundary for
   * %s
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Build an old row at the selected chain frontier, establish the
   * exact retained-row positive, then rebuild with the opposite retention
   * choice.
   * @expected expect(check(f).checkedUpdates).toHaveLength(1); expect(() =>
   * check(f)).toThrow('retained history')
   */
  it.each(economicsCases15)(
    'uses exact passed-height boundary for %s',
    (chain) => {
      const seed = economicsFixture();
      const row: AvalancheFeeRecord = {
        heights: { [chain]: 100 },
        configs: { [chain]: seed.old.configs[chain] },
      };
      const expected =
        chain === 'avalanche' ? [seed.candidate] : [row, seed.candidate];
      const f = economicsFixture({
        existing: true,
        inputRows: [row],
        outputRows: expected,
      });
      expect(check(f).checkedUpdates).toHaveLength(1);
      output(
        f,
        chain === 'avalanche' ? [row, f.candidate] : [f.candidate],
        true,
      );
      expect(() => check(f)).toThrow('retained history');
    },
  );
  /**
   * @target inspectAvalancheFeeEconomics — retains guarantee equality and first
   * safe row, but drops older and future rows
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Build rows around the guarantee and frontier boundaries, establish
   * the expected retained slice, then remove its first safe row.
   * @expected expect(check(f).checkedUpdates).toHaveLength(1); expect(() =>
   * check(f)).toThrow('retained history')
   */
  it('retains guarantee equality and first safe row, but drops older and future rows', () => {
    const seed = economicsFixture();
    const rows = [60, 79, 80, 90, 100].map((h) => ({
      heights: { avalanche: h },
      configs: {
        avalanche: { ...seed.old.configs.avalanche, networkFee: String(h) },
      },
    }));
    const expected = [...rows.slice(1, 4), seed.candidate];
    const f = economicsFixture({
      existing: true,
      inputRows: rows,
      outputRows: expected,
    });
    expect(check(f).checkedUpdates).toHaveLength(1);
    output(f, [...rows.slice(2, 4), seed.candidate], true);
    expect(() => check(f)).toThrow('retained history');
  });
  /**
   * @target inspectAvalancheFeeEconomics — prunes globally inactive chains but
   * preserves active height-only candidate markers
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Include an inactive Bitcoin chain and an active Ergo height-only
   * candidate; rebuild globally pruned output rows and compare retained markers.
   * @expected expect(check(f).checkedUpdates).toHaveLength(1); expect(
   * inspectAvalancheFeeStructure(seal(f.body), f.policy.contract).feeOutputs[0]
   * .fees[1].heights.ergo, ).toEqual(105)
   */
  it('prunes globally inactive chains but preserves active height-only candidate markers', () => {
    const seed = economicsFixture();
    const old = {
      heights: { avalanche: 90, ergo: 90, bitcoin: 90 },
      configs: { ...seed.old.configs },
    };
    const candidate = structuredClone(seed.candidate);
    Reflect.deleteProperty(candidate.configs, 'ergo');
    Object.assign(candidate.heights, { bitcoin: 105 });
    const prunedOld = structuredClone(old);
    Reflect.deleteProperty(prunedOld.heights, 'bitcoin');
    const prunedCandidate = structuredClone(candidate);
    Reflect.deleteProperty(prunedCandidate.heights, 'bitcoin');
    const f = economicsFixture({
      existing: true,
      inputRows: [old],
      outputRows: [prunedOld, prunedCandidate],
    });
    Object.assign(f.policy.history, {
      chains: ['avalanche', 'ergo', 'bitcoin'],
      guarantees: { avalanche: 20, ergo: 20, bitcoin: 20 },
    });
    Object.assign(f.observations.frontiers, { bitcoin: 100 });
    Object.assign(f.body.feeEvidence.history, {
      chains: [...f.policy.history.chains],
      guarantees: { ...f.policy.history.guarantees },
      frontiers: { ...f.observations.frontiers },
    });
    f.body.feeEvidence.updates[0].candidate = candidate;
    expect(check(f).checkedUpdates).toHaveLength(1);
    expect(
      inspectAvalancheFeeStructure(seal(f.body), f.policy.contract)
        .feeOutputs[0].fees[1].heights.ergo,
    ).toEqual(105);
  });
  /**
   * @target inspectAvalancheFeeEconomics — rejects history fault %s
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Mutate the selected history chain, row count or old fee,
   * rebuilding actual outputs when required; check economics.
   * @expected expect(() => check(f)).toThrow(/history chain|retained history/)
   */
  it.each(economicsCases18)('rejects history fault %s', (fault) => {
    const seed = economicsFixture();
    const old = structuredClone(seed.old),
      candidate = structuredClone(seed.candidate);
    if (fault === 'unknown input chain') {
      Object.assign(old.heights, { bitcoin: 90 });
      Object.assign(old.configs, { bitcoin: old.configs.ergo });
      Object.assign(candidate.heights, { bitcoin: 105 });
    }
    const f = economicsFixture({
      existing: true,
      inputRows: [old],
      outputRows: [old, candidate],
    });
    if (fault === 'unknown candidate chain')
      Object.assign(f.body.feeEvidence.updates[0].candidate.heights, {
        bitcoin: 105,
      });
    if (fault === 'extra output history')
      output(f, [old, old, candidate], true);
    if (fault === 'changed old networkFee') {
      Object.assign(old.configs.avalanche, { networkFee: '2' });
      output(f, [old, candidate], true);
    }
    expect(() => check(f)).toThrow(/history chain|retained history/);
  });
  /**
   * @target inspectAvalancheFeeEconomics — rejects paired candidate common
   * tampering %s
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Change the selected common field across candidate chains, restore
   * the Avalanche candidate field only and check independent common authority.
   * @expected expect(() => check(f)).toThrow('candidate common authority')
   */
  it.each(economicsCases19)(
    'rejects paired candidate common tampering %s',
    (field) => {
      const f = economicsFixture();
      for (const config of Object.values(
        f.body.feeEvidence.updates[0].candidate.configs,
      ))
        Object.assign(config, { [field]: '999' });
      // Keep the AV candidate correct: changing only the non-AV common field still fails.
      Object.assign(
        f.body.feeEvidence.updates[0].candidate.configs.avalanche,
        f.candidate.configs.avalanche,
      );
      expect(() => check(f)).toThrow('candidate common authority');
    },
  );
  /**
   * @target inspectAvalancheFeeEconomics — cannot mask Avalanche output through
   * %s metadata
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Remove the selected asset or update metadata, or replace the
   * output alias; check that actual Avalanche output remains accountable.
   * @expected expect(() => check(f)).toThrow()
   */
  it.each(economicsCases20)(
    'cannot mask Avalanche output through %s metadata',
    (fault) => {
      const f = economicsFixture();
      if (fault === 'asset') f.body.feeEvidence.assets.splice(0);
      if (fault === 'update') f.body.feeEvidence.updates.splice(0);
      if (fault === 'output alias')
        f.body.feeEvidence.updates[0].ergoTokenId = 'cd'.repeat(32);
      expect(() => check(f)).toThrow();
    },
  );
  /**
   * @target inspectAvalancheFeeEconomics — compares rational prices by value
   * rather than decimal spelling
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Supply mathematically equal prices using exponent and decimal
   * spellings; check the resulting update count.
   * @expected expect(check(f).checkedUpdates).toHaveLength(1)
   */
  it('compares rational prices by value rather than decimal spelling', () => {
    const f = economicsFixture();
    Object.assign(f.observations.prices, {
      avax: '20e-1',
      tokens: { avax: '2.00' },
    });
    expect(check(f).checkedUpdates).toHaveLength(1);
  });
  /**
   * @target inspectAvalancheFeeEconomics — rejects independent common authority
   * even when changed nonAV candidate and output agree
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Change a non-Avalanche common field in candidate evidence and
   * matching real output bytes while retaining the independent common policy;
   * check economics.
   * @expected expect( inspectAvalancheFeeStructure(seal(f.body),
   * f.policy.contract).feeOutputs, ).toHaveLength(1); expect(() =>
   * check(f)).toThrow('candidate common authority')
   */
  it('rejects independent common authority even when changed nonAV candidate and output agree', () => {
    const f = economicsFixture();
    Object.assign(f.body.feeEvidence.updates[0].candidate.configs.ergo, {
      bridgeFee: '2',
    });
    output(f, [f.body.feeEvidence.updates[0].candidate]);
    expect(
      inspectAvalancheFeeStructure(seal(f.body), f.policy.contract).feeOutputs,
    ).toHaveLength(1);
    expect(() => check(f)).toThrow('candidate common authority');
  });
  /**
   * @target inspectAvalancheFeeEconomics — rejects independently admitted but
   * invalid token mapping %s
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Mutate the selected mapping decimals, duplicate native mapping,
   * Ergo precision or alias collision; copy the altered map into independent
   * policy and check economics.
   * @expected expect(() => check(f)).toThrow(/native mapping|Ergo mapping|map
   * alias/)
   */
  it.each(economicsCases23)(
    'rejects independently admitted but invalid token mapping %s',
    (fault) => {
      const f = economicsFixture();
      if (fault === 'native decimals')
        f.body.rawTokenMap[0].avalanche.decimals = 17;
      if (fault === 'native type')
        f.body.rawTokenMap[0].avalanche.type = 'ERC-20';
      if (fault === 'native residency')
        f.body.rawTokenMap[0].avalanche.residency = 'wrapped';
      if (fault === 'native Ergo decimals')
        f.body.rawTokenMap[0].ergo.decimals = 19;
      if (fault === 'alias collision') {
        Object.assign(f.body.rawTokenMap[0], {
          bitcoin: { tokenId: 'collision', decimals: 8 },
        });
        f.body.rawTokenMap.push({
          ergo: { tokenId: 'collision', decimals: 8 },
        } as never);
      }
      Object.assign(f.policy, {
        rawTokenMap: structuredClone(f.body.rawTokenMap),
      });
      expect(() => check(f)).toThrow(/native mapping|Ergo mapping|map alias/);
    },
  );
  /**
   * @target inspectAvalancheFeeEconomics — rejects isolated trusted contract
   * fault %s
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Change only the selected trusted fee, divisor, bound, key set,
   * guarantee, frontier, duplicate, chain or combined capture-size field; check
   * economics.
   * @expected expect(() => check(f)).toThrow(/trusted|chain\/frontier|frontier/)
   */
  it.each(economicsCases24)(
    'rejects isolated trusted contract fault %s',
    (fault) => {
      const f = economicsFixture();
      if (fault === 'zero ratio')
        Object.assign(f.policy.common.avax, { rsnRatio: '0' });
      if (fault === 'zero divisor')
        Object.assign(f.policy.common.avax, { rsnRatioDivisor: '0' });
      if (fault === 'Long overflow')
        Object.assign(f.policy.common.avax, {
          bridgeFee: (1n << 63n).toString(),
        });
      if (fault === 'negative fee')
        Object.assign(f.policy.common.avax, { feeRatio: '-1' });
      if (fault === 'common unknown')
        Object.assign(f.policy.common.avax, { unknown: '1' });
      if (fault === 'price missing')
        Reflect.deleteProperty(f.observations.prices.tokens, 'avax');
      if (fault === 'price extra')
        Object.assign(f.observations.prices.tokens, { unused: '2' });
      if (fault === 'guarantee zero')
        Object.assign(f.policy.history.guarantees, { avalanche: 0 });
      if (fault === 'frontier zero')
        Object.assign(f.observations.frontiers, { ergo: 0 });
      if (fault === 'duplicate selected')
        Object.assign(f.policy, { selectedTokenIds: ['avax', 'avax'] });
      if (fault === 'duplicate chains')
        Object.assign(f.policy.history, { chains: ['avalanche', 'avalanche'] });
      if (fault === 'chain mismatch')
        Object.assign(f.observations.quote, { chainId: 43114 });
      if (fault === 'frontier height')
        Object.assign(f.observations.frontiers, { avalanche: 99 });
      if (fault === 'combined byte cap') {
        Object.assign(f.policy, { extra: 'x'.repeat(4_000_000) });
        Object.assign(f.observations, { extra: 'x'.repeat(4_000_000) });
      }
      expect(() => check(f)).toThrow(/trusted|chain\/frontier|frontier/);
    },
  );
  /**
   * @target inspectAvalancheFeeEconomics — accepts valid unused publication
   * prices without certifying them
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Add a valid unused publication price while keeping selected
   * independent observations unchanged; check the selected update count.
   * @expected expect(check(f).checkedUpdates).toHaveLength(1)
   */
  it('accepts valid unused publication prices without certifying them', () => {
    const f = economicsFixture();
    Object.assign(f.body.avalancheDecimalPrices.tokens, { unused: '3.5' });
    expect(check(f).checkedUpdates).toHaveLength(1);
  });
  /**
   * @target inspectAvalancheFeeEconomics — rejects resealed selected metadata
   * decimals inconsistent with trusted mapping
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Change only the selected published asset decimal metadata before
   * resealing and checking economics.
   * @expected expect(() => check(f)).toThrow('asset metadata')
   */
  it('rejects resealed selected metadata decimals inconsistent with trusted mapping', () => {
    const f = economicsFixture();
    f.body.supportedTokens[0].decimals = 8;
    expect(() => check(f)).toThrow('asset metadata');
  });
  /**
   * @target inspectAvalancheFeeEconomics — rejects malformed gas %s
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Supply the selected zero, negative, noncanonical, fractional,
   * exponent, whitespace or oversized gas string; check exact integer parsing.
   * @expected expect(() => check(f)).toThrow(/trusted integer/)
   */
  it.each(economicsCases27)('rejects malformed gas %s', (value) => {
    const f = economicsFixture();
    Object.assign(f.policy, { gasBudget: value });
    expect(() => check(f)).toThrow(/trusted integer/);
  });
  /**
   * @target inspectAvalancheFeeEconomics — rejects malformed exact price %s
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Supply the selected malformed exact price string, including the
   * literal newline case; check price parsing.
   * @expected expect(() => check(f)).toThrow('price')
   */
  it.each(economicsCases28)('rejects malformed exact price %s', (value) => {
    const f = economicsFixture();
    Object.assign(f.observations.prices, { avax: value });
    expect(() => check(f)).toThrow('price');
  });
  /**
   * @target inspectAvalancheFeeEconomics — rejects malformed trusted capture %s
   * without invoking accessors
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Apply the selected accessor, symbol, hidden field,
   * sparse/inherited array, size, unknown-key or depth fault to trusted input;
   * check rejection and that the getter remains uncalled.
   * @expected expect(() => check(f)).toThrow('trusted');
   * expect(getter).not.toHaveBeenCalled()
   */
  it.each(economicsCases29)(
    'rejects malformed trusted capture %s without invoking accessors',
    (fault) => {
      const f = economicsFixture();
      const getter = vi.fn(() => '1');
      if (fault === 'getter')
        Object.defineProperty(f.policy, 'gasBudget', {
          get: getter,
          enumerable: true,
        });
      if (fault === 'symbol') Object.assign(f.policy, { [Symbol('x')]: 'x' });
      if (fault === 'hidden')
        Object.defineProperty(f.policy, 'x', { value: 1 });
      if (fault === 'sparse')
        Object.assign(f.policy, { selectedTokenIds: Array(1) });
      if (fault === 'inherited') {
        const a = Array(1);
        const proto = Object.create(Array.prototype);
        proto[0] = 'avax';
        Object.setPrototypeOf(a, proto);
        Object.assign(f.policy, { selectedTokenIds: a });
      }
      if (fault === 'oversize')
        Object.assign(f.policy, { selectedTokenIds: Array(4097).fill('avax') });
      if (fault === 'unknown') Object.assign(f.policy.margin, { extra: 1 });
      if (fault === 'deep') {
        let deep: unknown = 1;
        for (let i = 0; i < 18; i++) deep = { deep };
        Object.assign(f.policy, { deep });
      }
      expect(() => check(f)).toThrow('trusted');
      expect(getter).not.toHaveBeenCalled();
    },
  );
});
