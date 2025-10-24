import { describe, it, expect, expectTypeOf, beforeEach } from "vitest";
import type { Flow } from "@tsip/types";
import { createFlow } from "@tsip/flow";
import { computedFlow } from "./factory";

describe("ComputedFlow factory", () => {
    describe("without param", () => {
        it("should compute and return value", () => {
            const source = createFlow(2);
            const flow = computedFlow(({ watch }) => {
                return watch(source) * 2;
            });
            expectTypeOf(flow).toEqualTypeOf<Flow<number>>();
            expect(flow.getSnapshot()).toBe(4);
        });
    });

    describe("with param", () => {
        it("should compute and return value", () => {
            const source = createFlow(2);
            const flow = computedFlow(({ watch }, param: number) => {
                return watch(source) * param;
            });
            expectTypeOf(flow).toEqualTypeOf<(param: number) => Flow<number>>();
            expect(flow(5).getSnapshot()).toBe(10);
        });

        it("should ignore param with default value", () => {
            const source = createFlow(2);
            // eslint-disable-next-line @typescript-eslint/no-inferrable-types
            const flow = computedFlow(({ watch }, param: number = 2) => {
                return watch(source) * param;
            });
            expectTypeOf(flow).toEqualTypeOf<Flow<number>>();
            expect(flow.getSnapshot()).toBe(4);
        });
    });

    describe("memoization", () => {
        it("should return the same instance for equal params", () => {
            const source = createFlow(2);
            const flow = computedFlow(({ watch }, param: number) => {
                return watch(source) * param;
            });

            const instance1 = flow(5);
            const instance2 = flow(5);
            const instance3 = flow(10);

            expect(instance1).toBe(instance2);
            expect(instance3).not.toBe(instance2);
        });

        it("should compare params with custom function", () => {
            const source = createFlow(2);
            const flow = computedFlow(
                ({ watch }, param: { id: number; name: string }) => {
                    return watch(source) * param.id;
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
            const source = createFlow(2);
            const getFlow = computedFlow(({ watch }, param: number) => {
                return watch(source) * param;
            });

            // Create a reference we can track
            let flow: Flow<number> | null = getFlow(5);
            const weakRef = new WeakRef(flow);

            // Verify object is initially alive
            expect(weakRef.deref()).toBe(flow);
            expect(flow.getSnapshot()).toBe(10);

            // Remove the strong reference
            flow = null;

            // Trigger garbage collection
            await triggerGC();

            // The object should be collected
            expect(isCollected(weakRef)).toBe(true);
        });

        it("should maintain cache when there are active subscriptions to the flow", async () => {
            const source = createFlow(2);
            const getFlow = computedFlow(({ watch }, param: number) => {
                return watch(source) * param;
            });

            // Create a reference we can track
            let flow: Flow<number> | null = getFlow(5);
            const weakRef = new WeakRef(flow);

            // Verify object is initially alive
            expect(weakRef.deref()).toBe(flow);
            expect(flow.getSnapshot()).toBe(10);

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
