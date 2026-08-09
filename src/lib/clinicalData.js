// Static clinical reference data for the Doctor Workbench.
// Kept local (not fetched) so autocomplete works instantly and offline —
// consistent with the rest of this app's offline-first design.

export const SYMPTOM_OPTIONS = [
  'Fever', 'Fever with chills', 'Fever with headache', 'Fever with rash',
  'Cough', 'Dry cough', 'Cough with sputum', 'Cough with blood',
  'Headache', 'Sore throat', 'Runny nose', 'Nasal congestion',
  'Vomiting', 'Nausea', 'Diarrhoea', 'Constipation', 'Abdominal pain',
  'Chest pain', 'Shortness of breath', 'Difficulty breathing', 'Wheezing',
  'Fatigue', 'Body weakness', 'Joint pain', 'Muscle pain (myalgia)',
  'Dizziness', 'Loss of appetite', 'Weight loss', 'Night sweats',
  'Rash', 'Itching', 'Swelling', 'Yellowing of eyes (jaundice)',
  'Painful urination', 'Frequent urination', 'Blood in urine', 'Blood in stool',
  'Back pain', 'Neck stiffness', 'Seizures', 'Palpitations',
  'Blurred vision', 'Ear pain', 'Difficulty swallowing', 'Anxiety',
  'Insomnia', 'Confusion', 'Numbness', 'Bleeding gums',
].map(label => ({ id: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'), label }))

// [name, ICD-10 code]
export const DIAGNOSIS_OPTIONS = [
  ['Malaria', 'B54'],
  ['Severe malaria', 'B50.9'],
  ['Malaria with anaemia', 'B50.0'],
  ['Typhoid fever', 'A01.0'],
  ['Acute upper respiratory tract infection (URTI)', 'J06.9'],
  ['Acute pharyngitis', 'J02.9'],
  ['Pneumonia', 'J18.9'],
  ['Bronchial asthma', 'J45.9'],
  ['Urinary tract infection', 'N39.0'],
  ['Acute cystitis', 'N30.0'],
  ['Gastroenteritis', 'A09'],
  ['Peptic ulcer disease', 'K27.9'],
  ['Gastritis', 'K29.7'],
  ['Essential hypertension', 'I10'],
  ['Type 2 diabetes mellitus', 'E11.9'],
  ['Anaemia, unspecified', 'D64.9'],
  ['Migraine', 'G43.9'],
  ['Tension headache', 'G44.2'],
  ['Otitis media', 'H66.9'],
  ['Allergic rhinitis', 'J30.4'],
  ['Allergic contact dermatitis', 'L23.9'],
  ['Pulmonary tuberculosis', 'A15.9'],
  ['Low back pain', 'M54.5'],
  ['Osteoarthritis', 'M19.9'],
  ['Acute appendicitis', 'K35.80'],
  ['Dysmenorrhoea', 'N94.6'],
  ['Pelvic inflammatory disease', 'N73.9'],
  ['Conjunctivitis', 'H10.9'],
  ['Scabies', 'B86'],
  ['Helminthiasis (worm infestation)', 'B82.9'],
].map(([label, code]) => ({ id: code.toLowerCase(), label, code }))

export const FREQUENCY_OPTIONS = [
  'Once daily (OD)', 'Twice daily (BD)', 'Three times daily (TDS)', 'Four times daily (QDS)',
  'Every 4 hours', 'Every 6 hours', 'Every 8 hours', 'Every 12 hours',
  'At bedtime (Nocte)', 'When required (PRN)', 'Before meals', 'After meals',
  'STAT', 'Weekly', 'Custom',
]

export const ROUTE_OPTIONS = [
  'Oral', 'IV', 'IM', 'SC', 'Topical', 'Inhalation',
  'Eye', 'Ear', 'Nasal', 'Rectal', 'Vaginal', 'Sublingual', 'Other',
]

// Built-in starter templates, always available alongside anything a
// hospital saves for itself. Ids are prefixed 'builtin-' to distinguish
// them from hospital-created rows (which come from Supabase with real uuids).
export const DEFAULT_TEMPLATES = [
  {
    id: 'builtin-malaria', name: 'Malaria', category: 'Infectious disease', builtin: true,
    medications: [
      { drug_name: 'Artemether-Lumefantrine 20/120mg', dose: '4 tablets', route: 'Oral', frequency: 'Twice daily (BD)', duration: '3 days', quantity: '24 tablets', instructions: 'Take with fatty food/milk to improve absorption' },
      { drug_name: 'Paracetamol 500mg', dose: '1-2 tablets', route: 'Oral', frequency: 'Three times daily (TDS)', duration: '3 days', quantity: '18 tablets', instructions: 'For fever, as needed' },
    ],
  },
  {
    id: 'builtin-hypertension', name: 'Hypertension', category: 'Chronic disease', builtin: true,
    medications: [
      { drug_name: 'Amlodipine 5mg', dose: '1 tablet', route: 'Oral', frequency: 'Once daily (OD)', duration: '30 days', quantity: '30 tablets', instructions: 'Take in the morning' },
    ],
  },
  {
    id: 'builtin-diabetes', name: 'Diabetes (Type 2)', category: 'Chronic disease', builtin: true,
    medications: [
      { drug_name: 'Metformin 500mg', dose: '1 tablet', route: 'Oral', frequency: 'Twice daily (BD)', duration: '30 days', quantity: '60 tablets', instructions: 'Take with meals' },
    ],
  },
  {
    id: 'builtin-urti', name: 'URTI', category: 'Infectious disease', builtin: true,
    medications: [
      { drug_name: 'Paracetamol 500mg', dose: '1-2 tablets', route: 'Oral', frequency: 'Three times daily (TDS)', duration: '5 days', quantity: '30 tablets', instructions: 'For fever/pain, as needed' },
      { drug_name: 'Chlorpheniramine 4mg', dose: '1 tablet', route: 'Oral', frequency: 'Three times daily (TDS)', duration: '5 days', quantity: '15 tablets', instructions: 'For congestion — may cause drowsiness' },
    ],
  },
  {
    id: 'builtin-pud', name: 'Peptic Ulcer Disease', category: 'Gastrointestinal', builtin: true,
    medications: [
      { drug_name: 'Omeprazole 20mg', dose: '1 capsule', route: 'Oral', frequency: 'Once daily (OD)', duration: '14 days', quantity: '14 capsules', instructions: 'Take 30 minutes before breakfast' },
    ],
  },
  {
    id: 'builtin-paed-fever', name: 'Paediatric Fever', category: 'Paediatrics', builtin: true,
    medications: [
      { drug_name: 'Paracetamol syrup 120mg/5ml', dose: '5ml', route: 'Oral', frequency: 'Every 6 hours', duration: '3 days', quantity: '1 bottle', instructions: 'Weight-based dosing — do not exceed 4 doses in 24 hours' },
    ],
  },
  {
    id: 'builtin-postop', name: 'Post-operative Medications', category: 'Surgical', builtin: true,
    medications: [
      { drug_name: 'Amoxicillin-Clavulanate 625mg', dose: '1 tablet', route: 'Oral', frequency: 'Three times daily (TDS)', duration: '5 days', quantity: '15 tablets', instructions: '' },
      { drug_name: 'Diclofenac 50mg', dose: '1 tablet', route: 'Oral', frequency: 'Twice daily (BD)', duration: '3 days', quantity: '6 tablets', instructions: 'Take after food' },
      { drug_name: 'Omeprazole 20mg', dose: '1 capsule', route: 'Oral', frequency: 'Once daily (OD)', duration: '5 days', quantity: '5 capsules', instructions: 'Gastric protection' },
    ],
  },
]
