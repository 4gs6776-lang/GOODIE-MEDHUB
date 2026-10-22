# GOODIE-MEDHUB — HMO & ANC Patient Modules

Adds an **HMO Folder** category during patient registration, a searchable HMO provider dropdown with ~30 Nigerian HMOs, an HMO ID Code field, and two new dedicated modules in the sidebar:
- **HMO Patients** — filtered patient list (category = `hmo`)
- **ANC Patients** — filtered patient list (category = `anc`)

HMO and ANC patients still also appear in the regular **Patients** module — these new modules are focused views for the billing / midwifery teams.

---

## What was added (5 things)

### 1. New "HMO Folder" category in patient registration
In **Reception → Register Patient**, the Folder dropdown now has 5 options:
- Personal Folder
- Family Folder
- Emergency Folder
- ANC Folder
- **HMO Folder** ← new

When "HMO Folder" is selected, the HMO fields section appears (same way ANC fields appear when "ANC Folder" is selected).

### 2. Searchable HMO provider dropdown (~30 Nigerian HMOs)
The old plain `<select>` with 7 options is replaced with a **search-enabled dropdown** (`<HmoProviderSelect>`). Click it, type "AXA" or "Hygeia" or "NHIS" — the list filters as you type. No more scrolling through a long dropdown.

The expanded HMO list includes:
- Public: NHIS, NHIS ECD, NHIS TISHIP, Anambra ASHIA, Bauchi SHCS, Enugu ENSHIC
- Private (major): Hygeia, AXA Mansard, Reliance, AIICO Multishield, Avon, Greenbay, Clearline, U-WRAP, Hallmark, Mediplan, Zircon, Redcare, Lifenest, RoHealth
- Private (regional): Oceanic, Prime Metropolis, Premium Shield, Total Health Trust, Defence HMO, Novo Health Africa, Alliance, Acto Healthcare International
- Plus "Self-Pay (No HMO)" at the top and "Other" at the bottom

The same component is used in the **Insurance → + New Claim** form (without "Self-Pay" — claims are always against an actual HMO).

### 3. New "HMO ID Code" field
When a patient is registered with category = `hmo` (and an actual HMO is selected, not Self-Pay), a new **HMO ID Code** field appears. This is the patient's membership ID — the code printed on their HMO card. Stored in a new `hmo_id_code` column on the `patients` table.

(Distinct from `hmo_number` — the enrollee / policy number assigned by the HMO to the patient's account. The ID code is what's on the card; the policy number is what the HMO uses internally.)

### 4. HMO Patients module (new sidebar item)
Under **Main** section: "HMO Patients" (insurance icon).

Shows:
- Summary cards: total count, active providers count, pending claims total ₦, average coverage %
- Search by name, ID code, policy no., plan, or phone
- Paginated table: Name | HMO Provider | ID Code | Plan | Coverage % | Queue status
- Click a row → opens the existing PatientProfile overlay (same one used everywhere else)

### 5. ANC Patients module (new sidebar item)
Under **Main** section: "ANC Patients" (nurse icon).

Shows:
- Summary cards: total count, trimester breakdown (1st · 2nd · 3rd), EDD in next 30 days, overdue EDDs, in-queue count
- Search by name, husband/partner name, indication, or phone
- Paginated table: Name | EDD (with countdown) | Gest. Age (computed from LMP) | Trimester | Husband/Partner | Queue status
- Click a row → opens the existing PatientProfile overlay

---

## Files in this patch (9 files + this README)

### New files (4)
```
src/lib/hmoProviders.js                       ← shared list of ~30 Nigerian HMOs
src/components/common/HmoProviderSelect.jsx    ← searchable dropdown component
src/pages/dashboard/HmoPatients.jsx            ← HMO Patients module page
src/pages/dashboard/AncPatients.jsx            ← ANC Patients module page
```

### New migration (1)
```
supabase/migrations/
└── 021_patients_hmo_id_code.sql              ← adds hmo_id_code text column to patients
```

