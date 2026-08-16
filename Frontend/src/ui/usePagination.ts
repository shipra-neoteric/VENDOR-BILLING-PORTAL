import { useState } from "react";

// Client-side paging for ui/Table, which (unlike antd's Table) has no
// built-in pagination prop. Page is clamped into range on every render
// instead of via useEffect, so narrowing a filtered/searched list down to
// fewer pages never strands the user on a now-empty page.
export function usePagination<T>(items: T[], pageSize = 10) {
  const [rawPage, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(Math.max(1, rawPage), totalPages);
  const pageItems = items.slice((page - 1) * pageSize, page * pageSize);

  return { page, totalPages, setPage, pageItems };
}
