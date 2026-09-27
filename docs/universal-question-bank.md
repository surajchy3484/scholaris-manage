# Universal Question Master and Clicker evaluation

Question Master now owns one shared question bank keyed by **Exam Type + Class +
Question Number**. Schools and assessments do not get their own copies. Assessments
remain the school/session context for a Clicker upload; they are not the answer-key
source. Class values such as `Class 08` normalize to `8`; exam names are trimmed
and uppercased. Different class names are not guessed or merged.

## Deploy and migrate

Apply `20260926150000_universal_question_bank.sql` after the existing migrations,
then deploy the matching app build. Take a provider backup and test on staging
first. The migration takes table locks; choose a maintenance window for large
datasets. No production migration has been executed by this code change.

The migration adds exam_types, question_bank, a legacy-review table, evaluation
metrics, answer-key snapshots and transactional server functions. Existing
questions, Clicker rows and assessment results are retained. Existing rows are
not silently recalculated. New writes require the migration and fail clearly
without it; there is no fallback to legacy matching or uploaded scores.

ICA starts Visible. MCA, FCA and other discovered exam types start Hidden.
Review these settings in Question Master before importing Clicker data.
New custom exam types start Hidden and appear in Question Master, Assessment
Master and Clicker dropdowns without code changes. Visibility applies to the
whole exam type across all classes; questions have no visibility controls.

## Legacy question review

Complete legacy sets with identical question content/keys/metadata for the same
exam type and class are promoted once. Conflicting sets, missing classes and
orphaned assessment references are retained for review. Open **Question Master →
Legacy question sets need review**, compare the displayed sources and choose
**Use this source set for all schools**, or import a reviewed universal set.
Selecting a source cannot overwrite an existing universal question number.
The original assessment-specific questions remain available to historical reports.

## Daily use

1. In Question Master, add an Exam Type if needed and set its visibility.
2. Filter by Exam Type/Class and add or import the questions. The question form
   includes Question Number, Question, A/B/C/D key, Parameter, Chapter and Topic.
   Subject is optional for subject analysis. Copy creates a new universal question;
   it does not assign a question to a school. Search, sorting, pagination, selection,
   bulk delete and exports use the existing grid design.
3. In Clicker Master, include Exam Type and Class. Select/include an Assessment ID
   to identify the school/session. Without one, only a unique exact exam/class/
   section assessment match is accepted. Ambiguous matches are rejected, including
   the same class at multiple schools. Student IDs are verified against school,
   class and section; imports otherwise require a unique student match.
4. Upload responses as `S1`, `S2` … or `1-S1`, `2-S2` … . Both forms normalize to
   the same question number. Mismatched labels (`1-S2`), duplicate normalized
   columns, invalid answers and nonblank responses without keys are rejected.
   Blank answers are unattempted. There is no fixed ten-question limit; the bank
   accepts question numbers up to 10,000 and the grid discovers columns.
5. The server checks visibility and the exact exam/class key before saving. Hidden
   types produce “Question Set Inactive” and cannot evaluate an upload or edit.
   No alternative exam or class is selected. Uploaded scores/rates/ranks are ignored.

The Clicker grid preserves its existing columns, adds Exam Type, and labels dynamic
answers as `1-S1`, `2-S2`, etc. Row details include calculated totals. User Access
controls edit/delete actions and server permissions; school boundaries are checked
again inside the transaction.

## Calculation and reporting

- Total = all questions in the selected universal set.
- Attempted = nonblank valid responses; unattempted = total − attempted.
- Correct = exact A/B/C/D matches; wrong = attempted − correct.
- Score = correct count (one point per correct answer).
- Correct Rate = correct ÷ total × 100, rounded to one decimal.
- Ranking = competition ranking (1, 2, 2, 4) within school/assessment/exam/class/
  section. All evaluated peers are ranked, not just the latest import batch.

Evaluation, ranks, assessment results and linked Exam Report summaries are written
in one database transaction per batch. A failed batch saves none of its changes.
Large imports use multiple batches; earlier successful batches remain if a later
batch fails. Correct the failed rows and import the remaining rows; duplicate
assessment/keypad/student records are rejected rather than duplicated.

Evaluated records store the exact key, Parameter, Chapter, Topic and Subject used.
Student/class/school analysis uses that snapshot, including all-blank attempts.
Editing the bank or hiding an exam does not rewrite historical scores. Saving a
Clicker edit explicitly re-evaluates it against the currently visible universal
set. Legacy unevaluated records retain their original results and original
assessment-key analysis until explicitly edited and evaluated.

Linked exam summaries use the exact exam type, academic year and subject, with the
latest dated evaluated assessment providing the summary. Historical manual exam
scores are preserved; this change does not globally clear old summary records.

## Validation

- `PGLITE_ROOT=/path/to/@electric-sql/pglite node scripts/test-universal-questions.mjs`
- `node scripts/test-visual-analytics.mjs`
- `node scripts/test-school-drive.mjs`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`

Database tests cover preserved legacy rows, conflict review, two schools sharing
one bank, ICA/MCA/class isolation, visibility, future types, 1,100 questions,
blank responses, invalid columns, duplicate rejection, competition ties, snapshots,
transaction rollback and denied anonymous access. Staging must additionally verify
real spreadsheet imports and authenticated user permissions against the deployed DB.
