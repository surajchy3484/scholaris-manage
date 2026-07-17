export type School = {
  id: string;
  name: string;
  location: string;
  code: string;
  created_at: string;
  updated_at: string;
};

export type Student = {
  id: string;
  school_id: string;
  student_code: string;
  name: string;
  class: string;
  division: string;
  roll_number: string;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
};

export type AttendanceRecord = {
  id: string;
  school_id: string;
  student_id: string;
  date: string;
  status: "present" | "absent";
  created_at: string;
};

export type StudentWithCount = School & { student_count: number };
