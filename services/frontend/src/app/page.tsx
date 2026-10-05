'use client';

import { Qr, Validations } from '@/containers';

import { useAvalancheFeeUi } from '../queries/avalancheFeeUi';

const Home = () => {
  const enabled = process.env.NEXT_PUBLIC_AVALANCHE_FEE_PUBLICATION_ENABLED;
  const chain = process.env.NEXT_PUBLIC_AVALANCHE_CHAIN_ID;
  const snapshot = useAvalancheFeeUi(
    enabled === 'true' && (chain === '43113' || chain === '43114'),
  );
  if (enabled !== undefined && enabled !== 'false') {
    if (enabled !== 'true' || (chain !== '43113' && chain !== '43114'))
      return (
        <main>
          Avalanche publication is unavailable: invalid configuration.
        </main>
      );
  }
  return (
    <main className="flex flex-row p-8 gap-8">
      <div className="border-2 border-solid border-slate-300 shadow-xl rounded-2xl box-content grow">
        <Validations snapshot={enabled === 'true' ? snapshot : undefined} />
      </div>
      <div className="border-2 border-solid border-slate-300 shadow-xl rounded-2xl w-[380px] min-h-[380px] self-start  sticky top-8">
        <Qr snapshot={enabled === 'true' ? snapshot : undefined} />
      </div>
    </main>
  );
};

export default Home;
