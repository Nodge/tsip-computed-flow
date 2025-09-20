import type { AsyncFlow, Flow, FlowSubscription } from "@tsip/types";

export interface ComputedFlowContext {
    // функция для синхронного чтения потока
    readonly get: <T>(flow: Flow<T>) => T;
    // функция для ожидания загрузки асинхронных значений в потоках
    readonly getAsync: <T>(flow: AsyncFlow<T>) => Promise<T>;
    // отменяет вычисление нового значения (поток не будет изменен)
    readonly skip: () => never;
    // сигнал для отмены выполнения селектора
    readonly signal: AbortSignal;
}

export class ComputedFlowExecution {
    private abortController: AbortController;
    private sources: Set<Flow<unknown>>;
    private lastValues: Map<Flow<unknown>, unknown>;
    private subscriptions: FlowSubscription[];
    private finalized: boolean;

    public constructor() {
        this.abortController = new AbortController();
        this.sources = new Set();
        this.lastValues = new Map();
        this.subscriptions = [];
        this.finalized = false;
    }

    // отдает контекст для функции-геттера
    public getContext(): ComputedFlowContext {
        return {
            get: (flow) => {
                this.addSource(flow);
                const value = flow.getSnapshot();
                this.lastValues.set(flow, value);
                return value;
            },
            getAsync: (flow) => {
                this.addSource(flow);
                const value = flow.getSnapshot();
                this.lastValues.set(flow, value);
                return flow.getDataSnapshot();
            },
            skip() {
                // todo: test this
                throw AbortSignal.abort().reason;
            },
            signal: this.abortController.signal,
        };
    }

    // сигнализирует о завершении выполнения функции-геттера
    public finalize() {
        this.finalized = true;
        this.abortController.abort();
    }

    private addSource(flow: Flow<unknown>): void {
        // если выполнение функции-геттера уже завершилось, то игнорируем все новые источники
        if (this.finalized) {
            return;
        }
        this.sources.add(flow);
    }

    // подписывается на все собранные источники
    public subscribeToSources(handler: () => void): void {
        for (const flow of this.sources) {
            const subscription = flow.subscribe(handler);
            this.subscriptions.push(subscription);
        }
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
        console.log("hasSourceChanged", { currentValue, lastValue });
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
