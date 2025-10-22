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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      environments: {
        Row: {
          active: boolean | null
          color: string | null
          created_at: string
          description: string | null
          display_name: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean | null
          color?: string | null
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean | null
          color?: string | null
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      organization_projects: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          project_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          project_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_projects_new_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          active: boolean | null
          created_at: string
          description: string | null
          display_name: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean | null
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          active: boolean | null
          color: string | null
          created_at: string
          description: string | null
          display_name: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean | null
          color?: string | null
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean | null
          color?: string | null
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      suite_tests: {
        Row: {
          created_at: string
          file: string
          id: string
          name: string
          project_id: string
          suite_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          file: string
          id?: string
          name: string
          project_id: string
          suite_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          file?: string
          id?: string
          name?: string
          project_id?: string
          suite_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suite_tests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suite_tests_suite_id_fkey"
            columns: ["suite_id"]
            isOneToOne: false
            referencedRelation: "suites"
            referencedColumns: ["id"]
          },
        ]
      }
      suites: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      test_results: {
        Row: {
          attachments: Json | null
          created_at: string
          duration: number
          error: string | null
          error_stack: string | null
          id: string
          last_failed_step: Json | null
          retry_index: number
          screenshots: Json | null
          started_at: string | null
          status: string
          steps_url: string | null
          test_id: string
        }
        Insert: {
          attachments?: Json | null
          created_at?: string
          duration?: number
          error?: string | null
          error_stack?: string | null
          id?: string
          last_failed_step?: Json | null
          retry_index?: number
          screenshots?: Json | null
          started_at?: string | null
          status: string
          steps_url?: string | null
          test_id: string
        }
        Update: {
          attachments?: Json | null
          created_at?: string
          duration?: number
          error?: string | null
          error_stack?: string | null
          id?: string
          last_failed_step?: Json | null
          retry_index?: number
          screenshots?: Json | null
          started_at?: string | null
          status?: string
          steps_url?: string | null
          test_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_results_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      test_runs: {
        Row: {
          branch: string
          ci_metadata: Json | null
          commit: string
          content_hash: string | null
          created_at: string
          duration: number
          environment_id: string
          failed: number
          flaky: number
          id: string
          passed: number
          project_id: string
          skipped: number
          timestamp: string
          total: number
          trigger_id: string
          uploaded_filename: string | null
        }
        Insert: {
          branch: string
          ci_metadata?: Json | null
          commit: string
          content_hash?: string | null
          created_at?: string
          duration?: number
          environment_id: string
          failed?: number
          flaky?: number
          id?: string
          passed?: number
          project_id: string
          skipped?: number
          timestamp?: string
          total?: number
          trigger_id: string
          uploaded_filename?: string | null
        }
        Update: {
          branch?: string
          ci_metadata?: Json | null
          commit?: string
          content_hash?: string | null
          created_at?: string
          duration?: number
          environment_id?: string
          failed?: number
          flaky?: number
          id?: string
          passed?: number
          project_id?: string
          skipped?: number
          timestamp?: string
          total?: number
          trigger_id?: string
          uploaded_filename?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "test_runs_environment_id_fkey"
            columns: ["environment_id"]
            isOneToOne: false
            referencedRelation: "environments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_runs_trigger_id_fkey"
            columns: ["trigger_id"]
            isOneToOne: false
            referencedRelation: "test_triggers"
            referencedColumns: ["id"]
          },
        ]
      }
      test_triggers: {
        Row: {
          active: boolean | null
          created_at: string
          description: string | null
          display_name: string
          icon: string | null
          id: string
          name: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string
          description?: string | null
          display_name: string
          icon?: string | null
          id?: string
          name: string
        }
        Update: {
          active?: boolean | null
          created_at?: string
          description?: string | null
          display_name?: string
          icon?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      tests: {
        Row: {
          created_at: string
          duration: number
          error: string | null
          id: string
          metadata: Json | null
          screenshots: Json | null
          started_at: string | null
          status: string
          suite_test_id: string | null
          test_run_id: string
          worker_index: number | null
        }
        Insert: {
          created_at?: string
          duration?: number
          error?: string | null
          id?: string
          metadata?: Json | null
          screenshots?: Json | null
          started_at?: string | null
          status: string
          suite_test_id?: string | null
          test_run_id: string
          worker_index?: number | null
        }
        Update: {
          created_at?: string
          duration?: number
          error?: string | null
          id?: string
          metadata?: Json | null
          screenshots?: Json | null
          started_at?: string | null
          status?: string
          suite_test_id?: string | null
          test_run_id?: string
          worker_index?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tests_suite_test_id_fkey"
            columns: ["suite_test_id"]
            isOneToOne: false
            referencedRelation: "suite_tests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tests_test_run_id_fkey"
            columns: ["test_run_id"]
            isOneToOne: false
            referencedRelation: "test_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_organizations: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_organizations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
