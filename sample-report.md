# RLS Lens Report

Generated: demo

Table: public.todos
Operation: select
Role: authenticated
RLS detected: yes
Result: 2/3 allowed

## Matrix

| Attempt | Result | Reason |
|---|---|---|
| row 1 | allowed | At least one permissive policy passed and every restrictive policy passed. |
| row 2 | allowed | At least one permissive policy passed and every restrictive policy passed. |
| row 3 | denied | USING failed: no matching permissive policy evaluated to true for role authenticated. |

## Warnings

- WARNING: Policy "Users can read their own todos" uses auth.uid() without an explicit null guard - Unauthenticated requests make auth.uid() null. Add auth.uid() is not null when the policy is meant for logged-in users.
- WARNING: No parsed index for auth.uid() column "user_id" - Policy "Users can read their own todos" compares auth.uid() to user_id. For larger tables, add or verify an index such as: CREATE INDEX ON public.todos (user_id);

## Parsed Policies

- Users can read their own todos: SELECT permissive TO authenticated
- Public todos are visible: SELECT permissive TO anon, authenticated

## Parsed Grants

- SELECT ON public.todos TO anon
- SELECT, INSERT, UPDATE, DELETE ON public.todos TO authenticated

## Parsed Indexes

- None parsed for this table.

## SQL Smoke Test

```sql
-- RLS Lens smoke test for public.todos
-- Run in a local Supabase SQL editor or psql transaction, then rollback.
begin;

set local role "authenticated";
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- Expected table privilege: GRANT SELECT ON public.todos TO authenticated;
select current_user as simulated_role;
select has_table_privilege(current_user, 'public.todos', 'select') as role_has_table_privilege;

-- Replace this JSON with one of your real rows when validating.
select '{"id":1,"user_id":"11111111-1111-1111-1111-111111111111","title":"Owner private task","is_public":false}'::jsonb as sample_row;

-- Operation-specific probe generated from the current sample input.
select * from "public"."todos" limit 5;

rollback;
```
