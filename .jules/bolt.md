## 2025-01-15 - Reusable Geometry Rectangles for Collision Bounds
**Learning:** Phaser 3 `GameObject.getBounds()` and custom bounding box helpers allocate a new `Phaser.Geom.Rectangle` on every call unless an output rectangle is provided. Calling `getBounds()` inside 60FPS update loops across multiple active entities creates thousands of short-lived objects per second, leading to GC pauses and frame stutters on mobile browsers.
**Action:** Always accept an optional `out: Phaser.Geom.Rectangle` parameter defaulting to a pre-allocated instance property, and pass pre-allocated output rectangles to `getBounds(out)` calls in update loops.

## 2025-01-16 - Direct Coordinate Arithmetic for Entity Bounds & Hoisting Bounds Calculations
**Learning:** Phaser 3 `GameObject.prototype.getBounds()` computes matrix transforms, scale, and world coordinates even when an output rectangle is passed. For entities with fixed or known dimensions (like projectiles, couriers, and trams), calling `getBounds()` inside inner collision loops (e.g., N couriers × M pens) recalculates world transforms O(N × M) times per frame.
**Action:** Calculate bounds via direct arithmetic (`x - w/2`, `y - h/2`) for simple entities, and hoist static target bounds (`c.getHitBounds()`, `player.getHitBounds()`) outside nested collision loops to reduce per-frame bounds math from O(N × M) to O(N + M).
