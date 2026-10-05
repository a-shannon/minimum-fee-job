import { readAvalancheFeeConfig } from '../../src/configs/avalancheFee';
import {
  supportedChains,
  malformedSections,
  invalidEnabledFlags,
  invalidConfiguredChains,
  invalidRpcUrls,
  invalidIntegers,
  invalidAmounts,
  invalidMargins,
} from '../testData/avalancheFee';
import { rawConfig } from '../testUtils/avalancheFee';

describe('readAvalancheFeeConfig', () => {
  /**
   * @target readAvalancheFeeConfig defaults off and never reads other disabled properties
   * @dependencies Real readAvalancheFeeConfig; rawConfig builder and explicit invalid-value
   *  tables; throwing property getters in the disabled case
   * @scenario
   * - Read the absent section, then a disabled section whose rpcUrl and margin getters throw
   * - Compare both results with the disabled config without accessing those getters
   * @expected
   * - defaults off and never reads other disabled properties
   */
  it('defaults off and never reads other disabled properties', () => {
    expect(readAvalancheFeeConfig()).toEqual({ enabled: false });
    expect(
      readAvalancheFeeConfig({
        enabled: false,
        get rpcUrl() {
          throw Error('read');
        },
        get margin() {
          throw Error('read');
        },
      }),
    ).toEqual({ enabled: false });
  });
  /**
   * @target readAvalancheFeeConfig captures immutable exact policy for %s
   * @dependencies Real readAvalancheFeeConfig; rawConfig builder and explicit invalid-value
   *  tables; throwing property getters in the disabled case
   * @scenario
   * - Parse rawConfig with each supported chain ID and compare every converted policy field
   * - Mutate the original margin numerator; check both parsed objects are frozen and retain
   *  numerator 11
   * @expected
   * - captures immutable exact policy for %s
   */
  it.each(supportedChains)(
    'captures immutable exact policy for %s',
    (chainId) => {
      const raw = { ...rawConfig(), chainId };
      const parsed = readAvalancheFeeConfig(raw);
      expect(parsed).toEqual({
        ...raw,
        chainId: BigInt(chainId),
        gasBudget: 21000n,
        margin: { numerator: 11n, denominator: 10n },
      });
      raw.margin.numerator = '999';
      expect(Object.isFrozen(parsed)).toEqual(true);
      if (parsed.enabled) {
        expect(Object.isFrozen(parsed.margin)).toEqual(true);
        expect(parsed.margin.numerator).toEqual(11n);
      }
    },
  );
  /**
   * @target readAvalancheFeeConfig rejects malformed section %s
   * @dependencies Real readAvalancheFeeConfig; rawConfig builder and explicit invalid-value
   *  tables; throwing property getters in the disabled case
   * @scenario
   * - Pass each malformed section directly to readAvalancheFeeConfig and require rejection
   * @expected
   * - rejects malformed section %s
   */
  it.each(malformedSections)('rejects malformed section %s', (raw) => {
    expect(() => readAvalancheFeeConfig(raw)).toThrow();
  });
  /**
   * @target readAvalancheFeeConfig rejects enabled %s
   * @dependencies Real readAvalancheFeeConfig; rawConfig builder and explicit invalid-value
   *  tables; throwing property getters in the disabled case
   * @scenario
   * - Replace rawConfig.enabled with each invalid flag and require an enabled validation error
   * @expected
   * - rejects enabled %s
   */
  it.each(invalidEnabledFlags)('rejects enabled %s', (enabled) => {
    expect(() => readAvalancheFeeConfig({ ...rawConfig(), enabled })).toThrow(
      'enabled',
    );
  });
  /**
   * @target readAvalancheFeeConfig rejects chain %s
   * @dependencies Real readAvalancheFeeConfig; rawConfig builder and explicit invalid-value
   *  tables; throwing property getters in the disabled case
   * @scenario
   * - Replace rawConfig.chainId with each invalid identity and require a chain validation
   *  error
   * @expected
   * - rejects chain %s
   */
  it.each(invalidConfiguredChains)('rejects chain %s', (chainId) => {
    expect(() => readAvalancheFeeConfig({ ...rawConfig(), chainId })).toThrow(
      'chain',
    );
  });
  /**
   * @target readAvalancheFeeConfig rejects URL %s
   * @dependencies Real readAvalancheFeeConfig; rawConfig builder and explicit invalid-value
   *  tables; throwing property getters in the disabled case
   * @scenario
   * - Replace rawConfig.rpcUrl with each invalid URL and require a URL validation error
   * @expected
   * - rejects URL %s
   */
  it.each(invalidRpcUrls)('rejects URL %s', (rpcUrl) => {
    expect(() => readAvalancheFeeConfig({ ...rawConfig(), rpcUrl })).toThrow(
      'URL',
    );
  });
  for (const field of ['requestTimeoutMs', 'activationDelay'] as const) {
    /**
     * @target readAvalancheFeeConfig rejects ${field} %s
     * @dependencies Real readAvalancheFeeConfig; rawConfig builder and explicit invalid-value
     *  tables; throwing property getters in the disabled case
     * @scenario
     * - Replace requestTimeoutMs or activationDelay with each invalid integer and require
     *  rejection
     * @expected
     * - rejects ${field} %s
     */
    it.each(invalidIntegers)('rejects ' + field + ' %s', (value) => {
      expect(() =>
        readAvalancheFeeConfig({ ...rawConfig(), [field]: value }),
      ).toThrow();
    });
  }
  /**
   * @target readAvalancheFeeConfig enforces the distinct timer and height zero bounds
   * @dependencies Real readAvalancheFeeConfig; rawConfig builder and explicit invalid-value
   *  tables; throwing property getters in the disabled case
   * @scenario
   * - Reject a zero request timeout
   * - Parse the maximum Node timer timeout with zero activation delay and compare both
   *  retained bounds
   * @expected
   * - enforces the distinct timer and height zero bounds
   */
  it('enforces the distinct timer and height zero bounds', () => {
    expect(() =>
      readAvalancheFeeConfig({ ...rawConfig(), requestTimeoutMs: 0 }),
    ).toThrow('timeout');
    expect(
      readAvalancheFeeConfig({
        ...rawConfig(),
        requestTimeoutMs: 2147483647,
        activationDelay: 0,
      }),
    ).toMatchObject({ requestTimeoutMs: 2147483647, activationDelay: 0 });
  });
  for (const field of ['gasBudget', 'numerator', 'denominator'] as const) {
    /**
     * @target readAvalancheFeeConfig rejects ${field} %s
     * @dependencies Real readAvalancheFeeConfig; rawConfig builder and explicit invalid-value
     *  tables; throwing property getters in the disabled case
     * @scenario
     * - Replace gasBudget, or the margin numerator or denominator, with each invalid amount
     *  and require rejection
     * @expected
     * - rejects ${field} %s
     */
    it.each(invalidAmounts)('rejects ' + field + ' %s', (value) => {
      const raw = rawConfig();
      const changed =
        field === 'gasBudget'
          ? { ...raw, gasBudget: value }
          : { ...raw, margin: { ...raw.margin, [field]: value } };
      expect(() => readAvalancheFeeConfig(changed)).toThrow();
    });
  }
  /**
   * @target readAvalancheFeeConfig requires explicit margin %s
   * @dependencies Real readAvalancheFeeConfig; rawConfig builder and explicit invalid-value
   *  tables; throwing property getters in the disabled case
   * @scenario
   * - Replace the entire margin with each missing or malformed margin and require rejection
   * @expected
   * - requires explicit margin %s
   */
  it.each(invalidMargins)('requires explicit margin %s', (margin) => {
    expect(() => readAvalancheFeeConfig({ ...rawConfig(), margin })).toThrow();
  });
  /**
   * @target readAvalancheFeeConfig accepts max uint256 and rejects a reducing margin
   * @dependencies Real readAvalancheFeeConfig; rawConfig builder and explicit invalid-value
   *  tables; throwing property getters in the disabled case
   * @scenario
   * - Parse maximum uint256 gas budget and equal maximum margin operands
   * - Reject a margin of 9/10 because it reduces the quoted fee
   * @expected
   * - accepts max uint256 and rejects a reducing margin
   */
  it('accepts max uint256 and rejects a reducing margin', () => {
    const max = ((1n << 256n) - 1n).toString();
    expect(
      readAvalancheFeeConfig({
        ...rawConfig(),
        gasBudget: max,
        margin: { numerator: max, denominator: max },
      }),
    ).toMatchObject({ gasBudget: BigInt(max) });
    expect(() =>
      readAvalancheFeeConfig({
        ...rawConfig(),
        margin: { numerator: '9', denominator: '10' },
      }),
    ).toThrow('reduce');
  });
});
