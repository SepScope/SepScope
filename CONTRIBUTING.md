# Contributing to SEPscope

## Setup

```bash
corepack enable
pnpm install
pnpm test
```

Node.js 22 or newer is required.

## Testing requirements

These rules apply to **every** implementation in this repository: every check, every package, and every app. A pull request that adds or changes behavior without meeting them will not be merged.

### 1. Unit tests with mocked HTTP

- Every check has unit tests covering **both passing and failing cases**. No unit test may touch the network.
- Inject HTTP through `CheckContext.fetch` and use the shared helper in `packages/core/test/helpers/mock-fetch.ts`. It maps URLs to canned responses, records every request, and simulates a server that never answers (`"hang"`).
- At a minimum, the failure cases must include each of the following that applies to the code under test:

  | Failure | How to simulate it |
  |---|---|
  | Malformed payload (TOML, JSON, XDR) | Return a syntactically broken body |
  | Missing or wrong required header (e.g. CORS) | Omit it, or return a different value |
  | Bad cryptography (e.g. a SEP-10 challenge signed by the wrong key) | Sign the fixture with a key other than the toml's `SIGNING_KEY` (see `test/checks/sep10.test.ts`) |
  | Timeout | Route the URL to `"hang"` and pass a small `timeoutMs` |
  | Non-2xx status and network errors | Return e.g. `status: 500`, or leave the URL unmapped |

- Code that touches the database runs its unit tests against an in-memory Postgres from `@sepscope/db/testing` (`createTestDb`, PGlite) with the real migrations applied. Share one database per test file and call `resetTestDb` in `beforeEach`; starting PGlite takes a few seconds.
- Also test dependency handling: a check whose prerequisite failed must be `skipped`, not `fail`.
- Tests mirror the source layout: `src/checks/sepN.ts` is tested in `test/checks/sepN.test.ts`, and every check ID appears in a test. `test/conventions.test.ts` enforces this.

### 2. Live integration tests, behind `RUN_LIVE_TESTS=1`

- Anything that talks to real anchors gets an integration test in a `test/live/*.live.test.ts` file, wrapped in `describe.skipIf(process.env.RUN_LIVE_TESTS !== "1")`.
- The core suite runs **all registered checks** against `testanchor.stellar.org` (`packages/core/test/live/testanchor.live.test.ts`). A new check is covered automatically once it is added to `allChecks`. Update that test's expectations if the new check cannot pass against the test anchor.
- CI never sets `RUN_LIVE_TESTS`, so it stays fast and does not depend on third-party uptime. Run live tests locally before merging changes to check behavior:

  ```bash
  RUN_LIVE_TESTS=1 pnpm test
  ```

### 3. Coverage of at least 80%

- `pnpm test` collects coverage, and each package's `vitest.config.ts` fails the run below **80%** statements, branches, functions, or lines. `packages/core` enforces this today. New packages and apps must copy the same thresholds.
- Do not lower a threshold, and do not add files to the coverage `exclude` list to get around it. Only files that are pure type declarations or re-exports may be excluded.

### Checklist for a new check

1. Add `src/checks/<sep>.ts` that implements `Check`, and declare its `dependsOn`.
2. Register it in `allChecks` in `src/runner.ts`, after its dependencies.
3. Add `test/checks/<sep>.test.ts` with the passing and failing cases described above.
4. Run `pnpm typecheck`, `pnpm test`, and `RUN_LIVE_TESTS=1 pnpm test`.
