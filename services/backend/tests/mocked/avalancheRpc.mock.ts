import { responses } from '../testData/avalancheRpc';

/** Returns an isolated synthetic RPC transport with the supplied response overrides. */
export const transport = (overrides: Record<string, unknown> = {}) => ({
  send: vi.fn(async (method: string) => {
    const values = { ...responses, ...overrides };
    if (!Object.hasOwn(values, method)) throw new Error('Unexpected RPC');
    return values[method];
  }),
});
