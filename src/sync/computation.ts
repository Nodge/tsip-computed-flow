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
                const value = flow.getSnapshot();
                this.addSourceValue(flow, value);
                return value;
            },
            skip() {
                // todo: test this
                throw AbortSignal.abort().reason;
            },
        };
    }
}
