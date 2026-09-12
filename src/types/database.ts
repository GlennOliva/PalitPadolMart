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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_actions: {
        Row: {
          action_type: string
          admin_id: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
        }
        Insert: {
          action_type: string
          admin_id: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
        }
        Update: {
          action_type?: string
          admin_id?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: unknown
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
        }
        Relationships: []
      }
      brands: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          cart_id: string
          created_at: string
          id: string
          listing_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          cart_id: string
          created_at?: string
          id?: string
          listing_id: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          cart_id?: string
          created_at?: string
          id?: string
          listing_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          buyer_id: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      dispute_events: {
        Row: {
          actor_id: string
          created_at: string
          details: Json | null
          dispute_id: string
          event_type: string
          from_status: Database["public"]["Enums"]["dispute_status"] | null
          id: string
          to_status: Database["public"]["Enums"]["dispute_status"]
        }
        Insert: {
          actor_id: string
          created_at?: string
          details?: Json | null
          dispute_id: string
          event_type: string
          from_status?: Database["public"]["Enums"]["dispute_status"] | null
          id?: string
          to_status: Database["public"]["Enums"]["dispute_status"]
        }
        Update: {
          actor_id?: string
          created_at?: string
          details?: Json | null
          dispute_id?: string
          event_type?: string
          from_status?: Database["public"]["Enums"]["dispute_status"] | null
          id?: string
          to_status?: Database["public"]["Enums"]["dispute_status"]
        }
        Relationships: [
          {
            foreignKeyName: "dispute_events_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_evidence: {
        Row: {
          created_at: string
          dispute_id: string
          id: string
          mime_type: string | null
          original_filename: string | null
          size_bytes: number | null
          storage_path: string | null
          uploader_id: string
          url: string | null
        }
        Insert: {
          created_at?: string
          dispute_id: string
          id?: string
          mime_type?: string | null
          original_filename?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          uploader_id: string
          url?: string | null
        }
        Update: {
          created_at?: string
          dispute_id?: string
          id?: string
          mime_type?: string | null
          original_filename?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          uploader_id?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispute_evidence_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_messages: {
        Row: {
          created_at: string
          dispute_id: string
          id: string
          message: string
          sender_id: string
        }
        Insert: {
          created_at?: string
          dispute_id: string
          id?: string
          message: string
          sender_id: string
        }
        Update: {
          created_at?: string
          dispute_id?: string
          id?: string
          message?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispute_messages_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          assigned_admin_id: string | null
          buyer_id: string
          created_at: string
          description: string | null
          id: string
          opened_by: string
          order_id: string
          reason: string
          resolution: string | null
          resolved_at: string | null
          seller_id: string
          status: Database["public"]["Enums"]["dispute_status"]
          updated_at: string
        }
        Insert: {
          assigned_admin_id?: string | null
          buyer_id: string
          created_at?: string
          description?: string | null
          id?: string
          opened_by: string
          order_id: string
          reason: string
          resolution?: string | null
          resolved_at?: string | null
          seller_id: string
          status?: Database["public"]["Enums"]["dispute_status"]
          updated_at?: string
        }
        Update: {
          assigned_admin_id?: string | null
          buyer_id?: string
          created_at?: string
          description?: string | null
          id?: string
          opened_by?: string
          order_id?: string
          reason?: string
          resolution?: string | null
          resolved_at?: string | null
          seller_id?: string
          status?: Database["public"]["Enums"]["dispute_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "public_seller_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          listing_title: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          listing_title?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          listing_title?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      fulfillment_details: {
        Row: {
          address: string | null
          city: string | null
          courier: string | null
          created_at: string
          fulfillment_type: Database["public"]["Enums"]["fulfillment_type"]
          id: string
          notes: string | null
          order_id: string
          phone: string | null
          pickup_instructions: string | null
          pickup_location: string | null
          postal_code: string | null
          province: string | null
          recipient_name: string | null
          scheduled_date: string | null
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          courier?: string | null
          created_at?: string
          fulfillment_type: Database["public"]["Enums"]["fulfillment_type"]
          id?: string
          notes?: string | null
          order_id: string
          phone?: string | null
          pickup_instructions?: string | null
          pickup_location?: string | null
          postal_code?: string | null
          province?: string | null
          recipient_name?: string | null
          scheduled_date?: string | null
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          courier?: string | null
          created_at?: string
          fulfillment_type?: Database["public"]["Enums"]["fulfillment_type"]
          id?: string
          notes?: string | null
          order_id?: string
          phone?: string | null
          pickup_instructions?: string | null
          pickup_location?: string | null
          postal_code?: string | null
          province?: string | null
          recipient_name?: string | null
          scheduled_date?: string | null
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fulfillment_details_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiries: {
        Row: {
          buyer_id: string
          created_at: string
          id: string
          listing_id: string
          listing_title: string | null
          message: string
          seller_id: string
          status: Database["public"]["Enums"]["inquiry_status"]
          subject: string
          updated_at: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          id?: string
          listing_id: string
          listing_title?: string | null
          message: string
          seller_id: string
          status?: Database["public"]["Enums"]["inquiry_status"]
          subject: string
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          id?: string
          listing_id?: string
          listing_title?: string | null
          message?: string
          seller_id?: string
          status?: Database["public"]["Enums"]["inquiry_status"]
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiries_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "public_seller_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_messages: {
        Row: {
          created_at: string
          id: string
          inquiry_id: string
          is_read: boolean
          message: string
          sender_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          inquiry_id: string
          is_read?: boolean
          message: string
          sender_id: string
        }
        Update: {
          created_at?: string
          id?: string
          inquiry_id?: string
          is_read?: boolean
          message?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_messages_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_images: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          listing_id: string
          sort_order: number
          storage_path: string | null
          url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          listing_id: string
          sort_order?: number
          storage_path?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          listing_id?: string
          sort_order?: number
          storage_path?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_images_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_reports: {
        Row: {
          assigned_admin_id: string | null
          created_at: string
          description: string | null
          id: string
          listing_id: string
          reason: string
          reporter_id: string | null
          resolution: string | null
          resolved_at: string | null
          seller_id: string
          status: Database["public"]["Enums"]["report_status"]
          updated_at: string
        }
        Insert: {
          assigned_admin_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          listing_id: string
          reason: string
          reporter_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          seller_id: string
          status?: Database["public"]["Enums"]["report_status"]
          updated_at?: string
        }
        Update: {
          assigned_admin_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          listing_id?: string
          reason?: string
          reporter_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          seller_id?: string
          status?: Database["public"]["Enums"]["report_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_reports_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_reports_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "public_seller_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_reports_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_views: {
        Row: {
          id: string
          listing_id: string
          viewed_at: string
          viewer_id: string | null
        }
        Insert: {
          id?: string
          listing_id: string
          viewed_at?: string
          viewer_id?: string | null
        }
        Update: {
          id?: string
          listing_id?: string
          viewed_at?: string
          viewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_views_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          brand_id: string | null
          category_id: string
          city: string | null
          created_at: string
          delivery_available: boolean
          description: string
          id: string
          listing_condition: Database["public"]["Enums"]["listing_condition"]
          listing_status: Database["public"]["Enums"]["listing_status"]
          pickup_available: boolean
          price: number
          province: string | null
          quantity: number
          seller_id: string
          title: string
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          category_id: string
          city?: string | null
          created_at?: string
          delivery_available?: boolean
          description: string
          id?: string
          listing_condition: Database["public"]["Enums"]["listing_condition"]
          listing_status?: Database["public"]["Enums"]["listing_status"]
          pickup_available?: boolean
          price: number
          province?: string | null
          quantity?: number
          seller_id: string
          title: string
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          category_id?: string
          city?: string | null
          created_at?: string
          delivery_available?: boolean
          description?: string
          id?: string
          listing_condition?: Database["public"]["Enums"]["listing_condition"]
          listing_status?: Database["public"]["Enums"]["listing_status"]
          pickup_available?: boolean
          price?: number
          province?: string | null
          quantity?: number
          seller_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "public_seller_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string | null
          recipient_id: string
          related_entity_id: string | null
          related_entity_type: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          recipient_id: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          recipient_id?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          order_id: string
          product_title: string
          quantity: number
          seller_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          order_id: string
          product_title: string
          quantity: number
          seller_id: string
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          order_id?: string
          product_title?: string
          quantity?: number
          seller_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "public_seller_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          buyer_id: string
          cancelled_at: string | null
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          fulfillment_type: Database["public"]["Enums"]["fulfillment_type"]
          id: string
          notes: string | null
          order_number: string
          paid_at: string | null
          preparing_at: string | null
          ready_for_pickup_at: string | null
          seller_id: string
          shipped_at: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          buyer_id: string
          cancelled_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          fulfillment_type: Database["public"]["Enums"]["fulfillment_type"]
          id?: string
          notes?: string | null
          order_number: string
          paid_at?: string | null
          preparing_at?: string | null
          ready_for_pickup_at?: string | null
          seller_id: string
          shipped_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          cancelled_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          fulfillment_type?: Database["public"]["Enums"]["fulfillment_type"]
          id?: string
          notes?: string | null
          order_number?: string
          paid_at?: string | null
          preparing_at?: string | null
          ready_for_pickup_at?: string | null
          seller_id?: string
          shipped_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "public_seller_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      paddle_attributes: {
        Row: {
          control_score: number | null
          created_at: string
          id: string
          listing_id: string
          playing_style: string | null
          power_score: number | null
          skill_level: string | null
          updated_at: string
          weight_class: string | null
          weight_grams: number | null
        }
        Insert: {
          control_score?: number | null
          created_at?: string
          id?: string
          listing_id: string
          playing_style?: string | null
          power_score?: number | null
          skill_level?: string | null
          updated_at?: string
          weight_class?: string | null
          weight_grams?: number | null
        }
        Update: {
          control_score?: number | null
          created_at?: string
          id?: string
          listing_id?: string
          playing_style?: string | null
          power_score?: number | null
          skill_level?: string | null
          updated_at?: string
          weight_class?: string | null
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "paddle_attributes_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          order_id: string
          paid_at: string | null
          payment_method: string
          payment_reference: string | null
          proof_path: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          order_id: string
          paid_at?: string | null
          payment_method: string
          payment_reference?: string | null
          proof_path?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          order_id?: string
          paid_at?: string | null
          payment_method?: string
          payment_reference?: string | null
          proof_path?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_status: Database["public"]["Enums"]["account_status"]
          avatar_url: string | null
          city: string | null
          created_at: string
          display_name: string | null
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          province: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          account_status?: Database["public"]["Enums"]["account_status"]
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          display_name?: string | null
          first_name?: string | null
          id: string
          last_name?: string | null
          phone?: string | null
          province?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          account_status?: Database["public"]["Enums"]["account_status"]
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          display_name?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          province?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      recommendation_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          listing_id: string | null
          payload: Json | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          listing_id?: string | null
          payload?: Json | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          listing_id?: string | null
          payload?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_events_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_profiles: {
        Row: {
          budget: number | null
          control_power_preference: number | null
          created_at: string
          playing_style: string | null
          preferred_weight_grams: number | null
          skill_level: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          budget?: number | null
          control_power_preference?: number | null
          created_at?: string
          playing_style?: string | null
          preferred_weight_grams?: number | null
          skill_level?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          budget?: number | null
          control_power_preference?: number | null
          created_at?: string
          playing_style?: string | null
          preferred_weight_grams?: number | null
          skill_level?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      refund_events: {
        Row: {
          actor_id: string
          created_at: string
          details: Json | null
          event_type: string
          from_status: Database["public"]["Enums"]["refund_status"] | null
          id: string
          refund_id: string
          to_status: Database["public"]["Enums"]["refund_status"]
        }
        Insert: {
          actor_id: string
          created_at?: string
          details?: Json | null
          event_type: string
          from_status?: Database["public"]["Enums"]["refund_status"] | null
          id?: string
          refund_id: string
          to_status: Database["public"]["Enums"]["refund_status"]
        }
        Update: {
          actor_id?: string
          created_at?: string
          details?: Json | null
          event_type?: string
          from_status?: Database["public"]["Enums"]["refund_status"] | null
          id?: string
          refund_id?: string
          to_status?: Database["public"]["Enums"]["refund_status"]
        }
        Relationships: [
          {
            foreignKeyName: "refund_events_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "refunds"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount: number
          buyer_id: string
          completed_at: string | null
          created_at: string
          dispute_id: string
          id: string
          method: Database["public"]["Enums"]["refund_method"] | null
          notes: string | null
          order_id: string
          payment_id: string
          reason: string
          reference: string | null
          requested_at: string
          review_reason: string | null
          reviewed_at: string | null
          seller_id: string
          status: Database["public"]["Enums"]["refund_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          buyer_id: string
          completed_at?: string | null
          created_at?: string
          dispute_id: string
          id?: string
          method?: Database["public"]["Enums"]["refund_method"] | null
          notes?: string | null
          order_id: string
          payment_id: string
          reason: string
          reference?: string | null
          requested_at?: string
          review_reason?: string | null
          reviewed_at?: string | null
          seller_id: string
          status?: Database["public"]["Enums"]["refund_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          buyer_id?: string
          completed_at?: string | null
          created_at?: string
          dispute_id?: string
          id?: string
          method?: Database["public"]["Enums"]["refund_method"] | null
          notes?: string | null
          order_id?: string
          payment_id?: string
          reason?: string
          reference?: string | null
          requested_at?: string
          review_reason?: string | null
          reviewed_at?: string | null
          seller_id?: string
          status?: Database["public"]["Enums"]["refund_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: true
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_order_participants_fkey"
            columns: ["order_id", "buyer_id", "seller_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "buyer_id", "seller_id"]
          },
          {
            foreignKeyName: "refunds_payment_order_fkey"
            columns: ["payment_id", "order_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id", "order_id"]
          },
          {
            foreignKeyName: "refunds_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "public_seller_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          listing_id: string | null
          order_id: string
          order_item_id: string
          rating: number
          reviewer_id: string
          seller_id: string
          seller_rating: number
          status: Database["public"]["Enums"]["review_status"]
          updated_at: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          listing_id?: string | null
          order_id: string
          order_item_id: string
          rating: number
          reviewer_id: string
          seller_id: string
          seller_rating: number
          status?: Database["public"]["Enums"]["review_status"]
          updated_at?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          listing_id?: string | null
          order_id?: string
          order_item_id?: string
          rating?: number
          reviewer_id?: string
          seller_id?: string
          seller_rating?: number
          status?: Database["public"]["Enums"]["review_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "public_seller_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_payment_methods: {
        Row: {
          created_at: string
          id: string
          instructions: string | null
          is_enabled: boolean
          method: string
          seller_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          instructions?: string | null
          is_enabled?: boolean
          method: string
          seller_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          instructions?: string | null
          is_enabled?: boolean
          method?: string
          seller_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_payment_methods_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "public_seller_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_payment_methods_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_profiles: {
        Row: {
          city: string | null
          created_at: string
          delivery_available: boolean
          description: string | null
          id: string
          logo_url: string | null
          pickup_available: boolean
          pickup_instructions: string | null
          pickup_location: string | null
          province: string | null
          seller_status: Database["public"]["Enums"]["seller_status"]
          store_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          delivery_available?: boolean
          description?: string | null
          id?: string
          logo_url?: string | null
          pickup_available?: boolean
          pickup_instructions?: string | null
          pickup_location?: string | null
          province?: string | null
          seller_status?: Database["public"]["Enums"]["seller_status"]
          store_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          city?: string | null
          created_at?: string
          delivery_available?: boolean
          description?: string | null
          id?: string
          logo_url?: string | null
          pickup_available?: boolean
          pickup_instructions?: string | null
          pickup_location?: string | null
          province?: string | null
          seller_status?: Database["public"]["Enums"]["seller_status"]
          store_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      public_profiles: {
        Row: {
          avatar_url: string | null
          city: string | null
          display_name: string | null
          id: string | null
          province: string | null
        }
        Insert: {
          avatar_url?: string | null
          city?: string | null
          display_name?: string | null
          id?: string | null
          province?: string | null
        }
        Update: {
          avatar_url?: string | null
          city?: string | null
          display_name?: string | null
          id?: string | null
          province?: string | null
        }
        Relationships: []
      }
      public_seller_profiles: {
        Row: {
          city: string | null
          delivery_available: boolean | null
          description: string | null
          id: string | null
          logo_url: string | null
          pickup_available: boolean | null
          province: string | null
          store_name: string | null
        }
        Insert: {
          city?: string | null
          delivery_available?: boolean | null
          description?: string | null
          id?: string | null
          logo_url?: string | null
          pickup_available?: boolean | null
          province?: string | null
          store_name?: string | null
        }
        Update: {
          city?: string | null
          delivery_available?: boolean | null
          description?: string | null
          id?: string | null
          logo_url?: string | null
          pickup_available?: boolean | null
          province?: string | null
          store_name?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_to_cart: {
        Args: { p_listing_id: string; p_quantity?: number }
        Returns: {
          cart_id: string
          created_at: string
          id: string
          listing_id: string
          quantity: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cart_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_resolve_dispute: {
        Args: { p_dispute_id: string; p_resolution: string }
        Returns: {
          assigned_admin_id: string | null
          buyer_id: string
          created_at: string
          description: string | null
          id: string
          opened_by: string
          order_id: string
          reason: string
          resolution: string | null
          resolved_at: string | null
          seller_id: string
          status: Database["public"]["Enums"]["dispute_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "disputes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_set_account_status: {
        Args: {
          new_status: Database["public"]["Enums"]["account_status"]
          target_user: string
        }
        Returns: undefined
      }
      admin_set_role: {
        Args: {
          new_role: Database["public"]["Enums"]["user_role"]
          target_user: string
        }
        Returns: undefined
      }
      admin_set_seller_status: {
        Args: {
          new_status: Database["public"]["Enums"]["seller_status"]
          seller: string
        }
        Returns: undefined
      }
      admin_update_listing_report: {
        Args: {
          p_report_id: string
          p_resolution?: string
          p_status: Database["public"]["Enums"]["report_status"]
        }
        Returns: {
          assigned_admin_id: string | null
          created_at: string
          description: string | null
          id: string
          listing_id: string
          reason: string
          reporter_id: string | null
          resolution: string | null
          resolved_at: string | null
          seller_id: string
          status: Database["public"]["Enums"]["report_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "listing_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      auth_seller_id: { Args: never; Returns: string }
      can_upload_dispute_evidence: {
        Args: { p_dispute_id: string }
        Returns: boolean
      }
      can_upload_payment_proof: {
        Args: { p_order_id: string }
        Returns: boolean
      }
      cancel_marketplace_order: {
        Args: { p_order_id: string }
        Returns: {
          buyer_id: string
          cancelled_at: string | null
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          fulfillment_type: Database["public"]["Enums"]["fulfillment_type"]
          id: string
          notes: string | null
          order_number: string
          paid_at: string | null
          preparing_at: string | null
          ready_for_pickup_at: string | null
          seller_id: string
          shipped_at: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      checkout_cart: {
        Args: {
          p_cart_item_ids: string[]
          p_expected_prices?: Json
          p_fulfillments?: Json
        }
        Returns: {
          fulfillment_type: Database["public"]["Enums"]["fulfillment_type"]
          item_count: number
          order_id: string
          order_number: string
          seller_id: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
        }[]
      }
      close_my_dispute: {
        Args: { p_dispute_id: string }
        Returns: {
          assigned_admin_id: string | null
          buyer_id: string
          created_at: string
          description: string | null
          id: string
          opened_by: string
          order_id: string
          reason: string
          resolution: string | null
          resolved_at: string | null
          seller_id: string
          status: Database["public"]["Enums"]["dispute_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "disputes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_refund: {
        Args: {
          p_method: Database["public"]["Enums"]["refund_method"]
          p_notes?: string
          p_reference?: string
          p_refund_id: string
        }
        Returns: {
          amount: number
          buyer_id: string
          completed_at: string | null
          created_at: string
          dispute_id: string
          id: string
          method: Database["public"]["Enums"]["refund_method"] | null
          notes: string | null
          order_id: string
          payment_id: string
          reason: string
          reference: string | null
          requested_at: string
          review_reason: string | null
          reviewed_at: string | null
          seller_id: string
          status: Database["public"]["Enums"]["refund_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "refunds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      confirm_marketplace_order: {
        Args: { p_order_id: string }
        Returns: {
          buyer_id: string
          cancelled_at: string | null
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          fulfillment_type: Database["public"]["Enums"]["fulfillment_type"]
          id: string
          notes: string | null
          order_number: string
          paid_at: string | null
          preparing_at: string | null
          ready_for_pickup_at: string | null
          seller_id: string
          shipped_at: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      confirm_order_received: {
        Args: { p_order_id: string }
        Returns: {
          buyer_id: string
          cancelled_at: string | null
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          fulfillment_type: Database["public"]["Enums"]["fulfillment_type"]
          id: string
          notes: string | null
          order_number: string
          paid_at: string | null
          preparing_at: string | null
          ready_for_pickup_at: string | null
          seller_id: string
          shipped_at: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_marketplace_order: {
        Args: {
          p_expected_unit_price?: number
          p_fulfillment_type: Database["public"]["Enums"]["fulfillment_type"]
          p_listing_id: string
          p_notes?: string
          p_quantity: number
        }
        Returns: {
          buyer_id: string
          cancelled_at: string | null
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          fulfillment_type: Database["public"]["Enums"]["fulfillment_type"]
          id: string
          notes: string | null
          order_number: string
          paid_at: string | null
          preparing_at: string | null
          ready_for_pickup_at: string | null
          seller_id: string
          shipped_at: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_my_cancelled_order: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      escalate_dispute: {
        Args: { p_dispute_id: string; p_reason?: string }
        Returns: {
          assigned_admin_id: string | null
          buyer_id: string
          created_at: string
          description: string | null
          id: string
          opened_by: string
          order_id: string
          reason: string
          resolution: string | null
          resolved_at: string | null
          seller_id: string
          status: Database["public"]["Enums"]["dispute_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "disputes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_my_seller_rating_distribution: {
        Args: never
        Returns: {
          rating_value: number
          review_count: number
        }[]
      }
      get_my_seller_rating_summary: {
        Args: never
        Returns: {
          average_rating: number
          review_count: number
        }[]
      }
      get_my_seller_reviews: {
        Args: {
          p_page?: number
          p_page_size?: number
          p_rating?: number
          p_sort?: string
        }
        Returns: {
          comment: string
          created_at: string
          id: string
          listing_id: string
          listing_image_url: string
          listing_title: string
          rating: number
          reviewer_avatar: string
          reviewer_name: string
          seller_rating: number
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_dispute_participant: {
        Args: { p_dispute_id: string }
        Returns: boolean
      }
      listing_review_distribution: {
        Args: { p_listing_id: string }
        Returns: {
          rating_value: number
          review_count: number
        }[]
      }
      listing_review_summary: {
        Args: { p_listing_id: string }
        Returns: {
          average_rating: number
          review_count: number
        }[]
      }
      listing_reviews: {
        Args: { p_listing_id: string; p_page?: number; p_page_size?: number }
        Returns: {
          comment: string
          created_at: string
          id: string
          listing_title: string
          rating: number
          reviewer_avatar: string
          reviewer_name: string
          seller_rating: number
        }[]
      }
      mark_cash_received: {
        Args: { p_payment_id: string }
        Returns: {
          amount: number
          created_at: string
          id: string
          order_id: string
          paid_at: string | null
          payment_method: string
          payment_reference: string | null
          proof_path: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_order_ready_for_pickup: {
        Args: { p_order_id: string }
        Returns: {
          buyer_id: string
          cancelled_at: string | null
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          fulfillment_type: Database["public"]["Enums"]["fulfillment_type"]
          id: string
          notes: string | null
          order_number: string
          paid_at: string | null
          preparing_at: string | null
          ready_for_pickup_at: string | null
          seller_id: string
          shipped_at: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_order_shipped: {
        Args: {
          p_courier: string
          p_order_id: string
          p_tracking_number: string
        }
        Returns: {
          buyer_id: string
          cancelled_at: string | null
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          fulfillment_type: Database["public"]["Enums"]["fulfillment_type"]
          id: string
          notes: string | null
          order_number: string
          paid_at: string | null
          preparing_at: string | null
          ready_for_pickup_at: string | null
          seller_id: string
          shipped_at: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      marketplace_search_listings: {
        Args: {
          brand_slug?: string
          category_slug?: string
          delivery?: boolean
          max_price?: number
          min_price?: number
          p_listing_condition?: string
          page?: number
          page_size?: number
          pickup?: boolean
          search?: string
          sort?: string
        }
        Returns: Json
      }
      my_cart: {
        Args: never
        Returns: {
          buyer_id: string
          created_at: string
          id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "carts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      notify_user: {
        Args: {
          p_message: string
          p_recipient_id: string
          p_related_entity_id?: string
          p_related_entity_type?: string
          p_title: string
          p_type: Database["public"]["Enums"]["notification_type"]
        }
        Returns: undefined
      }
      open_order_dispute: {
        Args: { p_description?: string; p_order_id: string; p_reason: string }
        Returns: {
          assigned_admin_id: string | null
          buyer_id: string
          created_at: string
          description: string | null
          id: string
          opened_by: string
          order_id: string
          reason: string
          resolution: string | null
          resolved_at: string | null
          seller_id: string
          status: Database["public"]["Enums"]["dispute_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "disputes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      payment_is_open: { Args: { p_order_id: string }; Returns: boolean }
      register_dispute_evidence: {
        Args: {
          p_dispute_id: string
          p_mime_type: string
          p_original_filename: string
          p_size_bytes: number
          p_storage_path: string
        }
        Returns: {
          created_at: string
          dispute_id: string
          id: string
          mime_type: string | null
          original_filename: string | null
          size_bytes: number | null
          storage_path: string | null
          uploader_id: string
          url: string | null
        }
        SetofOptions: {
          from: "*"
          to: "dispute_evidence"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_refund: {
        Args: {
          p_dispute_id: string
          p_reason: string
          p_requested_amount: number
        }
        Returns: {
          amount: number
          buyer_id: string
          completed_at: string | null
          created_at: string
          dispute_id: string
          id: string
          method: Database["public"]["Enums"]["refund_method"] | null
          notes: string | null
          order_id: string
          payment_id: string
          reason: string
          reference: string | null
          requested_at: string
          review_reason: string | null
          reviewed_at: string | null
          seller_id: string
          status: Database["public"]["Enums"]["refund_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "refunds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_payment: {
        Args: {
          p_decision: string
          p_payment_id: string
          p_rejection_reason?: string
        }
        Returns: {
          amount: number
          created_at: string
          id: string
          order_id: string
          paid_at: string | null
          payment_method: string
          payment_reference: string | null
          proof_path: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_refund: {
        Args: { p_decision: string; p_reason?: string; p_refund_id: string }
        Returns: {
          amount: number
          buyer_id: string
          completed_at: string | null
          created_at: string
          dispute_id: string
          id: string
          method: Database["public"]["Enums"]["refund_method"] | null
          notes: string | null
          order_id: string
          payment_id: string
          reason: string
          reference: string | null
          requested_at: string
          review_reason: string | null
          reviewed_at: string | null
          seller_id: string
          status: Database["public"]["Enums"]["refund_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "refunds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      seller_is_active: { Args: { p_seller_id: string }; Returns: boolean }
      seller_review_summary: {
        Args: { p_seller_id: string }
        Returns: {
          average_rating: number
          review_count: number
        }[]
      }
      seller_reviews: {
        Args: { p_page?: number; p_page_size?: number; p_seller_id: string }
        Returns: {
          comment: string
          created_at: string
          id: string
          listing_title: string
          rating: number
          reviewer_avatar: string
          reviewer_name: string
          seller_rating: number
        }[]
      }
      send_dispute_message: {
        Args: { p_dispute_id: string; p_message: string }
        Returns: {
          created_at: string
          dispute_id: string
          id: string
          message: string
          sender_id: string
        }
        SetofOptions: {
          from: "*"
          to: "dispute_messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      send_inquiry_reply: {
        Args: { p_inquiry_id: string; p_message: string }
        Returns: {
          created_at: string
          id: string
          inquiry_id: string
          is_read: boolean
          message: string
          sender_id: string
        }
        SetofOptions: {
          from: "*"
          to: "inquiry_messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_order_preparation: {
        Args: { p_order_id: string }
        Returns: {
          buyer_id: string
          cancelled_at: string | null
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          fulfillment_type: Database["public"]["Enums"]["fulfillment_type"]
          id: string
          notes: string | null
          order_number: string
          paid_at: string | null
          preparing_at: string | null
          ready_for_pickup_at: string | null
          seller_id: string
          shipped_at: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_listing_report: {
        Args: { p_description?: string; p_listing_id: string; p_reason: string }
        Returns: {
          assigned_admin_id: string | null
          created_at: string
          description: string | null
          id: string
          listing_id: string
          reason: string
          reporter_id: string | null
          resolution: string | null
          resolved_at: string | null
          seller_id: string
          status: Database["public"]["Enums"]["report_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "listing_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_payment: {
        Args: {
          p_address?: string
          p_city?: string
          p_delivery_notes?: string
          p_order_id: string
          p_payment_method: string
          p_phone?: string
          p_postal_code?: string
          p_proof_path?: string
          p_province?: string
          p_recipient_name?: string
          p_reference?: string
        }
        Returns: {
          amount: number
          created_at: string
          id: string
          order_id: string
          paid_at: string | null
          payment_method: string
          payment_reference: string | null
          proof_path: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_review: {
        Args: {
          p_comment: string
          p_order_item_id: string
          p_rating: number
          p_seller_rating: number
        }
        Returns: {
          comment: string | null
          created_at: string
          id: string
          listing_id: string | null
          order_id: string
          order_item_id: string
          rating: number
          reviewer_id: string
          seller_id: string
          seller_rating: number
          status: Database["public"]["Enums"]["review_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "reviews"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_cart_item_quantity: {
        Args: { p_cart_item_id: string; p_quantity: number }
        Returns: {
          cart_id: string
          created_at: string
          id: string
          listing_id: string
          quantity: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cart_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      account_status: "active" | "suspended" | "deactivated"
      dispute_status: "open" | "under_review" | "resolved" | "closed"
      fulfillment_type: "pickup" | "delivery"
      inquiry_status: "open" | "answered" | "closed"
      listing_condition: "new" | "like_new" | "used" | "heavily_used"
      listing_status: "draft" | "active" | "sold" | "archived" | "removed"
      notification_type:
        | "order"
        | "inquiry"
        | "dispute"
        | "review"
        | "report"
        | "system"
      order_status:
        | "pending"
        | "confirmed"
        | "paid"
        | "preparing"
        | "shipped"
        | "ready_for_pickup"
        | "completed"
        | "cancelled"
        | "disputed"
      payment_status:
        | "pending"
        | "paid"
        | "failed"
        | "refunded"
        | "partially_refunded"
        | "submitted"
        | "rejected"
      refund_method:
        | "original_method"
        | "manual_transfer"
        | "cash_return"
        | "other"
      refund_status: "requested" | "approved" | "rejected" | "completed"
      report_status: "pending" | "under_review" | "resolved" | "dismissed"
      review_status: "pending" | "approved" | "rejected" | "hidden"
      seller_status: "pending" | "active" | "suspended" | "rejected"
      user_role: "customer" | "seller" | "admin"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_status: ["active", "suspended", "deactivated"],
      dispute_status: ["open", "under_review", "resolved", "closed"],
      fulfillment_type: ["pickup", "delivery"],
      inquiry_status: ["open", "answered", "closed"],
      listing_condition: ["new", "like_new", "used", "heavily_used"],
      listing_status: ["draft", "active", "sold", "archived", "removed"],
      notification_type: [
        "order",
        "inquiry",
        "dispute",
        "review",
        "report",
        "system",
      ],
      order_status: [
        "pending",
        "confirmed",
        "paid",
        "preparing",
        "shipped",
        "ready_for_pickup",
        "completed",
        "cancelled",
        "disputed",
      ],
      payment_status: [
        "pending",
        "paid",
        "failed",
        "refunded",
        "partially_refunded",
        "submitted",
        "rejected",
      ],
      refund_method: [
        "original_method",
        "manual_transfer",
        "cash_return",
        "other",
      ],
      refund_status: ["requested", "approved", "rejected", "completed"],
      report_status: ["pending", "under_review", "resolved", "dismissed"],
      review_status: ["pending", "approved", "rejected", "hidden"],
      seller_status: ["pending", "active", "suspended", "rejected"],
      user_role: ["customer", "seller", "admin"],
    },
  },
} as const
