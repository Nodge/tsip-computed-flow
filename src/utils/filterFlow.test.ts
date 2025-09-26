import { createFlow } from "@tsip/flow";
import type { Flow } from "@tsip/types";
import { describe, it, expect, vi, expectTypeOf } from "vitest";
import { filterFlow } from "./filterFlow";

describe("filterFlow", () => {
    it("should infer correct return type with type guard", () => {
        const nullableFlow = createFlow<number | null>(42);
        const numberFlow = filterFlow(nullableFlow, (n) => n !== null);
        expectTypeOf(numberFlow).toEqualTypeOf<Flow<number>>();
    });

    it("should infer correct return type with regular predicate", () => {
        const numberFlow = createFlow(42);
        const filteredFlow = filterFlow(numberFlow, (n) => n > 0);
        expectTypeOf(filteredFlow).toEqualTypeOf<Flow<number>>();
    });

    it("should filter values correctly", () => {
        const numberFlow = createFlow(10);
        const filteredFlow = filterFlow(numberFlow, (n) => n > 5);

        expect(filteredFlow.getSnapshot()).toBe(10);

        numberFlow.emit(3);
        expect(filteredFlow.getSnapshot()).toBe(10);

        numberFlow.emit(7);
        expect(filteredFlow.getSnapshot()).toBe(7);
    });

    it("should call predicate function with correct arguments", () => {
        const sourceFlow = createFlow("test");
        const predicate = vi.fn((value: string) => value.length > 2);
        const filteredFlow = filterFlow(sourceFlow, predicate);

        // Trigger computation
        filteredFlow.getSnapshot();

        expect(predicate).toHaveBeenCalledWith("test");
        expect(predicate).toHaveBeenCalledTimes(1);
    });

    it("should work with subscription", () => {
        const sourceFlow = createFlow(10);
        const filteredFlow = filterFlow(sourceFlow, (n) => n > 5);

        const subscriber = vi.fn();
        const subscription = filteredFlow.subscribe(subscriber);

        sourceFlow.emit(20);
        filteredFlow.getSnapshot();
        expect(subscriber).toHaveBeenCalledTimes(1);

        sourceFlow.emit(1);
        filteredFlow.getSnapshot();
        expect(subscriber).toHaveBeenCalledTimes(2);

        subscription.unsubscribe();

        sourceFlow.emit(40);
        filteredFlow.getSnapshot();
        expect(subscriber).toHaveBeenCalledTimes(2);
    });
});
