# SchoolRise roadmap

## Done
- SchoolRise branding (accent S/R), PWA name, titles
- Admin-defined divisions / batches per school + class (free text, exact names)
- Session Status: School → Unit → Class → Division, status per division
- Session Status uses each school's configured division names
- Assessment Master import: spec columns (ID, Name, School Name, Class, Section, Exam Type, Exam Date, Total Question, Status), order-independent headers, date/number/status validation, duplicate detection, batched insert, progress, error report, template download
- Question Master import: "Question No." / "Correct Ans (A,B,C,D)" headers, A–D validation, duplicate detection, batched insert, progress, error report, template download

- User Access: individual accounts (admin / STEM Trainer), per-module and per-action permissions, assigned schools, enable/disable, admin password reset, last-login + sign-in count; enforced server-side via signed session tokens

## Open
- Forced password change on first login
- Server-side pagination/search/sort for Students, Questions, Clicker, Assessments (50k+ records)
- Virtualised tables and lazy-loaded photos
- UI animation polish: page transitions, cards, dialogs, dropdowns, tabs, stat counters (respect reduced motion)
- Dashboard visual refresh

## Clicker Master → Student Score Integration
- [x] Match clicker rows to Student Master by Student ID / student code, else exact Name+Roll+Class+Section (no new students created)
- [x] Import preview: Matched / New Results / Updated Scores / Unmatched / Duplicate counts; unmatched rows blocked and listed in error report
- [x] Re-upload updates the existing result instead of duplicating
- [x] Scores flow to exam_scores (per student, exam type, academic year) → all reports
