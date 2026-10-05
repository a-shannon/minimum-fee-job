'use server';

import { createClient } from '@vercel/kv';

import { wrap } from '@/safeServerAction';

import { captureEconomicAuthority } from '../avalanche/economicAuthority';
import { inspectEconomicReview } from '../avalanche/economicReview';
import {
  avalancheUiRequested,
  projectAvalancheFeeUi,
  requireReviewedAvalancheUi,
} from '../avalanche/existingUi';
import { decodeAvalanchePublication } from '../avalanche/publication';
import {
  captureReviewContract,
  inspectPublicationReview,
} from '../avalanche/review';

/** Capture the publication, contract and economic authority settings for comparison after each asynchronous read. */
const configuration = () =>
  Object.freeze({
    enabled: process.env.NEXT_PUBLIC_AVALANCHE_FEE_PUBLICATION_ENABLED,
    chain: process.env.NEXT_PUBLIC_AVALANCHE_CHAIN_ID,
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
    address: process.env.MINIMUM_FEE_CONFIG_ADDRESS,
    nft: process.env.MINIMUM_FEE_CONFIG_NFT,
    authorityFile: process.env.AVALANCHE_FEE_REVIEW_AUTHORITY_FILE,
    authoritySha256: process.env.AVALANCHE_FEE_REVIEW_AUTHORITY_SHA256,
  });

/** Read only the atomic record; legacy keys cannot supply missing fields. */
export const loadAvalanchePublication = async () => {
  try {
    const owner = configuration();
    if (owner.enabled !== 'true') throw new Error('Disabled');
    const chain = owner.chain;
    if (chain !== '43113' && chain !== '43114')
      throw new Error('Invalid chain');
    const url = owner.url;
    const token = owner.token;
    if (
      !url ||
      !token ||
      !token.trim() ||
      !['https:', 'http:'].includes(new URL(url).protocol)
    )
      throw new Error('Missing store');
    const contract = captureReviewContract(
      chain === '43113' ? 43113 : 43114,
      owner.address,
      owner.nft,
    );
    const authority = captureEconomicAuthority(
      chain === '43113' ? 43113 : 43114,
      owner.authorityFile,
      owner.authoritySha256,
    );
    const client = createClient({ url, token });
    const input = await client.get<unknown>('avalanche-fee-publication-v1');
    const publication = decodeAvalanchePublication(
      input,
      chain === '43113' ? 43113 : 43114,
    );
    const review = inspectPublicationReview(publication, contract);
    const economicReview = inspectEconomicReview(
      publication,
      review,
      authority,
    );
    authority.assertFresh();
    const current = configuration();
    if (
      Object.keys(owner).some(
        (key) =>
          owner[key as keyof typeof owner] !==
          current[key as keyof typeof current],
      )
    )
      throw new Error('Configuration changed');
    return { publication, review, economicReview };
  } catch {
    return { error: 'Avalanche publication is unavailable' };
  }
};

/** Supplies one fully reviewed publication to existing table and QR consumers. */
export const loadAvalancheFeeUi = async (expectedPublicationId?: string) => {
  if (!avalancheUiRequested())
    throw new Error('Avalanche publication is unavailable');
  return projectAvalancheFeeUi(
    requireReviewedAvalancheUi(
      await loadAvalanchePublication(),
      expectedPublicationId,
    ),
  );
};

export const loadAvalancheFeeUiSafe = wrap(loadAvalancheFeeUi);
