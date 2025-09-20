import type { AsyncFlow } from "@tsip/types";
import { computed } from "../computed";

export function takeLeading<T>(flow: AsyncFlow<T>): AsyncFlow<T> {
    let isLoading = false;

    return computed(async (ctx) => {
        if (isLoading) {
            ctx.skip();
        }

        isLoading = true;
        const value = await ctx.getAsync(flow);
        isLoading = false;

        return value;
    });
}
