export const categories = [
  "Student Data",
  "Attendance",
  "Session Status",
  "Assessment/Exam",
  "Dashboard/Reports",
  "User Access/Login",
  "Technical Issue",
  "Data Import/Export",
  "Feature Request",
  "Other",
] as const;
export type TicketCategory = (typeof categories)[number];

export const priorities = ["Low", "Medium", "High", "Critical"] as const;
export type TicketPriority = (typeof priorities)[number];

export const statuses = [
  "Open",
  "Under Review",
  "In Progress",
  "Pending User Response",
  "Resolved",
  "Closed",
  "Reopened",
] as const;
export type TicketStatus = (typeof statuses)[number];
