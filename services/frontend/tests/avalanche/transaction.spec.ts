import { parseAvalancheFeeTransaction } from '../../src/avalanche/transaction';
import {
  structureCases3,
  structureCases4,
  structureCases6,
  structureCases8,
} from '../testData/avalancheStructure';
import { seal } from '../testUtils/avalanchePublicationFixture';
import { setupStructure } from '../testUtils/avalancheStructure';

vi.mock('@rosen-bridge/minimum-fee', async () => {
  const { pinnedFeeDependencies } = await import(
    '../../../backend/tests/fixtures/pinnedFeeDependencies'
  );
  return pinnedFeeDependencies().fees;
});
describe('parseAvalancheFeeTransaction', () => {
  let f: ReturnType<typeof setupStructure>;
  beforeEach(() => {
    f = setupStructure();
  });
  /**
   * @target parseAvalancheFeeTransaction — owns a snapshot of caller deployment
   * and publication
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Parse a real publication, then change the caller NFT and decimal
   * price; inspect the captured contract and frozen transaction inputs.
   * @expected expect(result.contract.minimumFeeNFT).toEqual('12'.repeat(32));
   * expect(Object.isFrozen(result.transaction!.inputs)).toEqual(true)
   */
  it('owns a snapshot of caller deployment and publication', () => {
    const p = f.build();
    const result = parseAvalancheFeeTransaction(p.publication, f.contract);
    f.contract.minimumFeeNFT = 'ff'.repeat(32);
    p.body.avalancheDecimalPrices.avax = '5';
    expect(result.contract.minimumFeeNFT).toEqual('12'.repeat(32));
    expect(Object.isFrozen(result.transaction!.inputs)).toEqual(true);
  });
  /**
   * @target parseAvalancheFeeTransaction — rejects invalid explicit contract %s
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Change only the selected explicit-contract field, including absent
   * or zero NFT cases; parse the same real transaction.
   * @expected expect(() => parseAvalancheFeeTransaction(f.build().publication,
   * contract), ).toThrow()
   */
  it.each(structureCases3)('rejects invalid explicit contract %s', (fault) => {
    const contract = { ...f.contract };
    if (fault === 'NFT') contract.minimumFeeNFT = 'ff'.repeat(32);
    if (fault === 'address') contract.minimumFeeAddress = f.fundingAddress;
    if (fault === 'chain') Object.assign(contract, { expectedChainId: 43114 });
    if (fault === 'missing NFT')
      Reflect.deleteProperty(contract, 'minimumFeeNFT');
    if (fault === 'zero NFT') contract.minimumFeeNFT = '0'.repeat(64);
    expect(() =>
      parseAvalancheFeeTransaction(f.build().publication, contract),
    ).toThrow();
  });
  /**
   * @target parseAvalancheFeeTransaction — rejects %s with recomputed envelope
   * digest
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Change the selected transaction input, byte suffix, sender or
   * signed encoding; recompute the envelope digest and parse it.
   * @expected expect(() => parseAvalancheFeeTransaction(seal(p.body),
   * f.contract), ).toThrow()
   */
  it.each(structureCases4)(
    'rejects %s with recomputed envelope digest',
    (fault) => {
      const p = f.build();
      const tx = p.body.transaction as {
        reducedTx: string;
        sender: string;
        inputs: string[];
      };
      if (fault === 'count') tx.inputs.pop();
      if (fault === 'reversed') tx.inputs.reverse();
      if (fault === 'bytes')
        tx.inputs[0] = Buffer.from(
          f.wasm.ErgoBox.from_box_candidate(
            f.normal,
            f.wasm.TxId.zero(),
            99,
          ).sigma_serialize_bytes(),
        ).toString('base64');
      if (fault === 'trailing box')
        tx.inputs[0] = Buffer.concat([
          Buffer.from(tx.inputs[0], 'base64'),
          Buffer.from([0]),
        ]).toString('base64');
      if (fault === 'trailing reduced')
        tx.reducedTx = Buffer.concat([
          Buffer.from(tx.reducedTx, 'base64'),
          Buffer.from([0]),
        ]).toString('base64');
      if (fault === 'sender') tx.sender = '9'.repeat(51);
      if (fault === 'signed') {
        const json = p.unsigned.to_js_eip12();
        json.id = p.unsigned.id().to_str();
        json.inputs = json.inputs.map((i: object) => ({
          ...i,
          spendingProof: { proofBytes: '', extension: {} },
        }));
        json.outputs = json.outputs.map((output: object, index: number) => ({
          ...output,
          transactionId: p.unsigned.id().to_str(),
          index,
        }));
        tx.reducedTx = Buffer.from(
          f.wasm.Transaction.from_json(
            JSON.stringify(json),
          ).sigma_serialize_bytes(),
        ).toString('base64');
      }
      expect(() =>
        parseAvalancheFeeTransaction(seal(p.body), f.contract),
      ).toThrow();
    },
  );
  /**
   * @target parseAvalancheFeeTransaction — rejects actual data-input references
   * without serialized evidence
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Build a real transaction containing a data-input reference without
   * adding serialized data-input evidence; parse the publication.
   * @expected expect(() => parseAvalancheFeeTransaction( f.build(undefined,
   * undefined, [data]).publication, f.contract, ), ).toThrow('data inputs')
   */
  it('rejects actual data-input references without serialized evidence', () => {
    const data = f.wasm.ErgoBox.from_box_candidate(
      f.normal,
      f.wasm.TxId.zero(),
      77,
    );
    expect(() =>
      parseAvalancheFeeTransaction(
        f.build(undefined, undefined, [data]).publication,
        f.contract,
      ),
    ).toThrow('data inputs');
  });
  /**
   * @target parseAvalancheFeeTransaction — rejects duplicate fee target in %s
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Build duplicate fee targets on the selected input or output side
   * and parse the resulting publication.
   * @expected expect(() => parseAvalancheFeeTransaction(p.publication,
   * f.contract)).toThrow( 'Duplicate', )
   */
  it.each(structureCases6)('rejects duplicate fee target in %s', (side) => {
    const p =
      side === 'output'
        ? f.build([f.feeCandidate(), f.normal, f.feeCandidate()])
        : f.build(undefined, [
            f.old,
            f.wasm.ErgoBox.from_box_candidate(
              f.feeCandidate(),
              f.wasm.TxId.zero(),
              9,
            ),
          ]);
    expect(() =>
      parseAvalancheFeeTransaction(p.publication, f.contract),
    ).toThrow('Duplicate');
  });
  /**
   * @target parseAvalancheFeeTransaction — rejects malformed fee output %s
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Change the selected fee-output token identity, amount, extra
   * token, ordering or missing NFT; rebuild and parse the transaction.
   * @expected expect(() => parseAvalancheFeeTransaction(
   * f.build([f.candidateFromBox(box)]).publication, f.contract, ), ).toThrow()
   */
  it.each(structureCases8)('rejects malformed fee output %s', (fault) => {
    const box = f.mutateBox(f.feeCandidate(), (json) => {
      const assets = json.assets as { tokenId: string; amount: string }[];
      if (fault === 'NFT') assets[0].tokenId = 'ff'.repeat(32);
      if (fault === 'NFT amount') assets[0].amount = '2';
      if (fault === 'target') assets[1].tokenId = 'ff'.repeat(32);
      if (fault === 'target amount') assets[1].amount = '2';
      if (fault === 'extra token')
        assets.push({ tokenId: 'ff'.repeat(32), amount: '1' });
      if (fault === 'token order') assets.reverse();
      if (fault === 'missing NFT') assets.shift();
    });
    expect(() =>
      parseAvalancheFeeTransaction(
        f.build([f.candidateFromBox(box)]).publication,
        f.contract,
      ),
    ).toThrow();
  });
  /**
   * @target parseAvalancheFeeTransaction — rejects disappearance of a consumed
   * fee target even with another valid output
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Consume the original fee target, produce another valid native ERG
   * target, add its mapping and parse the resealed transaction.
   * @expected expect(() => parseAvalancheFeeTransaction(seal(p.body),
   * f.contract)).toThrow( 'no successor', )
   */
  it('rejects disappearance of a consumed fee target even with another valid output', () => {
    const box = f.mutateBox(f.feeCandidate(), (json) => {
      (json.assets as object[]).pop();
    });
    const p = f.build([f.candidateFromBox(box)]);
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
    expect(() =>
      parseAvalancheFeeTransaction(seal(p.body), f.contract),
    ).toThrow('no successor');
  });
  /**
   * @target parseAvalancheFeeTransaction — rejects an incorrect marker in an
   * actual consumed fee box
   * @dependencies Real pinned WASM and minimum-fee codec, generated reduced
   * transaction and sealed publication fixtures; minimum-fee import redirects to
   * the pinned codec.
   * @scenario Change the marker NFT of an actual consumed fee box, rebuild the
   * publication and parse it.
   * @expected expect(() => parseAvalancheFeeTransaction( f.build(undefined,
   * [f.funding, box]).publication, f.contract, ), ).toThrow('marker')
   */
  it('rejects an incorrect marker in an actual consumed fee box', () => {
    const box = f.mutateBox(f.feeCandidate(), (json) => {
      (json.assets as { tokenId: string }[])[0].tokenId = 'ff'.repeat(32);
    });
    expect(() =>
      parseAvalancheFeeTransaction(
        f.build(undefined, [f.funding, box]).publication,
        f.contract,
      ),
    ).toThrow('marker');
  });
});
