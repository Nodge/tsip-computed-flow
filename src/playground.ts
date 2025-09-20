/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/unbound-method */
import type { AsyncFlow, Flow } from "@tsip/types";
import { createFlow, createAsyncFlow } from "@tsip/flow";
import { computedFlow } from "./factory";
import { takeLatest } from "./utils/takeLatest";
import { takeLeading } from "./utils/takeLeading";
import { debounce } from "./utils/debounce";
import { throttle } from "./utils/throttle";

const numberFlow = createFlow<number>(0);
const asyncFlow = createAsyncFlow<number>({ status: "pending" });
declare function query(options?: { signal?: AbortSignal }): AsyncFlow<string>;

const oneShot = computedFlow(() => 0);

// map
const mappedFlow = computedFlow(({ get }) => {
    const value = get(numberFlow);
    return value * 2;
});

// filter
const filteredFlow = computedFlow<number>(({ get, skip }) => {
    const value = get(numberFlow);
    if (value % 2) {
        skip();
    }
    return value;
});

// join
const joinedFlow = computedFlow(async ({ getAsync }) => {
    const [a, b] = await Promise.all([
        // first input
        getAsync(asyncFlow),
        // second input
        getAsync(asyncFlow),
    ]);

    return [a, b] as const;
});

// takeLatest
// NOTE: computed всегда пытается отменить выполнение через signal.
//       если использовать signal, то получится takeLatest (в потоке не будет промежуточных устаревших значений)
//       если не использовать signal, то получится takeEvery (в потоке будут устаревшие значения, но порядок значений при этом гарантирован, гонки исключены)
const latestFlow = computedFlow(async ({ getAsync, signal, skip }) => {
    const value = await getAsync(asyncFlow);

    // селекторы ловят AbortError и не эмитят новое значение в поток
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    signal.throwIfAborted();

    // ровно то же самое, но через skip
    if (signal.aborted) {
        skip();
    }

    return value;
});

// то же самое, но через готовый хелпер
const latestFlow2 = takeLatest(asyncFlow);

// takeLeading
const leadingFlow = takeLeading(asyncFlow);

// debounce
const debouncedFlow = debounce(numberFlow, 1000);

// throttle
const throttledFlow = throttle(asyncFlow, 2000);

declare const sliceSelector: (param: string) => Flow<"slice data">;
declare const apiQuery: (param: string) => AsyncFlow<"query result">;

const select = computedFlow(({ get, skip }, param: string) => {
    // подписка на данные из слайса
    const sliceData = get(sliceSelector(param));

    // получение данных без подписки
    const sliceData2 = sliceSelector(param).getSnapshot();

    // асинхронные значения тоже можно читать синхронно, но только если они уже загружены
    const queryState = get(apiQuery(param));
    if (queryState.status === "success") {
        return queryState.data;
    }

    // можно игнорировать перерасчет селектора
    if (queryState.status === "error") {
        skip();
    }

    return sliceData;
});

// mixed promise/non-promise
const mixed = computedFlow(({ get }) => {
    const foo = get(sliceSelector(""));
    if (foo.length > 0) {
        return Promise.resolve("");
    }
    return 0;
});
