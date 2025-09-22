import { createFlow } from "@tsip/flow";
import type { Flow, FlowSubscription, MutableFlow } from "@tsip/types";
import { describe, it, expect, vi, expectTypeOf } from "vitest";
import { ComputedFlow } from "./instance";
import type { FlowComputationContext } from "./computation";

describe("ComputedFlow", () => {
    describe("types", () => {
        it("should infer return type", () => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const flow1: Flow<string> = new ComputedFlow(() => "value");
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const flow2: Flow<"const"> = new ComputedFlow(() => "const" as const);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const flow3: Flow<number> = new ComputedFlow(() => 123);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const flow4: Flow<{ value: number }> = new ComputedFlow(() => ({ value: 123 }));
            // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/require-await
            const flow5: Flow<Promise<number>> = new ComputedFlow(async () => 123);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const flow6: Flow<undefined> = new ComputedFlow(() => undefined);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const flow7: Flow<null> = new ComputedFlow(() => null);

            const source = createFlow(0);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const flow8: Flow<number> = new ComputedFlow(({ get }) => get(source));
        });

        it("should infer return type with skips", () => {
            const source = createFlow<"a" | "b">("a");
            const flow = new ComputedFlow(({ get, skip }) => {
                const value = get(source);
                if (value === "a") {
                    return skip();
                }
                return value;
            });

            expectTypeOf(flow).toEqualTypeOf<ComputedFlow<"b">>();
        });
    });

    describe("basic functionality", () => {
        it("should compute and return value", () => {
            const flow = new ComputedFlow(() => "const");
            const value = flow.getSnapshot();
            expect(value).toBe("const");
        });

        it("should compute value based on dependencies", () => {
            const source = createFlow(2);
            const flow = new ComputedFlow(({ get }) => get(source) * 2);
            const value = flow.getSnapshot();
            expect(value).toBe(4);
        });

        it("should recompute when dependencies change", () => {
            const source = createFlow(2);

            const flow = new ComputedFlow(({ get }) => get(source) * 2);
            expect(flow.getSnapshot()).toBe(4);

            source.emit(3);
            expect(flow.getSnapshot()).toBe(6);
        });

        it("should handle multiple dependencies", () => {
            const source1 = createFlow(2);
            const source2 = createFlow(3);
            const source3 = createFlow(4);

            const flow = new ComputedFlow(({ get }) => get(source1) + get(source2) + get(source3));
            expect(flow.getSnapshot()).toBe(2 + 3 + 4);

            source1.emit(5);
            expect(flow.getSnapshot()).toBe(5 + 3 + 4);

            source2.emit(6);
            expect(flow.getSnapshot()).toBe(5 + 6 + 4);
        });
    });

    describe("subscription behavior", () => {
        it("should notify subscribers on deps change", () => {
            const source = createFlow(1);
            const flow = new ComputedFlow(({ get }) => get(source) * 2);
            const listener = vi.fn();

            flow.subscribe(listener);
            expect(listener).toHaveBeenCalledTimes(0);

            source.emit(3);
            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith();
        });

        it("should notify multiple subscribers", () => {
            const source = createFlow(1);
            const flow = new ComputedFlow(({ get }) => get(source) * 2);
            const listener1 = vi.fn();
            const listener2 = vi.fn();
            const listener3 = vi.fn();

            flow.subscribe(listener1);
            flow.subscribe(listener2);
            flow.subscribe(listener3);

            source.emit(5);

            expect(listener1).toHaveBeenCalledTimes(1);
            expect(listener2).toHaveBeenCalledTimes(1);
            expect(listener3).toHaveBeenCalledTimes(1);
        });

        it("should notify the same subscriber multiple times", () => {
            const source = createFlow(1);
            const flow = new ComputedFlow(({ get }) => get(source) * 2);
            const listener = vi.fn();

            flow.subscribe(listener);
            flow.subscribe(listener);

            source.emit(5);

            expect(listener).toHaveBeenCalledTimes(2);
        });

        it("should stop notifications after unsubscribe", () => {
            const source = createFlow(1);
            const flow = new ComputedFlow(({ get }) => get(source) * 2);
            const listener = vi.fn();

            const subscription = flow.subscribe(listener);
            source.emit(3);
            expect(listener).toHaveBeenCalledTimes(1);

            subscription.unsubscribe();

            source.emit(4);
            expect(listener).toHaveBeenCalledTimes(1);
        });

        it("should notify at most once between getSnapshot calls", () => {
            const source = createFlow(1);
            const flow = new ComputedFlow(({ get }) => get(source) * 2);
            const listener = vi.fn();

            flow.subscribe(listener);

            source.emit(3);
            expect(listener).toHaveBeenCalledTimes(1);

            source.emit(4);
            expect(listener).toHaveBeenCalledTimes(1);

            flow.getSnapshot();
            source.emit(5);
            expect(listener).toHaveBeenCalledTimes(2);
        });

        it("should handle subscription during notification", () => {
            const source = createFlow(1);
            const flow = new ComputedFlow(({ get }) => get(source) * 2);
            const listener1 = vi.fn();
            const listener2 = vi.fn();

            flow.subscribe(() => {
                listener1();
                // Subscribe during notification
                flow.subscribe(listener2);
            });

            source.emit(3);

            expect(listener1).toHaveBeenCalledTimes(1);
            // listener2 should not be called during the same notification cycle
            expect(listener2).not.toHaveBeenCalled();

            // Нужно вычитать значение, чтобы сработала следующая нотификация
            flow.getSnapshot();

            // But should be called on the next change
            source.emit(4);
            expect(listener2).toHaveBeenCalledTimes(1);
        });

        it("should handle unsubscription during notification", () => {
            const source = createFlow(1);
            const flow = new ComputedFlow(({ get }) => get(source) * 2);
            const listener1 = vi.fn();
            const listener2 = vi.fn();

            // eslint-disable-next-line prefer-const
            let subscription2: FlowSubscription | undefined;

            flow.subscribe(() => {
                listener1();
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                subscription2!.unsubscribe();
            });

            subscription2 = flow.subscribe(listener2);

            source.emit(3);
            expect(listener1).toHaveBeenCalledTimes(1);
            expect(listener2).toHaveBeenCalledTimes(1);

            // Нужно вычитать значение, чтобы сработала следующая нотификация
            flow.getSnapshot();

            source.emit(4);
            expect(listener1).toHaveBeenCalledTimes(2);
            expect(listener2).toHaveBeenCalledTimes(1); // Not called after unsubscribe
        });

        it("should remove only specific subscription on multiple unsubscribe calls", () => {
            const source = createFlow(1);
            const flow = new ComputedFlow(({ get }) => get(source) * 2);
            const listener1 = vi.fn();
            const listener2 = vi.fn();

            const subscription1 = flow.subscribe(listener1);
            flow.subscribe(listener2);

            // Call unsubscribe1 multiple times
            subscription1.unsubscribe();
            subscription1.unsubscribe(); // Should be safe to call multiple times
            subscription1.unsubscribe();

            source.emit(3);

            expect(listener1).not.toHaveBeenCalled();
            expect(listener2).toHaveBeenCalledTimes(1);
        });
    });

    describe("lazy computation and cache behavior", () => {
        it("should not re-compute on instance creation", () => {
            const source = createFlow(1);
            const getter = vi.fn().mockImplementation((ctx: FlowComputationContext) => {
                return ctx.get(source) * 2;
            });
            new ComputedFlow(getter);

            expect(getter).not.toHaveBeenCalled();
        });

        it("should re-compute on first subscription", () => {
            const source = createFlow(1);
            const getter = vi.fn().mockImplementation((ctx: FlowComputationContext) => {
                return ctx.get(source) * 2;
            });
            const flow = new ComputedFlow(getter);
            expect(getter).toHaveBeenCalledTimes(0);

            flow.subscribe(vi.fn());
            expect(getter).toHaveBeenCalledTimes(1);
        });

        describe("with active listeners", () => {
            it("should return cached value if deps has not been changed", () => {
                const source = createFlow(1);
                const getter = vi.fn().mockImplementation((ctx: FlowComputationContext) => {
                    return { value: ctx.get(source) };
                });
                const flow = new ComputedFlow<unknown>(getter);

                flow.subscribe(vi.fn());
                expect(getter).toHaveBeenCalledTimes(1);

                const value1 = flow.getSnapshot();
                const value2 = flow.getSnapshot();

                expect(value1).toBe(value2);
                expect(getter).toHaveBeenCalledTimes(1);
            });

            it("should re-compute value if deps has been changed", () => {
                const source = createFlow(1);
                const getter = vi.fn().mockImplementation((ctx: FlowComputationContext) => {
                    return { value: ctx.get(source) };
                });
                const flow = new ComputedFlow<unknown>(getter);

                flow.subscribe(vi.fn());
                const value1 = flow.getSnapshot();
                expect(getter).toHaveBeenCalledTimes(1);

                source.emit(2);
                const value2 = flow.getSnapshot();

                expect(value1).not.toBe(value2);
                expect(value1).toEqual({ value: 1 });
                expect(value2).toEqual({ value: 2 });
                expect(getter).toHaveBeenCalledTimes(2);

                const value3 = flow.getSnapshot();
                expect(value2).toBe(value3);
                expect(getter).toHaveBeenCalledTimes(2);
            });

            it("should not re-compute without getSnapshot call", () => {
                const source = createFlow(1);
                const getter = vi.fn().mockImplementation((ctx: FlowComputationContext) => {
                    return { value: ctx.get(source) };
                });
                const flow = new ComputedFlow<unknown>(getter);

                flow.subscribe(vi.fn());
                expect(getter).toHaveBeenCalledTimes(1);

                source.emit(2);
                source.emit(3);
                expect(getter).toHaveBeenCalledTimes(1);
            });

            it("should handle conditional sources", () => {
                const source = createFlow(true);
                const a = createFlow("a");
                const b = createFlow("b");
                const getter = vi.fn().mockImplementation((ctx: FlowComputationContext) => {
                    if (ctx.get(source)) {
                        return { value: ctx.get(a) };
                    } else {
                        return { value: ctx.get(b) };
                    }
                });
                const flow = new ComputedFlow<unknown>(getter);

                flow.subscribe(vi.fn());
                const value1 = flow.getSnapshot();
                expect(value1).toEqual({ value: "a" });
                expect(getter).toHaveBeenCalledTimes(1);

                // b не влияет на вычисленяемое значение
                b.emit("bb");
                const value2 = flow.getSnapshot();
                expect(value2).toBe(value1);
                expect(value2).toEqual({ value: "a" });
                expect(getter).toHaveBeenCalledTimes(1);

                // a влияет на вычисленяемое значение
                a.emit("aa");
                const value3 = flow.getSnapshot();
                expect(value3).not.toBe(value2);
                expect(value3).toEqual({ value: "aa" });
                expect(getter).toHaveBeenCalledTimes(2);

                // переключаемся на альтернативную ветку
                source.emit(false);
                const value4 = flow.getSnapshot();
                expect(value4).not.toBe(value3);
                expect(value4).toEqual({ value: "bb" });
                expect(getter).toHaveBeenCalledTimes(3);

                // a не влияет на вычисленяемое значение
                a.emit("aaa");
                const value5 = flow.getSnapshot();
                expect(value5).toBe(value4);
                expect(value5).toEqual({ value: "bb" });
                expect(getter).toHaveBeenCalledTimes(3);
            });

            it("should return cached value if sources has changed but ended up with same value", () => {
                const source = createFlow(1);
                const getter = vi.fn().mockImplementation((ctx: FlowComputationContext) => {
                    return { value: ctx.get(source) };
                });
                const flow = new ComputedFlow<unknown>(getter);

                flow.subscribe(vi.fn());
                const value1 = flow.getSnapshot();
                expect(getter).toHaveBeenCalledTimes(1);

                source.emit(2);
                source.emit(1);

                const value2 = flow.getSnapshot();

                expect(value1).toBe(value2);
                expect(getter).toHaveBeenCalledTimes(1);
            });
        });

        describe("without active listeners", () => {
            it("should return cached value if deps has not been changed", () => {
                const source = createFlow(1);
                const getter = vi.fn().mockImplementation((ctx: FlowComputationContext) => {
                    return { value: ctx.get(source) };
                });
                const flow = new ComputedFlow<unknown>(getter);
                expect(getter).toHaveBeenCalledTimes(0);

                const value1 = flow.getSnapshot();
                const value2 = flow.getSnapshot();

                expect(value1).toBe(value2);
                expect(getter).toHaveBeenCalledTimes(1);
            });

            it("should re-compute value if deps has been changed", () => {
                const source = createFlow(1);
                const getter = vi.fn().mockImplementation((ctx: FlowComputationContext) => {
                    return { value: ctx.get(source) };
                });
                const flow = new ComputedFlow<unknown>(getter);

                const value1 = flow.getSnapshot();
                expect(getter).toHaveBeenCalledTimes(1);

                source.emit(2);
                const value2 = flow.getSnapshot();

                expect(value1).not.toBe(value2);
                expect(value1).toEqual({ value: 1 });
                expect(value2).toEqual({ value: 2 });
                expect(getter).toHaveBeenCalledTimes(2);

                const value3 = flow.getSnapshot();
                expect(value2).toBe(value3);
                expect(getter).toHaveBeenCalledTimes(2);
            });

            it("should not re-compute without getSnapshot call", () => {
                const source = createFlow(1);
                const getter = vi.fn().mockImplementation((ctx: FlowComputationContext) => {
                    return { value: ctx.get(source) };
                });
                new ComputedFlow<unknown>(getter);
                expect(getter).toHaveBeenCalledTimes(0);

                source.emit(2);
                source.emit(3);
                expect(getter).toHaveBeenCalledTimes(0);
            });

            it("should handle conditional sources", () => {
                const source = createFlow(true);
                const a = createFlow("a");
                const b = createFlow("b");
                const getter = vi.fn().mockImplementation((ctx: FlowComputationContext) => {
                    if (ctx.get(source)) {
                        return { value: ctx.get(a) };
                    } else {
                        return { value: ctx.get(b) };
                    }
                });
                const flow = new ComputedFlow<unknown>(getter);

                const value1 = flow.getSnapshot();
                expect(value1).toEqual({ value: "a" });
                expect(getter).toHaveBeenCalledTimes(1);

                // b не влияет на вычисленяемое значение
                b.emit("bb");
                const value2 = flow.getSnapshot();
                expect(value2).toBe(value1);
                expect(value2).toEqual({ value: "a" });
                expect(getter).toHaveBeenCalledTimes(1);

                // a влияет на вычисленяемое значение
                a.emit("aa");
                const value3 = flow.getSnapshot();
                expect(value3).not.toBe(value2);
                expect(value3).toEqual({ value: "aa" });
                expect(getter).toHaveBeenCalledTimes(2);

                // переключаемся на альтернативную ветку
                source.emit(false);
                const value4 = flow.getSnapshot();
                expect(value4).not.toBe(value3);
                expect(value4).toEqual({ value: "bb" });
                expect(getter).toHaveBeenCalledTimes(3);

                // a не влияет на вычисленяемое значение
                a.emit("aaa");
                const value5 = flow.getSnapshot();
                expect(value5).toBe(value4);
                expect(value5).toEqual({ value: "bb" });
                expect(getter).toHaveBeenCalledTimes(3);
            });

            it("should return cached value if sources has changed but ended up with same value", () => {
                const source = createFlow(1);
                const getter = vi.fn().mockImplementation((ctx: FlowComputationContext) => {
                    return { value: ctx.get(source) };
                });
                const flow = new ComputedFlow<unknown>(getter);

                const value1 = flow.getSnapshot();
                expect(getter).toHaveBeenCalledTimes(1);

                source.emit(2);
                source.emit(1);

                const value2 = flow.getSnapshot();

                expect(value1).toBe(value2);
                expect(getter).toHaveBeenCalledTimes(1);
            });

            it("should return cached value after the last subscription has been removed", () => {
                const source = createFlow(1);
                const getter = vi.fn().mockImplementation((ctx: FlowComputationContext) => {
                    return { value: ctx.get(source) };
                });
                const flow = new ComputedFlow<unknown>(getter);

                const subscription = flow.subscribe(vi.fn());
                const value1 = flow.getSnapshot();
                expect(value1).toEqual({ value: 1 });
                expect(getter).toHaveBeenCalledTimes(1);

                subscription.unsubscribe();
                const value2 = flow.getSnapshot();
                expect(value2).toBe(value1);
                expect(value2).toEqual({ value: 1 });
                expect(getter).toHaveBeenCalledTimes(1);

                source.emit(2);
                const value3 = flow.getSnapshot();
                expect(value3).not.toBe(value2);
                expect(value3).toEqual({ value: 2 });
                expect(getter).toHaveBeenCalledTimes(2);
            });
        });
    });

    describe("watcher behavior", () => {
        it("does not subscribe to sources on instance creation", () => {
            const source = createFlow(1);
            const spy = vi.spyOn(source, "subscribe");
            new ComputedFlow<unknown>(({ get }) => get(source) * 2);
            expect(spy).not.toHaveBeenCalled();
        });

        it("should subscribe to sources on first listener", () => {
            const source = createFlow(1);
            const spy = vi.spyOn(source, "subscribe");
            const flow = new ComputedFlow<unknown>(({ get }) => get(source) * 2);
            expect(spy).not.toHaveBeenCalled();

            flow.subscribe(vi.fn());
            expect(spy).toHaveBeenCalledTimes(1);
        });

        it("should subscribe to each source only once", () => {
            const source = createFlow(1);
            const subscribe = vi.spyOn(source, "subscribe");
            const flow = new ComputedFlow<unknown>(({ get }) => get(source) * 2);

            expect(subscribe).not.toHaveBeenCalled();
            expect(getSubscriptionsCount(source)).toBe(0);

            flow.subscribe(vi.fn());
            flow.subscribe(vi.fn());
            flow.subscribe(vi.fn());

            flow.getSnapshot();
            expect(subscribe).toHaveBeenCalledTimes(1);
            expect(getSubscriptionsCount(source)).toBe(1);

            source.emit(2);
            flow.getSnapshot();
            expect(subscribe).toHaveBeenCalledTimes(2);
            expect(getSubscriptionsCount(source)).toBe(1);
        });

        it("should clean up subscriptions when no subscribers remain", () => {
            const source = createFlow(1);
            const subscribe = vi.spyOn(source, "subscribe");
            const flow = new ComputedFlow<unknown>(({ get }) => get(source) * 2);

            expect(subscribe).not.toHaveBeenCalled();
            expect(getSubscriptionsCount(source)).toBe(0);

            const subscription = flow.subscribe(vi.fn());

            expect(subscribe).toHaveBeenCalledTimes(1);
            expect(getSubscriptionsCount(source)).toBe(1);

            subscription.unsubscribe();
            expect(subscribe).toHaveBeenCalledTimes(1);
            expect(getSubscriptionsCount(source)).toBe(0);
        });

        it("should handle conditional sources", () => {
            const source = createFlow(true);
            const sourceSubscribe = vi.spyOn(source, "subscribe");
            const a = createFlow("a");
            const aSubscribe = vi.spyOn(a, "subscribe");
            const b = createFlow("b");
            const bSubscribe = vi.spyOn(b, "subscribe");

            const flow = new ComputedFlow<unknown>(({ get }) => {
                if (get(source)) {
                    return { value: get(a) };
                } else {
                    return { value: get(b) };
                }
            });

            flow.subscribe(vi.fn());
            expect(sourceSubscribe).toHaveBeenCalledTimes(1);
            expect(getSubscriptionsCount(source)).toBe(1);
            expect(aSubscribe).toHaveBeenCalledTimes(1);
            expect(getSubscriptionsCount(a)).toBe(1);
            expect(bSubscribe).toHaveBeenCalledTimes(0);
            expect(getSubscriptionsCount(b)).toBe(0);

            // b не влияет на вычисленяемое значение
            b.emit("bb");
            flow.getSnapshot();
            expect(sourceSubscribe).toHaveBeenCalledTimes(1);
            expect(getSubscriptionsCount(source)).toBe(1);
            expect(aSubscribe).toHaveBeenCalledTimes(1);
            expect(getSubscriptionsCount(a)).toBe(1);
            expect(bSubscribe).toHaveBeenCalledTimes(0);
            expect(getSubscriptionsCount(b)).toBe(0);

            // a влияет на вычисленяемое значение
            a.emit("aa");
            flow.getSnapshot();
            expect(sourceSubscribe).toHaveBeenCalledTimes(2);
            expect(getSubscriptionsCount(source)).toBe(1);
            expect(aSubscribe).toHaveBeenCalledTimes(2);
            expect(getSubscriptionsCount(a)).toBe(1);
            expect(bSubscribe).toHaveBeenCalledTimes(0);
            expect(getSubscriptionsCount(b)).toBe(0);

            // переключаемся на альтернативную ветку
            source.emit(false);
            flow.getSnapshot();
            expect(sourceSubscribe).toHaveBeenCalledTimes(3);
            expect(getSubscriptionsCount(source)).toBe(1);
            expect(aSubscribe).toHaveBeenCalledTimes(2);
            expect(getSubscriptionsCount(a)).toBe(0);
            expect(bSubscribe).toHaveBeenCalledTimes(1);
            expect(getSubscriptionsCount(b)).toBe(1);

            // a не влияет на вычисленяемое значение
            a.emit("aaa");
            flow.getSnapshot();
            expect(sourceSubscribe).toHaveBeenCalledTimes(3);
            expect(getSubscriptionsCount(source)).toBe(1);
            expect(aSubscribe).toHaveBeenCalledTimes(2);
            expect(getSubscriptionsCount(a)).toBe(0);
            expect(bSubscribe).toHaveBeenCalledTimes(1);
            expect(getSubscriptionsCount(b)).toBe(1);
        });
    });

    describe("compute error handling", () => {
        it("should propagate errors via getSnapshot", () => {
            const error = new Error("test");
            const flow = new ComputedFlow<unknown>(() => {
                throw error;
            });

            expect(() => flow.getSnapshot()).toThrow(error);
        });

        it("should propagate errors for sources", () => {
            const error = new Error("test");
            const source = createFlow(0);
            source.getSnapshot = () => {
                throw error;
            };

            const flow = new ComputedFlow<unknown>(({ get }) => {
                return get(source);
            });

            flow.subscribe(vi.fn());
            expect(() => flow.getSnapshot()).toThrow(error);
            expect(getSubscriptionsCount(source)).toBe(1);
        });

        it("should check error sources without active listeners", () => {
            const error = new Error("test");
            const normalSource = createFlow(0);
            const errorSource = createFlow(0);
            errorSource.getSnapshot = vi.fn(() => {
                throw error;
            });

            const flow = new ComputedFlow<unknown>(({ get }) => {
                get(normalSource);
                get(errorSource);
            });

            expect(() => flow.getSnapshot()).toThrow(error);
            // eslint-disable-next-line @typescript-eslint/unbound-method
            expect(errorSource.getSnapshot).toHaveBeenCalledTimes(1);

            normalSource.emit(1);
            expect(() => flow.getSnapshot()).toThrow(error);
            // eslint-disable-next-line @typescript-eslint/unbound-method
            expect(errorSource.getSnapshot).toHaveBeenCalledTimes(2);

            errorSource.emit(1);
            expect(() => flow.getSnapshot()).toThrow(error);
            // eslint-disable-next-line @typescript-eslint/unbound-method
            expect(errorSource.getSnapshot).toHaveBeenCalledTimes(3);
        });

        it("should maintain subscriptions to sources before error happened", () => {
            const error = new Error("test");
            const normalSource = createFlow(0);
            const errorSource = createFlow(0);
            errorSource.getSnapshot = vi.fn(() => {
                throw error;
            });

            const flow = new ComputedFlow<unknown>(({ get }) => {
                get(normalSource);
                get(errorSource);
            });

            flow.subscribe(vi.fn());
            expect(() => flow.getSnapshot()).toThrow(error);
            expect(getSubscriptionsCount(normalSource)).toBe(1);
            expect(getSubscriptionsCount(errorSource)).toBe(1);
            // eslint-disable-next-line @typescript-eslint/unbound-method
            expect(errorSource.getSnapshot).toHaveBeenCalledTimes(1);

            normalSource.emit(1);
            expect(() => flow.getSnapshot()).toThrow(error);
            expect(getSubscriptionsCount(normalSource)).toBe(1);
            expect(getSubscriptionsCount(errorSource)).toBe(1);
            // eslint-disable-next-line @typescript-eslint/unbound-method
            expect(errorSource.getSnapshot).toHaveBeenCalledTimes(2);

            errorSource.emit(1);
            expect(() => flow.getSnapshot()).toThrow(error);
            expect(getSubscriptionsCount(normalSource)).toBe(1);
            expect(getSubscriptionsCount(errorSource)).toBe(1);
            // eslint-disable-next-line @typescript-eslint/unbound-method
            expect(errorSource.getSnapshot).toHaveBeenCalledTimes(3);
        });

        it("should re-compute after error", () => {
            const error = new Error("test");
            const errorSource = createFlow(0);
            let shouldError = true;
            errorSource.getSnapshot = vi.fn(() => {
                if (shouldError) {
                    throw error;
                }
                return 123;
            });

            const flow = new ComputedFlow<unknown>(({ get }) => get(errorSource));

            expect(() => flow.getSnapshot()).toThrow(error);
            // eslint-disable-next-line @typescript-eslint/unbound-method
            expect(errorSource.getSnapshot).toHaveBeenCalledTimes(1);

            shouldError = false;
            errorSource.emit(123);
            expect(flow.getSnapshot()).toBe(123);

            // первый вызов происходит при проверке зависимостей, чтобы найти изменения в errorSource
            // второй вызов происходит при вычислении нового значения потока
            // eslint-disable-next-line @typescript-eslint/unbound-method
            expect(errorSource.getSnapshot).toHaveBeenCalledTimes(3);
        });
    });

    describe("subscriptions error handling", () => {
        it("should catch errors from listeners and throw AggregateError", () => {
            const error1 = new Error("Listener 1 error");
            const error2 = new Error("Listener 2 error");

            const source = createFlow(0);
            const flow = new ComputedFlow(({ get }) => get(source));
            flow.subscribe(() => {
                throw error1;
            });
            flow.subscribe(() => {
                throw error2;
            });

            expect(() => {
                source.emit(1);
            }).toThrow(AggregateError);

            try {
                source.emit(1);
            } catch (aggregateError) {
                expect(aggregateError).toBeInstanceOf(AggregateError);
                expect((aggregateError as AggregateError).message).toBe("Failed to call flow listeners");
                expect((aggregateError as AggregateError).errors).toEqual([error1, error2]);
            }
        });

        it("should still update the state even if listeners throw", () => {
            const source = createFlow(0);
            const flow = new ComputedFlow(({ get }) => get(source));
            flow.subscribe(() => {
                throw new Error("Listener error");
            });

            expect(flow.getSnapshot()).toBe(0);

            expect(() => {
                source.emit(1);
            }).toThrow();
            expect(flow.getSnapshot()).toBe(1);
        });

        it("should call all listeners even if some throw", () => {
            const source = createFlow(0);
            const flow = new ComputedFlow(({ get }) => get(source));
            const listener1 = vi.fn(() => {
                throw new Error("Error 1");
            });
            const listener2 = vi.fn();
            const listener3 = vi.fn(() => {
                throw new Error("Error 3");
            });

            flow.subscribe(listener1);
            flow.subscribe(listener2);
            flow.subscribe(listener3);

            expect(() => {
                source.emit(1);
            }).toThrow();

            expect(listener1).toHaveBeenCalledTimes(1);
            expect(listener2).toHaveBeenCalledTimes(1);
            expect(listener3).toHaveBeenCalledTimes(1);
        });

        it("should handle mixed success and error scenarios", () => {
            const source = createFlow(0);
            const flow = new ComputedFlow(({ get }) => get(source));
            const successListener = vi.fn();
            const errorListener = vi.fn(() => {
                throw new Error("Test error");
            });

            flow.subscribe(successListener);
            flow.subscribe(errorListener);
            flow.subscribe(successListener);

            expect(() => {
                source.emit(1);
            }).toThrow(AggregateError);
            expect(successListener).toHaveBeenCalledTimes(2);
            expect(errorListener).toHaveBeenCalledTimes(1);
        });
    });

    describe("skip behavior", () => {
        it("should provide skip() method to abort computation", () => {
            const source = createFlow(1);
            const flow = new ComputedFlow(({ get, skip }) => {
                const value = get(source);
                if (value % 2 === 0) {
                    skip();
                }
                return { value };
            });

            expectTypeOf(flow).toEqualTypeOf<ComputedFlow<{ value: number }>>();

            const value1 = flow.getSnapshot();
            expect(value1).toEqual({ value: 1 });

            source.emit(2);
            const value2 = flow.getSnapshot();
            expect(value2).toEqual({ value: 1 });
            expect(value2).toBe(value1);

            source.emit(3);
            const value3 = flow.getSnapshot();
            expect(value3).toEqual({ value: 3 });
            expect(value3).not.toBe(value2);

            source.emit(4);
            const value4 = flow.getSnapshot();
            expect(value4).toEqual({ value: 3 });
            expect(value4).toBe(value3);
        });

        it("should return initial value if first computation was skipped", () => {
            const source = createFlow(0);
            const flow = new ComputedFlow(
                ({ get, skip }) => {
                    const value = get(source);
                    if (value % 2 === 0) {
                        skip();
                    }
                    return value;
                },
                { initialValue: -1 },
            );

            expectTypeOf(flow).toEqualTypeOf<ComputedFlow<number>>();
            expect(flow.getSnapshot()).toBe(-1);

            source.emit(1);
            expect(flow.getSnapshot()).toBe(1);

            source.emit(2);
            expect(flow.getSnapshot()).toBe(1);

            source.emit(3);
            expect(flow.getSnapshot()).toBe(3);
        });

        it("should accept undefined as intial value", () => {
            const source = createFlow(0);
            const flow = new ComputedFlow(
                ({ get, skip }) => {
                    const value = get(source);
                    if (value % 2 === 0) {
                        skip();
                    }
                    return value;
                },
                { initialValue: undefined },
            );

            expectTypeOf(flow).toEqualTypeOf<ComputedFlow<number | undefined>>();
            expect(flow.getSnapshot()).toBe(undefined);

            source.emit(1);
            expect(flow.getSnapshot()).toBe(1);

            source.emit(2);
            expect(flow.getSnapshot()).toBe(1);

            source.emit(3);
            expect(flow.getSnapshot()).toBe(3);
        });

        it("should accept null as intial value", () => {
            const source = createFlow(0);
            const flow = new ComputedFlow(
                ({ get, skip }) => {
                    const value = get(source);
                    if (value % 2 === 0) {
                        skip();
                    }
                    return value;
                },
                { initialValue: null },
            );

            expectTypeOf(flow).toEqualTypeOf<ComputedFlow<number | null>>();
            expect(flow.getSnapshot()).toBe(null);

            source.emit(1);
            expect(flow.getSnapshot()).toBe(1);

            source.emit(2);
            expect(flow.getSnapshot()).toBe(1);

            source.emit(3);
            expect(flow.getSnapshot()).toBe(3);
        });

        it("should accept different types in getter and initialValue", () => {
            const source = createFlow(0);
            const flow = new ComputedFlow<number | "skip">(
                ({ get, skip }) => {
                    const value = get(source);
                    if (value % 2 === 0) {
                        skip();
                    }
                    return value;
                },
                { initialValue: "skip" },
            );

            expectTypeOf(flow).toEqualTypeOf<ComputedFlow<number | "skip">>();
            expect(flow.getSnapshot()).toBe("skip");

            source.emit(1);
            expect(flow.getSnapshot()).toBe(1);

            source.emit(2);
            expect(flow.getSnapshot()).toBe(1);

            source.emit(3);
            expect(flow.getSnapshot()).toBe(3);
        });

        it("should throw error if first computation was skipped and initial value was not set", () => {
            const source = createFlow(0);
            const flow = new ComputedFlow(({ get, skip }) => {
                const value = get(source);
                if (value % 2 === 0) {
                    skip();
                }
                return { value };
            });

            expect(() => flow.getSnapshot()).toThrow();
        });
    });

    describe("edge cases", () => {
        it("should handle getter returning undefined and null", () => {
            const source = createFlow<undefined | null>(undefined);
            const flow = new ComputedFlow((ctx) => ctx.get(source));

            expect(flow.getSnapshot()).toBe(undefined);

            source.emit(null);
            expect(flow.getSnapshot()).toBe(null);

            source.emit(undefined);
            expect(flow.getSnapshot()).toBe(undefined);
        });

        it("should work with other computed flows as sources", () => {
            const source = createFlow(1);
            const flow1 = new ComputedFlow((ctx) => ctx.get(source) * 2);
            const flow2 = new ComputedFlow((ctx) => ctx.get(flow1) * 2);

            expect(flow1.getSnapshot()).toBe(2);
            expect(flow2.getSnapshot()).toBe(4);

            source.emit(2);
            expect(flow1.getSnapshot()).toBe(4);
            expect(flow2.getSnapshot()).toBe(8);

            source.emit(3);
            expect(flow1.getSnapshot()).toBe(6);
            expect(flow2.getSnapshot()).toBe(12);
        });
    });

    /**
     * Adapted from signals polyfill
     * https://github.com/proposal-signals/signal-polyfill/blob/main/tests/behaviors/graph.test.ts
     */
    describe("graph", () => {
        it("should drop X->B->X updates", () => {
            //     X
            //   / |
            //  A  | <- Looks like a flag doesn't it? :D
            //   \ |
            //     B
            //     |
            //     C

            const $x = createFlow(2);

            const $a = new ComputedFlow((ctx) => ctx.get($x) - 1);
            const $b = new ComputedFlow((ctx) => ctx.get($x) + ctx.get($a));

            const compute = vi.fn((ctx: FlowComputationContext) => "c: " + ctx.get($b).toString());
            const $c = new ComputedFlow(compute);

            expect($c.getSnapshot()).toBe("c: 3");
            expect(compute).toHaveBeenCalledTimes(1);
            compute.mockReset();

            $x.emit(4);
            $c.getSnapshot();
            expect(compute).toHaveBeenCalledTimes(1);
        });

        it("should only update every signal once (diamond graph)", () => {
            // In this scenario "D" should only update once when "A" receive an update. This is sometimes
            // referred to as the "diamond" scenario.
            //     X
            //   /   \
            //  A     B
            //   \   /
            //     C

            const $x = createFlow("a");
            const $a = new ComputedFlow((ctx) => ctx.get($x));
            const $b = new ComputedFlow((ctx) => ctx.get($x));

            const spy = vi.fn((ctx: FlowComputationContext) => ctx.get($a) + " " + ctx.get($b));
            const $c = new ComputedFlow(spy);

            expect($c.getSnapshot()).toBe("a a");
            expect(spy).toHaveBeenCalledTimes(1);

            $x.emit("aa");
            expect($c.getSnapshot()).toBe("aa aa");
            expect(spy).toHaveBeenCalledTimes(2);
        });

        it("should only update every signal once (diamond graph + tail)", () => {
            // "D" will be likely updated twice if our mark+sweep logic is buggy.
            //     X
            //   /   \
            //  A     B
            //   \   /
            //     C
            //     |
            //     D

            const $x = createFlow("a");

            const $a = new ComputedFlow((ctx) => ctx.get($x));
            const $b = new ComputedFlow((ctx) => ctx.get($x));
            const $c = new ComputedFlow((ctx) => ctx.get($a) + " " + ctx.get($b));

            const spy = vi.fn((ctx: FlowComputationContext) => ctx.get($c));
            const $d = new ComputedFlow(spy);

            expect($d.getSnapshot()).toBe("a a");
            expect(spy).toHaveBeenCalledTimes(1);

            $x.emit("aa");
            expect($d.getSnapshot()).toBe("aa aa");
            expect(spy).toHaveBeenCalledTimes(2);
        });

        it("should bail out if result is the same", () => {
            // Bail out if value of "A" never changes
            // X->A->B

            const $x = createFlow("a");

            const $a = new ComputedFlow((ctx) => {
                ctx.get($x);
                return "foo";
            });

            const spy = vi.fn((ctx: FlowComputationContext) => ctx.get($a));
            const $b = new ComputedFlow(spy);

            expect($b.getSnapshot()).toBe("foo");
            expect(spy).toHaveBeenCalledTimes(1);

            $x.emit("aa");
            expect($b.getSnapshot()).toBe("foo");
            expect(spy).toHaveBeenCalledTimes(1);
        });

        it("should only update every signal once (jagged diamond graph + tails)", () => {
            // "E" and "F" will be likely updated >3 if our mark+sweep logic is buggy.
            //     X
            //   /   \
            //  A     B
            //  |     |
            //  |     C
            //   \   /
            //     D
            //   /   \
            //  E     F

            const $x = createFlow("a");

            const $a = new ComputedFlow((ctx) => ctx.get($x));
            const $b = new ComputedFlow((ctx) => ctx.get($x));
            const $c = new ComputedFlow((ctx) => ctx.get($b));

            const dSpy = vi.fn((ctx: FlowComputationContext) => ctx.get($a) + " " + ctx.get($c));
            const $d = new ComputedFlow(dSpy);

            const eSpy = vi.fn((ctx: FlowComputationContext) => ctx.get($d));
            const $e = new ComputedFlow(eSpy);
            const fSpy = vi.fn((ctx: FlowComputationContext) => ctx.get($d));
            const $f = new ComputedFlow(fSpy);

            expect($e.getSnapshot()).toBe("a a");
            expect(eSpy).toHaveBeenCalledTimes(1);

            expect($f.getSnapshot()).toBe("a a");
            expect(fSpy).toHaveBeenCalledTimes(1);

            $x.emit("b");

            expect($d.getSnapshot()).toBe("b b");
            expect(dSpy).toHaveBeenCalledTimes(2);

            expect($e.getSnapshot()).toBe("b b");
            expect(eSpy).toHaveBeenCalledTimes(2);

            expect($f.getSnapshot()).toBe("b b");
            expect(fSpy).toHaveBeenCalledTimes(2);

            $x.emit("c");

            expect($d.getSnapshot()).toBe("c c");
            expect(dSpy).toHaveBeenCalledTimes(3);

            expect($e.getSnapshot()).toBe("c c");
            expect(eSpy).toHaveBeenCalledTimes(3);

            expect($f.getSnapshot()).toBe("c c");
            expect(fSpy).toHaveBeenCalledTimes(3);
        });

        it("should ensure subs update even if one dep is static", () => {
            //     X
            //   /   \
            //  A     *B <- returns same value every time
            //   \   /
            //     C

            const $x = createFlow("a");

            const $a = new ComputedFlow((ctx) => ctx.get($x));
            const $b = new ComputedFlow((ctx) => {
                ctx.get($x);
                return "c";
            });

            const spy = vi.fn((ctx: FlowComputationContext) => ctx.get($a) + " " + ctx.get($b));
            const $c = new ComputedFlow(spy);

            expect($c.getSnapshot()).toBe("a c");

            $x.emit("aa");

            expect($c.getSnapshot()).toBe("aa c");
            expect(spy).toHaveBeenCalledTimes(2);
        });

        it("should ensure subs update even if two deps mark it clean", () => {
            // In this scenario both "B" and "C" always return the same value. But "D" must still update
            // because "X" marked it. If "D" isn't updated, then we have a bug.
            //     X
            //   / | \
            //  A *B *C
            //   \ | /
            //     D

            const $x = createFlow("a");

            const $b = new ComputedFlow((ctx) => ctx.get($x));
            const $c = new ComputedFlow((ctx) => {
                ctx.get($x);
                return "c";
            });
            const $d = new ComputedFlow((ctx) => {
                ctx.get($x);
                return "d";
            });

            const spy = vi.fn((ctx: FlowComputationContext) => ctx.get($b) + " " + ctx.get($c) + " " + ctx.get($d));
            const $e = new ComputedFlow(spy);

            expect($e.getSnapshot()).toBe("a c d");

            $x.emit("aa");

            expect($e.getSnapshot()).toBe("aa c d");
            expect(spy).toHaveBeenCalledTimes(2);
        });

        it("propagates in topological order", () => {
            //
            //     c1
            //    /  \
            //   /    \
            //  b1     b2
            //   \    /
            //    \  /
            //     a1
            //
            let seq = "";
            const a1 = createFlow(false);
            const b1 = new ComputedFlow((ctx) => {
                ctx.get(a1);
                seq += "b1";
                return {};
            });
            const b2 = new ComputedFlow((ctx) => {
                ctx.get(a1);
                seq += "b2";
                return {};
            });
            const c1 = new ComputedFlow((ctx) => {
                ctx.get(b1);
                ctx.get(b2);
                seq += "c1";
                return {};
            });

            c1.getSnapshot();
            seq = "";
            a1.emit(true);
            c1.getSnapshot();
            expect(seq).toBe("b1b2c1");
        });

        it("only propagates once with linear convergences", () => {
            //         d
            //         |
            // +---+---+---+---+
            // v   v   v   v   v
            // f1  f2  f3  f4  f5
            // |   |   |   |   |
            // +---+---+---+---+
            //         v
            //         g
            let gcount = 0;
            const d = createFlow(0);
            const f1 = new ComputedFlow((ctx) => ctx.get(d));
            const f2 = new ComputedFlow((ctx) => ctx.get(d));
            const f3 = new ComputedFlow((ctx) => ctx.get(d));
            const f4 = new ComputedFlow((ctx) => ctx.get(d));
            const f5 = new ComputedFlow((ctx) => ctx.get(d));
            const g = new ComputedFlow((ctx) => {
                gcount++;
                return ctx.get(f1) + ctx.get(f2) + ctx.get(f3) + ctx.get(f4) + ctx.get(f5);
            });

            g.getSnapshot();
            gcount = 0;
            d.emit(1);
            g.getSnapshot();
            expect(gcount).toBe(1);
        });

        it("only propagates once with exponential convergence", () => {
            //     d
            //     |
            // +---+---+
            // v   v   v
            // f1  f2 f3
            //   \ | /
            //     O
            //   / | \
            // v   v   v
            // g1  g2  g3
            // +---+---+
            //     v
            //     h
            let hcount = 0;
            const d = createFlow(0);
            const f1 = new ComputedFlow((ctx) => {
                return ctx.get(d);
            });
            const f2 = new ComputedFlow((ctx) => {
                return ctx.get(d);
            });
            const f3 = new ComputedFlow((ctx) => {
                return ctx.get(d);
            });
            const g1 = new ComputedFlow((ctx) => {
                return ctx.get(f1) + ctx.get(f2) + ctx.get(f3);
            });
            const g2 = new ComputedFlow((ctx) => {
                return ctx.get(f1) + ctx.get(f2) + ctx.get(f3);
            });
            const g3 = new ComputedFlow((ctx) => {
                return ctx.get(f1) + ctx.get(f2) + ctx.get(f3);
            });
            const h = new ComputedFlow((ctx) => {
                hcount++;
                return ctx.get(g1) + ctx.get(g2) + ctx.get(g3);
            });
            h.getSnapshot();
            hcount = 0;
            d.emit(1);
            h.getSnapshot();
            expect(hcount).toBe(1);
        });

        it("does not trigger downstream computations unless changed", () => {
            const s1 = createFlow({ value: 1 });
            let order = "";
            const t1 = new ComputedFlow((ctx) => {
                order += "t1";
                return ctx.get(s1).value;
            });
            const t2 = new ComputedFlow((ctx) => {
                order += "c1";
                ctx.get(t1);
            });
            t2.getSnapshot();
            expect(order).toBe("c1t1");
            order = "";
            s1.emit({ value: 1 });
            t2.getSnapshot();
            expect(order).toBe("t1");
            order = "";
            s1.emit({ value: 2 });
            t2.getSnapshot();
            expect(order).toBe("t1c1");
        });

        it("applies updates to changed dependees in same order as new ComputedFlow", () => {
            const s1 = createFlow(0);
            let order = "";
            const t1 = new ComputedFlow((ctx) => {
                order += "t1";
                return ctx.get(s1) === 0;
            });
            const t2 = new ComputedFlow((ctx) => {
                order += "c1";
                return ctx.get(s1);
            });
            const t3 = new ComputedFlow((ctx) => {
                order += "c2";
                return ctx.get(t1);
            });
            t2.getSnapshot();
            t3.getSnapshot();
            expect(order).toBe("c1c2t1");
            order = "";
            s1.emit(1);
            t2.getSnapshot();
            t3.getSnapshot();
            expect(order).toBe("c1t1c2");
        });

        it("updates downstream pending computations", () => {
            const s1 = createFlow(0);
            const s2 = createFlow(0);
            let order = "";
            const t1 = new ComputedFlow((ctx) => {
                order += "t1";
                return ctx.get(s1) === 0;
            });
            const t2 = new ComputedFlow((ctx) => {
                order += "c1";
                return ctx.get(s1);
            });
            const t3 = new ComputedFlow((ctx) => {
                order += "c2";
                ctx.get(t1);
                return new ComputedFlow((innerCtx) => {
                    order += "c2_1";
                    return innerCtx.get(s2);
                });
            });
            order = "";
            s1.emit(1);
            t2.getSnapshot();
            t3.getSnapshot().getSnapshot();
            expect(order).toBe("c1c2t1c2_1");
        });

        describe("with changing dependencies", () => {
            let i: MutableFlow<boolean>;
            let t: MutableFlow<number>;
            let e: MutableFlow<number>;
            let fevals: number;
            let f: Flow<number>;

            function init() {
                i = createFlow<boolean>(true);
                t = createFlow(1);
                e = createFlow(2);
                fevals = 0;
                f = new ComputedFlow((ctx) => {
                    fevals++;
                    return ctx.get(i) ? ctx.get(t) : ctx.get(e);
                });
                f.getSnapshot();
                fevals = 0;
            }

            it("updates on active dependencies", () => {
                init();
                t.emit(5);
                expect(f.getSnapshot()).toBe(5);
                expect(fevals).toBe(1);
            });

            it("does not update on inactive dependencies", () => {
                init();
                e.emit(5);
                expect(f.getSnapshot()).toBe(1);
                expect(fevals).toBe(0);
            });

            it("deactivates obsolete dependencies", () => {
                init();
                i.emit(false);
                f.getSnapshot();
                fevals = 0;
                t.emit(5);
                f.getSnapshot();
                expect(fevals).toBe(0);
            });

            it("activates new dependencies", () => {
                init();
                i.emit(false);
                fevals = 0;
                e.emit(5);
                f.getSnapshot();
                expect(fevals).toBe(1);
            });

            it("ensures that new dependencies are updated before dependee", () => {
                let order = "";
                const a = createFlow(0);
                const b = new ComputedFlow((ctx) => {
                    order += "b";
                    return ctx.get(a) + 1;
                });
                const c = new ComputedFlow((ctx) => {
                    order += "c";
                    const check = ctx.get(b);
                    if (check) {
                        return check;
                    }
                    return ctx.get(e);
                });
                const d = new ComputedFlow((ctx) => {
                    return ctx.get(a);
                });
                const e = new ComputedFlow((ctx) => {
                    order += "d";
                    return ctx.get(d) + 10;
                });

                c.getSnapshot();
                e.getSnapshot();
                expect(order).toBe("cbd");

                order = "";
                a.emit(-1);
                c.getSnapshot();
                e.getSnapshot();

                expect(order).toBe("bcd");
                expect(c.getSnapshot()).toBe(9);

                order = "";
                a.emit(0);
                c.getSnapshot();
                e.getSnapshot();
                expect(order).toBe("bcd");
                expect(c.getSnapshot()).toBe(1);
            });
        });

        it("does not update subsequent pending computations after stale invocations", () => {
            const s1 = createFlow(1);
            const s2 = createFlow(false);
            let count = 0;
            //         s1
            //         |
            //     +---+---+
            //    t1 t2 c1 t3
            //     \       /
            //        c3
            //  [PN,PN,STL,void]
            const t1 = new ComputedFlow((ctx) => ctx.get(s1) > 0);
            const t2 = new ComputedFlow((ctx) => ctx.get(s1) > 0);
            const c1 = new ComputedFlow((ctx) => ctx.get(s1));
            const t3 = new ComputedFlow((ctx) => {
                const a = ctx.get(s1);
                const b = ctx.get(s2);
                return a && b;
            });
            const c3 = new ComputedFlow((ctx) => {
                ctx.get(t1);
                ctx.get(t2);
                ctx.get(c1);
                ctx.get(t3);
                count++;
            });
            c3.getSnapshot();
            s2.emit(true);
            c3.getSnapshot();
            expect(count).toBe(2);
            s1.emit(2);
            c3.getSnapshot();
            expect(count).toBe(3);
        });

        it("evaluates stale computations before dependees when trackers stay unchanged", () => {
            // This test verifies the evaluation order when some computations return the same value
            // but others change. The system should evaluate stale computations before their dependees.
            //
            //     s1 (changes: 1 -> 2 -> 3)
            //     |
            // +---+----+
            // |   |    |
            // t1  t2  *c1 (always changes due to return {})
            //  \  |  /
            //   \ | /
            //    c2
            //
            // Expected evaluation order:
            // - When s1: 1 -> 1: t1, t2 don't change, but c1 changes -> "t1t2c1c2"
            // - When s1: 1 -> 3: t1 changes first, then c2 runs, then t2, then c1 -> "t1c2t2c1"

            const s1 = createFlow(1);
            let order = "";
            const t1 = new ComputedFlow((ctx) => {
                order += "t1";
                return ctx.get(s1) > 2;
            });
            const t2 = new ComputedFlow((ctx) => {
                order += "t2";
                return ctx.get(s1) > 2;
            });
            const c1 = new ComputedFlow((ctx) => {
                order += "c1";
                ctx.get(s1);
                return {};
            });
            const c2 = new ComputedFlow((ctx) => {
                order += "c2";
                ctx.get(t1);
                ctx.get(t2);
                ctx.get(c1);
            });
            c2.getSnapshot();
            order = "";
            s1.emit(2);
            c2.getSnapshot();
            expect(order).toBe("t1t2c1c2");
            order = "";
            s1.emit(3);
            c2.getSnapshot();
            expect(order).toBe("t1c2t2c1");
        });

        it("correctly marks downstream computations as stale on change", () => {
            const s1 = createFlow(1);
            let order = "";
            const t1 = new ComputedFlow((ctx) => {
                order += "t1";
                return ctx.get(s1);
            });
            const c1 = new ComputedFlow((ctx) => {
                order += "c1";
                return ctx.get(t1);
            });
            const c2 = new ComputedFlow((ctx) => {
                order += "c2";
                return ctx.get(c1);
            });
            const c3 = new ComputedFlow((ctx) => {
                order += "c3";
                return ctx.get(c2);
            });
            c3.getSnapshot();
            order = "";
            s1.emit(2);
            c3.getSnapshot();
            expect(order).toBe("t1c1c2c3");
        });

        // https://github.com/preactjs/signals/blob/main/packages/core/test/signal.test.tsx#L1706
        it("should not update a sub if all deps unmark it", () => {
            // In this scenario "B" and "C" always return the same value. When "A"
            // changes, "D" should not update.
            //     A
            //   /   \
            // *B     *C
            //   \   /
            //     D

            const a = createFlow("a");
            const b = new ComputedFlow((ctx) => {
                ctx.get(a);
                return "b";
            });
            const c = new ComputedFlow((ctx) => {
                ctx.get(a);
                return "c";
            });
            const spy = vi.fn((ctx: FlowComputationContext) => ctx.get(b) + " " + ctx.get(c));
            const d = new ComputedFlow(spy);

            expect(d.getSnapshot()).toBe("b c");
            spy.mockReset();

            a.emit("aa");
            expect(spy).not.toHaveBeenCalled();
        });
    });

    describe("side effects detection", () => {
        // side effects in getter
        // reading in notify
        it("");
    });

    describe("cycles detection", () => {
        // detects trivial cycles
        // detects slightly larger cycles
        // detects depending on self
        it("");
    });

    describe("custom equality", () => {
        // todo
        it("");
    });
});

function getSubscriptionsCount(flow: Flow<unknown>): number {
    // @ts-expect-error в тестах используется реализация, у которой можно прочитать кол-во подписок
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const subscriptions: Set<unknown> = flow.subscriptions;
    return subscriptions.size;
}
