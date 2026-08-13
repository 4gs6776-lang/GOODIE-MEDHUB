import React, { useState } from 'react';
import { parseAndValidateExcel, downloadExcelTemplate } from '../../utils/excelTemplate';

export default function ImportExcelModal({ isOpen, onClose, existingInventory = [], onImportSuccess, hospitalId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [importSummary, setImportSummary] = useState(null);

  if (!isOpen) return null;

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    
const [isImportModalOpen, setIsImportModalOpen] = useState(false);

const handleImportSave = async (itemPayload, matchedItemId) => {
  if (matchedItemId) {
    await updateRow(matchedItemId, {
      quantity: itemPayload.quantity,
      updated_at: itemPayload.updated_at
    });
  } else {
    await insertRow(itemPayload);
  }
};

    setLoading(true);
    setErrorMessage('');
    setImportSummary(null);

    try {
      const parsedRows = await parseAndValidateExcel(selectedFile, existingInventory);
      setRows(parsedRows);
    } catch (err) {
      setErrorMessage(err.message || 'Error processing file.');
    } finally {
      setLoading(false);
    }
  };

  const validRows = rows.filter((r) => r.status !== 'Error');
  const errorCount = rows.filter((r) => r.status === 'Error').length;
  const warningCount = rows.filter((r) => r.status === 'Warning').length;

  const handleExecuteImport = async () => {
    if (validRows.length === 0) return;

    setImporting(true);
    setProgress(0);

    let importedCount = 0;
    let updatedCount = 0;
    let failedCount = 0;

    const total = validRows.length;

    for (let i = 0; i < total; i++) {
      const row = validRows[i];

      try {
        const itemPayload = {
          hospital_id: hospitalId,
          drug_name: row.drugName,
          generic_name: row.genericName,
          brand_name: row.brandName,
          strength: row.strength,
          dosage_form: row.dosageForm,
          category: row.category,
          unit: row.unit,
          reorder_level: row.reorderLevel,
          selling_price: row.sellingPrice,
          cost_price: row.costPrice,
          batch_number: row.batchNumber,
          expiry_date: row.expiryDate || null,
          quantity: row.matchedItemId ? row.existingStock + row.quantity : row.quantity,
          updated_at: new Date().toISOString()
        };

        await onImportSuccess(itemPayload, row.matchedItemId);

        if (row.matchedItemId) {
          updatedCount++;
        } else {
          importedCount++;
        }
      } catch (err) {
        failedCount++;
      }

      setProgress(Math.round(((i + 1) / total) * 100));
    }

    setImporting(false);
    setImportSummary({
      imported: importedCount,
      updated: updatedCount,
      skipped: errorCount,
      failed: failedCount
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black bg-opacity-50 p-2 sm:p-4">
      <div className="bg-white rounded-t-xl sm:rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-3 sm:p-4 border-b flex justify-between items-center bg-slate-50">
          <h2 className="text-lg sm:text-xl font-bold text-slate-800">Import Drugs from Excel</h2>
          <button onClick={onClose} className="text-slate-500 text-xl font-semibold p-1">✕</button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {!importSummary && (
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 sm:p-6 text-center bg-slate-50">
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileChange}
                className="hidden"
                id="excelFileInput"
              />
              <label htmlFor="excelFileInput" className="cursor-pointer space-y-2 block">
                <div className="text-slate-700 font-medium text-sm sm:text-base">
                  Tap to Select Excel File (.xlsx, .csv)
                </div>
              </label>

              <div className="mt-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={downloadExcelTemplate}
                  className="text-xs sm:text-sm text-blue-600 hover:underline font-medium"
                >
                  📥 Download Excel Template
                </button>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 bg-red-100 text-red-700 rounded text-xs sm:text-sm">{errorMessage}</div>
          )}

          {loading && (
            <div className="text-center py-4 text-xs sm:text-sm text-slate-600">
              Reading and validating rows...
            </div>
          )}

          {importSummary && (
            <div className="space-y-3 p-4 bg-slate-50 rounded-lg border text-xs sm:text-sm">
              <h3 className="text-base font-bold text-slate-800">Import Complete</h3>
              <ul className="space-y-1 text-slate-700">
                <li className="text-green-600">✓ {importSummary.imported} new drugs added</li>
                <li className="text-blue-600">✓ {importSummary.updated} stock quantities updated</li>
                {importSummary.skipped > 0 && <li className="text-amber-600">⚠ {importSummary.skipped} invalid rows skipped</li>}
                {importSummary.failed > 0 && <li className="text-red-600">✕ {importSummary.failed} writes failed</li>}
              </ul>
              <button
                onClick={onClose}
                className="w-full mt-2 py-2 bg-blue-600 text-white rounded text-xs sm:text-sm font-medium"
              >
                Done
              </button>
            </div>
          )}

          {!importSummary && rows.length > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs font-medium text-slate-600">
                <span>Total: {rows.length}</span>
                <span className="text-green-600">Valid: {rows.length - errorCount}</span>
                <span className="text-red-600">Errors: {errorCount}</span>
              </div>

              <div className="max-h-48 overflow-y-auto border rounded text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 sticky top-0 border-b">
                    <tr>
                      <th className="p-2">#</th>
                      <th className="p-2">Drug</th>
                      <th className="p-2">Qty</th>
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.rowNum} className="border-b">
                        <td className="p-2 font-mono">{r.rowNum}</td>
                        <td className="p-2 font-medium">{r.drugName || '—'}</td>
                        <td className="p-2">{r.quantity}</td>
                        <td className="p-2">
                          {r.status === 'Ready' && <span className="text-green-600">✓</span>}
                          {r.status === 'Warning' && <span className="text-amber-600">⚠</span>}
                          {r.status === 'Error' && <span className="text-red-600">✕</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {importing && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-600">
                <span>Importing...</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-slate-200 h-2 rounded overflow-hidden">
                <div className="bg-blue-600 h-2 transition-all duration-150" style={{ width: `${progress}%` }}></div>
              </div>
            </div>
          )}
        </div>

        {!importSummary && (
          <div className="p-3 border-t bg-slate-50 flex justify-end gap-2">
            <button
              onClick={onClose}
              disabled={importing}
              className="px-3 py-1.5 text-slate-600 text-xs sm:text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleExecuteImport}
              disabled={validRows.length === 0 || importing}
              className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs sm:text-sm font-medium disabled:opacity-50"
            >
              {importing ? 'Importing...' : `Import (${validRows.length})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
