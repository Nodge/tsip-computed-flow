import { memoize } from "../lib/memoize";
import type { AsyncFlowState } from "@tsip/types";
import { AsyncComputedPromiseFlow } from "./promises/instance";
import { AsyncComputedGeneratorFlow } from "./generators/instance";
import type { AsyncFlowComputationContext } from "./computation";

/**
 * A function that computes a flow's value and doesn't require parameters.
 *
 * @typeParam Data - The type of value returned by the computation
 * @param ctx - The computation context providing access to reactive dependencies
 * @param param - Always undefined for parameterless getters
 * @returns A promise that resolves to the computed value
 */
export type AsyncComputedPromiseFlowGetter<Data> = (
    ctx: AsyncFlowComputationContext,
    param: undefined,
) => Promise<Data>;

/**
 * A function that computes a flow's value and requires a parameter.
 *
 * @typeParam Data - The type of value returned by the computation
 * @typeParam Param - The type of parameter passed to the computation
 * @param ctx - The computation context providing access to reactive dependencies
 * @param param - The parameter value used in the computation
 * @returns A promise that resolves to the computed value
 */
export type AsyncComputedPromiseFlowGetterWithParam<Data, Param> = (
    ctx: AsyncFlowComputationContext,
    param: Param,
) => Promise<Data>;

/**
 * A generator function that computes a flow's value and doesn't require parameters.
 *
 * @typeParam Data - The type of value returned by the computation
 * @param ctx - The computation context providing access to reactive dependencies
 * @param param - Always undefined for parameterless getters
 * @returns A generator that yields intermediate values and returns the final computed value
 */
export type AsyncComputedGeneratorFlowGetter<Data> = (
    ctx: AsyncFlowComputationContext,
    param: undefined,
) => Generator<unknown, Data, undefined>;

/**
 * A generator function that computes a flow's value and requires a parameter.
 *
 * @typeParam Data - The type of value returned by the computation
 * @typeParam Param - The type of parameter passed to the computation
 * @param ctx - The computation context providing access to reactive dependencies
 * @param param - The parameter value used in the computation
 * @returns A generator that yields intermediate values and returns the final computed value
 */
export type AsyncComputedGeneratorFlowGetterWithParam<Data, Param> = (
    ctx: AsyncFlowComputationContext,
    param: Param,
) => Generator<unknown, Data, undefined>;

/**
 * Union type for all supported getter functions.
 *
 * @typeParam Data - The type of value returned by the computation
 * @typeParam Param - The type of parameter passed to the computation (if any)
 */
export type AsyncComputedFlowGetter<Data, Param> =
    | AsyncComputedPromiseFlowGetter<Data>
    | AsyncComputedPromiseFlowGetterWithParam<Data, Param>
    | AsyncComputedGeneratorFlowGetter<Data>
    | AsyncComputedGeneratorFlowGetterWithParam<Data, Param>;

/**
 * Union type for all supported flow instances.
 *
 * @typeParam Data - The type of value returned by the computation
 */
export type AsyncComputedFlow<Data> = AsyncComputedPromiseFlow<Data> | AsyncComputedGeneratorFlow<Data>;

/**
 * Configuration options for asynchronous computed flows.
 *
 * @typeParam Data - The type of value returned by the computation
 * @typeParam Param - The type of parameter passed to the computation (if any)
 */
