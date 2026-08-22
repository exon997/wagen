export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
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
  public: {
    Tables: {
      categories: {
        Row: {
          created_at: string;
          display_order: number;
          id: string;
          is_active: boolean;
          kind: string;
          name: string;
          slug: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          display_order?: number;
          id?: string;
          is_active?: boolean;
          kind?: string;
          name: string;
          slug: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_order?: number;
          id?: string;
          is_active?: boolean;
          kind?: string;
          name?: string;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      category_attributes: {
        Row: {
          category_id: string;
          created_at: string;
          data_type: Database['public']['Enums']['attribute_type'];
          display_order: number;
          enum_values: Json | null;
          id: string;
          is_filterable: boolean;
          is_required: boolean;
          key: string;
          label: string;
          unit: string | null;
        };
        Insert: {
          category_id: string;
          created_at?: string;
          data_type: Database['public']['Enums']['attribute_type'];
          display_order?: number;
          enum_values?: Json | null;
          id?: string;
          is_filterable?: boolean;
          is_required?: boolean;
          key: string;
          label: string;
          unit?: string | null;
        };
        Update: {
          category_id?: string;
          created_at?: string;
          data_type?: Database['public']['Enums']['attribute_type'];
          display_order?: number;
          enum_values?: Json | null;
          id?: string;
          is_filterable?: boolean;
          is_required?: boolean;
          key?: string;
          label?: string;
          unit?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'category_attributes_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
        ];
      };
      contact_events: {
        Row: {
          channel: string;
          created_at: string;
          id: string;
          listing_id: string;
          user_id: string;
        };
        Insert: {
          channel: string;
          created_at?: string;
          id?: string;
          listing_id: string;
          user_id: string;
        };
        Update: {
          channel?: string;
          created_at?: string;
          id?: string;
          listing_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'contact_events_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
        ];
      };
      dealer_members: {
        Row: {
          created_at: string;
          dealer_id: string;
          role: Database['public']['Enums']['dealer_member_role'];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          dealer_id: string;
          role?: Database['public']['Enums']['dealer_member_role'];
          user_id: string;
        };
        Update: {
          created_at?: string;
          dealer_id?: string;
          role?: Database['public']['Enums']['dealer_member_role'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'dealer_members_dealer_id_fkey';
            columns: ['dealer_id'];
            isOneToOne: false;
            referencedRelation: 'dealers';
            referencedColumns: ['id'];
          },
        ];
      };
      dealers: {
        Row: {
          address: string | null;
          city: string | null;
          concierge_notes: string | null;
          contact_email: string | null;
          contact_phone: string | null;
          created_at: string;
          display_name: string;
          id: string;
          legal_name: string;
          market: string;
          status: Database['public']['Enums']['dealer_status'];
          tax_id: string;
          tier: Database['public']['Enums']['dealer_tier'];
          updated_at: string;
          website: string | null;
        };
        Insert: {
          address?: string | null;
          city?: string | null;
          concierge_notes?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          display_name: string;
          id?: string;
          legal_name: string;
          market?: string;
          status?: Database['public']['Enums']['dealer_status'];
          tax_id: string;
          tier?: Database['public']['Enums']['dealer_tier'];
          updated_at?: string;
          website?: string | null;
        };
        Update: {
          address?: string | null;
          city?: string | null;
          concierge_notes?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          display_name?: string;
          id?: string;
          legal_name?: string;
          market?: string;
          status?: Database['public']['Enums']['dealer_status'];
          tax_id?: string;
          tier?: Database['public']['Enums']['dealer_tier'];
          updated_at?: string;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'dealers_market_fkey';
            columns: ['market'];
            isOneToOne: false;
            referencedRelation: 'markets';
            referencedColumns: ['code'];
          },
        ];
      };
      documents: {
        Row: {
          created_at: string;
          id: string;
          soh_percent: number | null;
          storage_path: string;
          test_date: string | null;
          title: string;
          type: Database['public']['Enums']['document_type'];
          uploaded_by: string | null;
          vehicle_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          soh_percent?: number | null;
          storage_path: string;
          test_date?: string | null;
          title: string;
          type?: Database['public']['Enums']['document_type'];
          uploaded_by?: string | null;
          vehicle_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          soh_percent?: number | null;
          storage_path?: string;
          test_date?: string | null;
          title?: string;
          type?: Database['public']['Enums']['document_type'];
          uploaded_by?: string | null;
          vehicle_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'documents_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'vehicles';
            referencedColumns: ['id'];
          },
        ];
      };
      equipment_codes: {
        Row: {
          code: string;
          created_at: string;
          id: string;
          manufacturer: string;
          name_en: string | null;
          name_hr: string | null;
          translation_status: Database['public']['Enums']['translation_status'];
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          id?: string;
          manufacturer: string;
          name_en?: string | null;
          name_hr?: string | null;
          translation_status?: Database['public']['Enums']['translation_status'];
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          id?: string;
          manufacturer?: string;
          name_en?: string | null;
          name_hr?: string | null;
          translation_status?: Database['public']['Enums']['translation_status'];
          updated_at?: string;
        };
        Relationships: [];
      };
      garage_items: {
        Row: {
          listing_id: string;
          price_at_save: number | null;
          saved_at: string;
          user_id: string;
        };
        Insert: {
          listing_id: string;
          price_at_save?: number | null;
          saved_at?: string;
          user_id: string;
        };
        Update: {
          listing_id?: string;
          price_at_save?: number | null;
          saved_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'garage_items_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
        ];
      };
      invoices: {
        Row: {
          created_at: string;
          currency: string;
          dealer_id: string | null;
          fiscalization_status: Database['public']['Enums']['fiscalization_status'];
          id: string;
          issued_at: string | null;
          jir: string | null;
          line_items: Json;
          net_amount_cents: number;
          number: string | null;
          stripe_ref: string | null;
          total_amount_cents: number;
          user_id: string | null;
          vat_amount_cents: number;
          zki: string | null;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          dealer_id?: string | null;
          fiscalization_status?: Database['public']['Enums']['fiscalization_status'];
          id?: string;
          issued_at?: string | null;
          jir?: string | null;
          line_items?: Json;
          net_amount_cents: number;
          number?: string | null;
          stripe_ref?: string | null;
          total_amount_cents: number;
          user_id?: string | null;
          vat_amount_cents: number;
          zki?: string | null;
        };
        Update: {
          created_at?: string;
          currency?: string;
          dealer_id?: string | null;
          fiscalization_status?: Database['public']['Enums']['fiscalization_status'];
          id?: string;
          issued_at?: string | null;
          jir?: string | null;
          line_items?: Json;
          net_amount_cents?: number;
          number?: string | null;
          stripe_ref?: string | null;
          total_amount_cents?: number;
          user_id?: string | null;
          vat_amount_cents?: number;
          zki?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'invoices_dealer_id_fkey';
            columns: ['dealer_id'];
            isOneToOne: false;
            referencedRelation: 'dealers';
            referencedColumns: ['id'];
          },
        ];
      };
      listing_enrichment: {
        Row: {
          created_at: string;
          enriched_description: string | null;
          highlight_badge: Database['public']['Enums']['badge_type'] | null;
          listing_id: string;
          photo_order: string[] | null;
          top_until: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          enriched_description?: string | null;
          highlight_badge?: Database['public']['Enums']['badge_type'] | null;
          listing_id: string;
          photo_order?: string[] | null;
          top_until?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          enriched_description?: string | null;
          highlight_badge?: Database['public']['Enums']['badge_type'] | null;
          listing_id?: string;
          photo_order?: string[] | null;
          top_until?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'listing_enrichment_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: true;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
        ];
      };
      listing_photos: {
        Row: {
          angle_category: Database['public']['Enums']['photo_angle'] | null;
          created_at: string;
          id: string;
          listing_id: string;
          sort_order: number;
          storage_path: string;
        };
        Insert: {
          angle_category?: Database['public']['Enums']['photo_angle'] | null;
          created_at?: string;
          id?: string;
          listing_id: string;
          sort_order?: number;
          storage_path: string;
        };
        Update: {
          angle_category?: Database['public']['Enums']['photo_angle'] | null;
          created_at?: string;
          id?: string;
          listing_id?: string;
          sort_order?: number;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'listing_photos_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
        ];
      };
      listings: {
        Row: {
          attributes: Json;
          category_id: string;
          created_at: string;
          dealer_id: string | null;
          description: string | null;
          first_registration_year: number | null;
          id: string;
          location_city: string | null;
          market: string;
          mileage_km: number | null;
          price_current: number | null;
          published_at: string | null;
          slug: string | null;
          sold_at: string | null;
          sold_price: number | null;
          status: Database['public']['Enums']['listing_status'];
          updated_at: string;
          user_id: string | null;
          vat_deductible: boolean;
          vehicle_id: string;
        };
        Insert: {
          attributes?: Json;
          category_id: string;
          created_at?: string;
          dealer_id?: string | null;
          description?: string | null;
          first_registration_year?: number | null;
          id?: string;
          location_city?: string | null;
          market?: string;
          mileage_km?: number | null;
          price_current?: number | null;
          published_at?: string | null;
          slug?: string | null;
          sold_at?: string | null;
          sold_price?: number | null;
          status?: Database['public']['Enums']['listing_status'];
          updated_at?: string;
          user_id?: string | null;
          vat_deductible?: boolean;
          vehicle_id: string;
        };
        Update: {
          attributes?: Json;
          category_id?: string;
          created_at?: string;
          dealer_id?: string | null;
          description?: string | null;
          first_registration_year?: number | null;
          id?: string;
          location_city?: string | null;
          market?: string;
          mileage_km?: number | null;
          price_current?: number | null;
          published_at?: string | null;
          slug?: string | null;
          sold_at?: string | null;
          sold_price?: number | null;
          status?: Database['public']['Enums']['listing_status'];
          updated_at?: string;
          user_id?: string | null;
          vat_deductible?: boolean;
          vehicle_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'listings_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'listings_dealer_id_fkey';
            columns: ['dealer_id'];
            isOneToOne: false;
            referencedRelation: 'dealers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'listings_market_fkey';
            columns: ['market'];
            isOneToOne: false;
            referencedRelation: 'markets';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'listings_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'vehicles';
            referencedColumns: ['id'];
          },
        ];
      };
      markets: {
        Row: {
          code: string;
          created_at: string;
          name: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          name: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          name?: string;
        };
        Relationships: [];
      };
      moderation_flags: {
        Row: {
          created_at: string;
          details: Json | null;
          flag_type: Database['public']['Enums']['moderation_flag_type'];
          id: string;
          listing_id: string;
          note: string | null;
          reporter_user_id: string | null;
          source: Database['public']['Enums']['moderation_source'];
          status: Database['public']['Enums']['moderation_status'];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          details?: Json | null;
          flag_type: Database['public']['Enums']['moderation_flag_type'];
          id?: string;
          listing_id: string;
          note?: string | null;
          reporter_user_id?: string | null;
          source: Database['public']['Enums']['moderation_source'];
          status?: Database['public']['Enums']['moderation_status'];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          details?: Json | null;
          flag_type?: Database['public']['Enums']['moderation_flag_type'];
          id?: string;
          listing_id?: string;
          note?: string | null;
          reporter_user_id?: string | null;
          source?: Database['public']['Enums']['moderation_source'];
          status?: Database['public']['Enums']['moderation_status'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'moderation_flags_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
        ];
      };
      notifications: {
        Row: {
          created_at: string;
          id: string;
          listing_id: string | null;
          payload: Json;
          read_at: string | null;
          sent_at: string | null;
          type: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          listing_id?: string | null;
          payload?: Json;
          read_at?: string | null;
          sent_at?: string | null;
          type: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          listing_id?: string | null;
          payload?: Json;
          read_at?: string | null;
          sent_at?: string | null;
          type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
        ];
      };
      photo_session_photos: {
        Row: {
          angle_category: Database['public']['Enums']['photo_angle'] | null;
          created_at: string;
          id: string;
          session_id: string;
          sort_order: number;
          storage_path: string;
        };
        Insert: {
          angle_category?: Database['public']['Enums']['photo_angle'] | null;
          created_at?: string;
          id?: string;
          session_id: string;
          sort_order?: number;
          storage_path: string;
        };
        Update: {
          angle_category?: Database['public']['Enums']['photo_angle'] | null;
          created_at?: string;
          id?: string;
          session_id?: string;
          sort_order?: number;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'photo_session_photos_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'photo_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      photo_sessions: {
        Row: {
          attribution: Json | null;
          created_at: string;
          crosspost_consented: boolean;
          id: string;
          listing_id: string | null;
          mode: Database['public']['Enums']['session_mode'];
          status: Database['public']['Enums']['session_status'];
          updated_at: string;
          user_id: string;
          vehicle_id: string | null;
          vin: string | null;
        };
        Insert: {
          attribution?: Json | null;
          created_at?: string;
          crosspost_consented?: boolean;
          id?: string;
          listing_id?: string | null;
          mode: Database['public']['Enums']['session_mode'];
          status?: Database['public']['Enums']['session_status'];
          updated_at?: string;
          user_id: string;
          vehicle_id?: string | null;
          vin?: string | null;
        };
        Update: {
          attribution?: Json | null;
          created_at?: string;
          crosspost_consented?: boolean;
          id?: string;
          listing_id?: string | null;
          mode?: Database['public']['Enums']['session_mode'];
          status?: Database['public']['Enums']['session_status'];
          updated_at?: string;
          user_id?: string;
          vehicle_id?: string | null;
          vin?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'photo_sessions_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'photo_sessions_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'vehicles';
            referencedColumns: ['id'];
          },
        ];
      };
      plans: {
        Row: {
          active_listing_limit: number | null;
          autobrief_sync: boolean;
          code: string;
          created_at: string;
          dealer_tier: Database['public']['Enums']['dealer_tier'];
          id: string;
          is_active: boolean;
          market: string;
          monthly_price_cents: number;
          name: string;
          search_priority: number;
          seats: number | null;
          stripe_price_id: string | null;
          top_quota_monthly: number | null;
          updated_at: string;
        };
        Insert: {
          active_listing_limit?: number | null;
          autobrief_sync?: boolean;
          code: string;
          created_at?: string;
          dealer_tier: Database['public']['Enums']['dealer_tier'];
          id?: string;
          is_active?: boolean;
          market?: string;
          monthly_price_cents: number;
          name: string;
          search_priority?: number;
          seats?: number | null;
          stripe_price_id?: string | null;
          top_quota_monthly?: number | null;
          updated_at?: string;
        };
        Update: {
          active_listing_limit?: number | null;
          autobrief_sync?: boolean;
          code?: string;
          created_at?: string;
          dealer_tier?: Database['public']['Enums']['dealer_tier'];
          id?: string;
          is_active?: boolean;
          market?: string;
          monthly_price_cents?: number;
          name?: string;
          search_priority?: number;
          seats?: number | null;
          stripe_price_id?: string | null;
          top_quota_monthly?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'plans_market_fkey';
            columns: ['market'];
            isOneToOne: false;
            referencedRelation: 'markets';
            referencedColumns: ['code'];
          },
        ];
      };
      price_events: {
        Row: {
          created_at: string;
          id: string;
          listing_id: string;
          price: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          listing_id: string;
          price: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          listing_id?: string;
          price?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'price_events_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      reviews: {
        Row: {
          body: string | null;
          contact_event_id: string;
          created_at: string;
          dealer_id: string;
          id: string;
          rating: number;
          status: Database['public']['Enums']['review_status'];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          body?: string | null;
          contact_event_id: string;
          created_at?: string;
          dealer_id: string;
          id?: string;
          rating: number;
          status?: Database['public']['Enums']['review_status'];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          body?: string | null;
          contact_event_id?: string;
          created_at?: string;
          dealer_id?: string;
          id?: string;
          rating?: number;
          status?: Database['public']['Enums']['review_status'];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reviews_contact_event_id_fkey';
            columns: ['contact_event_id'];
            isOneToOne: false;
            referencedRelation: 'contact_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reviews_dealer_id_fkey';
            columns: ['dealer_id'];
            isOneToOne: false;
            referencedRelation: 'dealers';
            referencedColumns: ['id'];
          },
        ];
      };
      saved_searches: {
        Row: {
          created_at: string;
          filters: Json;
          id: string;
          market: string;
          name: string;
          notification_level: Database['public']['Enums']['notification_level'];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          filters: Json;
          id?: string;
          market?: string;
          name: string;
          notification_level?: Database['public']['Enums']['notification_level'];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          filters?: Json;
          id?: string;
          market?: string;
          name?: string;
          notification_level?: Database['public']['Enums']['notification_level'];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'saved_searches_market_fkey';
            columns: ['market'];
            isOneToOne: false;
            referencedRelation: 'markets';
            referencedColumns: ['code'];
          },
        ];
      };
      subscriptions: {
        Row: {
          created_at: string;
          current_period_end: string | null;
          dealer_id: string;
          id: string;
          plan_id: string;
          status: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          trial_ends_at: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          current_period_end?: string | null;
          dealer_id: string;
          id?: string;
          plan_id: string;
          status: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          trial_ends_at?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          current_period_end?: string | null;
          dealer_id?: string;
          id?: string;
          plan_id?: string;
          status?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          trial_ends_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'subscriptions_dealer_id_fkey';
            columns: ['dealer_id'];
            isOneToOne: false;
            referencedRelation: 'dealers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'subscriptions_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'plans';
            referencedColumns: ['id'];
          },
        ];
      };
      vehicle_equipment: {
        Row: {
          created_at: string;
          equipment_code_id: string;
          is_highlighted: boolean;
          vehicle_id: string;
        };
        Insert: {
          created_at?: string;
          equipment_code_id: string;
          is_highlighted?: boolean;
          vehicle_id: string;
        };
        Update: {
          created_at?: string;
          equipment_code_id?: string;
          is_highlighted?: boolean;
          vehicle_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vehicle_equipment_equipment_code_id_fkey';
            columns: ['equipment_code_id'];
            isOneToOne: false;
            referencedRelation: 'equipment_codes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vehicle_equipment_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'vehicles';
            referencedColumns: ['id'];
          },
        ];
      };
      vehicles: {
        Row: {
          created_at: string;
          engine_label: string | null;
          id: string;
          make: string;
          model: string;
          model_year: number | null;
          outvin_data: Json | null;
          outvin_fetched_at: string | null;
          trim: string | null;
          updated_at: string;
          vin: string | null;
          vin_decoded_source: Database['public']['Enums']['vin_source'] | null;
        };
        Insert: {
          created_at?: string;
          engine_label?: string | null;
          id?: string;
          make: string;
          model: string;
          model_year?: number | null;
          outvin_data?: Json | null;
          outvin_fetched_at?: string | null;
          trim?: string | null;
          updated_at?: string;
          vin?: string | null;
          vin_decoded_source?: Database['public']['Enums']['vin_source'] | null;
        };
        Update: {
          created_at?: string;
          engine_label?: string | null;
          id?: string;
          make?: string;
          model?: string;
          model_year?: number | null;
          outvin_data?: Json | null;
          outvin_fetched_at?: string | null;
          trim?: string | null;
          updated_at?: string;
          vin?: string | null;
          vin_decoded_source?: Database['public']['Enums']['vin_source'] | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      can_view_listing: { Args: { l_id: string }; Returns: boolean };
      can_view_vehicle: { Args: { v_id: string }; Returns: boolean };
      is_admin: { Args: never; Returns: boolean };
      is_dealer_member: { Args: { d: string }; Returns: boolean };
      is_dealer_owner: { Args: { d: string }; Returns: boolean };
      owns_listing: { Args: { l_id: string }; Returns: boolean };
      owns_vehicle_via_listing: { Args: { v_id: string }; Returns: boolean };
      request_market: { Args: never; Returns: string };
      review_contact_valid: {
        Args: { ce_id: string; d_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      attribute_type: 'text' | 'number' | 'boolean' | 'enum';
      badge_type:
        | 'sport_paket'
        | 'prvi_vlasnik'
        | 'kupljen_u_hrvatskoj'
        | 'uvoz_njemacka'
        | 'uvoz_svicarska'
        | 'potpuna_servisna'
        | 'malo_kilometara'
        | 'harman_kardon'
        | 'bang_olufsen'
        | 'burmester'
        | 'nove_gume'
        | 'zimski_set';
      dealer_member_role: 'owner' | 'member';
      dealer_status: 'pending' | 'active' | 'suspended';
      dealer_tier: 'verified' | 'verified_plus' | 'top';
      document_type: 'generic' | 'aviloo_certificate';
      fiscalization_status: 'pending' | 'fiscalized' | 'failed' | 'not_required';
      listing_status: 'draft' | 'pending' | 'active' | 'sold' | 'removed';
      moderation_flag_type:
        | 'duplicate_listing'
        | 'repeated_repost'
        | 'inappropriate_photos'
        | 'multi_vehicle'
        | 'phantom_vehicle'
        | 'price_outlier'
        | 'other';
      moderation_source: 'ai_instant' | 'ai_sweep' | 'manual' | 'user_report';
      moderation_status: 'open' | 'resolved' | 'dismissed';
      notification_level: 'instant' | 'daily' | 'weekly';
      photo_angle: 'exterior' | 'interior' | 'detail';
      review_status: 'published' | 'flagged' | 'removed';
      session_mode: 'photo' | 'listing';
      session_status: 'in_progress' | 'completed' | 'abandoned';
      translation_status: 'untranslated' | 'machine_translated' | 'approved';
      vin_source: 'outvin' | 'iso_fallback' | 'manual';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      attribute_type: ['text', 'number', 'boolean', 'enum'],
      badge_type: [
        'sport_paket',
        'prvi_vlasnik',
        'kupljen_u_hrvatskoj',
        'uvoz_njemacka',
        'uvoz_svicarska',
        'potpuna_servisna',
        'malo_kilometara',
        'harman_kardon',
        'bang_olufsen',
        'burmester',
        'nove_gume',
        'zimski_set',
      ],
      dealer_member_role: ['owner', 'member'],
      dealer_status: ['pending', 'active', 'suspended'],
      dealer_tier: ['verified', 'verified_plus', 'top'],
      document_type: ['generic', 'aviloo_certificate'],
      fiscalization_status: ['pending', 'fiscalized', 'failed', 'not_required'],
      listing_status: ['draft', 'pending', 'active', 'sold', 'removed'],
      moderation_flag_type: [
        'duplicate_listing',
        'repeated_repost',
        'inappropriate_photos',
        'multi_vehicle',
        'phantom_vehicle',
        'price_outlier',
        'other',
      ],
      moderation_source: ['ai_instant', 'ai_sweep', 'manual', 'user_report'],
      moderation_status: ['open', 'resolved', 'dismissed'],
      notification_level: ['instant', 'daily', 'weekly'],
      photo_angle: ['exterior', 'interior', 'detail'],
      review_status: ['published', 'flagged', 'removed'],
      session_mode: ['photo', 'listing'],
      session_status: ['in_progress', 'completed', 'abandoned'],
      translation_status: ['untranslated', 'machine_translated', 'approved'],
      vin_source: ['outvin', 'iso_fallback', 'manual'],
    },
  },
} as const;
