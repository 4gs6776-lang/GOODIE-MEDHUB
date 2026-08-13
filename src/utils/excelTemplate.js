import * as XLSX from 'xlsx';

// 1. Download Blank Excel Template
export const downloadExcelTemplate = () => {
  const headers = [
    'Drug Name',
    'Generic Name',
    'Brand Name',
    'Strength',
    'Dosage Form',
    'Category',
    'Unit',
    'Quantity',
    'Reorder Level',
    'Selling Price',
    'Cost Price',
    'Batch Number',
    'Expiry Date'
  ];

  const sampleRows = [
    {
      'Drug Name': 'Paracetamol 500mg',
      'Generic Name': 'Paracetamol',
      'Brand Name': 'Emzor',
      'Strength': '500mg',
      'Dosage Form': 'Tablet',
      'Category': 'Analgesic',
      'Unit': 'Tablet',
      'Quantity': 500,
      'Reorder Level': 50,
      'Selling Price': 50,
      'Cost Price': 30,
      'Batch Number': 'PCM001',
      'Expiry Date': '2027-08-30'
    },
    {
      'Drug Name': 'Amoxicillin 500mg',
      'Generic Name': 'Amoxicillin',
      'Brand Name': 'Beecham',
      'Strength': '500mg',
      'Dosage Form': 'Capsule',
      'Category': 'Antibiotic',
      'Unit': 'Capsule',
      'Quantity': 200,
      'Reorder Level': 30,
      'Selling Price': 150,
      'Cost Price': 100,
      'Batch Number': 'AMX001',
      'Expiry Date': '2027-06-15'
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleRows, { header: headers });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventory Template');
  XLSX.writeFile(workbook, 'Hospital_Drug_Import_Template.xlsx');
};

// 2. Parse & Validate Excel Rows
export const parseAndValidateExcel = (file, existingInventory = []) => {
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

          const drugName = (row['Drug Name'] || row['drug_name'] || '').toString().trim();
          const genericName = (row['Generic Name'] || row['generic_name'] || '').toString().trim();
          const brandName = (row['Brand Name'] || row['brand_name'] || '').toString().trim();
          const strength = (row['Strength'] || row['strength'] || '').toString().trim();
          const dosageForm = (row['Dosage Form'] || row['dosage_form'] || row['Form'] || '').toString().trim();
          const category = (row['Category'] || row['category'] || 'General').toString().trim();
          const unit = (row['Unit'] || row['unit'] || 'Unit').toString().trim();
          const batchNumber = (row['Batch Number'] || row['batch_number'] || '').toString().trim();
          const expiryDate = (row['Expiry Date'] || row['expiry_date'] || '').toString().trim();

          const quantity = parseInt(row['Quantity'] || row['quantity'] || 0, 10);
          const reorderLevel = parseInt(row['Reorder Level'] || row['reorder_level'] || 10, 10);
          const sellingPrice = parseFloat(row['Selling Price'] || row['selling_price'] || 0);
          const costPrice = parseFloat(row['Cost Price'] || row['cost_price'] || 0);

          if (!drugName) errors.push('Missing Drug Name');
          if (isNaN(quantity) || quantity < 0) errors.push('Quantity must be a number');
          if (isNaN(sellingPrice) || sellingPrice < 0) errors.push('Selling Price must be a number');

          if (expiryDate) {
            const parsedDate = new Date(expiryDate);
            if (isNaN(parsedDate.getTime())) {
              errors.push('Invalid Expiry Date (Use YYYY-MM-DD)');
            } else if (parsedDate < new Date()) {
              warnings.push('Item is already expired');
            }
          }

          const matchedItem = existingInventory.find(
            (item) =>
              (item.drug_name || item.name || item.item_name || '').toLowerCase() === drugName.toLowerCase()
          );

          if (matchedItem) {
            warnings.push(`Existing item match (Stock will increase by +${quantity})`);
          }

          return {
            rowNum,
            drugName,
            genericName,
            brandName,
            strength,
            dosageForm,
            category,
            unit,
            quantity,
            reorderLevel,
            sellingPrice,
            costPrice,
            batchNumber,
            expiryDate,
            matchedItemId: matchedItem?.id || null,
            existingStock: matchedItem ? (matchedItem.quantity || matchedItem.stock || 0) : 0,
            status: errors.length > 0 ? 'Error' : warnings.length > 0 ? 'Warning' : 'Ready',
            errors,
            warnings
          };
        });

        resolve(validatedRows);
      } catch (err) {
        reject(new Error('Failed to parse Excel file: ' + err.message));
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};
