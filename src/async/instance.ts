import type { AsyncFlow, AsyncFlowState, FlowSubscription } from "@tsip/types";
import { ComputedFlowBase } from "../base/instance";
import { AsyncFlowComputation, type AsyncFlowComputationContext } from "./computation";

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

export type AsyncComputedFlowGetter<Data> = (ctx: AsyncFlowComputationContext) => Promise<Data>;

export class AsyncComputedFlow<Data> extends ComputedFlowBase<AsyncFlowState<Data>> implements AsyncFlow<Data> {
    private getter: AsyncComputedFlowGetter<Data>;

    // cached successfully resolved async value
    // private asyncValue: ValueRef<Data> | null;

    /**
     * Cached promise returned from the getDataSnapshot()
     */
    // private dataPromise: Promise<Data> | null;

    /**
     * Creates a new ComputedFlow instance.
     *
     * @param getter
     */
    public constructor(getter: AsyncComputedFlowGetter<Data>) {
        super();
        this.getter = getter;
    }

    /**
     * Returns a promise that resolves with the data when the async flow reaches a success state,
     * or rejects with the error when the async flow reaches an error state.
     *
     * If the current state is already resolved (success or error), the promise resolves/rejects immediately.
     * If the current state is pending, the method subscribes to state changes and waits for resolution.
     *
     * @returns A promise that resolves with the data on success, or rejects with the error on failure
     *
     * @example
     * ```typescript
     * const asyncFlow = createAsyncFlow<string>({ status: "pending" });
     *
     * // This will wait for the flow to resolve
     * asyncFlow.getDataSnapshot()
     *   .then(data => console.log('Success:', data))
     *   .catch(error => console.error('Error:', error));
     *
     * // Later, emit a success state
     * asyncFlow.emit({ status: "success", data: "Hello World" });
     * ```
     */
    public asPromise(): Promise<Data> {
        // this.dataPromise ??= new Promise<Data>((resolve, reject) => {
        //     const state = this.getSnapshot();
        //     this.assertAsyncState(state);
        //     if (state.status === "success") {
        //         this.dataPromise = null;
        //         resolve(state.data);
        //         return;
        //     }
        //     if (state.status === "error") {
        //         this.dataPromise = null;
        //         // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Intentionally preserve the original error to avoid transformations that could break user error handling
        //         reject(state.error);
        //         return;
        //     }
        //     const subscription = this.subscribe(() => {
        //         const state = this.getSnapshot();
        //         this.assertAsyncState(state);
        //         // still loading, wait for the next value
        //         if (state.status === "pending") {
        //             return;
        //         }
        //         subscription.unsubscribe();
        //         if (state.status === "error") {
        //             this.dataPromise = null;
        //             // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Intentionally preserve the original error to avoid transformations that could break user error handling
        //             reject(state.error);
        //             return;
        //         }
        //         this.dataPromise = null;
        //         resolve(state.data);
        //     });
        // });
        // return this.dataPromise;
        return Promise.resolve(undefined as Data);
    }

    protected compute(): AsyncFlowState<Data> {
        const computation = new AsyncFlowComputation<Data>();

        const state: AsyncFlowState<Data> = {
            status: "pending",
            // todo: когда перетирается lastComputation? нужны тесты
            data: this.lastComputation?.getValue().data,
        };
        computation.setValue(state);

        const promise = this.getter(computation.getContext());
        promise.then(
            (data) => {
                // console.log("RESOLVED", { data });

                const state: AsyncFlowState<Data> = {
                    status: "success",
                    data,
                };
                computation.setValue(state);

                this.onComputationFinished(computation);
                // this.asyncValue = { current: data, execution: computation };
                // this.setState(state as Data, computation);
                // this.notify();
            },
            (error: unknown) => {
                const state: AsyncFlowState<Data> = {
                    status: "error",
                    error,
                    data: this.lastComputation?.getValue().data,
                };
                computation.setValue(state);

                this.onComputationFinished(computation);
                // this.asyncValue = null;
                // this.setState(state as Data, computation);
                // this.notify();
            },
        );

        return state;
    }

    // private onSourcesChanged() {
    //     if (this.isAsyncState(this.value?.current)) {
    //         const isPending = this.value.current.status === "pending";
    //         if (isPending) {
    //             console.log("SKIP_NOTIFY");
    //             // TODO: тут не продолбаем кейс, когда источник поменялся и его в промисе надо вычитать заново, а мы промис покешировали?
    //             // не нужно уведомлять подписчиков, если flow уже был в pending состоянии.
    //             // при изменении источником мы снова переходим в pending состояние, т.е. получается ничего не изменилось
    //             return;
    //         }
    //     }
    // }
}
