import type { AsyncFlow, AsyncFlowState } from "@tsip/types";
import { FlowComputation, type FlowComputationContext } from "../sync/computation";

export interface AsyncFlowComputationContext extends FlowComputationContext {
    // функция для ожидания загрузки асинхронных значений в потоках
    readonly getAsync: <T>(flow: AsyncFlow<T>) => Promise<T>;
    // сигнал для отмены выполнения селектора
    readonly signal: AbortSignal;
}

export class AsyncFlowComputation<T> extends FlowComputation<AsyncFlowState<T>> {
    private abortController: AbortController;

    public constructor() {
        super();
        this.abortController = new AbortController();
    }

    public getContext(): AsyncFlowComputationContext {
        return {
            ...super.getContext(),
            getAsync: (flow) => {
                this.addSource(flow);
                const value = flow.getSnapshot();
                this.addSourceValue(flow, value); // todo: shallow equal for AsyncState?
                return flow.asPromise();
            },
            signal: this.abortController.signal,
        };
    }

    // сигнализирует о завершении выполнения функции-геттера
    protected finalize() {
        super.finalize();
        this.abortController.abort();
    }
}
