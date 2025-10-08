import type { AsyncFlow } from "@tsip/types";
import { asyncComputedFlow } from "../async/factory";

/**
 * Creates an async flow that only emits the result of the latest computation from the source flow.
 *
 * When the source flow emits new values while a previous computation is still pending, the previous
 * computation is cancelled and only the result of the most recently started computation is emitted.
 * The term "latest" refers to the computation that was initiated last, not the one that completes
 * first - this ensures chronological ordering based on when computations begin, preventing race
 * conditions and ensuring that only the most recent result is delivered.
 *
 * @typeParam T - The type of values emitted by the source async flow
 *
 * @param flow - The source async flow to apply the take latest pattern to
 *
 * @returns A new async flow that only emits results from the latest computation
 *
 * @example
 * ```typescript
 * const searchQuery = createFlow('');
 * const searchResults = takeLatest(
 *   asyncComputedFlow(async (ctx) => {
 *     const query = ctx.get(searchQuery);
 *     return await searchAPI(query);
 *   })
 * );
 * ```
 *
 * // Fast typing will cancel previous search computations
 * searchQuery.emit("a");
 * searchQuery.emit("ab");
 * searchQuery.emit("abc");
 * // Only search results for "abc" will be shown
 * ```
 * @see {@link takeLeading} - For ignoring new computations while one is already running
 */
export function takeLatest<T>(flow: AsyncFlow<T>): AsyncFlow<T> {
    return asyncComputedFlow(async (ctx) => {
        const value = await ctx.getAsync(flow);
        ctx.signal.throwIfAborted();
        return value;
    });
}
