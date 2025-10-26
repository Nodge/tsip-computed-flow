/* eslint-disable require-yield */
import { createFlow, createAsyncFlow } from "@tsip/flow";
import type { AsyncFlow, AsyncFlowState, Flow } from "@tsip/types";
import { describe, it, expect, vi, expectTypeOf, afterEach, beforeEach } from "vitest";
import { AsyncComputedGeneratorFlow } from "./instance";
import { validateAsyncFlowImplementation } from "../../../../types/dist/tests.mjs";

describe("AsyncComputedGeneratorFlow", () => {
    beforeEach(() => {
        vi.spyOn(console, "error").mockImplementation(() => {
            // noop
        });
    });

    afterEach(() => {
        expect(console.error).not.toHaveBeenCalled();
        vi.mocked(console.error).mockClear();
    });

    describe("types", () => {
        it("should infer return type", () => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const flow1: AsyncFlow<string> = new AsyncComputedGeneratorFlow(function* () {
                return "value";
            });
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const flow2: AsyncFlow<"const"> = new AsyncComputedGeneratorFlow(function* () {
                return "const" as const;
            });
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const flow3: AsyncFlow<number> = new AsyncComputedGeneratorFlow(function* () {
                return 123;
            });
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const flow4: AsyncFlow<{ value: number }> = new AsyncComputedGeneratorFlow(function* () {
                return { value: 123 };
            });
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const flow5: AsyncFlow<undefined> = new AsyncComputedGeneratorFlow(function* () {
                return undefined;
            });
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const flow6: AsyncFlow<null> = new AsyncComputedGeneratorFlow(function* () {
                return null;
            });

            const source = createFlow(0);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const flow7: AsyncFlow<number> = new AsyncComputedGeneratorFlow(function* ({ watch }) {
                return watch(source);
            });

            const asyncSource = createAsyncFlow({ status: "success", data: 0 });
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const flow8: AsyncFlow<number> = new AsyncComputedGeneratorFlow(function* ({ watchAsync: getAsync }) {
                return yield* getAsync(asyncSource);
            });
        });

        it("should infer return type with skips", () => {
            const source = createAsyncFlow<"a" | "b">({ status: "pending" });
            const flow = new AsyncComputedGeneratorFlow(function* ({ watchAsync: getAsync, skip }) {
                const value = yield* getAsync(source);
                if (value === "a") {
                    return skip();
                }
                return value;
            });

            expectTypeOf(flow).toEqualTypeOf<AsyncComputedGeneratorFlow<"b">>();
        });

        it("should not accept plain functions", () => {
            new AsyncComputedGeneratorFlow(
                // @ts-expect-error for test purposes
                () => {
                    return 2;
                },
            );
        });

        it("should not accept async generators", () => {
            new AsyncComputedGeneratorFlow(
                // @ts-expect-error for test purposes
                async function* () {
                    return await Promise.resolve(2);
                },
            );
        });
    });

    describe("basic functionality", () => {
        it("should compute and return asynchronous values", () => {
            const flow = new AsyncComputedGeneratorFlow(function* () {
                return "const";
            });
            expect(flow.getSnapshot()).toEqual({ status: "success", data: "const" });
        });

        it("should compute values based on sync dependencies", () => {
            const source = createFlow(2);
            const flow = new AsyncComputedGeneratorFlow(function* ({ watch }) {
                return watch(source) * 2;
            });
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 4 });
        });

        it("should compute values based on async dependencies", async () => {
            const source = createAsyncFlow<number>({ status: "pending" });

            const flow = new AsyncComputedGeneratorFlow(function* ({ watchAsync: getAsync }) {
                return (yield* getAsync(source)) * 2;
            });
            expect(flow.getSnapshot()).toEqual({ status: "pending" });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "pending" });

            source.emit({ status: "success", data: 2 });
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 4 });
        });

        it("should recompute when dependencies change", async () => {
            const source = createAsyncFlow<number>({ status: "success", data: 2 });

            const flow = new AsyncComputedGeneratorFlow(function* ({ watchAsync: getAsync }) {
                return (yield* getAsync(source)) * 2;
            });
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
            const flow = new AsyncComputedGeneratorFlow(function* ({ watchAsync: getAsync }) {
                return yield* getAsync(source);
            });
            expect(flow.getSnapshot()).toEqual({ status: "pending" });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: "result" });
        });
    });

    describe("getSnapshot behavior", () => {
        it("should emit success state when promise resolves", async () => {
            const asyncFlow = createAsyncFlow<string>({ status: "pending" });
            const flow = new AsyncComputedGeneratorFlow(function* ({ watchAsync: getAsync }) {
                return yield* getAsync(asyncFlow);
            });
            expect(flow.getSnapshot()).toEqual({ status: "pending" });

            asyncFlow.emit({ status: "success", data: "resolved data" });
            await nextTick();

            expect(flow.getSnapshot()).toEqual({ status: "success", data: "resolved data" });
        });

        it("should emit error state when promise rejects", async () => {
            const asyncFlow = createAsyncFlow<string>({ status: "pending" });

            const flow = new AsyncComputedGeneratorFlow(function* ({ watchAsync: getAsync }) {
                return yield* getAsync(asyncFlow);
            });
            expect(flow.getSnapshot()).toEqual({ status: "pending" });

            const error = new Error("test error");
            asyncFlow.emit({ status: "error", error });
            await nextTick();

            expect(flow.getSnapshot()).toEqual({ status: "error", error, data: undefined });
        });

        it("should preserve previous data in pending state", async () => {
            const source = createAsyncFlow({ status: "success", data: 1 });
            const asyncFlow = createAsyncFlow<string>({ status: "pending" });

            const flow = new AsyncComputedGeneratorFlow(function* ({ watchAsync: getAsync }) {
                const value = yield* getAsync(source);
                if (value === 1) {
                    return "initial data";
                }
                return yield* getAsync(asyncFlow);
            });

            expect(flow.getSnapshot()).toEqual({ status: "pending", data: undefined });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: "initial data" });

            // Trigger new async computation
            source.emit({ status: "success", data: 2 });

            // Should be pending but preserve previous data
            const pendingState = flow.getSnapshot();
            expect(pendingState).toEqual({
                status: "pending",
                data: "initial data",
            });

            asyncFlow.emit({ status: "success", data: "new data" });

            // two yield statements produce two microtasks sequentially
            await nextTick();
            await nextTick();

            expect(flow.getSnapshot()).toEqual({ status: "success", data: "new data" });
        });

        it("should preserve previous data in error state", async () => {
            const source = createAsyncFlow({ status: "success", data: 1 });
            const asyncFlow = createAsyncFlow<string>({ status: "pending" });

            const flow = new AsyncComputedGeneratorFlow(function* ({ watchAsync: getAsync }) {
                const value = yield* getAsync(source);
                if (value === 1) {
                    return "initial data";
                }
                return yield* getAsync(asyncFlow);
            });

            expect(flow.getSnapshot()).toEqual({ status: "pending", data: undefined });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: "initial data" });

            // Trigger async computation that will fail
            source.emit({ status: "success", data: 2 });

            // Should be pending but preserve previous data
            const pendingState = flow.getSnapshot();
            expect(pendingState).toEqual({
                status: "pending",
                data: "initial data",
            });

            // Reject the promise
            const error = new Error("test error");
            asyncFlow.emit({ status: "error", error });

            // two yield statements produce two microtasks sequentially
            await nextTick();
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
            const source = createFlow(0);
            const resolvers: (() => void)[] = [];

            const flow = new AsyncComputedGeneratorFlow(function* ({ watch }) {
                const value = watch(source);
                yield new Promise<void>((r) => resolvers.push(r));
                return value;
            });
            expect(flow.getSnapshot()).toEqual({ status: "pending" });
            resolvers[0]?.();
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 0 });

            // start first computation (C1)
            source.emit(1);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });

            // start second computation (C2)
            source.emit(2);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });

            // finish first computation
            resolvers[1]?.();
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 1 });

            // finish second computation
            resolvers[2]?.();
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 2 });
        });

        it("should handle concurrent computations (first starts, last ends)", async () => {
            //  C1
            //  |   C2
            //  |   |
            //  |   R2
            //  R1
            const source = createFlow(0);
            const resolvers: (() => void)[] = [];

            const flow = new AsyncComputedGeneratorFlow(function* ({ watch }) {
                const value = watch(source);
                yield new Promise<void>((r) => resolvers.push(r));
                return value;
            });
            expect(flow.getSnapshot()).toEqual({ status: "pending" });
            resolvers[0]?.();
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 0 });

            // start first computation (C1)
            source.emit(1);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });

            // start second computation (C2)
            source.emit(2);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });

            // finish second computation
            resolvers[2]?.();
            await nextTick();
            const value1 = flow.getSnapshot();
            expect(value1).toEqual({ status: "success", data: 2 });

            // finish first computation
            resolvers[1]?.();
            await nextTick();
            const value2 = flow.getSnapshot();
            expect(value2).toEqual({ status: "success", data: 2 });
            expect(value2).toBe(value1);
        });

        it("should abort previous computation on new computation start", async () => {
            const source = createFlow(0);
            const resolvers: (() => void)[] = [];
            const signals: AbortSignal[] = [];

            const flow = new AsyncComputedGeneratorFlow(function* ({ watch, signal }) {
                const value = watch(source);
                signals.push(signal);
                yield new Promise<void>((r) => resolvers.push(r));
                return value;
            });
            expect(flow.getSnapshot()).toEqual({ status: "pending" });
            resolvers[0]?.();
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 0 });

            // start first computation
            source.emit(1);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });
            expect(signals).toHaveLength(2);
            expect(signals[0]?.aborted).toBe(true);
            expect(signals[1]?.aborted).toBe(false);

            // start second computation
            source.emit(2);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });
            expect(signals).toHaveLength(3);
            expect(signals[0]?.aborted).toBe(true);
            expect(signals[1]?.aborted).toBe(true);
            expect(signals[2]?.aborted).toBe(false);

            resolvers[1]?.();
            resolvers[2]?.();
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
            const source = createFlow(0);
            const resolvers: (() => void)[] = [];

            const flow = new AsyncComputedGeneratorFlow(function* ({ watch, signal }) {
                const value = watch(source);
                yield new Promise<void>((r) => resolvers.push(r));
                signal.throwIfAborted();
                return value;
            });
            expect(flow.getSnapshot()).toEqual({ status: "pending" });
            resolvers[0]?.();
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 0 });

            // start first computation (C1)
            source.emit(1);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });

            // start second computation (C2)
            source.emit(2);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });

            // finish first computation
            resolvers[1]?.();
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });

            // finish second computation
            resolvers[2]?.();
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 2 });
        });

        it("should ignore aborted computation error (first starts, last ends)", async () => {
            //  C1
            //  |   C2
            //  |   |
            //  |   R2
            //  R1
            const source = createFlow(0);
            const resolvers: (() => void)[] = [];

            const flow = new AsyncComputedGeneratorFlow(function* ({ watch, signal }) {
                const value = watch(source);
                yield new Promise<void>((r) => resolvers.push(r));
                signal.throwIfAborted();
                return value;
            });
            expect(flow.getSnapshot()).toEqual({ status: "pending" });
            resolvers[0]?.();
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 0 });

            // start first computation (C1)
            source.emit(1);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });

            // start second computation (C2)
            source.emit(2);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });

            // finish second computation
            resolvers[2]?.();
            await nextTick();
            const value1 = flow.getSnapshot();
            expect(value1).toEqual({ status: "success", data: 2 });

            // finish first computation
            resolvers[1]?.();
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
            const source = createFlow(0);
            const resolvers: (() => void)[] = [];

            const flow = new AsyncComputedGeneratorFlow(function* ({ watch }) {
                const value = watch(source);
                yield new Promise<void>((r) => resolvers.push(r));
                return value;
            });
            expect(flow.getSnapshot()).toEqual({ status: "pending" });
            resolvers[0]?.();
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 0 });

            // start first computation (C1)
            source.emit(1);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });

            // start second computation (C2)
            source.emit(2);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });

            // start third computation (C3)
            source.emit(3);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });

            // finish second computation
            resolvers[2]?.();
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 2 });

            // finish first computation
            resolvers[1]?.();
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 2 });

            // finish third computation
            resolvers[3]?.();
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 3 });
        });
    });

    describe("concurrent sources", () => {
        it("should handle concurrent sources via getAsync.all()", async () => {
            //  S1
            //  |   S1
            //  |   |   S2
            //  R1  |   |
            //      R2  |
            //          R3
            const s1 = createAsyncFlow<string>({ status: "success", data: "R0" });
            const s2 = createAsyncFlow<string>({ status: "success", data: "R0" });

            const flow = new AsyncComputedGeneratorFlow(function* ({ watchAsync: getAsync }) {
                return yield* getAsync.all([s1, s2]);
            });
            expect(flow.getSnapshot()).toEqual({ status: "pending" });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: ["R0", "R0"] });

            s1.emit({ status: "pending" });
            await nextTick();
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

        it("should handle concurrent sources via getAsync.allSettled()", async () => {
            //  S1
            //  |   S1
            //  |   |   S2
            //  R1  |   |
            //      R2  |
            //          R3
            const s1 = createAsyncFlow<string>({ status: "success", data: "R0" });
            const s2 = createAsyncFlow<string>({ status: "success", data: "R0" });

            const flow = new AsyncComputedGeneratorFlow(function* ({ watchAsync: getAsync }) {
                return yield* getAsync.allSettled([s1, s2]);
            });
            expect(flow.getSnapshot()).toEqual({ status: "pending" });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({
                status: "success",
                data: [
                    { status: "fulfilled", value: "R0" },
                    { status: "fulfilled", value: "R0" },
                ],
            });

            s1.emit({ status: "pending" });
            await nextTick();
            expect(flow.getSnapshot()).toEqual({
                status: "pending",
                data: [
                    { status: "fulfilled", value: "R0" },
                    { status: "fulfilled", value: "R0" },
                ],
            });

            s2.emit({ status: "pending" });
            expect(flow.getSnapshot()).toEqual({
                status: "pending",
                data: [
                    { status: "fulfilled", value: "R0" },
                    { status: "fulfilled", value: "R0" },
                ],
            });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({
                status: "pending",
                data: [
                    { status: "fulfilled", value: "R0" },
                    { status: "fulfilled", value: "R0" },
                ],
            });

            s1.emit({ status: "pending", data: "R1" });
            expect(flow.getSnapshot()).toEqual({
                status: "pending",
                data: [
                    { status: "fulfilled", value: "R0" },
                    { status: "fulfilled", value: "R0" },
                ],
            });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({
                status: "pending",
                data: [
                    { status: "fulfilled", value: "R0" },
                    { status: "fulfilled", value: "R0" },
                ],
            });

            s1.emit({ status: "success", data: "R2" });
            expect(flow.getSnapshot()).toEqual({
                status: "pending",
                data: [
                    { status: "fulfilled", value: "R0" },
                    { status: "fulfilled", value: "R0" },
                ],
            });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({
                status: "pending",
                data: [
                    { status: "fulfilled", value: "R0" },
                    { status: "fulfilled", value: "R0" },
                ],
            });

            s2.emit({ status: "success", data: "R3" });
            expect(flow.getSnapshot()).toEqual({
                status: "pending",
                data: [
                    { status: "fulfilled", value: "R0" },
                    { status: "fulfilled", value: "R0" },
                ],
            });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({
                status: "success",
                data: [
                    { status: "fulfilled", value: "R2" },
                    { status: "fulfilled", value: "R3" },
                ],
            });
        });

        it("should handle concurrent sources via getAsync.any()", async () => {
            //  S1
            //  |   S1
            //  |   |   S2
            //  R1  |   |
            //      R2* |
            //          R3
            const s1 = createAsyncFlow<string>({ status: "success", data: "R0" });
            const s2 = createAsyncFlow<string>({ status: "success", data: "R0" });

            const flow = new AsyncComputedGeneratorFlow(function* ({ watchAsync: getAsync }) {
                return yield* getAsync.any([s1, s2]);
            });
            expect(flow.getSnapshot()).toEqual({ status: "pending" });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: "R0" });

            s1.emit({ status: "pending" });
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: "R0" });

            s2.emit({ status: "pending" });
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: "R0" });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: "R0" });

            s1.emit({ status: "pending", data: "R1" });
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: "R0" });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: "R0" });

            s1.emit({ status: "error", error: "R2" });
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: "R0" });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: "R0" });

            s2.emit({ status: "success", data: "R3" });
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: "R0" });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: "R3" });
        });

        it("should handle concurrent sources via getAsync.race()", async () => {
            //  S1
            //  |   S1
            //  |   |   S2
            //  R1  |   |
            //      R2* |
            //          R3
            const s1 = createAsyncFlow<string>({ status: "success", data: "R0" });
            const s2 = createAsyncFlow<string>({ status: "success", data: "R0" });

            const flow = new AsyncComputedGeneratorFlow(function* ({ watchAsync: getAsync }) {
                return yield* getAsync.race([s1, s2]);
            });
            expect(flow.getSnapshot()).toEqual({ status: "pending" });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: "R0" });

            s1.emit({ status: "pending" });
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: "R0" });

            s2.emit({ status: "pending" });
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: "R0" });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: "R0" });

            s1.emit({ status: "pending", data: "R1" });
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: "R0" });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: "R0" });

            s1.emit({ status: "error", error: "R2" });
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: "R0" });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "error", error: "R2", data: "R0" });

            s2.emit({ status: "success", data: "R3" });
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: "R0" });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "error", error: "R2", data: "R0" });

            s1.emit({ status: "pending" });
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: "R0" });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: "R3" });
        });
    });

    describe("compute error handling", () => {
        it("should handle exceptions and propagate errors via getSnapshot", () => {
            const error = new Error("test");
            const flow = new AsyncComputedGeneratorFlow<unknown>(function* () {
                throw error;
            });

            expect(flow.getSnapshot()).toEqual({ status: "error", error });
        });

        it("should handle promise rejections and propagate errors via getSnapshot", async () => {
            const error = new Error("test");
            const asyncFlow = createAsyncFlow({ status: "error", error });
            const flow = new AsyncComputedGeneratorFlow<unknown>(function* ({ watchAsync: getAsync }) {
                yield* getAsync(asyncFlow);
            });
            expect(flow.getSnapshot()).toEqual({ status: "pending" });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "error", error });
        });

        it("should allow to handle errors via try-catch", async () => {
            const error = new Error("test");
            const asyncFlow = createAsyncFlow({ status: "error", error });
            const flow = new AsyncComputedGeneratorFlow<unknown>(function* ({ watchAsync: getAsync }) {
                try {
                    yield* getAsync(asyncFlow);
                } catch (err) {
                    return { err };
                }
            });
            expect(flow.getSnapshot()).toEqual({ status: "pending" });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: { err: error } });
        });

        it("should propagate errors for synchronous sources", () => {
            const error = new Error("test");
            const source = createFlow(0);
            source.getSnapshot = () => {
                throw error;
            };

            const flow = new AsyncComputedGeneratorFlow<unknown>(function* ({ watch }) {
                return watch(source);
            });
            flow.subscribe(vi.fn());
            expect(flow.getSnapshot()).toEqual({ status: "error", error });
            expect(getSubscriptionsCount(source)).toBe(1);
        });

        it("should propagate errors for asynchronous sources", async () => {
            const error = new Error("test");
            const source = createAsyncFlow({ status: "error", error });

            const flow = new AsyncComputedGeneratorFlow<unknown>(function* ({ watchAsync: getAsync }) {
                return yield* getAsync(source);
            });
            flow.subscribe(vi.fn());
            expect(flow.getSnapshot()).toEqual({ status: "pending" });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "error", error });
            expect(getSubscriptionsCount(source)).toBe(1);
        });

        it("should handle exception in synchronoues part of getter", () => {
            const error = new Error("test");
            const flow = new AsyncComputedGeneratorFlow<unknown>(function* () {
                throw error;
            });
            flow.subscribe(vi.fn());
            expect(flow.getSnapshot()).toEqual({ status: "error", error });
        });
    });

    describe("subscriptions error handling", () => {
        it("should catch errors from listeners and log them", () => {
            const error1 = new Error("Listener 1 error");
            const error2 = new Error("Listener 2 error");

            const source = createFlow(0);
            const flow = new AsyncComputedGeneratorFlow(function* ({ watch }) {
                return watch(source);
            });

            flow.subscribe(() => {
                throw error1;
            });
            flow.subscribe(() => {
                throw error2;
            });

            source.emit(1);

            expect(console.error).toHaveBeenCalledTimes(2);
            expect(console.error).toHaveBeenNthCalledWith(1, expect.any(Error));
            expect(console.error).toHaveBeenNthCalledWith(2, expect.any(Error));

            const first = vi.mocked(console.error).mock.calls[0]?.[0] as Error;
            expect(first).toBeInstanceOf(Error);
            expect(first.message).toBe("Failed to call flow listener");
            expect(first.cause).toBe(error1);

            const second = vi.mocked(console.error).mock.calls[1]?.[0] as Error;
            expect(second).toBeInstanceOf(Error);
            expect(second.message).toBe("Failed to call flow listener");
            expect(second.cause).toBe(error2);

            vi.mocked(console.error).mockClear();
        });

        it("should still update the state even if listeners throw", () => {
            const source = createFlow(0);
            const flow = new AsyncComputedGeneratorFlow(function* ({ watch }) {
                return watch(source);
            });
            flow.subscribe(() => {
                throw new Error("Listener error");
            });

            expect(flow.getSnapshot()).toEqual({ status: "success", data: 0 });

            source.emit(1);
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 1 });

            vi.mocked(console.error).mockClear();
        });

        it("should call all listeners even if some throw", () => {
            const source = createFlow(0);
            const flow = new AsyncComputedGeneratorFlow(function* ({ watch }) {
                return watch(source);
            });
            const listener1 = vi.fn(() => {
                throw new Error("Error 1");
            });
            const listener2 = vi.fn();
            const listener3 = vi.fn(() => {
                throw new Error("Error 3");
            });

            flow.subscribe(listener1);
            flow.subscribe(listener2);
            flow.subscribe(listener3);

            source.emit(1);

            expect(listener1).toHaveBeenCalledTimes(1);
            expect(listener2).toHaveBeenCalledTimes(1);
            expect(listener3).toHaveBeenCalledTimes(1);

            vi.mocked(console.error).mockClear();
        });

        it("should handle mixed success and error scenarios", () => {
            const source = createFlow(0);
            const flow = new AsyncComputedGeneratorFlow(function* ({ watch }) {
                return watch(source);
            });
            const error = new Error("Test error");
            const successListener = vi.fn();
            const errorListener = vi.fn(() => {
                throw error;
            });

            flow.subscribe(successListener);
            flow.subscribe(errorListener);
            flow.subscribe(successListener);

            source.emit(1);

            expect(successListener).toHaveBeenCalledTimes(2);
            expect(errorListener).toHaveBeenCalledTimes(1);
            expect(console.error).toHaveBeenCalledTimes(1);
            expect(console.error).toHaveBeenNthCalledWith(1, expect.any(Error));

            const arg = vi.mocked(console.error).mock.calls[0]?.[0] as Error;
            expect(arg).toBeInstanceOf(Error);
            expect(arg.message).toBe("Failed to call flow listener");
            expect(arg.cause).toBe(error);

            vi.mocked(console.error).mockClear();
        });
    });

    describe("skip behavior", () => {
        it("should provide skip() method to abort computation", async () => {
            const source = createAsyncFlow({ status: "success", data: 1 });
            const flow = new AsyncComputedGeneratorFlow(function* ({ watchAsync: getAsync, skip }) {
                const value = yield* getAsync(source);
                if (value % 2 === 0) {
                    skip();
                }
                return { value };
            });

            expectTypeOf(flow).toEqualTypeOf<AsyncComputedGeneratorFlow<{ value: number }>>();
            expect(flow.getSnapshot()).toEqual({ status: "pending" });

            await nextTick();
            const value1 = flow.getSnapshot();
            expect(value1).toEqual({ status: "success", data: { value: 1 } });

            source.emit({ status: "success", data: 2 });
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: { value: 1 } });
            await nextTick();
            const value2 = flow.getSnapshot();
            expect(value2).toEqual({ status: "success", data: { value: 1 } });
            expect(value2).toBe(value1);

            source.emit({ status: "success", data: 3 });
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: { value: 1 } });
            await nextTick();
            const value3 = flow.getSnapshot();
            expect(value3).toEqual({ status: "success", data: { value: 3 } });
            expect(value3).not.toBe(value2);

            source.emit({ status: "success", data: 4 });
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: { value: 3 } });
            await nextTick();
            const value4 = flow.getSnapshot();
            expect(value4).toEqual({ status: "success", data: { value: 3 } });
            expect(value4).toBe(value3);
        });

        it("should return initial value if first computation was skipped", async () => {
            const source = createAsyncFlow({ status: "success", data: 0 });
            const flow = new AsyncComputedGeneratorFlow(
                function* ({ watchAsync: getAsync, skip }) {
                    const value = yield* getAsync(source);
                    if (value % 2 === 0) {
                        skip();
                    }
                    return value;
                },
                { initialValue: { status: "success", data: -1 } },
            );

            expectTypeOf(flow).toEqualTypeOf<AsyncComputedGeneratorFlow<number>>();
            expect(flow.getSnapshot()).toEqual({ status: "pending" });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: -1 });

            source.emit({ status: "success", data: 1 });
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: -1 });
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 1 });

            source.emit({ status: "success", data: 2 });
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 1 });
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 1 });

            source.emit({ status: "success", data: 3 });
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 1 });
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 3 });
        });

        it("should accept different types in getter and initialValue", async () => {
            const source = createAsyncFlow({ status: "success", data: 0 });
            const flow = new AsyncComputedGeneratorFlow<number | "skip">(
                function* ({ watchAsync: getAsync, skip }) {
                    const value = yield* getAsync(source);
                    if (value % 2 === 0) {
                        skip();
                    }
                    return value;
                },
                { initialValue: { status: "success", data: "skip" } },
            );

            expectTypeOf(flow).toEqualTypeOf<AsyncComputedGeneratorFlow<number | "skip">>();
            expect(flow.getSnapshot()).toEqual({ status: "pending" });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: "skip" });

            source.emit({ status: "success", data: 1 });
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: "skip" });
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 1 });

            source.emit({ status: "success", data: 2 });
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 1 });
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 1 });

            source.emit({ status: "success", data: 3 });
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 1 });
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 3 });
        });

        it("should throw error if first computation was skipped and initial value was not set", async () => {
            const source = createAsyncFlow({ status: "success", data: 0 });
            const flow = new AsyncComputedGeneratorFlow(function* ({ watchAsync: getAsync, skip }) {
                const value = yield* getAsync(source);
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

        it("should handle skip in synchronous part of getter", () => {
            const source = createFlow(1);
            const flow = new AsyncComputedGeneratorFlow(function* ({ watch, skip }) {
                const value = watch(source);
                if (value % 2 === 0) {
                    skip();
                }
                return { value };
            });

            expectTypeOf(flow).toEqualTypeOf<AsyncComputedGeneratorFlow<{ value: number }>>();

            const value1 = flow.getSnapshot();
            expect(value1).toEqual({ status: "success", data: { value: 1 } });

            source.emit(2);
            const value2 = flow.getSnapshot();
            expect(value2).toEqual({ status: "success", data: { value: 1 } });
            expect(value2).toBe(value1);

            source.emit(3);
            const value3 = flow.getSnapshot();
            expect(value3).toEqual({ status: "success", data: { value: 3 } });
            expect(value3).not.toBe(value2);

            source.emit(4);
            const value4 = flow.getSnapshot();
            expect(value4).toEqual({ status: "success", data: { value: 3 } });
            expect(value4).toBe(value3);
        });

        it("should re-compute after skipped computation", () => {
            const skipSource = createFlow(false);
            const source = createFlow(0);
            const getSnapshot = vi.fn();

            const flow = new AsyncComputedGeneratorFlow(function* ({ watch, skip }) {
                getSnapshot();
                if (watch(skipSource)) {
                    skip();
                }
                return watch(source);
            });

            const listener = vi.fn();
            flow.subscribe(listener);

            expect(flow.getSnapshot()).toEqual({ status: "success", data: 0 });
            expect(listener).toHaveBeenCalledTimes(0);
            expect(getSnapshot).toHaveBeenCalledTimes(1);

            skipSource.emit(true);
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 0 });
            expect(listener).toHaveBeenCalledTimes(1);
            expect(getSnapshot).toHaveBeenCalledTimes(2);

            source.emit(1);
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 0 });
            expect(listener).toHaveBeenCalledTimes(2);
            expect(getSnapshot).toHaveBeenCalledTimes(3);

            skipSource.emit(false);
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 1 });
            expect(listener).toHaveBeenCalledTimes(3);
            expect(getSnapshot).toHaveBeenCalledTimes(4);

            source.emit(2);
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 2 });
            expect(listener).toHaveBeenCalledTimes(4);
            expect(getSnapshot).toHaveBeenCalledTimes(5);
        });
    });

    describe("subscription behavior", () => {
        it("should notify subscribers on deps change", async () => {
            const source = createAsyncFlow({ status: "success", data: 1 });
            const flow = new AsyncComputedGeneratorFlow(function* ({ watchAsync: getAsync }) {
                return (yield* getAsync(source)) * 2;
            });
            const listener = vi.fn();

            flow.subscribe(listener);
            expect(listener).toHaveBeenCalledTimes(0);

            await nextTick();
            expect(listener).toHaveBeenCalledTimes(1); // pending->success transition

            flow.getSnapshot();
            source.emit({ status: "success", data: 3 });
            expect(listener).toHaveBeenCalledTimes(2); // success->pending transition

            flow.getSnapshot();
            await nextTick();
            expect(listener).toHaveBeenCalledTimes(3); // pending->success transition
        });

        it("should notify subscribers added after the first computation finished", async () => {
            const source = createAsyncFlow({ status: "success", data: 1 });
            const flow = new AsyncComputedGeneratorFlow(function* ({ watchAsync: getAsync }) {
                return (yield* getAsync(source)) * 2;
            });
            const listener = vi.fn();

            expect(flow.getSnapshot()).toEqual({ status: "pending" });

            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 2 });

            flow.subscribe(listener);
            await nextTick();
            expect(listener).toHaveBeenCalledTimes(0);

            source.emit({ status: "success", data: 3 });
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 2 });
            expect(listener).toHaveBeenCalledTimes(1); // success->pending transition

            flow.getSnapshot();
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 6 });
            expect(listener).toHaveBeenCalledTimes(2); // pending->success transition
        });

        it("should notify subscribers about computation error", async () => {
            const source = createAsyncFlow({ status: "error", error: new Error() });
            const flow = new AsyncComputedGeneratorFlow(function* ({ watchAsync: getAsync }) {
                yield* getAsync(source);
            });
            const listener = vi.fn();

            flow.subscribe(listener);
            expect(listener).toHaveBeenCalledTimes(0);

            await nextTick();
            expect(listener).toHaveBeenCalledTimes(1); // pending->error transition
        });

        it("should notify at most once between getSnapshot calls", async () => {
            const source = createAsyncFlow({ status: "success", data: 1 });
            const flow = new AsyncComputedGeneratorFlow(function* ({ watchAsync: getAsync }) {
                return (yield* getAsync(source)) * 2;
            });
            const listener = vi.fn();

            flow.subscribe(listener);
            expect(listener).toHaveBeenCalledTimes(0);

            await nextTick();
            expect(listener).toHaveBeenCalledTimes(1); // pending->success transition

            source.emit({ status: "success", data: 3 });
            await nextTick();
            expect(listener).toHaveBeenCalledTimes(1);

            source.emit({ status: "success", data: 4 });
            await nextTick();
            expect(listener).toHaveBeenCalledTimes(1);

            flow.getSnapshot();
            source.emit({ status: "success", data: 5 });
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
            const source = createFlow(0);
            const resolvers: (() => void)[] = [];
            const flow = new AsyncComputedGeneratorFlow(function* ({ watch }) {
                const value = watch(source);
                yield new Promise<void>((r) => resolvers.push(r));
                return value;
            });

            const listener = vi.fn();
            flow.subscribe(listener);
            resolvers[0]?.();
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 0 });
            expect(listener).toHaveBeenCalledTimes(1); // pending->success transition

            // start first computation (C1)
            source.emit(1);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });
            expect(listener).toHaveBeenCalledTimes(2); // success->pending transition

            // start second computation (C2)
            source.emit(2);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });
            expect(listener).toHaveBeenCalledTimes(3); // no transition, but starts new async computation via getSnapshot()

            // finish first computation
            resolvers[1]?.();
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 1 });
            expect(listener).toHaveBeenCalledTimes(4); // pending data update

            // finish second computation
            resolvers[2]?.();
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
            const source = createFlow(0);
            const resolvers: (() => void)[] = [];
            const flow = new AsyncComputedGeneratorFlow(function* ({ watch }) {
                const value = watch(source);
                yield new Promise<void>((r) => resolvers.push(r));
                return value;
            });

            const listener = vi.fn();
            flow.subscribe(listener);
            resolvers[0]?.();
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 0 });
            expect(listener).toHaveBeenCalledTimes(1); // pending->success transition

            // start first computation (C1)
            source.emit(1);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });
            expect(listener).toHaveBeenCalledTimes(2); // success->pending transition

            // start second computation (C2)
            source.emit(2);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });
            expect(listener).toHaveBeenCalledTimes(3); // no transition, but starts new async computation via getSnapshot()

            // finish second computation
            resolvers[2]?.();
            await nextTick();
            const value1 = flow.getSnapshot();
            expect(value1).toEqual({ status: "success", data: 2 });
            expect(listener).toHaveBeenCalledTimes(4); // pending->success transition

            // finish first computation
            resolvers[1]?.();
            await nextTick();
            const value2 = flow.getSnapshot();
            expect(value2).toEqual({ status: "success", data: 2 });
            expect(value2).toBe(value1);
            expect(listener).toHaveBeenCalledTimes(4); // outdated computation ignored
        });

        it("should not notify about aborted computation if previous computation has not finished", async () => {
            //  C1
            //  |   C2
            //  |   |
            //  R1  |
            //      |
            //      R2
            const source = createFlow(0);
            const resolvers: (() => void)[] = [];

            const flow = new AsyncComputedGeneratorFlow(function* ({ watch, signal }) {
                const value = watch(source);
                yield new Promise<void>((r) => resolvers.push(r));
                signal.throwIfAborted();
                return value;
            });
            const listener = vi.fn();
            flow.subscribe(listener);
            resolvers[0]?.();
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 0 });
            expect(listener).toHaveBeenCalledTimes(1); // pending->success transition

            // start first computation (C1)
            source.emit(1);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });
            expect(listener).toHaveBeenCalledTimes(2); // success->pending transition

            // start second computation (C2)
            source.emit(2);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });
            expect(listener).toHaveBeenCalledTimes(3); // no transition, but starts new async computation via getSnapshot()

            // finish first computation
            resolvers[1]?.();
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });
            expect(listener).toHaveBeenCalledTimes(3); // aborted computation, the status may have changed

            // finish second computation
            resolvers[2]?.();
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 2 });
            expect(listener).toHaveBeenCalledTimes(4); // pending->success transition
        });

        it("should notify about aborted computation if previous computation has finished", async () => {
            //  C1
            //  |
            //  |
            //  R1
            //      C2
            //      |
            //      |
            //      R2
            const source = createFlow(0);
            const resolvers: (() => void)[] = [];

            const flow = new AsyncComputedGeneratorFlow(function* ({ watch, skip }) {
                const value = watch(source);
                yield new Promise<void>((r) => resolvers.push(r));
                if (value === 2) {
                    skip();
                }
                return value;
            });
            const listener = vi.fn();

            // start first computation (C1)
            flow.subscribe(listener);
            resolvers[0]?.();
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 0 });
            expect(listener).toHaveBeenCalledTimes(1); // pending->success transition

            // start second computation (C2)
            source.emit(2);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });
            expect(listener).toHaveBeenCalledTimes(2); // success->pending transition

            // finish second computation
            resolvers[1]?.();
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 0 });
            expect(listener).toHaveBeenCalledTimes(3); // pending->success transition
        });

        it("should not notify about aborted outdated computation", async () => {
            //  C1
            //  |   C2
            //  |   |
            //  |   R2
            //  R1
            const source = createFlow(0);
            const resolvers: (() => void)[] = [];

            const flow = new AsyncComputedGeneratorFlow(function* ({ watch, signal }) {
                const value = watch(source);
                yield new Promise<void>((r) => resolvers.push(r));
                signal.throwIfAborted();
                return value;
            });
            const listener = vi.fn();
            flow.subscribe(listener);
            resolvers[0]?.();
            await nextTick();
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 0 });
            expect(listener).toHaveBeenCalledTimes(1); // pending->success transition

            // start first computation (C1)
            source.emit(1);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });
            expect(listener).toHaveBeenCalledTimes(2); // success->pending transition

            // start second computation (C2)
            source.emit(2);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });
            expect(listener).toHaveBeenCalledTimes(3); // no transition, but starts new async computation via getSnapshot()

            // finish second computation
            resolvers[2]?.();
            await nextTick();
            const value1 = flow.getSnapshot();
            expect(value1).toEqual({ status: "success", data: 2 });
            expect(listener).toHaveBeenCalledTimes(4); // pending->success transition

            // finish first computation
            resolvers[1]?.();
            await nextTick();
            const value2 = flow.getSnapshot();
            expect(value2).toEqual({ status: "success", data: 2 });
            expect(value2).toBe(value1);
            expect(listener).toHaveBeenCalledTimes(4); // outdated computation ignored
        });

        it("should allow reading snapshot inside listener", () => {
            const source = createFlow(0);
            const flow = new AsyncComputedGeneratorFlow(function* ({ watch }) {
                return watch(source);
            });
            const spy = vi.fn();

            flow.subscribe(() => {
                spy(flow.getSnapshot());
            });

            expect(flow.getSnapshot()).toEqual({ status: "success", data: 0 });
            expect(spy).toHaveBeenCalledTimes(0);

            source.emit(1);
            expect(flow.getSnapshot()).toEqual({ status: "success", data: 1 });
            expect(spy).toHaveBeenNthCalledWith(1, { status: "success", data: 1 });
            expect(spy).toHaveBeenCalledTimes(1);
        });
    });

    describe("asPromise behavior", () => {
        it("should resolve for success state", async () => {
            const source = createAsyncFlow({ status: "success", data: 2 });
            const flow = new AsyncComputedGeneratorFlow(function* ({ watchAsync: getAsync }) {
                return (yield* getAsync(source)) * 2;
            });

            const promise = await flow.asPromise();
            expect(promise).toBe(4);
        });

        it("should reject for error state", async () => {
            const error = new Error("test");
            const source = createAsyncFlow<number>({ status: "error", error });
            const flow = new AsyncComputedGeneratorFlow(function* ({ watchAsync: getAsync }) {
                yield* getAsync(source);
            });

            const promise = flow.asPromise();
            await expect(promise).rejects.toBe(error);
        });

        it("should wait for pending state to resolve", async () => {
            const source = createFlow("initial");
            const resolvers: (() => void)[] = [];
            const flow = new AsyncComputedGeneratorFlow(function* ({ watch }) {
                const value = watch(source);
                yield new Promise<void>((r) => resolvers.push(r));
                return value;
            });

            flow.getSnapshot();
            resolvers[0]?.();
            await expect(flow.asPromise()).resolves.toBe("initial");

            source.emit("resolved");

            const promise = flow.asPromise();
            const status = await Promise.race([promise, Promise.resolve("pending")]);
            expect(status).toBe("pending");

            resolvers[1]?.();
            await nextTick();
            const status2 = await Promise.race([promise, Promise.resolve("pending")]);
            expect(status2).toBe("resolved");
        });

        it("should return same promise during getter execution", async () => {
            const source = createAsyncFlow({ status: "success", data: 2 });
            const flow = new AsyncComputedGeneratorFlow(function* ({ watchAsync: getAsync }) {
                return (yield* getAsync(source)) * 2;
            });

            const p1 = flow.asPromise();
            const p2 = flow.asPromise();
            expect(p1).toBe(p2);
            await expect(p1).resolves.toBe(4);

            const p3 = flow.asPromise();
            expect(p3).toBe(p2);
        });

        it("should return same promise when cached value exists", async () => {
            const value: AsyncFlowState<number> = { status: "success", data: 2 };
            const source = createAsyncFlow(value);
            const flow = new AsyncComputedGeneratorFlow(function* ({ watchAsync: getAsync }) {
                return (yield* getAsync(source)) * 2;
            });

            await expect(flow.asPromise()).resolves.toBe(4);

            const p1 = flow.asPromise();
            source.emit(value);
            const p2 = flow.asPromise();
            expect(p1).toBe(p2);
        });

        it("should return new promise if sources changed", async () => {
            const source = createAsyncFlow({ status: "success", data: 2 });
            const flow = new AsyncComputedGeneratorFlow(function* ({ watchAsync: getAsync }) {
                return (yield* getAsync(source)) * 2;
            });

            await expect(flow.asPromise()).resolves.toBe(4);

            const p1 = flow.asPromise();
            source.emit({ status: "success", data: 3 });
            const p2 = flow.asPromise();
            expect(p1).not.toBe(p2);
            await expect(p2).resolves.toBe(6);
        });

        it("should return same promise if sources changed during execution", async () => {
            const source = createAsyncFlow({ status: "success", data: 2 });
            const flow = new AsyncComputedGeneratorFlow(function* ({ watchAsync: getAsync }) {
                return (yield* getAsync(source)) * 2;
            });

            const p1 = flow.asPromise();
            source.emit({ status: "success", data: 3 });
            const p2 = flow.asPromise();
            expect(p1).toBe(p2);
            await expect(p1).resolves.toBe(6);
            await expect(p2).resolves.toBe(6);
        });

        it("should ignore outdated computation (first starts, first ends)", async () => {
            //  C1
            //  |   C2
            //  |   |
            //  R1  |
            //      |
            //      R2
            const source = createFlow(0);
            const resolvers: (() => void)[] = [];
            const flow = new AsyncComputedGeneratorFlow(function* ({ watch, signal }) {
                const value = watch(source);
                yield new Promise<void>((r) => resolvers.push(r));
                signal.throwIfAborted();
                return value;
            });

            flow.getSnapshot();
            resolvers[0]?.();
            await expect(flow.asPromise()).resolves.toBe(0);

            // start first computation (C1)
            source.emit(1);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });
            const promise1 = flow.asPromise();

            // start second computation (C2)
            source.emit(2);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });
            const promise2 = flow.asPromise();
            expect(promise2).toBe(promise1);

            // finish first computation
            resolvers[1]?.();
            await nextTick();
            const status = await Promise.race([flow.asPromise(), Promise.resolve("pending")]);
            expect(status).toBe("pending");
            const promise3 = flow.asPromise();
            expect(promise3).toBe(promise1);

            // finish second computation
            resolvers[2]?.();
            await nextTick();
            const status2 = await Promise.race([flow.asPromise(), Promise.resolve("pending")]);
            expect(status2).toBe(2);
            const promise4 = flow.asPromise();
            expect(promise4).toBe(promise1);

            // inspect resolved values
            await expect(promise1).resolves.toBe(2);
            await expect(promise2).resolves.toBe(2);
            await expect(promise3).resolves.toBe(2);
            await expect(promise4).resolves.toBe(2);
        });

        it("should ignore outdated computation (first starts, last ends)", async () => {
            //  C1
            //  |   C2
            //  |   |
            //  |   R2
            //  R1
            const source = createFlow(0);
            const resolvers: (() => void)[] = [];
            const flow = new AsyncComputedGeneratorFlow(function* ({ watch, signal }) {
                const value = watch(source);
                yield new Promise<void>((r) => resolvers.push(r));
                signal.throwIfAborted();
                return value;
            });

            flow.getSnapshot();
            resolvers[0]?.();
            await expect(flow.asPromise()).resolves.toBe(0);

            // start first computation (C1)
            source.emit(1);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });
            const promise1 = flow.asPromise();

            // start second computation (C2)
            source.emit(2);
            expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });
            const promise2 = flow.asPromise();
            expect(promise2).toBe(promise1);

            // finish second computation
            resolvers[2]?.();
            await nextTick();
            const status = await Promise.race([flow.asPromise(), Promise.resolve("pending")]);
            expect(status).toBe(2);
            const promise3 = flow.asPromise();
            expect(promise3).toBe(promise1);

            // inspect resolved values
            await expect(promise1).resolves.toBe(2);
            await expect(promise2).resolves.toBe(2);
            await expect(promise3).resolves.toBe(2);

            // finish first computation
            resolvers[1]?.();
            await nextTick();
            const status2 = await Promise.race([flow.asPromise(), Promise.resolve("pending")]);
            expect(status2).toBe(2);
            const promise4 = flow.asPromise();
            expect(promise4).toBe(promise1);

            // inspect resolved values
            await expect(promise4).resolves.toBe(2);
        });
    });

    describe("custom equality", () => {
        it("should cache with custom result equality check", async () => {
            const id = createFlow("id-1");
            const value = createFlow(0);

            const flow = new AsyncComputedGeneratorFlow(
                function* ({ watch }) {
                    return {
                        id: watch(id),
                        value: watch(value),
                    };
                },
                {
                    equals(a, b) {
                        return a.id === b.id;
                    },
                },
            );

            const v1 = await flow.asPromise();
            expect(v1).toEqual({ id: "id-1", value: 0 });

            value.emit(1);
            const v2 = await flow.asPromise();
            expect(v2).toBe(v1);
            expect(v2).toEqual({ id: "id-1", value: 0 });

            id.emit("id-2");
            const v3 = await flow.asPromise();
            expect(v3).not.toBe(v2);
            expect(v3).toEqual({ id: "id-2", value: 1 });

            value.emit(1);
            const v4 = await flow.asPromise();
            expect(v4).toBe(v3);
            expect(v4).toEqual({ id: "id-2", value: 1 });
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

    describe("AsyncFlow interface", () => {
        afterEach(() => {
            vi.mocked(console.error).mockClear();
        });

        validateAsyncFlowImplementation({
            testRunner: { describe, it },
            createFlow: async () => {
                let i = 0;
                const source = createFlow<Promise<number>>(Promise.resolve(i));

                const flow = new AsyncComputedGeneratorFlow(function* ({ watch }) {
                    const promise = watch(source);
                    let value = -1;
                    yield promise.then((result) => {
                        value = result;
                    });
                    return { value };
                });

                // Read the flow on each change, since computed flow is evaluated lazily,
                // and in tests no one is subscribed to the flow
                flow.subscribe(() => {
                    queueMicrotask(() => {
                        flow.getSnapshot();
                    });
                });

                // Wait for the first computation to complete to avoid the initial pending state in tests
                await flow.asPromise();

                return {
                    flow,
                    startAsyncOperation() {
                        const { promise, resolve, reject } = Promise.withResolvers<number>();
                        const value = ++i;

                        source.emit(promise);

                        // start the actual computation
                        flow.getSnapshot();

                        return {
                            async emitSuccess() {
                                resolve(value);

                                // wait for flow computation
                                await nextTick();

                                return { value };
                            },
                            async emitError() {
                                const error = new Error("test error");
                                reject(error);

                                // wait for flow computation
                                await nextTick();

                                return error;
                            },
                        };
                    },
                };
            },
        });
    });
});

async function nextTick() {
    await new Promise<void>((resolve) => {
        queueMicrotask(resolve);
    });
}

function getSubscriptionsCount(flow: Flow<unknown>): number {
    // @ts-expect-error in tests we use an implementation that allows reading the number of subscriptions
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const subscriptions: Set<unknown> = flow.subscriptions;
    return subscriptions.size;
}
