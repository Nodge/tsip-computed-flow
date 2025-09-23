import type { AsyncFlow, AsyncFlowState } from "@tsip/types";
import { FlowComputation, type FlowComputationContext } from "../sync/computation";

/**
 * Context object provided to async flow computation functions.
 */
export interface AsyncFlowComputationContext extends FlowComputationContext {
    /**
     * Asynchronously reads the value from an async flow.
     *
     * This method establishes a dependency relationship between the current computation
     * and the provided async flow, ensuring that changes to the flow will trigger recomputation.
     *
     * @param flow - The async flow to read the value from
     * @returns Promise that resolves to the current value of the async flow
     * @throws Will throw an error if the flow is in an error state
     *
     * @example
     * ```typescript
     * const userData = await getAsync(userFlow); // Reads value and creates dependency
     * ```
     */
    readonly getAsync: <T>(flow: AsyncFlow<T>) => Promise<T>;

    /**
     * Abort signal for canceling the current async computation.
     *
     * This signal will be triggered when the computation is aborted or finalized,
     * allowing async operations to be cancelled gracefully.
     */
    readonly signal: AbortSignal;
}

/**
 * Asynchronous flow computation implementation.
 *
 * @typeParam T - The type of value produced by this computation
 */
export class AsyncFlowComputation<T> extends FlowComputation<AsyncFlowState<T>> {
    /**
     * Controller for aborting the async computation when needed.
     */
    private abortController: AbortController;

    /**
     * Promise resolvers for the computation result, created lazily when needed.
     */
    private promise: PromiseWithResolvers<T> | null;

    /**
     * The epoch number for this computation, used for tracking computation generations.
     */
    public readonly epoch: number;

    /**
     * Creates a new AsyncFlowComputation instance.
     *
     * @param epoch - The epoch number for this computation
     */
    public constructor(epoch: number) {
        super();
        this.abortController = new AbortController();
        this.promise = null;
        this.epoch = epoch;
    }

    /**
     * Creates and returns a computation context.
     *
     * @returns A context object
     */
    public getContext(): AsyncFlowComputationContext {
        return {
            ...super.getContext(),
            getAsync: async (flow) => {
                this.addSource(flow);
                try {
                    const snapshot = flow.getSnapshot();
                    if (snapshot.status === "error") {
                        throw snapshot.error;
                    }

                    this.setSourceValue(flow, snapshot);
                    if (snapshot.status === "success") {
                        return snapshot.data;
                    }

                    const data = await flow.asPromise();
                    this.setSourceValue(flow, flow.getSnapshot());
                    return data;
                } catch (err) {
                    this.setSourceValue(flow, flow.getSnapshot());
                    throw err;
                }
            },
            signal: this.abortController.signal,
        };
    }

    /**
     * Finalizes the computation and aborts any ongoing operations.
     * This method signals the completion of the getter function execution.
     */
    public finalize() {
        super.finalize();
        this.abortController.abort();

        if (this.promise) {
            this.resolvePromise(this.promise);
        }
    }

    /**
     * Aborts the computation by triggering the abort controller.
     */
    public abort() {
        this.abortController.abort();
    }

    /**
     * Resolves the internal promise with the current computation result.
     *
     * @param promise - The promise resolvers to use for resolution
     */
    private resolvePromise(promise: PromiseWithResolvers<T>) {
        if (this.error) {
            promise.reject(this.error);
            return;
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const value = this.value!.current;
        switch (value.status) {
            case "success":
                promise.resolve(value.data);
                break;
            case "error":
                promise.reject(value.error);
                break;
            default:
                throw new Error("invalid status");
        }
    }

    /**
     * Returns a promise that resolves when the computation completes.
     *
     * @returns Promise that resolves to the computation result
     */
    public getPromise(): Promise<T> {
        if (!this.promise) {
            this.promise = Promise.withResolvers();
            if (this.finalized) {
                this.resolvePromise(this.promise);
            }
        }
        return this.promise.promise;
    }
}
