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
      courts: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          color: string
          created_at?: string
          id: string
          name: string
          sort_order?: number
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      game_events: {
        Row: {
          court_id: string
          created_at: string
          event_type: string
          game_clock_seconds: number | null
          id: string
          note: string | null
          player_id: string | null
          player_name: string | null
          player_number: string | null
          points: number
          quarter: number
          team_id: string | null
          team_side: string
        }
        Insert: {
          court_id: string
          created_at?: string
          event_type: string
          game_clock_seconds?: number | null
          id?: string
          note?: string | null
          player_id?: string | null
          player_name?: string | null
          player_number?: string | null
          points?: number
          quarter?: number
          team_id?: string | null
          team_side: string
        }
        Update: {
          court_id?: string
          created_at?: string
          event_type?: string
          game_clock_seconds?: number | null
          id?: string
          note?: string | null
          player_id?: string | null
          player_name?: string | null
          player_number?: string | null
          points?: number
          quarter?: number
          team_id?: string | null
          team_side?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_events_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      game_state: {
        Row: {
          away_abbr: string
          away_color: string
          away_fouls: number
          away_logo: string | null
          away_name: string
          away_on_court: string[]
          away_score: number
          away_team_id: string | null
          away_timeouts: number
          buzzer_pulse: number
          court_id: string
          display_style_1: string
          display_style_2: string
          game_clock_running: boolean
          game_clock_seconds: number
          game_clock_started_at: string | null
          home_abbr: string
          home_color: string
          home_fouls: number
          home_logo: string | null
          home_name: string
          home_on_court: string[]
          home_score: number
          home_team_id: string | null
          home_timeouts: number
          mode: string
          quarter: number
          quarter_length_seconds: number
          shot_clock_running: boolean
          shot_clock_started_at: string | null
          shot_clock_tenths: number
          three_pulse_away: number
          three_pulse_home: number
          timer_style: string
          tournament_name: string
          updated_at: string
        }
        Insert: {
          away_abbr?: string
          away_color?: string
          away_fouls?: number
          away_logo?: string | null
          away_name?: string
          away_on_court?: string[]
          away_score?: number
          away_team_id?: string | null
          away_timeouts?: number
          buzzer_pulse?: number
          court_id: string
          display_style_1?: string
          display_style_2?: string
          game_clock_running?: boolean
          game_clock_seconds?: number
          game_clock_started_at?: string | null
          home_abbr?: string
          home_color?: string
          home_fouls?: number
          home_logo?: string | null
          home_name?: string
          home_on_court?: string[]
          home_score?: number
          home_team_id?: string | null
          home_timeouts?: number
          mode?: string
          quarter?: number
          quarter_length_seconds?: number
          shot_clock_running?: boolean
          shot_clock_started_at?: string | null
          shot_clock_tenths?: number
          three_pulse_away?: number
          three_pulse_home?: number
          timer_style?: string
          tournament_name?: string
          updated_at?: string
        }
        Update: {
          away_abbr?: string
          away_color?: string
          away_fouls?: number
          away_logo?: string | null
          away_name?: string
          away_on_court?: string[]
          away_score?: number
          away_team_id?: string | null
          away_timeouts?: number
          buzzer_pulse?: number
          court_id?: string
          display_style_1?: string
          display_style_2?: string
          game_clock_running?: boolean
          game_clock_seconds?: number
          game_clock_started_at?: string | null
          home_abbr?: string
          home_color?: string
          home_fouls?: number
          home_logo?: string | null
          home_name?: string
          home_on_court?: string[]
          home_score?: number
          home_team_id?: string | null
          home_timeouts?: number
          mode?: string
          quarter?: number
          quarter_length_seconds?: number
          shot_clock_running?: boolean
          shot_clock_started_at?: string | null
          shot_clock_tenths?: number
          three_pulse_away?: number
          three_pulse_home?: number
          timer_style?: string
          tournament_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_state_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_state_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: true
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_state_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          created_at: string
          description: string | null
          height: string | null
          id: string
          jersey_number: string
          name: string
          photo_url: string | null
          position: string | null
          team_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          height?: string | null
          id?: string
          jersey_number?: string
          name: string
          photo_url?: string | null
          position?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          height?: string | null
          id?: string
          jersey_number?: string
          name?: string
          photo_url?: string | null
          position?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          abbreviation: string
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          name: string
          photo_url: string | null
          primary_color: string
          updated_at: string
        }
        Insert: {
          abbreviation?: string
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          photo_url?: string | null
          primary_color?: string
          updated_at?: string
        }
        Update: {
          abbreviation?: string
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          photo_url?: string | null
          primary_color?: string
          updated_at?: string
        }
        Relationships: []
      }
      tournament_teams: {
        Row: {
          created_at: string
          team_id: string
          tournament_id: string
        }
        Insert: {
          created_at?: string
          team_id: string
          tournament_id: string
        }
        Update: {
          created_at?: string
          team_id?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_teams_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          logo_url: string | null
          name: string
          start_date: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          logo_url?: string | null
          name: string
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          start_date?: string | null
          updated_at?: string
        }
        Relationships: []
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
