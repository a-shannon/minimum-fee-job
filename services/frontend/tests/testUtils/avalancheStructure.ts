import type * as Wasm from 'ergo-lib-wasm-nodejs';

import { pinnedFeeDependencies } from '../../../backend/tests/fixtures/pinnedFeeDependencies';
import { nft } from '../testData/avalancheStructure';
import { body, native, seal } from './avalanchePublicationFixture';

export { nft } from '../testData/avalancheStructure';
/** Builds exact common fee values, including a Long above Number precision. */
export const common = () => ({
  bridgeFee: 1n,
  networkFee: 9007199254740993n,
  rsnRatio: 2n,
  rsnRatioDivisor: 1000n,
  feeRatio: 3n,
});
/** Builds pinned real WASM boxes, context and reduced publication helpers. */
export const setupStructure = () => {
  const deps = pinnedFeeDependencies();
  const wasm = deps.wasm as typeof Wasm;
  const address = wasm.Address.from_public_key(
    Buffer.from(
      '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
      'hex',
    ),
  ).to_base58(0);
  const fundingAddress = wasm.Address.from_public_key(
    Buffer.from(
      '02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5',
      'hex',
    ),
  ).to_base58(0);
  const value = wasm.BoxValue.from_i64(wasm.I64.from_str('1000000'));
  const zero = '0'.repeat(64);
  const headers = wasm.BlockHeaders.from_json(
    Array(10).fill({
      extensionId: zero,
      difficulty: '5275058176',
      votes: '000000',
      timestamp: 0,
      size: 220,
      stateRoot: '0'.repeat(66),
      height: 100,
      nBits: 0,
      version: 2,
      id: zero,
      adProofsRoot: zero,
      transactionsRoot: zero,
      extensionHash: zero,
      powSolutions: {
        pk: '03702266cae8daf75b7f09d4c23ad9cdc954849ee280eefae0d67bd97db4a68f6a',
        w: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
        n: '000000019cdfb631',
        d: 0,
      },
      adProofsId: zero,
      transactionsId: zero,
      parentId: zero,
    }),
  );
  const context = new wasm.ErgoStateContext(
    wasm.PreHeader.from_block_header(headers.get(0)),
    headers,
  );
  const fees = [
    {
      heights: { avalanche: 105, ergo: 105 },
      configs: { avalanche: common(), ergo: common() },
    },
  ];
  /** Builds a native-token fee candidate from the first supplied config. */
  const feeCandidate = (custom = fees) =>
    new deps.fees.MinimumFeeBoxBuilder(nft, address)
      .setHeight(100)
      .setToken(native)
      .setValue(1000000n)
      .addConfig(new deps.fees.MinimumFeeConfig(custom[0]))
      .build() as Wasm.ErgoBoxCandidate;
  const normal = new wasm.ErgoBoxCandidateBuilder(
    value,
    wasm.Contract.pay_to_address(wasm.Address.from_base58(fundingAddress)),
    100,
  ).build();
  const old = wasm.ErgoBox.from_box_candidate(
    feeCandidate(),
    wasm.TxId.zero(),
    0,
  );
  const funding = wasm.ErgoBox.from_box_candidate(normal, wasm.TxId.zero(), 1);
  /** Edits EIP-12 box fields and rebuilds the box without its stale ID. */
  const mutateBox = (
    candidate: Wasm.ErgoBoxCandidate,
    mutate: (json: Record<string, unknown>) => void,
  ) => {
    const json = wasm.ErgoBox.from_box_candidate(
      candidate,
      wasm.TxId.zero(),
      5,
    ).to_js_eip12();
    mutate(json);
    delete json.boxId;
    return wasm.ErgoBox.from_json(JSON.stringify(json));
  };
  /** Copies value, script, height, tokens and registers into an output candidate. */
  const candidateFromBox = (box: Wasm.ErgoBox) => {
    const builder = new wasm.ErgoBoxCandidateBuilder(
      box.value(),
      wasm.Contract.new(box.ergo_tree()),
      box.creation_height(),
    );
    const tokens = box.tokens();
    for (let i = 0; i < tokens.len(); i++)
      builder.add_token(tokens.get(i).id(), tokens.get(i).amount());
    for (let i = 4; i <= 9; i++) {
      const r = box.register_value(i);
      if (r) builder.set_register_value(i, r);
    }
    return builder.build();
  };
  /** Reduces a fixture transaction against its input and data boxes, then seals its publication. */
  const build = (
    outputs: Wasm.ErgoBoxCandidate[] = [normal, feeCandidate(), normal],
    inputs: Wasm.ErgoBox[] = [funding, old],
    data: Wasm.ErgoBox[] = [],
  ) => {
    const inBoxes = wasm.ErgoBoxes.empty(),
      dataBoxes = wasm.ErgoBoxes.empty(),
      unsignedInputs = new wasm.UnsignedInputs(),
      dataInputs = new wasm.DataInputs(),
      out = wasm.ErgoBoxCandidates.empty();
    inputs.forEach((box) => {
      inBoxes.add(box);
      unsignedInputs.add(wasm.UnsignedInput.from_box_id(box.box_id()));
    });
    data.forEach((box) => {
      dataBoxes.add(box);
      dataInputs.add(new wasm.DataInput(box.box_id()));
    });
    outputs.forEach((box) => out.add(box));
    const unsigned = new wasm.UnsignedTransaction(
      unsignedInputs,
      dataInputs,
      out,
    );
    const reduced = wasm.ReducedTransaction.from_unsigned_tx(
      unsigned,
      inBoxes,
      dataBoxes,
      context,
    );
    const publication = body();
    publication.kind = 'transaction';
    publication.transaction = {
      reducedTx: Buffer.from(reduced.sigma_serialize_bytes()).toString(
        'base64',
      ),
      sender: fundingAddress,
      inputs: inputs.map((box) =>
        Buffer.from(box.sigma_serialize_bytes()).toString('base64'),
      ),
    };
    return {
      publication: seal(publication),
      unsigned,
      reduced,
      body: publication,
    };
  };
  return {
    ...deps,
    wasm,
    address,
    fundingAddress,
    fees,
    old,
    funding,
    normal,
    feeCandidate,
    mutateBox,
    candidateFromBox,
    build,
    contract: {
      expectedChainId: 43113 as const,
      minimumFeeAddress: address,
      minimumFeeNFT: nft,
    },
  };
};
