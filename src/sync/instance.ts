import type { Flow, FlowSubscription } from "@tsip/types";
import { FlowComputation, type FlowComputationContext } from "./computation";
import { ComputedFlowBase } from "../base/instance";

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

export class ComputedFlow<T> extends ComputedFlowBase<T> implements Flow<T> {
    private getter: ComputedFlowGetter<T>;

    /**
     * Creates a new ComputedFlow instance.
     *
     * @param getter
     */
    public constructor(getter: ComputedFlowGetter<T>) {
        super();
        this.getter = getter;
    }

    protected compute(): T {
        const computation = new FlowComputation<T>();
        const value = this.getter(computation.getContext());
        computation.setValue(value);
        this.onComputationFinished(computation);
        return value;
    }
}
