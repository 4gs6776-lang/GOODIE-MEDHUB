import { useState } from 'react';
import { downloadExcelTemplate, parseAndValidateExcel } from '../../utils/excelImportUtils';

export default function ImportExcelModal({ isOpen, onClose, existingInventory = [], onImportSuccess }) {
  const [file, setFile] = useState(null);
  const [validatedData, setValidatedData] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [parseError, setParseError] = useState('');
  const [summary, setSummary] = useState({ saved: 0, updated: 0, failed: 0, errors: [] });

  if (!isOpen) return null;

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setParseError('');
    try {
      const parsed = await parseAndValidateExcel(selectedFile, existingInventory);
      setValidatedData(parsed);
    } catch (err) {
      setParseError(err.message || 'Error parsing Excel file');
      setValidatedData([]);
    }
  };

  const handleStartImport = async () => {
    setIsProcessing(true);
    let savedCount = 0;
    let updatedCount = 0;
    let failedCount = 0;
    const failureDetails = [];

    for (const item of validatedData) {
      if (item.status === 'Error') {
        failedCount++;
        failureDetails.push(`${item.name || 'Row ' + item.rowNum}: ${item.errors.join(', ')}`);
        continue;
      }

      try {
        await onImportSuccess(item, item.matchedItemId);
        if (item.matchedItemId) {
          updatedCount++;
        } else {
          savedCount++;
        }
      } catch (err) {
        failedCount++;
        failureDetails.push(`${item.name || 'Row ' + item.rowNum}: ${err.message || 'Database write error'}`);
      }
    }

    setSummary({
      saved: savedCount,
      updated: updatedCount,
      failed: failedCount,
      errors: failureDetails
    });
    setIsProcessing(false);
    setIsFinished(true);
  };

  const handleReset = () => {
    setFile(null);
    setValidatedData([]);
    setIsFinished(false);
    setIsProcessing(false);
    setParseError('');
    setSummary({ saved: 0, updated: 0, failed: 0, errors: [] });
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,3,26,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
      <div className="card" style={{ width: '100%', maxWidth: 550, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 19 }}>Import Inventory Items</div>
          <button onClick={handleReset} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>

        {!isFinished ? (
          <>
            <div style={{ marginBottom: 16 }}>
              <button onClick={downloadExcelTemplate} className="btn btn-ghost" style={{ fontSize: 12 }}>
                📥 Download Excel Template
              </button>
            </div>

            <div className="field">
              <label>Select Excel File (.xlsx, .xls)</label>
              <input type="file" accept=".xlsx, .xls" onChange={handleFileChange} />
            </div>

            {parseError && <div className="error-box" style={{ marginTop: 10 }}>{parseError}</div>}

            {validatedData.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Preview ({validatedData.length} items found):</div>
                <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: 8 }}>
                  {validatedData.map((row) => (
                    <div key={row.rowNum} style={{ fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--line-soft)', display: 'flex', justifyContent: 'space-between' }}>
                      <span><strong>{row.name || row.drugName}</strong> ({row.category}) - Qty: {row.quantity}</span>
                      <span style={{ color: row.status === 'Error' ? 'var(--danger)' : row.status === 'Warning' ? 'var(--gold)' : 'var(--teal)' }}>
                        {row.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
              <button type="button" className="btn btn-ghost" onClick={handleReset}>Cancel</button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!file || validatedData.length === 0 || isProcessing}
                onClick={handleStartImport}
              >
                {isProcessing ? 'Importing…' : 'Start Import'}
              </button>
            </div>
          </>
        ) : (
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Import Finished</div>
            <div style={{ fontSize: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div>✓ {summary.saved} items saved to database</div>
              <div>✓ {summary.updated} stock quantities updated</div>
              <div style={{ color: summary.failed > 0 ? 'var(--danger)' : undefined }}>
                ✕ {summary.failed} writes failed
              </div>
            </div>

            {summary.errors.length > 0 && (
              <div style={{ marginTop: 16, background: 'rgba(225,104,94,0.1)', border: '1px solid var(--danger)', padding: 12, borderRadius: 8, maxHeight: 150, overflowY: 'auto' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)', marginBottom: 6 }}>Failure Reasons:</div>
                {summary.errors.map((err, idx) => (
                  <div key={idx} style={{ fontSize: 11, color: 'var(--danger)', marginBottom: 4 }}>• {err}</div>
                ))}
              </div>
            )}

            <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={handleReset}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
