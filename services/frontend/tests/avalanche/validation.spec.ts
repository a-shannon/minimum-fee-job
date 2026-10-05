import { inspectAvalancheFeeStructure } from '../../src/avalanche/validation';
import {
  structureCases9,
  structureCases10,
  structureCases11,
  structureCases13,
} from '../testData/avalancheStructure';
import { body, native, seal } from '../testUtils/avalanchePublicationFixture';
import { setupStructure } from '../testUtils/avalancheStructure';

vi.mock('@rosen-bridge/minimum-fee', async () => {
  const { pinnedFeeDependencies } = await import(
    '../../../backend/tests/fixtures/pinnedFeeDependencies'
  );
  return pinnedFeeDependencies().fees;
});
describe('inspectAvalancheFeeStructure', () => {
  let f: ReturnType<typeof setupStructure>;
  beforeEach(() => {
    f = setupStructure();
  });
  /**
   * @target inspectAvalancheFeeStructure — real WASM preserves original output
   * indices and exact Long values with real3.1.2 roundtrip
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Build and reduce a real fee transaction; inspect its publication
   * with the configured contract and compare output indices, transaction
   * identity and exact Long values.
   * @expected expect(result.scope).toEqual('transaction-structure-only');
   * expect(result.publicationId).toEqual(input.publication.publicationId);
   * expect(result.transactionId).toEqual(input.unsigned.id().to_str());
   * expect(result.feeInputs[0].index).toEqual(1);
   * expect(result.feeOutputs[0].index).toEqual(1);
   * expect(result.feeOutputs[0].tokenId).toEqual(native);
   * expect(result.feeOutputs[0].fees[0].configs.avalanche.networkFee).toEqual(
   * '9007199254740993', );
   * expect(Object.isFrozen(result.feeOutputs[0].fees[0].configs.avalanche)).toEqual(
   * true, ); expect(result).not.toHaveProperty('eligibleForSigning');
   * expect(result).not.toHaveProperty('isValid')
   */
  it('real WASM preserves original output indices and exact Long values with real3.1.2 roundtrip', () => {
    const input = f.build();
    const result = inspectAvalancheFeeStructure(input.publication, f.contract);
    expect(result.scope).toEqual('transaction-structure-only');
    expect(result.publicationId).toEqual(input.publication.publicationId);
    expect(result.transactionId).toEqual(input.unsigned.id().to_str());
    expect(result.feeInputs[0].index).toEqual(1);
    expect(result.feeOutputs[0].index).toEqual(1);
    expect(result.feeOutputs[0].tokenId).toEqual(native);
    expect(result.feeOutputs[0].fees[0].configs.avalanche.networkFee).toEqual(
      '9007199254740993',
    );
    expect(
      Object.isFrozen(result.feeOutputs[0].fees[0].configs.avalanche),
    ).toEqual(true);
    expect(result).not.toHaveProperty('eligibleForSigning');
    expect(result).not.toHaveProperty('isValid');
  });
  /**
   * @target inspectAvalancheFeeStructure — empty publication remains an explicit
   * structural empty result
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Seal an empty publication and inspect it with the explicit
   * contract.
   * @expected expect(inspectAvalancheFeeStructure(seal(body()),
   * f.contract)).toMatchObject({ scope: 'transaction-structure-only', kind:
   * 'empty', transactionId: null, feeInputs: [], feeOutputs: [], })
   */
  it('empty publication remains an explicit structural empty result', () => {
    expect(
      inspectAvalancheFeeStructure(seal(body()), f.contract),
    ).toMatchObject({
      scope: 'transaction-structure-only',
      kind: 'empty',
      transactionId: null,
      feeInputs: [],
      feeOutputs: [],
    });
  });
  /**
   * @target inspectAvalancheFeeStructure — allows new fee output without
   * pretending an old fee box exists
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Build a fee output using funding-only inputs and inspect it for
   * new-output structure.
   * @expected expect(result.feeInputs).toEqual([]);
   * expect(result.feeOutputs).toHaveLength(1)
   */
  it('allows new fee output without pretending an old fee box exists', () => {
    const result = inspectAvalancheFeeStructure(
      f.build(undefined, [f.funding]).publication,
      f.contract,
    );
    expect(result.feeInputs).toEqual([]);
    expect(result.feeOutputs).toHaveLength(1);
  });
  /**
   * @target inspectAvalancheFeeStructure — rejects wrong Sigma type in %s
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Replace only the selected R4 through R9 value with an i32 Sigma
   * constant; rebuild the output and inspect its structure.
   * @expected expect(() => inspectAvalancheFeeStructure(
   * f.build([f.candidateFromBox(box)]).publication, f.contract, ), ).toThrow()
   */
  it.each(structureCases9)('rejects wrong Sigma type in %s', (register) => {
    const box = f.mutateBox(f.feeCandidate(), (json) => {
      (json.additionalRegisters as Record<string, string>)[register] =
        f.wasm.Constant.from_i32(1).encode_to_base16();
    });
    expect(() =>
      inspectAvalancheFeeStructure(
        f.build([f.candidateFromBox(box)]).publication,
        f.contract,
      ),
    ).toThrow();
  });
  /**
   * @target inspectAvalancheFeeStructure — rejects missing R9 from %s fee box
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Remove R9 from the selected consumed or produced fee box, rebuild
   * the transaction and inspect it.
   * @expected expect(() => inspectAvalancheFeeStructure(p.publication,
   * f.contract), ).toThrow()
   */
  it.each(structureCases10)('rejects missing R9 from %s fee box', (side) => {
    const box = f.mutateBox(f.feeCandidate(), (json) => {
      delete (json.additionalRegisters as Record<string, string>).R9;
    });
    const p =
      side === 'output'
        ? f.build([f.candidateFromBox(box)])
        : f.build(undefined, [f.funding, box]);
    expect(() =>
      inspectAvalancheFeeStructure(p.publication, f.contract),
    ).toThrow();
  });
  /**
   * @target inspectAvalancheFeeStructure — rejects lossy or invalid registers:
   * %s
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Mutate the selected register chain, row, column, sentinel, sign,
   * divisor or height; rebuild canonical transaction bytes and inspect them.
   * @expected expect(() => inspectAvalancheFeeStructure(
   * f.build([f.candidateFromBox(box)]).publication, f.contract, ), ).toThrow()
   */
  it.each(structureCases11)(
    'rejects lossy or invalid registers: %s',
    (fault) => {
      const box = f.mutateBox(f.feeCandidate(), (json) => {
        const regs = json.additionalRegisters as Record<string, string>;
        if (fault === 'duplicate chains')
          regs.R4 = f.wasm.Constant.from_coll_coll_byte([
            Buffer.from('avalanche'),
            Buffer.from('avalanche'),
          ]).encode_to_base16();
        if (fault === 'invalid chain')
          regs.R4 = f.wasm.Constant.from_coll_coll_byte([
            Buffer.from('AVALANCHE'),
            Buffer.from('ergo'),
          ]).encode_to_base16();
        if (fault === 'extra column')
          regs.R7 = f.wasm.Constant.from_js([
            ['9007199254740993', '9007199254740993', '99'],
          ]).encode_to_base16();
        if (fault === 'extra row')
          regs.R7 = f.wasm.Constant.from_js([
            ['9007199254740993', '9007199254740993'],
            ['1', '1'],
          ]).encode_to_base16();
        if (fault === 'sentinel')
          regs.R6 = f.wasm.Constant.from_js([['-1', '1']]).encode_to_base16();
        if (fault === 'negative fee')
          regs.R7 = f.wasm.Constant.from_js([['-2', '1']]).encode_to_base16();
        if (fault === 'zero divisor')
          regs.R8 = f.wasm.Constant.from_js([
            [
              ['2', '0'],
              ['2', '1000'],
            ],
          ]).encode_to_base16();
        if (fault === 'negative height')
          regs.R5 = f.wasm.Constant.from_js([[-2, 105]]).encode_to_base16();
      });
      expect(() =>
        inspectAvalancheFeeStructure(
          f.build([f.candidateFromBox(box)]).publication,
          f.contract,
        ),
      ).toThrow();
    },
  );
  /**
   * @target inspectAvalancheFeeStructure — input registers are checked even when
   * output is valid
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Build a transaction with a valid output but an input containing a
   * zero divisor in R8; inspect both sides.
   * @expected expect(() => inspectAvalancheFeeStructure( f.build(undefined,
   * [f.funding, bad]).publication, f.contract, ), ).toThrow('Sigma Long')
   */
  it('input registers are checked even when output is valid', () => {
    const bad = f.mutateBox(f.feeCandidate(), (json) => {
      (json.additionalRegisters as Record<string, string>).R8 =
        f.wasm.Constant.from_js([
          [
            ['2', '0'],
            ['2', '1000'],
          ],
        ]).encode_to_base16();
    });
    expect(() =>
      inspectAvalancheFeeStructure(
        f.build(undefined, [f.funding, bad]).publication,
        f.contract,
      ),
    ).toThrow('Sigma Long');
  });
  /**
   * @target inspectAvalancheFeeStructure — rejects an isolated negative Long %s
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Set only the selected fee field to negative two, build the real
   * fee registers and inspect the output.
   * @expected expect(() => inspectAvalancheFeeStructure(
   * f.build([registers]).publication, f.contract, ), ).toThrow('Sigma Long')
   */
  it.each(structureCases13)('rejects an isolated negative Long %s', (field) => {
    const config = {
      ...f.fees[0],
      configs: {
        ...f.fees[0].configs,
        avalanche: { ...f.fees[0].configs.avalanche, [field]: -2n },
      },
    };
    const registers = f.feeCandidate([config]);
    expect(() =>
      inspectAvalancheFeeStructure(
        f.build([registers]).publication,
        f.contract,
      ),
    ).toThrow('Sigma Long');
  });
  /**
   * @target inspectAvalancheFeeStructure — accepts canonical absent-chain config
   * sentinels without inventing a fee
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Write canonical absent-chain sentinels into R6 through R9; inspect
   * the retained height and absent configuration.
   * @expected
   * expect(result.feeOutputs[0].fees[0].heights.avalanche).toEqual(105);
   * expect(result.feeOutputs[0].fees[0].configs).not.toHaveProperty('avalanche')
   */
  it('accepts canonical absent-chain config sentinels without inventing a fee', () => {
    const box = f.mutateBox(f.feeCandidate(), (json) => {
      const r = json.additionalRegisters as Record<string, string>;
      for (const name of ['R6', 'R7', 'R9'])
        r[name] = f.wasm.Constant.from_js([['-1', '1']]).encode_to_base16();
      r.R8 = f.wasm.Constant.from_js([
        [
          ['-1', '-1'],
          ['2', '1000'],
        ],
      ]).encode_to_base16();
    });
    const result = inspectAvalancheFeeStructure(
      f.build([f.candidateFromBox(box)]).publication,
      f.contract,
    );
    expect(result.feeOutputs[0].fees[0].heights.avalanche).toEqual(105);
    expect(result.feeOutputs[0].fees[0].configs).not.toHaveProperty(
      'avalanche',
    );
  });
  /**
   * @target inspectAvalancheFeeStructure — does not infer a missing fee output
   * from non-fee outputs
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Build only ordinary outputs while retaining the configured fee
   * target; inspect the transaction.
   * @expected expect(() =>
   * inspectAvalancheFeeStructure(f.build([f.normal]).publication, f.contract),
   * ).toThrow('no configured fee output')
   */
  it('does not infer a missing fee output from non-fee outputs', () => {
    expect(() =>
      inspectAvalancheFeeStructure(f.build([f.normal]).publication, f.contract),
    ).toThrow('no configured fee output');
  });
  /**
   * @target inspectAvalancheFeeStructure — rejects descending history heights
   * against the actual wire registers
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Encode descending activation heights with corresponding rows in
   * every fee register, rebuild and inspect the transaction.
   * @expected expect(() => inspectAvalancheFeeStructure(
   * f.build([f.candidateFromBox(box)]).publication, f.contract, ),
   * ).toThrow('activation height')
   */
  it('rejects descending history heights against the actual wire registers', () => {
    const box = f.mutateBox(f.feeCandidate(), (json) => {
      const r = json.additionalRegisters as Record<string, string>;
      r.R5 = f.wasm.Constant.from_js([
        [105, 105],
        [104, 106],
      ]).encode_to_base16();
      for (const name of ['R6', 'R7', 'R9'])
        r[name] = f.wasm.Constant.from_js([
          ['1', '1'],
          ['1', '1'],
        ]).encode_to_base16();
      r.R8 = f.wasm.Constant.from_js([
        [
          ['2', '1000'],
          ['2', '1000'],
        ],
        [
          ['2', '1000'],
          ['2', '1000'],
        ],
      ]).encode_to_base16();
    });
    expect(() =>
      inspectAvalancheFeeStructure(
        f.build([f.candidateFromBox(box)]).publication,
        f.contract,
      ),
    ).toThrow('activation height');
  });
  /**
   * @target inspectAvalancheFeeStructure — accepts Sigma Long maximum without
   * precision loss
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Set networkFee to the exact signed 64-bit maximum, build and
   * inspect the real register bytes.
   * @expected
   * expect(result.feeOutputs[0].fees[0].configs.avalanche.networkFee).toEqual(
   * '9223372036854775807', )
   */
  it('accepts Sigma Long maximum without precision loss', () => {
    const config = {
      ...f.fees[0],
      configs: {
        ...f.fees[0].configs,
        avalanche: {
          ...f.fees[0].configs.avalanche,
          networkFee: (1n << 63n) - 1n,
        },
      },
    };
    const result = inspectAvalancheFeeStructure(
      f.build([f.feeCandidate([config])]).publication,
      f.contract,
    );
    expect(result.feeOutputs[0].fees[0].configs.avalanche.networkFee).toEqual(
      '9223372036854775807',
    );
  });
  /**
   * @target inspectAvalancheFeeStructure — recognizes the one-marker native ERG
   * output
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Remove the secondary marker token, add native ERG metadata and
   * mapping, then inspect the resealed funding-only transaction.
   * @expected expect( inspectAvalancheFeeStructure(seal(p.body),
   * f.contract).feeOutputs[0] .tokenId, ).toEqual('erg')
   */
  it('recognizes the one-marker native ERG output', () => {
    const box = f.mutateBox(f.feeCandidate(), (json) => {
      (json.assets as object[]).pop();
    });
    const p = f.build([f.candidateFromBox(box)], [f.funding]);
    Object.assign(p.body, {
      supportedTokens: [
        ...p.body.supportedTokens,
        {
          ...p.body.supportedTokens[0],
          tokenId: 'erg',
          ergoSideTokenId: 'erg',
          name: 'ERG',
        },
      ],
      rawTokenMap: [
        ...p.body.rawTokenMap,
        { ergo: { tokenId: 'erg', decimals: 9 } },
      ],
    });
    expect(
      inspectAvalancheFeeStructure(seal(p.body), f.contract).feeOutputs[0]
        .tokenId,
    ).toEqual('erg');
  });
});
