import type { Flow } from "@tsip/types";
import { FlowComputationBase } from "../base/computation";

export interface FlowComputationContext {
    // функция для синхронного чтения потока
    readonly get: <T>(flow: Flow<T>) => T;
    // отменяет вычисление нового значения (поток не будет изменен)
    readonly skip: () => never;
}

export class FlowComputation<T> extends FlowComputationBase<T> {
    // отдает контекст для функции-геттера
    public getContext(): FlowComputationContext {
        return {
            get: (flow) => {
                this.addSource(flow);

                try {
                    const value = flow.getSnapshot();
                    this.setSourceValue(flow, value);
                    return value;
                } catch (err) {
                    this.setSourceError(flow, err);
                    throw err;
                }
            },
            skip() {
                // todo: test this
                throw AbortSignal.abort().reason;
            },
        };
    }
}
