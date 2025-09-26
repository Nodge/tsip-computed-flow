import { createFlow } from "@tsip/flow";
import type { Flow } from "@tsip/types";
import { describe, it, expect, vi, expectTypeOf } from "vitest";
import { mapFlow } from "./mapFlow";

describe("mapFlow", () => {
    it("should infer correct return type", () => {
        const numberFlow = createFlow(42);

        // String mapping
        const stringFlow = mapFlow(numberFlow, (n) => n.toString());
        expectTypeOf(stringFlow).toEqualTypeOf<Flow<string>>();

        // Boolean mapping
        const booleanFlow = mapFlow(numberFlow, (n) => n > 0);
        expectTypeOf(booleanFlow).toEqualTypeOf<Flow<boolean>>();

        // Object mapping
        const objectFlow = mapFlow(numberFlow, (n) => ({ value: n }));
        expectTypeOf(objectFlow).toEqualTypeOf<Flow<{ value: number }>>();

        // Conditional mapping
        const boolToStringFlow = mapFlow(numberFlow, (n) => (n > 5 ? "yes" : "no"));
        expectTypeOf(boolToStringFlow).toEqualTypeOf<Flow<"yes" | "no">>();

        // Const assertion mapping
        const constFlow = mapFlow(numberFlow, () => "const" as const);
        expectTypeOf(constFlow).toEqualTypeOf<Flow<"const">>();
    });

    it("should map values correctly", () => {
        const numberFlow = createFlow(10);
        const doubledFlow = mapFlow(numberFlow, (n) => n * 2);

        expect(doubledFlow.getSnapshot()).toBe(20);
    });

    it("should react to source flow changes", () => {
        const sourceFlow = createFlow(5);
        const mappedFlow = mapFlow(sourceFlow, (n) => n * 3);

        expect(mappedFlow.getSnapshot()).toBe(15);

        sourceFlow.emit(10);
        expect(mappedFlow.getSnapshot()).toBe(30);
    });

    it("should call mapper function with correct arguments", () => {
        const sourceFlow = createFlow("test");
        const mapper = vi.fn((value: string) => value.toUpperCase());
        const mappedFlow = mapFlow(sourceFlow, mapper);

        // Trigger computation
        mappedFlow.getSnapshot();

        expect(mapper).toHaveBeenCalledWith("test");
        expect(mapper).toHaveBeenCalledTimes(1);
    });

    it("should work with subscription", () => {
        const sourceFlow = createFlow(1);
        const mappedFlow = mapFlow(sourceFlow, (n) => n * 10);

        const subscriber = vi.fn();
        const subscription = mappedFlow.subscribe(subscriber);

        sourceFlow.emit(2);
        mappedFlow.getSnapshot();
        expect(subscriber).toHaveBeenCalledTimes(1);

        sourceFlow.emit(3);
        mappedFlow.getSnapshot();
        expect(subscriber).toHaveBeenCalledTimes(2);

        subscription.unsubscribe();

        sourceFlow.emit(4);
        mappedFlow.getSnapshot();
        expect(subscriber).toHaveBeenCalledTimes(2);
    });
});
