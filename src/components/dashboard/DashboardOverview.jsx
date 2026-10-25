import { useState } from 'react'
import { useHospitalDashboard, weekOverWeek } from './hospital/useHospitalDashboard'
import {
  KpiCard, GlowBars, Ring, Sparkline, Skeleton, EmptyNote, ActivityChart, GrowthChart,
  useThemeMode, PALETTE, money, nf, AnimatedNumber,
} from './hospital/widgets'
import { formatWeekdayDate, formatTime, relativeShort, relativeTime } from '../../lib/datetime'

// =====================================================================
// GOODIE-MEDHUB — Hospital overview (redesign)
//
// Layout: pulse panel + queue cards → patient flow → activity chart and
// appointments → laboratory / pharmacy / finance / recent activity.
// Every section is shown only if the signed-in role may see it, and
// every figure comes from useHospitalDashboard (real records only).
// The previous version is kept beside this file as
// DashboardOverview.legacy.jsx in case you want to roll back.
// =====================================================================

const RANGES = [
  { days: 7, label: '7D' },
  { days: 30, label: '30D' },
  { days: 90, label: '90D' },
]

const last = (series, n) => (series || []).slice(-n)

function Atmosphere() {
  // Decorative only: very faint orbital linework behind the content.
  return (
    <div className="hd-atmo" aria-hidden="true">
      <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
        <g fill="none" stroke="currentColor" strokeWidth="1">
          <ellipse cx="980" cy="120" rx="360" ry="150" transform="rotate(-18 980 120)" />
          <ellipse cx="980" cy="120" rx="250" ry="95" transform="rotate(-18 980 120)" />
          <path d="M-40 640 C 220 520, 420 760, 700 640 S 1100 560, 1260 650" />
          <path d="M-40 690 C 240 580, 440 800, 720 690 S 1100 610, 1260 700" />
        </g>
        <g fill="currentColor">
          <circle cx="980" cy="120" r="3" /><circle cx="760" cy="196" r="2.5" /><circle cx="1180" cy="60" r="2.5" />
        </g>
      </svg>
    </div>
  )
}

function Panel({ title, sub, right, children, className = '', index = 0 }) {
  return (
    <section className={`hd-card hd-panel hd-in ${className}`} style={{ '--i': index }}>
      <header className="hd-panel-head">
        <div><h3>{title}</h3>{sub ? <p>{sub}</p> : null}</div>
        {right}
      </header>
      {children}
    </section>
  )
}

