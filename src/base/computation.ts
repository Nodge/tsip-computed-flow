import type { Flow, FlowSubscription } from "@tsip/types";

type SourceCachedValue =
    | {
          type: "success";
          value: unknown;
      }
    | {
          type: "error";
          error: unknown;
      };

export abstract class FlowComputationBase<T> {
    private sources: Set<Flow<unknown>>;
    private lastValues: Map<Flow<unknown>, SourceCachedValue>;
    private subscriptions: FlowSubscription[];
    private finalized: boolean;
    private value: { current: T } | null;
    private error: unknown;

    public constructor() {
        this.sources = new Set();
        this.lastValues = new Map();
        this.subscriptions = [];
        this.finalized = false;
        this.value = null;
    }

    public setValue(value: T) {
        this.value = { current: value };
        this.error = null;
    }

    public setError(error: unknown) {
        this.value = null;
        this.error = error;
    }

    public getValue(): T {
        if (this.error) {
            // eslint-disable-next-line @typescript-eslint/only-throw-error
            throw this.error;
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.value!.current;
    }

    protected addSource(flow: Flow<unknown>): void {
        // если выполнение функции-геттера уже завершилось, то игнорируем все новые источники
        if (this.finalized) {
            return;
        }
        this.sources.add(flow);
    }

    protected setSourceValue(flow: Flow<unknown>, value: unknown) {
        this.lastValues.set(flow, { type: "success", value });
    }

    protected setSourceError(flow: Flow<unknown>, error: unknown) {
        this.lastValues.set(flow, { type: "error", error });
    }

    // подписывается на все собранные источники
    public subscribeToSources(handler: () => void): void {
        for (const flow of this.sources) {
            const subscription = flow.subscribe(handler);
            this.subscriptions.push(subscription);
        }
    }

    // сигнализирует о завершении выполнения функции-геттера
    public finalize() {
        this.finalized = true;
    }

    // подготавливает объект к удалению из памяти, очищая все подписки и ссылки
    public dispose(): void {
        this.finalize();

        for (const subscription of this.subscriptions) {
            subscription.unsubscribe();
        }
        this.subscriptions.length = 0;

        // TODO: remove
        // this.sources.clear();

        // NOTE: не удаляем value и lastValues, потому что они продолжают использоваться даже без подписок
    }

    // возвращает набор собранных источников во время выполнения функции-геттера
    public getSources(): ReadonlySet<Flow<unknown>> {
        return this.sources;
    }

    // проверяет, изменился ли источник с момента отписки от него
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

    // проверяет, изменились ли источники с момента отписки от него
    public sourcesHasBeenChanged(): boolean {
        for (const source of this.sources) {
            if (this.hasSourceChanged(source)) {
                return true;
            }
        }
        return false;
    }
}
