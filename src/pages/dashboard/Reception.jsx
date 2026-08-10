import { useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'
import SearchInput from '../../components/common/SearchInput'

const BLOOD_GROUPS = ['A+','A-','B+','B-','AB+','AB-','O+','O-']
const GENOTYPES = ['AA','AS','SS','AC']

const QUEUE_STAGES = [
  {
    key: 'waiting',
    label: 'Waiting',
    color: 'var(--gold)',
    bg: 'rgba(201,169,97,0.14)'
  },
  {
    key: 'in_consultation',
    label: 'In Consultation',
    color: 'var(--blue)',
    bg: 'rgba(76,141,255,0.14)'
  },
  {
    key: 'in_lab',
    label: 'In Lab',
    color: 'var(--violet)',
    bg: 'rgba(139,124,246,0.14)'
  },
  {
    key: 'discharged',
    label: 'Discharged',
    color: 'var(--teal)',
    bg: 'var(--teal-soft)'
  }
]

function compressImage(file, maxWidth = 240){
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      const img = new Image()

      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width)

        const canvas = document.createElement('canvas')

        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)

        const ctx = canvas.getContext('2d')

        if (!ctx) {
          reject(new Error('Could not create canvas context'))
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

function timeSince(iso){
  if (!iso) return ''

  const mins = Math.floor(
    (Date.now() - new Date(iso).getTime()) / 60000
  )

  if (mins < 1) {
    return 'just now'
  }

  if (mins < 60) {
    return mins + 'm ago'
  }

  return (
    Math.floor(mins / 60) +
    'h ' +
    (mins % 60) +
    'm ago'
  )
}

export default function Reception(){
  const { profile, hospital } = useAuth()

  const {
    records: patients,
    loading,
    isOnline,
    pendingCount,
    addRecord,
    updateRecord
  } = useOfflineTable('patients', hospital?.id)

  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState(null)

  const [searchTerm, setSearchTerm] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  const fileInputRef = useRef(null)

  const [fullName, setFullName] = useState('')
  const [age, setAge] = useState('')
  const [gender, setGender] = useState('')
  const [phone, setPhone] = useState('')
  const [emName, setEmName] = useState('')
  const [emPhone, setEmPhone] = useState('')
  const [bloodGroup, setBloodGroup] = useState('')
  const [genotype, setGenotype] = useState('')
  const [photoData, setPhotoData] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  function showToast(msg){
    setToast(msg)

    setTimeout(() => {
      setToast(null)
    }, 3000)
  }

  async function handlePhotoSelect(e){
    const file = e.target.files?.[0]

    if (!file) return

    try {
      const compressed = await compressImage(file)

      setPhotoData(compressed)
    } catch {
      showToast('Could not process photo')
    }
  }

  async function handleRegister(e){
    e.preventDefault()

    setFormError('')

    if (!fullName || !age) {
      setFormError('Full name and age are required.')
      return
    }

    if (!hospital || !profile) {
      setFormError(
        'Still loading your account - try again in a moment.'
      )
      return
    }

    setSaving(true)

    try {
      await addRecord({
        full_name: fullName,
        age: parseInt(age, 10),
        gender: gender || null,
        phone: phone || null,
        emergency_contact_name: emName || null,
        emergency_contact_phone: emPhone || null,
        blood_group: bloodGroup || null,
        genotype: genotype || null,
        photo_data: photoData || null,
        status: 'stable',
        queue_status: 'waiting',
        queue_updated_at: new Date().toISOString(),
        created_by: profile.id
      })

      setShowModal(false)

      resetForm()

      if (isOnline) {
        showToast(
          fullName + ' registered and checked in'
        )
      } else {
        showToast(
          fullName +
          ' registered - will sync when back online'
        )
      }
    } catch (err) {
      setFormError(
        err.message || 'Could not register patient'
      )
    } finally {
      setSaving(false)
    }
  }

  function resetForm(){
    setFullName('')
    setAge('')
    setGender('')
    setPhone('')
    setEmName('')
    setEmPhone('')
    setBloodGroup('')
    setGenotype('')
    setPhotoData(null)

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  async function moveStage(patient, newStage){
    try {
      await updateRecord(patient.id, {
        queue_status: newStage,
        queue_updated_at: new Date().toISOString()
      })
    } catch (err) {
      showToast('Failed to update stage')
    }
  }

  async function removeFromQueue(patient){
    try {
      await updateRecord(patient.id, {
        queue_status: null
      })

      showToast(
        patient.full_name + ' removed from queue'
      )
    } catch (err) {
      showToast(
        'Failed to remove patient from queue'
      )
    }
  }

  const inQueue = patients.filter(
    patient => patient.queue_status
  )

  const queueSearch = searchTerm
    .trim()
    .toLowerCase()

  /*
   * RECEPTION SEARCH
   *
   * Searches:
   * 1. Patient name
   * 2. Patient ID
   * 3. Phone number
   */

  const searchMatches = queueSearch
    ? inQueue
        .filter(patient => {
          const name = String(
            patient.full_name || ''
          ).toLowerCase()

          const patientId = String(
            patient.patient_id || ''
          ).toLowerCase()

          const phoneNumber = String(
            patient.phone || ''
          ).toLowerCase()

          return (
            name.includes(queueSearch) ||
            patientId.includes(queueSearch) ||
            phoneNumber.includes(queueSearch)
          )
        })
        .slice(0, 6)
    : []

  const visibleQueue = queueSearch
    ? searchMatches
    : inQueue

  function selectPatient(patient){
    setSearchTerm(
      patient.patient_id ||
      patient.full_name ||
      ''
    )

    setShowSuggestions(false)
  }

  function clearSearch(){
    setSearchTerm('')
    setShowSuggestions(false)
  }

  return (
    <>
      <div
        className="dash-panel"
        style={{ marginBottom: 16 }}
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
                gap: 8
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
                  display: 'inline-block'
                }}
              />

              {isOnline
                ? 'Online'
                : 'Offline'}

              {pendingCount > 0
                ? ' · ' +
                  pendingCount +
                  ' syncing'
                : ''}
            </div>
          </div>

          <div
            style={{
              position: 'relative',
              minWidth: 260,
              maxWidth: 420,
              flex: 1
            }}
          >
            <SearchInput
              value={searchTerm}
              onChange={value => {
                setSearchTerm(value)
                setShowSuggestions(true)
              }}
              placeholder="Search patient name, ID or phone..."
              style={{
                width: '100%'
              }}
            />

            {showSuggestions &&
              searchTerm.trim() && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    left: 0,
                    right: 0,
                    background:
                      'var(--bg-elevated)',
                    border:
                      '1px solid var(--line)',
                    borderRadius: 10,
                    boxShadow:
                      '0 14px 35px rgba(0,0,0,0.25)',
                    zIndex: 30,
                    overflow: 'hidden'
                  }}
                >

                  {searchMatches.length > 0 ? (
                    <>
                      <div
                        style={{
                          padding: '9px 12px',
                          fontSize: 10,
                          color: 'var(--muted)',
                          textTransform:
                            'uppercase',
                          letterSpacing:
                            '0.08em',
                          borderBottom:
                            '1px solid var(--line)'
                        }}
                      >
                        Patient suggestions
                      </div>

                      {searchMatches.map(patient => (
                        <button
                          key={patient.id}
                          type="button"
                          onClick={() =>
                            selectPatient(patient)
                          }
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems:
                              'center',
                            gap: 10,
                            padding:
                              '10px 12px',
                            background:
                              'transparent',
                            border: 0,
                            borderBottom:
                              '1px solid var(--line)',
                            color:
                              'var(--ivory)',
                            textAlign: 'left',
                            cursor: 'pointer'
                          }}
                        >

                          {patient.photo_data ? (
                            <img
                              src={
                                patient.photo_data
                              }
                              alt=""
                              style={{
                                width: 34,
                                height: 34,
                                borderRadius:
                                  '50%',
                                objectFit:
                                  'cover',
                                flexShrink: 0
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: 34,
                                height: 34,
                                borderRadius:
                                  '50%',
                                background:
                                  'var(--teal-soft)',
                                color:
                                  'var(--teal)',
                                display:
                                  'flex',
                                alignItems:
                                  'center',
                                justifyContent:
                                  'center',
                                fontWeight: 700,
                                fontSize: 12,
                                flexShrink: 0
                              }}
                            >
                              {patient.full_name
                                ?.charAt(0)
                                ?.toUpperCase() ||
                                '?'}
                            </div>
                          )}

                          <div
                            style={{
                              minWidth: 0,
                              flex: 1
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
                                  'ellipsis'
                              }}
                            >
                              {patient.full_name}
                            </div>

                            <div
                              style={{
                                display: 'flex',
                                gap: 8,
                                flexWrap:
                                  'wrap',
                                marginTop: 2,
                                fontSize: 10.5,
                                color:
                                  'var(--muted)'
                              }}
                            >
                              <span>
                                ID:{' '}
                                {patient.patient_id ||
                                  'N/A'}
                              </span>

                              {patient.phone && (
                                <span>
                                  {patient.phone}
                                </span>
                              )}
                            </div>
                          </div>

                          <span
                            style={{
                              fontSize: 10,
                              color:
                                'var(--teal)'
                            }}
                          >
                            Select
                          </span>

                        </button>
                      ))}
                    </>
                  ) : (
                    <div
                      style={{
                        padding:
                          '16px 12px',
                        fontSize: 12,
                        color:
                          'var(--muted)',
                        textAlign:
                          'center'
                      }}
                    >
                      No matching patient found
                    </div>
                  )}

                </div>
              )}
          </div>

          <button
            className="btn btn-primary"
            style={{ width: 'auto' }}
            onClick={() =>
              setShowModal(true)
            }
          >
            + Register &amp; Check In
          </button>

        </div>

        <div
          style={{
            fontSize: 12.5,
            color: 'var(--muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent:
              'space-between',
            gap: 10
          }}
        >
          <span>
            {queueSearch
              ? visibleQueue.length +
                ' matching patient(s)'
              : inQueue.length +
                ' patient(s) currently in the queue'}
          </span>

          {queueSearch && (
            <button
              type="button"
              onClick={clearSearch}
              style={{
                background:
                  'transparent',
                border: 0,
                color:
                  'var(--teal)',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 700
              }}
            >
              Clear search
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div
          className="dash-panel"
          style={{
            textAlign: 'center',
            padding: 40,
            color: 'var(--muted)'
          }}
        >
          Loading...
        </div>
      ) : (
        <div className="dash-row dash-row-2b">

          {QUEUE_STAGES.map(stage => {

            const stagePatients =
              visibleQueue.filter(
                patient =>
                  patient.queue_status ===
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
                    alignItems:
                      'center',
                    gap: 8,
                    marginBottom: 14
                  }}
                >

                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius:
                        '50%',
                      background:
                        stage.color
                    }}
                  />

                  <div
                    style={{
                      fontFamily:
                        'var(--font-display)',
                      fontSize: 15
                    }}
                  >
                    {stage.label}
                  </div>

                  <span
                    style={{
                      marginLeft:
                        'auto',
                      fontSize: 11,
                      color:
                        'var(--muted)',
                      fontFamily:
                        'var(--font-mono)'
                    }}
                  >
                    {stagePatients.length}
                  </span>

                </div>

                {stagePatients.length === 0 ? (
                  <div
                    style={{
                      color:
                        'var(--muted)',
                      fontSize: 12,
                      padding:
                        '6px 0'
                    }}
                  >
                    {queueSearch
                      ? 'No matching patients here'
                      : 'No patients here'}
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection:
                        'column',
                      gap: 8
                    }}
                  >

                    {stagePatients.map(patient => (
                      <div
                        key={patient.id}
                        style={{
                          border:
                            '1px solid var(--line)',
                          borderRadius: 10,
                          padding: 10,
                          display: 'flex',
                          alignItems:
                            'center',
                          gap: 10
                        }}
                      >

                        {patient.photo_data ? (
                          <img
                            src={
                              patient.photo_data
                            }
                            alt=""
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius:
                                '50%',
                              objectFit:
                                'cover',
                              flexShrink: 0
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius:
                                '50%',
                              background:
                                stage.bg,
                              flexShrink: 0,
                              display:
                                'flex',
                              alignItems:
                                'center',
                              justifyContent:
                                'center',
                              fontSize: 12,
                              fontWeight: 700,
                              color:
                                stage.color
                            }}
                          >
                            {patient.full_name
                              ?.charAt(0)
                              ?.toUpperCase() ||
                              '?'}
                          </div>
                        )}

                        <div
                          style={{
                            flex: 1,
                            minWidth: 0
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
                                'ellipsis'
                            }}
                          >
                            {patient.full_name}
                          </div>

                          <div
                            style={{
                              fontSize: 10.5,
                              color:
                                'var(--muted)'
                            }}
                          >
                            {patient.patient_id
                              ? 'ID: ' +
                                patient.patient_id +
                                ' · '
                              : ''}

                            {timeSince(
                              patient.queue_updated_at
                            )}
                          </div>

                        </div>

                        <select
                          value={stage.key}
                          onChange={e =>
                            moveStage(
                              patient,
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
                            flexShrink: 0
                          }}
                        >

                          {QUEUE_STAGES.map(
                            option => (
                              <option
                                key={
                                  option.key
                                }
                                value={
                                  option.key
                                }
                              >
                                {option.label}
                              </option>
                            )
                          )}

                        </select>

                        <button
                          type="button"
                          onClick={() =>
                            removeFromQueue(
                              patient
                            )
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
                            fontSize: 12
                          }}
                          title="Remove from queue"
                        >
                          X
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

      {showModal && (
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
              maxWidth: 420,
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
          >

            <div
              style={{
                fontFamily:
                  'var(--font-display)',
                fontSize: 19,
                marginBottom: 18
              }}
            >
              Register &amp; Check In
            </div>

            {formError && (
              <div className="error-box">
                {formError}
              </div>
            )}

            <form
              onSubmit={handleRegister}
            >

              <div
                style={{
                  display: 'flex',
                  alignItems:
                    'center',
                  gap: 14,
                  marginBottom: 16
                }}
              >

                <div
                  onClick={() =>
                    fileInputRef.current?.click()
                  }
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius:
                      '50%',
                    border:
                      '1px dashed var(--line)',
                    display: 'flex',
                    alignItems:
                      'center',
                    justifyContent:
                      'center',
                    cursor:
                      'pointer',
                    flexShrink: 0,
                    background:
                      'rgba(255,255,255,0.02)',
                    overflow:
                      'hidden'
                  }}
                >

                  {photoData ? (
                    <img
                      src={photoData}
                      alt=""
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit:
                          'cover'
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
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
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
                        'var(--ivory)'
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
                        'var(--muted)'
                    }}
                  >
                    Tap the circle to use your camera
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
                    display: 'none'
                  }}
                />

              </div>

              <div className="field">
                <label>Full Name</label>

                <input
                  value={fullName}
                  onChange={e =>
                    setFullName(
                      e.target.value
                    )
                  }
                  placeholder="e.g. Chinedu Okafor"
                />
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    '1fr 1fr',
                  gap: 10
                }}
              >

                <div className="field">
                  <label>Age</label>

                  <input
                    type="number"
                    value={age}
                    onChange={e =>
                      setAge(
                        e.target.value
                      )
                    }
                    placeholder="e.g. 34"
                  />
                </div>

                <div className="field">
                  <label>Gender</label>

                  <select
                    value={gender}
                    onChange={e =>
                      setGender(
                        e.target.value
                      )
                    }
                  >
                    <option value="">
                      —
                    </option>

                    <option value="male">
                      Male
                    </option>

                    <option value="female">
                      Female
                    </option>
                  </select>
                </div>

              </div>

              <div className="field">
                <label>Phone</label>

                <input
                  value={phone}
                  onChange={e =>
                    setPhone(
                      e.target.value
                    )
                  }
                  placeholder="e.g. 0803 000 0000"
                />
              </div>

              <div className="field">
                <label>
                  Emergency Contact Name
                </label>

                <input
                  value={emName}
                  onChange={e =>
                    setEmName(
                      e.target.value
                    )
                  }
                  placeholder="e.g. Ngozi Okafor"
                />
              </div>

              <div className="field">
                <label>
                  Emergency Contact Phone
                </label>

                <input
                  value={emPhone}
                  onChange={e =>
                    setEmPhone(
                      e.target.value
                    )
                  }
                  placeholder="e.g. 0803 000 0000"
                />
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    '1fr 1fr',
                  gap: 10
                }}
              >

                <div className="field">
                  <label>
                    Blood Group
                  </label>

                  <select
                    value={bloodGroup}
                    onChange={e =>
                      setBloodGroup(
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
                    value={genotype}
                    onChange={e =>
                      setGenotype(
                        e.target.value
                      )
                    }
                  >
                    <option value="">
                      —
                    </option>

                    {GENOTYPES.map(
                      genotypeOption => (
                        <option
                          key={
                            genotypeOption
                          }
                          value={
                            genotypeOption
                          }
                        >
                          {genotypeOption}
                        </option>
                      )
                    )}
                  </select>
                </div>

              </div>

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
                    ? 'Registering...'
                    : 'Register & Check In'}
                </button>

              </div>

            </form>
          </div>
        </div>
      )}

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
            color:
              'var(--teal)',
            padding:
              '12px 20px',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 700,
            zIndex: 60,
            maxWidth: '85vw',
            textAlign:
              'center'
          }}
        >
          {toast}
        </div>
      )}
    </>
  )
}
