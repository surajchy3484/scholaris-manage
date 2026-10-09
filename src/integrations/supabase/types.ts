export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      academic_years: {
        Row: {
          created_at: string;
          id: string;
          is_current: boolean;
          name: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          is_current?: boolean;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_current?: boolean;
          name?: string;
        };
        Relationships: [];
      };
      app_users: {
        Row: {
          all_schools: boolean;
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
          is_active: boolean;
          last_login_at: string | null;
          login_count: number;
          must_change_password: boolean;
          password_changed_at: string;
          password_hash: string;
          permissions: Json;
          phone: string | null;
          role: string;
          school_ids: string[];
          updated_at: string;
          username: string;
        };
        Insert: {
          all_schools?: boolean;
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          is_active?: boolean;
          last_login_at?: string | null;
          login_count?: number;
          must_change_password?: boolean;
          password_changed_at?: string;
          password_hash: string;
          permissions?: Json;
          phone?: string | null;
          role?: string;
          school_ids?: string[];
          updated_at?: string;
          username: string;
        };
        Update: {
          all_schools?: boolean;
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          is_active?: boolean;
          last_login_at?: string | null;
          login_count?: number;
          must_change_password?: boolean;
          password_changed_at?: string;
          password_hash?: string;
          permissions?: Json;
          phone?: string | null;
          role?: string;
          school_ids?: string[];
          updated_at?: string;
          username?: string;
        };
        Relationships: [];
      };
      assessment_results: {
        Row: {
          academic_year: string | null;
          answers: Json;
          assessment_id: string;
          attempted_questions: number | null;
          calculated_at: string;
          class: string | null;
          clicker_id: string | null;
          correct_answers: number;
          correct_rate: number;
          created_at: string;
          exam_type: string | null;
          id: string;
          keypad_id: string | null;
          question_snapshot: Json | null;
          ranking: number | null;
          school_id: string | null;
          school_name: string | null;
          score: number;
          section: string | null;
          student_id: string | null;
          student_name: string;
          total_questions: number;
          unattempted_questions: number | null;
          updated_at: string;
          wrong_answers: number;
        };
        Insert: {
          academic_year?: string | null;
          answers?: Json;
          assessment_id: string;
          attempted_questions?: number | null;
          calculated_at?: string;
          class?: string | null;
          clicker_id?: string | null;
          correct_answers?: number;
          correct_rate?: number;
          created_at?: string;
          exam_type?: string | null;
          id?: string;
          keypad_id?: string | null;
          question_snapshot?: Json | null;
          ranking?: number | null;
          school_id?: string | null;
          school_name?: string | null;
          score?: number;
          section?: string | null;
          student_id?: string | null;
          student_name?: string;
          total_questions?: number;
          unattempted_questions?: number | null;
          updated_at?: string;
          wrong_answers?: number;
        };
        Update: {
          academic_year?: string | null;
          answers?: Json;
          assessment_id?: string;
          attempted_questions?: number | null;
          calculated_at?: string;
          class?: string | null;
          clicker_id?: string | null;
          correct_answers?: number;
          correct_rate?: number;
          created_at?: string;
          exam_type?: string | null;
          id?: string;
          keypad_id?: string | null;
          question_snapshot?: Json | null;
          ranking?: number | null;
          school_id?: string | null;
          school_name?: string | null;
          score?: number;
          section?: string | null;
          student_id?: string | null;
          student_name?: string;
          total_questions?: number;
          unattempted_questions?: number | null;
          updated_at?: string;
          wrong_answers?: number;
        };
        Relationships: [
          {
            foreignKeyName: "assessment_results_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assessment_results_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "academic_roster";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assessment_results_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      assessments: {
        Row: {
          academic_year: string;
          assessment_id: string;
          class: string | null;
          created_at: string;
          date: string | null;
          exam_type: string;
          id: string;
          name: string;
          passing_marks: number;
          question_set_version_id: string | null;
          question_snapshot: Json | null;
          school_id: string | null;
          school_name: string | null;
          section: string | null;
          status: string;
          subject: string | null;
          total_marks: number;
          total_questions: number;
          updated_at: string;
        };
        Insert: {
          academic_year: string;
          assessment_id: string;
          class?: string | null;
          created_at?: string;
          date?: string | null;
          exam_type?: string;
          id?: string;
          name: string;
          passing_marks?: number;
          question_set_version_id?: string | null;
          question_snapshot?: Json | null;
          school_id?: string | null;
          school_name?: string | null;
          section?: string | null;
          status?: string;
          subject?: string | null;
          total_marks?: number;
          total_questions?: number;
          updated_at?: string;
        };
        Update: {
          academic_year?: string;
          assessment_id?: string;
          class?: string | null;
          created_at?: string;
          date?: string | null;
          exam_type?: string;
          id?: string;
          name?: string;
          passing_marks?: number;
          question_set_version_id?: string | null;
          question_snapshot?: Json | null;
          school_id?: string | null;
          school_name?: string | null;
          section?: string | null;
          status?: string;
          subject?: string | null;
          total_marks?: number;
          total_questions?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assessments_question_set_version_id_fkey";
            columns: ["question_set_version_id"];
            isOneToOne: false;
            referencedRelation: "question_set_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assessments_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      attendance: {
        Row: {
          academic_year: string | null;
          created_at: string;
          date: string;
          id: string;
          school_id: string;
          status: string;
          student_id: string;
        };
        Insert: {
          academic_year?: string | null;
          created_at?: string;
          date: string;
          id?: string;
          school_id: string;
          status: string;
          student_id: string;
        };
        Update: {
          academic_year?: string | null;
          created_at?: string;
          date?: string;
          id?: string;
          school_id?: string;
          status?: string;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "academic_roster";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      class_session_plans: {
        Row: {
          academic_year: string;
          class: string;
          created_at: string;
          created_by: string | null;
          id: string;
          session_count: number;
          unit: string;
          updated_at: string;
        };
        Insert: {
          academic_year: string;
          class: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          session_count: number;
          unit: string;
          updated_at?: string;
        };
        Update: {
          academic_year?: string;
          class?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          session_count?: number;
          unit?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      clicker_records: {
        Row: {
          academic_year: string | null;
          answers: Json;
          assessment_id: string | null;
          attempted_questions: number | null;
          class: string | null;
          correct_answers: number | null;
          correct_rate: number;
          created_at: string;
          evaluated_at: string | null;
          exam_type: string | null;
          id: string;
          keypad_id: string;
          question_snapshot: Json | null;
          ranking: number | null;
          roll_number: string | null;
          school_id: string | null;
          school_name: string | null;
          score: number;
          section: string | null;
          student_id: string | null;
          student_name: string;
          team: string | null;
          total_questions: number | null;
          unattempted_questions: number | null;
          updated_at: string;
          wrong_answers: number | null;
        };
        Insert: {
          academic_year?: string | null;
          answers?: Json;
          assessment_id?: string | null;
          attempted_questions?: number | null;
          class?: string | null;
          correct_answers?: number | null;
          correct_rate?: number;
          created_at?: string;
          evaluated_at?: string | null;
          exam_type?: string | null;
          id?: string;
          keypad_id: string;
          question_snapshot?: Json | null;
          ranking?: number | null;
          roll_number?: string | null;
          school_id?: string | null;
          school_name?: string | null;
          score?: number;
          section?: string | null;
          student_id?: string | null;
          student_name?: string;
          team?: string | null;
          total_questions?: number | null;
          unattempted_questions?: number | null;
          updated_at?: string;
          wrong_answers?: number | null;
        };
        Update: {
          academic_year?: string | null;
          answers?: Json;
          assessment_id?: string | null;
          attempted_questions?: number | null;
          class?: string | null;
          correct_answers?: number | null;
          correct_rate?: number;
          created_at?: string;
          evaluated_at?: string | null;
          exam_type?: string | null;
          id?: string;
          keypad_id?: string;
          question_snapshot?: Json | null;
          ranking?: number | null;
          roll_number?: string | null;
          school_id?: string | null;
          school_name?: string | null;
          score?: number;
          section?: string | null;
          student_id?: string | null;
          student_name?: string;
          team?: string | null;
          total_questions?: number | null;
          unattempted_questions?: number | null;
          updated_at?: string;
          wrong_answers?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "clicker_records_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "clicker_records_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "academic_roster";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "clicker_records_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      exam_scores: {
        Row: {
          academic_year: string;
          created_at: string;
          exam_type: string;
          id: string;
          remarks: string | null;
          school_id: string;
          score: number;
          student_id: string;
          subject: string | null;
          updated_at: string;
        };
        Insert: {
          academic_year: string;
          created_at?: string;
          exam_type?: string;
          id?: string;
          remarks?: string | null;
          school_id: string;
          score?: number;
          student_id: string;
          subject?: string | null;
          updated_at?: string;
        };
        Update: {
          academic_year?: string;
          created_at?: string;
          exam_type?: string;
          id?: string;
          remarks?: string | null;
          school_id?: string;
          score?: number;
          student_id?: string;
          subject?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      exam_types: {
        Row: {
          created_at: string;
          name: string;
          visible: boolean;
        };
        Insert: {
          created_at?: string;
          name: string;
          visible?: boolean;
        };
        Update: {
          created_at?: string;
          name?: string;
          visible?: boolean;
        };
        Relationships: [];
      };
      mcp_allowed_emails: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          note: string | null;
        };
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
          note?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          note?: string | null;
        };
        Relationships: [];
      };
      question_bank: {
        Row: {
          chapter: string | null;
          class: string;
          correct_answer: string;
          created_at: string;
          difficulty: string;
          exam_type: string;
          id: string;
          marks: number;
          parameter: string | null;
          question_no: number;
          question_text: string | null;
          subject: string | null;
          topic: string | null;
          updated_at: string;
        };
        Insert: {
          chapter?: string | null;
          class: string;
          correct_answer: string;
          created_at?: string;
          difficulty?: string;
          exam_type: string;
          id?: string;
          marks?: number;
          parameter?: string | null;
          question_no: number;
          question_text?: string | null;
          subject?: string | null;
          topic?: string | null;
          updated_at?: string;
        };
        Update: {
          chapter?: string | null;
          class?: string;
          correct_answer?: string;
          created_at?: string;
          difficulty?: string;
          exam_type?: string;
          id?: string;
          marks?: number;
          parameter?: string | null;
          question_no?: number;
          question_text?: string | null;
          subject?: string | null;
          topic?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "question_bank_exam_type_fkey";
            columns: ["exam_type"];
            isOneToOne: false;
            referencedRelation: "exam_types";
            referencedColumns: ["name"];
          },
        ];
      };
      question_bank_migration_issues: {
        Row: {
          assessment_id: string;
          class: string | null;
          exam_type: string | null;
          questions: Json;
          reason: string;
          resolved: boolean;
        };
        Insert: {
          assessment_id: string;
          class?: string | null;
          exam_type?: string | null;
          questions: Json;
          reason: string;
          resolved?: boolean;
        };
        Update: {
          assessment_id?: string;
          class?: string | null;
          exam_type?: string | null;
          questions?: Json;
          reason?: string;
          resolved?: boolean;
        };
        Relationships: [];
      };
      question_set_versions: {
        Row: {
          academic_year: string | null;
          class: string;
          created_at: string;
          exam_type: string;
          id: string;
          name: string;
          questions: Json;
        };
        Insert: {
          academic_year?: string | null;
          class: string;
          created_at?: string;
          exam_type: string;
          id?: string;
          name: string;
          questions: Json;
        };
        Update: {
          academic_year?: string | null;
          class?: string;
          created_at?: string;
          exam_type?: string;
          id?: string;
          name?: string;
          questions?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "question_set_versions_academic_year_fkey";
            columns: ["academic_year"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id"];
          },
        ];
      };
      questions: {
        Row: {
          assessment_id: string;
          chapter: string | null;
          correct_answer: string;
          created_at: string;
          difficulty: string;
          id: string;
          marks: number;
          parameter: string | null;
          question_no: number;
          question_text: string | null;
          status: string;
          subject: string | null;
          topic: string | null;
          updated_at: string;
        };
        Insert: {
          assessment_id: string;
          chapter?: string | null;
          correct_answer?: string;
          created_at?: string;
          difficulty?: string;
          id?: string;
          marks?: number;
          parameter?: string | null;
          question_no: number;
          question_text?: string | null;
          status?: string;
          subject?: string | null;
          topic?: string | null;
          updated_at?: string;
        };
        Update: {
          assessment_id?: string;
          chapter?: string | null;
          correct_answer?: string;
          created_at?: string;
          difficulty?: string;
          id?: string;
          marks?: number;
          parameter?: string | null;
          question_no?: number;
          question_text?: string | null;
          status?: string;
          subject?: string | null;
          topic?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      school_clusters: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      school_divisions: {
        Row: {
          class: string;
          created_at: string;
          id: string;
          name: string;
          school_id: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          class?: string;
          created_at?: string;
          id?: string;
          name: string;
          school_id: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          class?: string;
          created_at?: string;
          id?: string;
          name?: string;
          school_id?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "school_divisions_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      school_drive_sync: {
        Row: {
          baseline: Json;
          file_id: string | null;
          lease: string | null;
          lease_until: string | null;
          school_id: string;
          synced_at: string | null;
        };
        Insert: {
          baseline?: Json;
          file_id?: string | null;
          lease?: string | null;
          lease_until?: string | null;
          school_id: string;
          synced_at?: string | null;
        };
        Update: {
          baseline?: Json;
          file_id?: string | null;
          lease?: string | null;
          lease_until?: string | null;
          school_id?: string;
          synced_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "school_drive_sync_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: true;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      schools: {
        Row: {
          cluster_name: string | null;
          code: string;
          created_at: string;
          id: string;
          image_url: string | null;
          location: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          cluster_name?: string | null;
          code: string;
          created_at?: string;
          id?: string;
          image_url?: string | null;
          location: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          cluster_name?: string | null;
          code?: string;
          created_at?: string;
          id?: string;
          image_url?: string | null;
          location?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      session_assignment_targets: {
        Row: {
          academic_year: string;
          assignment_type: string;
          class: string;
          class_plan_id: string | null;
          created_at: string;
          created_by: string | null;
          division: string;
          id: string;
          school_id: string;
          session_count: number;
          unit: string;
          updated_at: string;
        };
        Insert: {
          academic_year: string;
          assignment_type: string;
          class: string;
          class_plan_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          division?: string;
          id?: string;
          school_id: string;
          session_count: number;
          unit: string;
          updated_at?: string;
        };
        Update: {
          academic_year?: string;
          assignment_type?: string;
          class?: string;
          class_plan_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          division?: string;
          id?: string;
          school_id?: string;
          session_count?: number;
          unit?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "session_assignment_targets_class_plan_id_fkey";
            columns: ["class_plan_id"];
            isOneToOne: false;
            referencedRelation: "class_session_plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "session_assignment_targets_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      session_division_status: {
        Row: {
          academic_year: string | null;
          class: string;
          created_at: string;
          division: string;
          id: string;
          school_id: string;
          session_id: string;
          status: string;
          unit: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          academic_year?: string | null;
          class?: string;
          created_at?: string;
          division: string;
          id?: string;
          school_id: string;
          session_id: string;
          status?: string;
          unit: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          academic_year?: string | null;
          class?: string;
          created_at?: string;
          division?: string;
          id?: string;
          school_id?: string;
          session_id?: string;
          status?: string;
          unit?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "session_division_status_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "session_division_status_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      sessions: {
        Row: {
          academic_year: string;
          assignment_type: string;
          class: string;
          class_plan_id: string | null;
          created_at: string;
          id: string;
          school_id: string;
          session_name: string;
          status: string;
          topic: string;
          unit: string;
          updated_at: string;
        };
        Insert: {
          academic_year: string;
          assignment_type?: string;
          class?: string;
          class_plan_id?: string | null;
          created_at?: string;
          id?: string;
          school_id: string;
          session_name: string;
          status?: string;
          topic?: string;
          unit?: string;
          updated_at?: string;
        };
        Update: {
          academic_year?: string;
          assignment_type?: string;
          class?: string;
          class_plan_id?: string | null;
          created_at?: string;
          id?: string;
          school_id?: string;
          session_name?: string;
          status?: string;
          topic?: string;
          unit?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sessions_class_plan_fk";
            columns: ["class_plan_id"];
            isOneToOne: false;
            referencedRelation: "class_session_plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sessions_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      student_enrollments: {
        Row: {
          academic_year: string;
          class: string;
          created_at: string;
          division: string;
          id: string;
          roll_number: string;
          school_id: string;
          status: string;
          student_id: string;
          updated_at: string;
        };
        Insert: {
          academic_year: string;
          class: string;
          created_at?: string;
          division?: string;
          id?: string;
          roll_number?: string;
          school_id: string;
          status?: string;
          student_id: string;
          updated_at?: string;
        };
        Update: {
          academic_year?: string;
          class?: string;
          created_at?: string;
          division?: string;
          id?: string;
          roll_number?: string;
          school_id?: string;
          status?: string;
          student_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_enrollments_academic_year_fkey";
            columns: ["academic_year"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_enrollments_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_enrollments_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "academic_roster";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_enrollments_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      students: {
        Row: {
          class: string;
          created_at: string;
          division: string;
          enrollment_date: string | null;
          id: string;
          name: string;
          photo_url: string | null;
          roll_number: string;
          school_id: string;
          student_code: string;
          updated_at: string;
        };
        Insert: {
          class: string;
          created_at?: string;
          division: string;
          enrollment_date?: string | null;
          id?: string;
          name: string;
          photo_url?: string | null;
          roll_number: string;
          school_id: string;
          student_code: string;
          updated_at?: string;
        };
        Update: {
          class?: string;
          created_at?: string;
          division?: string;
          enrollment_date?: string | null;
          id?: string;
          name?: string;
          photo_url?: string | null;
          roll_number?: string;
          school_id?: string;
          student_code?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "students_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      academic_roster: {
        Row: {
          academic_year: string | null;
          class: string | null;
          created_at: string | null;
          division: string | null;
          enrollment_date: string | null;
          enrollment_id: string | null;
          enrollment_status: string | null;
          id: string | null;
          name: string | null;
          photo_url: string | null;
          roll_number: string | null;
          school_id: string | null;
          student_code: string | null;
          updated_at: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "student_enrollments_academic_year_fkey";
            columns: ["academic_year"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_enrollments_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      academic_capture_question_set: {
        Args: {
          p_class: string;
          p_exam: string;
          p_name: string;
          p_year?: string;
        };
        Returns: string;
      };
      academic_next_student_code: {
        Args: { p_school: string };
        Returns: string;
      };
      academic_promote: {
        Args: {
          p_rows: Json;
          p_schools?: string[];
          p_source: string;
          p_target: string;
        };
        Returns: number;
      };
      academic_school_counts: { Args: never; Returns: Json };
      academic_selected_year: { Args: never; Returns: string };
      academic_set_current: { Args: { p_year: string }; Returns: undefined };
      academic_student_history: {
        Args: { p_schools?: string[]; p_student: string };
        Returns: Json;
      };
      delete_clicker_records: {
        Args: { p_ids: string[]; p_schools?: string[] };
        Returns: number;
      };
      performance_master_page: {
        Args: {
          p_assessment?: string;
          p_class?: string;
          p_desc?: boolean;
          p_min_score?: number;
          p_page?: number;
          p_schools?: string[];
          p_search?: string;
          p_section?: string;
          p_size?: number;
          p_sort?: string;
          p_subject?: string;
          p_table: string;
          p_team?: string;
        };
        Returns: Json;
      };
      question_class: { Args: { value: string }; Returns: string };
      school_drive_acquire: {
        Args: { p_lease: string; p_school: string };
        Returns: Json;
      };
      school_drive_apply: {
        Args: { p_changes: Json; p_lease: string; p_school: string };
        Returns: number;
      };
      school_drive_finish: {
        Args: {
          p_baseline: Json;
          p_file: string;
          p_lease: string;
          p_school: string;
        };
        Returns: undefined;
      };
      school_drive_release: {
        Args: { p_lease: string; p_school: string };
        Returns: undefined;
      };
      school_drive_snapshot: { Args: { p_school: string }; Returns: Json };
      universal_clicker_write: {
        Args: {
          p_ids?: string[];
          p_mode: string;
          p_patch?: Json;
          p_rows?: Json;
          p_schools?: string[];
        };
        Returns: number;
      };
      universal_questions_page: {
        Args: {
          p_class: string;
          p_desc: boolean;
          p_exam: string;
          p_page: number;
          p_search: string;
          p_size: number;
          p_sort: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
