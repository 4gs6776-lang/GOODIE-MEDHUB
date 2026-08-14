import { useState } from 'react'
import * as XLSX from 'xlsx'

export default function ImportExcelModal({
  isOpen,
  onClose,
  existingInventory = [],
  onImportSuccess,
  hospitalId
}) {
  const [file, setFile] = useState(null)

  const [validatedData, setValidatedData] =
    useState([])

  const [isProcessing, setIsProcessing] =
    useState(false)

  const [isFinished, setIsFinished] =
    useState(false)

  const [parseError, setParseError] =
    useState('')

  const [summary, setSummary] =
    useState({
      saved: 0,
      updated: 0,
      failed: 0,
      errors: []
    })

  if (!isOpen) {
    return null
  }

  /*
  ============================================================
  DOWNLOAD EXCEL TEMPLATE
  ============================================================
  */

  const downloadExcelTemplate = () => {
    const headers = [
      'Item Name',
      'Category',
      'Quantity',
      'Unit',
      'Supplier',
      'Reorder Level',
      'Selling Price',
      'Cost Price',
      'Batch Number',
      'Expiry Date',
      'Generic Name',
      'Strength',
      'Dosage Form'
    ]

    const sampleRows = [
      {
        'Item Name':
          'Surgical Gloves (Box of 100)',

        'Category':
          'PPE',

        'Quantity':
          100,

        'Unit':
          'boxes',

        'Supplier':
          'MedSupply Nigeria',

        'Reorder Level':
          15,

        'Selling Price':
          3500,

        'Cost Price':
          2500,

        'Batch Number':
          'GLV2026',

        'Expiry Date':
          '2028-12-31',

        'Generic Name':
          '',

        'Strength':
          '',

        'Dosage Form':
          ''
      },

      {
        'Item Name':
          'Paracetamol 500mg',

        'Category':
          'Drug',

        'Quantity':
          500,

        'Unit':
          'Tablet',

        'Supplier':
          'Emzor',

        'Reorder Level':
          50,

        'Selling Price':
          50,

        'Cost Price':
          30,

        'Batch Number':
          'PCM001',

        'Expiry Date':
          '2027-08-30',

        'Generic Name':
          'Paracetamol',

        'Strength':
          '500mg',

        'Dosage Form':
          'Tablet'
      },

      {
        'Item Name':
          'Ceftriaxone',

        'Category':
          'Drug',

        'Quantity':
          116,

        'Unit':
          'Vial',

        'Supplier':
          'Pharmaceutical Supplier',

        'Reorder Level':
          20,

        'Selling Price':
          1500,

        'Cost Price':
          1000,

        'Batch Number':
          'CTX2026',

        'Expiry Date':
          '2028-05-31',

        'Generic Name':
          'Ceftriaxone',

        'Strength':
          '1g',

        'Dosage Form':
          'Injection'
      }
    ]

    const worksheet =
      XLSX.utils.json_to_sheet(
        sampleRows,
        {
          header: headers
        }
      )

    /*
      Set column widths.
    */

    worksheet['!cols'] = [
      { wch: 30 },
      { wch: 18 },
      { wch: 12 },
      { wch: 14 },
      { wch: 25 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 18 },
      { wch: 16 },
      { wch: 22 },
      { wch: 15 },
      { wch: 18 }
    ]

    const workbook =
      XLSX.utils.book_new()

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      'Inventory Template'
    )

    XLSX.writeFile(
      workbook,
      'Hospital_Inventory_Import_Template.xlsx'
    )
  }

  /*
  ============================================================
  PARSE + VALIDATE EXCEL
  ============================================================
  */

  const parseAndValidateExcel = (
    fileToParse
  ) => {
    return new Promise(
      (resolve, reject) => {
        const reader =
          new FileReader()

        reader.onload = event => {
          try {
            const data =
              new Uint8Array(
                event.target.result
              )

            const workbook =
              XLSX.read(data, {
                type: 'array',
                cellDates: true
              })

            if (
              !workbook.SheetNames ||
              workbook.SheetNames.length === 0
            ) {
              reject(
                new Error(
                  'The Excel file does not contain any worksheet.'
                )
              )

              return
            }

            const firstSheetName =
              workbook.SheetNames[0]

            const worksheet =
              workbook.Sheets[
                firstSheetName
              ]

            const rows =
              XLSX.utils.sheet_to_json(
                worksheet,
                {
                  raw: false,
                  defval: ''
                }
              )

            if (rows.length === 0) {
              reject(
                new Error(
                  'The Excel sheet is empty.'
                )
              )

              return
            }

            const validatedRows =
              rows.map(
                (row, index) => {
                  const rowNum =
                    index + 2

                  const errors = []
                  const warnings = []

                  /*
                  ------------------------------------------------
                  ITEM NAME
                  ------------------------------------------------
                  */

                  const name = (
                    row['Item Name'] ||
                    row['item_name'] ||
                    row['Drug Name'] ||
                    row['drug_name'] ||
                    row['Name'] ||
                    row['name'] ||
                    ''
                  )
                    .toString()
                    .trim()

                  /*
                  ------------------------------------------------
                  SUPPLIER
                  ------------------------------------------------
                  */

                  const brandName = (
                    row['Brand Name'] ||
                    row['brand_name'] ||
                    ''
                  )
                    .toString()
                    .trim()

                  const supplier = (
                    row['Supplier'] ||
                    row['supplier'] ||
                    ''
                  )
                    .toString()
                    .trim()

                  /*
                  ------------------------------------------------
                  CATEGORY
                  ------------------------------------------------
                  */

                  const category = (
                    row['Category'] ||
                    row['category'] ||
                    'Other'
                  )
                    .toString()
                    .trim()

                  /*
                  ------------------------------------------------
                  UNIT
                  ------------------------------------------------
                  */

                  const unit = (
                    row['Unit'] ||
                    row['unit'] ||
                    'units'
                  )
                    .toString()
                    .trim()

                  /*
                  ------------------------------------------------
                  QUANTITY
                  ------------------------------------------------
                  */

                  const rawQuantity =
                    row['Quantity'] ??
                    row['quantity'] ??
                    0

                  const quantity =
                    parseInt(
                      String(
                        rawQuantity
                      ).replace(
                        /,/g,
                        ''
                      ),
                      10
                    )

                  /*
                  ------------------------------------------------
                  REORDER LEVEL
                  ------------------------------------------------
                  */

                  const rawReorderLevel =
                    row[
                      'Reorder Level'
                    ] ??
                    row[
                      'reorder_level'
                    ] ??
                    10

                  const reorderLevel =
                    parseInt(
                      String(
                        rawReorderLevel
                      ).replace(
                        /,/g,
                        ''
                      ),
                      10
                    )

                  /*
                  ------------------------------------------------
                  SELLING PRICE
                  ------------------------------------------------
                  */

                  const rawSellingPrice =
                    row[
                      'Selling Price'
                    ] ??
                    row[
                      'selling_price'
                    ] ??
                    0

                  const sellingPrice =
                    parseFloat(
                      String(
                        rawSellingPrice
                      ).replace(
                        /,/g,
                        ''
                      )
                    )

                  /*
                  ------------------------------------------------
                  COST PRICE
                  ------------------------------------------------
                  */

                  const rawCostPrice =
                    row[
                      'Cost Price'
                    ] ??
                    row[
                      'cost_price'
                    ] ??
                    0

                  const costPrice =
                    parseFloat(
                      String(
                        rawCostPrice
                      ).replace(
                        /,/g,
                        ''
                      )
                    )

                  /*
                  ------------------------------------------------
                  BATCH NUMBER
                  ------------------------------------------------
                  */

                  const batchNumber = (
                    row[
                      'Batch Number'
                    ] ||
                    row[
                      'batch_number'
                    ] ||
                    ''
                  )
                    .toString()
                    .trim()

                  /*
                  ------------------------------------------------
                  EXPIRY DATE
                  ------------------------------------------------
                  */

                  let expiryDate = (
                    row[
                      'Expiry Date'
                    ] ||
                    row[
                      'expiry_date'
                    ] ||
                    ''
                  )
                    .toString()
                    .trim()

                  /*
                    Convert Excel date strings
                    to YYYY-MM-DD.
                  */

                  if (expiryDate) {
                    const parsedDate =
                      new Date(
                        expiryDate
                      )

                    if (
                      Number.isNaN(
                        parsedDate.getTime()
                      )
                    ) {
                      errors.push(
                        'Invalid Expiry Date format'
                      )
                    } else {
                      const year =
                        parsedDate.getFullYear()

                      const month =
                        String(
                          parsedDate.getMonth() +
                            1
                        ).padStart(
                          2,
                          '0'
                        )

                      const day =
                        String(
                          parsedDate.getDate()
                        ).padStart(
                          2,
                          '0'
                        )

                      expiryDate =
                        `${year}-${month}-${day}`

                      /*
                        Check whether expired.
                      */

                      const today =
                        new Date()

                      today.setHours(
                        0,
                        0,
                        0,
                        0
                      )

                      if (
                        parsedDate <
                        today
                      ) {
                        warnings.push(
                          'Item is already expired'
                        )
                      }
                    }
                  }

                  /*
                  ------------------------------------------------
                  GENERIC NAME
                  ------------------------------------------------
                  */

                  const genericName = (
                    row[
                      'Generic Name'
                    ] ||
                    row[
                      'generic_name'
                    ] ||
                    ''
                  )
                    .toString()
                    .trim()

                  /*
                  ------------------------------------------------
                  STRENGTH
                  ------------------------------------------------
                  */

                  const strength = (
                    row[
                      'Strength'
                    ] ||
                    row[
                      'strength'
                    ] ||
                    ''
                  )
                    .toString()
                    .trim()

                  /*
                  ------------------------------------------------
                  DOSAGE FORM
                  ------------------------------------------------
                  */

                  const dosageForm = (
                    row[
                      'Dosage Form'
                    ] ||
                    row[
                      'dosage_form'
                    ] ||
                    ''
                  )
                    .toString()
                    .trim()

                  /*
                  ------------------------------------------------
                  VALIDATION
                  ------------------------------------------------
                  */

                  if (!name) {
                    errors.push(
                      'Missing Item Name'
                    )
                  }

                  if (
                    Number.isNaN(
                      quantity
                    ) ||
                    quantity < 0
                  ) {
                    errors.push(
                      'Quantity must be a valid number'
                    )
                  }

                  if (
                    Number.isNaN(
                      reorderLevel
                    ) ||
                    reorderLevel < 0
                  ) {
                    errors.push(
                      'Reorder Level must be a valid number'
                    )
                  }

                  if (
                    Number.isNaN(
                      sellingPrice
                    ) ||
                    sellingPrice < 0
                  ) {
                    errors.push(
                      'Selling Price must be a valid number'
                    )
                  }

                  if (
                    Number.isNaN(
                      costPrice
                    ) ||
                    costPrice < 0
                  ) {
                    errors.push(
                      'Cost Price must be a valid number'
                    )
                  }

                  /*
                  ------------------------------------------------
                  FIND EXISTING ITEM
                  ------------------------------------------------
                  */

                  const matchedItem =
                    existingInventory.find(
                      item => {
                        const existingName =
                          (
                            item.name ||
                            item.drug_name ||
                            ''
                          )
                            .toString()
                            .trim()
                            .toLowerCase()

                        return (
                          existingName ===
                          name.toLowerCase()
                        )
                      }
                    )

                  if (
                    matchedItem
                  ) {
                    warnings.push(
                      `Matches existing stock (Will increase stock by +${quantity})`
                    )
                  }

                  /*
                  ------------------------------------------------
                  RETURN VALIDATED ROW
                  ------------------------------------------------
                  */

                  return {
                    rowNum,

                    name,

                    drugName:
                      name,

                    brandName,

                    category,

                    quantity,

                    unit,

                    supplier,

                    reorderLevel,

                    sellingPrice,

                    costPrice,

                    batchNumber,

                    expiryDate,

                    genericName,

                    strength,

                    dosageForm,

                    matchedItemId:
                      matchedItem?.id ||
                      null,

                    status:
                      errors.length > 0
                        ? 'Error'
                        : warnings.length > 0
                          ? 'Warning'
                          : 'Ready',

                    errors,

                    warnings
                  }
                }
              )

            resolve(
              validatedRows
            )
          } catch (error) {
            reject(
              new Error(
                'Failed to read Excel file: ' +
                  error.message
              )
            )
          }
        }

        reader.onerror =
          () => {
            reject(
              new Error(
                'Could not read the selected Excel file.'
              )
            )
          }

        reader.readAsArrayBuffer(
          fileToParse
        )
      }
    )
  }

  /*
  ============================================================
  FILE CHANGE
  ============================================================
  */

  const handleFileChange =
    async event => {
      const selectedFile =
        event.target.files?.[0]

      if (!selectedFile) {
        return
      }

      setFile(
        selectedFile
      )

      setParseError('')

      setValidatedData([])

      setIsFinished(false)

      try {
        const parsed =
          await parseAndValidateExcel(
            selectedFile
          )

        setValidatedData(
          parsed
        )
      } catch (error) {
        console.error(
          'Excel parsing error:',
          error
        )

        setParseError(
          error.message ||
          'Error parsing Excel file'
        )

        setValidatedData([])
      }
    }

  /*
  ============================================================
  START IMPORT
  ============================================================
  */

  const handleStartImport =
    async () => {
      if (
        validatedData.length ===
        0
      ) {
        return
      }

      setIsProcessing(true)

      let savedCount = 0
      let updatedCount = 0
      let failedCount = 0

      const failureDetails = []

      /*
      ----------------------------------------------------------
      Process every row
      ----------------------------------------------------------
      */

      for (
        const item of validatedData
      ) {
        /*
        --------------------------------------------------------
        Validation errors
        --------------------------------------------------------
        */

        if (
          item.status ===
          'Error'
        ) {
          failedCount++

          failureDetails.push(
            `${item.name || `Row ${item.rowNum}`}: ${item.errors.join(', ')}`
          )

          continue
        }

        /*
        --------------------------------------------------------
        Database write
        --------------------------------------------------------
        */

        try {
          await onImportSuccess(
            {
              ...item,

              hospitalId:
                hospitalId
            },

            item.matchedItemId
          )

          if (
            item.matchedItemId
          ) {
            updatedCount++
          } else {
            savedCount++
          }
        } catch (error) {
          console.error(
            `Import failed for ${item.name}:`,
            error
          )

          failedCount++

          failureDetails.push(
            `${item.name || `Row ${item.rowNum}`}: ${
              error.message ||
              'Database write error'
            }`
          )
        }
      }

      /*
      ----------------------------------------------------------
      Summary
      ----------------------------------------------------------
      */

      setSummary({
        saved:
          savedCount,

        updated:
          updatedCount,

        failed:
          failedCount,

        errors:
          failureDetails
      })

      setIsProcessing(false)

      setIsFinished(true)
    }

  /*
  ============================================================
  RESET
  ============================================================
  */

  const handleReset =
    () => {
      setFile(null)

      setValidatedData([])

      setIsFinished(false)

      setIsProcessing(false)

      setParseError('')

      setSummary({
        saved: 0,
        updated: 0,
        failed: 0,
        errors: []
      })

      onClose()
    }

  /*
  ============================================================
  COUNT READY / ERROR
  ============================================================
  */

  const readyCount =
    validatedData.filter(
      row =>
        row.status !==
        'Error'
    ).length

  const errorCount =
    validatedData.filter(
      row =>
        row.status ===
        'Error'
    ).length

  /*
  ============================================================
  UI
  ============================================================
  */

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background:
          'rgba(0,3,26,0.72)',
        display: 'flex',
        alignItems:
          'center',
        justifyContent:
          'center',
        zIndex: 50,
        padding: 20
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 650,
          maxHeight: '90vh',
          overflowY: 'auto'
        }}
      >
        {/* =================================================
            HEADER
        ================================================= */}

        <div
          style={{
            display: 'flex',
            justifyContent:
              'space-between',
            alignItems:
              'center',
            marginBottom: 16
          }}
        >
          <div
            style={{
              fontFamily:
                'var(--font-display)',
              fontSize: 19
            }}
          >
            Import Inventory Items
          </div>

          <button
            onClick={
              handleReset
            }
            disabled={
              isProcessing
            }
            style={{
              background:
                'none',
              border:
                'none',
              color:
                'var(--muted)',
              cursor:
                'pointer',
              fontSize: 18
            }}
          >
            ✕
          </button>
        </div>

        {!isFinished ? (
          <>
            {/* =================================================
                TEMPLATE
            ================================================= */}

            <div
              style={{
                marginBottom: 16
              }}
            >
              <button
                onClick={
                  downloadExcelTemplate
                }
                className="btn btn-ghost"
                style={{
                  fontSize: 12
                }}
              >
                📥 Download Excel Template
              </button>

              <div
                style={{
                  marginTop: 8,
                  fontSize: 11,
                  color:
                    'var(--muted)',
                  lineHeight:
                    1.5
                }}
              >
                The template contains all
                supported inventory fields,
                including batch, expiry,
                generic name, strength and
                dosage form.
              </div>
            </div>

            {/* =================================================
                FILE
            ================================================= */}

            <div className="field">
              <label>
                Select Excel File
                (.xlsx, .xls)
              </label>

              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={
                  handleFileChange
                }
                disabled={
                  isProcessing
                }
              />
            </div>

            {/* =================================================
                PARSE ERROR
            ================================================= */}

            {parseError && (
              <div
                className="error-box"
                style={{
                  marginTop: 10
                }}
              >
                {parseError}
              </div>
            )}

            {/* =================================================
                PREVIEW
            ================================================= */}

            {validatedData.length >
              0 && (
              <div
                style={{
                  marginTop: 16
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    marginBottom: 8
                  }}
                >
                  Preview (
                  {
                    validatedData.length
                  }{' '}
                  items found)
                </div>

                {/* SUMMARY */}
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    flexWrap:
                      'wrap',
                    marginBottom: 10
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      padding:
                        '5px 9px',
                      borderRadius:
                        20,
                      background:
                        'var(--teal-soft)',
                      color:
                        'var(--teal)'
                    }}
                  >
                    ✓ {readyCount}{' '}
                    ready
                  </span>

                  {errorCount >
                    0 && (
                    <span
                      style={{
                        fontSize: 11,
                        padding:
                          '5px 9px',
                        borderRadius:
                          20,
                        background:
                          'rgba(225,104,94,0.14)',
                        color:
                          'var(--danger)'
                      }}
                    >
                      ✕ {errorCount}{' '}
                      errors
                    </span>
                  )}
                </div>

                <div
                  style={{
                    maxHeight: 300,
                    overflowY:
                      'auto',
                    border:
                      '1px solid var(--line)',
                    borderRadius: 8,
                    padding: 8
                  }}
                >
                  {validatedData.map(
                    row => (
                      <div
                        key={
                          row.rowNum
                        }
                        style={{
                          fontSize: 12,
                          padding:
                            '8px 0',
                          borderBottom:
                            '1px solid var(--line-soft)'
                        }}
                      >
                        <div
                          style={{
                            display:
                              'flex',
                            justifyContent:
                              'space-between',
                            gap: 10
                          }}
                        >
                          <span>
                            <strong>
                              {row.name ||
                                `Row ${row.rowNum}`}
                            </strong>

                            <span
                              style={{
                                color:
                                  'var(--muted)',
                                marginLeft:
                                  6
                              }}
                            >
                              {row.category}
                            </span>
                          </span>

                          <span
                            style={{
                              color:
                                row.status ===
                                'Error'
                                  ? 'var(--danger)'
                                  : row.status ===
                                      'Warning'
                                    ? 'var(--gold)'
                                    : 'var(--teal)',
                              fontWeight:
                                700
                            }}
                          >
                            {row.status}
                          </span>
                        </div>

                        <div
                          style={{
                            marginTop: 4,
                            color:
                              'var(--muted)',
                            fontSize: 11
                          }}
                        >
                          Qty:{' '}
                          {row.quantity}{' '}
                          {row.unit}

                          {row.batchNumber &&
                            ` · Batch: ${row.batchNumber}`}

                          {row.expiryDate &&
                            ` · Expiry: ${row.expiryDate}`}
                        </div>

                        {row.genericName ||
                        row.strength ||
                        row.dosageForm ? (
                          <div
                            style={{
                              marginTop: 3,
                              color:
                                'var(--muted)',
                              fontSize: 11
                            }}
                          >
                            {[
                              row.genericName,
                              row.strength,
                              row.dosageForm
                            ]
                              .filter(
                                Boolean
                              )
                              .join(
                                ' · '
                              )}
                          </div>
                        ) : null}

                        {row.errors
                          ?.length >
                          0 && (
                          <div
                            style={{
                              marginTop: 4,
                              color:
                                'var(--danger)',
                              fontSize: 11
                            }}
                          >
                            {row.errors.join(
                              ' · '
                            )}
                          </div>
                        )}

                        {row.warnings
                          ?.length >
                          0 && (
                          <div
                            style={{
                              marginTop: 4,
                              color:
                                'var(--gold)',
                              fontSize: 11
                            }}
                          >
                            {row.warnings.join(
                              ' · '
                            )}
                          </div>
                        )}
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            {/* =================================================
                ACTIONS
            ================================================= */}

            <div
              style={{
                display: 'flex',
                gap: 10,
                marginTop: 22
              }}
            >
              <button
                type="button"
                className="btn btn-ghost"
                onClick={
                  handleReset
                }
                disabled={
                  isProcessing
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className="btn btn-primary"
                disabled={
                  !file ||
                  validatedData.length ===
                    0 ||
                  readyCount ===
                    0 ||
                  isProcessing
                }
                onClick={
                  handleStartImport
                }
              >
                {isProcessing
                  ? 'Importing…'
                  : `Start Import${
                      readyCount
                        ? ` (${readyCount})`
                        : ''
                    }`}
              </button>
            </div>
          </>
        ) : (
          /* ===================================================
             FINISHED
          =================================================== */

          <div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                marginBottom: 12
              }}
            >
              Import Finished
            </div>

            <div
              style={{
                fontSize: 14,
                display: 'flex',
                flexDirection:
                  'column',
                gap: 8
              }}
            >
              <div>
                ✓{' '}
                {summary.saved}{' '}
                new items saved to
                database
              </div>

              <div>
                ✓{' '}
                {summary.updated}{' '}
                existing stock items
                updated
              </div>

              <div
                style={{
                  color:
                    summary.failed >
                    0
                      ? 'var(--danger)'
                      : undefined
                }}
              >
                {summary.failed >
                0
                  ? '✕'
                  : '✓'}{' '}
                {summary.failed}{' '}
                writes failed
              </div>
            </div>

            {/* =================================================
                FAILURE DETAILS
            ================================================= */}

            {summary.errors
              .length > 0 && (
              <div
                style={{
                  marginTop: 16,
                  background:
                    'rgba(225,104,94,0.1)',
                  border:
                    '1px solid var(--danger)',
                  padding: 12,
                  borderRadius: 8,
                  maxHeight: 220,
                  overflowY:
                    'auto'
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color:
                      'var(--danger)',
                    marginBottom: 8
                  }}
                >
                  Failure Reasons:
                </div>

                {summary.errors.map(
                  (
                    error,
                    index
                  ) => (
                    <div
                      key={
                        index
                      }
                      style={{
                        fontSize: 11,
                        color:
                          'var(--danger)',
                        marginBottom: 6,
                        lineHeight:
                          1.4
                      }}
                    >
                      • {error}
                    </div>
                  )
                )}
              </div>
            )}

            {/* =================================================
                DONE
            ================================================= */}

            <button
              className="btn btn-primary"
              style={{
                marginTop: 20,
                width: '100%'
              }}
              onClick={
                handleReset
              }
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
