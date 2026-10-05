# Avalanche fee tests

Run the declared target from the repository root:

```sh
npm run test:avalanche
```

Use Node 22.18.0 or newer and the repository's npm installation. The command
uses the declared Vitest and tsx dependencies, sets the JavaScript crypto
backend, and saves JSON reports and logs under the ignored `.cache` directory.
Each run records its tool versions, expanded case titles and owning spec files.
Each job uses at most two workers to keep simultaneous WASM fixture starts
within the source tests' existing timeouts.

The backend and frontend also expose `test:avalanche` for running one service.
The root target covers 17 backend specs and 16 frontend specs through 15 jobs.
It checks every existing Avalanche config, removes overlapping selections, and
rejects a report that omits a selected spec or adds an unexpected one.

## Fixture contract

### Prepare and run

Install this repository's and Utils' build dependencies with their reviewed
lockfiles first. From the fee repository root, use Node 22.18.0 or newer and npm
11.6.2 to create a new fixture directory and run the complete target:

```sh
npm run prepare:avalanche-fixtures -- --output .cache/avalanche-fixtures --utils-root ../utils --run
```

If invoking Node directly, supply `--npm-cli` with the npm CLI JavaScript file;
otherwise the helper uses `npm_execpath` supplied by the npm script. The output directory
must not already exist. An interrupted setup keeps its logs and partial files;
select a new directory for another attempt.

Setup builds Utils' local `extended-typeorm` package, including its candidate
bootstrap, and installs its packed archive rather than an older registry
bootstrap. It downloads the three producer archives through the configured npm
registry, checks their fixed SHA-512 values and installs the pinned direct
dependencies. Installation runs dependency lifecycle scripts, including the
SQLite native binding setup. No running Guard, credentials or funded wallet is
required. Generated Utils build outputs are updated by its ordinary build.

The helper saves `environment.json`, `package-lock.json`, `fixture-receipt.json`,
archives and command logs. Direct versions are fixed; the first installation
resolves their transitive dependency ranges. Retain the resulting lockfile and
archives and use `npm ci` in that fixture directory to replay that dependency
graph. `--run` invokes the actual target, including the decoder/parser and other
fixture checks below. A successful setup alone is not a passing test result.

For later runs, import the saved environment and invoke the public target. For
example, in PowerShell from the fee repository root:

```powershell
$fixture = Get-Content .cache/avalanche-fixtures/environment.json | ConvertFrom-Json
$fixture.PSObject.Properties | ForEach-Object { [Environment]::SetEnvironmentVariable($_.Name, $_.Value, 'Process') }
npm run test:avalanche
```

### Environment

Set all eight variables before invoking the target. Paths may be absolute or
relative to the directory where the command starts. The dependency fixtures are
trusted local test inputs; the command does not download or install packages.

| Variable                            | Fixture                                                                                                                                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AVALANCHE_GUARD_PACKAGE_JSON`      | Package manifest for an installed fixture dependency tree providing the Guard minimum-fee decoder 4.0.1, WASM 0.24.1 and the SDK dependencies used by the test configs. It does not need to be a running Guard service. |
| `AVALANCHE_FEE_V3_ARCHIVE`          | Original `@rosen-bridge/minimum-fee` 3.1.2 npm tarball.                                                                                                                                                                 |
| `AVALANCHE_TOKENS_V5_ARCHIVE`       | Original `@rosen-bridge/tokens` 5.0.0 npm tarball.                                                                                                                                                                      |
| `AVALANCHE_SEMAPHORE_ARCHIVE`       | Original `await-semaphore` 0.1.3 npm tarball.                                                                                                                                                                           |
| `AVALANCHE_FRONTEND_REACT_FIXTURES` | A `node_modules` directory containing React, React DOM and React Test Renderer 18.3.1.                                                                                                                                  |
| `AVALANCHE_PUBLICATION_KV_PACKAGE`  | The installed `@vercel/kv` 3.0.0 JavaScript entry file.                                                                                                                                                                 |
| `AVALANCHE_AUTHORITY_ARTIFACT_ROOT` | Writable directory for synthetic economic authority files.                                                                                                                                                              |
| `AVALANCHE_LIFECYCLE_ARTIFACT_ROOT` | Writable directory for synthetic service configuration, SQLite databases and lifecycle artifacts.                                                                                                                       |

The launcher verifies the three archive SHA-512 identities before running any
test. It also checks the decoder version and exact parser SHA-256, WASM version,
React fixture versions, KV 3.0.0 and its Redis transport 1.34.2. Missing fixtures or mismatched bytes stop
the command before a test process starts. The archive identities are defined in
the launcher and checked again by the producer fixtures.

The 3.1.2 archive supplies the real fee producer. The installed 4.0.1 decoder
exercises its downstream consumer, while the token fixture uses the original
5.0.0 producer. These roles intentionally have different versions. Replacing
them with the current application dependencies changes the test contract.
The archive evaluator also consumes `abstract-logger` 4.0.0 through the declared
tsx loader. Its `DefaultLogger` API is required by the selected producer fixture;
logger 3.0.1 supplies a different API and cannot replace it.
The recipe pins `@upstash/redis` 1.34.2 as well as KV 3.0.0 to preserve the
transport's historical batching fixture. A newer transitive Redis SDK changes
the intercepted `flushdb` request shape and therefore changes this test input.

## Test scope

The convention for source-owned TypeScript unit tests is
[RCS-001](https://github.com/rosen-bridge/rcs/blob/7b9784dae9d8d5b66b80de7a6043d1ba36a3a4bf/rcs-001.md).
They retain real WASM construction, serialization and decoding where those bytes
are the behavior under test. RPC replies, prices and KV transport use synthetic
fixtures. No credentials or funded wallet are needed.

The consumer-join and economics-join suites are supplementary integration tests.
Their 17 and 20 cases call the actual backend producer and frontend inspectors;
they check that the same constructed transaction reaches its downstream
structure and economics consumers. The lifecycle suite also exercises actual
service initialization against synthetic configuration and SQLite. These joins
remain separate matrix entries, alongside the source-owned tests.

The transport fixtures intercept external calls and reject unexpected requests.
The command's result describes the selected synthetic test execution. Deployment,
signing authority and live bridge operation require their own evidence.

Helper descriptions and contribution conventions follow
[RCS-002](https://github.com/rosen-bridge/rcs/blob/7b9784dae9d8d5b66b80de7a6043d1ba36a3a4bf/rcs-002.md).
The separate repository `npm test` workspace target also includes package tests;
`test:avalanche` selects the fee application's Avalanche matrix.

The frontend selection includes the existing page, validation table and QR consumer checks. These checks bind both consumers to one reviewed publication and refuse refreshed publication drift. The former AvalanchePublication prototype is excluded.
