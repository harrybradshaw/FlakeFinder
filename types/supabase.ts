export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5";
  };
  public: {
    Tables: {
      environments: {
        Row: {
          active: boolean | null;
          color: string | null;
          created_at: string;
          description: string | null;
          display_name: string;
          id: string;
          name: string;
        };
        Insert: {
          active?: boolean | null;
          color?: string | null;
          created_at?: string;
          description?: string | null;
          display_name: string;
          id?: string;
          name: string;
        };
        Update: {
          active?: boolean | null;
          color?: string | null;
          created_at?: string;
          description?: string | null;
          display_name?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      flakiness_alerts: {
        Row: {
          alert_type: string;
          consecutive_count: number | null;
          flake_rate: number | null;
          id: string;
          metadata: Json | null;
          suite_test_id: string;
          threshold: number | null;
          triggered_at: string | null;
        };
        Insert: {
          alert_type: string;
          consecutive_count?: number | null;
          flake_rate?: number | null;
          id?: string;
          metadata?: Json | null;
          suite_test_id: string;
          threshold?: number | null;
          triggered_at?: string | null;
        };
        Update: {
          alert_type?: string;
          consecutive_count?: number | null;
          flake_rate?: number | null;
          id?: string;
          metadata?: Json | null;
          suite_test_id?: string;
          threshold?: number | null;
          triggered_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "flakiness_alerts_suite_test_id_fkey";
            columns: ["suite_test_id"];
            isOneToOne: false;
            referencedRelation: "suite_tests";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_projects: {
        Row: {
          created_at: string;
          id: string;
          organization_id: string;
          project_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          organization_id: string;
          project_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          organization_id?: string;
          project_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_projects_new_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_projects_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          active: boolean | null;
          created_at: string;
          description: string | null;
          display_name: string;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean | null;
          created_at?: string;
          description?: string | null;
          display_name: string;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean | null;
          created_at?: string;
          description?: string | null;
          display_name?: string;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      performance_alerts: {
        Row: {
          alert_type: string;
          baseline_duration: number | null;
          current_duration: number | null;
          deviation_percent: number | null;
          id: string;
          metadata: Json | null;
          suite_test_id: string;
          test_id: string | null;
          test_run_id: string | null;
          triggered_at: string | null;
        };
        Insert: {
          alert_type: string;
          baseline_duration?: number | null;
          current_duration?: number | null;
          deviation_percent?: number | null;
          id?: string;
          metadata?: Json | null;
          suite_test_id: string;
          test_id?: string | null;
          test_run_id?: string | null;
          triggered_at?: string | null;
        };
        Update: {
          alert_type?: string;
          baseline_duration?: number | null;
          current_duration?: number | null;
          deviation_percent?: number | null;
          id?: string;
          metadata?: Json | null;
          suite_test_id?: string;
          test_id?: string | null;
          test_run_id?: string | null;
          triggered_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "performance_alerts_suite_test_id_fkey";
            columns: ["suite_test_id"];
            isOneToOne: false;
            referencedRelation: "suite_tests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "performance_alerts_test_id_fkey";
            columns: ["test_id"];
            isOneToOne: false;
            referencedRelation: "tests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "performance_alerts_test_run_id_fkey";
            columns: ["test_run_id"];
            isOneToOne: false;
            referencedRelation: "test_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      projects: {
        Row: {
          active: boolean | null;
          color: string | null;
          created_at: string;
          description: string | null;
          display_name: string;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean | null;
          color?: string | null;
          created_at?: string;
          description?: string | null;
          display_name: string;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean | null;
          color?: string | null;
          created_at?: string;
          description?: string | null;
          display_name?: string;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      suite_tests: {
        Row: {
          created_at: string;
          file: string;
          id: string;
          name: string;
          project_id: string;
          suite_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          file: string;
          id?: string;
          name: string;
          project_id: string;
          suite_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          file?: string;
          id?: string;
          name?: string;
          project_id?: string;
          suite_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "suite_tests_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "suite_tests_suite_id_fkey";
            columns: ["suite_id"];
            isOneToOne: false;
            referencedRelation: "suites";
            referencedColumns: ["id"];
          },
        ];
      };
      suites: {
        Row: {
          active: boolean;
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          project_id: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          project_id: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          project_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "suites_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      test_flakiness_metrics: {
        Row: {
          avg_duration: number | null;
          created_at: string | null;
          date: string;
          failed_runs: number | null;
          flake_rate: number | null;
          flaky_runs: number | null;
          id: string;
          passed_runs: number | null;
          suite_test_id: string;
          total_runs: number | null;
          updated_at: string | null;
        };
        Insert: {
          avg_duration?: number | null;
          created_at?: string | null;
          date: string;
          failed_runs?: number | null;
          flake_rate?: number | null;
          flaky_runs?: number | null;
          id?: string;
          passed_runs?: number | null;
          suite_test_id: string;
          total_runs?: number | null;
          updated_at?: string | null;
        };
        Update: {
          avg_duration?: number | null;
          created_at?: string | null;
          date?: string;
          failed_runs?: number | null;
          flake_rate?: number | null;
          flaky_runs?: number | null;
          id?: string;
          passed_runs?: number | null;
          suite_test_id?: string;
          total_runs?: number | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "test_flakiness_metrics_suite_test_id_fkey";
            columns: ["suite_test_id"];
            isOneToOne: false;
            referencedRelation: "suite_tests";
            referencedColumns: ["id"];
          },
        ];
      };
      test_performance_metrics: {
        Row: {
          avg_duration: number | null;
          created_at: string | null;
          date: string;
          id: string;
          p50_duration: number | null;
          p90_duration: number | null;
          p95_duration: number | null;
          p99_duration: number | null;
          sample_size: number | null;
          std_deviation: number | null;
          suite_test_id: string;
          updated_at: string | null;
        };
        Insert: {
          avg_duration?: number | null;
          created_at?: string | null;
          date: string;
          id?: string;
          p50_duration?: number | null;
          p90_duration?: number | null;
          p95_duration?: number | null;
          p99_duration?: number | null;
          sample_size?: number | null;
          std_deviation?: number | null;
          suite_test_id: string;
          updated_at?: string | null;
        };
        Update: {
          avg_duration?: number | null;
          created_at?: string | null;
          date?: string;
          id?: string;
          p50_duration?: number | null;
          p90_duration?: number | null;
          p95_duration?: number | null;
          p99_duration?: number | null;
          sample_size?: number | null;
          std_deviation?: number | null;
          suite_test_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "test_performance_baselines_suite_test_id_fkey";
            columns: ["suite_test_id"];
            isOneToOne: false;
            referencedRelation: "suite_tests";
            referencedColumns: ["id"];
          },
        ];
      };
      test_results: {
        Row: {
          attachments: Json | null;
          created_at: string;
          duration: number;
          error: string | null;
          error_stack: string | null;
          id: string;
          last_failed_step: Json | null;
          retry_index: number;
          screenshots: Json | null;
          started_at: string | null;
          status: string;
          steps_url: string | null;
          test_id: string;
        };
        Insert: {
          attachments?: Json | null;
          created_at?: string;
          duration?: number;
          error?: string | null;
          error_stack?: string | null;
          id?: string;
          last_failed_step?: Json | null;
          retry_index?: number;
          screenshots?: Json | null;
          started_at?: string | null;
          status: string;
          steps_url?: string | null;
          test_id: string;
        };
        Update: {
          attachments?: Json | null;
          created_at?: string;
          duration?: number;
          error?: string | null;
          error_stack?: string | null;
          id?: string;
          last_failed_step?: Json | null;
          retry_index?: number;
          screenshots?: Json | null;
          started_at?: string | null;
          status?: string;
          steps_url?: string | null;
          test_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "test_results_test_id_fkey";
            columns: ["test_id"];
            isOneToOne: false;
            referencedRelation: "tests";
            referencedColumns: ["id"];
          },
        ];
      };
      test_runs: {
        Row: {
          branch: string;
          ci_metadata: Json | null;
          commit: string;
          content_hash: string | null;
          created_at: string;
          duration: number;
          environment_data: Json | null;
          environment_id: string;
          failed: number;
          flaky: number;
          id: string;
          passed: number;
          project_id: string;
          skipped: number;
          suite_id: string;
          timestamp: string;
          total: number;
          trigger_id: string;
          uploaded_filename: string | null;
          wall_clock_duration: number | null;
        };
        Insert: {
          branch: string;
          ci_metadata?: Json | null;
          commit: string;
          content_hash?: string | null;
          created_at?: string;
          duration?: number;
          environment_data?: Json | null;
          environment_id: string;
          failed?: number;
          flaky?: number;
          id?: string;
          passed?: number;
          project_id: string;
          skipped?: number;
          suite_id: string;
          timestamp?: string;
          total?: number;
          trigger_id: string;
          uploaded_filename?: string | null;
          wall_clock_duration?: number | null;
        };
        Update: {
          branch?: string;
          ci_metadata?: Json | null;
          commit?: string;
          content_hash?: string | null;
          created_at?: string;
          duration?: number;
          environment_data?: Json | null;
          environment_id?: string;
          failed?: number;
          flaky?: number;
          id?: string;
          passed?: number;
          project_id?: string;
          skipped?: number;
          suite_id?: string;
          timestamp?: string;
          total?: number;
          trigger_id?: string;
          uploaded_filename?: string | null;
          wall_clock_duration?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "test_runs_environment_id_fkey";
            columns: ["environment_id"];
            isOneToOne: false;
            referencedRelation: "environments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "test_runs_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "test_runs_suite_id_fkey";
            columns: ["suite_id"];
            isOneToOne: false;
            referencedRelation: "suites";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "test_runs_trigger_id_fkey";
            columns: ["trigger_id"];
            isOneToOne: false;
            referencedRelation: "test_triggers";
            referencedColumns: ["id"];
          },
        ];
      };
      test_triggers: {
        Row: {
          active: boolean | null;
          created_at: string;
          description: string | null;
          display_name: string;
          icon: string | null;
          id: string;
          name: string;
        };
        Insert: {
          active?: boolean | null;
          created_at?: string;
          description?: string | null;
          display_name: string;
          icon?: string | null;
          id?: string;
          name: string;
        };
        Update: {
          active?: boolean | null;
          created_at?: string;
          description?: string | null;
          display_name?: string;
          icon?: string | null;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      tests: {
        Row: {
          attempts: number | null;
          created_at: string;
          duration: number;
          error: string | null;
          id: string;
          metadata: Json | null;
          screenshots: Json | null;
          started_at: string | null;
          status: string;
          suite_test_id: string | null;
          test_run_id: string;
          worker_index: number | null;
        };
        Insert: {
          attempts?: number | null;
          created_at?: string;
          duration?: number;
          error?: string | null;
          id?: string;
          metadata?: Json | null;
          screenshots?: Json | null;
          started_at?: string | null;
          status: string;
          suite_test_id?: string | null;
          test_run_id: string;
          worker_index?: number | null;
        };
        Update: {
          attempts?: number | null;
          created_at?: string;
          duration?: number;
          error?: string | null;
          id?: string;
          metadata?: Json | null;
          screenshots?: Json | null;
          started_at?: string | null;
          status?: string;
          suite_test_id?: string | null;
          test_run_id?: string;
          worker_index?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "tests_suite_test_id_fkey";
            columns: ["suite_test_id"];
            isOneToOne: false;
            referencedRelation: "suite_tests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tests_test_run_id_fkey";
            columns: ["test_run_id"];
            isOneToOne: false;
            referencedRelation: "test_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      user_organizations: {
        Row: {
          created_at: string;
          id: string;
          organization_id: string;
          role: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          organization_id: string;
          role?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          organization_id?: string;
          role?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_organizations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      webhook_configurations: {
        Row: {
          created_at: string | null;
          created_by: string | null;
          enabled: boolean | null;
          id: string;
          name: string;
          organization_id: string | null;
          project_id: string | null;
          secret_key: string | null;
          updated_at: string | null;
          webhook_type: string;
          webhook_url: string;
        };
        Insert: {
          created_at?: string | null;
          created_by?: string | null;
          enabled?: boolean | null;
          id?: string;
          name: string;
          organization_id?: string | null;
          project_id?: string | null;
          secret_key?: string | null;
          updated_at?: string | null;
          webhook_type: string;
          webhook_url: string;
        };
        Update: {
          created_at?: string | null;
          created_by?: string | null;
          enabled?: boolean | null;
          id?: string;
          name?: string;
          organization_id?: string | null;
          project_id?: string | null;
          secret_key?: string | null;
          updated_at?: string | null;
          webhook_type?: string;
          webhook_url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "webhook_configurations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "webhook_configurations_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      webhook_deliveries: {
        Row: {
          attempt_count: number | null;
          created_at: string | null;
          delivered_at: string | null;
          error_message: string | null;
          id: string;
          max_attempts: number | null;
          next_retry_at: string | null;
          payload: Json;
          response_body: string | null;
          response_code: number | null;
          status: string | null;
          webhook_configuration_id: string | null;
          webhook_trigger_id: string | null;
        };
        Insert: {
          attempt_count?: number | null;
          created_at?: string | null;
          delivered_at?: string | null;
          error_message?: string | null;
          id?: string;
          max_attempts?: number | null;
          next_retry_at?: string | null;
          payload: Json;
          response_body?: string | null;
          response_code?: number | null;
          status?: string | null;
          webhook_configuration_id?: string | null;
          webhook_trigger_id?: string | null;
        };
        Update: {
          attempt_count?: number | null;
          created_at?: string | null;
          delivered_at?: string | null;
          error_message?: string | null;
          id?: string;
          max_attempts?: number | null;
          next_retry_at?: string | null;
          payload?: Json;
          response_body?: string | null;
          response_code?: number | null;
          status?: string | null;
          webhook_configuration_id?: string | null;
          webhook_trigger_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_webhook_configuration_id_fkey";
            columns: ["webhook_configuration_id"];
            isOneToOne: false;
            referencedRelation: "webhook_configurations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "webhook_deliveries_webhook_trigger_id_fkey";
            columns: ["webhook_trigger_id"];
            isOneToOne: false;
            referencedRelation: "webhook_triggers";
            referencedColumns: ["id"];
          },
        ];
      };
      webhook_triggers: {
        Row: {
          conditions: Json | null;
          created_at: string | null;
          id: string;
          trigger_type: string;
          webhook_id: string | null;
        };
        Insert: {
          conditions?: Json | null;
          created_at?: string | null;
          id?: string;
          trigger_type: string;
          webhook_id?: string | null;
        };
        Update: {
          conditions?: Json | null;
          created_at?: string | null;
          id?: string;
          trigger_type?: string;
          webhook_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "webhook_triggers_webhook_id_fkey";
            columns: ["webhook_id"];
            isOneToOne: false;
            referencedRelation: "webhook_configurations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      aggregate_test_metrics: {
        Args: {
          p_environment_id?: string;
          p_project_ids: string[];
          p_start_date: string;
          p_trigger_id?: string;
        };
        Returns: {
          failed: number;
          file: string;
          flaky: number;
          name: string;
          passed: number;
          recent_statuses: Json;
          skipped: number;
          suite_test_id: string;
          total_duration: number;
          total_runs: number;
        }[];
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

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
