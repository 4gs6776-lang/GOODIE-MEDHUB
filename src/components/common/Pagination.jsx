import AppIcon from '../icons'

// =====================================================================
// GOODIE-MEDHUB — Pagination (Global Pagination Rule)
//
// ONE pagination control used everywhere a list of records can grow
// large: Pharmacy, Inventory, Laboratory, Radiology, Insurance, Staff,
// Notifications, Billing, Admissions, Reports, etc. No module should
// hand-roll its own "Previous/Next" buttons anymore.
//
// Shows "Showing 1-20 of 245", Previous/Next, numbered page buttons
// (with an ellipsis for long lists), and an optional page-size picker.
// On phones the numbered buttons collapse to a compact "Page 2 of 13"
// label next to Previous/Next, so nothing overflows at 320-430px.
// =====================================================================

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 25, 50]

export default function Pagination({
  currentPage,
  totalPages,
  totalItems,
  startIndex,
  endIndex,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  itemLabel = 'records',
}) {
  // Nothing to paginate — don't clutter the UI with empty controls.
  if (!totalItems) return null

  // Build a compact page-number list: first, last, current +/-1, with
  // "…" gaps for anything skipped — the same convention most apps use.
  function pageNumbers() {
    const pages = []
    const add = (p) => { if (!pages.includes(p)) pages.push(p) }
    add(1)
    for (let p = currentPage - 1; p <= currentPage + 1; p++) {
      if (p > 1 && p < totalPages) add(p)
    }
    if (totalPages > 1) add(totalPages)
    return pages.sort((a, b) => a - b)
  }

  const pages = pageNumbers()

  return (
    <div className="gmed-pagination">
      <div className="gmed-pagination-info">
        Showing {totalItems === 0 ? 0 : startIndex + 1}–{endIndex} of {totalItems} {itemLabel}
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
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label="Previous page"
        >
          <AppIcon name="chevronLeft" size={15} />
        </button>

        {/* Numbered buttons — hidden on phones via CSS, replaced by the
            compact "Page x of y" text. */}
        <span className="gmed-pagination-numbers">
          {pages.map((p, i) => (
            <span key={p} style={{ display: 'inline-flex', alignItems: 'center' }}>
              {i > 0 && p - pages[i - 1] > 1 && <span className="gmed-pagination-ellipsis">…</span>}
              <button
                type="button"
                className={`gmed-pagination-btn gmed-pagination-num${p === currentPage ? ' is-active' : ''}`}
                onClick={() => onPageChange(p)}
                aria-current={p === currentPage ? 'page' : undefined}
                aria-label={`Page ${p}`}
              >
                {p}
              </button>
            </span>
          ))}
        </span>

        {/* Mobile-only compact label */}
        <span className="gmed-pagination-compact">Page {currentPage} of {totalPages}</span>

        <button
          type="button"
          className="gmed-pagination-btn"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          aria-label="Next page"
        >
          <AppIcon name="chevron" size={15} />
        </button>
      </div>
    </div>
  )
}
