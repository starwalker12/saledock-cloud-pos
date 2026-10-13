import { loadMoneyModule } from './load-money-module.mjs';

// Execute the actual reporting modules against a read-only fixture snapshot.
// This also models PostgREST filtering/pagination instead of returning every row.
export function reportingClient(rows, trace = []) {
  return {
    rpc: async () => ({ data: [], error: null }),
    from(table) {
      const predicates = []; let order; let first = 0; let last = Infinity;
      const compare = (a, b) => typeof b === 'string' && /^\d{4}-\d\d-\d\d/.test(b)
        ? Date.parse(a) - Date.parse(b) : a < b ? -1 : a > b ? 1 : 0;
      const query = {
        select() { return query; },
        eq(key, value) { predicates.push(row => row[key] === value); return query; },
        neq(key, value) { predicates.push(row => row[key] !== value); return query; },
        in(key, values) { predicates.push(row => values.includes(row[key])); return query; },
        gt(key, value) { predicates.push(row => compare(row[key], value) > 0); return query; },
        gte(key, value) { predicates.push(row => compare(row[key], value) >= 0); return query; },
        lte(key, value) { predicates.push(row => compare(row[key], value) <= 0); return query; },
        order(key) { order = key; return query; },
        range(start, end) { first = start; last = end; return query; },
        limit(count) { last = first + count - 1; return query; },
        then(resolve, reject) {
          let data = (rows[table] ?? []).filter(row => predicates.every(predicate => predicate(row)));
          if (order) data = [...data].sort((a, b) => compare(a[order], b[order]));
          const count = data.length;
          data = data.slice(first, last + 1);
          trace.push({ table, first, last, count, returned: data.length });
          return Promise.resolve({ data, count, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

export async function reportingPair(rows, org, branch, date) {
  const client = reportingClient(rows);
  const mocks = { 'server-only': {}, '@/lib/supabase/server': { createClient: async () => client } };
  const dashboard = await loadMoneyModule('src/lib/data/dashboard.ts', mocks).getDashboardSummary(org, branch);
  const reports = await loadMoneyModule('src/lib/data/reports.ts', mocks).getReportsData(org, branch, date, date);
  return { dashboard, reports };
}
