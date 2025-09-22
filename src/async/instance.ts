import type { AsyncFlow, AsyncFlowState, FlowSubscription } from "@tsip/types";
import { ComputedFlowBase } from "../base/instance";
import { AsyncFlowComputation, type AsyncFlowComputationContext } from "./computation";
import { tryPromise } from "../lib/tryPromise";
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

export type AsyncComputedFlowGetter<Data> = (ctx: AsyncFlowComputationContext) => Promise<Data>;

export interface AsyncComputedFlowOptions<T> {
    initialValue: AsyncFlowState<T>;
}

export class AsyncComputedFlow<T>
    extends ComputedFlowBase<AsyncFlowState<T>, AsyncFlowComputation<T>>
    implements AsyncFlow<T>
{
    private getter: AsyncComputedFlowGetter<T>;
    private options: AsyncComputedFlowOptions<T> | undefined;

    // текущее in-progress вычисление
    private pendingComputation: AsyncFlowComputation<T> | null;

    // последнее полностью завершенное вычисление
    private lastFinishedComputation: AsyncFlowComputation<T> | null;

    // поколение вычислений. Используется для игнорирования устаревших вычислений при конкурентном выполнении
    private epochCounter: number;

    // номер поколения для последнего вычисления, которое выполнено до конца
    private currentEpoch: number;

    /**
     * Creates a new ComputedFlow instance.
     *
     * @param getter
     */
    public constructor(getter: AsyncComputedFlowGetter<T>, options?: AsyncComputedFlowOptions<T>) {
        super();
        this.getter = getter;
        this.options = options;
        this.pendingComputation = null;
        this.lastFinishedComputation = null;
        this.epochCounter = 0;
        this.currentEpoch = 0;
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
    public asPromise(): Promise<T> {
        // вычисляем актуальное значение
        this.getSnapshot();

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.cachedComputation!.getPromise();
    }

    protected compute() {
        console.log("ASYNC COMPUTE START");

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
                console.log("RESOLVED", { data });

                const state: AsyncFlowState<T> = {
                    status: "success",
                    data,
                };
                computation.setValue(state);

                this.onComputationFinished(computation);
            },
            (error: unknown) => {
                console.log("REJECTED", { error });

                let state: AsyncFlowState<T> = {
                    status: "error",
                    error,
                };

                if (isAbortError(error)) {
                    if (this.lastFinishedComputation) {
                        console.log("CACHED COMPUTATION", this.lastFinishedComputation);
                        state = this.lastFinishedComputation.getValue();
                    } else if (this.options) {
                        state = this.options.initialValue;
                    }
                } else {
                    state.data = this.lastFinishedComputation?.getValue().data;
                }

                computation.setValue(state);

                this.onComputationFinished(computation);
            },
        );

        return computation;
    }

    private onComputationStarted(computation: AsyncFlowComputation<T>) {
        this.pendingComputation?.abort();
        this.pendingComputation = computation;
    }

    protected onComputationFinished(computation: AsyncFlowComputation<T>) {
        computation.finalize();

        const epoch = "epoch" in computation ? computation.epoch : 0;
        const isOutdatedComputation = this.currentEpoch > epoch;

        if (isOutdatedComputation) {
            console.log("=================================== OUTDATED COMP");
            return;
        }

        this.currentEpoch = epoch;
        this.pendingComputation = null;
        this.lastFinishedComputation = computation;

        super.onComputationFinished(computation);

        // обновляем data в pending значении in-progress вычисления
        if (this.cachedComputation !== computation && this.cachedComputation?.getValue().status === "pending") {
            const state: AsyncFlowState<T> = {
                status: "pending",
                data: computation.getValue().data,
            };
            this.cachedComputation.setValue(state);
        }

        // дополнительно уведомляем о завершении асинхронной операции
        this.onSourcesChanged();
    }
}
