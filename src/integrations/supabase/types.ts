export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      assessments: {
        Row: {
          academic_year: string
          assessment_id: string
          class: string | null
          created_at: string
          date: string | null
          exam_type: string
          id: string
          name: string
          passing_marks: number
          school_id: string | null
          school_name: string | null
          section: string | null
          status: string
          subject: string | null
          total_marks: number
          total_questions: number
          updated_at: string
        }
        Insert: {
          academic_year?: string
          assessment_id: string
          class?: string | null
          created_at?: string
          date?: string | null
          exam_type?: string
          id?: string
          name: string
          passing_marks?: number
          school_id?: string | null
          school_name?: string | null
          section?: string | null
          status?: string
          subject?: string | null
          total_marks?: number
          total_questions?: number
          updated_at?: string
        }
        Update: {
          academic_year?: string
          assessment_id?: string
          class?: string | null
          created_at?: string
          date?: string | null
          exam_type?: string
          id?: string
          name?: string
          passing_marks?: number
          school_id?: string | null
          school_name?: string | null
          section?: string | null
          status?: string
          subject?: string | null
          total_marks?: number
          total_questions?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          created_at: string
          date: string
          id: string
          school_id: string
          status: string
          student_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          school_id: string
          status: string
          student_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          school_id?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      clicker_records: {
        Row: {
          answers: Json
          assessment_id: string | null
          class: string | null
          correct_rate: number
          created_at: string
          id: string
          keypad_id: string
          ranking: number | null
          roll_number: string | null
          school_id: string | null
          school_name: string | null
          score: number
          section: string | null
          student_id: string | null
          student_name: string
          team: string | null
          updated_at: string
        }
        Insert: {
          answers?: Json
          assessment_id?: string | null
          class?: string | null
          correct_rate?: number
          created_at?: string
          id?: string
          keypad_id: string
          ranking?: number | null
          roll_number?: string | null
          school_id?: string | null
          school_name?: string | null
          score?: number
          section?: string | null
          student_id?: string | null
          student_name?: string
          team?: string | null
          updated_at?: string
        }
        Update: {
          answers?: Json
          assessment_id?: string | null
          class?: string | null
          correct_rate?: number
          created_at?: string
          id?: string
          keypad_id?: string
          ranking?: number | null
          roll_number?: string | null
          school_id?: string | null
          school_name?: string | null
          score?: number
          section?: string | null
          student_id?: string | null
          student_name?: string
          team?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clicker_records_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clicker_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_scores: {
        Row: {
          academic_year: string
          created_at: string
          exam_type: string
          id: string
          remarks: string | null
          school_id: string
          score: number
          student_id: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          academic_year?: string
          created_at?: string
          exam_type?: string
          id?: string
          remarks?: string | null
          school_id: string
          score?: number
          student_id: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          academic_year?: string
          created_at?: string
          exam_type?: string
          id?: string
          remarks?: string | null
          school_id?: string
          score?: number
          student_id?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      mcp_allowed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          note: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          note?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          note?: string | null
        }
        Relationships: []
      }
      questions: {
        Row: {
          assessment_id: string
          chapter: string | null
          correct_answer: string
          created_at: string
          difficulty: string
          id: string
          marks: number
          parameter: string | null
          question_no: number
          question_text: string | null
          status: string
          subject: string | null
          topic: string | null
          updated_at: string
        }
        Insert: {
          assessment_id: string
          chapter?: string | null
          correct_answer?: string
          created_at?: string
          difficulty?: string
          id?: string
          marks?: number
          parameter?: string | null
          question_no: number
          question_text?: string | null
          status?: string
          subject?: string | null
          topic?: string | null
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          chapter?: string | null
          correct_answer?: string
          created_at?: string
          difficulty?: string
          id?: string
          marks?: number
          parameter?: string | null
          question_no?: number
          question_text?: string | null
          status?: string
          subject?: string | null
          topic?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      schools: {
        Row: {
          code: string
          created_at: string
          id: string
          image_url: string | null
          location: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          image_url?: string | null
          location: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          image_url?: string | null
          location?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          class: string
          created_at: string
          division: string
          id: string
          school_id: string
          session_name: string
          status: string
          topic: string
          unit: string
          updated_at: string
        }
        Insert: {
          class?: string
          created_at?: string
          division?: string
          id?: string
          school_id: string
          session_name: string
          status?: string
          topic?: string
          unit?: string
          updated_at?: string
        }
        Update: {
          class?: string
          created_at?: string
          division?: string
          id?: string
          school_id?: string
          session_name?: string
          status?: string
          topic?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          class: string
          created_at: string
          division: string
          enrollment_date: string | null
          id: string
          name: string
          photo_url: string | null
          roll_number: string
          school_id: string
          student_code: string
          updated_at: string
        }
        Insert: {
          class: string
          created_at?: string
          division: string
          enrollment_date?: string | null
          id?: string
          name: string
          photo_url?: string | null
          roll_number: string
          school_id: string
          student_code: string
          updated_at?: string
        }
        Update: {
          class?: string
          created_at?: string
          division?: string
          enrollment_date?: string | null
          id?: string
          name?: string
          photo_url?: string | null
          roll_number?: string
          school_id?: string
          student_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
