import { ComputedFlow } from "./instance";
import type { FlowComputationContext } from "./computation";
import { memoize } from "../lib/memoize";

/**
 * A function that computes flow's value and don't require parameters.
 *
 * @typeParam Data - The type of value returned by the computation
 * @param ctx - The computation context providing access to reactive dependencies
 * @param param - Always undefined for parameterless getters
 * @returns The computed value
 */
export type ComputedFlowGetter<Data> = (ctx: FlowComputationContext, param: undefined) => Data;

/**
 * A function that computes flow's value and require a parameter.
 *
 * @typeParam Data - The type of value returned by the computation
 * @typeParam Param - The type of parameter passed to the computation
 * @param ctx - The computation context providing access to reactive dependencies
 * @param param - The parameter value used in the computation
 * @returns The computed value
 */
export type ComputedFlowGetterWithParam<Data, Param> = (ctx: FlowComputationContext, param: Param) => Data;

/**
 * Configuration options for computed flows.
 *
 * @typeParam Data - The type of value returned by the computation
 * @typeParam Param - The type of parameter passed to the computation (if any)
 */
export interface ComputedFlowOptions<Data, Param> {
    /**
     * The initial value to use when the computation fails with an abort error
     * and no cached value is available.
     */
    initialValue?: Data;

    /**
     * Function to compare computed values to determine if they have changed.
     *
     * This is used to prevent unnecessary updates when the computed value
     * is equivalent to the previous value, even if not strictly equal.
     *
     * @param a - The previous computed value
     * @param b - The new computed value
     * @returns `true` if the values are considered equal, `false` otherwise
     * @default Object.is
     *
     * @example
     * ```typescript
     * // Custom equality for objects
     * equals: (a, b) => deepEqual(a, b)
     * ```
     */
    equals?: (a: Data, b: Data) => boolean;

    /**
     * Function to compare parameters to determine cache key equality.
     *
     * This is used to find existing computed flows in the cache when
     * the same parameter is used multiple times.
     *
     * @param a - The first parameter to compare
     * @param b - The second parameter to compare
     * @returns `true` if the parameters are considered equal, `false` otherwise
     * @default Object.is
     *
     * @example
     * ```typescript
     * // Custom equality for object parameters
     * paramEquals: (a, b) => a.id === b.id
     * ```
     */
    paramEquals?: (a: Param, b: Param) => boolean;
}

/**
 * Creates a computed flow without parameters.
 *
 * @typeParam Data - The type of value returned by the computation
 * @typeParam Param - The parameter type (never for this overload)
 * @param getter - The computation function that produces the value
 * @param options - Optional configuration for the computed flow
 * @returns A computed flow instance
 *
 * @example
 * ```typescript
 * const counter = computedFlow((ctx) => {
 *   return ctx.get(numberFlow) * 2;
 * });
 * ```
 */
export function computedFlow<Data = unknown, Param = never>(
    getter: ComputedFlowGetter<Data>,
    options?: ComputedFlowOptions<Data, Param>,
): ComputedFlow<Data>;

/**
 * Creates a parameterized computed flow factory.
 *
 * @typeParam Data - The type of value returned by the computation
 * @typeParam Param - The type of parameter passed to the computation
 * @param getter - The computation function that takes a parameter and produces value
 * @param options - Optional configuration for the computed flow
 * @returns A function that creates computed flow instances for given parameters
 *
 * @example
 * ```typescript
 * const userProfile = computedFlow((ctx, userId: string) => {
 *   return ctx.get(userFlow(userId));
 * });
 *
 * const johnProfile = userProfile('john123');
 * const janeProfile = userProfile('jane456');
 * ```
 */
export function computedFlow<Data = unknown, Param = never>(
    getter: ComputedFlowGetterWithParam<Data, Param>,
    options?: ComputedFlowOptions<Data, Param>,
): (param: Param) => ComputedFlow<Data>;

/**
 * Creates a computed flow with automatic parameter detection.
 *
 * This is the main implementation that handles both parameterized and
 * non-parameterized computed flows based on the getter function signature.
 *
 * @typeParam Data - The type of value returned by the computation
 * @typeParam Param - The type of parameter (if any)
 * @param getter - The computation function, with or without parameters
 * @param options - Optional configuration for the computed flow
 * @returns Either a computed flow instance or a factory function
 *
 * @internal This overload is used for implementation and type inference
 */
export function computedFlow<Data = unknown, Param = never>(
    getter: ComputedFlowGetter<Data> | ComputedFlowGetterWithParam<Data, Param>,
    options?: ComputedFlowOptions<Data, Param>,
): ComputedFlow<Data> | ((param: Param) => ComputedFlow<Data>) {
    if (hasGetterParam(getter)) {
        // Create a memoized factory for parameterized computed flows
        return memoize(
            (param: Param) => {
                return new ComputedFlow<Data>((ctx) => {
                    return getter(ctx, param);
                }, options);
            },
            {
                equals: options?.paramEquals,
            },
        );
    }

    // Create a single computed flow for non-parameterized getters
    return new ComputedFlow<Data>((ctx) => getter(ctx, undefined), options);
}

/**
 * Type guard to determine if a getter function accepts parameters.
 *
 * This function checks the arity (number of parameters) of the getter
 * function to determine whether it's a parameterized or non-parameterized
 * computed flow getter.
 *
 * @typeParam Data - The type of value returned by the computation
 * @typeParam Param - The type of parameter passed to the computation
 * @param getter - The getter function to check
 * @returns `true` if the getter accepts parameters, `false` otherwise
 */
function hasGetterParam<Data, Param>(
    getter: ComputedFlowGetter<Data> | ComputedFlowGetterWithParam<Data, Param>,
): getter is ComputedFlowGetterWithParam<Data, Param> {
    return getter.length > 1;
}
