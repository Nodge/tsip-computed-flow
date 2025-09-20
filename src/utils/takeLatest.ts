import type { AsyncFlow } from "@tsip/types";
import { computed } from "../computed";

export function takeLatest<T>(flow: AsyncFlow<T>): AsyncFlow<T> {
    return computed(async (ctx) => {
        const value = await ctx.getAsync(flow);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        ctx.signal.throwIfAborted();
        return value;
    });
}
