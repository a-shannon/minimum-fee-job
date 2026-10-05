/** Creates an isolated decoded RPC collaborator observing only its scenario-owned reply map. */
export const createPlanTransport = (state: Record<string, unknown>) => ({
  send: vi.fn(async (method: string, params: unknown[]) => {
    void params;
    return structuredClone(state[method]);
  }),
  destroy: vi.fn(),
});
