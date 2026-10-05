import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { economicsFixture } from '../avalanche/economicsFixture';
import { fixture } from './avalanchePublicationFixture';

/** Creates a real economic publication, writes its reference bytes and hash, and configures the store environment for the selected chain. */
export const economicStoreFixture = (chainId: 43113 | 43114 = 43113) => {
  const fixture = economicsFixture({ chainId });
  const directory = mkdtempSync(
    join(
      process.env.AVALANCHE_ECONOMIC_REVIEW_ARTIFACT_ROOT ?? tmpdir(),
      'store-authority-',
    ),
  );
  const path = join(directory, 'reference.json');
  const bytes = JSON.stringify({
    schemaVersion: 1,
    chainId,
    publicationId: fixture.packet.publicationId,
    policy: fixture.policy,
    observations: fixture.observations,
  });
  writeFileSync(path, bytes);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  vi.stubEnv('NEXT_PUBLIC_AVALANCHE_CHAIN_ID', String(chainId));
  vi.stubEnv(
    'MINIMUM_FEE_CONFIG_ADDRESS',
    fixture.policy.contract.minimumFeeAddress,
  );
  vi.stubEnv('MINIMUM_FEE_CONFIG_NFT', fixture.policy.contract.minimumFeeNFT);
  vi.stubEnv('AVALANCHE_FEE_REVIEW_AUTHORITY_FILE', path);
  vi.stubEnv('AVALANCHE_FEE_REVIEW_AUTHORITY_SHA256', sha256);
  return { ...fixture, path, bytes, sha256 };
};

/** Generates malformed stored records, including a wrong-chain publication, when the table is registered. */
export const storedRecordCases = () => [
  null,
  '{}',
  'broken',
  JSON.stringify({ ...fixture(), chainId: 43114 }),
];
