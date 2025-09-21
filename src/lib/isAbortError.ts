export function isAbortError(err: unknown) {
    if (typeof err === "object" && err !== null && "name" in err) {
        return err.name === "AbortError";
    }
    return false;
}
