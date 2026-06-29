# @conference/types — Deprecated

**Status:** Deprecated, out-of-sync with the live schema. Do not import from new code.

This package predates the Prisma migration. It declares Supabase-era domain types with lowercase enums (`'attendee'` / `'organizer'`) and snake_case field names (`full_name`, `avatar_url`, `created_at`) that no longer match the schema served by [`@conference/db`](../db/README.md), which uses uppercase enums and camelCase columns.

The only remaining importer is [`@conference/supabase`](../supabase/README.md), which is itself dead code. `apps/attendee/package.json` and `apps/web/package.json` still list this package as a workspace dep but no source file imports it.

If you need a domain type, import it from `@conference/db` instead — Prisma generates the canonical row types and `packages/db/src/index.ts` re-exports them.

This package should be removable once the dead `@conference/supabase` package is deleted; tracked as a post-sprint cleanup, not in scope for the current demo work.
