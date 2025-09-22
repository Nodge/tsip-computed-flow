import type { AsyncFlow, AsyncFlowState } from "@tsip/types";
import { FlowComputation, type FlowComputationContext } from "../sync/computation";

export interface AsyncFlowComputationContext extends FlowComputationContext {
    // функция для ожидания загрузки асинхронных значений в потоках
    readonly getAsync: <T>(flow: AsyncFlow<T>) => Promise<T>;
    // сигнал для отмены выполнения селектора
    readonly signal: AbortSignal;
}

let id = 0;
export class AsyncFlowComputation<T> extends FlowComputation<AsyncFlowState<T>> {
    private abortController: AbortController;
    private i: number;
    public readonly epoch: number;

    public constructor(epoch: number) {
        super();
        this.abortController = new AbortController();
        this.i = ++id;
        this.epoch = epoch;

        console.log("NEW COMPUTATION", this.i, { epoch });
    }

    public getContext(): AsyncFlowComputationContext {
        return {
            ...super.getContext(),
            getAsync: async (flow) => {
                this.addSource(flow);
                try {
                    const snapshot = flow.getSnapshot();
                    if (snapshot.status === "error") {
                        throw snapshot.error;
                    }

                    this.setSourceValue(flow, snapshot);
                    if (snapshot.status === "success") {
                        return snapshot.data;
                    }

                    const data = await flow.asPromise();
                    this.setSourceValue(flow, flow.getSnapshot());
                    return data;
                } catch (err) {
                    this.setSourceValue(flow, flow.getSnapshot());
                    throw err;
                }
            },
            signal: this.abortController.signal,
        };
    }

    // сигнализирует о завершении выполнения функции-геттера
    public finalize() {
        console.log("END COMPUTATION", this.i, { epoch: this.epoch });
        super.finalize();
        this.abortController.abort();
    }

    public abort() {
        this.abortController.abort();
    }
}
