import { state } from '../mocked/avalancheFeeConstruction.mock';
import {
  feePolicy,
  setup,
  direct,
  constructionCases8,
} from '../testUtils/avalancheFeeConstruction';

describe('generateTransaction', () => {
  /**
   * @target generateTransaction rejects a forged construction permit and the raw enabled generator path
   * @dependencies Real minimum-fee 3.1.2 models, updateConfig and construction sources, WASM and box selection; injected token/config readers, economic plan and Ergo network reads.
   * @scenario Initialize enabled construction, call the actual generator without a permit, then with an unregistered policy/entries/assertFresh object, and inspect the empty network-read log.
   * @expected Rejects missing or forged construction authority without network reads.
   */
  it('rejects a forged construction permit and the raw enabled generator path', async () => {
    await setup();
    const { generateTransaction } = await import(
      '../../src/transaction/generate'
    );
    await expect(generateTransaction([], [])).rejects.toThrow('bound permit');
    await expect(
      generateTransaction([], [], {
        policy: feePolicy(),
        entries: [],
        assertFresh: () => undefined,
      }),
    ).rejects.toThrow('Invalid');
    expect(state.calls).toEqual([]);
  });
  /**
   * @target generateTransaction rejects caller $field mutation during $phase
   * @dependencies Real minimum-fee 3.1.2 models, updateConfig and construction sources, WASM and box selection; injected token/config readers, economic plan and Ergo network reads.
   * @scenario Consume an authentic permit and derive its actual order and input boxes; during each generated phase/field pair change only the NFT asset value, output candidate value or caller input array, then resume the generator.
   * @expected Rejects each caller-owned input change after the selected asynchronous boundary.
   */
  it.each(constructionCases8)(
    'rejects caller $field mutation during $phase',
    async ({ phase, field }) => {
      const { permit, order, inputs, generateTransaction, api } =
        await direct();
      state.hook = async (at) => {
        if (at !== phase) return;
        if (field === 'assets') order[0].assets.tokens[0].value = 2n;
        if (field === 'output')
          order[0].box = api.cloneAvalancheCandidate(
            permit.entries[0].candidate,
            2000000n,
          );
        if (field === 'inputs') inputs.push(state.funding[0] as never);
      };
      await expect(generateTransaction(order, inputs, permit)).rejects.toThrow(
        'construction inputs changed',
      );
    },
  );
  /**
   * @target generateTransaction consumes an authentic permit only once and owns input arrays
   * @dependencies Real minimum-fee 3.1.2 models, updateConfig and construction sources, WASM and box selection; injected token/config readers, economic plan and Ergo network reads.
   * @scenario Derive order and input boxes from an authentic permit, snapshot caller input bytes, generate the transaction, compare caller and returned inputs, then reuse the same permit.
   * @expected Preserves caller arrays and rejects permit reuse.
   */
  it('consumes an authentic permit only once and owns input arrays', async () => {
    const { permit, order, inputs, generateTransaction, api } = await direct();
    const before = inputs.map(api.avalancheBoxBytes);
    const tx = await generateTransaction(order, inputs, permit);
    expect(inputs.map(api.avalancheBoxBytes)).toEqual(before);
    expect(tx.inputs).toEqual([
      ...before,
      api.avalancheBoxBytes(state.funding[0] as never),
    ]);
    await expect(generateTransaction(order, inputs, permit)).rejects.toThrow(
      'reused',
    );
  });
});
