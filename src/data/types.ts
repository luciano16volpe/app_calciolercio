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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      albo: {
        Row: {
          league_id: string
          rows: Json
          season_key: string
          status: string
          updated_at: string
        }
        Insert: {
          league_id: string
          rows?: Json
          season_key: string
          status?: string
          updated_at?: string
        }
        Update: {
          league_id?: string
          rows?: Json
          season_key?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "albo_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          value: Json
        }
        Insert: {
          key: string
          value: Json
        }
        Update: {
          key?: string
          value?: Json
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          at: string
          changes: Json | null
          entity: string
          entity_id: string | null
          entity_label: string | null
          grp: string
          id: number
          ip: unknown
          league_id: string | null
          league_name: string | null
          source: string
          tx: number
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          at?: string
          changes?: Json | null
          entity: string
          entity_id?: string | null
          entity_label?: string | null
          grp: string
          id?: number
          ip?: unknown
          league_id?: string | null
          league_name?: string | null
          source?: string
          tx?: number
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          at?: string
          changes?: Json | null
          entity?: string
          entity_id?: string | null
          entity_label?: string | null
          grp?: string
          id?: number
          ip?: unknown
          league_id?: string | null
          league_name?: string | null
          source?: string
          tx?: number
          user_agent?: string | null
        }
        Relationships: []
      }
      gazzette: {
        Row: {
          file_path: string
          match_id: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          file_path: string
          match_id: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          file_path?: string
          match_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gazzette_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      league_admin_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          league_id: string
          requested_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          league_id: string
          requested_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          league_id?: string
          requested_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_admin_requests_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      league_members: {
        Row: {
          joined_at: string
          league_id: string
          role: Database["public"]["Enums"]["league_role"]
          user_id: string
        }
        Insert: {
          joined_at?: string
          league_id: string
          role?: Database["public"]["Enums"]["league_role"]
          user_id: string
        }
        Update: {
          joined_at?: string
          league_id?: string
          role?: Database["public"]["Enums"]["league_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_members_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      league_players: {
        Row: {
          aliases: string[]
          archived: boolean
          joined_at: string
          league_id: string
          nickname: string | null
          player_id: string
        }
        Insert: {
          aliases?: string[]
          archived?: boolean
          joined_at?: string
          league_id: string
          nickname?: string | null
          player_id: string
        }
        Update: {
          aliases?: string[]
          archived?: boolean
          joined_at?: string
          league_id?: string
          nickname?: string | null
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_players_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          invite_code: string
          is_public: boolean
          name: string
          owner_id: string | null
          settings: Json
          slug: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          invite_code?: string
          is_public?: boolean
          name: string
          owner_id?: string | null
          settings?: Json
          slug?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          invite_code?: string
          is_public?: boolean
          name?: string
          owner_id?: string | null
          settings?: Json
          slug?: string
        }
        Relationships: []
      }
      match_players: {
        Row: {
          assist: number
          autogol: number
          descrizione: string | null
          goals: number
          match_id: string
          meta: number
          player_id: string
          position: number
          rating: number | null
          rigori_sbagliati: number
          team: string
          titolo: string | null
        }
        Insert: {
          assist?: number
          autogol?: number
          descrizione?: string | null
          goals?: number
          match_id: string
          meta?: number
          player_id: string
          position?: number
          rating?: number | null
          rigori_sbagliati?: number
          team: string
          titolo?: string | null
        }
        Update: {
          assist?: number
          autogol?: number
          descrizione?: string | null
          goals?: number
          match_id?: string
          meta?: number
          player_id?: string
          position?: number
          rating?: number | null
          rigori_sbagliati?: number
          team?: string
          titolo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_players_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          id: string
          league_id: string
          legacy_id: string | null
          notes: string | null
          pred: number | null
          pred_rank: number | null
          score_a: number | null
          score_b: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date: string
          id?: string
          league_id: string
          legacy_id?: string | null
          notes?: string | null
          pred?: number | null
          pred_rank?: number | null
          score_a?: number | null
          score_b?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          league_id?: string
          legacy_id?: string | null
          notes?: string | null
          pred?: number | null
          pred_rank?: number | null
          score_a?: number | null
          score_b?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          user_id: string
        }
        Insert: {
          user_id: string
        }
        Update: {
          user_id?: string
        }
        Relationships: []
      }
      player_claims: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          league_id: string
          player_id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          league_id: string
          player_id: string
          status?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          league_id?: string
          player_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_claims_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_claims_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_invites: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          league_id: string
          player_id: string
          revoked: boolean
          token: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          league_id: string
          player_id: string
          revoked?: boolean
          token?: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          league_id?: string
          player_id?: string
          revoked?: boolean
          token?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_invites_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_invites_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_stats_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: number
          new_roles: string[] | null
          new_stats: number[] | null
          old_roles: string[] | null
          old_stats: number[] | null
          player_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: number
          new_roles?: string[] | null
          new_stats?: number[] | null
          old_roles?: string[] | null
          old_stats?: number[] | null
          player_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: number
          new_roles?: string[] | null
          new_stats?: number[] | null
          old_roles?: string[] | null
          old_stats?: number[] | null
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_stats_history_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          legacy_id: string | null
          name: string
          photo_path: string | null
          roles: string[]
          stats: number[]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          legacy_id?: string | null
          name: string
          photo_path?: string | null
          roles?: string[]
          stats?: number[]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          legacy_id?: string | null
          name?: string
          photo_path?: string | null
          roles?: string[]
          stats?: number[]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_player_invite: {
        Args: { tok: string }
        Returns: {
          league_id: string
          league_name: string
          league_slug: string
          player_id: string
          player_name: string
        }[]
      }
      admin_assign_owner: {
        Args: { l: string; new_owner: string }
        Returns: undefined
      }
      admin_league_admins: {
        Args: { l: string }
        Returns: {
          name: string
          user_id: string
        }[]
      }
      admin_list_leagues: {
        Args: never
        Returns: {
          admins: string
          created_at: string
          id: string
          is_public: boolean
          last_activity: string
          matches: number
          members: number
          name: string
          owner_missing: boolean
          owner_name: string
          slug: string
        }[]
      }
      admin_list_users: {
        Args: never
        Returns: {
          created_at: string
          display_name: string
          email: string
          id: string
          last_sign_in_at: string
          leagues: string
        }[]
      }
      admin_requests_list: {
        Args: { l: string }
        Returns: {
          created_at: string
          display_name: string
          email: string
          id: string
          requested_by_name: string
          user_id: string
        }[]
      }
      audit_anonymize_user: { Args: { uid: string }; Returns: undefined }
      audit_cleanup: { Args: never; Returns: undefined }
      audit_ctx: { Args: never; Returns: Record<string, unknown> }
      audit_diff: {
        Args: { ignore: string[]; n: Json; o: Json }
        Returns: Json
      }
      audit_event: {
        Args: {
          p_action: string
          p_actor?: string
          p_changes: Json
          p_entity: string
          p_entity_id: string
          p_grp: string
          p_label: string
          p_league: string
        }
        Returns: undefined
      }
      audit_match_label: { Args: { mid: string }; Returns: string }
      audit_player_name: { Args: { pid: string }; Returns: string }
      audit_user_name: { Args: { uid: string }; Returns: string }
      can_edit_player: { Args: { p: string }; Returns: boolean }
      cancel_admin_request: { Args: { c: string }; Returns: undefined }
      claims_pending: {
        Args: { l: string }
        Returns: {
          created_at: string
          display_name: string
          email: string
          id: string
          player_id: string
          player_name: string
          user_id: string
        }[]
      }
      create_player_invite: { Args: { l: string; p: string }; Returns: string }
      decide_admin_request: {
        Args: { approve: boolean; c: string }
        Returns: undefined
      }
      delete_my_account: { Args: never; Returns: undefined }
      has_league_role: {
        Args: { l: string; r: Database["public"]["Enums"]["league_role"][] }
        Returns: boolean
      }
      invite_preview: {
        Args: { tok: string }
        Returns: {
          league_name: string
          player_name: string
          status: string
        }[]
      }
      is_any_admin: { Args: never; Returns: boolean }
      is_league_admin: { Args: { l: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      join_league: { Args: { code: string }; Returns: string }
      league_member_list: {
        Args: { l: string }
        Returns: {
          admin_request_id: string
          display_name: string
          email: string
          is_owner: boolean
          joined_at: string
          role: Database["public"]["Enums"]["league_role"]
          user_id: string
        }[]
      }
      league_players_status: {
        Args: { l: string }
        Returns: {
          invite_created: string
          invite_expires: string
          invite_token: string
          linked: boolean
          linked_name: string
          name: string
          player_id: string
        }[]
      }
      league_visible: { Args: { l: string }; Returns: boolean }
      log_event: {
        Args: { p_action: string; p_email?: string }
        Returns: undefined
      }
      match_league: { Args: { m: string }; Returns: string }
      merge_players: {
        Args: { drop_id: string; keep: string }
        Returns: undefined
      }
      player_history: {
        Args: { p: string }
        Returns: {
          changed_at: string
          changed_by_name: string
          new_roles: string[]
          new_stats: number[]
          old_roles: string[]
          old_stats: number[]
        }[]
      }
      player_visible: { Args: { p: string }; Returns: boolean }
      players_unclaimed: {
        Args: { l: string }
        Returns: {
          name: string
          player_id: string
        }[]
      }
      propose_admin: { Args: { l: string; u: string }; Returns: string }
      regenerate_invite_code: { Args: { l: string }; Returns: string }
      remove_member: { Args: { l: string; u: string }; Returns: undefined }
      request_claim: { Args: { l: string; p: string }; Returns: undefined }
      review_claim: {
        Args: { approve: boolean; c: string }
        Returns: undefined
      }
      set_member_role: {
        Args: {
          l: string
          r: Database["public"]["Enums"]["league_role"]
          u: string
        }
        Returns: undefined
      }
      slugify: { Args: { t: string }; Returns: string }
      transfer_league_ownership: {
        Args: { l: string; new_owner: string }
        Returns: undefined
      }
      unique_league_slug: {
        Args: { base: string; except_id?: string }
        Returns: string
      }
      unlink_me: { Args: never; Returns: undefined }
      unlink_player: { Args: { p: string }; Returns: undefined }
    }
    Enums: {
      league_role: "admin" | "redazione" | "member"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      league_role: ["admin", "redazione", "member"],
    },
  },
} as const
