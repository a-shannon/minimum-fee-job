const state = vi.hoisted(() => ({
  url: undefined as string | undefined,
  token: undefined as string | undefined,
}));
export { state };
/** Installs this context's external and dispatch observations before importing the actual entry or store. */
export const installMocks = () => {
  vi.doMock('../../src/configs', () => ({
    get kvRestApiUrl() {
      return state.url;
    },
    get kvRestApiToken() {
      return state.token;
    },
  }));
};
