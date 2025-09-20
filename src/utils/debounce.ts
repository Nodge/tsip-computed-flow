import type { AsyncFlow, Flow } from "@tsip/types";

export declare function debounce<T>(flow: AsyncFlow<T>, interval: number): AsyncFlow<T>;
export declare function debounce<T>(flow: Flow<T>, interval: number): Flow<T>;
