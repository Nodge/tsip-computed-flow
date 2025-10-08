interface MemoizationOptions<T> {
    equals?: (a: T, b: T) => boolean;
}

/**
 * Creates a memoized version of a function that caches object results using WeakRef.
 * The cache automatically cleans up when objects are garbage collected.
 *
 * @template T - The return type of the function (must be an object)
 * @template P - The parameter type of the function
 * @param fn - The function to memoize
 * @param options - Optional configuration
 * @param options.equals - Custom equality function for comparing parameters
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
    type Key = P | undefined;

    const cache = new Map<Key, WeakRef<T>>();
    const registry = new FinalizationRegistry((key: Key) => {
        cache.delete(key);
    });

    const findKey = (param: Key): Key => {
        if (!options?.equals) {
            return param;
        }

        for (const [key] of cache) {
            if (options.equals(param as P, key as P)) {
                return key;
            }
        }

        return undefined;
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
