import type { Flow } from "@tsip/types";
import { computedFlow } from "../sync/factory";

/**
 * Filters values from a synchronous flow using a predicate function.
 *
 * Creates a new flow that only emits values from the source flow that satisfy
 * the provided predicate function. Values that don't pass the predicate are
 * skipped and won't be emitted by the resulting flow.
 *
 * @typeParam T - The type of values emitted by the source flow
 * @typeParam S - The narrowed type when using a type guard predicate
 *
 * @param flow - The source flow to filter values from
 * @param predicate - A function that tests each value. Can be a type guard or boolean predicate
 *
 * @returns A new flow that emits only the values that pass the predicate
 *
 * @example
 * ```typescript
 * const nullableFlow = createFlow<number | null>(42);
 * const numberFlow = filterFlow(nullableFlow, (n) => n !== null);
 * // numberFlow.getSnapshot() returns 42 and has type Flow<number>
 * ```
 */
export function filterFlow<T, S extends T>(flow: Flow<T>, predicate: (value: T) => value is S): Flow<S>;
export function filterFlow<T>(flow: Flow<T>, predicate: (value: T) => unknown): Flow<T>;
export function filterFlow<T>(flow: Flow<T>, predicate: (value: T) => unknown): Flow<T> {
    return computedFlow((ctx) => {
        const value = ctx.get(flow);
        if (!predicate(value)) {
            return ctx.skip();
        }
        return value;
    });
}
