import { createAsyncFlow } from "@tsip/flow";
import type { AsyncFlow } from "@tsip/types";
import { describe, it, expect, vi, expectTypeOf } from "vitest";
import { mapAsyncFlow } from "./mapAsyncFlow";

describe("mapAsyncFlow", () => {
    it("should infer correct return type", () => {
        const numberAsyncFlow = createAsyncFlow({ status: "success", data: 42 });

        // String mapping
        const stringAsyncFlow = mapAsyncFlow(numberAsyncFlow, (n) => n.toString());
        expectTypeOf(stringAsyncFlow).toEqualTypeOf<AsyncFlow<string>>();

        // Boolean mapping
        const booleanAsyncFlow = mapAsyncFlow(numberAsyncFlow, (n) => n > 0);
        expectTypeOf(booleanAsyncFlow).toEqualTypeOf<AsyncFlow<boolean>>();

        // Object mapping
        const objectAsyncFlow = mapAsyncFlow(numberAsyncFlow, (n) => ({ value: n }));
        expectTypeOf(objectAsyncFlow).toEqualTypeOf<AsyncFlow<{ value: number }>>();

        // Conditional mapping
        const boolToStringAsyncFlow = mapAsyncFlow(numberAsyncFlow, (n) => (n > 5 ? "yes" : "no"));
        expectTypeOf(boolToStringAsyncFlow).toEqualTypeOf<AsyncFlow<"yes" | "no">>();

        // Const assertion mapping
        const constAsyncFlow = mapAsyncFlow(numberAsyncFlow, () => "const" as const);
        expectTypeOf(constAsyncFlow).toEqualTypeOf<AsyncFlow<"const">>();
    });

    it("should map values correctly", async () => {
        const numberAsyncFlow = createAsyncFlow({ status: "success", data: 10 });
        const doubledAsyncFlow = mapAsyncFlow(numberAsyncFlow, (n) => n * 2);

        expect(doubledAsyncFlow.getSnapshot()).toEqual({ status: "pending" });

        await nextTick();
        expect(doubledAsyncFlow.getSnapshot()).toEqual({ status: "success", data: 20 });
    });

    it("should react to source flow changes", async () => {
        const sourceAsyncFlow = createAsyncFlow({ status: "success", data: 5 });
        const mappedAsyncFlow = mapAsyncFlow(sourceAsyncFlow, (n) => n * 3);

        expect(mappedAsyncFlow.getSnapshot()).toEqual({ status: "pending" });

        await nextTick();
        expect(mappedAsyncFlow.getSnapshot()).toEqual({ status: "success", data: 15 });

        sourceAsyncFlow.emit({ status: "success", data: 10 });
        expect(mappedAsyncFlow.getSnapshot()).toEqual({ status: "pending", data: 15 });

        await nextTick();
        expect(mappedAsyncFlow.getSnapshot()).toEqual({ status: "success", data: 30 });
    });

    it("should handle errors in predicate", async () => {
        const error = new Error("test");
        const numberAsyncFlow = createAsyncFlow({ status: "success", data: 10 });
        const doubledAsyncFlow = mapAsyncFlow(numberAsyncFlow, () => {
            throw error;
        });

        expect(doubledAsyncFlow.getSnapshot()).toEqual({ status: "pending" });

        await nextTick();
        expect(doubledAsyncFlow.getSnapshot()).toEqual({ status: "error", error });
    });

    it("should propagate source errors", async () => {
        const error = new Error("source error");
        const numberAsyncFlow = createAsyncFlow<number>({ status: "error", error });
        const mappedAsyncFlow = mapAsyncFlow(numberAsyncFlow, (n) => n * 5);

        expect(mappedAsyncFlow.getSnapshot()).toEqual({ status: "pending" });

        await nextTick();
        expect(mappedAsyncFlow.getSnapshot()).toEqual({ status: "error", error });
    });

    it("should call mapper function with correct arguments", async () => {
        const sourceAsyncFlow = createAsyncFlow({ status: "success", data: "test" });
        const mapper = vi.fn((value: string) => value.toUpperCase());
        const mappedAsyncFlow = mapAsyncFlow(sourceAsyncFlow, mapper);

        expect(mappedAsyncFlow.getSnapshot()).toEqual({ status: "pending" });

        await nextTick();
        expect(mappedAsyncFlow.getSnapshot()).toEqual({ status: "success", data: "TEST" });
        expect(mapper).toHaveBeenCalledWith("test");
        expect(mapper).toHaveBeenCalledTimes(1);
    });

    it("should work with subscription", async () => {
        const sourceAsyncFlow = createAsyncFlow({ status: "success", data: 1 });
        const mappedAsyncFlow = mapAsyncFlow(sourceAsyncFlow, (n) => n * 10);

        const subscriber = vi.fn();
        const subscription = mappedAsyncFlow.subscribe(subscriber);

        await nextTick();
        expect(subscriber).toHaveBeenCalledTimes(1);

        sourceAsyncFlow.emit({ status: "success", data: 2 });
        mappedAsyncFlow.getSnapshot();
        await nextTick();
        expect(subscriber).toHaveBeenCalledTimes(2);

        subscription.unsubscribe();

        sourceAsyncFlow.emit({ status: "success", data: 3 });
        mappedAsyncFlow.getSnapshot();
        await nextTick();
        expect(subscriber).toHaveBeenCalledTimes(2);
    });
});

async function nextTick() {
    await new Promise<void>((resolve) => {
        queueMicrotask(resolve);
    });
}
