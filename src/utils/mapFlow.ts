import type { Flow } from "@tsip/types";
import { computedFlow } from "../sync/factory";

/**
 * Transforms values from a synchronous flow using a mapper function.
 *
 * Creates a new flow that applies the provided mapper function to each value
 * emitted by the source flow. The resulting flow will emit the transformed values.
 *
 * @typeParam T - The type of values emitted by the source flow
 * @typeParam U - The type of values emitted by the resulting flow
 *
 * @param flow - The source flow to transform values from
 * @param mapper - A function that transforms each value from type T to type U
 *
 * @returns A new flow that emits the transformed values
 *
 * @example
 * ```typescript
 * const numberFlow = createFlow(10);
 * const doubledFlow = mapFlow(numberFlow, (n) => n * 2);
 * // doubledFlow.getSnapshot() returns 20
 * ```
 */
export function mapFlow<T, U>(flow: Flow<T>, mapper: (value: T) => U): Flow<U> {
    return computedFlow((ctx) => mapper(ctx.get(flow)));
}
