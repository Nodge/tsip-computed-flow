interface MemoizationOptions<T> {
    equals?: (a: T, b: T) => boolean;
}

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
