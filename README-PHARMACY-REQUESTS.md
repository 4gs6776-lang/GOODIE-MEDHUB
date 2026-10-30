# Pharmacy Requests + Blinking Lights (Admissions green + Reminders red)

## What this patch does

5 features in one delivery:

1. **Send to Pharmacy modal** — staff click "Send to Pharmacy" in the patient tab → modal opens where they type a free-text request (e.g. "I need 1 tab metronidazole 200mg for Amari"). Patient is auto-attached. Priority selector: Routine / Urgent / STAT.

2. **Pharmacy Requests tab** — new tab in the Pharmacy module showing all requests as plain text with patient name, requesting staff name, time, date, and priority badge. Pharmacist can Dispense, Clear, or Cancel each request.

3. **Pharmacist dispense documentation** — when the pharmacist clicks "Dispense", a modal opens showing the original request. Pharmacist enters what they dispensed (free-text) + optional charge amount (creates a billable charge for the patient). On submit, the request is marked as dispensed with full documentation.

4. **Green blinking light on Admissions** — the Admissions nav item in the sidebar blinks green whenever there are pending admission requests (status='pending'). The blinking stops only when the patient is actually admitted (status='converted').

5. **Role-based red blinking light on Reminders** — the Reminders nav item blinks red based on the user's role:
   - **Pharmacist**: pending pharmacy requests
   - **Billing**: overdue invoices (>7 days), pending insurance claims
   - **Lab**: pending lab orders (>2 hours)
   - **Staff/Nurse/Reception**: patients in queue
   - **Admin/Owner**: all of the above
   
   The blinking stops when ALL items are resolved (requests dispensed, invoices paid, lab orders completed, patients discharged).

## Files in this patch (4)

| File | Status | What changed |
|------|--------|--------------|
| `supabase/migrations/061_pharmacy_requests.sql` | NEW | `pharmacy_requests` table: id, hospital_id, patient_id, patient_name, request_text, priority, status, requested_by, requested_by_name, created_at, dispensed_at/by/name, dispensed_items (jsonb), dispensed_notes. RLS policies + realtime publication. |
| `src/components/PatientProfile.jsx` | Modified | Replaced old drug-name+quantity modal with new free-text + priority modal. Added `pharmacy_requests` hook. Writes to `pharmacy_requests` table (was writing to `prescriptions` table before). |
| `src/pages/dashboard/Pharmacy.jsx` | Modified | Added "Requests" tab (first tab, with red badge count). Added `PharmacyRequestsTab` component showing requests as plain text cards. Added `PharmacyRequestDispenseModal` for documenting what was dispensed + optional charge. Added dispense state. |
| `src/pages/dashboard/Dashboard.jsx` | Modified | Added `admission_requests` hook + `pendingAdmissions` memo. Added `invoices`, `lab_orders`, `pharmacy_requests`, `insurance_claims` hooks + `roleBasedReminders` memo. Added green blinking light on Admissions nav. Updated red blinking light on Reminders nav to include role-based reminders. |

## How it works

### Send to Pharmacy flow
1. Staff opens a patient profile → clicks "Send to Pharmacy" (purple button)
2. Modal opens: patient name auto-attached, staff types free-text request, picks priority
3. On submit → inserts into `pharmacy_requests` table + audit event `pharmacy_request.sent`
4. Pharmacy module shows a red badge on the "Requests" tab

### Pharmacy dispense flow
1. Pharmacist opens Pharmacy → "Requests" tab
2. Sees the request as plain text: `"I need 1 tab metronidazole 200mg for Amari"` with patient name, staff name, time, priority badge
3. Clicks "Dispense" → modal opens showing the original request
4. Pharmacist types what they dispensed (free-text) + optional charge amount
5. Clicks "Mark as Dispensed" → request status becomes `dispensed`, dispensed_at/by/name/notes saved, optional billable_charge created
6. Or clicks "Clear" to mark as dispensed without documentation (quick clear)

### Green light on Admissions
- Blinks green when `admission_requests` has rows with `status='pending'`
- Stops blinking when ALL pending requests become `status='converted'` (patient admitted) or `status='cancelled'`
- Per user's explicit answer: "Stops only when the patient is actually admitted"

### Red light on Reminders
- Blinks red when ANY of these are true (based on user's role):
  - Pharmacist: pending pharmacy requests exist
  - Billing: overdue invoices (>7 days) or pending insurance claims exist
  - Lab: pending lab orders (>2 hours) exist
  - Staff/Nurse: patients in queue exist
  - Admin: any of the above
  - Also blinks for existing medication reminders (due in 2 min / due now)
- Stops blinking when ALL items are resolved/cleared
- Per user's explicit answer: "Blinks until ALL items are resolved/cleared"

## Build verification
- ✅ `npx vite build` succeeds — 2814 modules, 7.51s, zero warnings

## Apply steps

1. **Run migration 061** in Supabase SQL Editor:
   ```sql
   \i supabase/migrations/061_pharmacy_requests.sql
   ```
   Or paste the file contents and click Run.

2. **Copy the 3 source files** over your existing ones:
   ```bash
   cp src/components/PatientProfile.jsx     <project>/src/components/
   cp src/pages/dashboard/Pharmacy.jsx     <project>/src/pages/dashboard/
   cp src/pages/dashboard/Dashboard.jsx    <project>/src/pages/dashboard/
   cp supabase/migrations/061_*.sql        <project>/supabase/migrations/
   ```

3. Commit + push to GitHub → Vercel auto-deploys

4. **Verify:**
   - Open a patient profile → click "Send to Pharmacy" → type a request → submit
   - Open Pharmacy module → "Requests" tab → see the request with your name, patient, time, priority
   - Click "Dispense" → type what you dispensed → submit → request marked as dispensed
   - In Doctor Workbench → "Recommend Admission" → Admissions nav in sidebar blinks green
   - Different role logins see different red light behavior on Reminders nav
