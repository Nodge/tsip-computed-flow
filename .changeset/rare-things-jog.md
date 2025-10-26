---
"@tsip/computed-flow": patch
---

Fix `flow.asPromise()` to return a stable promise instance across multiple pending computations, preventing race conditions and ensuring consistent promise references.
