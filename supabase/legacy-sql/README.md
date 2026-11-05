# Legacy SQL (historical, do not re-run)

These numbered scripts (`03_…` to `91_…`) were the first generation of database
changes, applied by hand in the Supabase SQL editor before the project used
`supabase/migrations/`. They are kept only as a record of how the schema evolved.

- They are **not** applied by any tool and must **not** be re-run on the live database.
- The live database is the source of truth. Its applied history is visible with
  `supabase migration list` (or the Supabase MCP `list_migrations`); many live
  migrations were applied directly and are not present as files in this repository.
