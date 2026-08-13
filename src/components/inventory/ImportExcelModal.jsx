import { useState } from 'react';
import * as XLSX from 'xlsx';

export default function ImportExcelModal({ isOpen, onClose, existingInventory = [], onImportSuccess }) {
  const [file, setFile] = useState(null);
  const [validatedData, setValidatedData] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [parseError, setParseError] = useState('');
  const [summary, setSummary] = useState({ saved: 0, updated: 0, failed: 0, errors: [] });

  if (!isOpen) return null;

  const downloadExcelTemplate = () => {
    const headers = [
      'Item Name', 'Category', 'Quantity', 'Unit', 'Supplier',
      'Reorder Level', 'Selling Price', 'Cost Price', 'Batch Number', 'Expiry Date'
    ];

    const sampleRows = [
      {
        'Item Name': 'Surgical Gloves (Box of 100)',
        'Category': 'PPE',
        'Quantity': 100,
        'Unit': 'boxes',
        'Supplier': 'MedSupply Nigeria',
        'Reorder Level': 15,
        'Selling Price': 3500,
        'Cost Price': 2500,
        'Batch Number': 'GLV2026',
        'Expiry Date': '2028-12-31'
      },
      {
        'Item Name': 'Paracetamol 500mg',
        'Category': 'Drug',
        'Quantity': 500,
        'Unit': 'Tablet',
        'Supplier': 'Emzor',
        'Reorder Level': 50,
        'Selling Price': 50,
        'Cost Price': 30,
        'Batch Number': 'PCM001',
        'Expiry Date': '2027-08-30'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleRows, { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventory Template');
    XLSX.writeFile(workbook, 'Hospital_Inventory_Import_Template.xlsx');
  };

  const parseAndValidateExcel = (fileToParse) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rows = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: '' });

          const validatedRows = rows.map((row, index) => {
            const rowNum = index + 2;
            const errors = [];
            const warnings = [];

            const name = (
              row['Item Name'] || row['item_name'] || row['Drug Name'] || 
              row['drug_name'] || row['Name'] || ''
            ).toString().trim();

            const brandName = (row['Brand Name'] || row['brand_name'] || row['Supplier'] || row['supplier'] || '').toString().trim();
            const category = (row['Category'] || row['category'] || 'Other').toString().trim();
            const unit = (row['Unit'] || row['unit'] || 'units').toString().trim();
            const supplier = (row['Supplier'] || row['supplier'] || brandName || '').toString().trim();
            const batchNumber = (row['Batch Number'] || row['batch_number'] || '').toString().trim();
            const expiryDate = (row['Expiry Date'] || row['expiry_date'] || '').toString().trim();

            const quantity = parseInt(row['Quantity'] || row['quantity'] || 0, 10);
            const reorderLevel = parseInt(row['Reorder Level'] || row['reorder_level'] || 10, 10);
            const sellingPrice = parseFloat(row['Selling Price'] || row['selling_price'] || 0);
            const costPrice = parseFloat(row['Cost Price'] || row['cost_price'] || 0);

            if (!name) errors.push('Missing Item Name');
            if (isNaN(quantity) || quantity < 0) errors.push('Quantity must be a valid number');

            if (expiryDate) {
              const parsedDate = new Date(expiryDate);
              if (isNaN(parsedDate.getTime())) {
                errors.push('Invalid Expiry Date format');
              } else if (parsedDate < new Date()) {
                warnings.push('Item is already expired');
              }
            }

            const matchedItem = existingInventory.find(
              (item) => (item.name || item.drug_name || '').toLowerCase() === name.toLowerCase()
            );

            if (matchedItem) {
              warnings.push(`Matches existing stock (Will increase stock by +${quantity})`);
            }

            return {
              rowNum,
              name,
              drugName: name,
              category,
              unit,
              supplier,
              quantity,
              reorderLevel,
              sellingPrice,
              costPrice,
              batchNumber,
              expiryDate,
              matchedItemId: matchedItem?.id || null,
              status: errors.length > 0 ? 'Error' : warnings.length > 0 ? 'Warning' : 'Ready',
              errors,
              warnings
            };
          });

          resolve(validatedRows);
        } catch (err) {
          reject(new Error('Failed to read Excel file: ' + err.message));
        }
      };

      reader.onerror = (error) => reject(error);
      reader.readAsArrayBuffer(fileToParse);
    });
  };

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setParseError('');
    try {
      const parsed = await parseAndValidateExcel(selectedFile);
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
                      <span><strong>{row.name}</strong> ({row.category}) - Qty: {row.quantity}</span>
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
