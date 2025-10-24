import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        // Use forks pool to allow custom Node.js flags
        pool: "forks",
        poolOptions: {
            forks: {
                // Expose gc() function for garbage collection tests
                execArgv: ["--expose-gc"],
            },
        },
    },
});
