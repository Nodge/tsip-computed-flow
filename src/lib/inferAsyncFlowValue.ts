/**
 * Utility type that extracts the resolved value type from an AsyncFlow.
 */
export type InferAsyncFlowValue<T> = T extends { getSnapshot(): infer S }
    ? S extends { status: "success"; data: infer D }
        ? D
        : never
    : never;
