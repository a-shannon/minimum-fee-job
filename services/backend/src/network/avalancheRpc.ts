/** An ethers-compatible transport returning the decoded JSON-RPC result. */
export interface AvalancheRpcTransport {
  send(method: string, params: unknown[]): Promise<unknown>;
}

export interface AvalancheFeeQuote {
  chainId: 43113n | 43114n;
  /** All gas prices are wei per gas; one AVAX is 10^18 wei. */
  baseFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  maxFeePerGas: bigint;
}

export interface AvalancheFinalizedBlock {
  readonly chainId: 43113n | 43114n;
  readonly height: number;
  readonly hash: string;
}

const MAX_UINT256 = (1n << 256n) - 1n;

/** Parses a bounded canonical lowercase JSON-RPC hexadecimal quantity. */
const quantity = (value: unknown, method: string): bigint => {
  if (
    typeof value !== 'string' ||
    value.length > 66 ||
    !/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(value)
  )
    throw new Error(`Invalid Avalanche ${method} quantity`);
  return BigInt(value);
};

/** Construction performs no RPC and does not activate a chain. */
export class AvalancheRpc {
  /** Captures the transport and fixes the explicitly supported chain identity. */
  constructor(
    private readonly transport: AvalancheRpcTransport,
    readonly expectedChainId: 43113n | 43114n,
  ) {
    if (expectedChainId !== 43113n && expectedChainId !== 43114n)
      throw new Error('Unsupported Avalanche chain ID');
    Object.defineProperty(this, 'expectedChainId', {
      value: expectedChainId,
      writable: false,
      configurable: false,
    });
  }

  /** Reads the endpoint chain identifier and rejects a different configured network. */
  private assertChainIdentity = async (): Promise<void> => {
    const chainId = quantity(
      await this.transport.send('eth_chainId', []),
      'eth_chainId',
    );
    if (chainId !== this.expectedChainId)
      throw new Error('Avalanche RPC chain ID mismatch');
  };

  /** Settled execution height; unsupported finalized queries fail closed. */
  getFinalizedBlock = async (): Promise<AvalancheFinalizedBlock> => {
    await this.assertChainIdentity();
    const block = await this.transport.send('eth_getBlockByNumber', [
      'finalized',
      false,
    ]);
    if (!block || typeof block !== 'object' || Array.isArray(block))
      throw new Error('Invalid Avalanche finalized block');
    const { number, hash } = block as Record<string, unknown>;
    const height = quantity(number, 'finalized block number');
    if (height > BigInt(Number.MAX_SAFE_INTEGER))
      throw new Error('Avalanche finalized height exceeds safe integer');
    if (
      typeof hash !== 'string' ||
      !/^0x[0-9a-f]{64}$/.test(hash) ||
      hash === '0x' + '0'.repeat(64)
    )
      throw new Error('Invalid Avalanche finalized block hash');
    return Object.freeze({
      chainId: this.expectedChainId,
      height: Number(height),
      hash,
    });
  };

  /** Qualifies the chain and derives the bounded dynamic-fee cap from base and priority fees. */
  getFeeQuote = async (): Promise<AvalancheFeeQuote> => {
    await this.assertChainIdentity();
    const baseFeePerGas = quantity(
      await this.transport.send('eth_baseFee', []),
      'eth_baseFee',
    );
    const maxPriorityFeePerGas = quantity(
      await this.transport.send('eth_maxPriorityFeePerGas', []),
      'eth_maxPriorityFeePerGas',
    );
    // Matches the guard's fee cap policy for C-Chain dynamic-fee transactions.
    const maxFeePerGas = 2n * baseFeePerGas + maxPriorityFeePerGas;
    if (maxFeePerGas > MAX_UINT256)
      throw new Error('Avalanche max fee per gas exceeds uint256');
    return {
      chainId: this.expectedChainId,
      baseFeePerGas,
      maxPriorityFeePerGas,
      maxFeePerGas,
    };
  };
}
