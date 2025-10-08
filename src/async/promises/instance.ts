import type { AsyncFlow } from "@tsip/types";
import { AsyncComputedFlowBase, type AsyncComputedFlowOptions } from "../instance";
import type { AsyncFlowComputation, AsyncFlowComputationContext } from "../computation";
import { tracker } from "../../lib/tracker";

/**
 * A function that computes the value for an AsyncComputedPromiseFlow.
 *
 * This function receives a computation context that can be used to track
 * dependencies and is called whenever the computed value needs to be recalculated.
 *
 * @typeParam T - The type of value that will be computed and returned
 * @param ctx - The computation context used for dependency tracking
 * @returns A promise that resolves to the computed value of type T
 */
export type AsyncComputedPromiseFlowGetter<T> = (ctx: AsyncFlowComputationContext) => Promise<T>;

/**
 * An asynchronous computed flow that uses promises for async computation.
 *
 * @typeParam T - The type of value this flow computes and emits
 */
export class AsyncComputedPromiseFlow<T> extends AsyncComputedFlowBase<T> implements AsyncFlow<T> {
    /**
     * The function that computes this flow's value.
     */
    private getter: AsyncComputedPromiseFlowGetter<T>;

    /**
     * Creates a new AsyncComputedPromiseFlow instance.
     *
     * @param getter - The async function that computes the flow's value
     * @param options - Optional configuration for this computed flow
     */
    public constructor(getter: AsyncComputedPromiseFlowGetter<T>, options?: AsyncComputedFlowOptions<T>) {
        super(options);
        this.getter = getter;
    }

    /**
     * Executes the async computation using the promise-based getter function.
     *
     * @param computation - The computation context for this async operation
     * @returns An AsyncFlowComputation containing the computed value or error state
     */
    protected computeAsync(computation: AsyncFlowComputation<T>) {
        tracker.start();
        try {
            this.getter(computation.getContext()).then(
                (data) => {
                    computation.setValue(this.getSuccessValue(data));
                    this.onComputationFinished(computation);
                },
                (error: unknown) => {
                    this.handleComputationError(computation, error);
                },
            );
            return computation;
        } catch (err) {
            return this.handleComputationError(computation, err);
        } finally {
            // todo: finalize here to stop adding new sources
            tracker.stop();
        }
    }
}
