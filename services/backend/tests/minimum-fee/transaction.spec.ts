import { state } from '../mocked/avalancheFeeConstruction.mock';
import {
  constructionCases2,
  constructionCases3,
  constructionCases4,
  constructionCases5,
  constructionCases10,
} from '../testData/avalancheFeeConstruction';
import { deps, feePolicy, setup } from '../testUtils/avalancheFeeConstruction';

describe('updateConfigsTransaction', () => {
  /**
   * @target updateConfigsTransaction constructs real WASM EIP19 with real box selection and preserves caller fee builder bytes
   * @dependencies Real minimum-fee 3.1.2 models, updateConfig and construction sources, WASM and box selection; injected token/config readers, economic plan and Ergo network reads.
   * @scenario Generate and update authentic fee candidates, snapshot candidate and current-box bytes, construct and parse the reduced transaction, check ordered network reads, then retry the consumed update.
   * @expected Returns a parseable, immutable bound transaction and preserves producer bytes.
   */
  it('constructs real WASM EIP19 with real box selection and preserves caller fee builder bytes', async () => {
    const { api, updated, updateConfigsTransaction } = await setup();
    const row = updated.get('avax')!;
    const before = api.avalancheCandidateBytes(row.new.build()),
      old = api.avalancheBoxBytes(row.current.getBox()!);
    const tx = await updateConfigsTransaction(updated);
    expect(api.avalancheCandidateBytes(row.new.build())).toEqual(before);
    expect(api.avalancheBoxBytes(row.current.getBox()!)).toEqual(old);
    expect(tx.sender).toEqual(feePolicy().feeAddress);
    expect(tx.inputs).toHaveLength(2);
    expect(tx.inputs[0]).toEqual(old);
    const parsed = deps.wasm.ReducedTransaction.sigma_parse_bytes(
      Buffer.from(tx.reducedTx, 'base64'),
    );
    expect(
      Buffer.from(parsed.sigma_serialize_bytes()).toString('base64'),
    ).toEqual(tx.reducedTx);
    expect(Object.isFrozen(tx)).toEqual(true);
    expect(Object.isFrozen(tx.inputs)).toEqual(true);
    expect(() => api.assertAvalancheFeeTransaction(tx)).not.toThrow();
    expect(state.calls).toEqual(['address', 'cover', 'height', 'context']);
    await expect(updateConfigsTransaction(updated)).rejects.toThrow('consumed');
  });
  /**
   * @target updateConfigsTransaction rejects %s before network reads
   * @dependencies Real minimum-fee 3.1.2 models, updateConfig and construction sources, WASM and box selection; injected token/config readers, economic plan and Ergo network reads.
   * @scenario Generate an authentic update map, apply only the documented binding, candidate, current-box, policy, token-map or generation fault, then attempt construction and inspect the empty network-read log.
   * @expected Rejects the single changed binding before any network read.
   */
  it.each(constructionCases2)(
    'rejects %s before network reads',
    async (fault) => {
      const { api, updated, updateConfigsTransaction } = await setup();
      let supplied = updated;
      const row = updated.get('avax')!;
      if (fault === 'detach') supplied = new Map(updated);
      if (fault === 'replace') updated.set('avax', { ...row });
      if (fault === 'empty') updated.clear();
      if (fault === 'new fees')
        row.new.getConfigs()[0].configs.avalanche.networkFee += 1n;
      if (fault === 'new value') row.new.setValue(2000000n);
      if (fault === 'new height') row.new.setHeight(101);
      if (fault === 'new token') row.new.setToken('34'.repeat(32));
      if (fault === 'current box')
        vi.spyOn(row.current, 'getBox').mockReturnValue(
          state.funding[0] as never,
        );
      if (fault === 'policy') feePolicy().txFee = 2000000n;
      if (fault === 'token map')
        Reflect.set(
          Reflect.get(state.source as object, 'rawMap')[0].avalanche,
          'decimals',
          17,
        );
      if (fault === 'superseded')
        api.beginAvalancheFeeGeneration(() => state.source as never);
      await expect(updateConfigsTransaction(supplied)).rejects.toThrow();
      expect(state.calls).toEqual([]);
    },
  );
  /**
   * @target updateConfigsTransaction rejects delayed policy mutation at %s
   * @dependencies Real minimum-fee 3.1.2 models, updateConfig and construction sources, WASM and box selection; injected token/config readers, economic plan and Ergo network reads.
   * @scenario Generate authentic updates and change only feeAddress while the selected address-box, covering-box, height or context read is awaiting its hook; resume construction and inspect the policy-change rejection.
   * @expected Rejects a changed policy after the selected asynchronous boundary.
   */
  it.each(constructionCases3)(
    'rejects delayed policy mutation at %s',
    async (phase) => {
      const { updated, updateConfigsTransaction } = await setup();
      state.hook = async (at) => {
        if (at === phase) feePolicy().feeAddress = 'bad';
      };
      await expect(updateConfigsTransaction(updated)).rejects.toThrow(
        'policy changed',
      );
    },
  );
  /**
   * @target updateConfigsTransaction rejects delayed new fee mutation at %s
   * @dependencies Real minimum-fee 3.1.2 models, updateConfig and construction sources, WASM and box selection; injected token/config readers, economic plan and Ergo network reads.
   * @scenario Generate authentic updates and increment only the candidate Avalanche networkFee while the selected address-box, covering-box, height or context read awaits its hook; resume construction and inspect the entry-change rejection.
   * @expected Rejects a changed candidate fee after the selected asynchronous boundary.
   */
  it.each(constructionCases4)(
    'rejects delayed new fee mutation at %s',
    async (phase) => {
      const { updated, updateConfigsTransaction } = await setup();
      state.hook = async (at) => {
        if (at === phase)
          updated
            .get('avax')!
            .new.getConfigs()[0].configs.avalanche.networkFee += 1n;
      };
      await expect(updateConfigsTransaction(updated)).rejects.toThrow(
        'entry changed',
      );
    },
  );
  /**
   * @target updateConfigsTransaction rejects delayed old input mutation at %s
   * @dependencies Real minimum-fee 3.1.2 models, updateConfig and construction sources, WASM and box selection; injected token/config readers, economic plan and Ergo network reads.
   * @scenario Generate authentic updates and replace only the current fee-box getter with the funding box during the selected address-box, covering-box, height or context hook; resume construction and inspect the entry-change rejection.
   * @expected Rejects a changed current input after the selected asynchronous boundary.
   */
  it.each(constructionCases5)(
    'rejects delayed old input mutation at %s',
    async (phase) => {
      const { updated, updateConfigsTransaction } = await setup();
      state.hook = async (at) => {
        if (at === phase)
          vi.spyOn(updated.get('avax')!.current, 'getBox').mockReturnValue(
            state.funding[0] as never,
          );
      };
      await expect(updateConfigsTransaction(updated)).rejects.toThrow(
        'entry changed',
      );
    },
  );
  /**
   * @target updateConfigsTransaction rejects delayed %s authority at final context
   * @dependencies Real minimum-fee 3.1.2 models, updateConfig and construction sources, WASM and box selection; injected token/config readers, economic plan and Ergo network reads.
   * @scenario Generate authentic updates, then during the final context hook either start a newer generation or mutate only the raw Ergo decimal mapping; resume construction and check rejection.
   * @expected Rejects stale generation or token-map authority after context retrieval.
   */
  it.each(constructionCases10)(
    'rejects delayed %s authority at final context',
    async (fault) => {
      const { updated, api, updateConfigsTransaction } = await setup();
      state.hook = async (at) => {
        if (at === 'context') {
          if (fault === 'superseded')
            api.beginAvalancheFeeGeneration(() => state.source as never);
          else
            Reflect.get(state.source as object, 'rawMap')[0].ergo.decimals = 8;
        }
      };
      await expect(updateConfigsTransaction(updated)).rejects.toThrow();
    },
  );
  /**
   * @target updateConfigsTransaction rejects disabled detached construction containing old Avalanche history
   * @dependencies Real minimum-fee 3.1.2 models, updateConfig and construction sources, WASM and box selection; injected token/config readers, economic plan and Ergo network reads.
   * @scenario Generate authentic updates, disable Avalanche, remove Avalanche fields only from the new candidate, detach the map while retaining current-box Avalanche history, and attempt construction.
   * @expected Rejects detached disabled updates that retain Avalanche history.
   */
  it('rejects disabled detached construction containing old Avalanche history', async () => {
    const { updated, updateConfigsTransaction } = await setup();
    state.raw = { enabled: false };
    const row = updated.get('avax')!;
    row.new.getConfigs().forEach((fee) => {
      delete fee.heights.avalanche;
      delete fee.configs.avalanche;
    });
    await expect(updateConfigsTransaction(new Map(updated))).rejects.toThrow(
      'binding',
    );
    expect(state.calls).toEqual([]);
  });
  /**
   * @target updateConfigsTransaction preserves disabled legacy construction with actual WASM output
   * @dependencies Real minimum-fee 3.1.2 models, updateConfig and construction sources, WASM and box selection; injected token/config readers, economic plan and Ergo network reads.
   * @scenario Generate authentic updates, disable Avalanche, remove Avalanche fields from the new candidate and current config history, then construct and parse the legacy reduced transaction identifier.
   * @expected Preserves parseable legacy transaction construction while disabled.
   */
  it('preserves disabled legacy construction with actual WASM output', async () => {
    const { updated, updateConfigsTransaction } = await setup();
    state.raw = { enabled: false };
    const row = updated.get('avax')!;
    row.new.getConfigs().forEach((fee) => {
      delete fee.heights.avalanche;
      delete fee.configs.avalanche;
    });
    vi.spyOn(row.current, 'getConfigs').mockReturnValue([]);
    const tx = await updateConfigsTransaction(new Map(updated));
    expect(
      deps.wasm.ReducedTransaction.sigma_parse_bytes(
        Buffer.from(tx.reducedTx, 'base64'),
      )
        .unsigned_tx()
        .id()
        .to_str(),
    ).toMatch(/^[0-9a-f]{64}$/);
  });
});
