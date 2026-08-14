import { useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'
import SearchInput from '../../components/common/SearchInput'

const BLOOD_GROUPS = ['A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown']
const GENOTYPES = ['AA','AS','SS','AC']
const MARITAL_STATUSES = ['Single','Married','Widow','Widower','Divorced']
const RELIGIONS = ['Christianity','Islam','Traditional','Other']

const CATEGORIES = [
  { value: 'personal', label: 'Personal Folder' },
  { value: 'family', label: 'Family Folder' },
  { value: 'emergency', label: 'Emergency Folder' },
  { value: 'anc', label: 'ANC Folder' },
]

const NIGERIAN_STATES = [
  'Abia',
  'Adamawa',
  'Akwa Ibom',
  'Anambra',
  'Bauchi',
  'Bayelsa',
  'Benue',
  'Borno',
  'Cross River',
  'Delta',
  'Ebonyi',
  'Edo',
  'Ekiti',
  'Enugu',
  'FCT (Abuja)',
  'Gombe',
  'Imo',
  'Jigawa',
  'Kaduna',
  'Kano',
  'Katsina',
  'Kebbi',
  'Kogi',
  'Kwara',
  'Lagos',
  'Nasarawa',
  'Niger',
  'Ogun',
  'Ondo',
  'Osun',
  'Oyo',
  'Plateau',
  'Rivers',
  'Sokoto',
  'Taraba',
  'Yobe',
  'Zamfara',
]

const AFRICAN_COUNTRIES = [
  'Algeria',
  'Angola',
  'Benin',
  'Botswana',
  'Burkina Faso',
  'Burundi',
  'Cabo Verde',
  'Cameroon',
  'Central African Republic',
  'Chad',
  'Comoros',
  'Congo (Republic)',
  'Congo (DRC)',
  'Djibouti',
  'Egypt',
  'Equatorial Guinea',
  'Eritrea',
  'Eswatini',
  'Ethiopia',
  'Gabon',
  'Gambia',
  'Ghana',
  'Guinea',
  'Guinea-Bissau',
  'Ivory Coast',
  'Kenya',
  'Lesotho',
  'Liberia',
  'Libya',
  'Madagascar',
  'Malawi',
  'Mali',
  'Mauritania',
  'Mauritius',
  'Morocco',
  'Mozambique',
  'Namibia',
  'Niger',
  'Nigeria',
  'Rwanda',
  'Sao Tome and Principe',
  'Senegal',
  'Seychelles',
  'Sierra Leone',
  'Somalia',
  'South Africa',
  'South Sudan',
  'Sudan',
  'Tanzania',
  'Togo',
  'Tunisia',
  'Uganda',
  'Zambia',
  'Zimbabwe',
]

const QUEUE_STAGES = [
  {
    key: 'waiting',
    label: 'Waiting',
    color: 'var(--gold)',
    bg: 'rgba(201,169,97,0.14)',
  },
  {
    key: 'in_consultation',
    label: 'In Consultation',
    color: 'var(--blue)',
    bg: 'rgba(76,141,255,0.14)',
  },
  {
    key: 'in_lab',
    label: 'In Lab',
    color: 'var(--violet)',
    bg: 'rgba(139,124,246,0.14)',
  },
  {
    key: 'discharged',
    label: 'Discharged',
    color: 'var(--teal)',
    bg: 'var(--teal-soft)',
  },
]

const EMPTY_FORM = {
  surname: '',
  otherNames: '',
  phone: '',
  email: '',
  gender: '',
  maritalStatus: '',
  dateOfBirth: '',
  age: '',
  bloodGroup: '',
  nationality: '',
  stateOfOrigin: '',
  occupation: '',
  religion: '',
  category: '',
  homeAddress: '',

  ancSpecialPoint: '',
  ancDateOfBooking: '',
  ancIndication: '',
  ancLmp: '',
  ancEdd: '',
  ancHusbandName: '',
  ancHusbandOccupation: '',
  ancEmployer: '',

  nokName: '',
  nokRelationship: '',
  nokPhone: '',
  nokAddress: '',

  genotype: '',
}

function compressImage(file, maxWidth = 240) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      const img = new Image()

      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width)

        const canvas = document.createElement('canvas')

        canvas.width = img.width * scale
        canvas.height = img.height * scale

        const ctx = canvas.getContext('2d')

        if (!ctx) {
          reject(new Error('Could not create image canvas'))
          return
        }

        ctx.drawImage(
          img,
          0,
          0,
          canvas.width,
          canvas.height
        )

        resolve(
          canvas.toDataURL('image/jpeg', 0.6)
        )
      }

      img.onerror = () => {
        reject(new Error('Could not load image'))
      }

      img.src = reader.result
    }

    reader.onerror = () => {
      reject(new Error('Could not read image'))
    }

    reader.readAsDataURL(file)
  })
}

