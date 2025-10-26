# @tsip/computed-flow

## 0.2.0

### Minor Changes

- [#8](https://github.com/Nodge/tsip-computed-flow/pull/8) [`c57a956`](https://github.com/Nodge/tsip-computed-flow/commit/c57a95662dae6c47590a19a12154cba4ec025c14) Thanks [@Nodge](https://github.com/Nodge)! - Integrate Flow spec compatibility tests.

- [#8](https://github.com/Nodge/tsip-computed-flow/pull/8) [`c57a956`](https://github.com/Nodge/tsip-computed-flow/commit/c57a95662dae6c47590a19a12154cba4ec025c14) Thanks [@Nodge](https://github.com/Nodge)! - Improve listener error handling: errors in listeners are now logged via `console.error` instead of throwing an `AggregatedError`. This ensures the flow state remains consistent even when individual listeners fail, preventing cascading failures and improving application resilience.

### Patch Changes

- [#8](https://github.com/Nodge/tsip-computed-flow/pull/8) [`c57a956`](https://github.com/Nodge/tsip-computed-flow/commit/c57a95662dae6c47590a19a12154cba4ec025c14) Thanks [@Nodge](https://github.com/Nodge)! - Fix stale subscriptions bug where listeners added after initial computation were not properly subscribed to flow sources. Ensures all listeners correctly receive updates regardless of when they are attached.

- [#8](https://github.com/Nodge/tsip-computed-flow/pull/8) [`c57a956`](https://github.com/Nodge/tsip-computed-flow/commit/c57a95662dae6c47590a19a12154cba4ec025c14) Thanks [@Nodge](https://github.com/Nodge)! - Fix `flow.asPromise()` to return a stable promise instance across multiple pending computations, preventing race conditions and ensuring consistent promise references.

## 0.1.2

### Patch Changes

- [#5](https://github.com/Nodge/tsip-computed-flow/pull/5) [`3436be4`](https://github.com/Nodge/tsip-computed-flow/commit/3436be48477db5d4147f29f020e8e4015738ade3) Thanks [@Nodge](https://github.com/Nodge)! - Fix false-positive memoize cache hit when the param is `undefined`.

## 0.1.1

### Patch Changes

- [#2](https://github.com/Nodge/tsip-computed-flow/pull/2) [`b5e2e2c`](https://github.com/Nodge/tsip-computed-flow/commit/b5e2e2c90266ba913bd12b6a3193885885edee95) Thanks [@Nodge](https://github.com/Nodge)! - Fix TypeScript declaration file generation by enabling DTS resolution in tsup config. This removes the dependency on the `@tsip/types` package.

## 0.1.0

### Minor Changes

- [`0693734`](https://github.com/Nodge/tsip-computed-flow/commit/0693734c5e0bc24a24230f711b29aff763364a6c) Thanks [@Nodge](https://github.com/Nodge)! - Initial release of @tsip/computed-flow - a TypeScript implementation of computed reactive data flows based on the TypeScript Interface Proposals (TSIP).
