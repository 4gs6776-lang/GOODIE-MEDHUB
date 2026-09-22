import AppIcon from '../icons'

const DEFAULT_PAGE_SIZES = [10, 20, 25, 50]

// =====================================================================
// GOODIE-MEDHUB — Pagination: the ONE pagination control used across
// the whole app (global pagination rule).
//
// Renders:
//   - "Showing 1–20 of 245 <items>" summary text
//   - Optional page-size selector (10/20/25/50 per page)
//   - Previous / Next buttons
//   - A compact window of page numbers on desktop (1 … 4 5 [6] 7 8 … 20)
//   - A compact "Page X of Y" label on phones instead of page numbers,
//     so nothing overflows at 320–430px screen widths.
//
// Renders nothing when there are zero records — an empty list already
// has its own "no results" message elsewhere on the page.
// =====================================================================

export default function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
  itemLabel = 'items',
}) {
  if (!total) return null

  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  // Builds a small set of page numbers to show: always first, last,
  // current, and one neighbour on each side of current — with a "…"
  // gap marker wherever numbers aren't consecutive.
  function pageWindow() {
    const pages = new Set([1, pageCount, page])
    for (let i = page - 1; i <= page + 1; i++) {
      if (i >= 1 && i <= pageCount) pages.add(i)
    }
    return [...pages].sort((a, b) => a - b)
  }

  const numbers = pageWindow()

  return (
    <div className="gmed-pagination">
      <div className="gmed-pagination-info">
        Showing {start}–{end} of {total} {itemLabel}
      </div>

      <div className="gmed-pagination-controls">
        {onPageSizeChange && (
          <select
            className="gmed-pagination-size"
            value={pageSize}
            onChange={e => onPageSizeChange(Number(e.target.value))}
            aria-label="Records per page"
          >
            {pageSizeOptions.map(n => (
              <option key={n} value={n}>{n} / page</option>
            ))}
          </select>
        )}

        <button
          type="button"
          className="gmed-pagination-btn"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <AppIcon name="chevronLeft" size={15} />
        </button>

        <div className="gmed-pagination-numbers">
          {numbers.map((n, i) => {
            const prev = numbers[i - 1]
            const showGap = prev != null && n - prev > 1
            return (
              <span key={n} style={{ display: 'inline-flex', alignItems: 'center' }}>
                {showGap && <span className="gmed-pagination-ellipsis">…</span>}
                <button
                  type="button"
                  className={`gmed-pagination-num${n === page ? ' is-active' : ''}`}
                  onClick={() => onPageChange(n)}
                  aria-current={n === page ? 'page' : undefined}
                  aria-label={`Page ${n}`}
                >
                  {n}
                </button>
              </span>
            )
          })}
        </div>

        {/* Phones (<=600px, see pagination.css): number buttons are
            hidden and this compact label takes their place instead. */}
        <div className="gmed-pagination-compact">
          Page {page} of {pageCount}
        </div>

        <button
          type="button"
          className="gmed-pagination-btn"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          aria-label="Next page"
        >
          <AppIcon name="chevron" size={15} />
        </button>
      </div>
    </div>
  )
}
