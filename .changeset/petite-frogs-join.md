---
"@tsip/computed-flow": patch
---

Fix stale subscriptions bug where listeners added after initial computation were not properly subscribed to flow sources. Ensures all listeners correctly receive updates regardless of when they are attached.
