## 2025-01-15 - Reusable Geometry Rectangles for Collision Bounds
**Learning:** Phaser 3 `GameObject.getBounds()` and custom bounding box helpers allocate a new `Phaser.Geom.Rectangle` on every call unless an output rectangle is provided. Calling `getBounds()` inside 60FPS update loops across multiple active entities creates thousands of short-lived objects per second, leading to GC pauses and frame stutters on mobile browsers.
**Action:** Always accept an optional `out: Phaser.Geom.Rectangle` parameter defaulting to a pre-allocated instance property, and pass pre-allocated output rectangles to `getBounds(out)` calls in update loops.

## 2025-01-16 - Direct Coordinate Arithmetic for Entity Bounds & Hoisting Bounds Calculations
**Learning:** Phaser 3 `GameObject.prototype.getBounds()` computes matrix transforms, scale, and world coordinates even when an output rectangle is passed. For entities with fixed or known dimensions (like projectiles, couriers, and trams), calling `getBounds()` inside inner collision loops (e.g., N couriers × M pens) recalculates world transforms O(N × M) times per frame.
**Action:** Calculate bounds via direct arithmetic (`x - w/2`, `y - h/2`) for simple entities, and hoist static target bounds (`c.getHitBounds()`, `player.getHitBounds()`) outside nested collision loops to reduce per-frame bounds math from O(N × M) to O(N + M).

## 2025-01-17 - State-Guarded Display Object Updates & Loop Iterator Elimination
**Learning:** Re-configuring Phaser 3 GameObjects (`setTexture`, `setDisplaySize`, `setText`, `setVisible`) on every frame inside 60FPS update loops forces texture frame lookups and object property mutations even when values have not changed. Additionally, using `for...of` loops over arrays in update routines creates `ArrayIterator` objects every frame.
**Action:** Guard scene element updates with state boolean flags (e.g. `landmarkVisible`) to configure texture/visibility once on state transition and update only positions per frame. Use indexed `for` loops instead of `for...of` iterators in hot per-frame rendering loops.

## 2025-01-18 - Stateful Entity Bounding Box Caching on Position Update
**Learning:** Calling `getBounds()`, `getHitBounds()`, or `getBodyBounds()` inside nested collision loops (e.g. N couriers × M pens) recalculates arithmetic offsets and bounds rectangles repeatedly during the same frame for unchanged entity positions. Maintaining pre-calculated bounding rectangles updated only when entity position changes (during `constructor`, `spawn`, and `update()`) reduces bounds accessor operations from O(N * M) arithmetic computations to O(1) field lookups per collision check.
**Action:** Compute and store entity bounding rectangles (`boundsRect`, `hitBoundsRect`, `bodyBoundsRect`) in `updateBounds()` during position mutations, returning the cached rectangle directly in `getBounds()` / `getHitBounds()`.

## 2025-01-19 - Hoisting and Caching Global Layout Lookups in 60FPS Update Loops
**Learning:** In Phaser 3 scene update loops, calling functions like `getLayout()` across scene update routines and entity methods (`PlayerCar.update`, `OzempicPen.offscreen`, `updateCouriers`, `runSpawns`) executes global state lookups, object destructuring, and DOM checks dozens of times per frame.
**Action:** Obtain `const layout = getLayout();` once at the top of the scene's `update()` method and pass `layout` or specific values down to helper functions and entity update routines.