### Modified existing files (4)
```
src/pages/dashboard/Reception.jsx             ← adds 'hmo' category, swaps to HmoProviderSelect, adds HMO ID Code field, conditionally shows HMO section
src/pages/dashboard/Insurance.jsx             ← swaps the plain <select> to HmoProviderSelect
src/pages/dashboard/Dashboard.jsx            ← adds 2 imports + 2 nav items + 2 render switches
src/lib/permissions.js                        ← adds 'hmo_patients' and 'anc_patients' to MODULES + grants to all roles that see 'patients'
```

---

## How to deploy (3 steps, ~5 minutes)

### Step 1 — Apply the migration

Open **Supabase Dashboard → SQL Editor** and run:
```
supabase/migrations/021_patients_hmo_id_code.sql
```

Safe to run more than once. Just adds one nullable column to `patients`.

### Step 2 — Copy the 8 frontend files over the existing ones

```
src/lib/hmoProviders.js                              ← new
src/lib/permissions.js                               ← modified
src/components/common/HmoProviderSelect.jsx           ← new
src/pages/dashboard/HmoPatients.jsx                   ← new
src/pages/dashboard/AncPatients.jsx                    ← new
src/pages/dashboard/Reception.jsx                     ← modified
src/pages/dashboard/Insurance.jsx                     ← modified
src/pages/dashboard/Dashboard.jsx                     ← modified
```

### Step 3 — Hard-refresh the PWA

`Ctrl+Shift+R` (or `⌘+Shift+R` on macOS)

---

## How to test it

1. Log in as admin (or any role that can see the Patients module)
2. Open the sidebar — you should see "HMO Patients" and "ANC Patients" under the Main section, just below "Inventory"
3. Open **Reception → Register Patient**
4. In the Folder dropdown, pick **HMO Folder**
5. The HMO fields section appears:
   - HMO Provider (searchable dropdown — click and type "AXA")
   - HMO ID Code (the patient's membership ID on their card)
   - Plan / Tier
   - Enrollee / Policy No.
   - HMO Covers (%)
6. Fill in the rest of the form, save the patient
7. Open **HMO Patients** module — your new patient appears in the list
8. Open **ANC Patients** module — empty unless you have ANC patients (register one with the ANC Folder category to see them here)
9. The regular **Patients** module still shows everyone (HMO, ANC, personal, family, emergency — all together)

---

## Build verification

The patched project was test-built with `npm run build` and completed cleanly:
- **0 errors**
- Bundle size: 1424.49 KB (up from 1409 KB baseline — +15 KB total for the 4 new files + 4 modified files)
- No new browser dependencies

---

## What was NOT changed

- ❌ No existing tables, columns, or RLS policies modified (other than the additive `hmo_id_code` column)
- ❌ No changes to existing workflows — the regular Patients module still shows everyone
- ❌ No changes to existing patients (their data is intact; existing HMO patients — those with `hmo_provider` set but `category != 'hmo'` — keep working as before)
- ❌ No changes to other modules (Pharmacy, Inventory, IPD, Doctor Workbench, etc.)
- ❌ No new edge functions, no new packages

---

## Honest notes

### Existing HMO patients
If you already have patients in the database with `hmo_provider` set (registered before this change), their `category` is probably `'personal'` or `'family'` — they won't appear in the new HMO Patients module by default. To migrate them:

```sql
update public.patients
   set category = 'hmo'
 where hmo_provider is not null
   and hmo_provider != 'Self-Pay (No HMO)'
   and category is null or category not in ('anc', 'hmo');
```

(Only run this if you want your existing HMO patients to appear in the new HMO Patients module. Otherwise they stay where they are.)

### Permissions
Per your Q5(a) decision, the HMO Patients and ANC Patients modules follow the existing `patients` permission — anyone who can see the Patients module can also see these. Admin/owner see them via `FULL_ACCESS_ROLES`. CMD (read-only role) sees them too but cannot write. No separate permission grants were added.

### Trimester computation
For ANC patients, gestational age is computed from `anc_lmp` (Last Menstrual Period) at view time — not stored. If `anc_lmp` is missing or invalid, the gestational age and trimester columns show "—". Patients with an EDD that's already passed are flagged as "X days overdue" in red.
