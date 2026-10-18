Database tests: apply every migration to a throwaway local Postgres database and check the
RLS rules with two firms (owner, KDU, viewer) and a platform admin.

```sh
PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres npm run test:db
```

`local-auth-shim.sql` stands in for what a hosted Supabase database already has (the
`anon`/`authenticated` roles, `auth.users`, `auth.uid()`). It is test-only and is never
applied to a Supabase project.
