import { createFlow } from "@tsip/flow";
import { describe, it, expect, vi } from "vitest";
import { takeLeading } from "./takeLeading";
import { asyncComputedFlow } from "../async/factory";

describe.skip("takeLeading", () => {
    it("should handle concurrent computations (first starts, first ends)", async () => {
        //  C1
        //  |   C2
        //  |   |
        //  R1  |
        //      R2
        const source = createFlow(0);
        const resolvers: (() => void)[] = [];

        const flow = takeLeading(
            asyncComputedFlow(async ({ get }) => {
                const value = get(source);
                await new Promise<void>((r) => resolvers.push(r));
                return value;
            }),
        );
        const listener = vi.fn();

        flow.subscribe(listener);
        expect(listener).toHaveBeenCalledTimes(0);
        expect(flow.getSnapshot()).toEqual({ status: "pending" });

        resolvers[0]?.();
        await nextTick();
        expect(flow.getSnapshot()).toEqual({ status: "success", data: 0 });
        expect(listener).toHaveBeenCalledTimes(1); // pending->success transition

        // start first computation (C1)
        console.log("EMIT 1");
        source.emit(1);
        expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });
        expect(listener).toHaveBeenCalledTimes(2); // success->pending transition

        // start second computation (C2)
        console.log("EMIT 2");
        source.emit(2);
        expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });
        expect(listener).toHaveBeenCalledTimes(2); // skipped

        // finish first computation
        console.log("FINISH 1");
        resolvers[1]?.();
        await nextTick();
        expect(flow.getSnapshot()).toEqual({ status: "pending", data: 1 });
        expect(listener).toHaveBeenCalledTimes(3); // pending->success transition

        // // finish second computation
        // console.log("FINISH 2");
        // resolvers[2]?.();
        // await nextTick();
        // expect(flow.getSnapshot()).toEqual({ status: "pending", data: 1 });
        // expect(listener).toHaveBeenCalledTimes(3); // skipped

        // await nextTick();
        // expect(flow.getSnapshot()).toEqual({ status: "success", data: 2 });
    });

    it("should handle concurrent computations (first starts, last ends)", async () => {
        //  C1
        //  |   C2
        //  |   |
        //  |   R2
        //  R1
        const source = createFlow(0);
        const resolvers: (() => void)[] = [];

        const flow = takeLeading(
            asyncComputedFlow(async ({ get }) => {
                const value = get(source);
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
        expect(flow.getSnapshot()).toEqual({ status: "pending", data: 0 });

        // finish first computation
        resolvers[1]?.();
        await nextTick();
        await nextTick();
        // expect(flow.getSnapshot()).toEqual({ status: "success", data: 1 });
    });
});

async function nextTick() {
    await new Promise<void>((resolve) => {
        queueMicrotask(resolve);
    });
}
