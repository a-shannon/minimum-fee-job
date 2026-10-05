import { existsSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { join } from 'node:path';

import { state as entryState } from './mocked/avalancheFeeEntry.mock';
import { state } from './mocked/avalancheFeeLifecycle.mock';
import { publicationEntryCases1 } from './testData/avalancheFeeEntryCases';
import {
  lifecycleCases1,
  lifecycleCases2,
  lifecycleCases3,
  lifecycleCases4,
} from './testData/avalancheFeeLifecycleCases';
import { registerContext as registerEntry } from './testUtils/avalancheFeeEntryContext';
import {
  run,
  source,
  directory,
  inspectAvalancheFeeEconomics,
  decodeAvalanchePublication,
  inspectAvalancheFeeStructure,
  registerContext as registerLifecycle,
} from './testUtils/avalancheFeeLifecycleContext';

describe('main', () => {
  describe('actual service lifecycle', () => {
    registerLifecycle();
    /**
     * @target main real entrypoint chain %s migrates SQLite, stores prices, publishes one V2 and passes independent economics
     * @dependencies Actual startup, SQLite, TokenHandler, fee producer, WASM and frontend inspectors; intercepted external observations and KV fetch.
     * @scenario Run Fuji and mainnet synthetic policies through real JSON configuration, SQLite migration, TokenHandler and fee construction; inspect stored prices, one KV envelope and independent structure/economic reports.
     * @expected Both networks migrate once, persist exact prices, publish one V2 envelope and retain the independently checked fee values.
     */
    it.each(lifecycleCases1)(
      'real entrypoint chain %s migrates SQLite, stores prices, publishes one V2 and passes independent economics',
      async (chainId) => {
        const result = await run('nominal', chainId, chainId === 43114);
        expect(result.error).toBeUndefined();
        expect(state.notifications).toEqual([]);
        expect(state.scheduled).toHaveBeenCalledOnce();
        expect(state.firo).toHaveBeenCalledOnce();
        expect(await source!.query('SELECT name FROM migrations')).toEqual([
          { name: 'Migration1761572266734' },
        ]);
        expect(
          await source!.query(
            'SELECT tokenId, price FROM token_price_entity ORDER BY tokenId',
          ),
        ).toEqual([
          { tokenId: 'ada', price: 1 },
          { tokenId: 'avax', price: 2 },
          { tokenId: 'erg', price: 1 },
        ]);
        const { TokenHandler } = await import('../src/tokenMap/tokenHandler');
        expect(
          TokenHandler.getInstance()
            .getSupportedTokens()
            .map((token) => token.tokenId),
        ).toEqual(['erg', 'ada', 'avax']);
        expect(state.rpc).toContain('eth_baseFee');
        expect(globalThis.fetch).toHaveBeenCalledOnce();
        expect(http.request).not.toHaveBeenCalled();
        expect(https.request).not.toHaveBeenCalled();
        expect(result.commands).toHaveLength(1);
        expect(result.commands[0].slice(0, 2)).toEqual([
          'set',
          'avalanche-fee-publication-v1',
        ]);
        const publication = decodeAvalanchePublication(
          result.commands[0][2],
          chainId,
        );
        expect(publication.version).toEqual(2);
        expect(
          inspectAvalancheFeeStructure(publication, result.policy.contract)
            .kind,
        ).toEqual('transaction');
        const report = inspectAvalancheFeeEconomics(
          publication,
          result.policy,
          result.observations,
        );
        expect(report.checkedUpdates).toHaveLength(1);
        expect(report.checkedUpdates[0].fee).toEqual({
          networkFee: '33000000000',
          bridgeFee: '500000000',
          rsnRatio: '100000',
          rsnRatioDivisor: '100000',
          feeRatio: '50',
        });
        expect(report.structuralOnlyTargets).toHaveLength(2);
      },
    );
    /**
     * @target main %s Avalanche retains actual legacy transaction/store behavior and actual price persistence
     * @dependencies Actual startup, SQLite, TokenHandler, fee producer, WASM and frontend inspectors; intercepted external observations and KV fetch.
     * @scenario Run the actual service with disabled, absent or malformed disabled optional Avalanche fields; inspect legacy KV keys, absent Avalanche RPC and SQLite prices.
     * @expected The original legacy publication and price persistence remain active while optional Avalanche fields stay inert.
     */
    it.each(lifecycleCases2)(
      '%s Avalanche retains actual legacy transaction/store behavior and actual price persistence',
      async (mode) => {
        const result = await run('disabled', 43113, false, (config) => {
          if (mode === 'absent') Reflect.deleteProperty(config, 'avalanche');
          if (mode === 'disabled malformed optional fields') {
            Object.assign(config.avalanche, {
              chainId: 'wrong',
              margin: null,
              tokenPrices: false,
            });
          }
        });
        expect(result.error).toBeUndefined();
        expect(state.rpc).toEqual([]);
        expect(result.commands.map((command) => command[1]).sort()).toEqual([
          'prices',
          'rsn-token-id',
          'token-map',
          'tokens-config',
          'tx',
        ]);
        expect(
          result.commands.some((command) => command[0] === 'flushdb'),
        ).toEqual(false);
        expect(state.notifications.length).toBeGreaterThan(0);
        expect(
          await source!.query(
            'SELECT COUNT(*) AS count FROM token_price_entity',
          ),
        ).toEqual([{ count: 2 }]);
      },
    );
  });
  describe('publication dispatch with business mocks', () => {
    registerEntry();
    const state = entryState;
    /**
     * @target main actual entrypoint routes %s without mixing publication paths
     * @dependencies Actual entrypoint and KV SDK; documented business-dispatch mocks, synthetic prices/configuration and intercepted scheduling/fetch.
     * @scenario Set transaction, empty, missing-KV or legacy dispatch mode in the documented business mocks; import the actual entrypoint and await its scheduled next run while inspecting construction, publication arguments and intercepted KV commands.
     * @expected The actual entry routes the same transaction or empty map to the selected publication path and retains the existing notification and legacy command assertions.
     */
    it.each(publicationEntryCases1)(
      'actual entrypoint routes %s without mixing publication paths',
      async (mode) => {
        state.empty = mode.endsWith('empty');
        state.missingKv = mode === 'missing KV';
        state.enabled = !mode.startsWith('legacy');
        const commands: unknown[][] = [];
        vi.stubGlobal(
          'fetch',
          vi.fn(async (_url: string, init: { body: string }) => {
            const request = JSON.parse(init.body as string) as unknown[][];
            commands.push(...request);
            return new Response(
              JSON.stringify(request.map(() => ({ result: 'OK' }))),
              { status: 200 },
            );
          }),
        );
        await import('../src/index');
        await vi.waitFor(() => expect(state.scheduled).toHaveBeenCalledOnce());
        if (state.enabled) {
          expect(state.published).toHaveBeenCalledOnce();
          if (state.empty)
            expect(state.published.mock.calls[0][0]).toBeInstanceOf(Map);
          else expect(state.published.mock.calls[0][0]).toBe(state.tx);
          if (state.empty) expect(state.construct).not.toHaveBeenCalled();
          else expect(state.construct).toHaveBeenCalledOnce();
          if (state.missingKv) {
            expect(commands).toEqual([]);
            expect(state.send).toHaveBeenCalledOnce();
            expect(state.send.mock.calls[0][1]).toContain('configured KV');
          } else {
            expect(commands).toEqual([
              ['set', 'avalanche-fee-publication-v1', 'synthetic-envelope'],
            ]);
            expect(state.send).not.toHaveBeenCalled();
          }
        } else {
          expect(state.published).not.toHaveBeenCalled();
          if (state.empty) expect(commands).toEqual([['flushdb']]);
          else
            expect(commands.map((row) => row[1])).toEqual([
              'tokens-config',
              'token-map',
              'prices',
              'tx',
              'rsn-token-id',
            ]);
        }
      },
    );
  });
});

describe('initializeService', () => {
  describe('actual service lifecycle', () => {
    registerLifecycle();
    /**
     * @target initializeService invalid %s exits before service initialization or job effects
     * @dependencies Actual startup, SQLite, TokenHandler, fee producer, WASM and frontend inspectors; intercepted external observations and KV fetch.
     * @scenario Change only the table-selected chain, enabled flag, gas budget or pruning guarantee before importing the entrypoint; inspect initialization and every observation/publication side effect.
     * @expected Startup rejects the named policy before SQLite creation, TokenHandler initialization, socket setup, scheduling or network effects.
     */
    it.each(lifecycleCases3)(
      'invalid %s exits before service initialization or job effects',
      async (field, message, change) => {
        const result = await run(
          'nominal',
          43113,
          false,
          (config) => Object.assign(config.avalanche, change),
          field === 'legacy history policy'
            ? async () => {
                const { feeGuaranteeDuration } = await import('../src/configs');
                feeGuaranteeDuration.set('ergo', 0);
              }
            : undefined,
        );
        expect(result.error).toEqual(new Error(message));
        expect(source!.isInitialized).toEqual(false);
        expect(existsSync(join(directory, 'prices.sqlite'))).toEqual(false);
        expect(state.exit).not.toHaveBeenCalled();
        expect(state.scheduled).not.toHaveBeenCalled();
        expect(state.firo).not.toHaveBeenCalled();
        expect(state.notifications).toEqual([]);
        expect(state.rpc).toEqual([]);
        expect(state.legacy).toEqual([]);
        expect(result.commands).toEqual([]);
        expect(globalThis.fetch).not.toHaveBeenCalled();
        const { TokenHandler } = await import('../src/tokenMap/tokenHandler');
        expect(() => TokenHandler.getInstance()).toThrow(
          'TokenHandler is not initialized',
        );
      },
    );
    /**
     * @target initializeService real SQLite initialization failure exits before tokens, observations or any publication
     * @dependencies Actual startup, SQLite, TokenHandler, fee producer, WASM and frontend inspectors; intercepted external observations and KV fetch.
     * @scenario Supply a real unusable SQLite target, import the service, capture process exit and inspect tokens, observations and scheduling.
     * @expected Database initialization exits with code one before token initialization or publication effects.
     */
    it('real SQLite initialization failure exits before tokens, observations or any publication', async () => {
      const result = await run('database failure');
      expect(result.error).toEqual(new Error('Captured process exit 1'));
      expect(state.exit).toHaveBeenCalledExactlyOnceWith(1);
      expect(state.scheduled).not.toHaveBeenCalled();
      expect(state.firo).not.toHaveBeenCalled();
      expect(state.rpc).toEqual([]);
      expect(state.legacy).toEqual([]);
      expect(result.commands).toEqual([]);
      const { TokenHandler } = await import('../src/tokenMap/tokenHandler');
      expect(() => TokenHandler.getInstance()).toThrow(
        'TokenHandler is not initialized',
      );
    });
  });
});

describe('interval', () => {
  describe('actual service lifecycle', () => {
    registerLifecycle();
    /**
     * @target interval %s refuses publication after real initialization
     * @dependencies Actual startup, SQLite, TokenHandler, fee producer, WASM and frontend inspectors; intercepted external observations and KV fetch.
     * @scenario Run unsupported raw-map or disabled-history fixtures through actual initialization; await the caught job failure and inspect scheduling, notification, legacy observations and persisted prices.
     * @expected The initialized job refuses publication, reports the failure and schedules its next attempt while retaining the asserted prior initialization effects.
     */
    it.each(lifecycleCases4)(
      '%s refuses publication after real initialization',
      async (mode, message) => {
        const result = await run(mode);
        expect(result.error).toBeUndefined(); // interval catches job failure and schedules a retry.
        expect(state.scheduled).toHaveBeenCalledOnce();
        expect(state.notifications.flat().join(' ')).toContain(message);
        expect(result.commands).toEqual([]);
        expect(state.rpc).toEqual([]);
        expect(state.legacy.length).toBeGreaterThan(0); // no claim that invalid AV policy prevents legacy observations.
        expect(
          (
            await source!.query(
              'SELECT COUNT(*) AS count FROM token_price_entity',
            )
          )[0].count,
        ).toBeGreaterThan(0);
      },
    );
  });
});
