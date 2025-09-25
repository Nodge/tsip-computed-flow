import { describe, it, expect, expectTypeOf } from "vitest";
import { asyncComputedFlow, type AsyncComputedFlow } from "./factory";
import { createAsyncFlow } from "@tsip/flow";

describe("AsyncComputedFlow factory", () => {
    describe("promises", () => {
        describe("without param", () => {
            it("should compute and return value", async () => {
                const source = createAsyncFlow({ status: "success", data: 2 });
                const flow = asyncComputedFlow(async ({ getAsync }) => {
                    return (await getAsync(source)) * 2;
                });
                expectTypeOf(flow).toEqualTypeOf<AsyncComputedFlow<number>>();
                await expect(flow.asPromise()).resolves.toBe(4);
            });
        });

        describe("with param", () => {
            it("should compute and return value", async () => {
                const source = createAsyncFlow({ status: "success", data: 2 });
                const flow = asyncComputedFlow(async ({ getAsync }, param: number) => {
                    return (await getAsync(source)) * param;
                });
                expectTypeOf(flow).toEqualTypeOf<(param: number) => AsyncComputedFlow<number>>();
                await expect(flow(5).asPromise()).resolves.toBe(10);
            });
        });
    });

    describe("generators", () => {
        describe("without param", () => {
            it("should compute and return value", async () => {
                const source = createAsyncFlow({ status: "success", data: 2 });
                const flow = asyncComputedFlow(function* ({ getAsync }) {
                    return (yield* getAsync(source)) * 2;
                });
                expectTypeOf(flow).toEqualTypeOf<AsyncComputedFlow<number>>();
                await expect(flow.asPromise()).resolves.toBe(4);
            });
        });

        describe("with param", () => {
            it("should compute and return value", async () => {
                const source = createAsyncFlow({ status: "success", data: 2 });
                const flow = asyncComputedFlow(function* ({ getAsync }, param: number) {
                    return (yield* getAsync(source)) * param;
                });
                expectTypeOf(flow).toEqualTypeOf<(param: number) => AsyncComputedFlow<number>>();
                await expect(flow(5).asPromise()).resolves.toBe(10);
            });
        });
    });

    describe("memoization", () => {
        it("should return the same instance for equal params", () => {
            const source = createAsyncFlow({ status: "success", data: 2 });
            const flow = asyncComputedFlow(async ({ getAsync }, param: number) => {
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
                async ({ getAsync }, param: { id: number; name: string }) => {
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
});
