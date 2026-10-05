import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

import type { AvalancheChainFee } from '../../src/minimum-fee/avalancheChainFee';

export interface Fee {
  heights: Record<string, number>;
  configs: Record<string, AvalancheChainFee>;
}
export interface EncodedConstant {
  encode_to_base16(): string;
  to_js(): unknown;
}
export interface Constants {
  from_js(value: unknown): EncodedConstant;
  decode_from_base16(hex: string): EncodedConstant;
}
let config: {
  setChainConfig(
    chain: string,
    height: number,
    fee: AvalancheChainFee,
  ): unknown;
  getConfig(): Fee;
};
let encode: (fees: Fee[]) => Record<string, EncodedConstant>;
let decode: (box: unknown, decoder: (hex: string) => unknown) => Fee[];
let Box: new (...args: unknown[]) => {
  box: unknown;
  getFee(from: string, height: number, to: string): AvalancheChainFee;
};
let Constant: Constants;
let initialization: Promise<void> | undefined;
/** Qualifies the original offline serializer, WASM and downstream Guard parser before exposing their exact fixture objects. */
const initializeOfflineCodec = async () => {
  const archive = process.env.AVALANCHE_FEE_V3_ARCHIVE;
  const guardPackage = process.env.AVALANCHE_GUARD_PACKAGE_JSON;
  if (!archive || !guardPackage)
    throw new Error(
      'Required offline fixtures: AVALANCHE_FEE_V3_ARCHIVE and AVALANCHE_GUARD_PACKAGE_JSON',
    );
  const compressed = readFileSync(archive);
  expect(createHash('sha512').update(compressed).digest('base64')).toEqual(
    'jixoO+JwD/+YDRHmzeTABrXBqtKao91pj2TBDHAOru6Hd63nvJ4bRpJv+cGQmXAkVdDdhNNUaCy5OFS0A3J/uA==',
  );
  const tar = gunzipSync(compressed);
  const sources: Record<string, string> = {};
  for (let offset = 0; offset + 512 < tar.length; ) {
    const name = tar
      .subarray(offset, offset + 100)
      .toString()
      .replace(/\0.*$/s, '');
    if (!name) break;
    const size =
      parseInt(tar.subarray(offset + 124, offset + 136).toString(), 8) || 0;
    sources[name] = tar
      .subarray(offset + 512, offset + 512 + size)
      .toString()
      .split('//# sourceMappingURL')[0];
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  const require = createRequire(guardPackage);
  Constant = require('ergo-lib-wasm-nodejs').Constant;
  expect(require('ergo-lib-wasm-nodejs/package.json').version).toEqual(
    '0.24.1',
  );
  const directory = dirname(require.resolve('@rosen-bridge/minimum-fee'));
  expect(
    JSON.parse(readFileSync(join(directory, '../package.json'), 'utf8'))
      .version,
  ).toEqual('4.0.1');
  const parserPath = join(directory, 'utils.js');
  expect(
    createHash('sha256').update(readFileSync(parserPath)).digest('hex'),
  ).toEqual('29bf09160751542324333147c79973efc6dbb91c2cb93fb2e98a553a090f4d09');
  // Evaluate only integrity-verified upstream source; no network or package installation.
  encode = new Function(
    'Constant',
    sources['package/dist/utils.js']
      .replace(/^import[^\n]+\n/, '')
      .replaceAll('export const ', 'const ') + '\nreturn feeToRegisterValues;',
  )(Constant);
  config = new (new Function(
    sources['package/dist/minimumFeeConfig.js'].replace(
      'export class ',
      'class ',
    ) + '\nreturn MinimumFeeConfig;',
  )())();
  decode = (await import(pathToFileURL(parserPath).href)).extractFeeFromBox;
  Box = (await import(pathToFileURL(join(directory, 'minimumFeeBox.js')).href))
    .MinimumFeeBox;
};
/** Shares one integrity-checked initialization between the build and apply codec contexts, retaining the original configuration object identity. */
export const loadChainFeeCodec = async () => {
  initialization ??= initializeOfflineCodec();
  await initialization;
  return { config, encode, decode, Box, Constant };
};
export type ChainFeeCodec = Awaited<ReturnType<typeof loadChainFeeCodec>>;
