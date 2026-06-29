# @conference/supabase — Dead code

**Status:** Dead. No source file in the active four apps imports from this package. Do not import from new code.

This package wraps `@supabase/supabase-js` and exports helper functions (`groupSessionsByDay`, etc.) typed against the deprecated [`@conference/types`](../types/README.md) Supabase-era domain. The Prisma + Turso migration superseded it; the equivalent helpers now live in [`@conference/db`](../db/README.md).

A `grep -rn "from '@conference/supabase'"` across `apps/` and `packages/` finds no runtime imports. The package is left in the workspace because removing it requires also deleting the `@conference/types` workspace dep declarations in `apps/web/package.json` and `apps/attendee/package.json`, which are themselves unused.

Cleanup of this package and `@conference/types` is a post-sprint pass, not in scope for the current demo work.