export default function DashboardOverview({ hospital, profile }) {
  const theme = useThemeMode()
  const c = PALETTE[theme]
  const [range, setRange] = useState(30)
  const [stage, setStage] = useState(null)
  const { access, data: d, loading, isOnline, pendingSync, tz } = useHospitalDashboard(hospital, profile)
  const ready = !loading
  const firstName = (profile?.full_name || '').split(' ')[0]

  // ---- chart series (only the areas this role may see) ----
  const chartSeries = [
    access.patients && { key: 'registrations', label: 'Registrations', color: 'cyan', points: last(d.registrationSeries, range) },
    access.appointments && { key: 'appointments', label: 'Appointments', color: 'blue', points: last(d.apptSeries, range) },
    access.triage && { key: 'triage', label: 'Triage records', color: 'purple', points: last(d.triageSeries, range) },
    access.lab && { key: 'lab', label: 'Lab requests', color: 'pink', points: last(d.labSeries, range) },
    access.beds && { key: 'admissions', label: 'Admissions', color: 'amber', points: last(d.admissionSeries, range) },
  ].filter(Boolean)

  // ---- patient flow stages (counts of what the app actually records) ----
  const flow = [
    access.patients && { key: 'registered', label: 'Registered today', n: d.registeredToday, tone: 'blue' },
    access.patients && { key: 'waiting', label: 'Waiting', n: d.waitingList.length, tone: 'amber', list: d.waitingList.map((p) => ({ id: p.id, name: p.full_name, meta: p.hospital_number, at: p.queue_updated_at })) },
    access.patients && { key: 'consult', label: 'In consultation', n: d.consultList.length, tone: 'cyan', list: d.consultList.map((p) => ({ id: p.id, name: p.full_name, meta: p.hospital_number, at: p.queue_updated_at })) },
    access.lab && { key: 'lab', label: 'Lab tests pending', n: d.labPending, tone: 'pink' },
    access.beds && access.patients && { key: 'admitted', label: 'Admitted now', n: d.admittedCount, tone: 'purple', list: d.admittedList.map((a) => ({ id: a.id, name: a.name, meta: a.ward, at: a.at })) },
    access.patients && { key: 'closed', label: 'Visit closed today', n: d.queueDischargedToday.length, tone: 'green', list: d.queueDischargedToday.map((p) => ({ id: p.id, name: p.full_name, meta: p.hospital_number, at: p.queue_updated_at })) },
  ].filter(Boolean)
  const openStage = flow.find((s) => s.key === stage)
  const newInRange = last(d.registrationSeries, range).reduce((sum, pt) => sum + pt.value, 0)

  const showPulse = access.patients || access.triage || access.appointments || access.beds
  const hasAnything = showPulse || access.lab || access.pharmacy || access.finance

  return (
    <div className="hd-root">
      <Atmosphere />

      {/* ---------- header ---------- */}
      <header className="hd-head hd-in" style={{ '--i': 0 }}>
        <div>
          <h1>Hospital overview</h1>
          <p>{formatWeekdayDate(new Date().toISOString(), tz)}{firstName ? ` · Welcome back, ${firstName}` : ''}</p>
        </div>
        <div className={`hd-status ${isOnline ? 'on' : 'off'}`} role="status">
          <i />{isOnline ? 'Live' : 'Offline · showing saved data'}
          {pendingSync > 0 ? <span> · {pendingSync} change{pendingSync === 1 ? '' : 's'} waiting to sync</span> : null}
        </div>
      </header>

      {!hasAnything && (
        <EmptyNote>Your role does not include any overview widgets. Use the menu to open the modules you work in.</EmptyNote>
      )}

      {/* ---------- pulse panel + queue cards ---------- */}
      {(showPulse || access.lab || access.pharmacy) && (
        <div className="hd-top">
          {showPulse && (
            <Panel title="Hospital pulse" sub="Last 14 days" className="hd-pulse" index={1}>
              <div className="hd-pulse-grid">
                {access.patients && (
                  <div className="hd-sub-card">
                    <GlowBars data={last(d.registrationSeries, 14)} color={c.amber} label="New patient registrations, last 14 days" />
                    <span className="hd-label">New registrations</span>
                    <strong>{ready ? <AnimatedNumber value={d.registeredToday} ready={ready} /> : <Skeleton w={40} h={20} />}<small> today</small></strong>
                  </div>
                )}
                {access.triage ? (
                  <div className="hd-sub-card">
                    <GlowBars data={last(d.triageSeries, 14)} color={c.green} label="Triage records, last 14 days" />
                    <span className="hd-label">Triage records</span>
                    <strong>{ready ? <AnimatedNumber value={d.triageToday} ready={ready} /> : <Skeleton w={40} h={20} />}<small> today</small></strong>
                  </div>
                ) : access.appointments ? (
                  <div className="hd-sub-card">
                    <GlowBars data={last(d.apptSeries, 14)} color={c.cyan} label="Appointments, last 14 days" />
                    <span className="hd-label">Appointments</span>
                    <strong>{ready ? <AnimatedNumber value={d.apptToday} ready={ready} /> : <Skeleton w={40} h={20} />}<small> today</small></strong>
                  </div>
                ) : null}
                {access.beds && (
                  <div className="hd-sub-card hd-bed">
                    <Ring pct={ready ? d.occupancyPct : null} colorA={c.cyan} colorB={c.purple}>
                      {ready && d.occupancyPct !== null ? <b>{d.occupancyPct}%</b> : <b>—</b>}
                      <span>occupied</span>
                    </Ring>
                    <span className="hd-label">Bed occupancy</span>
                    {ready ? (
                      d.bedsTotal > 0
                        ? <small className="hd-bed-line">{d.bedsOccupied} of {d.bedsTotal} beds · {d.bedsAvailable} free{d.bedsCleaning ? ` · ${d.bedsCleaning} cleaning` : ''}</small>
                        : <small className="hd-bed-line">No beds set up yet</small>
                    ) : <Skeleton w="70%" h={10} />}
                  </div>
                )}
              </div>
            </Panel>
          )}

          <div className="hd-kpis">
            {access.patients && <KpiCard index={2} label="Waiting" ready={ready} value={d.waitingList.length} tone="amber" sub="in the queue" onClick={() => setStage('waiting')} />}
            {access.patients && <KpiCard index={3} label="In consultation" ready={ready} value={d.consultList.length} tone="cyan" sub="with a clinician" onClick={() => setStage('consult')} />}
            {access.appointments && <KpiCard index={4} label="Appointments today" ready={ready} value={d.apptToday} tone="blue" sub={`${d.apptScheduledToday} scheduled · ${d.apptCompletedToday} done`} spark={last(d.apptSeries, 14)} sparkColor={c.cyan} delta={weekOverWeek(d.apptSeries)} />}
            {access.lab && <KpiCard index={5} label="Lab tests pending" ready={ready} value={d.labPending} tone="pink" sub={`${d.lab.processing} processing`} spark={last(d.labSeries, 14)} sparkColor={c.pink} />}
            {access.pharmacy && <KpiCard index={6} label="Stock alerts" ready={ready} value={d.stockAlerts} tone="amber" sub={`${d.stockOut} out · ${d.stockLow} low`} />}
            {access.patients && <KpiCard index={7} wide label="Registered patients" ready={ready} value={d.totalPatients} tone="blue" sub={`${d.registeredToday} today${d.ancCount ? ` · ${d.ancCount} ANC` : ''}`} spark={last(d.registrationSeries, 14)} sparkColor={c.blue} delta={weekOverWeek(d.registrationSeries)} />}
          </div>
        </div>
      )}

      {/* ---------- patient flow ---------- */}
      {flow.length > 0 && (
        <Panel title="Patient flow" sub="Counts from the queue, laboratory and admissions. Patients do not all follow the same path." className="hd-flowwrap" index={8}>
          <ol className="hd-flow">
            {flow.map((s, i) => {
              const clickable = !!s.list
              return (
                <li key={s.key} className={`hd-stage ${stage === s.key ? 'sel' : ''}`} data-tone={s.tone}>
                  <button type="button" disabled={!clickable} aria-pressed={stage === s.key} onClick={() => setStage(stage === s.key ? null : s.key)}>
                    <span className="hd-stage-n">{ready ? <AnimatedNumber value={s.n} ready={ready} /> : <Skeleton w={28} h={22} />}</span>
                    <span className="hd-stage-l">{s.label}</span>
                  </button>
                  {i < flow.length - 1 && <span className="hd-stage-link" aria-hidden="true" />}
                </li>
              )
            })}
          </ol>
          {openStage && (
            <div className="hd-stagelist" role="region" aria-label={`${openStage.label} patients`}>
              {openStage.list.length === 0 ? <EmptyNote>No patients in this stage right now.</EmptyNote> : openStage.list.slice(0, 8).map((p) => (
                <div key={p.id} className="hd-row"><span className="hd-row-main">{p.name || 'Unnamed patient'}</span><span className="hd-row-meta">{p.meta || ''}</span><span className="hd-row-time">{p.at ? relativeShort(p.at) : ''}</span></div>
              ))}
              {openStage.list.length > 8 && <div className="hd-more">+ {openStage.list.length - 8} more — open Reception for the full queue</div>}
            </div>
          )}
        </Panel>
      )}

      {/* ---------- chart + appointments ---------- */}
      {(chartSeries.length > 0 || access.appointments) && (
        <div className="hd-mid">
          {chartSeries.length > 0 && (
            <Panel title="Hospital activity" sub="Daily counts · tap a chip to show or hide a line" index={9}
              right={
                <div className="hd-seg" role="group" aria-label="Date range">
                  {RANGES.map((r) => (
                    <button key={r.days} type="button" aria-pressed={range === r.days} className={range === r.days ? 'on' : ''} onClick={() => setRange(r.days)}>{r.label}</button>
                  ))}
                </div>
              }>
              <ActivityChart series={chartSeries} loading={!ready} theme={theme} />
            </Panel>
          )}

          {access.appointments && (
            <Panel title="Appointments" sub="Next scheduled visits" index={10}>
              <div className="hd-apt-sum">
                <span><b>{ready ? d.apptScheduledToday : '–'}</b> scheduled</span>
                <span><b>{ready ? d.apptCompletedToday : '–'}</b> completed</span>
                <span><b>{ready ? d.apptCancelledToday : '–'}</b> cancelled</span>
              </div>
              {!ready ? <Skeleton h={120} /> : d.apptUpcoming.length === 0 ? (
                <EmptyNote>No upcoming scheduled appointments.</EmptyNote>
              ) : (
                <ul className="hd-timeline">
                  {d.apptUpcoming.map((a) => (
                    <li key={a.id}>
                      <time>{formatTime(a.appointment_time, tz)}</time>
                      <div><strong>{a.patient_name}</strong><small>{a.doctor_name || 'No doctor assigned'}</small></div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
        </div>
      )}

      {/* ---------- patient growth ---------- */}
      {access.patients && (
        <div className="hd-mid">
          <Panel title="Patient growth" index={11}
            sub={ready ? `${nf.format(d.totalPatients)} registered in total · ${newInRange > 0 ? `+${nf.format(newInRange)}` : 'no new patients'} in the last ${range} days` : 'Total registered patients over time'}>
            <GrowthChart points={last(d.growthSeries, range)} loading={!ready} theme={theme} />
          </Panel>
        </div>
      )}

      {/* ---------- operational panels ---------- */}
      {(access.lab || access.pharmacy || access.finance || access.activity) && (
        <div className="hd-bottom">
          {access.lab && (
            <Panel title="Laboratory" sub="Investigation pipeline" index={11}>
              {!ready ? <Skeleton h={110} /> : (
                <ul className="hd-meter">
                  {[['Ordered', d.lab.ordered, 'amber'], ['Sample collected', d.lab.sample_collected, 'cyan'], ['Processing', d.lab.processing, 'purple'], ['Completed', d.lab.completed, 'green']].map(([l, n, t]) => {
                    const max = Math.max(1, d.lab.ordered + d.lab.sample_collected + d.lab.processing + d.lab.completed)
                    return <li key={l} data-tone={t}><span>{l}</span><i><u style={{ width: `${(n / max) * 100}%` }} /></i><b>{nf.format(n)}</b></li>
                  })}
                </ul>
              )}
              {ready && <p className="hd-foot">{d.labCompletedToday} result{d.labCompletedToday === 1 ? '' : 's'} completed today</p>}
            </Panel>
          )}

          {access.pharmacy && (
            <Panel title="Pharmacy stock" sub="From the inventory register" index={12}>
              {!ready ? <Skeleton h={110} /> : d.stockTotal === 0 ? <EmptyNote>No stock items recorded yet.</EmptyNote> : (
                <>
                  <div className="hd-chipline">
                    <span data-tone="red"><b>{d.stockOut}</b> out of stock</span>
                    <span data-tone="amber"><b>{d.stockLow}</b> low</span>
                    <span data-tone="amber"><b>{d.stockExpiring}</b> expiring ≤30d</span>
                    <span data-tone="red"><b>{d.stockExpired}</b> expired</span>
                  </div>
                  {d.stockWatch.length === 0 ? <EmptyNote>Nothing is below its reorder level.</EmptyNote> : (
                    <ul className="hd-list">
                      {d.stockWatch.map((i) => <li key={i.id}><span>{i.name}</span><b className={i.qty <= 0 ? 'bad' : ''}>{i.qty} / {i.reorder}</b></li>)}
                    </ul>
                  )}
                </>
              )}
            </Panel>
          )}

          {access.finance && (
            <Panel title="Finance" sub="Billing and collections" index={13}>
              {!ready ? <Skeleton h={110} /> : (
                <>
                  <div className="hd-fin">
                    <div><span className="hd-label">Collected today</span><strong><AnimatedNumber value={d.revenueToday} ready={ready} format={money} /></strong></div>
                    <Sparkline data={last(d.revenueSeries, 14)} color={c.green} width={110} height={34} />
                  </div>
                  <ul className="hd-list">
                    <li><span>Outstanding balance</span><b>{money(d.outstanding)}</b></li>
                    <li><span>Invoices with a balance</span><b>{nf.format(d.outstandingCount)}</b></li>
                    <li><span>Invoices raised today</span><b>{nf.format(d.invoicesToday)}</b></li>
                  </ul>
                </>
              )}
            </Panel>
          )}

          {access.activity && (
            <Panel title="Recent activity" sub="From the audit trail" index={14} className="hd-wideact">
              {!ready ? <Skeleton h={110} /> : d.activity.length === 0 ? <EmptyNote>No audited activity yet.</EmptyNote> : (
                <ul className="hd-feed">
                  {d.activity.map((e) => (
                    <li key={e.id}>
                      <i />
                      <div><span>{e.summary || e.action}</span><small>{e.actor_name || 'System'}{e.actor_role ? ` · ${e.actor_role}` : ''}</small></div>
                      <time>{relativeTime(e.created_at)}</time>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
        </div>
      )}
    </div>
  )
}
