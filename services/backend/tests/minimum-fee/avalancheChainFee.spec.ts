import {
  applyAvalancheChainFee,
  AvalancheChainFeeInput,
  buildAvalancheChainFee,
  convertAvalancheFeeToToken,
} from '../../src/minimum-fee/avalancheChainFee';
import {
  exactPriceConversions,
  invalidDecimalPrices,
  invalidWeiAmounts,
  invalidSignificantDecimals,
  configuredQuoteChains,
  invalidExpectedChains,
  nativeSetDecimals,
  nativeAssetAliases,
  invalidMemberDecimals,
  invalidActivationIntegers,
  invalidCommonFees,
  positiveRatioFields,
  invalidTokenAddresses,
  invalidTokenTypes,
  mappedAssetAliases,
  mappedSetDecimals,
  invalidSelectedDecimals,
} from '../testData/avalancheChainFee';
import {
  LONG,
  HEIGHT,
  wrapped,
  token,
  ergoToken,
} from '../testData/avalancheChainFee';
import { input, map, prices, args } from '../testUtils/avalancheChainFee';
import { mappedAssetMutations } from '../testUtils/avalancheChainFeeCases';
import { faults } from '../testUtils/avalancheChainFeeCases';
import {
  loadChainFeeCodec,
  type ChainFeeCodec,
} from '../testUtils/avalancheChainFeeCodec';

describe('convertAvalancheFeeToToken', () => {
  /**
   * @target convertAvalancheFeeToToken converts exact %s/%s at %s decimals
   * @dependencies Real fee conversion, build and apply functions; exact bigint/price and
   *  token-map builders and invalid-field tables; setChainConfig spy in apply rejection
   *  controls
   * @scenario
   * - Convert each exact wei amount with its decimal prices and token decimals; compare the
   *  table's expected bigint result
   * @expected
   * - converts exact %s/%s at %s decimals
   */
  it.each(exactPriceConversions)(
    'converts exact %s/%s at %s decimals',
    (avax, token, decimals, wei, expected) => {
      expect(
        convertAvalancheFeeToToken(wei, prices(avax, token, decimals)),
      ).toEqual(expected);
    },
  );
  /**
   * @target convertAvalancheFeeToToken uses supplied decimal authority beyond Number precision
   * @dependencies Real fee conversion, build and apply functions; exact bigint/price and
   *  token-map builders and invalid-field tables; setChainConfig spy in apply rejection
   *  controls
   * @scenario
   * - Convert one wei at price 9007199254740993 using decimal strings; require that exact
   *  bigint result
   * @expected
   * - uses supplied decimal authority beyond Number precision
   */
  it('uses supplied decimal authority beyond Number precision', () => {
    expect(
      convertAvalancheFeeToToken(1n, prices('9007199254740993', '1')),
    ).toEqual(9007199254740993n);
  });
  for (const field of ['avaxPrice', 'tokenPrice'] as const) {
    /**
     * @target convertAvalancheFeeToToken rejects invalid ${field} %s
     * @dependencies Real fee conversion, build and apply functions; exact bigint/price and
     *  token-map builders and invalid-field tables; setChainConfig spy in apply rejection
     *  controls
     * @scenario
     * - Replace avaxPrice or tokenPrice with each invalid decimal value and require conversion
     *  rejection
     * @expected
     * - rejects invalid ${field} %s
     */
    it.each(invalidDecimalPrices)(`rejects invalid ${field} %s`, (value) => {
      expect(() =>
        convertAvalancheFeeToToken(1n, {
          ...prices(),
          [field]: value,
        } as ReturnType<typeof prices>),
      ).toThrow();
    });
  }
  /**
   * @target convertAvalancheFeeToToken rejects invalid wei %s
   * @dependencies Real fee conversion, build and apply functions; exact bigint/price and
   *  token-map builders and invalid-field tables; setChainConfig spy in apply rejection
   *  controls
   * @scenario
   * - Pass each invalid wei value with valid prices and require a wei validation error
   * @expected
   * - rejects invalid wei %s
   */
  it.each(invalidWeiAmounts)('rejects invalid wei %s', (wei) => {
    expect(() => convertAvalancheFeeToToken(wei as bigint, prices())).toThrow(
      'wei',
    );
  });
  /**
   * @target convertAvalancheFeeToToken rejects decimals %s
   * @dependencies Real fee conversion, build and apply functions; exact bigint/price and
   *  token-map builders and invalid-field tables; setChainConfig spy in apply rejection
   *  controls
   * @scenario
   * - Replace tokenDecimals with each invalid value and require a decimals validation error
   * @expected
   * - rejects decimals %s
   */
  it.each(invalidSignificantDecimals)('rejects decimals %s', (decimals) => {
    expect(() =>
      convertAvalancheFeeToToken(1n, {
        ...prices(),
        tokenDecimals: decimals as number,
      }),
    ).toThrow('decimals');
  });
  /**
   * @target convertAvalancheFeeToToken accepts the Sigma Long maximum and rejects the next value
   * @dependencies Real fee conversion, build and apply functions; exact bigint/price and
   *  token-map builders and invalid-field tables; setChainConfig spy in apply rejection
   *  controls
   * @scenario
   * - Convert the Sigma Long maximum exactly, then require rejection for the next integer
   * @expected
   * - accepts the Sigma Long maximum and rejects the next value
   */
  it('accepts the Sigma Long maximum and rejects the next value', () => {
    expect(convertAvalancheFeeToToken(LONG, prices())).toEqual(LONG);
    expect(() => convertAvalancheFeeToToken(LONG + 1n, prices())).toThrow(
      'Sigma Long',
    );
  });
  /**
   * @target convertAvalancheFeeToToken supports decimals above18 while bounding exponent allocation
   * @dependencies Real fee conversion, build and apply functions; exact bigint/price and
   *  token-map builders and invalid-field tables; setChainConfig spy in apply rejection
   *  controls
   * @scenario
   * - Convert one wei at 24 token decimals and require 1000000
   * - Try Number.MAX_SAFE_INTEGER decimals and require the bounded Sigma Long error
   * @expected
   * - supports decimals above18 while bounding exponent allocation
   */
  it('supports decimals above18 while bounding exponent allocation', () => {
    expect(convertAvalancheFeeToToken(1n, prices('1', '1', 24))).toEqual(
      1000000n,
    );
    expect(() =>
      convertAvalancheFeeToToken(1n, prices('1', '1', Number.MAX_SAFE_INTEGER)),
    ).toThrow('Sigma Long');
  });
});

