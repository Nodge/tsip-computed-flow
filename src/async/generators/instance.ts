import type { AsyncFlow } from "@tsip/types";
import { isPromiseLike } from "../../lib/isPromiseLike";
import { AsyncComputedFlowBase, type AsyncComputedFlowOptions } from "../instance";
import type { AsyncFlowComputation, AsyncFlowComputationContext } from "../computation";
import { tracker } from "../../lib/tracker";

/**
 * A function that computes the value for an AsyncComputedGeneratorFlow.
 *
 * This function receives a computation context that can be used to track
 * dependencies and is called whenever the computed value needs to be recalculated.
 *
 * @typeParam T - The type of value that will be computed and returned
 * @param ctx - The computation context used for dependency tracking
 * @returns A generator that yields promises and returns the computed value of type T
 */
export type AsyncComputedGeneratorFlowGetter<T> = (
    ctx: AsyncFlowComputationContext,
) => Generator<unknown, T, undefined>;

/**
 * An asynchronous computed flow that uses generator functions for async computation.
 *
 * @typeParam T - The type of value this flow computes and emits
 */
export class AsyncComputedGeneratorFlow<T> extends AsyncComputedFlowBase<T> implements AsyncFlow<T> {
    /**
     * The function that computes this flow's value.
     */
    private getter: AsyncComputedGeneratorFlowGetter<T>;

    /**
     * Creates a new AsyncComputedGeneratorFlow instance.
     *
     * @param getter - The generator function that computes the flow's value
     * @param options - Optional configuration for this computed flow
     */
    public constructor(getter: AsyncComputedGeneratorFlowGetter<T>, options?: AsyncComputedFlowOptions<T>) {
        super(options);
        this.getter = getter;
    }

    /**
     * Executes the async computation using the generator-based getter function.
     *
     * @param computation - The computation context for this async operation
     * @returns An AsyncFlowComputation containing the computed value or error state
     */
    protected computeAsync(computation: AsyncFlowComputation<T>) {
        const iter = this.getter(computation.getContext());
        return this.run(iter, computation);
    }

    /**
     * Handles the execution of the generator iterator.
     *
     * This method steps through the generator, awaiting any yielded promises
     * and handling errors appropriately.
     *
     * @param iterator - The generator iterator to execute
     * @param computation - The computation context for this async operation
     * @param assertPromiseResult - Function that checks the result of the previously yielded promise.
     * @returns An AsyncFlowComputation containing the computed value or error state
     */
    private run(
        iterator: Generator<unknown, T, undefined>,
        computation: AsyncFlowComputation<T>,
        assertPromiseResult: (() => void) | null = null,
    ): AsyncFlowComputation<T> {
        tracker.start();
        try {
            let result: IteratorResult<unknown, T> | null = null;
            for (;;) {
                if (result?.done) {
                    computation.setValue({
                        status: "success",
                        data: result.value,
                    });
                    this.onComputationFinished(computation);
                    return computation;
                }

                try {
                    const value = result?.value;
                    if (isPromiseLike(value)) {
                        tracker.stop();
                        value.then(
                            () => {
                                this.run(iterator, computation);
                            },
                            (err: unknown) => {
                                this.run(iterator, computation, () => {
                                    throw err;
                                });
                            },
                        );
                        return computation;
                    }
                    assertPromiseResult?.();
                    assertPromiseResult = null;
                    result = iterator.next();
                } catch (err) {
                    tracker.start();
                    result = iterator.throw(err);
                }
            }
        } catch (error) {
            return this.handleComputationError(computation, error);
        } finally {
            tracker.stop();
        }
    }
}
