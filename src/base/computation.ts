import type { Flow, FlowSubscription } from "@tsip/types";

/**
 * Represents a cached value from a flow, which can be either successful or an error.
 * @internal
 */
type SourceCachedValue = { type: "success"; value: unknown } | { type: "error"; error: unknown };

/**
 * Abstract base class for flow computations that manages dependencies,
 * subscriptions, and cached values.
 *
 * @typeParam T - The type of value this computation produces
 * @typeParam C - The type of context for computation function
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export abstract class FlowComputationBase<T, C> {
    /** Set of flows that this computation depends on */
    private sources = new Set<Flow<unknown>>();

    /** Cache of the last known values from each source */
    private lastValues = new Map<Flow<unknown>, SourceCachedValue>();

    /** Active subscriptions to sources */
    private subscriptions: FlowSubscription[] = [];

    /** Whether the computation has been finalized (no more sources can be added) */
    protected finalized = false;

    /** The current computed value, wrapped in an object for handling undefined values */
    protected value: { current: T } | null = null;

    /** The current error, if any */
    protected error: unknown;

    /**
     * Sets the computed value and clears any error state.
     *
     * @param value - The value to set as the current computation result
     */
    public setValue(value: T): void {
        this.value = { current: value };
        this.error = undefined;
    }

    /**
     * Sets an error and clears any current value.
     *
     * @param error - The error that occurred during computation
     */
    public setError(error: unknown): void {
        this.value = null;
        this.error = error;
    }

    /**
     * Gets the current computed value.
     *
     * @returns The current value
     * @throws The stored error if the computation is in an error state
     */
    public getValue(): T {
        if (this.error) {
            // eslint-disable-next-line @typescript-eslint/only-throw-error
            throw this.error;
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- the value must exist at this point
        return this.value!.current;
    }

    /**
     * Adds a flow as a dependency for this computation.
     *
     * Flows added after finalization are ignored to prevent
     * inconsistent dependency tracking.
     *
     * @param flow - The flow to add as a source dependency
     */
    protected addSource(flow: Flow<unknown>): void {
        if (this.finalized) {
            return;
        }
        this.sources.add(flow);
    }

    /**
     * Caches a successful value from a flow.
     *
     * @param flow - The source flow
     * @param value - The value to cache
     */
    protected setSourceValue(flow: Flow<unknown>, value: unknown): void {
        this.lastValues.set(flow, { type: "success", value });
    }

    /**
     * Caches an error from a flow.
     *
     * @param flow - The source flow
     * @param error - The error to cache
     */
    protected setSourceError(flow: Flow<unknown>, error: unknown): void {
        this.lastValues.set(flow, { type: "error", error });
    }

    /**
     * Subscribes to all collected source flows with the provided handler.
     *
     * @param handler - Callback function to execute when sources change
     */
    public subscribeToSources(handler: () => void): void {
        for (const flow of this.sources) {
            const subscription = flow.subscribe(handler);
            this.subscriptions.push(subscription);
        }
    }

    /**
     * Marks the computation as finalized, preventing new sources from being added.
     */
    public finalize(): void {
        this.finalized = true;
    }

    /**
     * Prepares the object for garbage collection by cleaning up subscriptions and references.
     */
    public dispose(): void {
        this.finalize();

        for (const subscription of this.subscriptions) {
            subscription.unsubscribe();
        }
        this.subscriptions.length = 0;

        // NOTE: We don't cleanup this.value and this.lastValues because they continue to be used for change detection
    }

    /**
     * Returns the set of flows collected during the computation.
     *
     * @returns A read-only set of all flows this computation depends on
     */
    public getSources(): ReadonlySet<Flow<unknown>> {
        return this.sources;
    }

    /**
     * Checks if a flow has changed since we last cached its value.
     *
     * @param source - The source flow to check for changes
     * @returns `true` if the source has changed, `false` otherwise
     */
    private hasSourceChanged(source: Flow<unknown>): boolean {
        const lastValue = this.lastValues.get(source);
        if (!lastValue) {
            return true;
        }

        try {
            const currentValue = source.getSnapshot();
            if (lastValue.type === "success") {
                return !Object.is(currentValue, lastValue.value);
            }
        } catch (err) {
            if (lastValue.type === "error") {
                return !Object.is(err, lastValue.error);
            }
        }

        return true;
    }

    /**
     * Checks if any of the source flows have changed since we unsubscribed from them.
     *
     * This method is useful for determining if a computation needs to be re-executed
     * due to changes in its dependencies.
     *
     * @returns `true` if any source has changed, `false` if all sources are unchanged
     */
    public sourcesHasBeenChanged(): boolean {
        for (const source of this.sources) {
            if (this.hasSourceChanged(source)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Creates and returns the computation context for this flow computation.
     *
     * The context typically includes methods for reading flow values and controlling
     * computation execution.
     *
     * @returns The computation context object
     */
    public abstract getContext(): C;

    /**
     * Reads the current value from a flow and establishes it as a dependency.
     *
     * @typeParam T - The type of value the flow produces
     * @param flow - The flow to read from
     * @returns The current value of the flow
     * @throws The flow's error if it's in an error state
     */
    protected readFlow<T>(flow: Flow<T>): T {
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
    }

    /**
     * Cancels the current computation by throwing an abort signal.
     *
     * @returns Never returns - always throws to abort computation
     * @throws Always throws an abort signal to cancel the computation
     */
    protected skip(): never {
        // Throw an abort signal to cancel the current computation
        throw AbortSignal.abort().reason;
    }
}
