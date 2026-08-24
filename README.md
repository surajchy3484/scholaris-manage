# School Harmony

Build a modern, responsive School Management & Attendance App with a clean and professional UI. The dashboard should be simple and only display the Total Number of Schools with a + Add School button. All student-related features must exist inside each individual school, not on the dashboard.

Dashboard

Show only:

Total Schools

+ Add School button

Display all schools as cards or a list.

Each school card should show:

School Name

School Location

Total Students

Actions on each school:

Open School

Edit School

Delete School (with confirmation)

Allow unlimited schools.

Include search and sorting for schools.

Add School

Required fields:

School Name

School Location/Address

Buttons:

Save

Cancel

School Details

When a school is opened, display:

School Name

School Location

Total Students

Student Management section

Attendance section

Import Students

Export Students

Student Management

Inside each school provide:

+ Add Student

Student List

Search Students

Filters

Import Students (Excel/CSV)

Export Students (Excel/CSV)

Add Student

All fields are required:

Student Name

Class

Division

Roll Number

Auto-generated Unique Student ID

School (automatically selected based on the current school)

Student Photo

Photo options:

Capture using Camera

Select from Device Gallery

Validation:

No field can be empty.

Student ID must be generated automatically.

Prevent duplicate roll numbers within the same class.

Student List

Each student card should display:

Student Photo

Student Name

Student ID

Class

Division

Roll Number

Actions:

View

Edit

Delete

Attendance

Attendance must be inside each school.

Features:

Select Class

Select Division

Select Date

Display students of the selected class/division

Mark Present/Absent individually

Mark All Present

Mark All Absent

Save Attendance

Attendance filters:

Class

Division

Date

Student Name

Student ID

Attendance reports:

Daily

Weekly

Monthly

Student-wise

Class-wise

Import Students

Support:

Excel (.xlsx, .xls)

CSV (.csv)

Provide:

Download Sample Excel Format

Sample columns:

Student Name

Class

Division

Roll Number

During import:

Auto-generate Student IDs.

Show preview before importing.

Validate all records.

Display invalid records with error messages.

Import only valid records.

Student Photos After Import

Imported students will not have photos.

Each imported student should display a No Photo placeholder.

Clicking the placeholder should allow:

Capture Photo using Camera

Select Photo from Gallery

Export

Allow exporting all student data of the selected school.

Include:

Student ID

Student Name

Class

Division

Roll Number

Attendance Percentage

Photo Path or Photo URL

Also provide an option to export:

Excel file

ZIP containing Excel file and all student images

Search & Filters

Search by:

Student Name

Student ID

Roll Number

Filter by:

Class

Division

Attendance

Date

Settings

Include:

Dark Mode

Light Mode

Backup Database

Restore Database

Technical Requirements

Responsive design for Android, iOS, Web, and Desktop.

Modern Material Design UI.

Smooth animations and loading indicators.

Proper form validation.

Confirmation dialogs before deleting records.

Clean, modular, scalable architecture with reusable components.

Optimized for handling thousands of students efficiently.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://scholaris-manage.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/cc90d495-f9b5-4bed-aad1-c4d52efaac77).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
