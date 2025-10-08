import type { AsyncFlow } from "@tsip/types";
import { asyncComputedFlow } from "../async/factory";

/**
 * Creates an async flow that only processes the first computation while ignoring subsequent ones until it completes.
 *
 * When the source flow emits new values while a computation is already in progress, the new values
 * are ignored and the computation is skipped. The term "leading" refers to the first computation
 * that starts when no other computation is running - subsequent computations are blocked until the
 * current one finishes, ensuring only one computation runs at a time.
 *
 * This pattern is useful for preventing duplicate operations, such as preventing multiple
 * simultaneous API calls when a user rapidly clicks a button, or ensuring that only one
 * expensive computation runs at a time. Unlike `takeLatest`, which cancels previous computations,
 * `takeLeading` lets the first computation complete and ignores new ones.
 *
 * @typeParam T - The type of values emitted by the source async flow
 *
 * @param flow - The source async flow to apply the take leading pattern to
 *
 * @returns A new async flow that only processes the leading computation and skips others
 *
 * @example
 * ```typescript
 * const refreshTrigger = createFlow({});
 * const dataFlow = takeLeading(
 *   asyncComputedFlow(async (ctx) => {
 *     ctx.get(refreshTrigger);
 *     return await fetchLatestData();
 *   })
 * );
 *
 * // Multiple refresh requests will be ignored until the first completes
 * refreshTrigger.emit({});
 * refreshTrigger.emit({}); // Skipped
 * refreshTrigger.emit({}); // Skipped
 * ```
 *
 * @see {@link takeLatest} - For cancelling previous computations instead of ignoring new ones
 */
export function takeLeading<T>(flow: AsyncFlow<T>): AsyncFlow<T> {
    // todo: memoize

    let isLoading = false;

    return {
        subscribe(listener) {
            return flow.subscribe(() => {
                if (!isLoading) {
                    listener();
                }
                isLoading = true;
            });
        },
        getSnapshot() {
            const state = flow.getSnapshot();
            if (state.status !== "pending") {
                isLoading = false;
            }
            return state;
        },
        asPromise() {
            return flow.asPromise();
        },
    };
}
