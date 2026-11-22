-- Allow borrowers to keep multiple applications active at the same time.
-- Each application still follows its own status and review lifecycle.
DROP INDEX IF EXISTS "loan_applications_one_active_per_borrower_key";
