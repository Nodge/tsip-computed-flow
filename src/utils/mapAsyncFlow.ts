import type { AsyncFlow } from "@tsip/types";
import { asyncComputedFlow } from "../async/factory";

/**
 * Transforms values from an asynchronous flow using a mapper function.
 *
 * Creates a new async flow that applies the provided mapper function to each value
 * emitted by the source async flow. The resulting flow will emit the transformed values.
 * This function waits for the source flow to resolve before applying the transformation.
 *
 * @typeParam T - The type of values emitted by the source async flow
 * @typeParam U - The type of values emitted by the resulting async flow
 *
 * @param flow - The source async flow to transform values from
 * @param mapper - A function that transforms each value from type T to type U
 *
 * @returns A new async flow that emits the transformed values
 *
 * @example
 * ```typescript
 * const numberAsyncFlow = createAsyncFlow({ status: "success", data: 10 });
 * const doubledAsyncFlow = mapAsyncFlow(numberAsyncFlow, (n) => n * 2);
 * // doubledAsyncFlow.getSnapshot() will be { status: "success", data: 20 } after resolution
 * ```
 */
export function mapAsyncFlow<T, U>(flow: AsyncFlow<T>, mapper: (value: T) => U): AsyncFlow<U> {
    return asyncComputedFlow(async (ctx) => mapper(await ctx.getAsync(flow)));
}
