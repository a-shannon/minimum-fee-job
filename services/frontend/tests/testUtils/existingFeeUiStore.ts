import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import { queryClient } from '../../src/queries/queryClient';
import { seal } from './avalanchePublicationFixture';
import { economicStoreFixture } from './avalancheStore';

/** Serves the original atomic store fixture. */
export const serve = (bridgeFeeUSD = 0.1) => {
  const f = economicStoreFixture(43114);
  const packet = seal({
    ...f.body,
    supportedTokens: f.body.supportedTokens.map((token) => ({
      ...token,
      fee: {
        bridgeFeeUSD,
        ergNetworkFee: 0.01,
        adaNetworkFee: 0.2,
        feeRatioFloat: 0.1,
        rsnRatioDivisor: 1000,
      },
    })),
  });
  const bytes = JSON.stringify({
    schemaVersion: 1,
    chainId: 43114,
    publicationId: packet.publicationId,
    policy: f.policy,
    observations: f.observations,
  });
  writeFileSync(f.path, bytes);
  vi.stubEnv(
    'AVALANCHE_FEE_REVIEW_AUTHORITY_SHA256',
    createHash('sha256').update(bytes).digest('hex'),
  );
  const fetch = vi.fn(
    async () =>
      new Response(JSON.stringify([{ result: JSON.stringify(packet) }])),
  );
  vi.stubGlobal('fetch', fetch);
  return { ...f, packet, fetch };
};
/** Installs the original fee action case lifecycle. */
export const setupExistingFeeUi = () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_AVALANCHE_FEE_PUBLICATION_ENABLED', 'true');
    vi.stubEnv('KV_REST_API_URL', 'https://synthetic-kv.invalid');
    vi.stubEnv('KV_REST_API_TOKEN', 'synthetic-token');
  });
  afterEach(() => {
    queryClient.clear();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
};
