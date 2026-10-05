const state = vi.hoisted(() => ({
  boxes: new Map<string, unknown>(),
  funding: [] as unknown[],
  context: undefined as unknown,
  rpc: [] as string[],
  legacy: [] as string[],
  notifications: [] as unknown[],
  scheduled: vi.fn(),
  firo: vi.fn(),
  exit: vi.fn((code: number) => {
    throw new Error(`Captured process exit ${code}`);
  }),
}));
export { state };
/** Installs this context's external and dispatch observations before importing the actual entry or store. */
export const installMocks = () => {
  vi.doMock('node:process', async (original) => ({
    ...(await original<typeof import('node:process')>()),
    exit: state.exit,
  }));
  vi.doMock('@rosen-bridge/tokens', async () => ({
    ...(
      await import('../fixtures/pinnedFeeDependencies')
    ).pinnedFeeDependencies().tokens,
  }));
  vi.doMock('@rosen-bridge/minimum-fee', async () => {
    const deps = (
      await import('../fixtures/pinnedFeeDependencies')
    ).pinnedFeeDependencies();
    class ObservedBox extends deps.fees.MinimumFeeBox {
      fetchBox = async () => {
        this.box = state.boxes.get(this.tokenId);
        return !!this.box;
      };
    }
    return { ...deps.fees, MinimumFeeBox: ObservedBox };
  });
  vi.doMock('../../src/network/notification', () => ({
    Notification: {
      getInstance: () => ({
        send: async (...args: unknown[]) => {
          state.notifications.push(args);
        },
      }),
    },
  }));
  vi.doMock('../../src/network/clients', () => {
    const height = (name: string) => async () => {
      state.legacy.push(name);
      return 100;
    };
    return {
      firoClient: { setupSocket: state.firo },
      getErgoHeight: height('ergo'),
      getCardanoHeight: height('cardano'),
      getBitcoinHeight: height('bitcoin'),
      getEthereumHeight: height('ethereum'),
      getBinanceHeight: height('binance'),
      getDogeHeight: height('doge'),
      getFiroHeight: height('firo'),
      getHandshakeHeight: height('handshake'),
      getBitcoinFeeRatio: async () => ({ 6: 1 }),
      getDogeFeeRatio: async () => 1,
      getFiroFeeRatio: async () => 1,
      getHandshakeFeeRatio: async () => 1,
      getEthereumFeeHistory: async () => ({ baseFeePerGas: ['1'] }),
      getAddressBoxes: async () => state.funding,
      getStateContext: async () => state.context,
    };
  });
  vi.doMock('../../src/network/fetchPriceFromCoingecko', () => ({
    fetchPriceFromCoingeckoInUSD: async (ids: string[]) => {
      expect(ids).toEqual([]);
      return {};
    },
  }));
  vi.doMock('../../src/network/avalancheFeeRuntime', async (original) => {
    const actual =
      await original<typeof import('../../src/network/avalancheFeeRuntime')>();
    return {
      AvalancheFeeRuntime: class extends actual.AvalancheFeeRuntime {
        constructor(raw: unknown) {
          super(raw, (_request, chainId) => ({
            send: async (method, params) => {
              state.rpc.push(method);
              if (method === 'eth_chainId') return '0x' + chainId.toString(16);
              if (method === 'eth_getBlockByNumber') {
                expect(params).toEqual(['finalized', false]);
                return { number: '0x64', hash: '0x' + '01'.repeat(32) };
              }
              if (method === 'eth_baseFee') return '0x10';
              if (method === 'eth_maxPriorityFeePerGas') return '0x1';
              throw new Error(`Unexpected Avalanche RPC: ${method}`);
            },
          }));
        }
      },
    };
  });
};
