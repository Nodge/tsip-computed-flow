import { describe, it, expect, expectTypeOf } from "vitest";
import type { Flow } from "@tsip/types";
import { createFlow } from "@tsip/flow";
import { computedFlow } from "./factory";

describe("ComputedFlow factory", () => {
    describe("without param", () => {
        it("should compute and return value", () => {
            const source = createFlow(2);
            const flow = computedFlow(({ get }) => {
                return get(source) * 2;
            });
            expectTypeOf(flow).toEqualTypeOf<Flow<number>>();
            expect(flow.getSnapshot()).toBe(4);
        });
    });

    describe("with param", () => {
        it("should compute and return value", () => {
            const source = createFlow(2);
            const flow = computedFlow(({ get }, param: number) => {
                return get(source) * param;
            });
            expectTypeOf(flow).toEqualTypeOf<(param: number) => Flow<number>>();
            expect(flow(5).getSnapshot()).toBe(10);
        });
    });

    describe("memoization", () => {
        it("should return the same instance for equal params", () => {
            const source = createFlow(2);
            const flow = computedFlow(({ get }, param: number) => {
                return get(source) * param;
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
                ({ get }, param: { id: number; name: string }) => {
                    return get(source) * param.id;
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