export interface AsyncComputedFlowOptions<Data, Param> {
    /**
     * The initial value to use when the computation fails with an abort error
     * and no cached value is available.
     */
    initialValue?: AsyncFlowState<Data>;

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
 * Creates an asynchronous computed flow without parameters.
 *
 * @typeParam Data - The type of value returned by the computation
 * @typeParam Param - The parameter type (never for this overload)
 * @param getter - The computation function that produces the value (async function or generator)
 * @param options - Optional configuration for the computed flow
 * @returns A computed flow instance that can be subscribed to or used as a dependency
 *
 * @example
 * ```typescript
 * // Using an async function
 * const userNameFlow = asyncComputedFlow(async (ctx) => {
 *   const user = await ctx.getAsync(userFlow);
 *   return user.name;
 * });
 *
 * // Using a generator function
 * const userNameFlow = asyncComputedFlow(function* (ctx) {
 *   const user = yield* ctx.getAsync(userFlow);
 *   return user.name;
 * });
 * ```
 */

export function asyncComputedFlow<Data = unknown, Param = never>(
    getter: AsyncComputedPromiseFlowGetter<Data> | AsyncComputedGeneratorFlowGetter<Data>,
    options?: AsyncComputedFlowOptions<Data, Param>,
): AsyncComputedFlow<Data>;

/**
 * Creates a parameterized asynchronous computed flow factory.
 *
 * @typeParam Data - The type of value returned by the computation
 * @typeParam Param - The type of parameter passed to the computation
 * @param getter - The computation function that takes a parameter and produces a value (async function or generator)
 * @param options - Optional configuration for the computed flow, including parameter equality comparison
 * @returns A factory function that creates computed flow instances for given parameters
 *
 * @example
 * ```typescript
 * // Using an async function
 * const userNameFlow = asyncComputedFlow(async (ctx, userId: string) => {
 *   const user = await ctx.getAsync(userFlow(userId));
 *   return user.name;
 * });
 *
 * // Using a generator function
 * const userNameFlow = asyncComputedFlow(function* (ctx, userId: string) {
 *   const user = yield* ctx.getAsync(userFlow(userId));
 *   return user.name;
 * });
 *
 * // Create instances for specific parameters
 * const johnName = userNameFlow('john123');
 * const janeName = userNameFlow('jane456');
 * ```
 */
export function asyncComputedFlow<Data = unknown, Param = never>(
    getter:
        | AsyncComputedPromiseFlowGetterWithParam<Data, Param>
        | AsyncComputedGeneratorFlowGetterWithParam<Data, Param>,
    options?: AsyncComputedFlowOptions<Data, Param>,
): (param: Param) => AsyncComputedFlow<Data>;

/**
 * Creates an asynchronous computed flow.
 *
 * This is the main implementation that handles both parameterized and
 * non-parameterized computed flows, as well as both async functions and generators.
 *
 * @typeParam Data - The type of value returned by the computation
 * @typeParam Param - The type of parameter (if any)
 * @param getter - The computation function, with or without parameters, async function or generator
 * @param options - Optional configuration for the computed flow
 * @returns Either a computed flow instance (for parameterless getters) or a factory function (for parameterized getters)
 *
 * @internal This overload is used for implementation and type inference
 */
export function asyncComputedFlow<Data = unknown, Param = never>(
    getter: AsyncComputedFlowGetter<Data, Param>,
    options?: AsyncComputedFlowOptions<Data, Param>,
): AsyncComputedFlow<Data> | ((param: Param) => AsyncComputedFlow<Data>) {
    if (hasGetterParam(getter)) {
        // Create a memoized factory for parameterized computed flows
        return memoize(
            (param: Param) => {
                if (isGenerator(getter)) {
                    return new AsyncComputedGeneratorFlow<Data>((ctx) => {
                        return getter(ctx, param);
                    }, options);
                } else {
                    return new AsyncComputedPromiseFlow<Data>((ctx) => {
                        return getter(ctx, param);
                    }, options);
                }
            },
            {
                equals: options?.paramEquals,
            },
        );
    }

    // Create a single computed flow for non-parameterized getters
    if (isGenerator(getter)) {
        return new AsyncComputedGeneratorFlow<Data>((ctx) => getter(ctx, undefined), options);
    } else {
        return new AsyncComputedPromiseFlow<Data>((ctx) => getter(ctx, undefined), options);
    }
}

/**
 * Type guard to determine if a getter function accepts parameters.
 *
 * This function checks the arity (number of parameters) of the getter
 * function to determine whether it's a parameterized or non-parameterized
 * computed flow getter. Functions with more than one parameter are considered
 * parameterized (the first parameter is always the context).
 *
 * @typeParam Data - The type of value returned by the computation
 * @typeParam Param - The type of parameter passed to the computation
 * @param getter - The getter function to check
 * @returns `true` if the getter accepts parameters beyond the context, `false` otherwise
 */
function hasGetterParam<Data, Param>(
    getter: AsyncComputedFlowGetter<Data, Param>,
): getter is
    | AsyncComputedPromiseFlowGetterWithParam<Data, Param>
    | AsyncComputedGeneratorFlowGetterWithParam<Data, Param> {
    return getter.length > 1;
}

/**
 * Reference to the GeneratorFunction constructor.
 * It's used to detect whether a function is a generator function.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-function-type
const GeneratorFunction: Function = Object.getPrototypeOf(function* () {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
}).constructor;

/**
 * Type guard to determine if a getter function is a generator function.
 * It uses both instanceof check and constructor name comparison for reliability.
 *
 * @typeParam Data - The type of value returned by the computation
 * @typeParam Param - The type of parameter passed to the computation
 * @param getter - The getter function to check
 * @returns `true` if the getter is a generator function, `false` if it's a regular function
 */
function isGenerator<Data, Param>(
    getter: AsyncComputedFlowGetter<Data, Param>,
): getter is AsyncComputedGeneratorFlowGetter<Data> | AsyncComputedGeneratorFlowGetterWithParam<Data, Param> {
    return getter instanceof GeneratorFunction || getter.constructor.name === "GeneratorFunction";
}
