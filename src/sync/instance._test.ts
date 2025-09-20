import { describe, it } from "vitest";

describe("computedFlow", () => {
    describe("createSelector()", () => {
        it("[types] для синхронного селектора должен синхронно отдавать значение", () => {
            const ds = createTestDataSource({
                getState: () => "test",
            });
            const _watcher = createSelector(() => ds.dataSource());

            type T = (typeof _watcher)["getState"] extends () => string ? () => string : false;
            expectTypes(expectType<T, () => string, ExpectPassed>());
        });

        it("[types] для асинхронного селектора должен отдавать промис или значение", () => {
            const ds = createTestDataSource({
                getState: () => "test",
            });
            const _watcher = createSelector(function* () {
                return ds.dataSource();
            });

            type T = (typeof _watcher)["getState"] extends () => string | Promise<string>
                ? () => string | Promise<string>
                : never;
            expectTypes(expectType<T, () => string | Promise<string>, ExpectPassed>());
        });

        it("[types] не должен принимать асинхронные функции", () => {
            const ds = createTestDataSource({
                getState: () => "test",
            });
            const _watcher = createSelector(
                // @ts-expect-error Не должен принимать асинхронную функцию
                async () => {
                    return ds.dataSource();
                },
            );
        });

        it("[types] не должен принимать асинхронные генераторы", () => {
            const ds = createTestDataSource({
                getState: () => "test",
            });
            const _watcher = createSelector(
                // @ts-expect-error Не должен принимать асинхронную функцию
                async function* () {
                    return ds.dataSource();
                },
            );
        });
    });

    describe("getState()", () => {
        it("для синхронного селектора должен синхронно отдавать значение", () => {
            let value = "initial";

            const tds = createTestDataSource({
                getState: () => value,
            });

            const watcher = createSelector(() => {
                const data = tds.dataSource();
                return `processed: ${data}`;
            });

            expect(watcher.getState()).toBe("processed: initial");

            value = "updated";
            tds.triggerChange();

            expect(watcher.getState()).toBe("processed: updated");
        });

        it("должен отдавать значение из кеша при повторном вызове", () => {
            const getState = jest.fn().mockReturnValue("test");

            const tds = createTestDataSource({
                getState,
            });

            const watcher = createSelector(() => {
                return tds.dataSource();
            });

            expect(watcher.getState()).toBe("test");
            expect(getState).toHaveBeenCalledTimes(1);

            expect(watcher.getState()).toBe("test");
            expect(getState).toHaveBeenCalledTimes(1);

            tds.triggerChange();

            expect(watcher.getState()).toBe("test");
            expect(getState).toHaveBeenCalledTimes(2);
        });

        it("для асинхронного селектора должен отдавать промис", async () => {
            let value = Promise.resolve("initial");

            const tds = createTestDataSource({
                getState: () => value,
            });

            const watcher = createSelector(function* () {
                const data = yield* tds.dataSource();
                return `processed: ${data}`;
            });

            const promise = watcher.getState();
            expect(promise).toBeInstanceOf(Promise);
            expect(await promise).toBe("processed: initial");

            value = Promise.resolve("updated");
            tds.triggerChange();

            await expect(watcher.getState()).resolves.toBe("processed: updated");
        });

        it("должен при параллельном запуске вернуть только последнее значение асинхронного селектора", async () => {
            let value = "v1";
            let delay = 100;

            const tds = createTestDataSource({
                getState() {
                    const v = value;
                    return new Promise((resolve) => setTimeout(() => resolve(v), delay));
                },
            });

            const watcher = createSelector(function* () {
                return yield* tds.dataSource();
            });

            const p100 = watcher.getState();

            value = "v2";
            delay = 10;
            tds.triggerChange();
            const p10 = watcher.getState();

            value = "v3";
            delay = 200;
            tds.triggerChange();
            const p200 = watcher.getState();

            await expect(p100).resolves.toBe("v3");
            await expect(p10).resolves.toBe("v3");
            await expect(p200).resolves.toBe("v3");
            expect(p100).toBe(p10);
            expect(p100).toBe(p200);

            value = "v4";
            delay = 0;
            tds.triggerChange();
            const p0 = watcher.getState();
            await expect(p0).resolves.toBe("v4");
            expect(p100).not.toBe(p0);
        });

        it("должен отменять выполнение предыдущего генератора при повторном вызове селектора, если изменились источники", async () => {
            let value = "v1";
            let delay = 100;
            const mock = jest.fn();

            const tds = createTestDataSource({
                getState() {
                    const v = value;
                    return new Promise((resolve) => setTimeout(() => resolve(v), delay));
                },
            });

            const watcher = createSelector(function* () {
                const res = yield* tds.dataSource();
                mock();
                return res;
            });

            const p100 = watcher.getState();

            value = "v2";
            delay = 10;
            tds.triggerChange();
            const p10 = watcher.getState();

            await expect(p100).resolves.toBe("v2");
            await expect(p10).resolves.toBe("v2");
            expect(mock).toHaveBeenCalledTimes(1);
        });

        it("не должен запускать новый генератор при повторном вызове селектора, если источники не изменились", async () => {
            let value = "v1";
            let delay = 100;
            const mock = jest.fn();

            const tds = createTestDataSource({
                getState() {
                    const v = value;
                    return new Promise((resolve) => setTimeout(() => resolve(v), delay));
                },
            });

            const watcher = createSelector(function* () {
                const res = yield* tds.dataSource();
                mock();
                return res;
            });

            const p100 = watcher.getState();

            value = "v2";
            delay = 10;
            const p10 = watcher.getState();

            await expect(p100).resolves.toBe("v1");
            await expect(p10).resolves.toBe("v1");
            expect(mock).toHaveBeenCalledTimes(1);
        });

        it("должен использовать скрытые подписки на источники данных", async () => {
            const tds = createTestDataSource({
                getState: () => "sync",
            });
            const asyncTds = createTestDataSource({
                getState: () => Promise.resolve("async"),
            });

            const watcher = createSelector(function* () {
                return [tds.dataSource(), yield* asyncTds.dataSource()];
            });

            expect(tds.getSubscriptions()).toHaveLength(0);
            expect(tds.getWeakSubscriptions()).toHaveLength(0);
            expect(asyncTds.getSubscriptions()).toHaveLength(0);
            expect(asyncTds.getWeakSubscriptions()).toHaveLength(0);

            await expect(watcher.getState()).resolves.toEqual(["sync", "async"]);

            expect(tds.getSubscriptions()).toHaveLength(0);
            expect(tds.getWeakSubscriptions()).toHaveLength(1);
            expect(asyncTds.getSubscriptions()).toHaveLength(0);
            expect(asyncTds.getWeakSubscriptions()).toHaveLength(1);

            await expect(watcher.getState()).resolves.toEqual(["sync", "async"]);

            expect(tds.getSubscriptions()).toHaveLength(0);
            expect(tds.getWeakSubscriptions()).toHaveLength(1);
            expect(asyncTds.getSubscriptions()).toHaveLength(0);
            expect(asyncTds.getWeakSubscriptions()).toHaveLength(1);
        });

        it("должен подписываться на источники даже если произошла ошибка в синхронном селекторе", () => {
            const tds = createTestDataSource({
                getState: () => "value",
            });

            const watcher = createSelector(() => {
                const _data = tds.dataSource();
                throw new Error("test");
            });

            expect(() => watcher.getState()).toThrowErrorMatchingInlineSnapshot(`"test"`);

            expect(getIsSelectorRunning()).toBe(false);
            expect(tds.getSubscriptions()).toHaveLength(0);
            expect(tds.getWeakSubscriptions()).toHaveLength(1);
        });

        it("должен подписываться на источники даже если произошла ошибка в асинхронном селекторе", async () => {
            const tds = createTestDataSource({
                getState: () => Promise.resolve("value"),
            });

            const watcher = createSelector(function* () {
                const _data = yield* tds.dataSource();
                throw new Error("test");
            });

            await expect(watcher.getState()).rejects.toThrowErrorMatchingInlineSnapshot(`"test"`);

            expect(getIsSelectorRunning()).toBe(false);
            expect(tds.getSubscriptions()).toHaveLength(0);
            expect(tds.getWeakSubscriptions()).toHaveLength(1);
        });

        it("должен ловить ошибки в синхронных источниках", () => {
            const tds = createTestDataSource({
                getState() {
                    throw new Error("test");
                },
            });

            const watcher = createSelector(() => {
                return tds.dataSource();
            });

            expect(() => watcher.getState()).toThrowErrorMatchingInlineSnapshot(`"test"`);

            expect(getIsSelectorRunning()).toBe(false);
            expect(tds.getSubscriptions()).toHaveLength(0);
            expect(tds.getWeakSubscriptions()).toHaveLength(1);
        });

        it("должен ловить ошибки в асинхронных источниках и прерывать выполнение селектора", async () => {
            const tds = createTestDataSource({
                async getState() {
                    throw new Error("test");
                },
            });
            const mock = jest.fn();

            const watcher = createSelector(function* () {
                yield* tds.dataSource();
                mock();
            });

            await expect(watcher.getState()).rejects.toThrowErrorMatchingInlineSnapshot(`"test"`);

            expect(getIsSelectorRunning()).toBe(false);
            expect(tds.getSubscriptions()).toHaveLength(0);
            expect(tds.getWeakSubscriptions()).toHaveLength(1);
            expect(mock).not.toHaveBeenCalled();
        });

        it("должен ловить ошибку в асинхронном источнике при параллельном запуске", async () => {
            let toThrow = false;
            let delay = 100;
            const tds = createTestDataSource({
                getState() {
                    let toThrowCopy = toThrow;
                    return new Promise((resolve, reject) => {
                        setTimeout(() => {
                            if (toThrowCopy) {
                                reject(new Error("test"));
                                return;
                            }
                            resolve("async value");
                        }, delay);
                    });
                },
            });

            const watcher = createSelector(function* () {
                yield* tds.dataSource();
            });

            const p1 = watcher.getState();
            tds.triggerChange();
            toThrow = true;
            const p2 = watcher.getState();

            expect(p1).toBe(p2);
            await expect(p1).rejects.toThrowErrorMatchingInlineSnapshot(`"test"`);
            await expect(p2).rejects.toThrowErrorMatchingInlineSnapshot(`"test"`);

            expect(getIsSelectorRunning()).toBe(false);
            expect(tds.getSubscriptions()).toHaveLength(0);
            expect(tds.getWeakSubscriptions()).toHaveLength(1);
        });

        it("не должен ронять селектор, если ошибка произошла в отмененном источнике данных", async () => {
            jest.useFakeTimers();

            let toThrow = false;
            let delay = 100;
            const tds = createTestDataSource({
                getState() {
                    let toThrowCopy = toThrow;
                    return new Promise((resolve, reject) => {
                        setTimeout(() => {
                            if (toThrowCopy) {
                                reject(new Error("test"));
                                return;
                            }
                            resolve("async value");
                        }, delay);
                    });
                },
            });

            const watcher = createSelector(function* () {
                return yield* tds.dataSource();
            });

            toThrow = true;
            delay = 50;
            const p1 = watcher.getState();
            tds.triggerChange();
            toThrow = false;
            delay = 100;
            const p2 = watcher.getState();

            // Глобальное состояние не должно менятсья при отмене первого запроса
            await jest.advanceTimersByTimeAsync(75);
            expect(getIsSelectorRunning()).toBe(false);

            // Прокручиваем второй запрос до конца
            await jest.runAllTimersAsync();
            expect(getIsSelectorRunning()).toBe(false);

            expect(p1).toBe(p2);
            await expect(p1).resolves.toBe("async value");
            await expect(p2).resolves.toBe("async value");

            expect(getIsSelectorRunning()).toBe(false);
            expect(tds.getSubscriptions()).toHaveLength(0);
            expect(tds.getWeakSubscriptions()).toHaveLength(1);
        });

        it("должен кидать ошибку, если источники изменяются во время выполнения синхронного селектора", () => {
            let value = "initial";
            const tds = createTestDataSource({
                getState: () => value,
            });

            const watcher = createSelector(() => {
                const data = tds.dataSource();
                value = "changed";
                tds.triggerChange();
                return data;
            });

            expect(() => watcher.getState()).toThrowErrorMatchingInlineSnapshot(
                `"Side effect detected while running selector"`,
            );
        });

        it("должен кидать ошибку, если источники изменяются во время выполнения асинхронного селектора", async () => {
            let value = "initial";
            const tds = createTestDataSource({
                getState: () => Promise.resolve(value),
            });

            const watcher = createSelector(function* () {
                const data = yield* tds.dataSource();
                value = "changed";
                tds.triggerChange();
                return data;
            });

            await expect(watcher.getState()).rejects.toThrowErrorMatchingInlineSnapshot(
                `"Side effect detected while running selector"`,
            );
        });

        it("должен кидать ошибку, если во время выполнения селектора изменяются источники в другом селекторе", () => {
            let value = "initial";
            const tds1 = createTestDataSource({
                getState: () => value,
            });
            const tds2 = createTestDataSource({
                getState: () => {
                    value = "changed";
                    tds1.triggerChange();
                },
            });

            const watcher1 = createSelector(() => {
                return tds1.dataSource();
            });

            const watcher2 = createSelector(() => {
                return tds2.dataSource();
            });

            // создаем подписки
            watcher1.getState();

            expect(() => watcher2.getState()).toThrowErrorMatchingInlineSnapshot(
                `"Side effect detected while running selector"`,
            );
        });

        it("должен предоставить сигнал для отмены выполнения асихронного селектора", async () => {
            const spy = jest.fn();
            let delay = 100;
            const tds = createTestDataSource({
                getState(signal: AbortSignal) {
                    return new Promise((resolve) =>
                        setTimeout(() => {
                            spy({ aborted: signal.aborted });
                            resolve("value");
                        }, delay),
                    );
                },
            });

            const watcher = createSelector(function* ({ signal }) {
                yield* tds.dataSource(signal);
            });

            const p1 = watcher.getState();
            tds.triggerChange();
            const p2 = watcher.getState();

            await p1;
            await p2;

            expect(spy).toHaveBeenCalledTimes(2);
            expect(spy).toHaveBeenNthCalledWith(1, { aborted: true });
            expect(spy).toHaveBeenNthCalledWith(2, { aborted: false });
        });

        it("должен передавать данные из предыдущего запуска синхронного селектора", () => {
            let value = "v1";
            const tds = createTestDataSource({
                getState: () => value,
            });

            const watcher = createSelector(({ prevState }) => {
                return {
                    current: tds.dataSource(),
                    prevState,
                };
            });

            expect(watcher.getState()).toEqual({
                current: "v1",
                prevState: undefined,
            });

            value = "v2";
            tds.triggerChange();
            expect(watcher.getState()).toEqual({
                current: "v2",
                prevState: {
                    current: "v1",
                    prevState: undefined,
                },
            });
        });

        it("должен передавать данные из предыдущего запуска асинхронного селектора", async () => {
            let value = "v1";
            const tds = createTestDataSource({
                getState: () => Promise.resolve(value),
            });

            const watcher = createSelector(function* ({ prevState }) {
                return {
                    current: yield* tds.dataSource(),
                    prevState,
                };
            });

            await expect(watcher.getState()).resolves.toEqual({
                current: "v1",
                prevState: undefined,
            });

            value = "v2";
            tds.triggerChange();
            await expect(watcher.getState()).resolves.toEqual({
                current: "v2",
                prevState: {
                    current: "v1",
                    prevState: undefined,
                },
            });
        });

        it("не должен создавать подписки в источниках данных", () => {
            const tds = createTestDataSource({
                getState: () => "value",
            });

            createSelector(() => {
                return tds.dataSource();
            });

            // Без вызова getState или subscribe не должно быть подписок
            expect(tds.getSubscriptions()).toHaveLength(0);
            expect(tds.getWeakSubscriptions()).toHaveLength(0);
        });

        it("должна быть возможность обработать ошибку в синхронном селекторе", () => {
            const tds = createTestDataSource({
                getState: () => {
                    throw new Error("test error");
                },
            });

            const watcher = createSelector(() => {
                try {
                    return tds.dataSource();
                } catch {
                    return "handled error";
                }
            });

            expect(watcher.getState()).toBe("handled error");
        });

        it("должна быть возможность обработать ошибку в асинхронном селекторе", async () => {
            const tds = createTestDataSource({
                getState: () => Promise.reject(new Error("test error")),
            });

            const watcher = createSelector(function* () {
                try {
                    return yield* tds.dataSource();
                } catch {
                    return "handled error";
                }
            });

            await expect(watcher.getState()).resolves.toBe("handled error");
        });
    });

    describe("subscribe", () => {
        it("должен вызывать подписчиков на каждое изменение в источниках данных", async () => {
            let syncValue = "sync1";
            let asyncValue = "async1";

            const syncTds = createTestDataSource({
                getState: () => syncValue,
            });

            const asyncTds = createTestDataSource({
                getState: () => Promise.resolve(asyncValue),
            });

            const watcher = createSelector(function* () {
                const sync = syncTds.dataSource();
                const async = yield* asyncTds.dataSource();
                return { sync, async };
            });

            const listener = jest.fn();
            const unsubscribe = watcher.subscribe(listener);
            expect(listener).toHaveBeenCalledTimes(0);

            await watcher.getState();
            expect(listener).toHaveBeenCalledTimes(0);

            syncValue = "sync2";
            syncTds.triggerChange();
            syncTds.triggerChange();
            expect(listener).toHaveBeenCalledTimes(2);

            asyncValue = "async2";
            asyncTds.triggerChange();
            asyncTds.triggerChange();
            expect(listener).toHaveBeenCalledTimes(4);

            unsubscribe();

            syncValue = "sync3";
            syncTds.triggerChange();
            asyncValue = "async3";
            asyncTds.triggerChange();
            expect(listener).toHaveBeenCalledTimes(4);
        });

        it("должен вызывать оставшихся подписчиков, если один из них упал с ошибкой", () => {
            const log = jest.spyOn(console, "error").mockImplementation();

            const tds = createTestDataSource({
                getState: () => "value",
            });

            const watcher = createSelector(() => tds.dataSource());

            const listener1 = jest.fn(() => {
                throw new Error("listener error");
            });
            const listener2 = jest.fn();
            const listener3 = jest.fn();

            watcher.subscribe(listener1);
            watcher.subscribe(listener2);
            watcher.subscribe(listener3);

            tds.triggerChange();
            expect(listener1).toHaveBeenCalledTimes(1);
            expect(listener2).toHaveBeenCalledTimes(1);
            expect(listener3).toHaveBeenCalledTimes(1);

            expect(log).toHaveBeenCalledTimes(1);
        });

        it("должен выполнить селектор, если ранее он ни разу не запускался", () => {
            const getStateMock = jest.fn().mockReturnValue("value");
            const tds = createTestDataSource({
                getState: getStateMock,
            });

            const watcher = createSelector(() => tds.dataSource());

            const listener = jest.fn();
            watcher.subscribe(listener);

            // При первой подписке должен выполниться селектор
            expect(getStateMock).toHaveBeenCalledTimes(1);
        });

        it("не должен выполнять селектор, если селектор уже запускался", () => {
            const getStateMock = jest.fn().mockReturnValue("value");
            const tds = createTestDataSource({
                getState: getStateMock,
            });

            const watcher = createSelector(() => tds.dataSource());

            // Первый вызов getState
            watcher.getState();
            expect(getStateMock).toHaveBeenCalledTimes(1);

            // Подписка не должна вызывать селектор повторно
            const listener = jest.fn();
            watcher.subscribe(listener);
            expect(getStateMock).toHaveBeenCalledTimes(1);
        });

        it("должен создавать подписку в каждом источнике данных", () => {
            const tds1 = createTestDataSource({
                getState: () => "value1",
            });
            const tds2 = createTestDataSource({
                getState: () => "value2",
            });

            const watcher = createSelector(() => {
                return [tds1.dataSource(), tds2.dataSource()];
            });

            const listener = jest.fn();
            watcher.subscribe(listener);

            expect(tds1.getWeakSubscriptions()).toHaveLength(1);
            expect(tds1.getSubscriptions()).toHaveLength(1);
            expect(tds2.getWeakSubscriptions()).toHaveLength(1);
            expect(tds2.getSubscriptions()).toHaveLength(1);
        });

        it("должен удалять подписку в источниках данных при удалении последнего подписчика", () => {
            const tds = createTestDataSource({
                getState: () => "value",
            });

            const watcher = createSelector(() => tds.dataSource());

            const unsubscribe1 = watcher.subscribe(jest.fn());
            const unsubscribe2 = watcher.subscribe(jest.fn());

            expect(tds.getSubscriptions()).toHaveLength(1);

            unsubscribe1();
            expect(tds.getSubscriptions()).toHaveLength(1);

            unsubscribe2();
            expect(tds.getSubscriptions()).toHaveLength(0);
        });
    });
});

// TODO: инвалидация кеша при вызове getState после того, как все подписчики были удалены
