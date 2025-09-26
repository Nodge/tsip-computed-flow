import { createAsyncFlow } from "@tsip/flow";
import type { AsyncFlow } from "@tsip/types";
import { describe, it, expect, vi, expectTypeOf } from "vitest";
import { filterAsyncFlow } from "./filterAsyncFlow";

describe("filterAsyncFlow", () => {
    it("should infer correct return type with type guard", () => {
        const nullableFlow = createAsyncFlow<number | null>({ status: "success", data: 42 });
        const numberAsyncFlow = filterAsyncFlow(nullableFlow, (value) => value !== null);
        expectTypeOf(numberAsyncFlow).toEqualTypeOf<AsyncFlow<number>>();
    });

    it("should infer correct return type with regular predicate", () => {
        const numberAsyncFlow = createAsyncFlow({ status: "success", data: 42 });
        const filteredAsyncFlow = filterAsyncFlow(numberAsyncFlow, (n) => n > 0);
        expectTypeOf(filteredAsyncFlow).toEqualTypeOf<AsyncFlow<number>>();
    });

    it("should filter values correctly", async () => {
        const numberAsyncFlow = createAsyncFlow({ status: "success", data: 10 });
        const filteredAsyncFlow = filterAsyncFlow(numberAsyncFlow, (n) => n > 5);

        expect(filteredAsyncFlow.getSnapshot()).toEqual({ status: "pending" });

        await nextTick();
        const s1 = filteredAsyncFlow.getSnapshot();
        expect(s1).toEqual({ status: "success", data: 10 });

        numberAsyncFlow.emit({ status: "success", data: 3 });
        expect(filteredAsyncFlow.getSnapshot()).toEqual({ status: "pending", data: 10 });

        await nextTick();
        expect(filteredAsyncFlow.getSnapshot()).toBe(s1);
    });

    it("should handle errors in predicate", async () => {
        const error = new Error("predicate error");
        const numberAsyncFlow = createAsyncFlow({ status: "success", data: 10 });
        const filteredAsyncFlow = filterAsyncFlow(numberAsyncFlow, () => {
            throw error;
        });

        expect(filteredAsyncFlow.getSnapshot()).toEqual({ status: "pending" });

        await nextTick();
        expect(filteredAsyncFlow.getSnapshot()).toEqual({ status: "error", error });
    });

    it("should propagate source errors", async () => {
        const error = new Error("source error");
        const numberAsyncFlow = createAsyncFlow<number>({ status: "error", error });
        const filteredAsyncFlow = filterAsyncFlow(numberAsyncFlow, (n) => n > 5);

        expect(filteredAsyncFlow.getSnapshot()).toEqual({ status: "pending" });

        await nextTick();
        expect(filteredAsyncFlow.getSnapshot()).toEqual({ status: "error", error });
    });

    it("should call predicate function with correct arguments", async () => {
        const sourceAsyncFlow = createAsyncFlow({ status: "success", data: "test" });
        const predicate = vi.fn((value: string) => value.length > 2);
        const filteredAsyncFlow = filterAsyncFlow(sourceAsyncFlow, predicate);

        expect(filteredAsyncFlow.getSnapshot()).toEqual({ status: "pending" });

        await nextTick();
        expect(filteredAsyncFlow.getSnapshot()).toEqual({ status: "success", data: "test" });
        expect(predicate).toHaveBeenCalledWith("test");
        expect(predicate).toHaveBeenCalledTimes(1);
    });

    it("should work with subscription", async () => {
        const sourceAsyncFlow = createAsyncFlow({ status: "success", data: 10 });
        const filteredAsyncFlow = filterAsyncFlow(sourceAsyncFlow, (n) => n > 5);

        const subscriber = vi.fn();
        const subscription = filteredAsyncFlow.subscribe(subscriber);

        await nextTick();
        expect(subscriber).toHaveBeenCalledTimes(1);

        sourceAsyncFlow.emit({ status: "success", data: 20 });
        filteredAsyncFlow.getSnapshot();
        await nextTick();
        expect(subscriber).toHaveBeenCalledTimes(2);

        sourceAsyncFlow.emit({ status: "success", data: 1 });
        filteredAsyncFlow.getSnapshot();
        await nextTick();
        expect(subscriber).toHaveBeenCalledTimes(3);

        subscription.unsubscribe();

        sourceAsyncFlow.emit({ status: "success", data: 30 });
        filteredAsyncFlow.getSnapshot();
        await nextTick();
        expect(subscriber).toHaveBeenCalledTimes(3);
    });
});

async function nextTick() {
    await new Promise<void>((resolve) => {
        queueMicrotask(resolve);
    });
}
