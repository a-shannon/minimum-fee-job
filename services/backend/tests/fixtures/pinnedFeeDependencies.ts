import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { gunzipSync } from 'node:zlib';

const archive = (env: string, integrity: string) => {
  const path = process.env[env];
  if (!path) throw new Error(`Required pinned fixture: ${env}`);
  const bytes = readFileSync(path);
  if (createHash('sha512').update(bytes).digest('base64') !== integrity)
    throw new Error('Pinned archive integrity mismatch');
  const tar = gunzipSync(bytes),
    sources: Record<string, string> = {};
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
      .split('//#')[0];
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return sources;
};
const evaluate = (source: string, imports: Record<string, unknown>) => {
  const names = Array.from(
    source.matchAll(/^export (?:class|const|var|function) (\w+)/gm),
    (match) => match[1],
  );
  return new Function(
    ...Object.keys(imports),
    source
      .replace(/^import[\s\S]*?;\r?\n/gm, '')
      .replace(/^export (class|const|var|function) /gm, '$1 ') +
      `\nreturn {${names.join(',')}};`,
  )(...Object.values(imports));
};

/** Evaluates exact integrity-verified producer modules; no installation or network. */
export const pinnedFeeDependencies = () => {
  const packagePath = process.env.AVALANCHE_GUARD_PACKAGE_JSON;
  if (!packagePath)
    throw new Error('Required fixture: AVALANCHE_GUARD_PACKAGE_JSON');
  const require = createRequire(packagePath),
    wasm = require('ergo-lib-wasm-nodejs'),
    logger = require('@rosen-bridge/abstract-logger');
  const fee = archive(
    'AVALANCHE_FEE_V3_ARCHIVE',
    'jixoO+JwD/+YDRHmzeTABrXBqtKao91pj2TBDHAOru6Hd63nvJ4bRpJv+cGQmXAkVdDdhNNUaCy5OFS0A3J/uA==',
  );
  const token = archive(
    'AVALANCHE_TOKENS_V5_ARCHIVE',
    'KNr5/wBPcbEBSfXgfgpYIEr+Mz+ebeEankzFFWV1b2lBE8B68GhF973c4NtkC4+Hw1L+d85dtWCH+1um6T6ZcA==',
  );
  const semaphore = archive(
    'AVALANCHE_SEMAPHORE_ARCHIVE',
    'd1W2aNSYcz/sxYO4pMGX9vq65qOTu0P800epMud+6cYYX0QcT7zyqcxec3VWzpgvdXo57UWmVbZpLMjX2m1I7Q==',
  );
  const semaphoreExports: Record<string, unknown> = {};
  new Function('exports', semaphore['package/index.js'])(semaphoreExports);
  const tokens = {
    ...evaluate(token['package/dist/constants.js'], {}),
    ...evaluate(token['package/dist/errors.js'], {}),
  };
  Object.assign(
    tokens,
    evaluate(token['package/dist/tokenMap.js'], {
      ...tokens,
      ...logger,
      Semaphore: semaphoreExports.Semaphore,
    }),
  );
  const fees = {
    ...evaluate(fee['package/dist/types.js'], {}),
    ...evaluate(fee['package/dist/errors.js'], {}),
    ...evaluate(fee['package/dist/constants.js'], {}),
    ...evaluate(fee['package/dist/minimumFeeConfig.js'], {}),
  };
  Object.assign(fees, evaluate(fee['package/dist/utils.js'], wasm));
  Object.assign(
    fees,
    evaluate(fee['package/dist/minimumFeeBoxBuilder.js'], { ...wasm, ...fees }),
  );
  const json = require('@rosen-bridge/json-bigint');
  Object.assign(
    fees,
    evaluate(fee['package/dist/minimumFeeBox.js'], {
      ...wasm,
      ...fees,
      ...logger,
      JsonBigInt: json.default ?? json,
      ergoExplorerClientFactory: () => ({}),
      ergoNodeClientFactory: () => ({}),
      handleApiError: () => {
        throw Error('Unexpected network');
      },
    }),
  );
  return { fees, tokens, wasm };
};
