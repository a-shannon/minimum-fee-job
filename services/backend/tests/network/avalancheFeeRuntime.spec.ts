import { FetchRequest, JsonRpcProvider, version } from 'ethers';
import { createServer } from 'node:http';

import type { AvalancheFeePlanInput } from '../../src/minimum-fee/avalancheFeePlan';
import {
  AvalancheFeeRuntime,
  AvalancheFeeCollectionInput,
} from '../../src/network/avalancheFeeRuntime';
import { transport } from '../mocked/avalancheFeeRuntime.mock';
import { failedCollectionReplies } from '../testData/avalancheFeeRuntime';
import { values } from '../testData/avalancheFeeRuntime';
import {
  nativeErgo,
  tokenErgo,
  values as planValues,
  planCases1,
  planCases2,
  planCases3,
  planCases4,
  planCases8,
} from '../testData/avalancheFeeRuntimePlan';
import { config, input } from '../testUtils/avalancheFeeRuntime';
import { invalidPreflightMutations } from '../testUtils/avalancheFeeRuntimeCases';
import {
  common as planCommon,
  input as planInput,
  setup as planSetup,
} from '../testUtils/avalancheFeeRuntimePlan';

describe('AvalancheFeeRuntime', () => {
  describe('collect', () => {
    /**
     * @target AvalancheFeeRuntime.collect applies the actual quote rather than the preflight validation cap
     * @dependencies Real AvalancheFeeRuntime and fee/RPC validation; config and input
     *  builders; vi.fn transport and setChainConfig sink
     * @scenario
     * - Create the runtime with a large gas budget and collect through the synthetic transport
     * - Compare the returned and written network fee with the actual quote, then dispose the
     *  runtime
     * @expected
     * - applies the actual quote rather than the preflight validation cap
     */
    it('applies the actual quote rather than the preflight validation cap', async () => {
      const rpc = transport();
      const runtime = new AvalancheFeeRuntime(
        { ...config(), gasBudget: '1000000000000000000' },
        () => rpc,
      );
      const target = { setChainConfig: vi.fn() };
      expect(await runtime.collect(target, input())).toMatchObject({
        fee: { networkFee: 36300000000n },
      });
      expect(target.setChainConfig.mock.calls[0][2].networkFee).toEqual(
        36300000000n,
      );
      runtime.dispose();
    });
    /**
     * @target AvalancheFeeRuntime.collect isolates nested token and common fields and prices across the RPC await
     * @dependencies Real AvalancheFeeRuntime and fee/RPC validation; config and input
     *  builders; vi.fn transport and setChainConfig sink
     * @scenario
     * - Pause the first identity reply and start collect
     * - Change nested Ergo decimals, bridgeFee and both prices on the caller's input
     * - Release the configured chain ID; require the original network and bridge fees, then
     *  dispose
     * @expected
     * - isolates nested token and common fields and prices across the RPC await
     */
    it('isolates nested token and common fields and prices across the RPC await', async () => {
      let resolve!: (value: unknown) => void;
      const rpc = transport();
      rpc.send.mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
      const runtime = new AvalancheFeeRuntime(
          { ...config(), gasBudget: '1000000000000000000' },
          () => rpc,
        ),
        a = input(),
        target = { setChainConfig: vi.fn() };
      const result = runtime.collect(target, a);
      (a.tokenMap as { ergo: { decimals: number } }[])[0].ergo.decimals = 0;
      Reflect.set(a.common, 'bridgeFee', 999n);
      a.avaxPrice = '2';
      a.tokenPrice = '3';
      resolve('0xa869');
      expect(await result).toMatchObject({
        fee: { networkFee: 36300000000n, bridgeFee: 1n },
      });
      runtime.dispose();
    });
    /**
     * @target AvalancheFeeRuntime.collect drops a fee reply received after disposal at the final await
     * @dependencies Real AvalancheFeeRuntime and fee/RPC validation; config and input
     *  builders; vi.fn transport and setChainConfig sink
     * @scenario
     * - Pause eth_maxPriorityFeePerGas and start collect
     * - Wait until the final RPC barrier is reached; dispose the runtime and release the fee
     *  reply
     * - Require disposed rejection, zero sink writes and exactly five RPC calls
     * @expected
     * - drops a fee reply received after disposal at the final await
     */
    it('drops a fee reply received after disposal at the final await', async () => {
      let resolve!: (value: unknown) => void, reached!: () => void;
      const pending = new Promise<void>((done) => {
        reached = done;
      });
      const rpc = transport();
      rpc.send.mockImplementation(async (method) => {
        if (method === 'eth_maxPriorityFeePerGas') {
          reached();
          return new Promise((done) => {
            resolve = done;
          });
        }
        return structuredClone(values[method]);
      });
      const runtime = new AvalancheFeeRuntime(config(), () => rpc),
        target = { setChainConfig: vi.fn() };
      const result = runtime.collect(target, input());
      await pending;
      runtime.dispose();
      resolve('0x1');
      await expect(result).rejects.toThrow('disposed');
      expect(target.setChainConfig).not.toHaveBeenCalled();
      expect(rpc.send).toHaveBeenCalledTimes(5);
    });
    /**
     * @target AvalancheFeeRuntime.collect is inert when disabled and does not read caller input
     * @dependencies Real AvalancheFeeRuntime and fee/RPC validation; config and input
     *  builders; vi.fn transport and setChainConfig sink
     * @scenario
     * - Construct a disabled runtime with a throwing rpcUrl getter and a transport factory spy
     * - Call collect with null input; require disabled rejection and no factory call, then
     *  dispose
     * @expected
     * - is inert when disabled and does not read caller input
     */
    it('is inert when disabled and does not read caller input', async () => {
      const factory = vi.fn();
      const runtime = new AvalancheFeeRuntime(
        {
          enabled: false,
          get rpcUrl() {
            throw Error('read');
          },
        },
        factory,
      );
      expect(factory).not.toHaveBeenCalled();
      await expect(
        runtime.collect(
          { setChainConfig: vi.fn() },
          null as unknown as AvalancheFeeCollectionInput,
        ),
      ).rejects.toThrow('disabled');
      runtime.dispose();
    });
    /**
     * @target AvalancheFeeRuntime.collect passes timeout before provider cloning and preserves the configured URL
     * @dependencies Real AvalancheFeeRuntime and ethers FetchRequest; factory spy returning
     *  the transport helper; config/input builders and setChainConfig spy
     * @scenario
     * - Inspect the factory's FetchRequest timeout, exact URL and chain ID before any send
     * - Mutate the caller's chain, margin and activation delay; collect and compare the
     *  original policy result and five RPC calls
     * - Dispose twice and require exactly one transport destroy
     * @expected
     * - passes timeout before provider cloning and preserves the configured URL
     */
    it('passes timeout before provider cloning and preserves the configured URL', async () => {
      const rpc = transport(),
        raw = config();
      raw.rpcUrl = 'https://rpc.invalid/exact?token=test';
      const factory = vi.fn((request: FetchRequest, id: bigint) => {
        expect(request.timeout).toEqual(100);
        expect(request.url).toEqual(raw.rpcUrl);
        expect(id).toEqual(43113n);
        return rpc;
      });
      const runtime = new AvalancheFeeRuntime(raw, factory);
      expect(rpc.send).not.toHaveBeenCalled();
      raw.chainId = 43114;
      raw.margin.numerator = '999';
      raw.activationDelay = 900;
      const target = { setChainConfig: vi.fn() };
      expect(await runtime.collect(target, input())).toMatchObject({
        activationHeight: 105,
        fee: { networkFee: 1n },
      });
      expect(target.setChainConfig).toHaveBeenCalledTimes(1);
      expect(rpc.send.mock.calls).toEqual([
        ['eth_chainId', []],
        ['eth_getBlockByNumber', ['finalized', false]],
        ['eth_chainId', []],
        ['eth_baseFee', []],
        ['eth_maxPriorityFeePerGas', []],
      ]);
      runtime.dispose();
      runtime.dispose();
      expect(rpc.destroy).toHaveBeenCalledTimes(1);
    });
    /**
     * @target AvalancheFeeRuntime.collect rejects invalid %s without RPC
     * @dependencies Real AvalancheFeeRuntime and fee/RPC validation; config and input
     *  builders; vi.fn transport and setChainConfig sink
     * @scenario
     * - Mutate each named preflight field on input and call collect
     * - Require rejection with no RPC or sink write, then dispose
     * @expected
     * - rejects invalid %s without RPC
     */
    it.each(invalidPreflightMutations)(
      'rejects invalid %s without RPC',
      async (_name, mutate) => {
        const rpc = transport(),
          runtime = new AvalancheFeeRuntime(config(), () => rpc),
          a = input();
        mutate(a);
        const target = { setChainConfig: vi.fn() };
        await expect(runtime.collect(target, a)).rejects.toThrow();
        expect(rpc.send).not.toHaveBeenCalled();
        expect(target.setChainConfig).not.toHaveBeenCalled();
        runtime.dispose();
      },
    );
    /**
     * @target AvalancheFeeRuntime.collect does not apply on %s failure
     * @dependencies Real AvalancheFeeRuntime and fee/RPC validation; config and input
     *  builders; vi.fn transport and setChainConfig sink
     * @scenario
     * - Override each failed collection reply and call collect
     * - Require rejection, no sink write and no latest request, then dispose
     * @expected
     * - does not apply on %s failure
     */
    it.each(failedCollectionReplies)(
      'does not apply on %s failure',
      async (_name, overrides) => {
        const rpc = transport(overrides),
          runtime = new AvalancheFeeRuntime(config(), () => rpc),
          target = { setChainConfig: vi.fn() };
        await expect(runtime.collect(target, input())).rejects.toThrow();
        expect(target.setChainConfig).not.toHaveBeenCalled();
        expect(
          rpc.send.mock.calls.some((call) => call[1].includes('latest')),
        ).toEqual(false);
        runtime.dispose();
      },
    );
    /**
     * @target AvalancheFeeRuntime.collect rejects a chain switch between finalized and quote checks
     * @dependencies Real AvalancheFeeRuntime and fee/RPC validation; config and input
     *  builders; vi.fn transport and setChainConfig sink
     * @scenario
     * - Return Fuji for the first identity check and mainnet for the check after the finalized
     *  block
     * - Require mismatch rejection after three calls, no sink write, then dispose
     * @expected
     * - rejects a chain switch between finalized and quote checks
     */
    it('rejects a chain switch between finalized and quote checks', async () => {
      const rpc = transport();
      let checks = 0;
      rpc.send.mockImplementation(async (method) =>
        method === 'eth_chainId'
          ? ++checks === 1
            ? '0xa869'
            : '0xa86a'
          : structuredClone(values[method]),
      );
      const runtime = new AvalancheFeeRuntime(config(), () => rpc),
        target = { setChainConfig: vi.fn() };
      await expect(runtime.collect(target, input())).rejects.toThrow(
        'mismatch',
      );
      expect(target.setChainConfig).not.toHaveBeenCalled();
      expect(rpc.send).toHaveBeenCalledTimes(3);
      runtime.dispose();
    });
    /**
     * @target AvalancheFeeRuntime.collect snapshots values before awaiting RPC and drops disposed work
     * @dependencies Real AvalancheFeeRuntime and fee/RPC validation; config and input
     *  builders; vi.fn transport and setChainConfig sink
     * @scenario
     * - Pause identity, start collect, then replace the selected token, common fees and token
     *  map
     * - Release identity and require the captured original bridge fee to be written
     * - Pause a second collect, dispose and release identity; require disposed rejection with
     *  one second-pass RPC and no extra write
     * @expected
     * - snapshots values before awaiting RPC and drops disposed work
     */
    it('snapshots values before awaiting RPC and drops disposed work', async () => {
      let resolve!: (v: unknown) => void;
      const rpc = transport();
      rpc.send.mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
      const runtime = new AvalancheFeeRuntime(config(), () => rpc),
        a = input(),
        target = { setChainConfig: vi.fn() };
      const promise = runtime.collect(target, a);
      a.selectedTokenId = 'missing';
      a.common = { ...a.common, bridgeFee: 999n };
      a.tokenMap = [];
      resolve('0xa869');
      await promise;
      expect(target.setChainConfig.mock.calls[0][2].bridgeFee).toEqual(1n);
      rpc.send.mockClear();
      rpc.send.mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
      const late = runtime.collect(target, input());
      runtime.dispose();
      resolve('0xa869');
      await expect(late).rejects.toThrow('disposed');
      expect(rpc.send).toHaveBeenCalledTimes(1);
      expect(target.setChainConfig).toHaveBeenCalledTimes(1);
    });
    /**
     * @target AvalancheFeeRuntime.collect uses real ethers timeout for an outbound stalled loopback HTTP request
     * @dependencies Real AvalancheFeeRuntime with ethers 6.16.0; stalled node:http server
     *  bound to loopback; input builder and setChainConfig spy
     * @scenario
     * - Verify ethers 6.16.0 and start a loopback server that receives requests without
     *  replying
     * - Construct with a 70 ms timeout; wait 20 ms and require no eager request
     * - Call collect; require timeout within two seconds, one request and no sink write
     * - Dispose, close connections and await server shutdown in finally
     * @expected
     * - uses real ethers timeout for an outbound stalled loopback HTTP request
     */
    it('uses real ethers timeout for an outbound stalled loopback HTTP request', async () => {
      expect(version).toEqual('6.16.0');
      let requests = 0;
      const server = createServer(() => {
        requests++;
      });
      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', resolve),
      );
      const address = server.address();
      if (!address || typeof address === 'string') throw Error('listener');
      const runtime = new AvalancheFeeRuntime({
        ...config(),
        rpcUrl: `http://127.0.0.1:${address.port}`,
        requestTimeoutMs: 70,
      });
      try {
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(requests).toEqual(0);
        const target = { setChainConfig: vi.fn() },
          start = performance.now();
        await expect(runtime.collect(target, input())).rejects.toThrow(
          /timeout/i,
        );
        expect(performance.now() - start).toBeLessThan(2000);
        expect(requests).toEqual(1);
        expect(target.setChainConfig).not.toHaveBeenCalled();
      } finally {
        runtime.dispose();
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
    /**
     * @target AvalancheFeeRuntime.collect captures the intended consumer method before the RPC await
     * @dependencies Real AvalancheFeeRuntime and fee/RPC validation; config and input
     *  builders; vi.fn transport and setChainConfig sink
     * @scenario
     * - Pause identity and start collect with the original setChainConfig spy
     * - Replace that method on the target; release identity and await collection
     * - Require one call to the captured original method and zero to its replacement, then
     *  dispose
     * @expected
     * - captures the intended consumer method before the RPC await
     */
    it('captures the intended consumer method before the RPC await', async () => {
      let resolve!: (value: unknown) => void;
      const rpc = transport();
      rpc.send.mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
      const runtime = new AvalancheFeeRuntime(config(), () => rpc);
      const original = vi.fn();
      const target = { setChainConfig: original };
      const result = runtime.collect(target, input());
      target.setChainConfig = vi.fn();
      resolve('0xa869');
      await result;
      expect(original).toHaveBeenCalledTimes(1);
      expect(target.setChainConfig).not.toHaveBeenCalled();
      runtime.dispose();
    });
    /**
     * @target AvalancheFeeRuntime.collect rejects after disposal without further RPC
     * @dependencies Real AvalancheFeeRuntime and fee/RPC validation; config and input
     *  builders; vi.fn transport and setChainConfig sink
     * @scenario
     * - Dispose the runtime before collect; require disposed rejection and no RPC send
     * @expected
     * - rejects after disposal without further RPC
     */
    it('rejects after disposal without further RPC', async () => {
      const rpc = transport();
      const runtime = new AvalancheFeeRuntime(config(), () => rpc);
      runtime.dispose();
      await expect(
        runtime.collect({ setChainConfig: vi.fn() }, input()),
      ).rejects.toThrow('disposed');
      expect(rpc.send).not.toHaveBeenCalled();
    });
    /**
     * @target AvalancheFeeRuntime.collect requires finalized support instead of falling back
     * @dependencies Real AvalancheFeeRuntime and fee/RPC validation; config and input
     *  builders; vi.fn transport and setChainConfig sink
     * @scenario
     * - Throw unsupported finalized from eth_getBlockByNumber during collect
     * - Require that rejection, no sink write and exactly identity plus finalized calls, then
     *  dispose
     * @expected
     * - requires finalized support instead of falling back
     */
    it('requires finalized support instead of falling back', async () => {
      const rpc = transport();
      rpc.send.mockImplementation(async (method) => {
        if (method === 'eth_getBlockByNumber')
          throw Error('unsupported finalized');
        return values[method];
      });
      const runtime = new AvalancheFeeRuntime(config(), () => rpc),
        target = { setChainConfig: vi.fn() };
      await expect(runtime.collect(target, input())).rejects.toThrow(
        'unsupported finalized',
      );
      expect(target.setChainConfig).not.toHaveBeenCalled();
      expect(rpc.send).toHaveBeenCalledTimes(2);
      runtime.dispose();
    });
    /**
     * @target AvalancheFeeRuntime.collect collects exactly once through real HTTP on the configured mainnet identity
     * @dependencies Real AvalancheFeeRuntime and ethers HTTP transport; node:http JSON-RPC
     *  server bound to loopback; synthetic replies and setChainConfig spy
     * @scenario
     * - Start a loopback JSON-RPC server returning mainnet identity and record all method
     *  names
     * - Construct a mainnet runtime on that URL and collect once; compare activation height,
     *  fee, five-method order and one sink write
     * - Dispose, close connections and await server shutdown in finally
     * @expected
     * - collects exactly once through real HTTP on the configured mainnet identity
     */
    it('collects exactly once through real HTTP on the configured mainnet identity', async () => {
      const methods: string[] = [];
      const server = createServer((request, response) => {
        let body = '';
        request.on('data', (chunk) => {
          body += chunk;
        });
        request.on('end', () => {
          const payload = JSON.parse(body);
          methods.push(payload.method);
          response.setHeader('content-type', 'application/json');
          response.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id: payload.id,
              result:
                payload.method === 'eth_chainId'
                  ? '0xa86a'
                  : values[payload.method],
            }),
          );
        });
      });
      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', resolve),
      );
      const address = server.address();
      if (!address || typeof address === 'string') throw Error('listener');
      const runtime = new AvalancheFeeRuntime({
        ...config(),
        chainId: 43114,
        rpcUrl: `http://127.0.0.1:${address.port}`,
        requestTimeoutMs: 1000,
      });
      try {
        const target = { setChainConfig: vi.fn() };
        expect(await runtime.collect(target, input())).toMatchObject({
          activationHeight: 105,
          fee: { networkFee: 1n },
        });
        expect(methods).toEqual([
          'eth_chainId',
          'eth_getBlockByNumber',
          'eth_chainId',
          'eth_baseFee',
          'eth_maxPriorityFeePerGas',
        ]);
        expect(target.setChainConfig).toHaveBeenCalledTimes(1);
      } finally {
        runtime.dispose();
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });

  describe('constructor', () => {
    /**
     * @target AvalancheFeeRuntime.constructor validates before creating a transport
     * @dependencies Real AvalancheFeeRuntime and fee/RPC validation; config and input
     *  builders; vi.fn transport and setChainConfig sink
     * @scenario
     * - Construct with zero requestTimeoutMs and a factory spy; require config rejection
     *  before the factory runs
     * @expected
     * - validates before creating a transport
     */
    it('validates before creating a transport', () => {
      const factory = vi.fn();
      expect(
        () =>
          new AvalancheFeeRuntime(
            { ...config(), requestTimeoutMs: 0 },
            factory,
          ),
      ).toThrow();
      expect(factory).not.toHaveBeenCalled();
    });
  });
  describe('collectPlan', () => {
    const common = planCommon,
      input = planInput,
      setup = planSetup,
      values = planValues;
    /**
     * @target AvalancheFeeRuntime.collectPlan returns a complete deeply immutable plan from one quote and frontier
     * @dependencies Actual AvalancheFeeRuntime, RPC identity/quantity validation, capture/fee plan producers and integer conversion; injected decoded transport replies and a setter spy only in the exclusivity scenario.
     * @scenario Construct an actual runtime with a two-asset input, collect once, compare both exact fees and the five ordered RPC calls, attempt writes into the frozen plan, then dispose.
     * @expected Returns both exact frozen asset rows from one quote/frontier and refuses nested writes.
     */
    it('returns a complete deeply immutable plan from one quote and frontier', async () => {
      const { runtime, transport } = setup();
      const plan = await runtime.collectPlan(input());
      expect(plan.assets).toEqual([
        {
          selectedTokenId: 'avax',
          ergoTokenId: nativeErgo,
          activationHeight: 105,
          fee: { ...common(), networkFee: 33000000000n },
        },
        {
          selectedTokenId: tokenErgo,
          ergoTokenId: tokenErgo,
          activationHeight: 105,
          fee: { ...common(), networkFee: 132000000n },
        },
      ]);
      expect(transport.send.mock.calls).toEqual([
        ['eth_chainId', []],
        ['eth_getBlockByNumber', ['finalized', false]],
        ['eth_chainId', []],
        ['eth_baseFee', []],
        ['eth_maxPriorityFeePerGas', []],
      ]);
      for (const item of [
        plan,
        plan.assets,
        plan.quote,
        plan.finalized,
        ...plan.assets,
        ...plan.assets.map((a) => a.fee),
      ])
        expect(Object.isFrozen(item)).toEqual(true);
      expect(Reflect.set(plan.assets[0], 'selectedTokenId', 'other')).toEqual(
        false,
      );
      expect(Reflect.set(plan.assets[1].fee, 'networkFee', 1n)).toEqual(false);
      runtime.dispose();
    });
    /**
     * @target AvalancheFeeRuntime.collectPlan rejects a Number %s before any RPC
     * @dependencies Actual AvalancheFeeRuntime, RPC identity/quantity validation, capture/fee plan producers and integer conversion; injected decoded transport replies and a setter spy only in the exclusivity scenario.
     * @scenario Change only the documented native or asset decimal price to Number, invoke collectPlan, inspect rejection and zero RPC calls, then dispose.
     * @expected Rejects price coercion without RPC.
     */
    it.each(planCases1)('rejects a Number %s before any RPC', async (field) => {
      const { runtime, transport } = setup();
      const a = input();
      if (field === 'avaxPrice') Reflect.set(a, 'avaxPrice', 2);
      else Reflect.set(a.assets[1], 'tokenPrice', 0.5);
      await expect(runtime.collectPlan(a)).rejects.toThrow();
      expect(transport.send).not.toHaveBeenCalled();
      runtime.dispose();
    });
    /**
     * @target AvalancheFeeRuntime.collectPlan validates the last asset before RPC: %s
     * @dependencies Actual AvalancheFeeRuntime, RPC identity/quantity validation, capture/fee plan producers and integer conversion; injected decoded transport replies and a setter spy only in the exclusivity scenario.
     * @scenario Change only the last asset price, selected token, Ergo decimals or rsnRatio named by the table; invoke collectPlan, inspect rejection before RPC, then dispose.
     * @expected Rejects each isolated last-asset fault without returning a partial plan or issuing RPC.
     */
    it.each(planCases2)(
      'validates the last asset before RPC: %s',
      async (fault) => {
        const { runtime, transport } = setup(),
          a = input();
        if (fault === 'missing price')
          Reflect.set(a.assets[1], 'tokenPrice', undefined);
        if (fault === 'invalid token')
          Reflect.set(a.assets[1], 'selectedTokenId', 'missing');
        if (fault === 'invalid decimals')
          (a.tokenMap as { ergo: { decimals: number } }[])[1].ergo.decimals =
            -1;
        if (fault === 'invalid common')
          Reflect.set(a.assets[1].common, 'rsnRatio', 0n);
        await expect(runtime.collectPlan(a)).rejects.toThrow();
        expect(transport.send).not.toHaveBeenCalled();
        runtime.dispose();
      },
    );
    /**
     * @target AvalancheFeeRuntime.collectPlan rejects duplicate asset target through %s alias
     * @dependencies Actual AvalancheFeeRuntime, RPC identity/quantity validation, capture/fee plan producers and integer conversion; injected decoded transport replies and a setter spy only in the exclusivity scenario.
     * @scenario Replace the asset array with two native rows using the documented Avalanche or Ergo alias, invoke collectPlan and inspect duplicate-target rejection before RPC.
     * @expected Rejects both aliases of the duplicate native target before RPC.
     */
    it.each(planCases3)(
      'rejects duplicate asset target through %s alias',
      async (selectedTokenId) => {
        const { runtime, transport } = setup(),
          a = input();
        Reflect.set(a, 'assets', [
          a.assets[0],
          { ...a.assets[0], selectedTokenId },
        ]);
        await expect(runtime.collectPlan(a)).rejects.toThrow('Duplicate');
        expect(transport.send).not.toHaveBeenCalled();
        runtime.dispose();
      },
    );
    /**
     * @target AvalancheFeeRuntime.collectPlan rejects empty or malformed assets
     * @dependencies Actual AvalancheFeeRuntime, RPC identity/quantity validation, capture/fee plan producers and integer conversion; injected decoded transport replies and a setter spy only in the exclusivity scenario.
     * @scenario Replace only the assets array with the documented empty, sparse, missing or null form, invoke collectPlan and inspect rejection before RPC.
     * @expected Rejects all malformed asset arrays before RPC.
     */
    it.each(planCases4)('rejects empty or malformed assets', async (assets) => {
      const { runtime, transport } = setup();
      await expect(
        runtime.collectPlan({ ...input(), assets } as AvalancheFeePlanInput),
      ).rejects.toThrow();
      expect(transport.send).not.toHaveBeenCalled();
      runtime.dispose();
    });
    /**
     * @target AvalancheFeeRuntime.collectPlan returns no partial result when only the actual quote overflows the last asset
     * @dependencies Actual AvalancheFeeRuntime, RPC identity/quantity validation, capture/fee plan producers and integer conversion; injected decoded transport replies and a setter spy only in the exclusivity scenario.
     * @scenario Make only the last asset price small enough to pass minimum-cap preflight but overflow Sigma Long under the actual cap; collect, inspect all five reads and rejection, then retry a valid two-asset batch.
     * @expected Rejects the entire overflowing plan and permits a later valid retry.
     */
    it('returns no partial result when only the actual quote overflows the last asset', async () => {
      const { runtime, transport } = setup(),
        a = input();
      Reflect.set(a.assets[1], 'tokenPrice', '0.000000000001');
      // Minimum-cap preflight: 2e18 units; actual cap33: 66e18 exceeds signed64.
      await expect(runtime.collectPlan(a)).rejects.toThrow('Sigma Long');
      expect(transport.send).toHaveBeenCalledTimes(5);
      expect((await runtime.collectPlan(input())).assets).toHaveLength(2);
      runtime.dispose();
    });
    /**
     * @target AvalancheFeeRuntime.collectPlan captures all nested assets and one shared price/map before awaiting
     * @dependencies Actual AvalancheFeeRuntime, RPC identity/quantity validation, capture/fee plan producers and integer conversion; injected decoded transport replies and a setter spy only in the exclusivity scenario.
     * @scenario Pause the first identity reply, start collectPlan, mutate the caller native price, asset price, bridgeFee, Ergo decimals and asset array, release Fuji identity and inspect the original captured fee fields.
     * @expected Retains the original captured bridge and converted asset fees despite caller mutation.
     */
    it('captures all nested assets and one shared price/map before awaiting', async () => {
      const { runtime, transport } = setup();
      let resolve!: (v: unknown) => void;
      transport.send.mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
      const a = input(),
        pending = runtime.collectPlan(a);
      Reflect.set(a, 'avaxPrice', '999');
      Reflect.set(a.assets[1], 'tokenPrice', '999');
      Reflect.set(a.assets[0].common, 'bridgeFee', 999n);
      (a.tokenMap as { ergo: { decimals: number } }[])[1].ergo.decimals = 0;
      Reflect.set(a, 'assets', []);
      resolve('0xa869');
      const plan = await pending;
      expect(plan.assets[0].fee.bridgeFee).toEqual(1n);
      expect(plan.assets[1].fee.networkFee).toEqual(132000000n);
      runtime.dispose();
    });
    /**
     * @target AvalancheFeeRuntime.collectPlan rejects simultaneous batch and single collections without accessing the second input
     * @dependencies Actual AvalancheFeeRuntime, RPC identity/quantity validation, capture/fee plan producers and integer conversion; injected decoded transport replies and a setter spy only in the exclusivity scenario.
     * @scenario Pause the first identity reply and start a batch; attempt a null batch and a null single collection while pending, inspect zero setter calls and only one identity send, then release and verify recovery.
     * @expected Rejects concurrent collectors without reading their invalid input and recovers after the first completes.
     */
    it('rejects simultaneous batch and single collections without accessing the second input', async () => {
      const { runtime, transport } = setup();
      let resolve!: (v: unknown) => void;
      transport.send.mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
      const first = runtime.collectPlan(input());
      await expect(
        runtime.collectPlan(null as unknown as AvalancheFeePlanInput),
      ).rejects.toThrow('in progress');
      const target = { setChainConfig: vi.fn() };
      await expect(runtime.collect(target, null as never)).rejects.toThrow(
        'in progress',
      );
      expect(target.setChainConfig).not.toHaveBeenCalled();
      expect(transport.send).toHaveBeenCalledTimes(1);
      resolve('0xa869');
      await first;
      await expect(runtime.collectPlan(input())).resolves.toBeDefined();
      runtime.dispose();
    });
    /**
     * @target AvalancheFeeRuntime.collectPlan rejects a later finalized %s before fetching another quote
     * @dependencies Actual AvalancheFeeRuntime, RPC identity/quantity validation, capture/fee plan producers and integer conversion; injected decoded transport replies and a setter spy only in the exclusivity scenario.
     * @scenario Complete one batch, clear RPC calls, substitute only a lower finalized height or conflicting same-height hash, then attempt another batch and inspect rejection after the two identity/block reads.
     * @expected Rejects stale or conflicting frontiers before another quote is queried.
     */
    it.each(planCases8)(
      'rejects a later finalized %s before fetching another quote',
      async (fault) => {
        const { runtime, transport, state } = setup();
        await runtime.collectPlan(input());
        transport.send.mockClear();
        state.eth_getBlockByNumber = {
          number: fault === 'regression' ? '0x63' : '0x64',
          hash:
            fault === 'conflict'
              ? '0x' + '34'.repeat(32)
              : '0x' + '12'.repeat(32),
        };
        await expect(runtime.collectPlan(input())).rejects.toThrow('frontier');
        expect(transport.send).toHaveBeenCalledTimes(2);
        runtime.dispose();
      },
    );
    /**
     * @target AvalancheFeeRuntime.collectPlan accepts same frontier with a fresh quote and a later height
     * @dependencies Actual AvalancheFeeRuntime, RPC identity/quantity validation, capture/fee plan producers and integer conversion; injected decoded transport replies and a setter spy only in the exclusivity scenario.
     * @scenario Complete a batch, raise only baseFee at the same frontier and collect a fresh quote; then advance height/hash and inspect the later activation height.
     * @expected Accepts a fresh quote at the same frontier and a later finalized activation height.
     */
    it('accepts same frontier with a fresh quote and a later height', async () => {
      const { runtime, state } = setup();
      await runtime.collectPlan(input());
      state.eth_baseFee = '0x20';
      expect(
        (await runtime.collectPlan(input())).assets[0].fee.networkFee,
      ).toEqual(65000000000n);
      state.eth_getBlockByNumber = {
        number: '0x65',
        hash: '0x' + '34'.repeat(32),
      };
      expect(
        (await runtime.collectPlan(input())).assets[0].activationHeight,
      ).toEqual(106);
      runtime.dispose();
    });
    /**
     * @target AvalancheFeeRuntime.collectPlan does not advance successful-plan history after a failed quote
     * @dependencies Actual AvalancheFeeRuntime, RPC identity/quantity validation, capture/fee plan producers and integer conversion; injected decoded transport replies and a setter spy only in the exclusivity scenario.
     * @scenario Complete a batch, advance the frontier and return malformed baseFee so collection fails; then retry at an intermediate later valid frontier and inspect successful recovery.
     * @expected Does not commit failed quote history; accepts the intermediate valid frontier.
     */
    it('does not advance successful-plan history after a failed quote', async () => {
      const { runtime, state } = setup();
      await runtime.collectPlan(input());
      state.eth_getBlockByNumber = {
        number: '0x66',
        hash: '0x' + '34'.repeat(32),
      };
      state.eth_baseFee = 'bad';
      await expect(runtime.collectPlan(input())).rejects.toThrow();
      state.eth_getBlockByNumber = {
        number: '0x65',
        hash: '0x' + '56'.repeat(32),
      };
      state.eth_baseFee = '0x10';
      await expect(runtime.collectPlan(input())).resolves.toMatchObject({
        finalized: { height: 101 },
      });
      runtime.dispose();
    });
    /**
     * @target AvalancheFeeRuntime.collectPlan keeps the single collector exclusive through synchronous setter execution
     * @dependencies Actual AvalancheFeeRuntime, RPC identity/quantity validation, capture/fee plan producers and integer conversion; injected decoded transport replies and a setter spy only in the exclusivity scenario.
     * @scenario Invoke single collect with a synchronous setter that attempts nested collectPlan; await the outer call, inspect nested exclusivity rejection and exactly one setter invocation, then dispose.
     * @expected Keeps collection exclusive until the original synchronous setter returns.
     */
    it('keeps the single collector exclusive through synchronous setter execution', async () => {
      const { runtime } = setup(),
        a = input();
      let nested!: Promise<unknown>;
      const target = {
        setChainConfig: vi.fn(() => {
          nested = runtime.collectPlan(a);
        }),
      };
      await runtime.collect(target, {
        tokenMap: a.tokenMap,
        avaxPrice: a.avaxPrice,
        ...a.assets[0],
      });
      await expect(nested).rejects.toThrow('in progress');
      expect(target.setChainConfig).toHaveBeenCalledTimes(1);
      runtime.dispose();
    });
    /**
     * @target AvalancheFeeRuntime.collectPlan drops an entire plan if disposed while the last quote reply is pending
     * @dependencies Actual AvalancheFeeRuntime, RPC identity/quantity validation, capture/fee plan producers and integer conversion; injected decoded transport replies and a setter spy only in the exclusivity scenario.
     * @scenario Pause only eth_maxPriorityFeePerGas, start collectPlan, await the barrier, dispose the runtime, release the final reply and inspect rejection of the entire plan.
     * @expected Rejects disposed work after the final awaited reply.
     */
    it('drops an entire plan if disposed while the last quote reply is pending', async () => {
      const { runtime, transport } = setup();
      let resolve!: (v: unknown) => void, reached!: () => void;
      const gate = new Promise<void>((done) => {
        reached = done;
      });
      transport.send.mockImplementation(async (method) => {
        if (method === 'eth_maxPriorityFeePerGas') {
          reached();
          return new Promise((done) => {
            resolve = done;
          });
        }
        return structuredClone(values[method]);
      });
      const result = runtime.collectPlan(input());
      await gate;
      runtime.dispose();
      resolve('0x1');
      await expect(result).rejects.toThrow('disposed');
    });
  });
});

describe('JsonRpcProvider', () => {
  describe('_getConnection', () => {
    /**
     * @target JsonRpcProvider._getConnection demonstrates the request clone retains the timeout
     * @dependencies Real ethers FetchRequest and JsonRpcProvider; no outbound request is sent
     * @scenario
     * - Set FetchRequest timeout to 123 and construct a static-network provider
     * - Change the original request timeout to 999; require the provider connection to retain
     *  123, then destroy it
     * @expected
     * - demonstrates the request clone retains the timeout
     */
    it('demonstrates the request clone retains the timeout', () => {
      const request = new FetchRequest('http://127.0.0.1');
      request.timeout = 123;
      const provider = new JsonRpcProvider(request, 43113, {
        staticNetwork: true,
      });
      request.timeout = 999;
      expect(provider._getConnection().timeout).toEqual(123);
      provider.destroy();
    });
  });
});
