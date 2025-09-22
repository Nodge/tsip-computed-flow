import type { FlowSubscription } from "@tsip/types";
import type { FlowComputationBase } from "./computation";

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

export abstract class ComputedFlowBase<T, FlowComputation extends FlowComputationBase<T>> {
    // ссылка на последний computation, если он был
    // этот computation не подписан на источники, а нужен только для кеширования значения
    protected cachedComputation: FlowComputation | null;

    // ссылка на computation, который подписан на изменение источников
    // сохраняется до тех пор, пока на поток есть подписки, очищается при удалении последней подписки
    protected activeComputation: FlowComputation | null;

    // есть ли активные подписки на computed поток
    private hasListeners: boolean;

    // нужно ли пересчитать значение потока
    private isDirty: boolean;

    /**
     * Set of listener functions that are called when the value changes.
     */
    private subscriptions: Set<Subscription>;

    public constructor() {
        this.cachedComputation = null;
        this.activeComputation = null;
        this.hasListeners = false;
        this.isDirty = true;
        this.subscriptions = new Set();
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
                if (this.subscriptions.size === 0 && this.activeComputation) {
                    this.hasListeners = false;
                    this.activeComputation.dispose();
                    this.activeComputation = null;
                }
            },
        };

        if (!this.hasListeners) {
            this.hasListeners = true;

            // если ранее не было подписчиков, значит мы не следили за источниками потока
            // значит нужно запустить вычисление, чтобы определить актуальный список источников, на которые надо подписаться
            try {
                this.getSnapshot();
            } catch {
                // the error will be delivered via getSnapshot call by flow's consumer
            }
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
    public getSnapshot(): T {
        // console.log("GET SNAPSHOT", {
        //     isDirty: this.isDirty,
        //     hasListeners: this.hasListeners,
        //     hasActiveComputation: Boolean(this.activeComputation),
        //     // cache: this.cachedComputation,
        //     // cacheValue: this.cachedComputation?.getValue(),
        //     // cacheDeps: this.cachedComputation?.getSources(),
        //     // activeValue: this.activeComputation?.getValue(),
        //     // activeDeps: this.activeComputation?.getSources(),
        //     ["cache === active"]: this.cachedComputation === this.activeComputation,
        // });

        if (this.cachedComputation) {
            // кейсы для пересчета:
            // 1. если мы сейчас не следим за списком источников, то значение в кеше могло устареть, поэтому сверяемся с текущими значениями в источниках (флаг hasListeners)
            // 2. если источники изменялись с предыдущего запуска (флаг isDirty)
            if (!this.hasListeners || this.isDirty) {
                console.log("GET SNAPSHOT: FORCE CHECK SOURCES");
                if (this.cachedComputation.sourcesHasBeenChanged()) {
                    console.log("GET SNAPSHOT: COMPUTE 1");
                    this.cachedComputation = this.compute();
                }
            } else {
                console.log("GET SNAPSHOT: CACHED");
            }
        } else {
            console.log("GET SNAPSHOT: COMPUTE 2");
            this.cachedComputation = this.compute();
        }

        this.isDirty = false;
        return this.cachedComputation.getValue();
    }

    // метод для вычисления значения
    protected abstract compute(): FlowComputation;

    // после успешного вычисления значения подписывается на собранные источники и отписывается от прежних источников
    protected onComputationFinished(computation: FlowComputation) {
        console.log("COMPUTATION_FINISHED", {
            // @ts-expect-error test test test
            value: computation.value,
            subs: this.subscriptions.size,
        });

        if (this.activeComputation) {
            // отписываемся от прежнего списка источников
            this.activeComputation.dispose();
            this.activeComputation = null;
        }

        if (this.hasListeners) {
            // подписываемся на новый список источников
            computation.subscribeToSources(() => {
                // проверяем, что уведомление пришло от актуального списка источников
                if (this.activeComputation === computation) {
                    this.onSourcesChanged();
                }
            });

            this.activeComputation = computation;
        }
    }

    protected onSourcesChanged() {
        console.log("ON SOURCES CHANGED", {
            cache: this.cachedComputation,
            isDirty: this.isDirty,
        });

        if (!this.isDirty) {
            this.isDirty = true;
            this.notify();
        }
    }

    // уведомляет всех подписчиков об изменении значения в потоке
    protected notify(): void {
        console.log("NOTIFY", {
            // current_value: this.lastComputation?.current,
            // stack: new Error().stack,
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
