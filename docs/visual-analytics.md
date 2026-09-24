# Visual Analytics & Improvement

Open **Overall Report**, select **Class-wise Report**, one school, and a class/section. The dashboard and PDF/Word exports include the 15 requested sections. Student search only filters the existing marksheet chooser; it never truncates class analytics or exports. Choose a student in the analytics panel to inspect assessment progress and question detail. Class export continues to include every class member. School-wise and Individual Student reports use the same engine when one school is selected.

## Data and calculation rules

- Source: Assessment Master, Question Master, and Clicker Data through their existing permission-checked server functions. No database migration or access-rule changes are required. Session Status access is separately checked; denied/failed session data is labeled unavailable.
- A valid student ID is required, or a unique school/class/section/roll match. Cross-school and ambiguous records are excluded and counted. Latest updated record wins for duplicate student/assessment results.
- Stored Clicker scores represent correct-answer counts under the existing scoring logic. Score percentage divides by Assessment Master `total_questions`, falling back to the available key count only if that total is absent. Out-of-range values or missing denominators are unavailable, not zero. Imported weighted-mark or percentage scores must be converted to this convention first.
- Overall averages are arithmetic means of available result percentages, not averages of averages. Assessed students and assessments are distinct counts. Student distributions use each student's average and disclose unassessed counts.
- Correct-rate summaries use the stored Clicker percentage. Subject/parameter/topic/chapter rates are independently calculated as correct responses / question opportunities from the matching answer key. They may differ from imported summary values. Question subject falls back to assessment subject. Unspecified metadata is labeled, never inferred.
- When an answer sheet contains recognized question columns, missing or blank answers are incorrect. Summary-only imports do not contribute question breakdowns. Coverage is displayed. "Questions" counts unique assessment/question pairs; "Responses" counts opportunities across students.
- Rankings are recomputed with competition ties (1, 2, 2, 4), separately for each school/class/section/assessment. Undated assessments are listed but excluded from chronological graphs and deltas.
- Threshold controls apply to the current report (default Strong >= 85, Good >= 80, Needs Attention >= 65, otherwise Weak). Focus areas are generated from those thresholds. Settings and teacher remarks are report-session controls, not database settings.
- PDF uses the app's existing browser print / Save as PDF flow. Charts are vector SVG or HTML bars, split into printable blocks; every selected-class student is included. Word retains the existing HTML-based `.doc` export, so chart support depends on the Word version.

## Validation

Run `npm run test:analytics` for data isolation, ties, duplicate imports, missing values, metadata/answer normalization, escaping, threshold boundaries, complete 42-student output, and 50,000-student aggregation. `ANALYTICS_PREVIEW=/tmp/analytics-preview.html npm run test:analytics` generates a synthetic layout fixture for browser/print QA; fixtures are not included in production data.

Run `npm run build`. The repository's pre-existing `tsc --noEmit` failures in `master.functions.ts` (missing generated assessment_results table type) and `router.tsx` (error component type) are unrelated to this feature.
