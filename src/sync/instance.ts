import type { Flow, FlowSubscription } from "@tsip/types";
import { FlowComputation, type FlowComputationContext } from "./computation";
import { ComputedFlowBase } from "../base/instance";
import { isAbortError } from "../lib/isAbortError";

/**
 * Internal subscription object that extends the public FlowSubscription interface.
 *
 * This interface is used internally by MutableFlowImpl to store both the public
 * unsubscribe method and the private listener function for each subscription.
 *
 * @internal
 */
export interface Subscription extends FlowSubscription {
    /**
     * The listener function that will be called when the flow's value changes.
     */
    listener: () => void;
}

export type ComputedFlowGetter<T> = (ctx: FlowComputationContext) => T;

export interface ComputedFlowOptions<T> {
    initialValue: T;
}

export class ComputedFlow<T> extends ComputedFlowBase<T> implements Flow<T> {
    private getter: ComputedFlowGetter<T>;
    private options: ComputedFlowOptions<T> | undefined;

    /**
     * Creates a new ComputedFlow instance.
     *
     * @param getter
     */
    public constructor(getter: ComputedFlowGetter<T>, options?: ComputedFlowOptions<T>) {
        super();
        this.getter = getter;
        this.options = options;
    }

    protected compute() {
        const computation = new FlowComputation<T>();
        try {
            const value = this.getter(computation.getContext());
            computation.setValue(value);
        } catch (err) {
            if (isAbortError(err)) {
                if (this.cachedComputation) {
                    return this.cachedComputation;
                }

                if (this.options) {
                    computation.setValue(this.options.initialValue);
                } else {
                    computation.setError(err);
                }
            } else {
                computation.setError(err);
            }
        }
        computation.finalize();
        this.onComputationFinished(computation);
        return computation;
    }
}
