import type { Flow } from "@tsip/types";
import { FlowComputationBase } from "../base/computation";

/**
 * Context object provided to flow computation functions.
 */
export interface FlowComputationContext {
    /**
     * Synchronously reads the current value from a flow.
     *
     * This method establishes a dependency relationship between the current computation
     * and the provided flow, ensuring that changes to the flow will trigger recomputation.
     *
     * @param flow - The flow to read the value from
     * @returns The current value of the flow
     * @throws Will throw an error if the flow is in an error state
     *
     * @example
     * ```typescript
     * const value = get(someFlow); // Reads current value and creates dependency
     * ```
     */
    readonly get: <T>(flow: Flow<T>) => T;

    /**
     * Cancels the current computation and prevents the flow value from being updated.
     *
     * When called, this method aborts the current computation process. The flow will
     * retain its previous value.
     *
     * @returns Never returns - always throws to abort computation
     * @throws Always throws an abort signal to cancel the computation
     *
     * @example
     * ```typescript
     * if (shouldSkipUpdate) {
     *     skip(); // Computation is cancelled, flow value unchanged
     * }
     * ```
     */
    readonly skip: () => never;
}

/**
 * Synchronous flow computation implementation.
 *
 * @typeParam T - The type of value produced by this computation
 */
export class FlowComputation<T> extends FlowComputationBase<T> {
    /**
     * Creates and returns a computation contex.
     *
     * @returns A context object
     */
    public getContext(): FlowComputationContext {
        return {
            get: (flow) => {
                // Register the flow as a dependency
                this.addSource(flow);

                try {
                    const value = flow.getSnapshot();
                    // Store the successful value for dependency tracking
                    this.setSourceValue(flow, value);
                    return value;
                } catch (err) {
                    // Store the error for dependency tracking
                    this.setSourceError(flow, err);
                    // Re-throw to maintain error propagation
                    throw err;
                }
            },
            skip() {
                // Throw an abort signal to cancel the current computation
                throw AbortSignal.abort().reason;
            },
        };
    }
}
