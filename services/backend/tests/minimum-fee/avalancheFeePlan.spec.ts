import {
  captureAvalancheFeePlanInput,
  freezeAvalancheFeePlan,
  type AvalancheFeePlanInput,
} from '../../src/minimum-fee/avalancheFeePlan';
import { invalidAssetCases, scalarCases } from '../testData/avalancheFeePlan';
import { createPlanInput } from '../testUtils/avalancheFeePlan';

describe('freezeAvalancheFeePlan', () => {
  /**
   * @target freezeAvalancheFeePlan seals every nested native fee authority without replacing identities
   * @dependencies Actual recursive freezer and fresh native plan input; no transport or business mocks.
   * @scenario Freeze the caller graph, attempt writes to its common fee, nested map and asset list through Reflect, then inspect every retained object identity.
   * @expected The root and children retain identity and all three writes are refused.
   */
  it('seals every nested native fee authority without replacing identities', () => {
    const input = createPlanInput();
    const asset = input.assets[0];
    const common = asset.common;
    const map = input.tokenMap;
    const output = freezeAvalancheFeePlan(input);
    expect(output).toBe(input);
    expect(output.assets[0]).toBe(asset);
    expect(output.assets[0].common).toBe(common);
    expect(output.tokenMap).toBe(map);
    expect(Reflect.set(common, 'bridgeFee', 9n)).toEqual(false);
    expect(Reflect.set(map[0].avalanche, 'decimals', 6)).toEqual(false);
    expect(Reflect.set(output.assets, '0', { ...asset })).toEqual(false);
  });

  /**
   * @target freezeAvalancheFeePlan terminates on cycles and seals a shared child once
   * @dependencies Actual recursive freezer and an in-memory cyclic plain object graph.
   * @scenario Point the root back to itself and expose one common fee object under two keys, freeze the graph, then attempt a shared-child write.
   * @expected Cyclic and shared references retain identity and the child write is refused without recursion failure.
   */
  it('terminates on cycles and seals a shared child once', () => {
    const child = { bridgeFee: 1n };
    const root: { first: typeof child; second: typeof child; self?: unknown } =
      {
        first: child,
        second: child,
      };
    root.self = root;
    const output = freezeAvalancheFeePlan(root);
    expect(output.self).toBe(output);
    expect(output.first).toBe(output.second);
    expect(Reflect.set(child, 'bridgeFee', 9n)).toEqual(false);
  });

  /**
   * @target freezeAvalancheFeePlan preserves scalar authority %s
   * @dependencies Actual freezer and the documented scalarCases table.
   * @scenario Pass each null, missing, bigint, decimal-string or boolean datum directly to the freezer.
   * @expected The scalar value and type remain exact.
   */
  it.each(scalarCases)('preserves scalar authority %s', (value) => {
    expect(freezeAvalancheFeePlan(value)).toEqual(value);
  });
});

describe('captureAvalancheFeePlanInput', () => {
  /**
   * @target captureAvalancheFeePlanInput detaches all native plan authority before caller mutation
   * @dependencies Actual capture and freezer functions with a fresh native map and asset fixture.
   * @scenario Capture once, then alter the caller map decimals, prices and common fee and append an asset; inspect the captured values and attempts to modify its nested authorities.
   * @expected Caller writes succeed while the independent capture retains the initial values and refuses nested writes.
   */
  it('detaches all native plan authority before caller mutation', () => {
    const input = createPlanInput();
    const captured = captureAvalancheFeePlanInput(input);
    input.tokenMap[0].avalanche.decimals = 6;
    input.avaxPrice = '9';
    input.assets[0].tokenPrice = '8';
    input.assets[0].common.bridgeFee = 7n;
    input.assets.push({ ...input.assets[0] });
    expect(captured).not.toBe(input);
    expect(captured.tokenMap).not.toBe(input.tokenMap);
    expect(captured.assets[0].common).not.toBe(input.assets[0].common);
    expect(captured).toEqual(createPlanInput());
    expect(input.assets).toHaveLength(2);
    expect(Reflect.set(captured, 'avaxPrice', '3')).toEqual(false);
    expect(Reflect.set(captured.assets[0].common, 'bridgeFee', 3n)).toEqual(
      false,
    );
    expect(Reflect.set(captured.assets, '0', {})).toEqual(false);
    const capturedMap = captured.tokenMap as ReturnType<
      typeof createPlanInput
    >['tokenMap'];
    expect(Reflect.set(capturedMap[0].avalanche, 'decimals', 7)).toEqual(false);
  });

  /**
   * @target captureAvalancheFeePlanInput preserves exact price spellings and bigint fee units
   * @dependencies Actual capture function and fresh native plan input.
   * @scenario Capture distinct native and asset decimal spellings with bigint common fees and compare the full value graph and scalar types.
   * @expected Neither prices nor fee units are coerced during capture.
   */
  it('preserves exact price spellings and bigint fee units', () => {
    const input = createPlanInput();
    const captured = captureAvalancheFeePlanInput(input);
    expect(captured).toEqual(input);
    expect(captured.avaxPrice).toEqual('2.00');
    expect(captured.assets[0].tokenPrice).toEqual('2.0');
    expect(typeof captured.assets[0].common.bridgeFee).toEqual('bigint');
  });

  /**
   * @target captureAvalancheFeePlanInput rejects incomplete asset authority %s
   * @dependencies Actual capture function and documented invalidAssetCases table; no economic validation substitute.
   * @scenario Replace only the fresh fixture assets with each empty, missing, null, object or sparse form and invoke capture synchronously.
   * @expected Capture throws before any incomplete snapshot can reach the asynchronous consumer.
   */
  it.each(invalidAssetCases)(
    'rejects incomplete asset authority %s',
    (assets) => {
      const input = {
        ...createPlanInput(),
        assets,
      } as unknown as AvalancheFeePlanInput;
      expect(() => captureAvalancheFeePlanInput(input)).toThrow();
    },
  );

  /**
   * @target captureAvalancheFeePlanInput rejects uncloneable raw authority without freezing the caller
   * @dependencies Actual capture function and structuredClone with a function-valued raw-map member.
   * @scenario Add only an uncloneable callback to the raw map, invoke capture, then write the caller common fee through Reflect.
   * @expected Capture throws and does not freeze the original caller graph on failure.
   */
  it('rejects uncloneable raw authority without freezing the caller', () => {
    const input = createPlanInput();
    const raw = input.tokenMap as unknown as Record<string, unknown>[];
    raw[0].callback = () => undefined;
    expect(() => captureAvalancheFeePlanInput(input)).toThrow();
    expect(Reflect.set(input.assets[0].common, 'bridgeFee', 9n)).toEqual(true);
  });
});
