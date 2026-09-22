import { useState, useEffect, useMemo } from 'react'

// =====================================================================
// GOODIE-MEDHUB — shared pagination logic (client-side, over an
// already-loaded and already-filtered array).
//
// This intentionally paginates data ALREADY held locally (from the
// existing offline-first useOfflineTable system), not a fresh database
// query per page. True server-side pagination would conflict with the
// app's offline-first design, where a whole table is downloaded once so
// the app keeps working without a connection. See the accompanying
// explanation delivered alongside this file for the reasoning.
//
// Usage:
//   const pg = usePagination(filteredList, { initialPageSize: 20, resetKey: searchTerm })
//   pg.pageItems   -> just the current page's records
//   pg.page, pg.pageCount, pg.total, pg.pageSize
//   pg.setPage(n), pg.setPageSize(n)
//
// resetKey: pass whatever value should snap the view back to page 1
// when it changes (a search term, a status filter, a date range...).
// =====================================================================

export function usePagination(items, { initialPageSize = 20, resetKey } = {}) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)

  // Reset to page 1 whenever the caller's reset key changes (e.g. the
  // search box or a filter dropdown changed) — never leave someone
  // stranded on "page 4" of a search that now only has 1 result.
  useEffect(() => {
    setPage(1)
  }, [resetKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const total = items.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  // If the list shrank (e.g. a filter removed items) and the current
  // page no longer exists, snap back to the last real page instead of
  // showing a blank screen.
  useEffect(() => {
    setPage(p => Math.min(p, pageCount))
  }, [pageCount])

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize
    return items.slice(start, start + pageSize)
  }, [items, page, pageSize])

  function changePageSize(newSize) {
    setPageSize(newSize)
    setPage(1)
  }

  return {
    page,
    setPage,
    pageSize,
    setPageSize: changePageSize,
    total,
    pageCount,
    pageItems,
  }
}