function timeSince(iso) {
  if (!iso) return ''

  const mins = Math.floor(
    (Date.now() - new Date(iso).getTime()) / 60000
  )

  if (mins < 1) return 'just now'

  if (mins < 60) {
    return `${mins}m ago`
  }

  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`
}

function calculateAge(dobStr) {
  if (!dobStr) return ''

  const dob = new Date(dobStr)

  if (Number.isNaN(dob.getTime())) {
    return ''
  }

  const today = new Date()

  let age =
    today.getFullYear() -
    dob.getFullYear()

  const m =
    today.getMonth() -
    dob.getMonth()

  if (
    m < 0 ||
    (m === 0 &&
      today.getDate() < dob.getDate())
  ) {
    age--
  }

  return age >= 0 ? String(age) : ''
}

function calculateEdd(lmpStr) {
  if (!lmpStr) return ''

  const lmp = new Date(lmpStr)

  if (Number.isNaN(lmp.getTime())) {
    return ''
  }

  lmp.setDate(lmp.getDate() + 280)

  return lmp.toISOString().slice(0, 10)
}

export default function Reception() {
  const { profile, hospital } = useAuth()

  const {
    records: patients,
    loading,
    isOnline,
    pendingCount,
    addRecord,
    updateRecord,
  } = useOfflineTable(
    'patients',
    hospital?.id
  )

  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  const fileInputRef = useRef(null)

  const [form, setForm] = useState(EMPTY_FORM)
  const [photoData, setPhotoData] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  function set(key, value) {
    setForm(f => ({
      ...f,
      [key]: value,
    }))
  }

  function handleDobChange(value) {
    setForm(f => ({
      ...f,
      dateOfBirth: value,
      age: calculateAge(value),
    }))
  }

  function handleLmpChange(value) {
    setForm(f => ({
      ...f,
      ancLmp: value,
      ancEdd: calculateEdd(value),
    }))
  }

  function showToast(msg) {
    setToast(msg)

    setTimeout(() => {
      setToast(null)
    }, 3000)
  }

  async function handlePhotoSelect(e) {
    const file = e.target.files?.[0]

    if (!file) return

    try {
      const compressed = await compressImage(file)

      setPhotoData(compressed)
    } catch (err) {
      console.error('Photo processing error:', err)
      showToast('Could not process photo')
    }
  }

  /*
   * ============================================================
   * REGISTER PATIENT
   * ============================================================
   *
   * Important:
   * full_name is required by the patients table.
   *
   * We therefore build and validate full_name BEFORE sending
   * anything to Supabase.
   */

  async function handleRegister(e) {
    e.preventDefault()

    setFormError('')

    // Clean the two name fields
    const surname = String(
      form.surname || ''
    ).trim()

    const otherNames = String(
      form.otherNames || ''
    ).trim()

    // Build the required full name
    const fullName = `${surname} ${otherNames}`.trim()

    // Validate names
    if (!surname || !otherNames) {
      setFormError(
        'Surname and other names are required.'
      )
      return
    }

    // Extra protection against null/empty full_name
    if (!fullName) {
      setFormError(
        'Patient full name is required.'
      )
      return
    }

    // Make sure authentication data is ready
    if (!hospital?.id || !profile?.id) {
      setFormError(
        'Still loading your account — try again in a moment.'
      )
      return
    }

    setSaving(true)

    try {
      const isAnc =
        form.category === 'anc'

      /*
       * This is the exact patient object that will be stored.
       */
      const patientData = {
        // REQUIRED
        full_name: fullName,

        // Basic patient information
        age: form.age
          ? parseInt(form.age, 10)
          : null,

        gender:
          form.gender || null,

        phone:
          form.phone || null,

        email:
          form.email || null,

        marital_status:
          form.maritalStatus || null,

        date_of_birth:
          form.dateOfBirth || null,

        blood_group:
          form.bloodGroup || null,

        genotype:
          form.genotype || null,

        nationality:
          form.nationality || null,

        state_of_origin:
          form.stateOfOrigin || null,

        occupation:
          form.occupation || null,

        religion:
          form.religion || null,

        category:
          form.category || null,

        address:
          form.homeAddress || null,

        /*
         * ======================================================
         * ANC INFORMATION
         * ======================================================
         */

        anc_special_point: isAnc
          ? form.ancSpecialPoint || null
          : null,

        anc_date_of_booking: isAnc
          ? form.ancDateOfBooking || null
          : null,

        anc_indication: isAnc
          ? form.ancIndication || null
          : null,

        anc_lmp: isAnc
          ? form.ancLmp || null
          : null,

        anc_edd: isAnc
          ? form.ancEdd || null
          : null,

        anc_husband_name: isAnc
          ? form.ancHusbandName || null
          : null,

        anc_husband_occupation: isAnc
          ? form.ancHusbandOccupation || null
          : null,

        anc_employer: isAnc
          ? form.ancEmployer || null
          : null,

        /*
         * ======================================================
         * NEXT OF KIN
         * ======================================================
         */

        emergency_contact_name:
          form.nokName || null,

        emergency_contact_phone:
          form.nokPhone || null,

        next_of_kin_relationship:
          form.nokRelationship || null,

        next_of_kin_address:
          form.nokAddress || null,

        /*
         * ======================================================
         * PHOTO
         * ======================================================
         */

        photo_data:
          photoData || null,

        /*
         * ======================================================
         * QUEUE
         * ======================================================
         */

        status: 'stable',

        queue_status: 'waiting',

        queue_updated_at:
          new Date().toISOString(),

        /*
         * ======================================================
         * USER / HOSPITAL
         * ======================================================
         */

        created_by: profile.id,

        hospital_id: hospital.id,
      }

      /*
       * Useful while testing.
       * You will see the exact object in the browser console.
       */
      console.log(
        'Registering patient:',
        patientData
      )

      /*
       * Save patient through the offline table.
       * It will save locally and sync to Supabase.
       */
      await addRecord(patientData)

      /*
       * Success
       */
      setShowModal(false)

      resetForm()

      showToast(
        isOnline
          ? `${fullName} registered and checked in`
          : `${fullName} registered — will sync when back online`
      )

    } catch (err) {
      console.error(
        'Patient registration failed:',
        err
      )

      setFormError(
        err?.message ||
        err?.error_description ||
        'Could not register patient'
      )

    } finally {
      setSaving(false)
    }
  }

  function resetForm() {
    setForm(EMPTY_FORM)

    setPhotoData(null)

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  async function moveStage(
    patient,
    newStage
  ) {
    try {
      await updateRecord(
        patient.id,
        {
          queue_status: newStage,
          queue_updated_at:
            new Date().toISOString(),
        }
      )
    } catch (err) {
      console.error(
        'Could not move patient:',
        err
      )

      showToast(
        err?.message ||
        'Could not update patient queue'
      )
    }
  }

  async function removeFromQueue(patient) {
    try {
      await updateRecord(
        patient.id,
        {
          queue_status: null,
        }
      )

      showToast(
        `${patient.full_name} removed from queue`
      )

    } catch (err) {
      console.error(
        'Could not remove patient:',
        err
      )

      showToast(
        err?.message ||
        'Could not remove patient from queue'
      )
    }
  }

  const inQueue = patients.filter(
    p => p.queue_status
  )

  const queueSearch =
    searchTerm.trim().toLowerCase()

  const visibleQueue =
    queueSearch
      ? inQueue.filter(p =>
          [
            p.full_name,
            p.patient_id,
            p.phone,
          ].some(v =>
            String(v || '')
              .toLowerCase()
              .includes(queueSearch)
          )
        )
      : inQueue

  return (
    <>
      {/* ======================================================
          RECEPTION HEADER
          ====================================================== */}

      <div
        className="dash-panel"
        style={{
          marginBottom: 16,
        }}
      >
        <div className="dash-panel-head">
          <div>
            <div className="dash-panel-title">
              Reception
            </div>

            <div
              className="dash-panel-sub"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: isOnline
                    ? 'var(--teal)'
                    : 'var(--danger)',
                  display: 'inline-block',
                }}
              />

              {isOnline
                ? 'Online'
                : 'Offline'}

              {pendingCount > 0
                ? ` · ${pendingCount} syncing`
                : ''}
            </div>
          </div>

          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search patients by name, ID or phone"
            style={{
              minWidth: 260,
              maxWidth: 420,
            }}
          />

          <button
            className="btn btn-primary"
            style={{
              width: 'auto',
            }}
            onClick={() => {
              setFormError('')
              setShowModal(true)
            }}
          >
            + Register &amp; Check In
          </button>
        </div>

        <div
          style={{
            fontSize: 12.5,
            color: 'var(--muted)',
          }}
        >
          {inQueue.length} patient(s)
          currently in the queue
        </div>
      </div>

      {/* ======================================================
          QUEUE
          ====================================================== */}

      {loading ? (
        <div
          className="dash-panel"
          style={{
            textAlign: 'center',
            padding: 40,
            color: 'var(--muted)',
          }}
        >
          Loading…
        </div>
      ) : (
        <div className="dash-row dash-row-2b">
          {QUEUE_STAGES.map(stage => {
            const stagePatients =
              visibleQueue.filter(
                p =>
                  p.queue_status ===
                  stage.key
              )

            return (
              <div
                className="dash-panel"
                key={stage.key}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 14,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background:
                        stage.color,
                    }}
                  />

                  <div
                    style={{
                      fontFamily:
                        'var(--font-display)',
                      fontSize: 15,
                    }}
                  >
                    {stage.label}
                  </div>

                  <span
                    style={{
                      marginLeft: 'auto',
                      fontSize: 11,
                      color: 'var(--muted)',
                      fontFamily:
                        'var(--font-mono)',
                    }}
                  >
                    {stagePatients.length}
                  </span>
                </div>

                {stagePatients.length === 0 ? (
                  <div
                    style={{
                      color: 'var(--muted)',
                      fontSize: 12,
                      padding: '6px 0',
                    }}
                  >
                    No patients here
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    {stagePatients.map(p => (
                      <div
                        key={p.id}
                        style={{
                          border:
                            '1px solid var(--line)',
                          borderRadius: 10,
                          padding: 10,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                        }}
                      >
                        {p.photo_data ? (
                          <img
                            src={p.photo_data}
                            alt=""
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: '50%',
                              objectFit: 'cover',
                              flexShrink: 0,
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: '50%',
                              background:
                                stage.bg,
                              flexShrink: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent:
                                'center',
                              fontSize: 12,
                              fontWeight: 700,
                              color:
                                stage.color,
                            }}
                          >
                            {p.full_name
                              ?.trim()
                              ?.charAt(0)
                              ?.toUpperCase()}
                          </div>
                        )}

                        <div
                          style={{
                            flex: 1,
                            minWidth: 0,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 12.5,
                              fontWeight: 700,
                              whiteSpace:
                                'nowrap',
                              overflow:
                                'hidden',
                              textOverflow:
                                'ellipsis',
                            }}
                          >
                            {p.full_name}
                          </div>

                          <div
                            style={{
                              fontSize: 10.5,
                              color:
                                'var(--muted)',
                            }}
                          >
                            {timeSince(
                              p.queue_updated_at
                            )}
                          </div>
                        </div>

                        <select
                          value={stage.key}
                          onChange={e =>
                            moveStage(
                              p,
                              e.target.value
                            )
                          }
                          style={{
                            background:
                              'var(--bg-elevated)',
                            color:
                              'var(--ivory)',
                            border:
                              '1px solid var(--line)',
                            borderRadius: 7,
                            padding:
                              '4px 6px',
                            fontSize: 10.5,
                            flexShrink: 0,
                          }}
                        >
                          {QUEUE_STAGES.map(
                            s => (
                              <option
                                key={s.key}
                                value={s.key}
                              >
                                {s.label}
                              </option>
                            )
                          )}
                        </select>

                        <button
                          onClick={() =>
                            removeFromQueue(p)
                          }
                          style={{
                            background:
                              'transparent',
                            border:
                              '1px solid var(--line)',
                            color:
                              'var(--muted)',
                            borderRadius: 7,
                            width: 26,
                            height: 26,
                            cursor:
                              'pointer',
                            flexShrink: 0,
                            fontSize: 12,
                          }}
                          title="Remove from queue"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ======================================================
          REGISTER MODAL
          ====================================================== */}

      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background:
              'rgba(0,3,26,0.72)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: 20,
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: 560,
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                fontFamily:
                  'var(--font-display)',
                fontSize: 19,
                marginBottom: 18,
              }}
            >
              Register &amp; Check In
            </div>

            {formError && (
              <div className="error-box">
                {formError}
              </div>
            )}

            <form onSubmit={handleRegister}>
              {/* ==================================================
                  PHOTO
                  ================================================== */}

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  marginBottom: 16,
                }}
              >
                <div
                  onClick={() =>
                    fileInputRef.current?.click()
                  }
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    border:
                      '1px dashed var(--line)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent:
                      'center',
                    cursor: 'pointer',
                    flexShrink: 0,
                    background:
                      'rgba(255,255,255,0.02)',
                    overflow: 'hidden',
                  }}
                >
                  {photoData ? (
                    <img
                      src={photoData}
                      alt=""
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                  ) : (
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--muted)"
                      strokeWidth="1.6"
                    >
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle
                        cx="12"
                        cy="13"
                        r="4"
                      />
                    </svg>
                  )}
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: 700,
                      color:
                        'var(--ivory)',
                    }}
                  >
                    {photoData
                      ? 'Photo captured'
                      : 'Add photo ID'}
                  </div>

                  <div
                    style={{
                      fontSize: 11,
                      color:
                        'var(--muted)',
                    }}
                  >
                    Tap the circle to use
                    your camera
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={
                    handlePhotoSelect
                  }
                  style={{
                    display: 'none',
                  }}
                />
              </div>

              {/* ==================================================
                  SECTION 1: BIODATA
                  ================================================== */}

              <div
                style={{
                  fontSize: 11,
                  color: 'var(--teal)',
                  textTransform:
                    'uppercase',
                  letterSpacing: 1,
                  fontWeight: 800,
                  marginBottom: 10,
                  paddingBottom: 6,
                  borderBottom:
                    '1px solid var(--line-soft)',
                }}
              >
                Patient Biodata
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    '1fr 1fr',
                  gap: 10,
                }}
              >
                <div className="field">
                  <label>
                    Surname
                  </label>

                  <input
                    value={form.surname}
                    onChange={e =>
                      set(
                        'surname',
                        e.target.value
                      )
                    }
                    placeholder="e.g. Okafor"
                  />
                </div>

                <div className="field">
                  <label>
                    Other Names
                  </label>

                  <input
                    value={form.otherNames}
                    onChange={e =>
                      set(
                        'otherNames',
                        e.target.value
                      )
                    }
                    placeholder="e.g. Chinedu"
                  />
                </div>

                <div className="field">
                  <label>Tel</label>

                  <input
                    value={form.phone}
                    onChange={e =>
                      set(
                        'phone',
                        e.target.value
                      )
                    }
                    placeholder="e.g. 0803 000 0000"
                  />
                </div>

                <div className="field">
                  <label>Email</label>

                  <input
                    type="email"
                    value={form.email}
                    onChange={e =>
                      set(
                        'email',
                        e.target.value
                      )
                    }
                    placeholder="e.g. name@email.com"
                  />
                </div>

                <div className="field">
                  <label>Gender</label>

                  <select
                    value={form.gender}
                    onChange={e =>
                      set(
                        'gender',
                        e.target.value
                      )
                    }
                  >
                    <option value="">
                      —
                    </option>

                    <option value="Male">
                      Male
                    </option>

                    <option value="Female">
                      Female
                    </option>
                  </select>
                </div>

                <div className="field">
                  <label>
                    Marital Status
                  </label>

                  <select
                    value={
                      form.maritalStatus
                    }
                    onChange={e =>
                      set(
                        'maritalStatus',
                        e.target.value
                      )
                    }
                  >
                    <option value="">
                      —
                    </option>

                    {MARITAL_STATUSES.map(
                      m => (
                        <option
                          key={m}
                          value={m}
                        >
                          {m}
                        </option>
                      )
                    )}
                  </select>
                </div>

                <div className="field">
                  <label>
                    Date of Birth
                  </label>

                  <input
                    type="date"
                    value={
                      form.dateOfBirth
                    }
                    onChange={e =>
                      handleDobChange(
                        e.target.value
                      )
                    }
                  />
                </div>

                <div className="field">
                  <label>Age</label>

                  <input
                    value={form.age}
                    readOnly
                    placeholder="Auto-calculated"
                    style={{
                      opacity: 0.75,
                    }}
                  />
                </div>

                <div className="field">
                  <label>
                    Blood Group
                  </label>

                  <select
                    value={
                      form.bloodGroup
                    }
                    onChange={e =>
                      set(
                        'bloodGroup',
                        e.target.value
                      )
                    }
                  >
                    <option value="">
                      —
                    </option>

                    {BLOOD_GROUPS.map(
                      bg => (
                        <option
                          key={bg}
                          value={bg}
                        >
                          {bg}
                        </option>
                      )
                    )}
                  </select>
                </div>

                <div className="field">
                  <label>
                    Genotype
                  </label>

                  <select
                    value={form.genotype}
                    onChange={e =>
                      set(
                        'genotype',
                        e.target.value
                      )
                    }
                  >
                    <option value="">
                      —
                    </option>

                    {GENOTYPES.map(g => (
                      <option
                        key={g}
                        value={g}
                      >
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label>
                    Nationality
                  </label>

                  <input
                    list="african-countries"
                    value={
                      form.nationality
                    }
                    onChange={e =>
                      set(
                        'nationality',
                        e.target.value
                      )
                    }
                    placeholder="Start typing…"
                  />

                  <datalist id="african-countries">
                    {AFRICAN_COUNTRIES.map(
                      c => (
                        <option
                          key={c}
                          value={c}
                        />
                      )
                    )}
                  </datalist>
                </div>

                <div className="field">
                  <label>
                    State of Origin
                  </label>

                  <select
                    value={
                      form.stateOfOrigin
                    }
                    onChange={e =>
                      set(
                        'stateOfOrigin',
                        e.target.value
                      )
                    }
                  >
                    <option value="">
                      —
                    </option>

                    {NIGERIAN_STATES.map(
                      s => (
                        <option
                          key={s}
                          value={s}
                        >
                          {s}
                        </option>
                      )
                    )}
                  </select>
                </div>

                <div className="field">
                  <label>
                    Occupation
                  </label>

                  <input
                    value={
                      form.occupation
                    }
                    onChange={e =>
                      set(
                        'occupation',
                        e.target.value
                      )
                    }
                    placeholder="e.g. Trader"
                  />
                </div>

                <div className="field">
                  <label>
                    Religion
                  </label>

                  <select
                    value={form.religion}
                    onChange={e =>
                      set(
                        'religion',
                        e.target.value
                      )
                    }
                  >
                    <option value="">
                      —
                    </option>

                    {RELIGIONS.map(r => (
                      <option
                        key={r}
                        value={r}
                      >
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label>
                    Category / Folder
                  </label>

                  <select
                    value={form.category}
                    onChange={e =>
                      set(
                        'category',
                        e.target.value
                      )
                    }
                  >
                    <option value="">
                      —
                    </option>

                    {CATEGORIES.map(c => (
                      <option
                        key={c.value}
                        value={c.value}
                      >
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="field">
                <label>
                  Home Address
                </label>

                <input
                  value={
                    form.homeAddress
                  }
                  onChange={e =>
                    set(
                      'homeAddress',
                      e.target.value
                    )
                  }
                  placeholder="e.g. 12 Ada George Road, Port Harcourt"
                />
              </div>

              {/* ==================================================
                  SECTION 2: ANC
                  ================================================== */}

              {form.category === 'anc' && (
                <>
                  <div
                    style={{
                      fontSize: 11,
                      color:
                        'var(--violet)',
                      textTransform:
                        'uppercase',
                      letterSpacing: 1,
                      fontWeight: 800,
                      marginTop: 18,
                      marginBottom: 10,
                      paddingBottom: 6,
                      borderBottom:
                        '1px solid var(--line-soft)',
                    }}
                  >
                    ANC Specific Details
                  </div>

                  <div className="field">
                    <label>
                      Special Point
                    </label>

                    <input
                      value={
                        form.ancSpecialPoint
                      }
                      onChange={e =>
                        set(
                          'ancSpecialPoint',
                          e.target.value
                        )
                      }
                      placeholder="e.g. First pregnancy"
                    />
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns:
                        '1fr 1fr',
                      gap: 10,
                    }}
                  >
                    <div className="field">
                      <label>
                        Date of Booking
                      </label>

                      <input
                        type="date"
                        value={
                          form.ancDateOfBooking
                        }
                        onChange={e =>
                          set(
                            'ancDateOfBooking',
                            e.target.value
                          )
                        }
                      />
                    </div>

                    <div className="field">
                      <label>
                        Indication for Booking
                      </label>

                      <input
                        value={
                          form.ancIndication
                        }
                        onChange={e =>
                          set(
                            'ancIndication',
                            e.target.value
                          )
                        }
                        placeholder="e.g. Routine ANC"
                      />
                    </div>

                    <div className="field">
                      <label>
                        Last Menstrual Period (LMP)
                      </label>

                      <input
                        type="date"
                        value={
                          form.ancLmp
                        }
                        onChange={e =>
                          handleLmpChange(
                            e.target.value
                          )
                        }
                      />
                    </div>

                    <div className="field">
                      <label>
                        Estimated Date of Delivery (EDD)
                      </label>

                      <input
                        type="date"
                        value={
                          form.ancEdd
                        }
                        readOnly
                        style={{
                          opacity: 0.75,
                        }}
                      />
                    </div>

                    <div className="field">
                      <label>
                        Husband's Name
                      </label>

                      <input
                        value={
                          form.ancHusbandName
                        }
                        onChange={e =>
                          set(
                            'ancHusbandName',
                            e.target.value
                          )
                        }
                      />
                    </div>

                    <div className="field">
                      <label>
                        Husband's Occupation
                      </label>

                      <input
                        value={
                          form.ancHusbandOccupation
                        }
                        onChange={e =>
                          set(
                            'ancHusbandOccupation',
                            e.target.value
                          )
                        }
                      />
                    </div>
                  </div>

                  <div className="field">
                    <label>
                      Employer
                    </label>

                    <input
                      value={
                        form.ancEmployer
                      }
                      onChange={e =>
                        set(
                          'ancEmployer',
                          e.target.value
                        )
                      }
                    />
                  </div>
                </>
              )}

              {/* ==================================================
                  SECTION 3: NEXT OF KIN
                  ================================================== */}

              <div
                style={{
                  fontSize: 11,
                  color: 'var(--gold)',
                  textTransform:
                    'uppercase',
                  letterSpacing: 1,
                  fontWeight: 800,
                  marginTop: 18,
                  marginBottom: 10,
                  paddingBottom: 6,
                  borderBottom:
                    '1px solid var(--line-soft)',
                }}
              >
                Next of Kin
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    '1fr 1fr',
                  gap: 10,
                }}
              >
                <div className="field">
                  <label>Name</label>

                  <input
                    value={form.nokName}
                    onChange={e =>
                      set(
                        'nokName',
                        e.target.value
                      )
                    }
                    placeholder="e.g. Ngozi Okafor"
                  />
                </div>

                <div className="field">
                  <label>
                    Relationship
                  </label>

                  <input
                    value={
                      form.nokRelationship
                    }
                    onChange={e =>
                      set(
                        'nokRelationship',
                        e.target.value
                      )
                    }
                    placeholder="e.g. Spouse"
                  />
                </div>

                <div className="field">
                  <label>Tel</label>

                  <input
                    value={form.nokPhone}
                    onChange={e =>
                      set(
                        'nokPhone',
                        e.target.value
                      )
                    }
                    placeholder="e.g. 0803 000 0000"
                  />
                </div>

                <div className="field">
                  <label>
                    Address
                  </label>

                  <input
                    value={
                      form.nokAddress
                    }
                    onChange={e =>
                      set(
                        'nokAddress',
                        e.target.value
                      )
                    }
                  />
                </div>
              </div>

              {/* ==================================================
                  BUTTONS
                  ================================================== */}

              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  marginTop: 22,
                }}
              >
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setShowModal(false)
                    resetForm()
                  }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {saving
                    ? 'Registering…'
                    : 'Register & Check In'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================
          TOAST
          ====================================================== */}

      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform:
              'translateX(-50%)',
            background:
              'var(--bg-elevated)',
            border:
              '1px solid var(--teal)',
            color: 'var(--teal)',
            padding: '12px 20px',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 700,
            zIndex: 60,
            maxWidth: '85vw',
            textAlign: 'center',
          }}
        >
          {toast}
        </div>
      )}
    </>
  )
}
