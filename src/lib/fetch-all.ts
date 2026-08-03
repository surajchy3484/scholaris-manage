/**
 * PostgREST caps a single request at 1000 rows. Anything that must reflect the
 * *whole* table (student counts, exam aggregates) has to page through the
 * result set, otherwise totals silently plateau at 1000.
 */
export async function fetchAllRows<T>(
  makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  batchSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += batchSize) {
    const { data, error } = await makeQuery(from, from + batchSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < batchSize) break;
  }
  return out;
}
