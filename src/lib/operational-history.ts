export const OPERATIONAL_HISTORY_MAX_ROWS = 1000;

export type OperationalHistoryResult<Row> = {
  rows: Row[];
  totalCount: number | null;
  limitExceeded: boolean;
};

export function operationalHistoryResult<Row>(
  rows: Row[],
  totalCount: number | null,
): OperationalHistoryResult<Row> {
  return {
    rows,
    totalCount,
    limitExceeded:
      totalCount !== null && totalCount > OPERATIONAL_HISTORY_MAX_ROWS,
  };
}
