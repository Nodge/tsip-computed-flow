---
"@tsip/computed-flow": minor
---

Improve listener error handling: errors in listeners are now logged via `console.error` instead of throwing an `AggregatedError`. This ensures the flow state remains consistent even when individual listeners fail, preventing cascading failures and improving application resilience.
