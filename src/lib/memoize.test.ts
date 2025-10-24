import { describe, it, expect, vi, beforeEach, afterEach, expectTypeOf } from "vitest";
import { memoize } from "./memoize";

describe("memoize", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    describe("basic memoization", () => {
        it("should infer types correctly", () => {
            const memoized1 = memoize(() => ({ value: "foo" }));
            expectTypeOf(memoized1).toEqualTypeOf<() => { value: string }>();

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const memoized2 = memoize((param: number) => ({ value: "foo" }));
            expectTypeOf(memoized2).toEqualTypeOf<(param: number) => { value: string }>();

            const memoized3 = memoize((param: undefined) => ({ value: param }));
            expectTypeOf(memoized3).toEqualTypeOf<(param: undefined) => { value: undefined }>();
        });

        it("should call the function only once for the same parameter", () => {
            const fn = vi.fn((x: number) => ({ value: x * 2 }));
            const memoized = memoize(fn);

            const result1 = memoized(5);
            const result2 = memoized(5);

            expect(fn).toHaveBeenCalledTimes(1);
            expect(fn).toHaveBeenCalledWith(5);
            expect(result1).toBe(result2); // Same object reference
            expect(result1.value).toBe(10);
        });

        it("should call the function for different parameters", () => {
            const fn = vi.fn((x: number) => ({ value: x * 2 }));
            const memoized = memoize(fn);

            const result1 = memoized(5);
            const result2 = memoized(10);

            expect(fn).toHaveBeenCalledTimes(2);
            expect(fn).toHaveBeenNthCalledWith(1, 5);
            expect(fn).toHaveBeenNthCalledWith(2, 10);
            expect(result1).not.toBe(result2);
            expect(result1.value).toBe(10);
            expect(result2.value).toBe(20);
        });

        it("should work with string parameters", () => {
            const fn = vi.fn((str: string) => ({ message: str.toUpperCase() }));
            const memoized = memoize(fn);

            const result1 = memoized("hello");
            const result2 = memoized("hello");
            const result3 = memoized("world");

            expect(fn).toHaveBeenCalledTimes(2);
            expect(result1).toBe(result2);
            expect(result1).not.toBe(result3);
            expect(result1.message).toBe("HELLO");
            expect(result3.message).toBe("WORLD");
        });

        it("should work with object parameters using reference equality", () => {
            const fn = vi.fn((obj: { id: number }) => ({ result: obj.id * 2 }));
            const memoized = memoize(fn);

            const param1 = { id: 1 };
            const param2 = { id: 1 }; // Different object, same content

            const result1 = memoized(param1);
            const result2 = memoized(param1); // Same reference
            const result3 = memoized(param2); // Different reference

            expect(fn).toHaveBeenCalledTimes(2);
            expect(result1).toBe(result2);
            expect(result1).not.toBe(result3);
        });

        it("should correctly handle param=undefined", () => {
            const fn = vi.fn((x: number | undefined) => ({ value: x ?? 10 * 2 }));
            const memoized = memoize(fn);

            const result1 = memoized(undefined);
            const result2 = memoized(undefined);

            expect(fn).toHaveBeenCalledTimes(1);
            expect(fn).toHaveBeenCalledWith(undefined);
            expect(result1).toBe(result2); // Same object reference
            expect(result1.value).toBe(20);
        });
    });

    describe("custom equals function", () => {
        it("should infer types correctly", () => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const memoized1 = memoize((param: string) => ({ value: "foo" }), {
                equals(a, b) {
                    expectTypeOf(a).toEqualTypeOf<string>();
                    expectTypeOf(b).toEqualTypeOf<string>();
                    return false;
                },
            });
            expectTypeOf(memoized1).toEqualTypeOf<(param: string) => { value: string }>();

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const memoized2 = memoize((param: { id: string }) => ({ value: 123 }), {
                equals(a, b) {
                    expectTypeOf(a).toEqualTypeOf<{ id: string }>();
                    expectTypeOf(b).toEqualTypeOf<{ id: string }>();
                    return a.id === b.id;
                },
            });
            expectTypeOf(memoized2).toEqualTypeOf<(param: { id: string }) => { value: number }>();
        });

        it("should use custom equals function for parameter comparison", () => {
            const fn = vi.fn((obj: { id: number; name: string }) => ({
                processed: `${obj.name}-${obj.id.toString()}`,
            }));

            const memoized = memoize(fn, {
                equals: (a, b) => a.id === b.id,
            });

            const param1 = { id: 1, name: "Alice" };
            const param2 = { id: 1, name: "Bob" }; // Same id, different name
            const param3 = { id: 2, name: "Alice" }; // Different id

            const result1 = memoized(param1);
            const result2 = memoized(param2); // Should use cached result
            const result3 = memoized(param3); // Should call function again

            expect(fn).toHaveBeenCalledTimes(2);
            expect(fn).toHaveBeenNthCalledWith(1, param1);
            expect(fn).toHaveBeenNthCalledWith(2, param3);
            expect(result1).toBe(result2); // Same cached result
            expect(result1).not.toBe(result3);
            expect(result1.processed).toBe("Alice-1");
            expect(result3.processed).toBe("Alice-2");
        });

        it("should handle equals function that always returns true", () => {
            const fn = vi.fn((x: number) => ({ value: x }));
            const memoized = memoize(fn, {
                equals: () => true,
            });

            const result1 = memoized(1);
            const result2 = memoized(2); // Should use cached result from first call
            const result3 = memoized(3); // Should use cached result from first call

            expect(fn).toHaveBeenCalledTimes(1);
            expect(fn).toHaveBeenCalledWith(1);
            expect(result1).toBe(result2);
            expect(result2).toBe(result3);
            expect(result1.value).toBe(1);
        });

        it("should correctly handle param=undefined", () => {
            const fn = vi.fn((x: number | undefined) => ({ value: x ?? 10 * 2 }));
            const memoized = memoize(fn, {
                // should always return new value
                equals: () => false,
            });

            const result1 = memoized(undefined);
            const result2 = memoized(undefined);

            expect(fn).toHaveBeenCalledTimes(2);
            expect(fn).toHaveBeenCalledWith(undefined);
            expect(result1).not.toBe(result2);
        });
    });

    describe("edge cases", () => {
        it("should handle null and undefined parameters", () => {
            const fn = vi.fn((x: unknown) => ({ input: x }));
            const memoized = memoize(fn);

            const result1 = memoized(null);
            const result2 = memoized(null);
            const result3 = memoized(undefined);
            const result4 = memoized(undefined);

            expect(fn).toHaveBeenCalledTimes(2);
            expect(result1).toBe(result2);
            expect(result3).toBe(result4);
            expect(result1).not.toBe(result3);
        });

        it("should handle functions that throw errors", () => {
            const fn = vi.fn((x: number) => {
                if (x < 0) throw new Error("Negative number");
                return { value: x };
            });
            const memoized = memoize(fn);

            expect(() => memoized(-1)).toThrow("Negative number");
            expect(() => memoized(-1)).toThrow("Negative number");
            expect(fn).toHaveBeenCalledTimes(2); // Should not cache errors

            const result = memoized(1);
            const result2 = memoized(1);
            expect(fn).toHaveBeenCalledTimes(3);
            expect(result).toBe(result2);
        });

        it("should handle zero and falsy values", () => {
            const fn = vi.fn((x: number | boolean | string) => ({ input: x }));
            const memoized = memoize(fn);

            const result1 = memoized(0);
            const result2 = memoized(0);
            const result3 = memoized(false);
            const result4 = memoized(false);
            const result5 = memoized("");
            const result6 = memoized("");

            expect(fn).toHaveBeenCalledTimes(3);
            expect(result1).toBe(result2);
            expect(result3).toBe(result4);
            expect(result5).toBe(result6);
            expect(result1).not.toBe(result3);
            expect(result3).not.toBe(result5);
        });
    });

    describe("garbage collection", () => {
        beforeEach(async () => {
            await triggerGC();
        });

        it("should allow cached objects to be garbage collected when no longer referenced", async () => {
            const fn = (x: number) => ({ value: x * 2 });
            const memoized = memoize(fn);

            // Create a reference we can track
            let obj: { value: number } | null = memoized(42);
            const weakRef = new WeakRef(obj);

            // Verify object is initially alive
            expect(weakRef.deref()).toBe(obj);
            expect(obj.value).toBe(84);

            // Remove the strong reference
            obj = null;

            // Trigger garbage collection
            await triggerGC();

            // The object should be collected
            expect(isCollected(weakRef)).toBe(true);
        });

        it("should clean up cache entries after objects are garbage collected", async () => {
            let callCount = 0;
            const fn = (x: number) => {
                callCount++;
                return { value: x * 2 };
            };
            const memoized = memoize(fn);

            // First call creates and caches the object
            let obj1: { value: number } | null = memoized(10);
            expect(callCount).toBe(1);
            expect(obj1.value).toBe(20);

            // Second call with same param returns cached object
            let obj2: { value: number } | null = memoized(10);
            expect(callCount).toBe(1);
            expect(obj2).toBe(obj1);

            // Remove strong reference
            obj1 = null;
            obj2 = null;

            // Trigger garbage collection
            await triggerGC();

            // Calling again with same param should create a new object
            // because the cached one was collected
            const obj3 = memoized(10);
            expect(callCount).toBe(2);
            expect(obj3.value).toBe(20);
        });

        it("should maintain cache while objects are still referenced", async () => {
            let callCount = 0;
            const fn = (x: number) => {
                callCount++;
                return { value: x * 2 };
            };
            const memoized = memoize(fn);

            // Keep a strong reference
            const obj1 = memoized(5);
            expect(callCount).toBe(1);

            // Trigger GC
            await triggerGC();

            // Object should still be cached (not collected)
            const obj2 = memoized(5);
            expect(callCount).toBe(1);
            expect(obj2).toBe(obj1);
        });

        it("should handle multiple cached objects independently", async () => {
            let callCount = 0;
            const fn = (x: number) => {
                callCount++;
                return { value: x };
            };
            const memoized = memoize(fn);

            // Create multiple cached objects
            let obj1: { value: number } | null = memoized(1);
            let obj2: { value: number } | null = memoized(2);
            const obj3 = memoized(3);

            const weakRef1 = new WeakRef(obj1);
            const weakRef2 = new WeakRef(obj2);
            const weakRef3 = new WeakRef(obj3);

            expect(callCount).toBe(3);

            // Remove some references but not all
            obj1 = null;
            obj2 = null;

            await triggerGC();

            // obj1 and obj2 should be collected
            expect(isCollected(weakRef1)).toBe(true);
            expect(isCollected(weakRef2)).toBe(true);

            // obj3 should still be alive
            expect(isCollected(weakRef3)).toBe(false);
            expect(weakRef3.deref()).toBe(obj3);

            // Calling with collected params should create new objects
            memoized(1);
            memoized(2);
            expect(callCount).toBe(5);

            // Calling with still-referenced param should return cached object
            const sameObj3 = memoized(3);
            expect(callCount).toBe(5);
            expect(sameObj3).toBe(obj3);
        });

        it("should not leak memory with custom equals function", async () => {
            let callCount = 0;
            const fn = (obj: { id: number }) => {
                callCount++;
                return { result: obj.id * 2 };
            };

            const memoized = memoize(fn, {
                equals: (a, b) => a.id === b.id,
            });

            // Create and cache an object
            let result: { result: number } | null = memoized({ id: 1 });
            expect(callCount).toBe(1);
            expect(result.result).toBe(2);

            const weakRef = new WeakRef(result);

            // Remove reference
            result = null;

            await triggerGC();

            // Should be collected
            expect(isCollected(weakRef)).toBe(true);

            // New call with equivalent param should create new object
            const newResult = memoized({ id: 1 });
            expect(callCount).toBe(2);
            expect(newResult.result).toBe(2);
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
