import { createElement } from 'react';

import {
  legacyOptIns,
  supportedChains,
  invalidOptIns,
} from '../testData/avalanchePage';
import { renderHome } from '../testUtils/avalanchePage';

const state = vi.hoisted(() => ({
  query: vi.fn(),
  table: vi.fn(),
  qr: vi.fn(),
  snapshot: { data: { publicationId: 'reviewed-publication' } },
}));
vi.mock('../../src/queries/avalancheFeeUi', () => ({
  useAvalancheFeeUi: (enabled: boolean) => {
    state.query(enabled);
    return state.snapshot;
  },
}));
vi.mock('@/containers', () => ({
  Validations: ({ snapshot }: { snapshot?: unknown }) => {
    state.table(snapshot);
    return createElement('div', null, 'validations');
  },
  Qr: ({ snapshot }: { snapshot?: unknown }) => {
    state.qr(snapshot);
    return createElement('div', null, 'QR');
  },
}));

describe('Home', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_AVALANCHE_CHAIN_ID', '43113');
    state.query.mockClear();
    state.table.mockClear();
    state.qr.mockClear();
  });
  afterEach(() => vi.unstubAllEnvs());
  const literalFeeCases17 = legacyOptIns;
  /** Runs the unchanged control body against one original case row. */
  const runLiteralFeeCase17 = (enabled: (typeof literalFeeCases17)[number]) => {
    vi.stubEnv('NEXT_PUBLIC_AVALANCHE_FEE_PUBLICATION_ENABLED', enabled);
    expect(renderHome()).toContain('QR');
    expect(state.query).toHaveBeenCalledWith(false);
    expect(state.table).toHaveBeenCalledWith(undefined);
    expect(state.qr).toHaveBeenCalledWith(undefined);
  };

  /**
   * @target Home: preserves legacy rendering when enabled=undefined
   * @dependencies Actual Home with controlled query and existing-container spies.
   * @scenario Render each legacy setting.
   * @expected Snapshot query is disabled; both containers receive their legacy undefined snapshot.
   */
  it('preserves legacy rendering when enabled=undefined', () => {
    expect.hasAssertions();
    return runLiteralFeeCase17(literalFeeCases17[0]);
  });

  /**
   * @target Home: preserves legacy rendering when enabled=false
   * @dependencies Actual Home with controlled query and existing-container spies.
   * @scenario Render each legacy setting.
   * @expected Snapshot query is disabled; both containers receive their legacy undefined snapshot.
   */
  it('preserves legacy rendering when enabled=false', () => {
    expect.hasAssertions();
    return runLiteralFeeCase17(literalFeeCases17[1]);
  });

  const literalFeeCases19 = supportedChains;
  /** Runs the unchanged control body against one original case row. */
  const runLiteralFeeCase19 = (chain: (typeof literalFeeCases19)[number]) => {
    vi.stubEnv('NEXT_PUBLIC_AVALANCHE_FEE_PUBLICATION_ENABLED', 'true');
    vi.stubEnv('NEXT_PUBLIC_AVALANCHE_CHAIN_ID', chain);
    expect(renderHome()).toContain('validations');
    expect(state.query).toHaveBeenCalledWith(true);
    expect(state.table).toHaveBeenCalledWith(state.snapshot);
    expect(state.qr).toHaveBeenCalledWith(state.snapshot);
  };

  /**
   * @target Home: uses one existing snapshot on chain 43113
   * @dependencies Actual Home and existing-container spies.
   * @scenario Enable each supported chain and render.
   * @expected One enabled query and the identical snapshot object reaches both existing consumers.
   */
  it('uses one existing snapshot on chain 43113', () => {
    expect.hasAssertions();
    return runLiteralFeeCase19(literalFeeCases19[0]);
  });

  /**
   * @target Home: uses one existing snapshot on chain 43114
   * @dependencies Actual Home and existing-container spies.
   * @scenario Enable each supported chain and render.
   * @expected One enabled query and the identical snapshot object reaches both existing consumers.
   */
  it('uses one existing snapshot on chain 43114', () => {
    expect.hasAssertions();
    return runLiteralFeeCase19(literalFeeCases19[1]);
  });

  const literalFeeCases21 = invalidOptIns;
  /** Runs the unchanged control body against one original case row. */
  const runLiteralFeeCase21 = (
    enabled: (typeof literalFeeCases21)[number][0],
    chain: (typeof literalFeeCases21)[number][1],
  ) => {
    vi.stubEnv('NEXT_PUBLIC_AVALANCHE_FEE_PUBLICATION_ENABLED', enabled);
    vi.stubEnv('NEXT_PUBLIC_AVALANCHE_CHAIN_ID', chain);
    expect(renderHome()).toContain('invalid configuration');
    expect(state.query).toHaveBeenCalledWith(false);
    expect(state.table).not.toHaveBeenCalled();
    expect(state.qr).not.toHaveBeenCalled();
  };

  /**
   * @target Home: refuses invalid mode true/undefined
   * @dependencies Actual Home and query/container spies.
   * @scenario Render each isolated invalid mode or chain pair.
   * @expected Disabled query and no table or QR mount.
   */
  it('refuses invalid mode true/undefined', () => {
    expect.hasAssertions();
    return runLiteralFeeCase21(...literalFeeCases21[0]);
  });

  /**
   * @target Home: refuses invalid mode true/1
   * @dependencies Actual Home and query/container spies.
   * @scenario Render each isolated invalid mode or chain pair.
   * @expected Disabled query and no table or QR mount.
   */
  it('refuses invalid mode true/1', () => {
    expect.hasAssertions();
    return runLiteralFeeCase21(...literalFeeCases21[1]);
  });

  /**
   * @target Home: refuses invalid mode yes/43113
   * @dependencies Actual Home and query/container spies.
   * @scenario Render each isolated invalid mode or chain pair.
   * @expected Disabled query and no table or QR mount.
   */
  it('refuses invalid mode yes/43113', () => {
    expect.hasAssertions();
    return runLiteralFeeCase21(...literalFeeCases21[2]);
  });

  /**
   * @target Home: refuses invalid mode /43113
   * @dependencies Actual Home and query/container spies.
   * @scenario Render each isolated invalid mode or chain pair.
   * @expected Disabled query and no table or QR mount.
   */
  it('refuses invalid mode /43113', () => {
    expect.hasAssertions();
    return runLiteralFeeCase21(...literalFeeCases21[3]);
  });
});
