import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import SearchInput from '../../components/common/SearchInput'

const SHIFT_TYPES = [
  {
    code: 'M',
    name: 'Morning',
    short: 'M',
  },
  {
    code: 'N',
    name: 'Night',
    short: 'N',
  },
  {
    code: 'OFF',
    name: 'Off',
    short: 'OFF',
  },
  {
    code: 'LEAVE',
    name: 'Leave',
    short: 'LEAVE',
  },
  {
    code: 'ON CALL',
    name: 'On Call',
    short: 'ON CALL',
  },
  {
    code: 'TRAINING',
    name: 'Training',
    short: 'TRAINING',
  },
]

const ROLE_LABELS = {
  admin: 'Admin',
  doctor: 'Doctor',
  nurse: 'Nurse',
  front_desk: 'Front Desk',
  pharmacist: 'Pharmacist',
  lab: 'Laboratory',
  billing: 'Billing',
  staff: 'Staff',
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function getDaysInMonth(year, month){
  return new Date(year, month + 1, 0).getDate()
}

function makeDateKey(year, month, day){
  const monthText = String(month + 1).padStart(2, '0')
  const dayText = String(day).padStart(2, '0')

  return year + '-' + monthText + '-' + dayText
}

function getDayName(year, month, day){
  return new Date(year, month, day)
    .toLocaleDateString('en-US', {
      weekday: 'short',
    })
}

export default function DutyRoster(){
  const { profile, hospital } = useAuth()

  const currentDate = new Date()

  const [month, setMonth] = useState(
    currentDate.getMonth()
  )

  const [year, setYear] = useState(
    currentDate.getFullYear()
  )

  const [staff, setStaff] = useState([])
  const [roster, setRoster] = useState(null)
  const [entries, setEntries] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [status, setStatus] = useState('draft')

  const isAdmin = profile?.role === 'admin'

  const daysInMonth = useMemo(
    () => getDaysInMonth(year, month),
    [year, month]
  )

  const days = useMemo(() => {
    return Array.from(
      { length: daysInMonth },
      (_, index) => index + 1
    )
  }, [daysInMonth])

  function showToast(message){
    setToast(message)

    setTimeout(() => {
      setToast(null)
    }, 3000)
  }

  async function loadStaff(){
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('active', true)
      .order('full_name', {
        ascending: true,
      })

    if (error) {
      showToast(
        'Could not load staff: ' +
        error.message
      )
      return
    }

    setStaff(data || [])
  }

  async function loadRoster(){
    if (!hospital?.id) return

    setLoading(true)

    try {
      const { data: rosterData, error: rosterError } =
        await supabase
          .from('rosters')
          .select('*')
          .eq('hospital_id', hospital.id)
          .eq('month', month + 1)
          .eq('year', year)
          .is('department', null)
          .maybeSingle()

      if (rosterError) {
        throw rosterError
      }

      let currentRoster = rosterData

      if (!currentRoster) {
        const { data: createdRoster, error: createError } =
          await supabase
            .from('rosters')
            .insert({
              hospital_id: hospital.id,
              month: month + 1,
              year: year,
              department: null,
              status: 'draft',
              created_by: profile?.id || null,
            })
            .select()
            .single()

        if (createError) {
          throw createError
        }

        currentRoster = createdRoster
      }

      setRoster(currentRoster)
      setStatus(currentRoster.status || 'draft')

      const { data: entryData, error: entryError } =
        await supabase
          .from('roster_entries')
          .select('*')
          .eq('roster_id', currentRoster.id)

      if (entryError) {
        throw entryError
      }

      const mappedEntries = {}

      ;(entryData || []).forEach(entry => {
        const key =
          entry.staff_id +
          '|' +
          entry.roster_date

        mappedEntries[key] =
          entry.shift_code
      })

      setEntries(mappedEntries)

    } catch (error) {
      showToast(
        'Could not load roster: ' +
        error.message
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStaff()
  }, [])

  useEffect(() => {
    loadRoster()
  }, [hospital?.id, month, year])

  const visibleStaff = useMemo(() => {
    const search =
      searchTerm
        .trim()
        .toLowerCase()

    return staff.filter(member => {
      const matchesSearch =
        !search ||
        String(
          member.full_name || ''
        )
          .toLowerCase()
          .includes(search) ||
        String(
          member.email || ''
        )
          .toLowerCase()
          .includes(search) ||
        String(
          member.role || ''
        )
          .toLowerCase()
          .includes(search)

      const matchesRole =
        roleFilter === 'all' ||
        member.role === roleFilter

      return (
        matchesSearch &&
        matchesRole
      )
    })
  }, [
    staff,
    searchTerm,
    roleFilter,
  ])

  function getEntry(
    staffId,
    day
  ){
    const dateKey =
      makeDateKey(
        year,
        month,
        day
      )

    return (
      entries[
        staffId +
        '|' +
        dateKey
      ] || ''
    )
  }

  async function saveShift(
    staffId,
    day,
    shiftCode
  ){
    if (!isAdmin) {
      showToast(
        'Only administrators can edit the roster.'
      )
      return
    }

    if (!roster) return

    const rosterDate =
      makeDateKey(
        year,
        month,
        day
      )

    const key =
      staffId +
      '|' +
      rosterDate

    setEntries(previous => ({
      ...previous,
      [key]: shiftCode,
    }))

    setSaving(true)

    try {
      const { error } =
        await supabase
          .from('roster_entries')
          .upsert(
            {
              roster_id: roster.id,
              staff_id: staffId,
              roster_date: rosterDate,
              shift_code: shiftCode,
            },
            {
              onConflict:
                'roster_id,staff_id,roster_date',
            }
          )

      if (error) {
        throw error
      }
    } catch (error) {
      setEntries(previous => {
        const copy = {
          ...previous,
        }

        delete copy[key]

        return copy
      })

      showToast(
        'Could not save shift: ' +
        error.message
      )
    } finally {
      setSaving(false)
    }
  }

  async function publishRoster(){
    if (!isAdmin || !roster) return

    setSaving(true)

    try {
      const { error } =
        await supabase
          .from('rosters')
          .update({
            status: 'published',
          })
          .eq('id', roster.id)

      if (error) {
        throw error
      }

      setStatus('published')

      setRoster(previous => ({
        ...previous,
        status: 'published',
      }))

      showToast(
        'Roster published successfully.'
      )
    } catch (error) {
      showToast(
        'Could not publish roster: ' +
        error.message
      )
    } finally {
      setSaving(false)
    }
  }

  async function returnToDraft(){
    if (!isAdmin || !roster) return

    setSaving(true)

    try {
      const { error } =
        await supabase
          .from('rosters')
          .update({
            status: 'draft',
          })
          .eq('id', roster.id)

      if (error) {
        throw error
      }

      setStatus('draft')

      setRoster(previous => ({
        ...previous,
        status: 'draft',
      }))

      showToast(
        'Roster returned to draft.'
      )
    } catch (error) {
      showToast(
        'Could not update roster: ' +
        error.message
      )
    } finally {
      setSaving(false)
    }
  }

  function getShiftStyle(shiftCode){
    if (shiftCode === 'M') {
      return {
        background:
          'rgba(201,169,97,0.16)',
        color:
          'var(--gold)',
        border:
          '1px solid rgba(201,169,97,0.35)',
      }
    }

    if (shiftCode === 'N') {
      return {
        background:
          'rgba(76,141,255,0.16)',
        color:
          'var(--blue)',
        border:
          '1px solid rgba(76,141,255,0.35)',
      }
    }

    if (shiftCode === 'OFF') {
      return {
        background:
          'rgba(255,255,255,0.04)',
        color:
          'var(--muted)',
        border:
          '1px solid var(--line)',
      }
    }

    if (shiftCode === 'LEAVE') {
      return {
        background:
          'rgba(225,104,94,0.12)',
        color:
          'var(--danger)',
        border:
          '1px solid rgba(225,104,94,0.3)',
      }
    }

    if (shiftCode === 'ON CALL') {
      return {
        background:
          'rgba(139,124,246,0.14)',
        color:
          'var(--violet)',
        border:
          '1px solid rgba(139,124,246,0.3)',
      }
    }

    if (shiftCode === 'TRAINING') {
      return {
        background:
          'var(--teal-soft)',
        color:
          'var(--teal)',
        border:
          '1px solid var(--teal)',
      }
    }

    return {
      background:
        'transparent',
      color:
        'var(--muted)',
      border:
        '1px solid var(--line)',
    }
  }

  if (loading) {
    return (
      <div
        className="dash-panel"
        style={{
          textAlign: 'center',
          padding: 50,
        }}
      >
        Loading duty roster...
      </div>
    )
  }

  return (
    <div>

      <div
        className="dash-panel"
        style={{
          marginBottom: 16,
        }}
      >

        <div
          className="dash-panel-head"
          style={{
            alignItems: 'flex-start',
          }}
        >

          <div>
            <div
              className="dash-panel-title"
            >
              Duty Roster
            </div>

            <div
              className="dash-panel-sub"
            >
              {MONTHS[month] +
                ' ' +
                year +
                ' · ' +
                (hospital?.name ||
                  'Hospital')}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              justifyContent:
                'flex-end',
            }}
          >

            {isAdmin && (
              <>
                {status === 'draft' ? (
                  <button
                    className="btn btn-primary"
                    style={{
                      width: 'auto',
                    }}
                    onClick={
                      publishRoster
                    }
                    disabled={saving}
                  >
                    {saving
                      ? 'Saving...'
                      : 'Publish Roster'}
                  </button>
                ) : (
                  <button
                    className="btn btn-ghost"
                    style={{
                      width: 'auto',
                    }}
                    onClick={
                      returnToDraft
                    }
                    disabled={saving}
                  >
                    Return to Draft
                  </button>
                )}
              </>
            )}

          </div>

        </div>

        <div
          style={{
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            alignItems: 'center',
            marginTop: 14,
          }}
        >

          <select
            value={month}
            onChange={e =>
              setMonth(
                Number(
                  e.target.value
                )
              )
            }
            style={{
              minWidth: 140,
            }}
          >
            {MONTHS.map(
              (monthName, index) => (
                <option
                  key={monthName}
                  value={index}
                >
                  {monthName}
                </option>
              )
            )}
          </select>

          <select
            value={year}
            onChange={e =>
              setYear(
                Number(
                  e.target.value
                )
              )
            }
            style={{
              minWidth: 110,
            }}
          >
            {Array.from(
              {
                length: 5,
              },
              (_, index) =>
                currentDate.getFullYear() -
                1 +
                index
            ).map(yearOption => (
              <option
                key={yearOption}
                value={yearOption}
              >
                {yearOption}
              </option>
            ))}
          </select>

          <SearchInput
            value={searchTerm}
            onChange={
              setSearchTerm
            }
            placeholder="Search staff..."
            style={{
              minWidth: 230,
              maxWidth: 320,
            }}
          />

          <select
            value={roleFilter}
            onChange={e =>
              setRoleFilter(
                e.target.value
              )
            }
            style={{
              minWidth: 150,
            }}
          >
            <option value="all">
              All Roles
            </option>

            {Object.entries(
              ROLE_LABELS
            ).map(
              ([roleCode, label]) => (
                <option
                  key={roleCode}
                  value={roleCode}
                >
                  {label}
                </option>
              )
            )}
          </select>

        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 14,
            flexWrap: 'wrap',
          }}
        >

          <span
            style={{
              fontSize: 11,
              color:
                'var(--muted)',
            }}
          >
            Status:
          </span>

          <span
            style={{
              padding:
                '4px 9px',
              borderRadius: 20,
              fontSize: 10,
              fontWeight: 800,
              background:
                status === 'published'
                  ? 'var(--teal-soft)'
                  : 'rgba(201,169,97,0.14)',
              color:
                status === 'published'
                  ? 'var(--teal)'
                  : 'var(--gold)',
            }}
          >
            {status ===
            'published'
              ? 'PUBLISHED'
              : 'DRAFT'}
          </span>

          {!isAdmin && (
            <span
              style={{
                fontSize: 11,
                color:
                  'var(--muted)',
              }}
            >
              View only
            </span>
          )}

          {saving && (
            <span
              style={{
                fontSize: 11,
                color:
                  'var(--teal)',
              }}
            >
              Saving...
            </span>
          )}

        </div>

      </div>

      <div
        className="dash-panel"
        style={{
          padding: 0,
          overflow: 'hidden',
        }}
      >

        <div
          style={{
            overflowX: 'auto',
            width: '100%',
          }}
        >

          <table
            style={{
              borderCollapse:
                'collapse',
              width: 'max-content',
              minWidth: '100%',
              fontSize: 11,
            }}
          >

            <thead>

              <tr>

                <th
                  style={{
                    position:
                      'sticky',
                    left: 0,
                    zIndex: 4,
                    background:
                      'var(--bg-elevated)',
                    borderBottom:
                      '1px solid var(--line)',
                    borderRight:
                      '1px solid var(--line)',
                    padding:
                      '12px 14px',
                    minWidth: 190,
                    textAlign: 'left',
                  }}
                >
                  Staff
                </th>

                {days.map(day => (
                  <th
                    key={day}
                    style={{
                      borderBottom:
                        '1px solid var(--line)',
                      borderRight:
                        '1px solid var(--line)',
                      padding:
                        '8px 5px',
                      minWidth: 58,
                      textAlign:
                        'center',
                      background:
                        'var(--bg-elevated)',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: 11,
                      }}
                    >
                      {day}
                    </div>

                    <div
                      style={{
                        fontSize: 9,
                        color:
                          'var(--muted)',
                        marginTop: 2,
                      }}
                    >
                      {getDayName(
                        year,
                        month,
                        day
                      )}
                    </div>
                  </th>
                ))}

              </tr>

            </thead>

            <tbody>

              {visibleStaff.length === 0 ? (
                <tr>
                  <td
                    colSpan={
                      days.length + 1
                    }
                    style={{
                      textAlign:
                        'center',
                      padding: 40,
                      color:
                        'var(--muted)',
                    }}
                  >
                    No matching staff found.
                  </td>
                </tr>
              ) : (
                visibleStaff.map(
                  member => (
                    <tr
                      key={
                        member.id
                      }
                    >

                      <td
                        style={{
                          position:
                            'sticky',
                          left: 0,
                          zIndex: 2,
                          background:
                            'var(--bg-elevated)',
                          borderBottom:
                            '1px solid var(--line)',
                          borderRight:
                            '1px solid var(--line)',
                          padding:
                            '9px 12px',
                          minWidth: 190,
                        }}
                      >

                        <div
                          style={{
                            display:
                              'flex',
                            alignItems:
                              'center',
                            gap: 9,
                          }}
                        >

                          <div
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius:
                                '50%',
                              background:
                                'linear-gradient(150deg,var(--blue),#2a5cc9)',
                              display:
                                'flex',
                              alignItems:
                                'center',
                              justifyContent:
                                'center',
                              color:
                                '#fff',
                              fontWeight:
                                800,
                              fontSize: 11,
                              flexShrink: 0,
                            }}
                          >
                            {member.full_name
                              ?.charAt(
                                0
                              )
                              ?.toUpperCase() ||
                              '?'}
                          </div>

                          <div
                            style={{
                              minWidth: 0,
                            }}
                          >

                            <div
                              style={{
                                fontWeight:
                                  700,
                                fontSize:
                                  11.5,
                                whiteSpace:
                                  'nowrap',
                                overflow:
                                  'hidden',
                                textOverflow:
                                  'ellipsis',
                              }}
                            >
                              {member.full_name}

                              {member.id ===
                                profile?.id && (
                                <span
                                  style={{
                                    color:
                                      'var(--teal)',
                                    marginLeft:
                                      5,
                                    fontWeight:
                                      700,
                                  }}
                                >
                                  You
                                </span>
                              )}
                            </div>

                            <div
                              style={{
                                fontSize:
                                  9.5,
                                color:
                                  'var(--muted)',
                                marginTop:
                                  2,
                              }}
                            >
                              {ROLE_LABELS[
                                member.role
                              ] ||
                                member.role ||
                                'Staff'}
                            </div>

                          </div>

                        </div>

                      </td>

                      {days.map(
                        day => {
                          const currentShift =
                            getEntry(
                              member.id,
                              day
                            )

                          return (
                            <td
                              key={
                                member.id +
                                '-' +
                                day
                              }
                              style={{
                                borderBottom:
                                  '1px solid var(--line)',
                                borderRight:
                                  '1px solid var(--line)',
                                padding: 4,
                                textAlign:
                                  'center',
                                background:
                                  currentShift
                                    ? 'rgba(255,255,255,0.01)'
                                    : 'transparent',
                              }}
                            >

                              {isAdmin ? (
                                <select
                                  value={
                                    currentShift
                                  }
                                  onChange={e =>
                                    saveShift(
                                      member.id,
                                      day,
                                      e.target.value
                                    )
                                  }
                                  style={{
                                    width:
                                      '100%',
                                    minWidth:
                                      52,
                                    padding:
                                      '5px 3px',
                                    borderRadius:
                                      6,
                                    fontSize:
                                      9,
                                    fontWeight:
                                      800,
                                    cursor:
                                      'pointer',
                                    ...getShiftStyle(
                                      currentShift
                                    ),
                                  }}
                                >

                                  <option
                                    value=""
                                  >
                                    —
                                  </option>

                                  {SHIFT_TYPES.map(
                                    shift => (
                                      <option
                                        key={
                                          shift.code
                                        }
                                        value={
                                          shift.code
                                        }
                                      >
                                        {shift.short}
                                      </option>
                                    )
                                  )}

                                </select>
                              ) : (
                                <div
                                  style={{
                                    minWidth:
                                      52,
                                    minHeight:
                                      27,
                                    display:
                                      'flex',
                                    alignItems:
                                      'center',
                                    justifyContent:
                                      'center',
                                    borderRadius:
                                      6,
                                    fontSize:
                                      9,
                                    fontWeight:
                                      800,
                                    ...getShiftStyle(
                                      currentShift
                                    ),
                                  }}
                                >
                                  {currentShift ||
                                    '—'}
                                </div>
                              )}

                            </td>
                          )
                        }
                      )}

                    </tr>
                  )
                )
              )}

            </tbody>

          </table>

        </div>

      </div>

      <div
        className="dash-panel"
        style={{
          marginTop: 16,
        }}
      >

        <div
          className="dash-panel-title"
          style={{
            marginBottom: 12,
          }}
        >
          Shift Legend
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >

          {SHIFT_TYPES.map(
            shift => (
              <div
                key={
                  shift.code
                }
                style={{
                  display:
                    'flex',
                  alignItems:
                    'center',
                  gap: 6,
                  padding:
                    '6px 9px',
                  borderRadius:
                    7,
                  fontSize: 10,
                  fontWeight:
                    700,
                  ...getShiftStyle(
                    shift.code
                  ),
                }}
              >
                <span>
                  {shift.short}
                </span>

                <span
                  style={{
                    opacity:
                      0.75,
                    fontWeight:
                      500,
                  }}
                >
                  {shift.name}
                </span>
              </div>
            )
          )}

        </div>

      </div>

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
            zIndex: 100,
            maxWidth:
              '85vw',
            textAlign:
              'center',
          }}
        >
          {toast}
        </div>
      )}

    </div>
  )
}
