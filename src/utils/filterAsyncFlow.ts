import type { AsyncFlow } from "@tsip/types";
import { asyncComputedFlow } from "../async/factory";

/**
 * Filters values from an asynchronous flow using a predicate function.
 *
 * Creates a new async flow that only emits values from the source async flow that satisfy
 * the provided predicate function. Values that don't pass the predicate are skipped and
 * won't be emitted by the resulting flow. This function waits for the source flow to
 * resolve before applying the predicate.
 *
 * @typeParam T - The type of values emitted by the source async flow
 * @typeParam S - The narrowed type when using a type guard predicate
 *
 * @param flow - The source async flow to filter values from
 * @param predicate - A function that tests each value. Can be a type guard or boolean predicate
 *
 * @returns A new async flow that emits only the values that pass the predicate
 *
 * @example
 * ```typescript
 * const nullableFlow = createAsyncFlow<number | null>({ status: "success", data: 42 });
 * const numberAsyncFlow = filterAsyncFlow(nullableFlow, (value) => value !== null);
 * // numberAsyncFlow.getSnapshot() will be { status: "success", data: 42 } and has type AsyncFlow<number>
 * ```
 */
export function filterAsyncFlow<T, S extends T>(flow: AsyncFlow<T>, predicate: (value: T) => value is S): AsyncFlow<S>;
export function filterAsyncFlow<T>(flow: AsyncFlow<T>, predicate: (value: T) => unknown): AsyncFlow<T>;
export function filterAsyncFlow<T>(flow: AsyncFlow<T>, predicate: (value: T) => unknown): AsyncFlow<T> {
    return asyncComputedFlow(async (ctx) => {
        const value = await ctx.watchAsync(flow);
        if (!predicate(value)) {
            return ctx.skip();
        }
        return value;
    });
}
