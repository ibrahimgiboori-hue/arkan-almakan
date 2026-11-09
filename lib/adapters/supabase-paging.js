// PostgREST answers at most 1000 rows per request: ledgers read a period page by page.
const PAGE = 1000;

export async function readAllPages(build) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const query = await build().range(offset, offset + PAGE - 1);
    if (query.error) throw query.error;
    rows.push(...(query.data || []));
    if ((query.data || []).length < PAGE) return rows;
  }
}
