export function tryPromise<T>(fn: () => T): Promise<Awaited<T>> {
    try {
        return Promise.resolve(fn());
    } catch (err) {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        return Promise.reject(err);
    }
}
