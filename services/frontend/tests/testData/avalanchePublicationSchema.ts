import type { body } from '../testUtils/avalanchePublicationFixture';
import { fixture } from '../testUtils/avalanchePublicationFixture';
import { feeV2 } from '../testUtils/avalanchePublicationSchema';

/** Parameter variants for V2 requires exact field %s. */
export const requiredV2 = [
  'feeEvidence',
  ...['finalized', 'quote', 'policy', 'history', 'assets', 'updates'].map(
    (k) => 'feeEvidence.' + k,
  ),
  ...['chainId', 'height', 'hash'].map((k) => 'feeEvidence.finalized.' + k),
  ...['chainId', 'baseFeePerGas', 'maxPriorityFeePerGas', 'maxFeePerGas'].map(
    (k) => 'feeEvidence.quote.' + k,
  ),
  ...['gasBudget', 'margin', 'activationDelay'].map(
    (k) => 'feeEvidence.policy.' + k,
  ),
  ...['numerator', 'denominator'].map((k) => 'feeEvidence.policy.margin.' + k),
  ...['chains', 'frontiers', 'guarantees'].map(
    (k) => 'feeEvidence.history.' + k,
  ),
  ...['selectedTokenId', 'ergoTokenId', 'activationHeight', 'fee'].map(
    (k) => 'feeEvidence.assets.0.' + k,
  ),
  ...['selectedTokenId', 'ergoTokenId', 'candidate'].map(
    (k) => 'feeEvidence.updates.0.' + k,
  ),
  ...['heights', 'configs'].map((k) => 'feeEvidence.updates.0.candidate.' + k),
  ...[
    'bridgeFee',
    'networkFee',
    'rsnRatio',
    'rsnRatioDivisor',
    'feeRatio',
  ].flatMap((k) => [
    'feeEvidence.assets.0.fee.' + k,
    'feeEvidence.updates.0.candidate.configs.avalanche.' + k,
  ]),
];

/** Parameter variants for V2 rejects malformed or overflowing uint256 %s. */
export const uintPaths = [
  'quote.baseFeePerGas',
  'quote.maxPriorityFeePerGas',
  'quote.maxFeePerGas',
  'policy.gasBudget',
  'policy.margin.numerator',
  'policy.margin.denominator',
];

/** Parameter variants for V2 captures both chain %s variants without numeric amount conversion. */
export const publicationCases0 = [43113, 43114] as const;

/** Parameter variants for V2 rejects non-object evidence node %s. */
export const publicationCases2 = [
  'finalized',
  'quote',
  'policy',
  'policy.margin',
  'history',
  'history.frontiers',
  'history.guarantees',
  'assets.0',
  'assets.0.fee',
  'updates.0',
  'updates.0.candidate',
  'updates.0.candidate.heights',
  'updates.0.candidate.configs',
];

/** Parameter variants for V2 rejects unknown nested field in %s. */
export const publicationCases7 = [
  'feeEvidence',
  'feeEvidence.finalized',
  'feeEvidence.quote',
  'feeEvidence.policy',
  'feeEvidence.policy.margin',
  'feeEvidence.history',
  'feeEvidence.assets.0',
  'feeEvidence.assets.0.fee',
  'feeEvidence.updates.0',
  'feeEvidence.updates.0.candidate',
  'feeEvidence.updates.0.candidate.configs.avalanche',
];

/** Parameter variants for V2 rejects isolated evidence %s=%j. */
export const publicationCases8 = [
  ['finalized.chainId', 43114],
  ['quote.chainId', 43114],
  ['finalized.chainId', '43113'],
  ['finalized.hash', '0x' + 'AB'.repeat(32)],
  ['finalized.hash', 'ab'.repeat(32)],
  ['policy.margin.numerator', '9'],
  ['assets', []],
  ['updates', []],
  ['history.chains', []],
  ['history.chains', ['avalanche', 'avalanche']],
  ['history.chains', ['ergo']],
  ['history.chains', ['avalanche', 'Ethereum']],
  ['history.chains', ['avalanche', 'constructor']],
  ['history.frontiers.avalanche', 99],
  ['history.frontiers.extra', 1],
  ['history.guarantees.extra', 1],
  ['history.frontiers.ergo', null],
  ['history.guarantees.ergo', 0],
  ['updates.0.candidate.heights', {}],
  ['updates.0.candidate.configs', {}],
  ['updates.0.candidate.configs.missing', feeV2()],
  ['updates.0.candidate.heights.Bad', 1],
  ['assets.0.selectedTokenId', ''],
  ['assets.0.ergoTokenId', ' '],
  ['updates.0.selectedTokenId', 1],
  ['updates.0.ergoTokenId', null],
] as const;

/** Parameter variants for V2 rejects each duplicate %s identity separately. */
export const publicationCases9 = ['assets', 'updates'] as const;

/** Parameter variants for V2 rejects zero positive uint %s. */
export const publicationCases12 = [
  'quote.maxFeePerGas',
  'policy.gasBudget',
  'policy.margin.numerator',
  'policy.margin.denominator',
];

/** Parameter variants for V2 rejects non-int32 %s. */
export const publicationCases13 = [
  'finalized.height',
  'policy.activationDelay',
  'assets.0.activationHeight',
  'history.frontiers.ergo',
  'history.guarantees.ergo',
  'updates.0.candidate.heights.ergo',
];

