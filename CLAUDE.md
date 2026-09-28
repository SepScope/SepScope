# SEPscope

pnpm monorepo (Node 22+). Check logic lives in `packages/core`. See README.md for the architecture.

## Testing (applies to every change)

Follow the "Testing requirements" section of CONTRIBUTING.md for every implementation:
- Unit tests with mocked HTTP (`test/helpers/mock-fetch.ts`) for both pass and fail cases, including malformed payloads, missing headers, bad signatures, and timeouts wherever they apply.
- Live tests go only in `test/live/*.live.test.ts`, gated by `RUN_LIVE_TESTS=1`.
- Keep coverage at 80% or higher. Never lower thresholds or add coverage excludes to get past them.

Commands: `pnpm test` (unit tests plus coverage), `RUN_LIVE_TESTS=1 pnpm test`, `pnpm typecheck`, `pnpm build`.
