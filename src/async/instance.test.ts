import { createFlow, createAsyncFlow } from "@tsip/flow";
import type { FlowSubscription } from "@tsip/types";
import { describe, it, expect, vi } from "vitest";
import { AsyncComputedFlow } from "./instance";

describe.skip("ComputedFlow", () => {
    describe("basic functionality", () => {
        it("should compute and return synchronous values", () => {
            const flow = new AsyncComputedFlow(() => "const");
            const value = flow.getSnapshot();
            expect(value).toBe("const");
        });

        it("should compute values based on dependencies", () => {
            const source = createFlow(2);
            const flow = new AsyncComputedFlow(({ get }) => get(source) * 2);
            const value = flow.getSnapshot();
            expect(value).toBe(4);
        });

        it("should recompute when dependencies change", () => {
            const source = createFlow(2);

            const flow = new AsyncComputedFlow(({ get }) => get(source) * 2);
            expect(flow.getSnapshot()).toBe(4);

            source.emit(3);
            expect(flow.getSnapshot()).toBe(6);
        });

        it("should handle multiple dependencies", () => {
            const source1 = createFlow(2);
            const source2 = createFlow(3);
            const source3 = createFlow(4);

            const flow = new AsyncComputedFlow(({ get }) => get(source1) + get(source2) + get(source3));
            expect(flow.getSnapshot()).toBe(2 + 3 + 4);

            source1.emit(5);
            expect(flow.getSnapshot()).toBe(5 + 3 + 4);

            source2.emit(6);
            expect(flow.getSnapshot()).toBe(5 + 6 + 4);
        });
    });

    describe("subscription behavior", () => {
        it("should notify subscribers when value changes", () => {
            const source = createFlow(1);
            const flow = new AsyncComputedFlow(({ get }) => get(source) * 2);
            const listener = vi.fn();

            flow.subscribe(listener);
            expect(listener).toHaveBeenCalledTimes(0);

            source.emit(3);
            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith();
        });

        it("should notify multiple subscribers", () => {
            const source = createFlow(1);
            const flow = new AsyncComputedFlow(({ get }) => get(source) * 2);
            const listener1 = vi.fn();
            const listener2 = vi.fn();
            const listener3 = vi.fn();

            flow.subscribe(listener1);
            flow.subscribe(listener2);
            flow.subscribe(listener3);

            source.emit(5);

            expect(listener1).toHaveBeenCalledTimes(1);
            expect(listener2).toHaveBeenCalledTimes(1);
            expect(listener3).toHaveBeenCalledTimes(1);
        });

        it("should stop notifications after unsubscribe", () => {
            const source = createFlow(1);
            const flow = new AsyncComputedFlow(({ get }) => get(source) * 2);
            const listener = vi.fn();

            const subscription = flow.subscribe(listener);
            source.emit(3);
            expect(listener).toHaveBeenCalledTimes(1);

            subscription.unsubscribe();

            source.emit(4);
            expect(listener).toHaveBeenCalledTimes(1);
        });

        it("should handle subscription during notification", () => {
            const source = createFlow(1);
            const flow = new AsyncComputedFlow(({ get }) => get(source) * 2);
            const listener1 = vi.fn();
            const listener2 = vi.fn();

            flow.subscribe(() => {
                listener1();
                // Subscribe during notification
                flow.subscribe(listener2);
            });

            source.emit(3);

            expect(listener1).toHaveBeenCalledTimes(1);
            // listener2 should not be called during the same notification cycle
            expect(listener2).not.toHaveBeenCalled();

            // But should be called on the next change
            source.emit(4);
            expect(listener2).toHaveBeenCalledTimes(1);
        });

        it("should handle unsubscription during notification", () => {
            const source = createFlow(1);
            const flow = new AsyncComputedFlow(({ get }) => get(source) * 2);
            const listener1 = vi.fn();
            const listener2 = vi.fn();

            // eslint-disable-next-line prefer-const
            let subscription2: FlowSubscription | undefined;

            flow.subscribe(() => {
                listener1();
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                subscription2!.unsubscribe();
            });

            subscription2 = flow.subscribe(listener2);

            source.emit(3);
            expect(listener1).toHaveBeenCalledTimes(1);
            expect(listener2).toHaveBeenCalledTimes(1);

            source.emit(4);
            expect(listener1).toHaveBeenCalledTimes(2);
            expect(listener2).toHaveBeenCalledTimes(1); // Not called after unsubscribe
        });

        it("should remove only specific subscription on multiple unsubscribe calls", () => {
            const source = createFlow(1);
            const flow = new AsyncComputedFlow(({ get }) => get(source) * 2);
            const listener1 = vi.fn();
            const listener2 = vi.fn();

            const subscription1 = flow.subscribe(listener1);
            flow.subscribe(listener2);

            // Call unsubscribe1 multiple times
            subscription1.unsubscribe();
            subscription1.unsubscribe(); // Should be safe to call multiple times
            subscription1.unsubscribe();

            source.emit(3);

            expect(listener1).not.toHaveBeenCalled();
            expect(listener2).toHaveBeenCalledTimes(1);
        });
    });

    describe("async behavior", () => {
        it("should handle promise-returning getters", async () => {
            const flow = new AsyncComputedFlow(() => Promise.resolve("async result"));
            const listener = vi.fn();

            flow.subscribe(listener);

            const initialState = flow.getSnapshot();
            expect(initialState).toEqual({ status: "pending" });

            await nextTick();

            expect(flow.getSnapshot()).toEqual({ status: "success", data: "async result" });
            expect(listener).toHaveBeenCalledTimes(1);
        });

        it("should emit success state when promise resolves", async () => {
            const { promise, resolve } = Promise.withResolvers();
            const flow = new AsyncComputedFlow(() => promise);
            const listener = vi.fn();

            flow.subscribe(listener);
            expect(flow.getSnapshot()).toEqual({ status: "pending" });

            resolve("resolved data");
            await promise;

            expect(flow.getSnapshot()).toEqual({ status: "success", data: "resolved data" });
            expect(listener).toHaveBeenCalledTimes(1);
        });

        it("should emit error state when promise rejects", async () => {
            const { promise, reject } = Promise.withResolvers();

            const flow = new AsyncComputedFlow(() => promise);
            const listener = vi.fn();

            flow.subscribe(listener);

            // Initially should be pending
            expect(flow.getSnapshot()).toEqual({ status: "pending" });

            const error = new Error("test error");
            reject(error);
            await expect(promise).rejects.toBe(error);

            expect(flow.getSnapshot()).toEqual({ status: "error", error, data: undefined });
            expect(listener).toHaveBeenCalledTimes(1);
        });

        it("should preserve previous data in pending state", async () => {
            const source = createFlow(1);
            const { promise, resolve } = Promise.withResolvers();

            const flow = new AsyncComputedFlow(async ({ get }) => {
                const value = get(source);
                if (value === 1) {
                    return "initial data";
                }
                return promise;
            });

            const listener = vi.fn();
            flow.subscribe(listener);
            expect(listener).toHaveBeenCalledTimes(0);

            expect(flow.getSnapshot()).toEqual({ status: "pending", data: undefined });
            expect(listener).toHaveBeenCalledTimes(0);

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: "initial data" });
            expect(listener).toHaveBeenCalledTimes(1);

            // Trigger new async computation
            source.emit(2);

            // Notified about the source change
            expect(listener).toHaveBeenCalledTimes(2);

            // Should be pending but preserve previous data
            const pendingState = flow.getSnapshot();
            expect(pendingState).toEqual({
                status: "pending",
                data: "initial data",
            });

            // Should be no additional notification while emmiting pending status
            expect(listener).toHaveBeenCalledTimes(2);

            resolve("new data");
            await nextTick();

            expect(flow.getSnapshot()).toEqual({ status: "success", data: "new data" });
            expect(listener).toHaveBeenCalledTimes(3);
        });

        it("should preserve previous data in error state", async () => {
            const source = createFlow(1);
            const { promise, reject } = Promise.withResolvers();

            const flow = new AsyncComputedFlow(async ({ get }) => {
                const value = get(source);
                if (value === 1) {
                    return "initial data";
                }
                return promise;
            });

            const listener = vi.fn();
            flow.subscribe(listener);
            expect(listener).toHaveBeenCalledTimes(0);

            expect(flow.getSnapshot()).toEqual({ status: "pending", data: undefined });
            expect(listener).toHaveBeenCalledTimes(0);

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: "initial data" });
            expect(listener).toHaveBeenCalledTimes(1);

            // Trigger async computation that will fail
            source.emit(2);

            // Should be pending but preserve previous data
            const pendingState = flow.getSnapshot();
            expect(pendingState).toEqual({
                status: "pending",
                data: "initial data",
            });

            // Should be no additional notification while emmiting pending status
            expect(listener).toHaveBeenCalledTimes(2);

            // Reject the promise
            const error = new Error("test error");
            reject(error);

            await nextTick();

            // Should be error but preserve previous data
            expect(flow.getSnapshot()).toEqual({
                status: "error",
                error,
                data: "initial data",
            });
            expect(listener).toHaveBeenCalledTimes(3);
        });

        it("should handle async dependencies with getAsync", async () => {
            const asyncSource = createAsyncFlow<string>({ status: "pending" });

            const flow = new AsyncComputedFlow(async ({ getAsync }) => {
                const data = await getAsync(asyncSource);
                return `processed: ${data}`;
            });

            const listener = vi.fn();
            flow.subscribe(listener);

            // Should be pending initially
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: undefined });

            // Resolve the async source
            asyncSource.emit({ status: "success", data: "source data" });

            await nextTick();

            expect(flow.getSnapshot()).toEqual({
                status: "success",
                data: "processed: source data",
            });
            expect(listener).toHaveBeenCalledTimes(1);
        });

        it.only("should emit computed values for every source change", async () => {
            const source = createAsyncFlow<number>({ status: "success", data: 0 });
            const queue: (() => void)[] = [];

            const flow = new AsyncComputedFlow(async ({ getAsync }) => {
                const value = await getAsync(source);
                // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
                const { resolve, promise } = Promise.withResolvers<void>();
                queue.push(resolve);
                await promise;
                return value * 2;
            });

            const resolve = async (index: number) => {
                await nextTick();
                queue[index]?.();
                await nextTick();
            };

            const listener = vi.fn();
            flow.subscribe(listener);
            expect(listener).toHaveBeenCalledTimes(0);

            // Initially pending because we are waiting for the async function to run
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: undefined });
            expect(listener).toHaveBeenCalledTimes(0);

            await resolve(0);
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 0 });
            expect(listener).toHaveBeenCalledTimes(1);

            // first async operation
            source.emit({ status: "pending" });
            source.emit({ status: "success", data: 2 });

            // second async operation
            source.emit({ status: "pending" });
            source.emit({ status: "success", data: 4 });

            await resolve(1);
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 4 });

            await resolve(2);
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 8 });

            // TODO
            // expect(listener).toHaveBeenCalledTimes(3);
        });

        it("should emit computed values in computation start order", async () => {
            const source = createAsyncFlow<number>({ status: "success", data: 0 });
            const queue: (() => void)[] = [];

            const flow = new AsyncComputedFlow(async ({ getAsync }) => {
                const value = await getAsync(source);
                // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
                const { resolve, promise } = Promise.withResolvers<void>();
                queue.push(resolve);
                await promise;
                return value * 2;
            });

            const resolve = async (index: number) => {
                await nextTick();
                queue[index]?.();
                await nextTick();
            };

            const listener = vi.fn();
            flow.subscribe(listener);
            expect(listener).toHaveBeenCalledTimes(0);

            // Initially pending because we are waiting for the async function to run
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: undefined });
            expect(listener).toHaveBeenCalledTimes(0);

            await resolve(0);
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 0 });
            expect(listener).toHaveBeenCalledTimes(1);

            // first async operation
            source.emit({ status: "pending" });
            source.emit({ status: "success", data: 2 });

            // second async operation
            source.emit({ status: "pending" });
            source.emit({ status: "success", data: 4 });

            await resolve(2);
            // The flow snapshot should not change since because first async operation still running
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });

            await resolve(1);
            // The fow snapshot should contain the value for second async operation
            // First async operation should be ignored at this point
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 8 });

            // TODO
            // expect(listener).toHaveBeenCalledTimes(3);
        });

        it("should abort signal when new computation starts", async () => {
            const source = createAsyncFlow<number>({ status: "success", data: 0 });

            const flow = new AsyncComputedFlow(async ({ getAsync, signal }) => {
                const value = await getAsync(source);
                signal.throwIfAborted();
                return value * 2;
            });

            const listener = vi.fn();
            flow.subscribe(listener);
            expect(listener).toHaveBeenCalledTimes(0);

            // Initially pending because we are waiting for the async function to run
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: undefined });
            expect(listener).toHaveBeenCalledTimes(0);

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 0 });
            expect(listener).toHaveBeenCalledTimes(1);

            // start async operation
            source.emit({ status: "pending" });
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });
            expect(listener).toHaveBeenCalledTimes(2);

            // finish async operation
            source.emit({ status: "success", data: 2 });
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });
            expect(listener).toHaveBeenCalledTimes(2);

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 4 });
            expect(listener).toHaveBeenCalledTimes(3);

            // TODO: check abort signal
        });

        // todo: multiple pending states
        // todo: multiple success states
        // todo: multiple error states
    });

    describe("getDataSnapshot behavior", () => {
        it("should resolve immediately for success state", () => {
            // Arrange: create flow with success async state
            // Act: call getDataSnapshot()
            // Expect: promise resolves immediately with data
        });

        it("should reject immediately for error state", () => {
            // Arrange: create flow with error async state
            // Act: call getDataSnapshot()
            // Expect: promise rejects immediately with error
        });

        it("should wait for pending state to resolve", () => {
            // Arrange: create flow with pending async state
            // Act: call getDataSnapshot()
            // Expect: promise waits for state transition and resolves with data
        });

        it("should return same promise for concurrent calls", () => {
            // Arrange: create flow with pending async state
            // Act: call getDataSnapshot() multiple times concurrently
            // Expect: all calls return same promise instance
        });

        it("should return stable promise reference when cached value exists", () => {
            // Arrange: create flow with cached async value
            // Act: call getDataSnapshot() multiple times
            // Expect: returns same promise instance for cached values
        });

        it("should return stable promise reference during getter execution", () => {
            // Arrange: create flow with long-running async getter
            // Act: call getDataSnapshot() multiple times during execution
            // Expect: returns same promise instance while getter is running
        });

        it("should return new promise reference when sources change during execution", () => {
            // Arrange: create flow with async getter, start execution
            // Act: change source values during getter execution, call getDataSnapshot()
            // Expect: returns new promise instance for updated computation
        });

        it("should clean up subscriptions on promise resolve", () => {
            // Arrange: create flow with pending async state, call getDataSnapshot()
            // Act: wait for promise to resolve
            // Expect: internal subscriptions are cleaned up after resolve
        });

        it("should clean up subscriptions on promise reject", () => {
            // Arrange: create flow with failing async state, call getDataSnapshot()
            // Act: wait for promise to reject
            // Expect: internal subscriptions are cleaned up after reject
        });

        it("should ignore multiple pending states", () => {
            // Arrange: create flow that transitions through multiple pending states
            // Act: call getDataSnapshot() during transitions
            // Expect: handles multiple pending states correctly without confusion
        });

        it("should throw exception if getter returns non-promise in async context", () => {
            // Arrange: create flow with getter that returns non-promise in async context
            // Act: call getDataSnapshot()
            // Expect: throws exception for invalid return type
        });

        it("should handle state transitions from pending to success", () => {
            // Arrange: create flow with pending state, call getDataSnapshot()
            // Act: transition to success state
            // Expect: promise resolves with success data
        });

        it("should handle state transitions from pending to error", () => {
            // Arrange: create flow with pending state, call getDataSnapshot()
            // Act: transition to error state
            // Expect: promise rejects with error
        });

        it("should resolve promises in computation start order", async () => {
            const source = createAsyncFlow<number>({ status: "success", data: 0 });

            const flow = new AsyncComputedFlow(async ({ getAsync }) => {
                const value = await getAsync(source);
                // await new Promise((r) => setTimeout(r, timeout));
                return value * 2;
            });

            const listener = vi.fn();
            flow.subscribe(listener);
            expect(listener).toHaveBeenCalledTimes(0);

            // Initially pending because we are waiting for the async function to run
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: undefined });
            expect(listener).toHaveBeenCalledTimes(0);

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 0 });
            expect(listener).toHaveBeenCalledTimes(1);

            // first async operation
            source.emit({ status: "pending" });
            source.emit({ status: "success", data: 2 });
            // get data promise

            // second async operation
            source.emit({ status: "pending" });
            source.emit({ status: "success", data: 4 });
            // get data promise

            // resolve second
            // resolve first
            // check promise1 resolved before promise2

            // check listeners
        });
    });

    describe("error handling", () => {
        it("should propagate synchronous getter errors", () => {
            // Arrange: create flow with getter that throws synchronously
            // Act: call getSnapshot()
            // Expect: throws error from getter
        });

        it("should propagate dependency errors", () => {
            // Arrange: create flow depending on source that throws
            // Act: call getSnapshot()
            // Expect: propagates dependency error
        });

        it("should handle listener errors gracefully", () => {
            // Arrange: create flow, subscribe with throwing listener
            // Act: trigger value change
            // Expect: error caught and wrapped in AggregateError
        });

        it("should aggregate multiple listener errors", () => {
            // Arrange: create flow, subscribe with multiple throwing listeners
            // Act: trigger value change
            // Expect: all errors collected in single AggregateError
        });

        it("should handle skip() calls", () => {
            // Arrange: create flow with getter that calls skip()
            // Act: call getSnapshot()
            // Expect: throws AbortError, doesn't update value
        });

        it("should handle signal abortion in async operations", () => {
            // Arrange: create flow with signal-aware async getter
            // Act: abort signal during computation
            // Expect: handles abortion gracefully, starts new computation
            // signal.throwIfAborted() ?
        });
    });

    describe("context API", () => {
        it("should provide get() method for synchronous dependencies", () => {
            // Arrange: create flow with getter using context.get()
            // Act: call getSnapshot()
            // Expect: get() method reads dependency values correctly
        });

        it("should provide getAsync() method for async dependencies", () => {
            // Arrange: create flow with getter using context.getAsync()
            // Act: call getSnapshot()
            // Expect: getAsync() method waits for async dependency resolution
        });

        it("should provide skip() method to abort computation", () => {
            // Arrange: create flow with getter using context.skip()
            // Act: call getSnapshot()
            // Expect: skip() throws AbortError and prevents value update
        });

        it("should provide signal for cancellation", () => {
            // Arrange: create flow with getter accessing context.signal
            // Act: call getSnapshot() and check signal properties
            // Expect: signal provides cancellation functionality
        });
    });

    describe("conditional dependencies", () => {
        it("should handle conditional dependency access", () => {
            // Arrange: create flow with conditional dependency access based on state
            // Act: change condition to access different dependencies
            // Expect: only accesses and tracks actually used dependencies
        });

        it("should update dependencies when conditions change", () => {
            // Arrange: create flow with conditional dependencies, establish initial state
            // Act: change condition to use different dependencies
            // Expect: updates dependency tracking and subscriptions correctly
        });

        it("should handle dynamic dependency patterns", () => {
            // Arrange: create flow that dynamically determines which dependencies to use
            // Act: trigger different execution paths
            // Expect: correctly tracks and responds to actually accessed dependencies
        });
    });

    describe("lazy initialization", () => {
        it("should not compute value when creating instance", () => {
            // Arrange: create flow with getter that tracks computation calls
            // Act: create ComputedFlow instance
            // Expect: getter is not called during instantiation
        });

        it("should compute value after first subscription", () => {
            // Arrange: create flow with getter that tracks computation calls
            // Act: add first subscriber
            // Expect: getter is called to compute initial value
        });

        it("should not subscribe to sources if no subscribers exist", () => {
            // Arrange: create flow with dependencies that track subscriptions
            // Act: create ComputedFlow without subscribers
            // Expect: no subscriptions to source flows are created
        });

        it("should create only one subscription to each source", () => {
            // Arrange: create flow with multiple dependencies, add multiple subscribers
            // Act: subscribe multiple times to the computed flow
            // Expect: only one subscription per source flow is created
        });

        it("should remove source subscriptions when last subscriber is removed", () => {
            // Arrange: create flow with dependencies, add subscribers
            // Act: remove all subscribers
            // Expect: subscriptions to source flows are cleaned up
        });
    });

    describe("memory management", () => {
        it("should clean up subscriptions when no subscribers remain", () => {
            // Arrange: create flow with dependencies, add and remove subscribers
            // Act: remove all subscribers
            // Expect: cleans up dependency subscriptions to prevent memory leaks
        });

        it("should invalidate cache when all subscribers are removed", () => {
            // Arrange: create flow with cached value, remove all subscribers
            // Act: call getSnapshot after all subscribers removed
            // Expect: cache is invalidated and value is recomputed
        });
    });

    describe("edge cases", () => {
        it("should handle getter returning undefined", () => {
            // Arrange: create flow with getter returning undefined
            // Act: call getSnapshot()
            // Expect: handles undefined value correctly
        });

        it("should handle getter returning null", () => {
            // Arrange: create flow with getter returning null
            // Act: call getSnapshot()
            // Expect: handles null value correctly
        });

        it("should handle empty dependency list", () => {
            // Arrange: create flow with no dependencies (pure computation)
            // Act: call getSnapshot()
            // Expect: computes value without dependencies
        });

        it("should handle rapidly changing dependencies", () => {
            // Arrange: create flow with rapidly changing dependencies
            // Act: trigger rapid dependency changes
            // Expect: handles rapid changes correctly and efficiently
        });

        it("should handle mixed sync/async return types", () => {
            // Arrange: create flow that sometimes returns sync values, sometimes promises
            // Act: trigger both execution paths
            // Expect: handles both return types correctly
        });
    });

    describe("integration scenarios", () => {
        it("should work with createFlow sources", () => {
            // Arrange: create computed flow depending on createFlow sources
            // Act: change source values
            // Expect: computed flow updates correctly
        });

        it("should work with createAsyncFlow sources", () => {
            // Arrange: create computed flow depending on createAsyncFlow sources
            // Act: change async source states
            // Expect: computed flow handles async sources correctly
        });

        it("should work with other computed flows as sources", () => {
            // Arrange: create computed flow depending on other computed flows
            // Act: trigger changes in source computed flows
            // Expect: dependency chain works correctly
        });

        it("should handle complex dependency chains", () => {
            // Arrange: create complex chain of interdependent flows
            // Act: trigger changes at various levels
            // Expect: all flows update correctly in proper order
        });

        it("should handle fan-out dependency patterns", () => {
            // Arrange: create one source with multiple dependent flows
            // Act: change source value
            // Expect: all dependent flows update correctly
        });

        it("should handle fan-in dependency patterns", () => {
            // Arrange: create flow depending on multiple sources
            // Act: change various source values
            // Expect: flow updates correctly for any source change
        });
    });

    describe("memoization with active listeners", () => {
        it("should not recompute on getSnapshot call if deps have not changed", () => {
            // Arrange: create flow with computation counter, call getSnapshot()
            // Act: call getSnapshot() multiple times without dependency changes
            // Expect: computation runs only once, subsequent calls return cached value
        });

        it("should recompute on getSnapshot call if deps changed", () => {
            // Arrange: create flow with dependencies, establish cached value
            // Act: change dependencies, then call getSnapshot()
            // Expect: recomputes value when dependencies have changed (isDirty=true)
        });

        it("should not recompute on repeated getSnapshot calls after source changes", () => {
            // Arrange: create flow with dependencies, change sources
            // Act: call getSnapshot() multiple times after source changes
            // Expect: recomputes only once, subsequent calls use cached result
        });
    });

    describe("memoization without active listeners", () => {
        it("should not recompute on getSnapshot call if deps have not changed", () => {
            // Arrange: create flow with computation counter, call getSnapshot()
            // Act: call getSnapshot() multiple times without dependency changes
            // Expect: computation runs only once, subsequent calls return cached value
        });

        it("should recompute on getSnapshot call if deps changed", () => {
            // Arrange: create flow with dependencies, establish cached value
            // Act: change dependencies, then call getSnapshot()
            // Expect: recomputes value when dependencies have changed (isDirty=true)
        });

        it("should invalidate cache when getSnapshot called after all subscribers removed", () => {
            // Arrange: create flow with subscribers and cached value, remove all subscribers
            // Act: call getSnapshot() after all subscribers are removed
            // Expect: cache is invalidated and value is recomputed
        });

        it("should not recompute on repeated getSnapshot calls after source changes", () => {
            // Arrange: create flow with dependencies, change sources
            // Act: call getSnapshot() multiple times after source changes
            // Expect: recomputes only once, subsequent calls use cached result
        });
    });

    describe("async race conditions", () => {
        it("should handle source changes during async getter execution", () => {
            // Arrange: create flow with long-running async getter
            // Act: change source values while async getter is executing
            // Expect: handles race conditions correctly without corruption
        });

        it("should emit values in start order not completion order", () => {
            // Arrange: create flow with async getter, trigger rapid successive computations
            // Act: start multiple async computations with different completion times
            // Expect: values are emitted in the order computations were started
        });

        it("should not emit intermediate values when AbortError is thrown", () => {
            // Arrange: create flow with async getter that can be aborted
            // Act: start computation, abort with AbortError, start new computation
            // Expect: intermediate aborted value does not reach the flow
        });

        it("should handle skip() calls in synchronous flows", () => {
            // Arrange: create flow with synchronous getter that calls skip()
            // Act: call getSnapshot() when skip() is invoked
            // Expect: handles skip() correctly in synchronous context
        });

        it("should handle skip() calls in asynchronous flows", () => {
            // Arrange: create flow with asynchronous getter that calls skip()
            // Act: call getSnapshot() when skip() is invoked in async context
            // Expect: handles skip() correctly in asynchronous context
        });
    });
});

async function nextTick() {
    await new Promise((resolve) => setTimeout(resolve, 0));
}
