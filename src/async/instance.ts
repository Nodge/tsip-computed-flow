import type { AsyncFlow, AsyncFlowState } from "@tsip/types";
import { isAbortError } from "../lib/isAbortError";
import { ComputedFlowBase } from "../base/instance";
import { AsyncFlowComputation } from "./computation";

/**
 * Configuration options for creating an AsyncComputedFlow.
 *
 * @typeParam T - The type of the computed value
 */
export interface AsyncComputedFlowOptions<T> {
    /**
     * The initial value to use when the computation fails with an abort error
     * and no cached value is available.
     */
    initialValue?: AsyncFlowState<T>;

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
    equals?: (a: T, b: T) => boolean;
}

/**
 * Abstract base class for asynchronous computed flows that automatically recalculate their value
 * when their dependencies change.
 *
 * @typeParam T - The type of value this flow computes and emits
 *
 * @example
 * ```typescript
 * const userFlow = new AsyncComputedFlow(
 *   async (ctx) => {
 *     const userId = ctx.watch(userIdFlow);
 *     return await fetchUser(userId);
 *   }
 * );
 *
 * // Get current state
 * const state = userFlow.getSnapshot();
 *
 * // Wait for completion
 * const userData = await userFlow.asPromise();
 * ```
 */
export abstract class AsyncComputedFlowBase<T>
    extends ComputedFlowBase<AsyncFlowState<T>, AsyncFlowComputation<T>>
    implements AsyncFlow<T>
{
    /**
     * Configuration options for this flow instance
     */
    private options: AsyncComputedFlowOptions<T> | undefined;

    /**
     * The currently in-progress computations
     */
    private pendingComputations: AsyncFlowComputation<T>[] = [];

    /**
     * The last fully completed computation, if any
     */
    private lastFinishedComputation: AsyncFlowComputation<T> | null = null;

    /**
     * Generation counter for computations. Used to ignore outdated computations
     * when multiple async operations run concurrently
     */
    private epochCounter = 0;

    /**
     * The generation number of the last computation that completed successfully
     */
    private currentEpoch = 0;

    /**
     * Cached promise returned from the asPromise()
     */
    private promise: Promise<T> | null = null;

    /**
     * Creates a new AsyncComputedFlow instance.
     *
     * @param options - Optional configuration for this computed flow
     */
    public constructor(options?: AsyncComputedFlowOptions<T>) {
        super();
        this.options = options;
    }

    /**
     * Returns a promise that resolves with the data when the async flow reaches a success state,
     * or rejects with the error when the async flow reaches an error state.
     *
     * If the current state is already resolved (success or error), the promise resolves/rejects immediately.
     * If the current state is pending, the method subscribes to state changes and waits for resolution.
     *
     * This method triggers computation if needed and returns a promise that represents the final result.
     *
     * @returns A promise that resolves with the data on success, or rejects with the error on failure
     *
     * @example
     * ```typescript
     * const userFlow = new AsyncComputedFlow(async (ctx) => {
     *   const userId = ctx.watch(userIdFlow);
     *   return await fetchUser(userId);
     * });
     *
     * // This will wait for the flow to resolve
     * userFlow.asPromise()
     *   .then(data => console.log('Success:', data))
     *   .catch(error => console.error('Error:', error));
     * ```
     */
    public asPromise(): Promise<T> {
        const initialState = this.getSnapshot();

        this.promise ??= new Promise<T>((resolve, reject) => {
            if (initialState.status === "success") {
                resolve(initialState.data);
                return;
            }

            if (initialState.status === "error") {
                // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Intentionally preserve the original error to avoid transformations that could break user error handling
                reject(initialState.error);
                return;
            }

            const subscription = this.subscribe(() => {
                const state = this.getSnapshot();

                // still loading, wait for the next value
                if (state.status === "pending") {
                    return;
                }

                subscription.unsubscribe();

                if (state.status === "error") {
                    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Intentionally preserve the original error to avoid transformations that could break user error handling
                    reject(state.error);
                    return;
                }

                resolve(state.data);
            });
        });

        return this.promise;
    }

    /**
     * Performs the actual computation of this flow's value.
     *
     * @returns An AsyncFlowComputation containing the computed value or error state
     */
    protected compute(): AsyncFlowComputation<T> {
        this.epochCounter++;
        const computation = new AsyncFlowComputation<T>(this.epochCounter);

        const state: AsyncFlowState<T> = {
            status: "pending",
            data: this.lastFinishedComputation?.getValue().data,
        };
        computation.setValue(state);
        this.onComputationStarted(computation);

        return this.computeAsync(computation);
    }

    /**
     * Abstract method that subclasses must implement to perform the actual async computation.
     *
     * @param computation - The computation context to use for the async operation
     * @returns An AsyncFlowComputation containing the computed value or error state
     */
    protected abstract computeAsync(computation: AsyncFlowComputation<T>): AsyncFlowComputation<T>;

    /**
     * Handles the start of a new computation.
     *
     * @param computation - The newly started computation
     */
    protected onComputationStarted(computation: AsyncFlowComputation<T>): void {
        this.pendingComputations.at(-1)?.abort();
        this.pendingComputations.push(computation);

        if (this.cachedComputation && this.promise && this.cachedComputation.getValue().status !== "pending") {
            this.promise = null;
        }
    }

    /**
     * Handles the completion of a computation.
     *
     * @param computation - The computation that has finished
     */
    protected onComputationFinished(computation: AsyncFlowComputation<T>): void {
        computation.finalize();
        this.removePending(computation);

        const isOutdated = this.currentEpoch > computation.epoch;
        if (isOutdated) {
            return;
        }

        this.currentEpoch = computation.epoch;
        this.lastFinishedComputation = computation;

        // Subscribe to the new list of sources and unsubscribe from previous sources
        super.onComputationFinished(computation);

        // Update data in the pending state of any in-progress computation
        if (this.cachedComputation !== computation && this.cachedComputation?.getValue().status === "pending") {
            this.cachedComputation.setValue({
                status: "pending",
                data: computation.getValue().data,
            });
        }

        // Notify flow consumers about the completion of the async operation
        this.onSourcesChanged();
    }

    /**
     * Handles computation errors and returns the appropriate state.
     *
     * @param computation - The computation that has finished with error
     * @param error - The error that occurred during computation
     * @returns An AsyncFlowComputation containing the computed value or error state
     */
    protected handleComputationError(computation: AsyncFlowComputation<T>, error: unknown): AsyncFlowComputation<T> {
        if (isAbortError(error)) {
            const prevComputation = this.getPreviousComputation(computation);
            if (prevComputation) {
                this.revertComputation(computation, prevComputation);
                return prevComputation;
            }

            const state = this.options?.initialValue ?? {
                status: "error",
                error,
            };
            computation.setValue(state);
        } else {
            computation.setValue({
                status: "error",
                error,
                data: this.lastFinishedComputation?.getValue().data,
            });
        }

        this.onComputationFinished(computation);
        return computation;
    }

    /**
     * Finds the most recent computation to revert to when the current computation is aborted.
     *
     * This method checks two cases:
     * - If there's an in-flight unfinalized computation, revert to it
     * - If there's a previously finished computation, revert to it
     *
     * @param current - The current computation that is being aborted
     * @returns The computation to revert to, or null if none is available
     */
    protected getPreviousComputation(current: AsyncFlowComputation<T>): AsyncFlowComputation<T> | null {
        for (let i = this.pendingComputations.length - 1; i >= 0; i--) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const computation = this.pendingComputations[i]!;
            if (computation !== current) {
                return computation;
            }
        }

        return this.lastFinishedComputation;
    }

    /**
     * Reverts the current computation to a previous target computation.
     *
     * @param current - The computation to revert from
     * @param target - The computation to revert to
     */
    private revertComputation(current: AsyncFlowComputation<T>, target: AsyncFlowComputation<T>) {
        current.finalize();
        this.removePending(current);

        target.updateSourcesValue();
        this.cachedComputation = target;

        const currentStatus = "pending"; // skipped computation always has a 'pending' status
        const targetStatus = target.getValue().status;

        const isOutdated = this.currentEpoch > current.epoch;
        if (currentStatus !== targetStatus && !isOutdated) {
            // Notify flow consumers about the state reversion
            this.onSourcesChanged();
        }
    }

    /**
     * Removes a computation from the pending computations list.
     *
     * @param computation - The computation to remove from the pending list
     */
    private removePending(computation: AsyncFlowComputation<T>): void {
        const index = this.pendingComputations.indexOf(computation);
        if (index > -1) {
            this.pendingComputations.splice(index, 1);
        }
    }

    /**
     * Creates a success state for the given data, optionally reusing the previous state
     * if the data is equal according to the custom equality function.
     *
     * @param data - The successfully computed data
     * @returns An AsyncFlowState with status "success" and the provided data
     */
    protected getSuccessValue(data: T): AsyncFlowState<T> {
        if (this.options?.equals && this.lastFinishedComputation) {
            const lastValue = this.lastFinishedComputation.getValue();
            if (lastValue.status === "success" && this.options.equals(data, lastValue.data)) {
                return lastValue;
            }
        }

        return { status: "success", data };
    }
}
