/* eslint-disable @typescript-eslint/require-await */
import { createFlow, createAsyncFlow } from "@tsip/flow";
import type { AsyncFlow, Flow } from "@tsip/types";
import { describe, it, expect, vi, expectTypeOf } from "vitest";
import { AsyncComputedFlow } from "./instance";

describe("AsyncComputedFlow", () => {
    describe("types", () => {
        it("should infer return type", () => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const flow1: AsyncFlow<string> = new AsyncComputedFlow(async () => "value");
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const flow2: AsyncFlow<"const"> = new AsyncComputedFlow(async () => "const" as const);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const flow3: AsyncFlow<number> = new AsyncComputedFlow(async () => 123);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const flow4: AsyncFlow<{ value: number }> = new AsyncComputedFlow(async () => ({ value: 123 }));
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const flow5: AsyncFlow<undefined> = new AsyncComputedFlow(async () => undefined);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const flow6: AsyncFlow<null> = new AsyncComputedFlow(async () => null);

            const source = createFlow(0);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const flow7: AsyncFlow<number> = new AsyncComputedFlow(async ({ get }) => get(source));

            const asyncSource = createAsyncFlow({ status: "success", data: 0 });
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const flow8: AsyncFlow<number> = new AsyncComputedFlow(async ({ getAsync }) => getAsync(asyncSource));
        });

        it("should infer return type with skips", () => {
            const source = createAsyncFlow<"a" | "b">({ status: "pending" });
            const flow = new AsyncComputedFlow(async ({ getAsync, skip }) => {
                const value = await getAsync(source);
                if (value === "a") {
                    return skip();
                }
                return value;
            });

            expectTypeOf(flow).toEqualTypeOf<AsyncComputedFlow<"b">>();
        });
    });

    describe("basic functionality", () => {
        it("should compute and return asynchronous values", async () => {
            const flow = new AsyncComputedFlow(async () => "const");
            expect(flow.getSnapshot()).toEqual({ status: "pending" });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: "const" });
        });

        it("should compute values based on sync dependencies", async () => {
            const source = createFlow(2);
            const flow = new AsyncComputedFlow(async ({ get }) => get(source) * 2);
            expect(flow.getSnapshot()).toEqual({ status: "pending" });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 4 });
        });

        it("should compute values based on async dependencies", async () => {
            const source = createAsyncFlow<number>({ status: "pending" });

            const flow = new AsyncComputedFlow(async ({ getAsync }) => (await getAsync(source)) * 2);
            expect(flow.getSnapshot()).toEqual({ status: "pending" });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "pending" });

            source.emit({ status: "success", data: 2 });
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 4 });
        });

        it("should recompute when dependencies change", async () => {
            const source = createAsyncFlow<number>({ status: "success", data: 2 });

            const flow = new AsyncComputedFlow(async ({ getAsync }) => (await getAsync(source)) * 2);
            expect(flow.getSnapshot()).toEqual({ status: "pending" });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 4 });

            source.emit({ status: "pending", data: 2 });
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 4 });

            source.emit({ status: "success", data: 5 });
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 4 });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 10 });
        });

        it("should initialize with resolved async dependency", async () => {
            const source = createAsyncFlow<string>({ status: "success", data: "result" });
            const flow = new AsyncComputedFlow(({ getAsync }) => getAsync(source));
            expect(flow.getSnapshot()).toEqual({ status: "pending" });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: "result" });
        });
    });

    describe("getSnapshot behavior", () => {
        it("should emit success state when promise resolves", async () => {
            const { promise, resolve } = Promise.withResolvers();
            const flow = new AsyncComputedFlow(() => promise);
            expect(flow.getSnapshot()).toEqual({ status: "pending" });

            resolve("resolved data");
            await promise;

            expect(flow.getSnapshot()).toEqual({ status: "success", data: "resolved data" });
        });

        it("should emit error state when promise rejects", async () => {
            const { promise, reject } = Promise.withResolvers();

            const flow = new AsyncComputedFlow(() => promise);
            expect(flow.getSnapshot()).toEqual({ status: "pending" });

            const error = new Error("test error");
            reject(error);
            await expect(promise).rejects.toBe(error);

            expect(flow.getSnapshot()).toEqual({ status: "error", error, data: undefined });
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

            expect(flow.getSnapshot()).toEqual({ status: "pending", data: undefined });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: "initial data" });

            // Trigger new async computation
            source.emit(2);

            // Should be pending but preserve previous data
            const pendingState = flow.getSnapshot();
            expect(pendingState).toEqual({
                status: "pending",
                data: "initial data",
            });

            resolve("new data");
            await nextTick();

            expect(flow.getSnapshot()).toEqual({ status: "success", data: "new data" });
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

            expect(flow.getSnapshot()).toEqual({ status: "pending", data: undefined });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: "initial data" });

            // Trigger async computation that will fail
            source.emit(2);

            // Should be pending but preserve previous data
            const pendingState = flow.getSnapshot();
            expect(pendingState).toEqual({
                status: "pending",
                data: "initial data",
            });

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
        });
    });

    describe("concurrent computations", () => {
        it("should handle concurrent computations (first starts, first ends)", async () => {
            //  C1
            //  |   C2
            //  |   |
            //  R1  |
            //      |
            //      R2
            const source = createFlow(Promise.resolve(0));

            const flow = new AsyncComputedFlow(async ({ get }) => await get(source));
            expect(flow.getSnapshot()).toEqual({ status: "pending" });
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 0 });

            // start first computation (C1)
            const { promise: p1, resolve: r1 } = Promise.withResolvers<number>();
            source.emit(p1);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });

            // start second computation (C2)
            const { promise: p2, resolve: r2 } = Promise.withResolvers<number>();
            source.emit(p2);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });

            // finish first computation
            r1(1);
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 1 });

            // finish second computation
            r2(2);
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 2 });
        });

        it("should handle concurrent computations (first starts, last ends)", async () => {
            //  C1
            //  |   C2
            //  |   |
            //  |   R2
            //  R1
            const source = createFlow(Promise.resolve(0));

            const flow = new AsyncComputedFlow(async ({ get }) => await get(source));
            expect(flow.getSnapshot()).toEqual({ status: "pending" });
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 0 });

            // start first computation (C1)
            const { promise: p1, resolve: r1 } = Promise.withResolvers<number>();
            source.emit(p1);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });

            // start second computation (C2)
            const { promise: p2, resolve: r2 } = Promise.withResolvers<number>();
            source.emit(p2);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });

            // finish second computation
            r2(2);
            await nextTick();
            const value1 = flow.getSnapshot();
            expect(value1).toEqual({ status: "success", data: 2 });

            // finish first computation
            r1(1);
            await nextTick();
            const value2 = flow.getSnapshot();
            expect(value2).toEqual({ status: "success", data: 2 });
            expect(value2).toBe(value1);
        });

        it("should abort previous computation on new computation start", async () => {
            const source = createFlow(Promise.resolve(0));
            const signals: AbortSignal[] = [];

            const flow = new AsyncComputedFlow(async ({ get, signal }) => {
                signals.push(signal);
                return await get(source);
            });
            expect(flow.getSnapshot()).toEqual({ status: "pending" });
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 0 });

            // start first computation
            const { promise: p1, resolve: r1 } = Promise.withResolvers<number>();
            source.emit(p1);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });
            expect(signals).toHaveLength(2);
            expect(signals[0]?.aborted).toBe(true);
            expect(signals[1]?.aborted).toBe(false);

            // start second computation
            const { promise: p2, resolve: r2 } = Promise.withResolvers<number>();
            source.emit(p2);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });
            expect(signals).toHaveLength(3);
            expect(signals[0]?.aborted).toBe(true);
            expect(signals[1]?.aborted).toBe(true);
            expect(signals[2]?.aborted).toBe(false);

            r1(1);
            r2(2);
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 2 });
            expect(signals).toHaveLength(3);
            expect(signals[0]?.aborted).toBe(true);
            expect(signals[1]?.aborted).toBe(true);
            expect(signals[2]?.aborted).toBe(true);
        });

        it("should ignore aborted computation error (first starts, first ends)", async () => {
            //  C1
            //  |   C2
            //  |   |
            //  R1  |
            //      |
            //      R2
            const source = createFlow(Promise.resolve(0));

            const flow = new AsyncComputedFlow(async ({ get, signal }) => {
                const value = await get(source);
                signal.throwIfAborted();
                return value;
            });
            expect(flow.getSnapshot()).toEqual({ status: "pending" });
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 0 });

            // start first computation (C1)
            const { promise: p1, resolve: r1 } = Promise.withResolvers<number>();
            source.emit(p1);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });

            // start second computation (C2)
            const { promise: p2, resolve: r2 } = Promise.withResolvers<number>();
            source.emit(p2);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });

            // finish first computation
            r1(1);
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });

            // finish second computation
            r2(2);
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 2 });
        });

        it("should ignore aborted computation error (first starts, last ends)", async () => {
            //  C1
            //  |   C2
            //  |   |
            //  |   R2
            //  R1
            const source = createFlow(Promise.resolve(0));

            const flow = new AsyncComputedFlow(async ({ get, signal }) => {
                const value = await get(source);
                signal.throwIfAborted();
                return value;
            });
            expect(flow.getSnapshot()).toEqual({ status: "pending" });
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 0 });

            // start first computation (C1)
            const { promise: p1, resolve: r1 } = Promise.withResolvers<number>();
            source.emit(p1);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });

            // start second computation (C2)
            const { promise: p2, resolve: r2 } = Promise.withResolvers<number>();
            source.emit(p2);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });

            // finish second computation
            r2(2);
            await nextTick();
            const value1 = flow.getSnapshot();
            expect(value1).toEqual({ status: "success", data: 2 });

            // finish first computation
            r1(1);
            await nextTick();
            const value2 = flow.getSnapshot();
            expect(value2).toEqual({ status: "success", data: 2 });
            expect(value2).toBe(value1);
        });

        it("should resolve outdated computations in order of start", async () => {
            //  C1
            //  |   C2
            //  |   |   C3
            //  |   R2  |
            //  R1      |
            //          R3
            const source = createFlow(Promise.resolve(0));

            const flow = new AsyncComputedFlow(async ({ get }) => await get(source));
            expect(flow.getSnapshot()).toEqual({ status: "pending" });
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 0 });

            // start first computation (C1)
            const { promise: p1, resolve: r1 } = Promise.withResolvers<number>();
            source.emit(p1);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });

            // start second computation (C2)
            const { promise: p2, resolve: r2 } = Promise.withResolvers<number>();
            source.emit(p2);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });

            // start third computation (C3)
            const { promise: p3, resolve: r3 } = Promise.withResolvers<number>();
            source.emit(p3);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });

            // finish second computation
            r2(2);
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 2 });

            // finish first computation
            r1(1);
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 2 });

            // finish third computation
            r3(3);
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 3 });
        });
    });

    describe("concurrent sources", () => {
        it("should handle concurrent sources", async () => {
            //  S1
            //  |   S1
            //  |   |   S2
            //  R1  |   |
            //      R2  |
            //          R3
            const s1 = createAsyncFlow<string>({ status: "success", data: "R0" });
            const s2 = createAsyncFlow<string>({ status: "success", data: "R0" });

            const flow = new AsyncComputedFlow(async ({ getAsync }) => await Promise.all([getAsync(s1), getAsync(s2)]));
            expect(flow.getSnapshot()).toEqual({ status: "pending" });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: ["R0", "R0"] });

            s1.emit({ status: "pending" });
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: ["R0", "R0"] });

            s2.emit({ status: "pending" });
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: ["R0", "R0"] });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: ["R0", "R0"] });

            s1.emit({ status: "pending", data: "R1" });
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: ["R0", "R0"] });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: ["R0", "R0"] });

            s1.emit({ status: "success", data: "R2" });
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: ["R0", "R0"] });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: ["R0", "R0"] });

            s2.emit({ status: "success", data: "R3" });
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: ["R0", "R0"] });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: ["R2", "R3"] });
        });
    });

    describe("compute error handling", () => {
        it("should handle exceptions and propagate errors via getSnapshot", async () => {
            const error = new Error("test");
            const flow = new AsyncComputedFlow<unknown>(() => {
                throw error;
            });
            expect(flow.getSnapshot()).toEqual({ status: "pending" });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "error", error });
        });

        it("should handle promise rejections and propagate errors via getSnapshot", async () => {
            const error = new Error("test");
            const flow = new AsyncComputedFlow<unknown>(() => {
                return Promise.reject(error);
            });
            expect(flow.getSnapshot()).toEqual({ status: "pending" });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "error", error });
        });

        it("should propagate errors for synchronous sources", async () => {
            const error = new Error("test");
            const source = createFlow(0);
            source.getSnapshot = () => {
                throw error;
            };

            const flow = new AsyncComputedFlow<unknown>(async ({ get }) => {
                return get(source);
            });
            flow.subscribe(vi.fn());
            expect(flow.getSnapshot()).toEqual({ status: "pending" });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "error", error });
            expect(getSubscriptionsCount(source)).toBe(1);
        });

        it("should propagate errors for asynchronous sources", async () => {
            const error = new Error("test");
            const source = createAsyncFlow({ status: "error", error });

            const flow = new AsyncComputedFlow<unknown>(async ({ getAsync }) => {
                return getAsync(source);
            });
            flow.subscribe(vi.fn());
            expect(flow.getSnapshot()).toEqual({ status: "pending" });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "error", error });
            expect(getSubscriptionsCount(source)).toBe(1);
        });
    });

    describe("skip behavior", () => {
        it("should provide skip() method to abort computation", async () => {
            const source = createFlow(1);
            const flow = new AsyncComputedFlow(async ({ get, skip }) => {
                const value = get(source);
                if (value % 2 === 0) {
                    skip();
                }
                return { value };
            });

            expectTypeOf(flow).toEqualTypeOf<AsyncComputedFlow<{ value: number }>>();
            expect(flow.getSnapshot()).toEqual({ status: "pending" });

            await nextTick();
            const value1 = flow.getSnapshot();
            expect(value1).toEqual({ status: "success", data: { value: 1 } });

            source.emit(2);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: { value: 1 } });
            await nextTick();
            const value2 = flow.getSnapshot();
            expect(value2).toEqual({ status: "success", data: { value: 1 } });
            expect(value2).toBe(value1);

            source.emit(3);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: { value: 1 } });
            await nextTick();
            const value3 = flow.getSnapshot();
            expect(value3).toEqual({ status: "success", data: { value: 3 } });
            expect(value3).not.toBe(value2);

            source.emit(4);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: { value: 3 } });
            await nextTick();
            const value4 = flow.getSnapshot();
            expect(value4).toEqual({ status: "success", data: { value: 3 } });
            expect(value4).toBe(value3);
        });

        it("should return initial value if first computation was skipped", async () => {
            const source = createFlow(0);
            const flow = new AsyncComputedFlow(
                async ({ get, skip }) => {
                    const value = get(source);
                    if (value % 2 === 0) {
                        skip();
                    }
                    return value;
                },
                { initialValue: { status: "success", data: -1 } },
            );

            expectTypeOf(flow).toEqualTypeOf<AsyncComputedFlow<number>>();
            expect(flow.getSnapshot()).toEqual({ status: "pending" });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: -1 });

            source.emit(1);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: -1 });
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 1 });

            source.emit(2);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 1 });
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 1 });

            source.emit(3);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 1 });
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 3 });
        });

        it("should accept different types in getter and initialValue", async () => {
            const source = createFlow(0);
            const flow = new AsyncComputedFlow<number | "skip">(
                async ({ get, skip }) => {
                    const value = get(source);
                    if (value % 2 === 0) {
                        skip();
                    }
                    return value;
                },
                { initialValue: { status: "success", data: "skip" } },
            );

            expectTypeOf(flow).toEqualTypeOf<AsyncComputedFlow<number | "skip">>();
            expect(flow.getSnapshot()).toEqual({ status: "pending" });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: "skip" });

            source.emit(1);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: "skip" });
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 1 });

            source.emit(2);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 1 });
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 1 });

            source.emit(3);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 1 });
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 3 });
        });

        it("should throw error if first computation was skipped and initial value was not set", async () => {
            const source = createFlow(0);
            const flow = new AsyncComputedFlow(async ({ get, skip }) => {
                const value = get(source);
                if (value % 2 === 0) {
                    skip();
                }
                return { value };
            });

            expect(flow.getSnapshot()).toEqual({ status: "pending" });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({
                status: "error",
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                error: AbortSignal.abort().reason,
            });
        });
    });

    describe("subscription behavior", () => {
        it("should notify subscribers on deps change", async () => {
            const source = createFlow(1);
            const flow = new AsyncComputedFlow(async ({ get }) => get(source) * 2);
            const listener = vi.fn();

            flow.subscribe(listener);
            expect(listener).toHaveBeenCalledTimes(0);

            await nextTick();
            expect(listener).toHaveBeenCalledTimes(1); // pending->success transition

            flow.getSnapshot();
            source.emit(3);
            expect(listener).toHaveBeenCalledTimes(2); // success->pending transition

            flow.getSnapshot();
            await nextTick();
            expect(listener).toHaveBeenCalledTimes(3); // pending->success transition
        });

        it("should notify subscribers about computation error", async () => {
            const flow = new AsyncComputedFlow(async () => {
                throw new Error();
            });
            const listener = vi.fn();

            flow.subscribe(listener);
            expect(listener).toHaveBeenCalledTimes(0);

            await nextTick();
            expect(listener).toHaveBeenCalledTimes(1); // pending->error transition
        });

        it("should notify at most once between getSnapshot calls", async () => {
            const source = createFlow(1);
            const flow = new AsyncComputedFlow(async ({ get }) => get(source) * 2);
            const listener = vi.fn();

            flow.subscribe(listener);
            expect(listener).toHaveBeenCalledTimes(0);

            await nextTick();
            expect(listener).toHaveBeenCalledTimes(1); // pending->success transition

            source.emit(3);
            await nextTick();
            expect(listener).toHaveBeenCalledTimes(1);

            source.emit(4);
            await nextTick();
            expect(listener).toHaveBeenCalledTimes(1);

            flow.getSnapshot();
            source.emit(5);
            await nextTick();
            expect(listener).toHaveBeenCalledTimes(2);
        });

        it("should notify about pending data updates", async () => {
            //  C1
            //  |   C2
            //  |   |
            //  R1  |
            //      |
            //      R2
            const source = createFlow(Promise.resolve(0));
            const flow = new AsyncComputedFlow(async ({ get }) => await get(source));

            const listener = vi.fn();
            flow.subscribe(listener);
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 0 });
            expect(listener).toHaveBeenCalledTimes(1); // pending->success transition

            // start first computation (C1)
            const { promise: p1, resolve: r1 } = Promise.withResolvers<number>();
            source.emit(p1);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });
            expect(listener).toHaveBeenCalledTimes(2); // success->pending transition

            // start second computation (C2)
            const { promise: p2, resolve: r2 } = Promise.withResolvers<number>();
            source.emit(p2);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });
            expect(listener).toHaveBeenCalledTimes(3); // no transition, but starts new async computation via getSnapshot()

            // finish first computation
            r1(1);
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 1 });
            expect(listener).toHaveBeenCalledTimes(4); // pending data update

            // finish second computation
            r2(2);
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 2 });
            expect(listener).toHaveBeenCalledTimes(5); // pending->success transition
        });

        it("should not notify about outdated computations", async () => {
            //  C1
            //  |   C2
            //  |   |
            //  |   R2
            //  R1
            const source = createFlow(Promise.resolve(0));
            const flow = new AsyncComputedFlow(async ({ get }) => await get(source));

            const listener = vi.fn();
            flow.subscribe(listener);
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 0 });
            expect(listener).toHaveBeenCalledTimes(1); // pending->success transition

            // start first computation (C1)
            const { promise: p1, resolve: r1 } = Promise.withResolvers<number>();
            console.log("========== EMIT R1 =============");
            source.emit(p1);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });
            expect(listener).toHaveBeenCalledTimes(2); // success->pending transition

            // start second computation (C2)
            const { promise: p2, resolve: r2 } = Promise.withResolvers<number>();
            console.log("========== EMIT R2 =============");
            source.emit(p2);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });
            expect(listener).toHaveBeenCalledTimes(3); // no transition, but starts new async computation via getSnapshot()

            // finish second computation
            console.log("========== RESOLVE R2 =============");
            r2(2);
            await nextTick();
            const value1 = flow.getSnapshot();
            expect(value1).toEqual({ status: "success", data: 2 });
            expect(listener).toHaveBeenCalledTimes(4); // pending->success transition

            // finish first computation
            r1(1);
            await nextTick();
            const value2 = flow.getSnapshot();
            expect(value2).toEqual({ status: "success", data: 2 });
            expect(value2).toBe(value1);
            expect(listener).toHaveBeenCalledTimes(4); // outdated computation ignored
        });

        it("should notify about aborted computation", async () => {
            //  C1
            //  |   C2
            //  |   |
            //  R1  |
            //      |
            //      R2
            const source = createFlow(Promise.resolve(0));

            const flow = new AsyncComputedFlow(async ({ get, signal }) => {
                const value = await get(source);
                signal.throwIfAborted();
                return value;
            });
            const listener = vi.fn();
            flow.subscribe(listener);
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 0 });
            expect(listener).toHaveBeenCalledTimes(1); // pending->success transition

            // start first computation (C1)
            const { promise: p1, resolve: r1 } = Promise.withResolvers<number>();
            source.emit(p1);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });
            expect(listener).toHaveBeenCalledTimes(2); // success->pending transition

            // start second computation (C2)
            const { promise: p2, resolve: r2 } = Promise.withResolvers<number>();
            source.emit(p2);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });
            expect(listener).toHaveBeenCalledTimes(3); // no transition, but starts new async computation via getSnapshot()

            // finish first computation
            r1(1);
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });
            expect(listener).toHaveBeenCalledTimes(4); // aborted computation, the status may have changed

            // finish second computation
            r2(2);
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 2 });
            expect(listener).toHaveBeenCalledTimes(5); // pending->success transition
        });

        it("should not notify about aborted outdated computation", async () => {
            //  C1
            //  |   C2
            //  |   |
            //  |   R2
            //  R1
            const source = createFlow(Promise.resolve(0));

            const flow = new AsyncComputedFlow(async ({ get, signal }) => {
                const value = await get(source);
                signal.throwIfAborted();
                return value;
            });
            const listener = vi.fn();
            flow.subscribe(listener);
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 0 });
            expect(listener).toHaveBeenCalledTimes(1); // pending->success transition

            // start first computation (C1)
            const { promise: p1, resolve: r1 } = Promise.withResolvers<number>();
            source.emit(p1);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });
            expect(listener).toHaveBeenCalledTimes(2); // success->pending transition

            // start second computation (C2)
            const { promise: p2, resolve: r2 } = Promise.withResolvers<number>();
            source.emit(p2);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });
            expect(listener).toHaveBeenCalledTimes(3); // no transition, but starts new async computation via getSnapshot()

            // finish second computation
            r2(2);
            await nextTick();
            const value1 = flow.getSnapshot();
            expect(value1).toEqual({ status: "success", data: 2 });
            expect(listener).toHaveBeenCalledTimes(4); // pending->success transition

            // finish first computation
            r1(1);
            await nextTick();
            const value2 = flow.getSnapshot();
            expect(value2).toEqual({ status: "success", data: 2 });
            expect(value2).toBe(value1);
            expect(listener).toHaveBeenCalledTimes(4); // outdated computation ignored
        });
    });

    describe("asPromise behavior", () => {
        it("should resolve for success state", async () => {
            const source = createFlow(2);
            const flow = new AsyncComputedFlow(async ({ get }) => get(source) * 2);

            const promise = await flow.asPromise();
            expect(promise).toBe(4);
        });

        it("should reject for error state", async () => {
            const error = new Error("test");
            const flow = new AsyncComputedFlow(async () => {
                throw error;
            });

            const promise = flow.asPromise();
            await expect(promise).rejects.toBe(error);
        });

        it("should wait for pending state to resolve", async () => {
            const source = createFlow(Promise.resolve("initial"));
            const flow = new AsyncComputedFlow(async ({ get }) => get(source));

            await expect(flow.asPromise()).resolves.toBe("initial");

            const { promise, resolve } = Promise.withResolvers<string>();
            source.emit(promise);

            const status = await Promise.race([promise, Promise.resolve("pending")]);
            expect(status).toBe("pending");

            resolve("resolved");

            const status2 = await Promise.race([promise, Promise.resolve("pending")]);
            expect(status2).toBe("resolved");
        });

        it("should return same promise during getter execution", async () => {
            const source = createFlow(2);
            const flow = new AsyncComputedFlow(async ({ get }) => get(source) * 2);

            const p1 = flow.asPromise();
            const p2 = flow.asPromise();
            expect(p1).toBe(p2);
            await expect(p1).resolves.toBe(4);

            const p3 = flow.asPromise();
            expect(p3).toBe(p2);
        });

        it("should return same promise when cached value exists", async () => {
            const source = createFlow(2);
            const flow = new AsyncComputedFlow(async ({ get }) => get(source) * 2);

            await expect(flow.asPromise()).resolves.toBe(4);

            const p1 = flow.asPromise();
            source.emit(2);
            const p2 = flow.asPromise();
            expect(p1).toBe(p2);
        });

        it("should return new promise if sources changed", async () => {
            const source = createFlow(2);
            const flow = new AsyncComputedFlow(async ({ get }) => get(source) * 2);

            await expect(flow.asPromise()).resolves.toBe(4);

            const p1 = flow.asPromise();
            source.emit(3);
            const p2 = flow.asPromise();
            expect(p1).not.toBe(p2);
            await expect(p2).resolves.toBe(6);
        });

        it("should return new promise if sources changed during execution", async () => {
            const source = createFlow(2);
            const flow = new AsyncComputedFlow(async ({ get }) => get(source) * 2);

            const p1 = flow.asPromise();
            source.emit(3);
            const p2 = flow.asPromise();
            expect(p1).not.toBe(p2);
            await expect(p1).resolves.toBe(4);
            await expect(p2).resolves.toBe(6);
        });

        it("should ignore outdated computation (first starts, first ends)", async () => {
            //  C1
            //  |   C2
            //  |   |
            //  R1  |
            //      |
            //      R2
            const source = createFlow(Promise.resolve(0));
            const flow = new AsyncComputedFlow(async ({ get, signal }) => {
                const value = await get(source);
                signal.throwIfAborted();
                return value;
            });
            await expect(flow.asPromise()).resolves.toBe(0);

            // start first computation (C1)
            const { promise: p1, resolve: r1 } = Promise.withResolvers<number>();
            source.emit(p1);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });

            // start second computation (C2)
            const { promise: p2, resolve: r2 } = Promise.withResolvers<number>();
            source.emit(p2);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });

            // finish first computation
            r1(1);
            await nextTick();
            const status = await Promise.race([flow.asPromise(), Promise.resolve("pending")]);
            expect(status).toBe("pending");

            // finish second computation
            r2(2);
            await nextTick();
            const status2 = await Promise.race([flow.asPromise(), Promise.resolve("pending")]);
            expect(status2).toBe(2);
        });

        it("should ignore outdated computation (first starts, last ends)", async () => {
            //  C1
            //  |   C2
            //  |   |
            //  |   R2
            //  R1
            const source = createFlow(Promise.resolve(0));
            const flow = new AsyncComputedFlow(async ({ get, signal }) => {
                const value = await get(source);
                signal.throwIfAborted();
                return value;
            });
            await expect(flow.asPromise()).resolves.toBe(0);

            // start first computation (C1)
            const { promise: p1, resolve: r1 } = Promise.withResolvers<number>();
            source.emit(p1);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });

            // start second computation (C2)
            const { promise: p2, resolve: r2 } = Promise.withResolvers<number>();
            source.emit(p2);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });

            // finish second computation
            r2(2);
            await nextTick();
            const status = await Promise.race([flow.asPromise(), Promise.resolve("pending")]);
            expect(status).toBe(2);

            // finish first computation
            r1(1);
            await nextTick();
            const status2 = await Promise.race([flow.asPromise(), Promise.resolve("pending")]);
            expect(status2).toBe(2);
        });
    });

    describe("side effects detection", () => {
        // side effects in getter (only for sync part)
        // reading in notify
        it("");
    });

    describe("cycles detection", () => {
        // detects trivial cycles
        // detects slightly larger cycles
        // detects depending on self
        it("");
    });

    describe("custom equality", () => {
        // todo
        it("");
    });
});

async function nextTick() {
    // await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise<void>((resolve) => {
        queueMicrotask(resolve);
    });
}

function getSubscriptionsCount(flow: Flow<unknown>): number {
    // @ts-expect-error в тестах используется реализация, у которой можно прочитать кол-во подписок
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const subscriptions: Set<unknown> = flow.subscriptions;
    return subscriptions.size;
}
