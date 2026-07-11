
-- Schools
CREATE TABLE public.schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schools TO anon, authenticated;
GRANT ALL ON public.schools TO service_role;
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public schools all" ON public.schools FOR ALL USING (true) WITH CHECK (true);

-- Students
CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_code TEXT NOT NULL,
  name TEXT NOT NULL,
  class TEXT NOT NULL,
  division TEXT NOT NULL,
  roll_number TEXT NOT NULL,
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, class, division, roll_number),
  UNIQUE (school_id, student_code)
);
CREATE INDEX idx_students_school ON public.students(school_id);
CREATE INDEX idx_students_class_div ON public.students(school_id, class, division);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO anon, authenticated;
GRANT ALL ON public.students TO service_role;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public students all" ON public.students FOR ALL USING (true) WITH CHECK (true);

-- Attendance
CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present','absent')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, date)
);
CREATE INDEX idx_attendance_school_date ON public.attendance(school_id, date);
CREATE INDEX idx_attendance_student ON public.attendance(student_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO anon, authenticated;
GRANT ALL ON public.attendance TO service_role;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public attendance all" ON public.attendance FOR ALL USING (true) WITH CHECK (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER schools_updated BEFORE UPDATE ON public.schools FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER students_updated BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
