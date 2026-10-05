import CopyToClipboard from 'react-copy-to-clipboard';
import { act, create } from 'react-test-renderer';

import { QueryClientProvider } from '@tanstack/react-query';

import Home from '../../src/app/page';
import { QrDisplay } from '../../src/components/qrcode/QrDisplay';
import { Qr } from '../../src/containers/Qr';
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
describe('Home', () => {
  describe('joint publication presentation', () => {
    setupExistingFeePresentation();
    /**
     * @target Home: supplies one snapshot identity to actual existing table and QR consumers
     * @dependencies Actual React18, TanStack cache, MUI table, QR serialization and real atomic V2 transaction.
     * @scenario Mount Home with one reviewed publication and await the existing validation effects.
     * @expected Table and QR share the same query object/publication; QR input bytes match and no legacy key is read.
     */
    it('supplies one snapshot identity to actual existing table and QR consumers', async () => {
      const f = serve();
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
      const table = view.root.findByType(Validations).props.snapshot;
      const qr = view.root.findByType(Qr).props.snapshot;
      expect(table).toBe(qr);
      expect(table.data.publicationId).toEqual(f.packet.publicationId);
      expect(table.data.rows[0].price).toEqual('2');
      expect(view.root.findByType(QrDisplay).props.tx).toEqual(
        JSON.stringify(f.packet.transaction),
      );
      expect(
        JSON.parse(view.root.findByType(CopyToClipboard).props.text).CSR,
      ).toEqual(JSON.stringify(f.packet.transaction));
      expect(JSON.stringify(view.toJSON())).toContain(
        'Network Fee (Avalanche)',
      );
      const calls = f.fetch.mock.calls.filter(
        ([url]) => !url.startsWith('https://api.ergoplatform.com/'),
      );
      expect(calls.length).toBeLessThanOrEqual(3);
      for (const call of calls) {
        const options = call as unknown as [string, { body: string }];
        expect(JSON.parse(options[1].body)).toEqual([
          ['get', 'avalanche-fee-publication-v1'],
        ]);
      }
      act(() => view.unmount());
    });
  });
});
