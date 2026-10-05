import { AvalancheRpc } from '../../src/network/avalancheRpc';
import { transport } from '../mocked/avalancheRpc.mock';
import {
  finalizedChains,
  invalidFinalizedBlocks,
  invalidFinalizedNumbers,
  invalidFinalizedHashes,
  exactFinalizedHeights,
  finalizedFailureMethods,
  quotedChains,
  invalidConstructorChains,
  feeFailureMethods,
  overflowingCaps,
} from '../testData/avalancheRpc';
import { MAX_UINT256, responses, hash } from '../testData/avalancheRpc';
import { hex } from '../testUtils/avalancheRpc';
import { malformedMethodReplies } from '../testUtils/avalancheRpcCases';

describe('AvalancheRpc', () => {
  describe('getFinalizedBlock', () => {
    const block = { number: '0x123', hash };

    /**
     * @target AvalancheRpc.getFinalizedBlock requests only the finalized block on chain %s
     * @dependencies Real AvalancheRpc; transport helper with vi.fn send and synthetic JSON-RPC
     *  replies; explicit quantity, identity and block tables
     * @scenario
     * - Construct the client for each supported chain without issuing RPC
     * - Read finalized block 0x123; compare the frozen chain, height and hash result and the
     *  exact identity/finalized calls
     * @expected
     * - requests only the finalized block on chain %s
     */
    it.each(finalizedChains)(
      'requests only the finalized block on chain %s',
      async (chainId) => {
        const rpc = transport({
          eth_chainId: hex(chainId),
          eth_getBlockByNumber: block,
        });
        const client = new AvalancheRpc(rpc, chainId);
        expect(rpc.send).not.toHaveBeenCalled();
        const result = await client.getFinalizedBlock();
        expect(result).toEqual({ chainId, height: 291, hash });
        expect(Object.isFrozen(result)).toEqual(true);
        expect(rpc.send.mock.calls).toEqual([
          ['eth_chainId', []],
          ['eth_getBlockByNumber', ['finalized', false]],
        ]);
      },
    );

    /**
     * @target AvalancheRpc.getFinalizedBlock rechecks the selected chain before every finalized query
     * @dependencies Real AvalancheRpc; transport helper with vi.fn send and synthetic JSON-RPC
     *  replies; explicit quantity, identity and block tables
     * @scenario
     * - Complete one finalized read on the configured chain
     * - Clear calls and return the other chain on the next identity read; require rejection
     *  before querying another block
     * @expected
     * - rechecks the selected chain before every finalized query
     */
    it('rechecks the selected chain before every finalized query', async () => {
      const rpc = transport({ eth_getBlockByNumber: block });
      const client = new AvalancheRpc(rpc, 43113n);
      await client.getFinalizedBlock();
      rpc.send.mockClear().mockResolvedValueOnce(hex(43114n));
      await expect(client.getFinalizedBlock()).rejects.toThrow(
        'chain ID mismatch',
      );
      expect(rpc.send.mock.calls).toEqual([['eth_chainId', []]]);
    });

    /**
     * @target AvalancheRpc.getFinalizedBlock keeps the configured identity immutable while a query is pending
     * @dependencies Real AvalancheRpc; transport helper with vi.fn send and synthetic JSON-RPC
     *  replies; explicit quantity, identity and block tables
     * @scenario
     * - Pause the first chain-ID reply and start a finalized read
     * - Attempt to change expectedChainId with Reflect.set and defineProperty
     * - Release the other chain ID; require mismatch rejection after one RPC call
     * @expected
     * - keeps the configured identity immutable while a query is pending
     */
    it('keeps the configured identity immutable while a query is pending', async () => {
      let resolve!: (value: unknown) => void;
      const rpc = transport({ eth_getBlockByNumber: block });
      rpc.send.mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
      const client = new AvalancheRpc(rpc, 43113n);
      const result = client.getFinalizedBlock();
      expect(Reflect.set(client, 'expectedChainId', 43114n)).toEqual(false);
      expect(() =>
        Object.defineProperty(client, 'expectedChainId', { value: 43114n }),
      ).toThrow();
      resolve(hex(43114n));
      await expect(result).rejects.toThrow('chain ID mismatch');
      expect(rpc.send).toHaveBeenCalledTimes(1);
    });

    /**
     * @target AvalancheRpc.getFinalizedBlock rejects a missing or malformed finalized block (%s)
     * @dependencies Real AvalancheRpc; transport helper with vi.fn send and synthetic JSON-RPC
     *  replies; explicit quantity, identity and block tables
     * @scenario
     * - Return each missing or malformed finalized block after the identity reply; require
     *  block validation rejection and two calls
     * @expected
     * - rejects a missing or malformed finalized block (%s)
     */
    it.each(invalidFinalizedBlocks)(
      'rejects a missing or malformed finalized block (%s)',
      async (value) => {
        const rpc = transport({ eth_getBlockByNumber: value });
        await expect(
          new AvalancheRpc(rpc, 43113n).getFinalizedBlock(),
        ).rejects.toThrow('Invalid Avalanche finalized block');
        expect(rpc.send).toHaveBeenCalledTimes(2);
      },
    );

    /**
     * @target AvalancheRpc.getFinalizedBlock rejects a noncanonical finalized number (%s)
     * @dependencies Real AvalancheRpc; transport helper with vi.fn send and synthetic JSON-RPC
     *  replies; explicit quantity, identity and block tables
     * @scenario
     * - Replace the finalized block number with each noncanonical quantity; require number
     *  validation rejection and two calls
     * @expected
     * - rejects a noncanonical finalized number (%s)
     */
    it.each(invalidFinalizedNumbers)(
      'rejects a noncanonical finalized number (%s)',
      async (number) => {
        const rpc = transport({ eth_getBlockByNumber: { ...block, number } });
        await expect(
          new AvalancheRpc(rpc, 43113n).getFinalizedBlock(),
        ).rejects.toThrow('finalized block number quantity');
        expect(rpc.send).toHaveBeenCalledTimes(2);
      },
    );

    /**
     * @target AvalancheRpc.getFinalizedBlock rejects a missing or malformed finalized hash (%s)
     * @dependencies Real AvalancheRpc; transport helper with vi.fn send and synthetic JSON-RPC
     *  replies; explicit quantity, identity and block tables
     * @scenario
     * - Replace the finalized block hash with each invalid value; require hash validation
     *  rejection and two calls
     * @expected
     * - rejects a missing or malformed finalized hash (%s)
     */
    it.each(invalidFinalizedHashes)(
      'rejects a missing or malformed finalized hash (%s)',
      async (value) => {
        const rpc = transport({
          eth_getBlockByNumber: { ...block, hash: value },
        });
        await expect(
          new AvalancheRpc(rpc, 43113n).getFinalizedBlock(),
        ).rejects.toThrow('finalized block hash');
        expect(rpc.send).toHaveBeenCalledTimes(2);
      },
    );

    /**
     * @target AvalancheRpc.getFinalizedBlock retains an exactly representable height %s
     * @dependencies Real AvalancheRpc; transport helper with vi.fn send and synthetic JSON-RPC
     *  replies; explicit quantity, identity and block tables
     * @scenario
     * - Return each exactly representable finalized height as a hex quantity and compare the
     *  resulting numeric height
     * @expected
     * - retains an exactly representable height %s
     */
    it.each(exactFinalizedHeights)(
      'retains an exactly representable height %s',
      async (height) => {
        const rpc = transport({
          eth_getBlockByNumber: { ...block, number: hex(height) },
        });
        expect(
          (await new AvalancheRpc(rpc, 43113n).getFinalizedBlock()).height,
        ).toEqual(Number(height));
      },
    );

    /**
     * @target AvalancheRpc.getFinalizedBlock rejects a height which would lose numeric precision
     * @dependencies Real AvalancheRpc; transport helper with vi.fn send and synthetic JSON-RPC
     *  replies; explicit quantity, identity and block tables
     * @scenario
     * - Return a finalized height one above Number.MAX_SAFE_INTEGER and require
     *  precision-bound rejection
     * @expected
     * - rejects a height which would lose numeric precision
     */
    it('rejects a height which would lose numeric precision', async () => {
      const rpc = transport({
        eth_getBlockByNumber: {
          ...block,
          number: hex(BigInt(Number.MAX_SAFE_INTEGER) + 1n),
        },
      });
      await expect(
        new AvalancheRpc(rpc, 43113n).getFinalizedBlock(),
      ).rejects.toThrow('exceeds safe integer');
    });

    /**
     * @target AvalancheRpc.getFinalizedBlock propagates %s failure without trying latest or eth_blockNumber
     * @dependencies Real AvalancheRpc; transport helper with vi.fn send and synthetic JSON-RPC
     *  replies; explicit quantity, identity and block tables
     * @scenario
     * - Throw the same Error from the chain-ID or finalized-block method
     * - Require that exact Error reference and only the preceding identity/finalized calls,
     *  with no fallback
     * @expected
     * - propagates %s failure without trying latest or eth_blockNumber
     */
    it.each(finalizedFailureMethods)(
      'propagates %s failure without trying latest or eth_blockNumber',
      async (method) => {
        const rpc = transport({ eth_getBlockByNumber: block });
        const failure = new Error('Synthetic finalized RPC failure');
        rpc.send.mockImplementation(async (current) => {
          if (current === method) throw failure;
          return responses[current];
        });
        await expect(
          new AvalancheRpc(rpc, 43113n).getFinalizedBlock(),
        ).rejects.toBe(failure);
        expect(rpc.send.mock.calls).toEqual(
          method === 'eth_chainId'
            ? [['eth_chainId', []]]
            : [
                ['eth_chainId', []],
                ['eth_getBlockByNumber', ['finalized', false]],
              ],
        );
      },
    );
  });

  describe('getFeeQuote', () => {
    /**
     * @target AvalancheRpc.getFeeQuote checks identity and quotes chain %s
     * @dependencies Real AvalancheRpc; transport helper with vi.fn send and synthetic JSON-RPC
     *  replies; explicit quantity, identity and block tables
     * @scenario
     * - Construct the client for each supported chain without issuing RPC
     * - Get the fee quote; compare all bigint fee fields and the exact identity, base-fee and
     *  priority-fee call order
     * @expected
     * - checks identity and quotes chain %s
     */
    it.each(quotedChains)(
      'checks identity and quotes chain %s',
      async (chainId) => {
        const rpc = transport({ eth_chainId: hex(chainId) });
        const client = new AvalancheRpc(rpc, chainId);
        expect(rpc.send).not.toHaveBeenCalled();
        await expect(client.getFeeQuote()).resolves.toEqual({
          chainId,
          baseFeePerGas: 16n,
          maxPriorityFeePerGas: 1n,
          maxFeePerGas: 33n,
        });
        expect(rpc.send.mock.calls).toEqual([
          ['eth_chainId', []],
          ['eth_baseFee', []],
          ['eth_maxPriorityFeePerGas', []],
        ]);
      },
    );

    /**
     * @target AvalancheRpc.getFeeQuote rechecks chain identity on every quote and stops before fee queries on mismatch
     * @dependencies Real AvalancheRpc; transport helper with vi.fn send and synthetic JSON-RPC
     *  replies; explicit quantity, identity and block tables
     * @scenario
     * - Complete one fee quote on the configured chain
     * - Clear calls and return the other chain on the next identity read; require rejection
     *  before requesting fees
     * @expected
     * - rechecks chain identity on every quote and stops before fee queries on mismatch
     */
    it('rechecks chain identity on every quote and stops before fee queries on mismatch', async () => {
      const rpc = transport();
      const client = new AvalancheRpc(rpc, 43113n);
      await client.getFeeQuote();
      rpc.send.mockClear().mockResolvedValueOnce(hex(43114n));
      await expect(client.getFeeQuote()).rejects.toThrow('chain ID mismatch');
      expect(rpc.send.mock.calls).toEqual([['eth_chainId', []]]);
    });

    /**
     * @target AvalancheRpc.getFeeQuote rejects malformed or missing %s result (%s)
     * @dependencies Real AvalancheRpc; transport helper with vi.fn send and synthetic JSON-RPC
     *  replies; explicit quantity, identity and block tables
     * @scenario
     * - Return each malformed value from its named quote method
     * - Require that method's quantity validation error and stop at its position in the RPC
     *  sequence
     * @expected
     * - rejects malformed or missing %s result (%s)
     */
    it.each(malformedMethodReplies)(
      'rejects malformed or missing %s result (%s)',
      async (method, value) => {
        const rpc = transport({ [method]: value });
        await expect(
          new AvalancheRpc(rpc, 43113n).getFeeQuote(),
        ).rejects.toThrow(`Invalid Avalanche ${method} quantity`);
        expect(rpc.send).toHaveBeenCalledTimes(
          Object.keys(responses).indexOf(method) + 1,
        );
      },
    );

    /**
     * @target AvalancheRpc.getFeeQuote propagates %s failure without fallback
     * @dependencies Real AvalancheRpc; transport helper with vi.fn send and synthetic JSON-RPC
     *  replies; explicit quantity, identity and block tables
     * @scenario
     * - Throw a synthetic Error from each quote method
     * - Require rejection with that Error and stop after the method's expected call count
     * @expected
     * - propagates %s failure without fallback
     */
    it.each(feeFailureMethods)(
      'propagates %s failure without fallback',
      async (method) => {
        const failure = new Error('Synthetic RPC failure');
        const rpc = transport();
        rpc.send.mockImplementation(async (current) => {
          if (current === method) throw failure;
          return responses[current];
        });
        await expect(
          new AvalancheRpc(rpc, 43113n).getFeeQuote(),
        ).rejects.toEqual(failure);
        expect(rpc.send).toHaveBeenCalledTimes(
          Object.keys(responses).indexOf(method) + 1,
        );
      },
    );

    /**
     * @target AvalancheRpc.getFeeQuote retains large integer precision and accepts zero priority fee
     * @dependencies Real AvalancheRpc; transport helper with vi.fn send and synthetic JSON-RPC
     *  replies; explicit quantity, identity and block tables
     * @scenario
     * - Quote base fee 9007199254740993 with zero priority fee; compare exact bigint fields
     *  and the doubled cap
     * @expected
     * - retains large integer precision and accepts zero priority fee
     */
    it('retains large integer precision and accepts zero priority fee', async () => {
      const base = 9007199254740993n;
      const rpc = transport({
        eth_baseFee: hex(base),
        eth_maxPriorityFeePerGas: '0x0',
      });
      await expect(
        new AvalancheRpc(rpc, 43113n).getFeeQuote(),
      ).resolves.toEqual({
        chainId: 43113n,
        baseFeePerGas: base,
        maxPriorityFeePerGas: 0n,
        maxFeePerGas: 2n * base,
      });
    });

    /**
     * @target AvalancheRpc.getFeeQuote accepts an exact uint256 maximum cap
     * @dependencies Real AvalancheRpc; transport helper with vi.fn send and synthetic JSON-RPC
     *  replies; explicit quantity, identity and block tables
     * @scenario
     * - Quote half the uint256 maximum as base fee and priority fee one; require the exact
     *  maximum cap
     * @expected
     * - accepts an exact uint256 maximum cap
     */
    it('accepts an exact uint256 maximum cap', async () => {
      const rpc = transport({
        eth_baseFee: hex(MAX_UINT256 / 2n),
        eth_maxPriorityFeePerGas: '0x1',
      });
      expect(
        (await new AvalancheRpc(rpc, 43113n).getFeeQuote()).maxFeePerGas,
      ).toEqual(MAX_UINT256);
    });

    /**
     * @target AvalancheRpc.getFeeQuote rejects a uint256 cap overflow
     * @dependencies Real AvalancheRpc; transport helper with vi.fn send and synthetic JSON-RPC
     *  replies; explicit quantity, identity and block tables
     * @scenario
     * - Return each overflowing base/priority combination and require uint256 cap rejection
     * @expected
     * - rejects a uint256 cap overflow
     */
    it.each(overflowingCaps)(
      'rejects a uint256 cap overflow',
      async (override) => {
        await expect(
          new AvalancheRpc(transport(override), 43113n).getFeeQuote(),
        ).rejects.toThrow('exceeds uint256');
      },
    );
  });

  describe('constructor', () => {
    /**
     * @target AvalancheRpc.constructor rejects unsupported constructor identity %s
     * @dependencies Real AvalancheRpc; transport helper with vi.fn send and synthetic JSON-RPC
     *  replies; explicit quantity, identity and block tables
     * @scenario
     * - Construct the client with each unsupported identity; require rejection without any
     *  transport send
     * @expected
     * - rejects unsupported constructor identity %s
     */
    it.each(invalidConstructorChains)(
      'rejects unsupported constructor identity %s',
      (chainId) => {
        const rpc = transport();
        expect(() => new AvalancheRpc(rpc, chainId as 43113n)).toThrow(
          'Unsupported',
        );
        expect(rpc.send).not.toHaveBeenCalled();
      },
    );
  });
});
