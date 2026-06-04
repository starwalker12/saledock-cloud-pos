## 2024-06-04 - O(n) Date Iteration Optimization
**Learning:** Iterating over large date ranges day-by-day (e.g. `for (let d = start; d <= end; d.setDate(d.getDate() + 1))`) is an O(n) operation that can become a performance bottleneck for large ranges.
**Action:** Replace O(n) date iterations with O(1) mathematical subtraction (`Math.floor((end - start) / (1000 * 60 * 60 * 24))`) whenever possible to find total days.
