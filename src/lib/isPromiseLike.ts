/**
 * Checks if a value is promise-like
 * @param value - The value to check
 * @returns true if the value is promise-like
 */
export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
    return value !== null && typeof value === "object" && "then" in value && typeof value.then === "function";
}
