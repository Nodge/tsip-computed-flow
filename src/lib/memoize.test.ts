import { describe, it, expect, vi, afterEach, expectTypeOf } from "vitest";
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
});