describe('buildAvalancheChainFee', () => {
  /**
   * @target buildAvalancheChainFee rejects invalid expected chain %s
   * @dependencies Real fee conversion, build and apply functions; exact bigint/price and
   *  token-map builders and invalid-field tables; setChainConfig spy in apply rejection
   *  controls
   * @scenario
   * - Replace expectedChainId with each invalid identity and require configured-chain
   *  rejection
   * @expected
   * - rejects invalid expected chain %s
   */
  it.each(invalidExpectedChains)(
    'rejects invalid expected chain %s',
    (expectedChainId) => {
      expect(() =>
        buildAvalancheChainFee({
          ...input(),
          expectedChainId,
        } as AvalancheChainFeeInput),
      ).toThrow('configured chain');
    },
  );
  /**
   * @target buildAvalancheChainFee accepts the uniquely selected Ergo-side identifier
   * @dependencies Real fee conversion, build and apply functions; exact bigint/price and
   *  token-map builders and invalid-field tables; setChainConfig spy in apply rejection
   *  controls
   * @scenario
   * - Select the native set by its Ergo-side identifier and require the native network fee
   * @expected
   * - accepts the uniquely selected Ergo-side identifier
   */
  it('accepts the uniquely selected Ergo-side identifier', () => {
    const args = input();
    args.selectedTokenId = wrapped;
    expect(buildAvalancheChainFee(args).fee.networkFee).toEqual(3000000000n);
  });
  /**
   * @target buildAvalancheChainFee uses every selected-set decimal including %s
   * @dependencies Real fee conversion, build and apply functions; exact bigint/price and
   *  token-map builders and invalid-field tables; setChainConfig spy in apply rejection
   *  controls
   * @scenario
   * - Add a third member with each decimal count to the selected native set; compare the fee
   *  scaled to the minimum set decimals
   * @expected
   * - uses every selected-set decimal including %s
   */
  it.each(nativeSetDecimals)(
    'uses every selected-set decimal including %s',
    (decimals) => {
      const args = input();
      map(args)[0].other = { tokenId: 'other', decimals };
      expect(buildAvalancheChainFee(args).fee.networkFee).toEqual(
        3n * 10n ** BigInt(Math.min(decimals, 9)),
      );
    },
  );
  /**
   * @target buildAvalancheChainFee rejects unequal native asset prices selected by %s
   * @dependencies Real fee conversion, build and apply functions; exact bigint/price and
   *  token-map builders and invalid-field tables; setChainConfig spy in apply rejection
   *  controls
   * @scenario
   * - Select each native alias with token price 2.5; require unequal-native-price rejection
   * @expected
   * - rejects unequal native asset prices selected by %s
   */
  it.each(nativeAssetAliases)(
    'rejects unequal native asset prices selected by %s',
    (selectedTokenId) => {
      expect(() =>
        buildAvalancheChainFee({
          ...input(),
          selectedTokenId,
          tokenPrice: '2.5',
        }),
      ).toThrow('equal asset prices');
    },
  );
  for (const member of ['ergo', 'other']) {
    /**
     * @target buildAvalancheChainFee rejects ${member} decimals %s
     * @dependencies Real fee conversion, build and apply functions; exact bigint/price and
     *  token-map builders and invalid-field tables; setChainConfig spy in apply rejection
     *  controls
     * @scenario
     * - Replace the native set's Ergo or third member decimals with each invalid value;
     *  require build rejection
     * @expected
     * - rejects ${member} decimals %s
     */
    it.each(invalidMemberDecimals)(
      `rejects ${member} decimals %s`,
      (decimals) => {
        const args = input();
        map(args)[0][member] = {
          tokenId: member === 'ergo' ? wrapped : 'other',
          decimals: decimals as number,
        };
        expect(() => buildAvalancheChainFee(args)).toThrow();
      },
    );
  }
  for (const field of ['finalizedHeight', 'activationDelay'] as const) {
    /**
     * @target buildAvalancheChainFee rejects ${field} %s
     * @dependencies Real fee conversion, build and apply functions; exact bigint/price and
     *  token-map builders and invalid-field tables; setChainConfig spy in apply rejection
     *  controls
     * @scenario
     * - Replace finalizedHeight or activationDelay with each invalid integer; require a height
     *  validation error
     * @expected
     * - rejects ${field} %s
     */
    it.each(invalidActivationIntegers)(`rejects ${field} %s`, (value) => {
      expect(() =>
        buildAvalancheChainFee({
          ...input(),
          [field]: value,
        } as AvalancheChainFeeInput),
      ).toThrow('height');
    });
  }
  /**
   * @target buildAvalancheChainFee allows zero height and delay and exact Sigma Int limit, rejects overflowing sum
   * @dependencies Real fee conversion, build and apply functions; exact bigint/price and
   *  token-map builders and invalid-field tables; setChainConfig spy in apply rejection
   *  controls
   * @scenario
   * - Build with zero height and delay, then at the exact Sigma Int limit
   * - Increase the limit height by a delay of one and require activation-height overflow
   *  rejection
   * @expected
   * - allows zero height and delay and exact Sigma Int limit, rejects overflowing sum
   */
  it('allows zero height and delay and exact Sigma Int limit, rejects overflowing sum', () => {
    expect(
      buildAvalancheChainFee({
        ...input(),
        finalizedHeight: 0,
        activationDelay: 0,
      }).activationHeight,
    ).toEqual(0);
    expect(
      buildAvalancheChainFee({
        ...input(),
        finalizedHeight: HEIGHT - 1,
        activationDelay: 1,
      }).activationHeight,
    ).toEqual(HEIGHT);
    expect(() =>
      buildAvalancheChainFee({
        ...input(),
        finalizedHeight: HEIGHT,
        activationDelay: 1,
      }),
    ).toThrow('Sigma Int');
  });
  for (const field of [
    'bridgeFee',
    'feeRatio',
    'rsnRatio',
    'rsnRatioDivisor',
  ] as const) {
    /**
     * @target buildAvalancheChainFee rejects common ${field} %s
     * @dependencies Real fee conversion, build and apply functions; exact bigint/price and
     *  token-map builders and invalid-field tables; setChainConfig spy in apply rejection
     *  controls
     * @scenario
     * - Replace each common fee field with each invalid value and require its named validation
     *  error
     * @expected
     * - rejects common ${field} %s
     */
    it.each(invalidCommonFees)(`rejects common ${field} %s`, (value) => {
      const args = input();
      args.common = { ...args.common, [field]: value } as typeof args.common;
      expect(() => buildAvalancheChainFee(args)).toThrow(field);
    });
  }
  /**
   * @target buildAvalancheChainFee rejects zero %s
   * @dependencies Real fee conversion, build and apply functions; exact bigint/price and
   *  token-map builders and invalid-field tables; setChainConfig spy in apply rejection
   *  controls
   * @scenario
   * - Set each positive ratio field to zero and require its named validation error
   * @expected
   * - rejects zero %s
   */
  it.each(positiveRatioFields)('rejects zero %s', (field) => {
    const args = input();
    args.common = { ...args.common, [field]: 0n };
    expect(() => buildAvalancheChainFee(args)).toThrow(field);
  });
  /**
   * @target buildAvalancheChainFee accepts zero bridge fee/fee ratio and maximum common fields
   * @dependencies Real fee conversion, build and apply functions; exact bigint/price and
   *  token-map builders and invalid-field tables; setChainConfig spy in apply rejection
   *  controls
   * @scenario
   * - Set bridgeFee and feeRatio to zero and both RSN ratio fields to the Sigma Long maximum;
   *  require the same common fee fields
   * @expected
   * - accepts zero bridge fee/fee ratio and maximum common fields
   */
  it('accepts zero bridge fee/fee ratio and maximum common fields', () => {
    const args = input();
    args.common = {
      bridgeFee: 0n,
      feeRatio: 0n,
      rsnRatio: LONG,
      rsnRatioDivisor: LONG,
    };
    expect(buildAvalancheChainFee(args).fee).toMatchObject(args.common);
  });
  describe('mapped fee asset', () => {
    /**
     * @target buildAvalancheChainFee rejects isolated selected map policy fault %s
     * @dependencies Real fee producer and fresh mapped input; no RPC or mocked map validation.
     * @scenario Change only one origin, counterpart or identifier property in the selected set.
     * @expected The invalid map refuses before any fee is returned.
     */
    it.each([
      'no native origin',
      'two native origins',
      'counterpart type',
      'counterpart residency',
      'same-set identifier',
      'same-set case alias',
      'cross-set case alias',
    ])('rejects isolated selected map policy fault %s', (fault) => {
      const a = args();
      const selected = map(a)[1];
      if (fault === 'no native origin')
        selected.avalanche.residency = 'wrapped';
      if (fault === 'two native origins') selected.ergo.residency = 'native';
      if (fault === 'counterpart type') selected.ergo.type = 'native';
      if (fault === 'counterpart residency')
        selected.ergo.residency = 'invalid';
      if (fault === 'same-set identifier')
        selected.other = { tokenId: token, decimals: 24 };
      if (fault === 'same-set case alias')
        selected.other = { tokenId: token.toUpperCase(), decimals: 24 };
      if (fault === 'cross-set case alias')
        map(a).push({ other: { tokenId: token.toUpperCase(), decimals: 24 } });
      expect(() => buildAvalancheChainFee(a)).toThrow(
        /native origin|bridgeable|Ambiguous/,
      );
    });
    /**
     * @target buildAvalancheChainFee rejects token type %s
     * @dependencies Real fee conversion, build and apply functions; exact bigint/price and
     *  token-map builders and invalid-field tables; setChainConfig spy in apply rejection
     *  controls
     * @scenario
     * - Replace the selected mapped token type with each unsupported type; require ERC-20
     *  rejection
     * @expected
     * - rejects token type %s
     */
    it.each(invalidTokenTypes)('rejects token type %s', (type) => {
      const a = args();
      map(a)[1].avalanche.type = type;
      expect(() => buildAvalancheChainFee(a)).toThrow('ERC-20');
    });
    /**
     * @target buildAvalancheChainFee converts gas into selected mapped asset %s
     * @dependencies Real fee conversion, build and apply functions; exact bigint/price and
     *  token-map builders and invalid-field tables; setChainConfig spy in apply rejection
     *  controls
     * @scenario
     * - Select each mapped-asset alias and require the gas fee converted to 15000000 token
     *  units
     * @expected
     * - converts gas into selected mapped asset %s
     */
    it.each(mappedAssetAliases)(
      'converts gas into selected mapped asset %s',
      (selectedTokenId) => {
        expect(
          buildAvalancheChainFee({ ...args(), selectedTokenId }).fee.networkFee,
        ).toEqual(15000000n);
      },
    );
    /**
     * @target buildAvalancheChainFee uses selected third-member decimals %s, not native-set decimals
     * @dependencies Real fee conversion, build and apply functions; exact bigint/price and
     *  token-map builders and invalid-field tables; setChainConfig spy in apply rejection
     *  controls
     * @scenario
     * - Add a third member with each decimal count to the selected mapped set
     * - Compare the rounded-up fee using that set's minimum decimals rather than the native
     *  set
     * @expected
     * - uses selected third-member decimals %s, not native-set decimals
     */
    it.each(mappedSetDecimals)(
      'uses selected third-member decimals %s, not native-set decimals',
      (decimals) => {
        const a = args();
        map(a)[1].other = { tokenId: 'other', decimals };
        const numerator = 15n * 10n ** BigInt(Math.min(decimals, 24));
        expect(buildAvalancheChainFee(a).fee.networkFee).toEqual(
          (numerator + 10n ** 18n - 1n) / 10n ** 18n,
        );
      },
    );
    for (const member of ['avalanche', 'ergo', 'other']) {
      /**
       * @target buildAvalancheChainFee rejects selected ${member} decimals %s
       * @dependencies Real fee conversion, build and apply functions; exact bigint/price and
       *  token-map builders and invalid-field tables; setChainConfig spy in apply rejection
       *  controls
       * @scenario
       * - Replace each selected Avalanche, Ergo or third member's decimals with each invalid
       *  value; require decimals rejection
       * @expected
       * - rejects selected ${member} decimals %s
       */
      it.each(invalidSelectedDecimals)(
        'rejects selected ' + member + ' decimals %s',
        (decimals) => {
          const a = args();
          map(a)[1][member] = {
            ...map(a)[1][member],
            tokenId:
              member === 'avalanche'
                ? token
                : member === 'ergo'
                  ? ergoToken
                  : 'other',
            decimals: decimals as number,
          };
          expect(() => buildAvalancheChainFee(a)).toThrow('decimals');
        },
      );
    }
  });
  describe('integrity-qualified offline codec boundary', () => {
    let Constant: ChainFeeCodec['Constant'];
    beforeAll(async () => {
      ({ Constant } = await loadChainFeeCodec());
    });
    /**
     * @target buildAvalancheChainFee demonstrates the real serializer height clamp and monetary limit rejected upstream
     * @dependencies Real buildAvalancheChainFee; ergo-lib-wasm-nodejs 0.24.1 Constant from the
     *  integrity-qualified offline consumer fixture
     * @scenario
     * - Demonstrate the WASM height clamp above Sigma Int and exact Sigma Long monetary round
     *  trip
     * - Require rejection for monetary overflow and for build activation height exceeding Sigma
     *  Int
     * @expected
     * - demonstrates the real serializer height clamp and monetary limit rejected upstream
     */
    it('demonstrates the real serializer height clamp and monetary limit rejected upstream', () => {
      expect(Constant.from_js([[HEIGHT + 1]]).to_js()).toEqual([[HEIGHT]]);
      expect(Constant.from_js([[LONG.toString()]]).to_js()).toEqual([
        [LONG.toString()],
      ]);
      expect(() => Constant.from_js([[(LONG + 1n).toString()]])).toThrow();
      expect(() =>
        buildAvalancheChainFee({
          ...input(),
          finalizedHeight: HEIGHT,
          activationDelay: 1,
        }),
      ).toThrow('Sigma Int');
    });
  });
});

