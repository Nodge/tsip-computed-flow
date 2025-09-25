import type { FlowSubscription } from "@tsip/types";
import type { FlowComputationBase } from "./computation";

/**
 * Internal subscription object that extends the public FlowSubscription interface.
 *
 * This interface is used internally by computed flow implementations to store both the public
 * unsubscribe method and the private listener function for each subscription.
 *
 * @internal
 */
export interface Subscription extends FlowSubscription {
    /**
     * The listener function that will be called when the flow's value changes.
     * @internal
     */
    listener: () => void;
}

/**
 * Abstract base class for computed flows that provides subscription management
 * and value caching functionality.
 *
 * @typeParam T - The type of value this flow produces
 * @typeParam FlowComputation - The type of computation used by this flow
 *
 * @example
 * ```typescript
 * class MyComputedFlow extends ComputedFlowBase<number, MyComputation> {
 *   protected compute(): MyComputation {
 *     return new MyComputation(() => this.calculateValue());
 *   }
 *
 *   private calculateValue(): number {
 *     // Implementation details
 *     return 42;
 *   }
 * }
 * ```
 */
export abstract class ComputedFlowBase<T, FlowComputation extends FlowComputationBase<T, unknown>> {
    /**
     * Reference to the last computation result, used for caching values.
     * This computation is not subscribed to sources and exists only for value caching.
     */
    protected cachedComputation: FlowComputation | null = null;

    /**
     * Reference to the computation that is actively subscribed to source changes.
     * This is maintained as long as there are active subscriptions to this flow,
     * and is cleared when the last subscription is removed.
     */
    protected activeComputation: FlowComputation | null = null;

    /**
     * Indicates whether there are active subscriptions to this computed flow.
     */
    private hasListeners = false;

    /**
     * Indicates whether the flow's value needs to be recalculated.
     * Set to true when source flows change, reset to false after recomputation.
     */
    private isDirty = true;

    /**
     * Set of listener functions that are called when the value changes.
     */
    private subscriptions: ReadonlySet<Subscription> = new Set<Subscription>();

    /**
     * Subscribes to changes in the flow.
     *
     * The listener function will be called synchronously whenever the flow's value changes.
     * The listener receives no parameters and should use {@link getSnapshot} to access the current value.
     *
     * When the first subscription is added, the flow will start tracking its source dependencies.
     * When the last subscription is removed, the flow will stop tracking sources.
     *
     * @param listener - A callback function that will be invoked on value changes
     * @returns A subscription object that can be used to unsubscribe from changes
     *
     * @example
     * ```typescript
     * const sourceFlow = createFlow(0);
     * const computedFlow = computed((ctx) => ctx.get(sourceFlow) * 2);
     *
     * const subscription = computedFlow.subscribe(() => {
     *   console.log('New value:', computedFlow.getSnapshot());
     * });
     *
     * sourceFlow.emit(1); // Triggers the listener
     * subscription.unsubscribe(); // Stop listening to changes
     * ```
     */
    public subscribe(listener: () => void): FlowSubscription {
        const subscription: Subscription = {
            listener,
            unsubscribe: () => {
                const subscriptions = new Set(this.subscriptions);
                subscriptions.delete(subscription);
                this.subscriptions = subscriptions;

                // Stop listening to sources when the last subscriber is removed
                if (this.subscriptions.size === 0 && this.activeComputation) {
                    this.hasListeners = false;
                    this.activeComputation.dispose();
                    this.activeComputation = null;
                }
            },
        };

        if (!this.hasListeners) {
            this.hasListeners = true;

            // If there were no previous subscribers, we weren't tracking flow sources
            // We need to run computation to determine the current list of sources to subscribe to
            try {
                this.getSnapshot();
            } catch {
                // The error will be delivered via getSnapshot call by flow's consumer
            }
        }

        const subscriptions = new Set(this.subscriptions);
        subscriptions.add(subscription);
        this.subscriptions = subscriptions;

        return subscription;
    }

    /**
     * Returns the current value of the flow.
     *
     * This method provides synchronous access to the current value without
     * subscribing to changes. It's safe to call at any time and will always
     * return the most recent value.
     *
     * @returns The current value
     *
     * @example
     * ```typescript
     * const flow = createFlow("initial");
     *
     * console.log(flow.getSnapshot()); // "initial"
     *
     * flow.emit("updated");
     * console.log(flow.getSnapshot()); // "updated"
     * ```
     */
    public getSnapshot(): T {
        if (!this.cachedComputation || this.shouldRecompute()) {
            this.cachedComputation = this.compute();
        }

        this.isDirty = false;
        return this.cachedComputation.getValue();
    }

    /**
     * Determines whether the cached computation needs to be recalculated.
     *
     * @returns true if recomputation is needed, false otherwise
     */
    private shouldRecompute(): boolean {
        // Cases for recalculation:
        // 1. If we're not currently tracking sources, the cached value might be stale,
        //    so we need to check current values in sources (hasListeners flag)
        // 2. If sources have changed since the last run (isDirty flag)
        return (
            (!this.hasListeners || this.isDirty) &&
            (!this.cachedComputation || this.cachedComputation.sourcesHasBeenChanged())
        );
    }

    /**
     * Abstract method for computing the flow's value.
     * Must be implemented by subclasses to define the computation logic.
     *
     * @returns A new computation instance containing the computed value
     */
    protected abstract compute(): FlowComputation;

    /**
     * Called after successful computation to manage source subscriptions.
     * Subscribes to the new list of sources and unsubscribes from previous sources.
     *
     * @param computation - The computation that was just completed
     */
    protected onComputationFinished(computation: FlowComputation) {
        if (this.activeComputation) {
            // Unsubscribe from the previous list of sources
            this.activeComputation.dispose();
            this.activeComputation = null;
        }

        if (this.hasListeners) {
            // Subscribe to the new list of sources
            computation.subscribeToSources(() => {
                // Verify that the notification came from the current list of sources
                if (this.activeComputation === computation) {
                    this.onSourcesChanged();
                }
            });

            this.activeComputation = computation;
        }
    }

    /**
     * Called when source flows change their values.
     */
    protected onSourcesChanged() {
        if (!this.isDirty) {
            this.isDirty = true;
            this.notify();
        }
    }

    /**
     * Notifies all subscribers about changes in the flow's value.
     * @throws {AggregateError} When one or more listeners throw errors
     */
    protected notify(): void {
        const errors: unknown[] = [];

        for (const subscription of this.subscriptions) {
            try {
                subscription.listener();
            } catch (error) {
                errors.push(error);
            }
        }

        if (errors.length > 0) {
            throw new AggregateError(errors, "Failed to call flow listeners");
        }
    }
}
