import type { Flow, FlowSubscription } from "@tsip/types";

export abstract class FlowComputationBase<T> {
    private sources: Set<Flow<unknown>>;
    private lastValues: Map<Flow<unknown>, unknown>;
    private subscriptions: FlowSubscription[];
    private finalized: boolean;
    private value: { current: T } | null;

    public constructor() {
        this.sources = new Set();
        this.lastValues = new Map();
        this.subscriptions = [];
        this.finalized = false;
        this.value = null;
    }

    public setValue(value: T) {
        this.finalize();
        this.value = { current: value };
    }

    public getValue(): T {
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

    protected addSourceValue(flow: Flow<unknown>, value: unknown) {
        this.lastValues.set(flow, value);
    }

    // подписывается на все собранные источники
    public subscribeToSources(handler: () => void): void {
        for (const flow of this.sources) {
            const subscription = flow.subscribe(handler);
            this.subscriptions.push(subscription);
        }
    }

    // сигнализирует о завершении выполнения функции-геттера
    protected finalize() {
        this.finalized = true;
    }

    // подготавливает объект к удалению из памяти, очищая все подписки и ссылки
    public dispose(): void {
        this.finalize();
        for (const subscription of this.subscriptions) {
            subscription.unsubscribe();
        }
        this.subscriptions.length = 0;
        this.sources.clear();
    }

    // возвращает набор собранных источников во время выполнения функции-геттера
    public getSources(): ReadonlySet<Flow<unknown>> {
        return this.sources;
    }

    // проверяет, изменился ли источник с момента отписки от него
    private hasSourceChanged(source: Flow<unknown>): boolean {
        const currentValue = source.getSnapshot();
        const lastValue = this.lastValues.get(source);
        // console.log("hasSourceChanged", { currentValue, lastValue });
        return !Object.is(currentValue, lastValue);
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
