# NEXUS Audit Logs Responsive Layout Fix

**Date:** 2026-11-22  
**Scope:** Admin audit-log filters and event records

## Issue

At narrower workspace widths, the audit filter controls extended beyond the page content and the event table columns were clipped. The shared workspace stylesheet also hid horizontal overflow for table wrappers on wider layouts, preventing users from reaching all columns.

## Changes

- Changed the audit filter form to an auto-fitting grid with a 13rem preferred minimum per field. Inputs now shrink to the available column width instead of forcing page overflow.
- Made the audit table wrapper horizontally scrollable at desktop widths so every column remains reachable.
- Added responsive labels to each audit data cell. The shared narrow-screen table treatment can now render each event as a labeled card.
- Kept the existing audit data and API behavior unchanged.

## Verification

- Inspected the component and shared responsive CSS rules.
- `git diff --check` completed without whitespace errors.
- Tests, lint, typecheck, and build were not run, per the standing instruction not to run them unless requested.

