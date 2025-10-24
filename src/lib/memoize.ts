/**
 * Configuration options for memoization behavior.
 *
 * @typeParam T - The parameter type for comparison
 */
interface MemoizationOptions<T> {
    /**
     * Custom equality function for comparing function parameters.
     * When provided, this function determines whether two parameter values should be considered equal,
     * allowing cache hits for semantically equivalent but not strictly equal parameters.
     *
     * @param a - The first parameter value to compare
     * @param b - The second parameter value to compare
     * @returns `true` if the parameters are considered equal, `false` otherwise
     *
     * @example
     * ```ts
     * const options = {
     *   equals: (a, b) => a.id === b.id
     * };
     * ```
     */
    equals?: (a: T, b: T) => boolean;
}

/**
 * Creates a memoized version of a function that caches object results using WeakRef.
 * The cache automatically cleans up when objects are garbage collected.
 *
 * @typeParam T - The return type of the function (must be an object)
 * @typeParam P - The parameter type of the function
 * @param fn - The function to memoize
 * @param options - Optional configuration
 * @returns A memoized version of the input function
 *
 * @example
 * ```ts
 * const memoized = memoize(() => ({ data: 'value' }));
 * const result1 = memoized();
 * const result2 = memoized(); // Returns cached result
 * ```
 *
 * @example
 * ```ts
 * const memoized = memoize(
 *   (id: number) => ({ id, data: 'value' }),
 *   { equals: (a, b) => a === b }
 * );
 * ```
 */
export function memoize<T extends object, P = never>(fn: () => T, options?: MemoizationOptions<P>): () => T;
export function memoize<T extends object, P = never>(
    fn: (param: P) => T,
    options?: MemoizationOptions<P>,
): (param: P) => T;
export function memoize<T extends object, P = never>(
    fn: (param?: P) => T,
    options?: MemoizationOptions<P>,
): (param?: P) => T {
    type Key = P | symbol | undefined;

    const cache = new Map<Key, WeakRef<T>>();
    const registry = new FinalizationRegistry((key: Key) => {
        cache.delete(key);
    });
    const notFound = Symbol();

    const findKey = (param: Key): Key => {
        if (!options?.equals) {
            return param;
        }

        for (const [key] of cache) {
            if (options.equals(param as P, key as P)) {
                return key;
            }
        }

        return notFound;
    };

    return (param?: Key) => {
        let value: T | undefined;

        const key = findKey(param);
        const ref = cache.get(key);
        value = ref?.deref();

        if (ref && !value) {
            cache.delete(key);
        }

        if (!value) {
            value = fn(param as P);
            cache.set(param, new WeakRef(value));
            registry.register(value, param);
        }

        return value;
    };
}
