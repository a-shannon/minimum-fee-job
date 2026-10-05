import {
  calculateAvalancheFee,
  AvalancheFeePolicy,
} from '../../src/minimum-fee/avalancheFee';
import {
  AvalancheFeeQuote,
  AvalancheRpc,
} from '../../src/network/avalancheRpc';
import {
  MAX_UINT256,
  quote,
  mathCases1,
  mathCases2,
  mathCases5,
  mathCases10,
} from '../testData/avalancheFeeMath';
import { mathCases6, mathCases8 } from '../testUtils/avalancheFeeMath';

describe('calculateAvalancheFee', () => {
  /**
   * @target calculateAvalancheFee joins an RPC quote to an operator gas budget using native wei
   * @dependencies Actual integer fee calculator; actual AvalancheRpc with an injected decoded transport only in the quote-join scenario.
   * @scenario Inject chain, base-fee and zero-priority responses into the actual AvalancheRpc, await its quote, then calculate a workload of 12345 units fee.
   * @expected Returns 172830 wei from the real injected RPC quote.
   */
  it('joins an RPC quote to an operator gas budget using native wei', async () => {
    const responses: Record<string, string> = {
      eth_chainId: '0xa869',
      eth_baseFee: '0x7',
      eth_maxPriorityFeePerGas: '0x0',
    };
    const rpc = new AvalancheRpc(
      { send: vi.fn(async (method: string) => responses[method]) },
      43113n,
    );
    expect(
      calculateAvalancheFee(await rpc.getFeeQuote(), { gasBudget: 12345n }),
    ).toEqual(172830n);
  });
  /**
   * @target calculateAvalancheFee uses the guard minimum for chain %s when margin is omitted
   * @dependencies Actual integer fee calculator; actual AvalancheRpc with an injected decoded transport only in the quote-join scenario.
   * @scenario Use each documented Fuji/Mainnet chain ID with the same verified quote and a workload of 7 units, omitting only the margin.
   * @expected Returns 21 wei for both supported chain IDs.
   */
  it.each(mathCases1)(
    'uses the guard minimum for chain %s when margin is omitted',
    (chainId) => {
      expect(
        calculateAvalancheFee({ ...quote, chainId }, { gasBudget: 7n }),
      ).toEqual(21n);
    },
  );
  /**
   * @target calculateAvalancheFee rounds margin %s/%s upward to %s wei
   * @dependencies Actual integer fee calculator; actual AvalancheRpc with an injected decoded transport only in the quote-join scenario.
   * @scenario Use a one-unit workload and each documented numerator/denominator pair, then compare the exact upward-rounded wei result.
   * @expected Matches each exact expected ceiling in the documented table.
   */
  it.each(mathCases2)(
    'rounds margin %s/%s upward to %s wei',
    (numerator, denominator, expected) => {
      expect(
        calculateAvalancheFee(quote, {
          gasBudget: 1n,
          margin: { numerator, denominator },
        }),
      ).toEqual(expected);
    },
  );
  /**
   * @target calculateAvalancheFee preserves large integer precision
   * @dependencies Actual integer fee calculator; actual AvalancheRpc with an injected decoded transport only in the quote-join scenario.
   * @scenario Multiply the verified quote by a workload above Number.MAX_SAFE_INTEGER without numeric conversion.
   * @expected Returns 27021597764222979 wei without precision loss.
   */
  it('preserves large integer precision', () => {
    expect(
      calculateAvalancheFee(quote, { gasBudget: 9007199254740993n }),
    ).toEqual(27021597764222979n);
  });
  /**
   * @target calculateAvalancheFee allows a zero quoted fee without inventing a floor
   * @dependencies Actual integer fee calculator; actual AvalancheRpc with an injected decoded transport only in the quote-join scenario.
   * @scenario Supply an internally consistent zero base/tip/cap quote with a positive workload and inspect the returned fee.
   * @expected Returns exactly zero without an invented minimum.
   */
  it('allows a zero quoted fee without inventing a floor', () => {
    expect(
      calculateAvalancheFee(
        {
          ...quote,
          baseFeePerGas: 0n,
          maxPriorityFeePerGas: 0n,
          maxFeePerGas: 0n,
        },
        { gasBudget: 5n },
      ),
    ).toEqual(0n);
  });
  /**
   * @target calculateAvalancheFee rejects invalid gas budget %s
   * @dependencies Actual integer fee calculator; actual AvalancheRpc with an injected decoded transport only in the quote-join scenario.
   * @scenario Change only gasBudget to each documented invalid type or bound while preserving the verified quote.
   * @expected Rejects the isolated gas-budget field as invalid.
   */
  it.each(mathCases5)('rejects invalid gas budget %s', (gasBudget) => {
    expect(() =>
      calculateAvalancheFee(quote, { gasBudget } as AvalancheFeePolicy),
    ).toThrow('Invalid Avalanche gas budget');
  });
  /**
   * @target calculateAvalancheFee rejects invalid margin %s (%s)
   * @dependencies Actual integer fee calculator; actual AvalancheRpc with an injected decoded transport only in the quote-join scenario.
   * @scenario Generate every numerator/denominator field and invalid-value pair, change only that margin field and call the calculator.
   * @expected Rejects the isolated numerator or denominator with the matching field name.
   */
  it.each(mathCases6)('rejects invalid margin %s (%s)', (field, value) => {
    const margin = { numerator: 1n, denominator: 1n, [field]: value };
    expect(() =>
      calculateAvalancheFee(quote, {
        gasBudget: 1n,
        margin,
      } as AvalancheFeePolicy),
    ).toThrow(`Invalid Avalanche margin ${field}`);
  });
  /**
   * @target calculateAvalancheFee rejects a margin that discounts the guard cap
   * @dependencies Actual integer fee calculator; actual AvalancheRpc with an injected decoded transport only in the quote-join scenario.
   * @scenario Supply only the discounting 9/10 margin and inspect the no-discount policy failure.
   * @expected Rejects any margin below one.
   */
  it('rejects a margin that discounts the guard cap', () => {
    expect(() =>
      calculateAvalancheFee(quote, {
        gasBudget: 1n,
        margin: { numerator: 9n, denominator: 10n },
      }),
    ).toThrow('must not reduce');
  });
  /**
   * @target calculateAvalancheFee rejects malformed quote %s (%s)
   * @dependencies Actual integer fee calculator; actual AvalancheRpc with an injected decoded transport only in the quote-join scenario.
   * @scenario Generate each base, priority and max fee field with every documented invalid value, replace only that quote field and call the calculator.
   * @expected Rejects the malformed quote field without accepting coercion or overflow.
   */
  it.each(mathCases8)('rejects malformed quote %s (%s)', (field, value) => {
    expect(() =>
      calculateAvalancheFee({ ...quote, [field]: value } as AvalancheFeeQuote, {
        gasBudget: 1n,
      }),
    ).toThrow('Invalid Avalanche');
  });
  /**
   * @target calculateAvalancheFee rejects an unsupported quote chain
   * @dependencies Actual integer fee calculator; actual AvalancheRpc with an injected decoded transport only in the quote-join scenario.
   * @scenario Change only chainId to1 while retaining the verified quote and positive workload.
   * @expected Rejects the unsupported quote chain.
   */
  it('rejects an unsupported quote chain', () => {
    expect(() =>
      calculateAvalancheFee(
        { ...quote, chainId: 1n } as unknown as AvalancheFeeQuote,
        { gasBudget: 1n },
      ),
    ).toThrow('Unsupported');
  });
  /**
   * @target calculateAvalancheFee rejects a cap inconsistent with its base and tip (%s)
   * @dependencies Actual integer fee calculator; actual AvalancheRpc with an injected decoded transport only in the quote-join scenario.
   * @scenario Substitute each documented max-fee cap inconsistent with twice the base plus tip while leaving the other quote fields intact.
   * @expected Rejects both inconsistent caps.
   */
  it.each(mathCases10)(
    'rejects a cap inconsistent with its base and tip (%s)',
    (maxFeePerGas) => {
      expect(() =>
        calculateAvalancheFee({ ...quote, maxFeePerGas }, { gasBudget: 1n }),
      ).toThrow('does not match');
    },
  );
  /**
   * @target calculateAvalancheFee accepts exact uint256 output with arbitrary precision intermediate arithmetic
   * @dependencies Actual integer fee calculator; actual AvalancheRpc with an injected decoded transport only in the quote-join scenario.
   * @scenario Supply the maximum consistent uint256 quote, a one-unit workload and an equal maximum numerator/denominator so intermediates exceed uint256 but the result does not.
   * @expected Returns exactly MAX_UINT256 despite larger exact intermediates.
   */
  it('accepts exact uint256 output with arbitrary precision intermediate arithmetic', () => {
    const maximumQuote = {
      ...quote,
      baseFeePerGas: MAX_UINT256 / 2n,
      maxPriorityFeePerGas: 1n,
      maxFeePerGas: MAX_UINT256,
    };
    expect(
      calculateAvalancheFee(maximumQuote, {
        gasBudget: 1n,
        margin: { numerator: MAX_UINT256, denominator: MAX_UINT256 },
      }),
    ).toEqual(MAX_UINT256);
  });
  /**
   * @target calculateAvalancheFee rejects gas multiplication overflow
   * @dependencies Actual integer fee calculator; actual AvalancheRpc with an injected decoded transport only in the quote-join scenario.
   * @scenario Multiply the ordinary verified quote by the maximum uint256 workload and inspect final-result overflow rejection.
   * @expected Rejects the multiplied output exceeding uint256.
   */
  it('rejects gas multiplication overflow', () => {
    expect(() =>
      calculateAvalancheFee(quote, { gasBudget: MAX_UINT256 }),
    ).toThrow('exceeds uint256');
  });
  /**
   * @target calculateAvalancheFee rejects margin and ceiling overflow
   * @dependencies Actual integer fee calculator; actual AvalancheRpc with an injected decoded transport only in the quote-join scenario.
   * @scenario Supply the maximum consistent quote and a margin with denominator one below its numerator so upward rounding overflows the output.
   * @expected Rejects the ceiling-rounded output exceeding uint256.
   */
  it('rejects margin and ceiling overflow', () => {
    const maximumQuote = {
      ...quote,
      baseFeePerGas: MAX_UINT256 / 2n,
      maxPriorityFeePerGas: 1n,
      maxFeePerGas: MAX_UINT256,
    };
    expect(() =>
      calculateAvalancheFee(maximumQuote, {
        gasBudget: 1n,
        margin: { numerator: MAX_UINT256, denominator: MAX_UINT256 - 1n },
      }),
    ).toThrow('exceeds uint256');
  });
});
