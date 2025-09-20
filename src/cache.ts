import type { ComputedFlow } from "./instance";

export interface ComputedInstanceCache<Data> {
    get: (param: unknown) => ComputedFlow<Data> | undefined;
    set: (param: unknown, flow: ComputedFlow<Data>) => void;
}

// export function cached<Param, Data>(param: Param, get: () => ComputedFlow<Param, Data>): ComputedFlow<Param, Data> {
//     // todo: implement storage
//     return get();
// }

export declare function createCache<T>(): ComputedInstanceCache<T>;
