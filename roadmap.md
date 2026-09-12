# SchoolRise roadmap

## Done
- SchoolRise branding (accent S/R), PWA name, titles
- Admin-defined divisions / batches per school + class (free text, exact names)
- Session Status: School → Unit → Class → Division, status per division
- Session Status uses each school's configured division names
- Assessment Master import: spec columns (ID, Name, School Name, Class, Section, Exam Type, Exam Date, Total Question, Status), order-independent headers, date/number/status validation, duplicate detection, batched insert, progress, error report, template download
- Question Master import: "Question No." / "Correct Ans (A,B,C,D)" headers, A–D validation, duplicate detection, batched insert, progress, error report, template download

## Open
- Users module: individual accounts, admin vs trainer roles, per-module and per-action permissions (view/add/edit/delete/import/export), enforced server-side
- Login tracking: last login, login count, enable/disable, admin password reset, forced first-login password change
- Server-side pagination/search/sort for Students, Questions, Clicker, Assessments (50k+ records)
- Virtualised tables and lazy-loaded photos
- UI animation polish: page transitions, cards, dialogs, dropdowns, tabs, stat counters (respect reduced motion)
- Dashboard visual refresh
