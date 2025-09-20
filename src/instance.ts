import type { AsyncFlowState, FlowSubscription } from "@tsip/types";
import { ComputedFlowExecution, type ComputedFlowContext } from "./execution";

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

export type ComputedFlowGetter<Data> = (ctx: ComputedFlowContext) => Data;

interface ValueRef<T> {
    // текущее закешированное значение
    current: T;
    // запуск, в рамках которого было получено значение
    execution: ComputedFlowExecution;
}

export class ComputedFlow<Data> {
    private getter: ComputedFlowGetter<Data>;

    /**
     * The current value stored in the flow.
     */
    private value: ValueRef<Data> | null;

    // cached successfully resolved async value
    private asyncValue: ValueRef<Data> | null;

    // есть ли активные подписки на computed поток
    private hasListeners: boolean;

    // изменилось ли значение с момента последнего вызова getSnapshot
    private isDirty: boolean;

    /**
     * Set of listener functions that are called when the value changes.
     */
    private subscriptions: Set<Subscription>;

    /**
     * Cached promise returned from the getDataSnapshot()
     */
    private dataPromise: Promise<Data> | null;

    private activeExecution: ComputedFlowExecution | null;

    /**
     * Creates a new ComputedFlow instance.
     *
     * @param getter
     */
    public constructor(getter: ComputedFlowGetter<Data>) {
        this.getter = getter;
        this.value = null;
        this.asyncValue = null;
        this.hasListeners = false;
        this.isDirty = true;
        this.subscriptions = new Set();
        this.dataPromise = null;
        this.activeExecution = null;
    }

    /**
     * Subscribes to changes in the flow.
     *
     * The listener function will be called synchronously whenever the flow's value changes
     * via the {@link setState} method. The listener receives no parameters and
     * should use {@link getSnapshot} to access the current value.
     *
     * @param listener - A callback function that will be invoked on value changes
     * @returns A subscription object that can be used to unsubscribe from changes
     *
     * @example
     * ```typescript
     * const sourceFlow = createFlow(0);
     * const computedFlow = computed((ctx) => ctx.get(flow) * 2);
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
                this.subscriptions.delete(subscription);

                // перестаем слушать источники при удалении последнего подписчика
                if (this.subscriptions.size === 0 && this.activeExecution) {
                    this.hasListeners = false;
                    this.activeExecution.dispose();
                    this.activeExecution = null;
                }
            },
        };

        this.hasListeners = true;

        if (this.subscriptions.size === 0) {
            this.compute();
        }

        this.subscriptions.add(subscription);

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
    public getSnapshot(): Data {
        console.log("GET SNAPSHOT", {
            value: this.value,
            asyncValue: this.asyncValue,
            isDirty: this.isDirty,
            hasListeners: this.hasListeners,
            activeExecution: Boolean(this.activeExecution),
            hasChanged: this.value?.execution.sourcesHasBeenChanged(),
        });

        if (this.value && !this.isDirty) {
            // если мы сейчас не следим за списком источников, то значение в кеше могло устареть, поэтому сверяемся с текущими значениями в источниках
            if (!this.hasListeners) {
                const execution = this.value.execution;
                if (execution.sourcesHasBeenChanged()) {
                    console.log("COMPUTE");
                    return this.compute();
                }
            }

            console.log("CACHED");
            return this.value.current;
        }

        console.log("COMPUTE");
        return this.compute();
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
    public getDataSnapshot(): Promise<Data> {
        this.dataPromise ??= new Promise<Data>((resolve, reject) => {
            const state = this.getSnapshot();
            this.assertAsyncState(state);

            if (state.status === "success") {
                this.dataPromise = null;
                resolve(state.data);
                return;
            }

            if (state.status === "error") {
                this.dataPromise = null;
                // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Intentionally preserve the original error to avoid transformations that could break user error handling
                reject(state.error);
                return;
            }

            const subscription = this.subscribe(() => {
                const state = this.getSnapshot();
                this.assertAsyncState(state);

                // still loading, wait for the next value
                if (state.status === "pending") {
                    return;
                }

                subscription.unsubscribe();

                if (state.status === "error") {
                    this.dataPromise = null;
                    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Intentionally preserve the original error to avoid transformations that could break user error handling
                    reject(state.error);
                    return;
                }

                this.dataPromise = null;
                resolve(state.data);
            });
        });
        return this.dataPromise;
    }

    private compute(): Data {
        const execution = new ComputedFlowExecution();
        const value = this.getter(execution.getContext());

        if (value instanceof Promise) {
            const state = this.handlePromise(execution, value);
            this.setState(state, execution);
            return state;
        } else {
            this.asyncValue = null;
            this.setActiveExecution(execution);
            this.setState(value, execution);
            return value;
        }
    }

    private handlePromise(execution: ComputedFlowExecution, promise: Promise<Data>): Data {
        console.log("RUN PROMISE");

        // todo: preserve order of executions
        // todo: dedupe pending executions promises

        promise.then(
            (data) => {
                console.log("RESOLVED", { data });

                const state: AsyncFlowState<Data> = {
                    status: "success",
                    data,
                };

                this.setActiveExecution(execution);
                this.asyncValue = { current: data, execution };
                this.setState(state as Data, execution);
                this.notify();
            },
            (error: unknown) => {
                const state: AsyncFlowState<Data> = {
                    status: "error",
                    error,
                    data: this.asyncValue?.current,
                };

                this.setActiveExecution(execution);
                this.asyncValue = null;
                this.setState(state as Data, execution);
                this.notify();
            },
        );

        const state: AsyncFlowState<Data> = {
            status: "pending",
            data: this.asyncValue?.current,
        };
        return state as Data;
    }

    private isAsyncState(value: unknown): value is AsyncFlowState<Data> {
        // todo
        return true;
    }

    private assertAsyncState(value: unknown): asserts value is AsyncFlowState<Data> {
        // todo
    }

    /**
     * Emits a new value to the flow.
     *
     * This method updates the internal state and triggers all registered listeners
     * to be called synchronously.
     *
     * @param value - The new value
     * @param execution
     */
    private setState(value: Data, execution: ComputedFlowExecution): void {
        console.log("SET_STATE", { value, subs: this.subscriptions.size });
        this.value = {
            current: value,
            execution,
        };
        this.isDirty = false;
    }

