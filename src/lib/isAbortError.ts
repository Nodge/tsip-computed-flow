/**
 * Checks if an error is an AbortError.
 *
 * @param err - The error to check
 * @returns `true` if the error is an AbortError, `false` otherwise
 *
 * @example
 * ```ts
 * try {
 *   await fetch(url, { signal: AbortSignal.timeout(100) });
 * } catch (err) {
 *   if (isAbortError(err)) {
 *     console.log('Request was aborted');
 *   }
 * }
 * ```
 */
export function isAbortError(err: unknown) {
    if (typeof err === "object" && err !== null && "name" in err) {
        return err.name === "AbortError";
    }
    return false;
}
