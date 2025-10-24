import { describe, it, expect, expectTypeOf, beforeEach } from "vitest";
import type { AsyncFlow } from "@tsip/types";
import { createAsyncFlow } from "@tsip/flow";
import { asyncComputedFlow } from "./factory";

describe("AsyncComputedFlow factory", () => {
    describe("promises", () => {
        describe("without param", () => {
            it("should compute and return value", async () => {
                const source = createAsyncFlow({ status: "success", data: 2 });
                const flow = asyncComputedFlow(async ({ watchAsync: getAsync }) => {
                    return (await getAsync(source)) * 2;
                });
                expectTypeOf(flow).toEqualTypeOf<AsyncFlow<number>>();
                await expect(flow.asPromise()).resolves.toBe(4);
            });
        });

        describe("with param", () => {
            it("should compute and return value", async () => {
                const source = createAsyncFlow({ status: "success", data: 2 });
                const flow = asyncComputedFlow(async ({ watchAsync: getAsync }, param: number) => {
                    return (await getAsync(source)) * param;
                });
                expectTypeOf(flow).toEqualTypeOf<(param: number) => AsyncFlow<number>>();
                await expect(flow(5).asPromise()).resolves.toBe(10);
            });

            it("should ignore param with default value", async () => {
                const source = createAsyncFlow({ status: "success", data: 2 });
                // eslint-disable-next-line @typescript-eslint/no-inferrable-types
                const flow = asyncComputedFlow(async ({ watchAsync: getAsync }, param: number = 2) => {
                    return (await getAsync(source)) * param;
                });
                expectTypeOf(flow).toEqualTypeOf<AsyncFlow<number>>();
                await expect(flow.asPromise()).resolves.toBe(4);
            });
        });
    });

    describe("generators", () => {
        describe("without param", () => {
            it("should compute and return value", async () => {
                const source = createAsyncFlow({ status: "success", data: 2 });
                const flow = asyncComputedFlow(function* ({ watchAsync: getAsync }) {
                    return (yield* getAsync(source)) * 2;
                });
                expectTypeOf(flow).toEqualTypeOf<AsyncFlow<number>>();
                await expect(flow.asPromise()).resolves.toBe(4);
            });
        });

        describe("with param", () => {
            it("should compute and return value", async () => {
                const source = createAsyncFlow({ status: "success", data: 2 });
                const flow = asyncComputedFlow(function* ({ watchAsync: getAsync }, param: number) {
                    return (yield* getAsync(source)) * param;
                });
                expectTypeOf(flow).toEqualTypeOf<(param: number) => AsyncFlow<number>>();
                await expect(flow(5).asPromise()).resolves.toBe(10);
            });
        });
    });

    describe("memoization", () => {
        it("should return the same instance for equal params", () => {
            const source = createAsyncFlow({ status: "success", data: 2 });
            const flow = asyncComputedFlow(async ({ watchAsync: getAsync }, param: number) => {
                return (await getAsync(source)) * param;
            });

            const instance1 = flow(5);
            const instance2 = flow(5);
            const instance3 = flow(10);

            expect(instance1).toBe(instance2);
            expect(instance3).not.toBe(instance2);
        });

        it("should compare params with custom function", () => {
            const source = createAsyncFlow({ status: "success", data: 2 });
            const flow = asyncComputedFlow(
                async ({ watchAsync: getAsync }, param: { id: number; name: string }) => {
                    return (await getAsync(source)) * param.id;
                },
                {
                    paramEquals: (a: { id: number; name: string }, b) => a.id === b.id,
                },
            );

            const instance1 = flow({ id: 1, name: "first" });
            const instance2 = flow({ id: 1, name: "second" });
            const instance3 = flow({ id: 2, name: "first" });

            expect(instance1).toBe(instance2);
            expect(instance1).not.toBe(instance3);
        });
    });

    describe("garbage collection", () => {
        beforeEach(async () => {
            await triggerGC();
        });

        it("should allow cached flows to be garbage collected when no longer referenced", async () => {
            const source = createAsyncFlow({ status: "success", data: 2 });
            const getFlow = asyncComputedFlow(function* ({ watchAsync: getAsync }, param: number) {
                return (yield* getAsync(source)) * param;
            });

            // Create a reference we can track
            let flow: AsyncFlow<number> | null = getFlow(5);
            const weakRef = new WeakRef(flow);

            // Resolve computed value
            flow.getSnapshot();
            await new Promise((r) => setTimeout(r, 0));

            // Verify object is initially alive
            expect(weakRef.deref()).toBe(flow);
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 10 });

            // Remove the strong reference
            flow = null;

            // Trigger garbage collection
            await triggerGC();

            // The object should be collected
            expect(isCollected(weakRef)).toBe(true);
        });

        it("should maintain cache when there are active subscriptions to the flow", async () => {
            const source = createAsyncFlow({ status: "success", data: 2 });
            const getFlow = asyncComputedFlow(function* ({ watchAsync: getAsync }, param: number) {
                return (yield* getAsync(source)) * param;
            });

            // Create a reference we can track
            let flow: AsyncFlow<number> | null = getFlow(5);
            const weakRef = new WeakRef(flow);

            // Resolve computed value
            flow.getSnapshot();
            await new Promise((r) => setTimeout(r, 0));

            // Verify object is initially alive
            expect(weakRef.deref()).toBe(flow);
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 10 });

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const subscription = flow.subscribe(() => {
                // noop
            });

            // Remove the strong reference
            flow = null;

            // Trigger garbage collection
            await triggerGC();

            // Object should still be cached (not collected)
            expect(isCollected(weakRef)).toBe(false);
            const flow2 = getFlow(5);
            expect(flow2).toBe(weakRef.deref());
        });
    });
});

// Helper to trigger garbage collection if available
async function triggerGC() {
    // Run GC multiple times to ensure cleanup
    for (let i = 0; i < 5; i++) {
        global.gc();
        // Give time for FinalizationRegistry callbacks
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}

// Helper to check if a WeakRef has been collected
function isCollected(ref: WeakRef<object>): boolean {
    return ref.deref() === undefined;
}
