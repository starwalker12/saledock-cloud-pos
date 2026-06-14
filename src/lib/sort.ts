export function compareValues(a: unknown, b: unknown, type?: 'string' | 'number' | 'date' | 'natural'): number {
  if (type === 'date') {
    const valA = a ? new Date(a as string | number | Date).getTime() : 0;
    const valB = b ? new Date(b as string | number | Date).getTime() : 0;
    if (isNaN(valA) && isNaN(valB)) return 0;
    if (isNaN(valA)) return 1;
    if (isNaN(valB)) return -1;
    return valA - valB;
  }

  if (type === 'number') {
    const valA = Number(a);
    const valB = Number(b);
    if (isNaN(valA) && isNaN(valB)) return 0;
    if (isNaN(valA)) return 1;
    if (isNaN(valB)) return -1;
    return valA - valB;
  }

  if (type === 'natural') {
    const cleanStr = (val: unknown) => String(val || "").replace(/\s+/g, "").toLowerCase();
    const strA = cleanStr(a);
    const strB = cleanStr(b);
    return strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' });
  }

  // Default: string comparison
  const strA = String(a || "").trim();
  const strB = String(b || "").trim();
  return strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' });
}

export function sortData<T>(
  data: T[],
  sortBy: string,
  dir: 'asc' | 'desc',
  typeMap?: Record<string, 'string' | 'number' | 'date' | 'natural'>
): T[] {
  if (!sortBy) return data;
  const sorted = [...data];
  const type = typeMap ? typeMap[sortBy] : undefined;

  sorted.sort((rowA: T, rowB: T) => {
    const recordA = rowA as unknown as Record<string, unknown>;
    const recordB = rowB as unknown as Record<string, unknown>;
    let a = recordA[sortBy];
    let b = recordB[sortBy];

    if (sortBy.includes('.')) {
      const parts = sortBy.split('.');
      a = parts.reduce((o: unknown, i) => (o as Record<string, unknown>)?.[i], recordA);
      b = parts.reduce((o: unknown, i) => (o as Record<string, unknown>)?.[i], recordB);
    }

    const aEmpty = a == null || a === "";
    const bEmpty = b == null || b === "";
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;

    const cmp = compareValues(a, b, type);
    return dir === 'asc' ? cmp : -cmp;
  });

  return sorted;
}
