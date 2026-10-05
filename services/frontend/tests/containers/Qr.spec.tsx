import CopyToClipboard from 'react-copy-to-clipboard';
import { act, create } from 'react-test-renderer';

import { QueryClientProvider } from '@tanstack/react-query';

import Home from '../../src/app/page';
import { QrDisplay } from '../../src/components/qrcode/QrDisplay';
import { Validations } from '../../src/containers/Validations';
import { queryClient } from '../../src/queries/queryClient';
import {
  serve,
  setupExistingFeePresentation,
} from '../testUtils/existingFeeUiPresentation';

vi.mock('@mui/material', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@mui/material')>()),
  Slider: () => null,
}));
vi.mock('@rosen-bridge/minimum-fee', async () => {
  const { pinnedFeeDependencies } = await import(
    '../../../backend/tests/fixtures/pinnedFeeDependencies'
  );
  return pinnedFeeDependencies().fees;
});
describe('Qr', () => {
  describe('joint publication presentation', () => {
    setupExistingFeePresentation();
    /**
     * @target Qr: refuses refreshed publication drift and retained stale query data
     * @dependencies Actual existing Page/table/QR components and the shared TanStack query.
     * @scenario Render A; serve B and invalidate the shared snapshot; wait for bound refusal.
     * @expected No QR remains, table reports refusal, and B never becomes the displayed snapshot.
     */
    it('refuses refreshed publication drift and retained stale query data', async () => {
      const first = serve();
      let view!: ReturnType<typeof create>;
      await act(async () => {
        view = create(
          <QueryClientProvider client={queryClient}>
            <Home />
          </QueryClientProvider>,
          {
            createNodeMock: () => ({
              addEventListener() {},
              removeEventListener() {},
            }),
          },
        );
      });
      await act(async () => {
        await vi.waitFor(() =>
          expect(view.root.findAllByType(QrDisplay)).toHaveLength(1),
        );
      });
      serve(0.2);
      await act(async () => {
        await queryClient.invalidateQueries({ queryKey: ['avalanche-fee-ui'] });
      });
      await act(async () => {
        await vi.waitFor(() =>
          expect(
            queryClient.getQueryState(['avalanche-fee-ui'])?.status,
          ).toEqual('error'),
        );
      });
      expect(view.root.findAllByType(QrDisplay)).toHaveLength(0);
      expect(JSON.stringify(view.toJSON())).toContain('unavailable');
      expect(
        queryClient.getQueryData<{ publicationId: string }>([
          'avalanche-fee-ui',
        ])?.publicationId,
      ).toEqual(first.packet.publicationId);
      act(() => view.unmount());
    });
    /**
     * @target Qr: hides the retained QR until the same publication passes a fresh review
     * @dependencies Actual existing table/QR, TanStack refresh and reviewed atomic transaction.
     * @scenario Render A, hold the next atomic response, then return unchanged A.
     * @expected Table remains bound to A; copy/QR is absent during fetch and returns only after fresh review.
     */
    it('hides the retained QR until the same publication passes a fresh review', async () => {
      const first = serve();
      let view!: ReturnType<typeof create>;
      await act(async () => {
        view = create(
          <QueryClientProvider client={queryClient}>
            <Home />
          </QueryClientProvider>,
          {
            createNodeMock: () => ({
              addEventListener() {},
              removeEventListener() {},
            }),
          },
        );
      });
      await act(async () => {
        await vi.waitFor(() =>
          expect(view.root.findAllByType(QrDisplay)).toHaveLength(1),
        );
      });
      let release!: (value: Response) => void;
      let started!: () => void;
      const requestStarted = new Promise<void>((resolve) => {
        started = resolve;
      });
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) =>
          url.startsWith('https://api.ergoplatform.com/')
            ? Promise.resolve(new Response(null, { status: 404 }))
            : new Promise<Response>((resolve) => {
                release = resolve;
                started();
              }),
        ),
      );
      let refresh!: Promise<void>;
      act(() => {
        refresh = queryClient.invalidateQueries({
          queryKey: ['avalanche-fee-ui'],
        });
      });
      try {
        await requestStarted;
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 0));
        });
        expect(
          queryClient.getQueryState(['avalanche-fee-ui'])?.fetchStatus,
        ).toEqual('fetching');
        expect(view.root.findAllByType(QrDisplay)).toHaveLength(0);
        expect(view.root.findAllByType(CopyToClipboard)).toHaveLength(0);
        expect(
          view.root.findByType(Validations).props.snapshot.data.publicationId,
        ).toEqual(first.packet.publicationId);
      } finally {
        release(
          new Response(
            JSON.stringify([{ result: JSON.stringify(first.packet) }]),
          ),
        );
        await act(async () => {
          await refresh;
        });
      }
      await act(async () => {
        await vi.waitFor(() =>
          expect(view.root.findAllByType(QrDisplay)).toHaveLength(1),
        );
      });
      act(() => view.unmount());
    });
  });
});
