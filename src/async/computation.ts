import type { AsyncFlow, AsyncFlowState, Flow } from "@tsip/types";
import { FlowComputationBase } from "../base/computation";

/**
 * Context object provided to async flow computation functions.
 */
export interface AsyncFlowComputationContext {
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
     * Utilities for tracking and awaiting asynchronous flow sources.
     */
    readonly getAsync: {
        /**
         * Asynchronously reads the value from an async flow.
         *
         * This method establishes a dependency relationship between the current computation
         * and the provided async flow, ensuring that changes to the flow will trigger recomputation.
         *
         * @param flow - The async flow to read the value from
         * @returns Promise generator that resolves to the current value of the async flow
         * @throws Will throw an error if the flow is in an error state
         *
         * @example
         * ```typescript
         * const userData = await getAsync(userFlow); // Reads value and creates dependency
         * ```
         */
        <T>(flow: AsyncFlow<T>): PromiseGenerator<T>;

        /**
         * Waits for all async flows to resolve, similar to Promise.all.
         *
         * @param flows - Array of async flows to wait for
         * @returns Promise generator that resolves to an array of all flow values
         * @throws Will throw if any of the flows reject
         */
        all<T extends readonly AsyncFlow<unknown>[] | []>(
            flows: T,
        ): PromiseGenerator<{ -readonly [K in keyof T]: AwaitedFlow<T[K]> }>;

        /**
         * Waits for all async flows to settle, similar to Promise.allSettled.
         *
         * @param flows - Array of async flows to wait for
         * @returns Promise generator that resolves to an array of settled results
         */
        allSettled<T extends readonly AsyncFlow<unknown>[] | []>(
            flows: T,
        ): PromiseGenerator<{ -readonly [K in keyof T]: PromiseSettledResult<AwaitedFlow<T[K]>> }>;

        /**
         * Waits for any async flow to resolve, similar to Promise.any.
         *
         * @param flows - Array of async flows to race
         * @returns Promise generator that resolves to the first successful flow value
         * @throws Will throw if all flows reject
         */
        any<T extends readonly AsyncFlow<unknown>[] | []>(flows: T): PromiseGenerator<AwaitedFlow<T[number]>>;

        /**
         * Races async flows against each other, similar to Promise.race.
         *
         * @param flows - Array of async flows to race
         * @returns Promise generator that resolves to the first settled flow value
         */
        race<T extends readonly AsyncFlow<unknown>[] | []>(flows: T): PromiseGenerator<AwaitedFlow<T[number]>>;
    };

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

    /**
     * Abort signal for canceling the current async computation.
     *
     * This signal will be triggered when the computation is aborted or finalized,
     * allowing async operations to be cancelled gracefully.
     */
    readonly signal: AbortSignal;
}

/**
 * Utility type that extracts the resolved value type from an AsyncFlow.
 */
type AwaitedFlow<T> = T extends AsyncFlow<infer U> ? U : never;

/**
 * A Promise that can also be used as an iterable for generator-based async operations.
 */
type PromiseGenerator<T> = Promise<T> & Iterable<Promise<T>, T, undefined>;

/**
 * Represents a successfully fulfilled promise result.
 */
interface PromiseFulfilledResult<T> {
    status: "fulfilled";
    value: T;
}

/**
 * Represents a rejected promise result.
 */
interface PromiseRejectedResult {
    status: "rejected";
    reason: unknown;
}

/**
 * Union type representing either a fulfilled or rejected promise result.
 */
type PromiseSettledResult<T> = PromiseFulfilledResult<T> | PromiseRejectedResult;

/**
 * Asynchronous flow computation implementation.
 *
 * @typeParam T - The type of value produced by this computation
 */
export class AsyncFlowComputation<T> extends FlowComputationBase<AsyncFlowState<T>, AsyncFlowComputationContext> {
    /**
     * Controller for aborting the async computation when needed.
     */
    protected abortController: AbortController;

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
        const getAsync: AsyncFlowComputationContext["getAsync"] = (flow) => {
            return this.toIterator(this.readAsyncFlow(flow));
        };

        getAsync.all = <T extends readonly AsyncFlow<unknown>[] | []>(flows: T) => {
            const promise = Promise.all(flows.map((flow) => this.readAsyncFlow(flow)));
            return this.toIterator(promise as Promise<{ -readonly [K in keyof T]: AwaitedFlow<T[K]> }>);
        };

        getAsync.allSettled = <T extends readonly AsyncFlow<unknown>[] | []>(flows: T) => {
            const promise = Promise.allSettled(flows.map((flow) => this.readAsyncFlow(flow)));
            return this.toIterator(
                promise as Promise<{ -readonly [K in keyof T]: PromiseSettledResult<AwaitedFlow<T[K]>> }>,
            );
        };

        getAsync.any = <T extends readonly AsyncFlow<unknown>[] | []>(flows: T) => {
            const promise = Promise.any(flows.map((flow) => this.readAsyncFlow(flow)));
            return this.toIterator(promise as Promise<AwaitedFlow<T[number]>>);
        };

        getAsync.race = <T extends readonly AsyncFlow<unknown>[] | []>(flows: T) => {
            const promise = Promise.race(flows.map((flow) => this.readAsyncFlow(flow)));
            return this.toIterator(promise as Promise<AwaitedFlow<T[number]>>);
        };

        return {
            get: (flow) => this.readFlow(flow),
            getAsync,
            skip: () => this.skip(),
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
     * Reads the current value from an async flow and establishes it as a dependency.
     *
     * @typeParam T - The type of value the async flow produces
     * @param flow - The async flow to read from
     * @returns Promise that resolves to the current value of the async flow
     * @throws The flow's error if it's in an error state, or any error that occurs during resolution
     */
    protected async readAsyncFlow<T>(flow: AsyncFlow<T>): Promise<T> {
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
    }

    /**
     * Converts a Promise into a PromiseGenerator that can be used with generator syntax.
     *
     * This method creates a hybrid object that behaves both as a Promise and as an
     * iterable generator, allowing it to be used with async generator functions
     * and yield* expressions.
     *
     * @typeParam T - The type of value the promise resolves to
     * @param promise - The promise to convert
     * @returns A promise generator that can be yielded in generator functions
     */
    private toIterator<T>(promise: Promise<T>): PromiseGenerator<T> {
        return Object.assign(promise, {
            [Symbol.iterator]: function* () {
                let value: { current: T };
                const iteratorPromise = promise.then((data) => {
                    value = { current: data };
                    return data;
                });
                yield iteratorPromise;
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                return value!.current;
            },
        });
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
