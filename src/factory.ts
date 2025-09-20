import type { AsyncFlow, Flow } from "@tsip/types";
import { ComputedFlow } from "./instance";
import { createCache } from "./cache";
import type { ComputedFlowContext } from "./execution";

// TODO: может быть без параметров
export type ComputedFlowGetter<Param, Data> = (ctx: ComputedFlowContext, param: Param) => Data;

// ссылка на поток (если без параметров)
// конструктор потоков (если есть параметры)
export type ComputedResult<Param, Data> = [Param] extends [never]
    ? Data extends Promise<infer U>
        ? AsyncFlow<U>
        : Flow<Data>
    : (param: Param) => ComputedResult<never, Data>;

// Функция для создания потока, который следит за другими потоками
export function computedFlow<Param = never, Data = unknown>(
    getter: ComputedFlowGetter<Param, Data>,
): ComputedResult<Param, Data> {
    // the flow has additional param, which means we have essentially an endless number of computed flows with different params
    const argsCount = getter.length;
    const hasParam = argsCount > 1;

    if (hasParam) {
        const cache = createCache<Data>();

        return ((param: Param) => {
            let instance = cache.get(param);
            if (!instance) {
                instance = new ComputedFlow((ctx) => getter(ctx, param));
                cache.set(param, instance);
            }
            return instance;
        }) as unknown as ComputedResult<Param, Data>;
    }

    return new ComputedFlow((ctx) => getter(ctx, undefined as Param)) as unknown as ComputedResult<Param, Data>;
}
