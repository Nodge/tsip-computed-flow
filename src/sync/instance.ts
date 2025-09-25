import type { Flow } from "@tsip/types";
import { FlowComputation, type FlowComputationContext } from "./computation";
import { ComputedFlowBase } from "../base/instance";
import { isAbortError } from "../lib/isAbortError";

/**
 * A function that computes the value for a ComputedFlow.
 *
 * This function receives a computation context that can be used to track
 * dependencies and is called whenever the computed value needs to be recalculated.
 *
 * @typeParam T - The type of value this getter function returns
 * @param ctx - The computation context used for dependency tracking
 * @returns The computed value of type T
 */
export type ComputedFlowGetter<T> = (ctx: FlowComputationContext) => T;

/**
 * Configuration options for creating a ComputedFlow.
 *
 * @typeParam T - The type of the computed value
 */
export interface ComputedFlowOptions<T> {
    /**
     * The initial value to use when the computation fails with an abort error
     * and no cached value is available.
     */
    initialValue?: T;

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
    equals?: (a: T, b: T) => boolean; // TODO: implement
}

/**
 * A synchronous computed flow that automatically recalculates its value
 * when its dependencies change.
 *
 * @typeParam T - The type of value this flow computes and emits
 *
 * @example
 * ```typescript
 * const counter = createFlow(0);
 * const doubled = new ComputedFlow(ctx => {
 *   return ctx.get(counter) * 2;
 * });
 *
 * console.log(doubled.getSnapshot()); // 0
 * counter.emit(5);
 * console.log(doubled.getSnapshot()); // 10
 * ```
 */
export class ComputedFlow<T> extends ComputedFlowBase<T, FlowComputation<T>> implements Flow<T> {
    /**
     * The function that computes this flow's value.
     */
    private getter: ComputedFlowGetter<T>;

    /**
     * Configuration options for this flow instance
     */
    private options: ComputedFlowOptions<T> | undefined;

    /**
     * Creates a new ComputedFlow instance.
     *
     * @param getter - The function that computes the flow's value
     * @param options - Optional configuration for this computed flow
     */
    public constructor(getter: ComputedFlowGetter<T>, options?: ComputedFlowOptions<T>) {
        super();
        this.getter = getter;
        this.options = options;
    }

    /**
     * Performs the actual computation of this flow's value.
     *
     * @returns A FlowComputation containing the computed value or error state
     */
    protected compute(): FlowComputation<T> {
        const computation = new FlowComputation<T>();
        try {
            const value = this.getter(computation.getContext());
            computation.setValue(value);
        } catch (err) {
            if (isAbortError(err)) {
                // If computation was aborted, try to use cached value first
                if (this.cachedComputation) {
                    return this.cachedComputation;
                }

                // If no cache available, use initial value if provided
                if (hasInitialValue(this.options)) {
                    computation.setValue(this.options.initialValue);
                } else {
                    computation.setError(err);
                }
            } else {
                // For non-abort errors, always set error state
                computation.setError(err);
            }
        } finally {
            computation.finalize();
        }
        this.onComputationFinished(computation);
        return computation;
    }
}

/**
 * Type guard function that checks if the options object contains an initialValue property.
 *
 * @typeParam T - The type of the value
 * @param options - The options object to check
 * @returns `true` if options exists and has an initialValue property, `false` otherwise
 */
function hasInitialValue<T>(options: ComputedFlowOptions<T> | undefined): options is { initialValue: T } {
    if (!options) return false;
    return Object.hasOwn(options, "initialValue");
}
