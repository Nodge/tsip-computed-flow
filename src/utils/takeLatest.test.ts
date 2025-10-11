import { createFlow } from "@tsip/flow";
import { describe, it, expect } from "vitest";
import { takeLatest } from "./takeLatest";
import { asyncComputedFlow } from "../async/factory";

describe("takeLatest", () => {
    it("should handle concurrent computations (first starts, first ends)", async () => {
        //  C1
        //  |   C2
        //  |   |
        //  R1  |
        //      R2
        const source = createFlow(0);
        const resolvers: (() => void)[] = [];

        const flow = takeLatest(
            asyncComputedFlow(async ({ watch }) => {
                const value = watch(source);
                await new Promise<void>((r) => resolvers.push(r));
                return value;
            }),
        );
        expect(flow.getSnapshot()).toEqual({ status: "pending" });
        resolvers[0]?.();
        await nextTick();
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
        await nextTick();
        expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });

        // finish second computation
        resolvers[2]?.();
        await nextTick();
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

        const flow = takeLatest(
            asyncComputedFlow(async ({ watch }) => {
                const value = watch(source);
                await new Promise<void>((r) => resolvers.push(r));
                return value;
            }),
        );
        expect(flow.getSnapshot()).toEqual({ status: "pending" });
        resolvers[0]?.();
        await nextTick();
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
        await nextTick();
        const value1 = flow.getSnapshot();
        expect(value1).toEqual({ status: "success", data: 2 });

        // finish first computation
        resolvers[1]?.();
        await nextTick();
        await nextTick();
        const value2 = flow.getSnapshot();
        expect(value2).toEqual({ status: "success", data: 2 });
        expect(value2).toBe(value1);
    });
});

async function nextTick() {
    await new Promise<void>((resolve) => {
        queueMicrotask(resolve);
    });
}