    // после успешного вычисления значения подписывается на собранные источники и отписывается от прежних источников
    private setActiveExecution(execution: ComputedFlowExecution) {
        if (this.activeExecution) {
            // отписываемся от прежнего списка источников
            this.activeExecution.dispose();
            this.activeExecution = null;
        }

        execution.finalize();

        if (this.hasListeners) {
            // if (this.)
            // подписываемся на новый список источников
            execution.subscribeToSources(() => {
                // проверяем, что уведомление пришло от актуального списка источников
                if (this.activeExecution === execution) {
                    this.onSourcesChanged();
                }
            });

            this.activeExecution = execution;
        }
    }

    private onSourcesChanged() {
        console.log("ON SOURCES CHANGED", {
            prev: this.value?.current,
        });

        if (this.isAsyncState(this.value?.current)) {
            const isPending = this.value.current.status === "pending";
            if (isPending) {
                console.log("SKIP_NOTIFY");

                // TODO: тут не продолбаем кейс, когда источник поменялся и его в промисе надо вычитать заново, а мы промис покешировали?

                // не нужно уведомлять подписчиков, если flow уже был в pending состоянии.
                // при изменении источником мы снова переходим в pending состояние, т.е. получается ничего не изменилось
                return;
            }
        }

        this.isDirty = true;
        this.notify();
    }

    // уведомляет всех подписчиков об изменении значения в потоке
    private notify(): void {
        console.log("NOTIFY", {
            current_value: this.value?.current,
            stack: new Error().stack,
            subs: this.subscriptions.size,
        });

        const errors: unknown[] = [];

        for (const subscription of new Set(this.subscriptions)) {
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