/** Parameter variants for V2 exact Sigma Long field %s. */
export const publicationCases14 = [
  'bridgeFee',
  'networkFee',
  'rsnRatio',
  'rsnRatioDivisor',
  'feeRatio',
];

/** Parameter variants for V2 rejects sparse, inherited and extra-key array %s. */
export const publicationCases16 = ['assets', 'updates', 'history.chains'];

/** Parameter variants for rejects %s even with a recomputed digest. */
export const publicationCases20 = [
  [
    'schema',
    (v: ReturnType<typeof body>) => {
      v.schema = 'other';
    },
  ],
  [
    'version',
    (v) => {
      v.version = 2;
    },
  ],
  [
    'chain',
    (v) => {
      v.chain = 'ethereum';
    },
  ],
  [
    'chainId',
    (v) => {
      v.chainId = 43114;
    },
  ],
  [
    'kind',
    (v) => {
      v.kind = 'other';
    },
  ],
  [
    'empty with transaction',
    (v) => {
      v.transaction = {};
    },
  ],
  [
    'transaction with null',
    (v) => {
      v.kind = 'transaction';
    },
  ],
  [
    'unsupported property',
    (v) => {
      Object.assign(v, { rpcUrl: 'https://invalid' });
    },
  ],
  [
    'missing nested fee',
    (v) => {
      Reflect.deleteProperty(v.supportedTokens[0], 'fee');
    },
  ],
  [
    'unknown fee',
    (v) => {
      Object.assign(v.supportedTokens[0].fee, { unknown: 1 });
    },
  ],
  [
    'negative fee',
    (v) => {
      v.supportedTokens[0].fee.bridgeFeeUSD = -1;
    },
  ],
  [
    'invalid delay',
    (v) => {
      v.supportedTokens[0].fee.delays.ergo = 0.1;
    },
  ],
  [
    'delay overflow',
    (v) => {
      v.supportedTokens[0].fee.delays.ergo = 2147483648;
    },
  ],
  [
    'zero divisor',
    (v) => {
      v.supportedTokens[0].fee.rsnRatioDivisor = 0;
    },
  ],
  [
    'decimals',
    (v) => {
      v.supportedTokens[0].decimals = 256;
    },
  ],
  [
    'token missing',
    (v) => {
      v.supportedTokens = [];
    },
  ],
  [
    'duplicate token',
    (v) => {
      v.supportedTokens.push(v.supportedTokens[0]);
    },
  ],
  [
    'ergo alias',
    (v) => {
      v.supportedTokens[0].ergoSideTokenId = 'cd'.repeat(32);
    },
  ],
  [
    'unknown RSN',
    (v) => {
      v.rsnTokenId = 'rsn';
    },
  ],
  [
    'raw member decimals',
    (v) => {
      v.rawTokenMap[0].ergo.decimals = -1;
    },
  ],
  [
    'raw unknown field',
    (v) => {
      Object.assign(v.rawTokenMap[0].ergo, { address: 'invalid' });
    },
  ],
  [
    'raw empty name',
    (v) => {
      v.rawTokenMap[0].avalanche.name = '';
    },
  ],
  [
    'raw metadata object',
    (v) => {
      Object.assign(v.rawTokenMap[0].avalanche.extra, { nested: {} });
    },
  ],
  [
    'raw metadata null',
    (v) => {
      Object.assign(v.rawTokenMap[0].avalanche.extra, { nested: null });
    },
  ],
  [
    'raw ambiguous set',
    (v) => {
      v.rawTokenMap.push(v.rawTokenMap[0]);
    },
  ],
  [
    'raw member missing',
    (v) => {
      Reflect.deleteProperty(v.rawTokenMap[0].ergo, 'tokenId');
    },
  ],
  [
    'raw missing avalanche',
    (v) => {
      Reflect.deleteProperty(v.rawTokenMap[0], 'avalanche');
    },
  ],
  [
    'zero AVAX price',
    (v) => {
      v.avalancheDecimalPrices.avax = '0';
    },
  ],
  [
    'price precision number',
    (v) => {
      Object.assign(v.avalancheDecimalPrices.tokens, { avax: 2 });
    },
  ],
  [
    'missing exact price',
    (v) => {
      Reflect.deleteProperty(v.avalancheDecimalPrices.tokens, 'avax');
    },
  ],
  [
    'price exponent',
    (v) => {
      v.avalancheDecimalPrices.avax = '1e257';
    },
  ],
  [
    'price whitespace',
    (v) => {
      v.avalancheDecimalPrices.avax = '2 ';
    },
  ],
  [
    'legacy duplicate',
    (v) => {
      v.legacyNumericPrices.push(v.legacyNumericPrices[0]);
    },
  ],
  [
    'legacy negative',
    (v) => {
      v.legacyNumericPrices = [['avax', -1]];
    },
  ],
  [
    'legacy textual',
    (v) => {
      v.legacyNumericPrices = [['avax', '2']];
    },
  ],
  [
    'legacy shape',
    (v) => {
      v.legacyNumericPrices = [['avax', 2, 3]];
    },
  ],
] satisfies [string, (value: ReturnType<typeof body>) => void][];

/** Parameter variants for rejects malformed transaction %s. */
export const publicationCases21 = [
  'reducedTx',
  'sender',
  'inputs',
  'unknown',
  'duplicate inputs',
];

/** Parameter variants for rejects invalid root %j. */
export const publicationCases22 = [
  null,
  [],
  {},
  'null',
  'broken',
  JSON.stringify(JSON.stringify(fixture())),
  Number.NaN,
];
