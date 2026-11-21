# WP9.4.3 — Application Details, Editing and Submission

Date: 2026-11-21

## Scope completed

Implemented the borrower application detail route, backend-owned edit permission, draft version editing, and explicit application submission confirmation. The page reads only persisted API data and reflects the backend response after mutations.

## Backend and API

- Extended `GET /api/borrower/applications/{applicationId}` with creation/update/closed dates, current version data, status, decision reasons, information requests, and backend-owned `permissions.canEdit` / `permissions.canSubmit` flags.
- Kept ownership scoping in the database query. Another borrower's application continues to return a non-disclosing 404.
- Backend permissions are currently `canEdit: status === DRAFT` and `canSubmit: status === DRAFT && currentVersion exists`, matching the service's update and submit rules. Submission and editing still recheck the current state inside the transactional service, so stale UI permission cannot bypass backend rules.
- Included only review decision and reason in the borrower response. Internal review notes are not exposed.
- Updated application service mutation results to carry the same persisted details and permission shape.

## Frontend

- Added `/borrower/applications/[applicationId]` and a responsive Tailwind/shadcn-compatible detail page.
- Displays reference, requested amount and term, purpose, applicant/employment details, dates, status, version, and API-provided decision/information-request records.
- Shows edit and submit controls only when the backend returns `permissions.canEdit`.
- Editing sends the actual `application_snapshot.v1` contract through PATCH; the server creates a new version. The UI reloads saved data after success and uses the shared application validation logic.
- Submission requires a confirmation dialog. The UI does not optimistically set `SUBMITTED`; it posts, reloads the application, and displays the returned status. On errors it reloads server state and then displays the error, preserving the existing status.
- Successful edit/submission notifies the borrower dashboard refresh mechanism.
- Added a shared JSON PATCH method to the browser API client.

## Tests authored

- Extended `tests/lib/client/borrower-applications.test.ts` for owned detail fetch, edit request, and submission request paths.
- Extended `tests/api/borrower-api.integration.test.ts` to assert persisted detail fields and backend edit permissions; existing ownership, draft edit, and submit lifecycle tests remain relevant. The submit test now verifies permission becomes false and duplicate submission is rejected with current state preserved.
- Tests were not run, per instruction.

## Decisions and boundaries

- No new application states or frontend-only transitions were introduced. The page renders status labels from the existing status vocabulary.
- Review notes are omitted from borrower-facing data because the schema does not indicate they are public; the API exposes the decision reason instead.
- The submission action is available only while `canEdit` is true, consistent with the current API's combined draft-editable/submittable state.
- Invalid, expired, missing, or inaccessible records display API errors and can be refreshed without fabricating status.

## Validation status

Static source review only. No tests, typecheck, lint, build, or application code was executed in this stage. The correlated tests are ready for an explicitly requested run.
