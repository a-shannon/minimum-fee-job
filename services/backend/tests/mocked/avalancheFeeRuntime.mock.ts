import { values } from '../testData/avalancheFeeRuntime';

/** Returns an isolated decoded RPC transport and destruction observer. */
export const transport = (overrides: Record<string, unknown> = {}) => ({
  send: vi.fn(async (method: string, params: unknown[]) => {
    void params;
    if (!(method in values)) throw Error('Unexpected RPC');
    return structuredClone({ ...values, ...overrides }[method]);
  }),
  destroy: vi.fn(),
});
