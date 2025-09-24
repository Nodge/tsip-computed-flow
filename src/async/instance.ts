import type { AsyncFlow, AsyncFlowState } from "@tsip/types";
import { ComputedFlowBase } from "../base/instance";
import { AsyncFlowComputation, type AsyncFlowComputationContext } from "./computation";
import { tryPromise } from "../lib/tryPromise";
import { isAbortError } from "../lib/isAbortError";

/**
 * A function that computes the value for a AsyncComputedFlow.
 *
 * This function receives a computation context that can be used to track
 * dependencies and is called whenever the computed value needs to be recalculated.
 *
 * @typeParam T - The type of value that will be computed and returned
 * @param ctx - The computation context used for dependency tracking
 * @returns A promise that resolves to the computed value of type T
 */
export type AsyncComputedFlowGetter<T> = (ctx: AsyncFlowComputationContext) => Promise<T>;

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
    equals?: (a: T, b: T) => boolean; // TODO: implement
}

/**
 * A asynchronous computed flow that automatically recalculates its value
 * when its dependencies change.
 *
 * @typeParam T - The type of value this flow computes and emits
 *
 * @example
 * ```typescript
 * const userFlow = new AsyncComputedFlow(
 *   async (ctx) => {
 *     const userId = ctx.get(userIdFlow);
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
export class AsyncComputedFlow<T>
    extends ComputedFlowBase<AsyncFlowState<T>, AsyncFlowComputation<T>>
    implements AsyncFlow<T>
{
    /**
     * The function that computes this flow's value.
     */
    private getter: AsyncComputedFlowGetter<T>;

    /**
     * Configuration options for this flow instance
     */
    private options: AsyncComputedFlowOptions<T> | undefined;

    /**
     * The currently in-progress computation, if any
     */
    private pendingComputation: AsyncFlowComputation<T> | null = null;

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
     * Creates a new AsyncComputedFlow instance.
     *
     * @param getter - The async function that computes the flow's value
     * @param options - Optional configuration for this computed flow.
     */
    public constructor(getter: AsyncComputedFlowGetter<T>, options?: AsyncComputedFlowOptions<T>) {
        super();
        this.getter = getter;
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
     *   const userId = ctx.get(userIdFlow);
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
        // Compute the current value to ensure computation is started
        this.getSnapshot();

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- cachedComputation is guaranteed to exist after getSnapshot()
        return this.cachedComputation!.getPromise();
    }

    /**
     * Performs the actual computation of this flow's value.
     *
     * @returns A AsyncFlowComputation containing the computed value or error state
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

        const promise = tryPromise(() => this.getter(computation.getContext()));
        promise.then(
            (data) => {
                computation.setValue({
                    status: "success",
                    data,
                });
                this.onComputationFinished(computation);
            },
            (error: unknown) => {
                const state = this.handleComputationError(error);
                computation.setValue(state);
                this.onComputationFinished(computation);
            },
        );

        return computation;
    }

    /**
     * Handles computation errors and returns the appropriate state.
     */
    private handleComputationError(error: unknown): AsyncFlowState<T> {
        const lastValue = this.lastFinishedComputation?.getValue();

        if (isAbortError(error)) {
            return (
                lastValue ??
                this.options?.initialValue ?? {
                    status: "error",
                    error,
                }
            );
        }

        return {
            status: "error",
            error,
            data: lastValue?.data,
        };
    }

    /**
     * Handles the start of a new computation.
     *
     * @param computation - The newly started computation
     */
    private onComputationStarted(computation: AsyncFlowComputation<T>): void {
        // This ensures that only the most recent computation continues, preventing race conditions.
        this.pendingComputation?.abort();
        this.pendingComputation = computation;
    }

    /**
     * Handles the completion of a computation.
     *
     * @param computation - The computation that has finished
     */
    protected onComputationFinished(computation: AsyncFlowComputation<T>): void {
        computation.finalize();

        // Ignore outdated computations
        if (this.currentEpoch > computation.epoch) {
            return;
        }

        this.currentEpoch = computation.epoch;
        this.pendingComputation = null;
        this.lastFinishedComputation = computation;

        // Subscribe to the new list of sources and unsubscribe from previous sources
        super.onComputationFinished(computation);

        // Update data in pending state of any in-progress computation
        if (this.cachedComputation !== computation && this.cachedComputation?.getValue().status === "pending") {
            this.cachedComputation.setValue({
                status: "pending",
                data: computation.getValue().data,
            });
        }

        // Notify flow consumers about the completion of the async operation
        this.onSourcesChanged();
    }
}
