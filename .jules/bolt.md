## 2024-06-04 - Supabase JS GROUP BY Optimization
**Learning:** The `@supabase/supabase-js` client lacks native support for generic `GROUP BY` aggregations. When large in-memory aggregations are bottlenecking Node.js, they must be offloaded to PostgreSQL using custom RPC functions (via migrations).
**Action:** Next time, analyze if complex aggregations can be pushed to the database via an RPC using `SECURITY INVOKER` to maintain RLS, significantly reducing Node.js CPU and memory overhead compared to fetching and grouping rows locally.