describe('applyAvalancheChainFee', () => {
  /**
   * @target applyAvalancheChainFee binds the quote to configured chain %s
   * @dependencies Real fee conversion, build and apply functions; exact bigint/price and
   *  token-map builders and invalid-field tables; setChainConfig spy in apply rejection
   *  controls
   * @scenario
   * - Match each configured chain ID to the quote and require the expected fee
   * - Switch the quote to the other chain and apply to a spy target; require configured-chain
   *  rejection and no write
   * @expected
   * - binds the quote to configured chain %s
   */
  it.each(configuredQuoteChains)(
    'binds the quote to configured chain %s',
    (expectedChainId) => {
      const a = input();
      a.expectedChainId = expectedChainId;
      a.quote.chainId = expectedChainId;
      expect(buildAvalancheChainFee(a).fee.networkFee).toEqual(3000000000n);
      a.quote.chainId = expectedChainId === 43113n ? 43114n : 43113n;
      const target = { setChainConfig: vi.fn() };
      expect(() => applyAvalancheChainFee(target, a)).toThrow(
        'configured chain',
      );
      expect(target.setChainConfig).not.toHaveBeenCalled();
    },
  );
  /**
   * @target applyAvalancheChainFee applies one complete immutable config after validation
   * @dependencies Real fee conversion, build and apply functions; exact bigint/price and
   *  token-map builders and invalid-field tables; setChainConfig spy in apply rejection
   *  controls
   * @scenario
   * - Apply valid input once and compare the complete Avalanche config and activation height
   * - Replace caller common fees and mutate nested decimals; require the result's original
   *  bridge fee and frozen result/fee objects
   * @expected
   * - applies one complete immutable config after validation
   */
  it('applies one complete immutable config after validation', () => {
    const target = { setChainConfig: vi.fn() };
    const args = input();
    const result = applyAvalancheChainFee(target, args);
    expect(target.setChainConfig).toHaveBeenCalledExactlyOnceWith(
      'avalanche',
      105,
      {
        ...args.common,
        networkFee: 3000000000n,
      },
    );
    args.common = { ...args.common, bridgeFee: 999n };
    map(args)[0].ergo.decimals = 0;
    expect(result.fee.bridgeFee).toEqual(123n);
    expect(Object.isFrozen(result)).toEqual(true);
    expect(Object.isFrozen(result.fee)).toEqual(true);
  });
  /**
   * @target applyAvalancheChainFee rejects %s before the target is touched
   * @dependencies Real fee conversion, build and apply functions; exact bigint/price and
   *  token-map builders and invalid-field tables; setChainConfig spy in apply rejection
   *  controls
   * @scenario
   * - Apply each named fault mutator to otherwise valid input
   * - Call apply on a spy target; require rejection before any config write
   * @expected
   * - rejects %s before the target is touched
   */
  it.each(faults)(
    'rejects %s before the target is touched',
    (_name, mutate) => {
      const args = input();
      mutate(args);
      const target = { setChainConfig: vi.fn() };
      expect(() => applyAvalancheChainFee(target, args)).toThrow();
      expect(target.setChainConfig).not.toHaveBeenCalled();
    },
  );
  /**
   * @target applyAvalancheChainFee rejects an invalid target before applying a config
   * @dependencies Real fee conversion, build and apply functions; exact bigint/price and
   *  token-map builders and invalid-field tables; setChainConfig spy in apply rejection
   *  controls
   * @scenario
   * - Apply valid input to an object without setChainConfig and require target validation
   *  rejection
   * @expected
   * - rejects an invalid target before applying a config
   */
  it('rejects an invalid target before applying a config', () => {
    expect(() =>
      applyAvalancheChainFee(
        {} as Parameters<typeof applyAvalancheChainFee>[0],
        input(),
      ),
    ).toThrow('target');
  });
  describe('mapped fee asset', () => {
    /**
     * @target applyAvalancheChainFee rejects noncanonical token address %s
     * @dependencies Real fee conversion, build and apply functions; exact bigint/price and
     *  token-map builders and invalid-field tables; setChainConfig spy in apply rejection
     *  controls
     * @scenario
     * - Replace the selected mapped token address with each noncanonical value
     * - Apply to a spy target; require ERC-20 rejection before any config write
     * @expected
     * - rejects noncanonical token address %s
     */
    it.each(invalidTokenAddresses)(
      'rejects noncanonical token address %s',
      (tokenId) => {
        const a = args();
        map(a)[1].avalanche.tokenId = tokenId;
        const target = { setChainConfig: vi.fn() };
        expect(() => applyAvalancheChainFee(target, a)).toThrow('ERC-20');
        expect(target.setChainConfig).not.toHaveBeenCalled();
      },
    );
    /**
     * @target applyAvalancheChainFee rejects %s before applying
     * @dependencies Real fee conversion, build and apply functions; exact bigint/price and
     *  token-map builders and invalid-field tables; setChainConfig spy in apply rejection
     *  controls
     * @scenario
     * - Apply each mapped-asset fault mutator to the mapped input
     * - Call apply on a spy target; require rejection before any config write
     * @expected
     * - rejects %s before applying
     */
    it.each(mappedAssetMutations)(
      'rejects %s before applying',
      (_name, mutate) => {
        const a = args();
        mutate(a);
        const target = { setChainConfig: vi.fn() };
        expect(() => applyAvalancheChainFee(target, a)).toThrow();
        expect(target.setChainConfig).not.toHaveBeenCalled();
      },
    );
  });
  describe('integrity-qualified offline codec boundary', () => {
    let config: ChainFeeCodec['config'];
    let encode: ChainFeeCodec['encode'];
    let decode: ChainFeeCodec['decode'];
    let Box: ChainFeeCodec['Box'];
    let Constant: ChainFeeCodec['Constant'];
    beforeAll(async () => {
      ({ config, encode, decode, Box, Constant } = await loadChainFeeCodec());
    });
    /**
     * @target applyAvalancheChainFee round-trips real3.1.2 registers through guard4.0.1 without losing >2^53 precision
     * @dependencies Real applyAvalancheChainFee; integrity-checked minimum-fee 3.1.2
     *  serializer/config; installed Guard minimum-fee 4.0.1 parser/box and ergo-lib-wasm-nodejs
     *  0.24.1 constants
     * @scenario
     * - Apply a fee above 2^53 with 18-decimal native mapping and add an Ergo config
     * - Encode real 3.1.2 registers and decode them through the installed 4.0.1 parser; require
     *  exact config equality
     * - Read the real box consumer at the activation boundary and after it; require the boundary
     *  rejection and exact fees in both directions
     * @expected
     * - round-trips real3.1.2 registers through guard4.0.1 without losing >2^53 precision
     */
    it('round-trips real3.1.2 registers through guard4.0.1 without losing >2^53 precision', () => {
      const args = input();
      map(args)[0].ergo.decimals = 18;
      args.avaxPrice = '1';
      args.tokenPrice = '1';
      args.policy.gasBudget = 3002399751580331n;
      const result = applyAvalancheChainFee(config, args);
      expect(result.fee.networkFee).toEqual(9007199254740993n);
      config.setChainConfig('ergo', 200, { ...result.fee, networkFee: 456n });
      const constants = encode([config.getConfig()]);
      const box = {
        boxId: 'synthetic',
        additionalRegisters: Object.fromEntries(
          Object.entries(constants).map(([key, value]) => [
            key,
            value.encode_to_base16(),
          ]),
        ),
      };
      const decoder = (hex: string) => Constant.decode_from_base16(hex).to_js();
      expect(decode(box, decoder)).toEqual([config.getConfig()]);
      const consumer = new Box('synthetic', 'synthetic', {}, decoder);
      consumer.box = box;
      expect(() => consumer.getFee('avalanche', 105, 'ergo')).toThrow();
      expect(consumer.getFee('avalanche', 106, 'ergo').networkFee).toEqual(
        456n,
      );
      expect(consumer.getFee('ergo', 201, 'avalanche').networkFee).toEqual(
        9007199254740993n,
      );
    });
  });
});
