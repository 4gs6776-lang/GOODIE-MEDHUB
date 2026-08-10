# Search Update

This version adds a reusable search box to the main hospital-management modules.

## What changed
- Added `src/components/common/SearchInput.jsx` as the shared search box.
- Added search/filtering to Reception, Doctor Workbench, Nursing, IPD, Laboratory, Radiology, Pharmacy, Billing, Insurance/HMO, Appointments, Staff, Inventory and Notifications.
- The existing Dashboard patient search remains in place.
- Search is case-insensitive and includes a clear (×) button.
- Search works on the records already loaded by the app, so it also works with the project's offline data approach.

## For the project owner
Do not delete the existing Supabase configuration. If you are using GitHub/Vercel, keep the existing environment variables configured in Vercel.

The search changes do not require a new database table.
