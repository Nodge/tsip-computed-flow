# @tsip/computed-flow - Computed Reactive Data Flows for TypeScript

A TypeScript implementation of computed reactive flows based on the [TypeScript Interface Proposals (TSIP)](https://github.com/Nodge/ts-interface-proposals). This library provides derived computations that automatically recompute when any tracked dependency emits a new value.

## Features

- **Standards-Based**: Built on the TypeScript Interface Proposals for seamless compatibility with TSIP-compatible libraries
- **Type-Safe**: Full TypeScript support with comprehensive type inference
- **Automatic Dependency Tracking**: Computed flows automatically track their dependencies and recompute when needed
- **Parameterized Computations**: Create computed flows that accept parameters with automatic memoization
- **Async Support**: Handle asynchronous computations, including tracking of async dependencies
- **Lightweight**: Zero dependencies and only 2.8KB minified+gzipped
- **Universal**: Works in Node.js, browsers, and any JavaScript environment

## Installation

```bash
npm install @tsip/computed-flow
# or
yarn add @tsip/computed-flow
# or
pnpm add @tsip/computed-flow
```

## Quick Start

```typescript
import { createFlow } from "@tsip/flow";
import { computedFlow } from "@tsip/computed-flow";

// Create source flows
const firstName = createFlow("John");
const lastName = createFlow("Doe");

// Create a computed flow that derives from sources
const fullName = computedFlow(({ watch }) => {
    return `${watch(firstName)} ${watch(lastName)}`;
});

// Subscribe to changes
fullName.subscribe(() => {
    console.log("Full name:", fullName.getSnapshot());
});

// Update source - computed flow automatically updates
firstName.emit("Jane"); // Logs: "Full name: Jane Doe"
```

## API

### `computedFlow<T>(getter, options?)`

Creates a synchronous computed flow that derives its value from other flows.

#### Basic Usage

```typescript
import { createFlow } from "@tsip/flow";
import { computedFlow } from "@tsip/computed-flow";

const count = createFlow(5);
const doubled = computedFlow(({ watch }) => {
    return watch(count) * 2;
});

console.log(doubled.getSnapshot()); // 10
count.emit(10);
console.log(doubled.getSnapshot()); // 20
```

#### Parameterized Computed Flows

```typescript
import { createFlow } from "@tsip/flow";
import { computedFlow } from "@tsip/computed-flow";

const users = createFlow([
    { id: 1, name: "Alice" },
    { id: 2, name: "Bob" },
]);

// Create a parameterized computed flow
const userById = computedFlow(({ watch }, userId: number) => {
    return watch(users).find((u) => u.id === userId);
});

// Each parameter gets its own memoized instance
const alice = userById(1);
const bob = userById(2);

console.log(alice.getSnapshot()); // { id: 1, name: "Alice" }
console.log(bob.getSnapshot()); // { id: 2, name: "Bob" }
```

#### Options

```typescript
interface ComputedFlowOptions<Data, Param> {
    // Initial value when computation fails with abort error
    initialValue?: Data;

    // Custom equality function for computed values
    equals?: (a: Data, b: Data) => boolean;

    // Custom equality function for parameters (parameterized flows only)
    paramEquals?: (a: Param, b: Param) => boolean;
}
```

### `asyncComputedFlow<T>(getter, options?)`

Creates an asynchronous computed flow that can handle async operations and async dependencies.

#### Using Async Functions

```typescript
import { createAsyncFlow } from "@tsip/flow";
import { asyncComputedFlow } from "@tsip/computed-flow";

const userFlow = createAsyncFlow<User>({ status: "pending" });

const userName = asyncComputedFlow(async ({ watchAsync }) => {
    const user = await watchAsync(userFlow);
    return user.name;
});

// Subscribe to state changes
userName.subscribe(() => {
    const state = userName.getSnapshot();
    if (state.status === "success") {
        console.log("User name:", state.data);
    } else if (state.status === "error") {
        console.error("Error:", state.error);
    }
});

// Or wait for data directly
const name = await userName.asPromise();
```

#### Using Generator Functions

Generator functions allow adding new dependencies after awaiting async operations, unlike async/await which only allows adding dependencies before the first `await`:

```typescript
import { createAsyncFlow, createFlow } from "@tsip/flow";
import { asyncComputedFlow } from "@tsip/computed-flow";

const userFlow = createAsyncFlow<User>({ status: "pending" });
const userDetailsFlow = createAsyncFlow<UserDetails>({ status: "pending" });
const includeDetails = createFlow(false);

const userProfile = asyncComputedFlow(function* ({ watch, watchAsync }) {
    // Fetch user data
    const user = yield* watchAsync(userFlow);

    // Can add dependencies AFTER async operations
    if (watch(includeDetails)) {
        const details = yield* watchAsync(userDetailsFlow);
        return { ...user, details };
    }

    return user;
});
```

#### Parameterized Async Flows

```typescript
import { asyncComputedFlow } from "@tsip/computed-flow";

const userName = asyncComputedFlow(async ({ watchAsync }, userId: string) => {
    const user = await watchAsync(getUserFlow(userId));
    return user.name;
});

// Each parameter gets its own memoized instance
const user1 = fetchUser("user-1");
const user2 = fetchUser("user-2");
```

## Utility Functions

### `mapFlow<T, U>(flow, mapper)`

Transform values from a flow:

```typescript
import { createFlow } from "@tsip/flow";
import { mapFlow } from "@tsip/computed-flow";

const numbers = createFlow(2);
const doubled = mapFlow(numbers, (n) => n * 2);

console.log(doubled.getSnapshot()); // 4
numbers.emit(3);
console.log(doubled.getSnapshot()); // 6
```

### `filterFlow<T>(flow, predicate)`

Filter values from a flow:

```typescript
import { createFlow } from "@tsip/flow";
import { filterFlow } from "@tsip/computed-flow";

const numbers = createFlow(2);
const evens = filterFlow(numbers, (n) => n % 2 === 0);

console.log(evens.getSnapshot()); // 2
numbers.emit(3);
console.log(evens.getSnapshot()); // 2
numbers.emit(4);
console.log(evens.getSnapshot()); // 4
```

### `mapAsyncFlow<T, U>(flow, mapper)`

Transform values from an async flow:

```typescript
import { createAsyncFlow } from "@tsip/flow";
import { mapAsyncFlow } from "@tsip/computed-flow";

const userFlow = createAsyncFlow({ status: "success", data: { name: "Alice" } });
const nameFlow = mapAsyncFlow(userFlow, (user) => user.name);
```

### `filterAsyncFlow<T>(flow, predicate)`

Filter values from an async flow:

```typescript
import { createAsyncFlow } from "@tsip/flow";
import { filterAsyncFlow } from "@tsip/computed-flow";

const userFlow = createAsyncFlow({ status: "success", data: { active: true } });
const activeUser = filterAsyncFlow(userFlow, (user) => user.active);
```

## Advanced Usage

### Custom Equality

Prevent unnecessary recomputations with custom equality:

```typescript
import { computedFlow } from "@tsip/computed-flow";

const expensiveComputation = computedFlow(
    ({ watch }) => {
        return { result: watch(source) };
    },
    {
        equals: (a, b) => a.result === b.result,
    },
);
```

### Parameter Equality

Control memoization for parameterized flows:

```typescript
import { computedFlow } from "@tsip/computed-flow";

const userFlow = computedFlow(
    ({ watch }, user: { id: number; name: string }) => {
        return watch(source).find((u) => u.id === user.id);
    },
    {
        paramEquals: (a, b) => a.id === b.id,
    },
);

// These return the same instance because id matches
const instance1 = userFlow({ id: 1, name: "Alice" });
const instance2 = userFlow({ id: 1, name: "Bob" });
console.log(instance1 === instance2); // true
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

MIT
