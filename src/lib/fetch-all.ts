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
  const first = await makeQuery(0, batchSize - 1);
  if (first.error) throw first.error;
  const firstRows = first.data ?? [];
  out.push(...firstRows);
  if (firstRows.length < batchSize) return out;

  // Fetch a bounded window of pages concurrently. This preserves the existing
  // ordering while avoiding one network round-trip per 1,000 rows.
  const pageWidth = 4;
  for (let page = 1; ; page += pageWidth) {
    const results = await Promise.all(
      Array.from({ length: pageWidth }, (_, offset) => {
        const from = (page + offset) * batchSize;
        return makeQuery(from, from + batchSize - 1);
      }),
    );
    let hasMore = true;
    for (const result of results) {
      if (result.error) throw result.error;
      const rows = result.data ?? [];
      out.push(...rows);
      if (rows.length < batchSize) hasMore = false;
    }
    if (!hasMore) break;
  }
  return out;
}
