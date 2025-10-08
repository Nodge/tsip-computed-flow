/**
 * Default equality comparison function using Object.is.
 *
 * This function uses the SameValue algorithm (Object.is) which treats
 * +0 and -0 as different values and NaN as equal to itself.
 *
 * @template T - The type of values to compare
 * @param a - The first value to compare
 * @param b - The second value to compare
 * @returns `true` if the values are the same, `false` otherwise
 *
 * @example
 * ```ts
 * defaultEquals(1, 1); // true
 * defaultEquals(NaN, NaN); // true
 * defaultEquals(+0, -0); // false
 * defaultEquals({}, {}); // false (different object references)
 * ```
 */
export function defaultEquals<T>(a: T, b: T): boolean {
    return Object.is(a, b);
}
