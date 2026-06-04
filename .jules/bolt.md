## 2024-06-04 - Supabase Query N+1 Optimization
**Learning:** Finding the maximum sequence number by fetching all records and mapping over them in memory causes severe N+1 overhead and CPU spikes. Ordering by `created_at` to find the latest sequence is a race condition risk; ordering strings by `job_no` descending safely resolves max sequence values because they are zero-padded.
**Action:** When querying for the latest auto-incremented string sequence, use `.order("job_no", { ascending: false }).limit(1)` instead of fetching all records, which gives O(1) fetch vs O(N).
