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
          new_data: Json | null
          previous_data: Json | null
          reason: string | null
        }
        Insert: {
          action_type: string
          admin_id: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          new_data?: Json | null
          previous_data?: Json | null
          reason?: string | null
        }
        Update: {
          action_type?: string
          admin_id?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          new_data?: Json | null
          previous_data?: Json | null
          reason?: string | null
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
          actor_id: string | null
          created_at: string
          event_key: string
          event_name: string
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
          actor_id?: string | null
          created_at?: string
          event_key: string
          event_name: string
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
          actor_id?: string | null
          created_at?: string
          event_key?: string
          event_name?: string
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
      admin_analytics_categories: {
        Args: {
          p_end_date?: string
          p_page?: number
          p_page_size?: number
          p_sort?: string
          p_start_date?: string
        }
        Returns: {
          active_listings: number
          category_id: string
          category_name: string
          gross_sales: number
          total_count: number
          units_sold: number
        }[]
      }
      admin_analytics_overview: {
        Args: { p_end_date?: string; p_start_date?: string }
        Returns: {
          active_listings: number
          active_sellers: number
          active_users: number
          approved_reviews: number
          avg_order_value: number
          avg_rating: number
          cancelled_orders: number
          completed_orders: number
          conversion_rate: number
          dismissed_reports: number
          disputed_orders: number
          favorites_count: number
          gross_sales: number
          inquiries_count: number
          listing_views: number
          net_sales: number
          new_listings: number
          new_sellers: number
          new_users: number
          open_disputes: number
          open_reports: number
          pending_sellers: number
          products_sold: number
          refund_count: number
          refund_value: number
          registered_users: number
          resolved_disputes: number
          resolved_reports: number
          sold_listings: number
          suspended_users: number
          total_listings: number
          total_sellers: number
          transacted_orders: number
          unique_viewers: number
        }[]
      }
      admin_analytics_timeseries: {
        Args: { p_bucket?: string; p_end_date?: string; p_start_date?: string }
        Returns: {
          approved_reviews: number
          bucket_start: string
          cancelled_orders: number
          completed_orders: number
          favorites_count: number
          gross_sales: number
          inquiries_count: number
          listing_views: number
          net_sales: number
          new_listings: number
          new_orders: number
          new_sellers: number
          new_users: number
          products_sold: number
          refund_value: number
          transacted_orders: number
        }[]
      }
      admin_analytics_top_listings: {
        Args: {
          p_end_date?: string
          p_page?: number
          p_page_size?: number
          p_sort?: string
          p_start_date?: string
        }
        Returns: {
          avg_rating: number
          category_name: string
          favorites: number
          gross_sales: number
          inquiries: number
          listing_id: string
          listing_status: Database["public"]["Enums"]["listing_status"]
          listing_title: string
          review_count: number
          store_name: string
          total_count: number
          units_sold: number
          views: number
        }[]
      }
      admin_analytics_top_sellers: {
        Args: {
          p_end_date?: string
          p_page?: number
          p_page_size?: number
          p_sort?: string
          p_start_date?: string
        }
        Returns: {
          active_listings: number
          avg_rating: number
          completed_orders: number
          gross_sales: number
          review_count: number
          seller_id: string
          seller_status: Database["public"]["Enums"]["seller_status"]
          store_name: string
          total_count: number
          transacted_orders: number
          units_sold: number
        }[]
      }
      admin_approve_seller: {
        Args: { p_reason: string; p_seller_id: string }
        Returns: {
          seller_id: string
          seller_status: Database["public"]["Enums"]["seller_status"]
          user_id: string
        }[]
      }
      admin_change_seller_status: {
        Args: {
          p_action_type: string
          p_expected_status: Database["public"]["Enums"]["seller_status"]
          p_new_status: Database["public"]["Enums"]["seller_status"]
          p_reason: string
          p_seller_id: string
        }
        Returns: {
          seller_id: string
          seller_status: Database["public"]["Enums"]["seller_status"]
          user_id: string
        }[]
      }
      admin_claim_dispute: {
        Args: { p_dispute_id: string; p_reason: string }
        Returns: {
          assigned_admin_id: string
          dispute_id: string
          status: Database["public"]["Enums"]["dispute_status"]
          updated_at: string
        }[]
      }
      admin_create_brand: {
        Args: {
          p_description: string
          p_logo_url: string
          p_name: string
          p_reason: string
          p_slug: string
        }
        Returns: {
          created_at: string
          description: string
          id: string
          is_active: boolean
          logo_url: string
          name: string
          slug: string
          updated_at: string
        }[]
      }
      admin_create_category: {
        Args: {
          p_description: string
          p_name: string
          p_reason: string
          p_slug: string
          p_sort_order: number
        }
        Returns: {
          created_at: string
          description: string
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }[]
      }
      admin_deactivate_brand: {
        Args: { p_brand_id: string; p_reason: string }
        Returns: {
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }[]
      }
      admin_deactivate_category: {
        Args: { p_category_id: string; p_reason: string }
        Returns: {
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }[]
      }
      admin_deactivate_user: {
        Args: { p_reason: string; p_user_id: string }
        Returns: {
          account_status: Database["public"]["Enums"]["account_status"]
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }[]
      }
      admin_demote_admin: {
        Args: { p_reason: string; p_user_id: string }
        Returns: {
          account_status: Database["public"]["Enums"]["account_status"]
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }[]
      }
      admin_get_admin_action: {
        Args: { p_action_id: string }
        Returns: {
          action_id: string
          action_type: string
          admin_email: string
          admin_id: string
          created_at: string
          entity_id: string
          entity_type: string
          new_data: Json
          previous_data: Json
          reason: string
        }[]
      }
      admin_get_dispute: {
        Args: { p_dispute_id: string }
        Returns: {
          assigned_admin_email: string
          assigned_admin_id: string
          buyer_email: string
          buyer_id: string
          buyer_name: string
          created_at: string
          description: string
          dispute_id: string
          evidence_count: number
          message_count: number
          opened_by: string
          order_id: string
          order_number: string
          reason: string
          refund_amount: number
          refund_id: string
          refund_status: Database["public"]["Enums"]["refund_status"]
          resolution: string
          resolved_at: string
          seller_email: string
          seller_id: string
          seller_user_id: string
          status: Database["public"]["Enums"]["dispute_status"]
          store_name: string
          updated_at: string
        }[]
      }
      admin_get_listing: {
        Args: { p_listing_id: string }
        Returns: {
          brand_id: string
          brand_name: string
          category_id: string
          category_name: string
          city: string
          created_at: string
          delivery_available: boolean
          description: string
          images: Json
          listing_condition: Database["public"]["Enums"]["listing_condition"]
          listing_id: string
          listing_status: Database["public"]["Enums"]["listing_status"]
          pickup_available: boolean
          price: number
          province: string
          quantity: number
          report_count: number
          seller_id: string
          seller_status: Database["public"]["Enums"]["seller_status"]
          store_name: string
          title: string
          updated_at: string
        }[]
      }
      admin_get_listing_report: {
        Args: { p_report_id: string }
        Returns: {
          assigned_admin_email: string
          assigned_admin_id: string
          created_at: string
          description: string
          listing_id: string
          listing_status: Database["public"]["Enums"]["listing_status"]
          listing_title: string
          reason: string
          report_id: string
          resolution: string
          resolved_at: string
          seller_id: string
          seller_status: Database["public"]["Enums"]["seller_status"]
          status: Database["public"]["Enums"]["report_status"]
          store_name: string
          updated_at: string
        }[]
      }
      admin_get_order: {
        Args: { p_order_id: string }
        Returns: {
          address: string
          buyer_email: string
          buyer_id: string
          buyer_name: string
          cancelled_at: string
          city: string
          completed_at: string
          confirmed_at: string
          courier: string
          created_at: string
          delivery_notes: string
          fulfillment_type: Database["public"]["Enums"]["fulfillment_type"]
          notes: string
          order_id: string
          order_items: Json
          order_number: string
          paid_at: string
          payment_amount: number
          payment_id: string
          payment_method: string
          payment_reference: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          phone: string
          pickup_instructions: string
          pickup_location: string
          postal_code: string
          preparing_at: string
          proof_path: string
          province: string
          ready_for_pickup_at: string
          recipient_name: string
          rejection_reason: string
          scheduled_date: string
          seller_id: string
          seller_user_id: string
          shipped_at: string
          status: Database["public"]["Enums"]["order_status"]
          store_name: string
          subtotal: number
          total: number
          tracking_number: string
          updated_at: string
        }[]
      }
      admin_get_refund: {
        Args: { p_refund_id: string }
        Returns: {
          amount: number
          buyer_email: string
          buyer_id: string
          buyer_name: string
          completed_at: string
          created_at: string
          dispute_id: string
          method: Database["public"]["Enums"]["refund_method"]
          notes: string
          order_id: string
          order_number: string
          payment_id: string
          reason: string
          reference: string
          refund_id: string
          requested_at: string
          review_reason: string
          reviewed_at: string
          seller_id: string
          seller_user_id: string
          status: Database["public"]["Enums"]["refund_status"]
          store_name: string
          updated_at: string
        }[]
      }
      admin_get_review: {
        Args: { p_review_id: string }
        Returns: {
          comment: string
          created_at: string
          listing_id: string
          listing_title: string
          order_id: string
          order_item_id: string
          order_number: string
          rating: number
          review_id: string
          reviewer_id: string
          reviewer_name: string
          seller_id: string
          seller_rating: number
          status: Database["public"]["Enums"]["review_status"]
          store_name: string
          updated_at: string
        }[]
      }
      admin_get_seller: {
        Args: { p_seller_id: string }
        Returns: {
          account_status: Database["public"]["Enums"]["account_status"]
          active_listing_count: number
          city: string
          created_at: string
          delivery_available: boolean
          description: string
          display_name: string
          email: string
          logo_url: string
          pickup_available: boolean
          pickup_instructions: string
          pickup_location: string
          province: string
          seller_id: string
          seller_status: Database["public"]["Enums"]["seller_status"]
          store_name: string
          total_listing_count: number
          total_order_count: number
          updated_at: string
          user_id: string
        }[]
      }
      admin_get_user: {
        Args: { p_user_id: string }
        Returns: {
          account_status: Database["public"]["Enums"]["account_status"]
          auth_created_at: string
          avatar_url: string
          city: string
          display_name: string
          email: string
          first_name: string
          last_name: string
          last_sign_in_at: string
          phone: string
          profile_created_at: string
          profile_updated_at: string
          province: string
          role: Database["public"]["Enums"]["user_role"]
          seller_created_at: string
          seller_id: string
          seller_status: Database["public"]["Enums"]["seller_status"]
          store_name: string
          user_id: string
        }[]
      }
      admin_list_admin_actions: {
        Args: {
          p_action_type?: string
          p_admin_id?: string
          p_entity_type?: string
          p_page?: number
          p_page_size?: number
          p_search?: string
          p_sort?: string
        }
        Returns: {
          action_id: string
          action_type: string
          admin_email: string
          admin_id: string
          created_at: string
          entity_id: string
          entity_type: string
          new_data: Json
          previous_data: Json
          reason: string
          total_count: number
        }[]
      }
      admin_list_brands: {
        Args: {
          p_is_active?: boolean
          p_page?: number
          p_page_size?: number
          p_search?: string
          p_sort?: string
        }
        Returns: {
          created_at: string
          description: string
          id: string
          is_active: boolean
          listing_count: number
          logo_url: string
          name: string
          slug: string
          total_count: number
          updated_at: string
        }[]
      }
      admin_list_categories: {
        Args: {
          p_is_active?: boolean
          p_page?: number
          p_page_size?: number
          p_search?: string
          p_sort?: string
        }
        Returns: {
          created_at: string
          description: string
          id: string
          is_active: boolean
          listing_count: number
          name: string
          slug: string
          sort_order: number
          total_count: number
          updated_at: string
        }[]
      }
      admin_list_dispute_events: {
        Args: {
          p_dispute_id: string
          p_page?: number
          p_page_size?: number
          p_sort?: string
        }
        Returns: {
          actor_id: string
          created_at: string
          details: Json
          dispute_id: string
          event_id: string
          event_type: string
          from_status: Database["public"]["Enums"]["dispute_status"]
          to_status: Database["public"]["Enums"]["dispute_status"]
          total_count: number
        }[]
      }
      admin_list_dispute_evidence: {
        Args: {
          p_dispute_id: string
          p_page?: number
          p_page_size?: number
          p_sort?: string
        }
        Returns: {
          created_at: string
          dispute_id: string
          evidence_id: string
          legacy_url: string
          mime_type: string
          original_filename: string
          size_bytes: number
          storage_path: string
          total_count: number
          uploader_id: string
          uploader_name: string
        }[]
      }
      admin_list_dispute_messages: {
        Args: {
          p_dispute_id: string
          p_page?: number
          p_page_size?: number
          p_sort?: string
        }
        Returns: {
          created_at: string
          dispute_id: string
          message: string
          message_id: string
          sender_id: string
          sender_kind: string
          sender_name: string
          total_count: number
        }[]
      }
      admin_list_disputes: {
        Args: {
          p_assigned_to_me?: boolean
          p_page?: number
          p_page_size?: number
          p_search?: string
          p_sort?: string
          p_status?: Database["public"]["Enums"]["dispute_status"]
        }
        Returns: {
          assigned_admin_email: string
          assigned_admin_id: string
          buyer_id: string
          buyer_name: string
          created_at: string
          dispute_id: string
          order_id: string
          order_number: string
          reason: string
          refund_amount: number
          refund_status: Database["public"]["Enums"]["refund_status"]
          seller_id: string
          status: Database["public"]["Enums"]["dispute_status"]
          store_name: string
          total_count: number
          updated_at: string
        }[]
      }
      admin_list_listing_reports: {
        Args: {
          p_page?: number
          p_page_size?: number
          p_search?: string
          p_sort?: string
          p_status?: Database["public"]["Enums"]["report_status"]
        }
        Returns: {
          assigned_admin_id: string
          created_at: string
          description: string
          listing_id: string
          listing_title: string
          reason: string
          report_id: string
          resolution: string
          resolved_at: string
          seller_id: string
          status: Database["public"]["Enums"]["report_status"]
          store_name: string
          total_count: number
          updated_at: string
        }[]
      }
      admin_list_listings: {
        Args: {
          p_page?: number
          p_page_size?: number
          p_search?: string
          p_seller_id?: string
          p_sort?: string
          p_status?: Database["public"]["Enums"]["listing_status"]
        }
        Returns: {
          active_report_count: number
          brand_name: string
          category_name: string
          created_at: string
          listing_condition: Database["public"]["Enums"]["listing_condition"]
          listing_id: string
          listing_status: Database["public"]["Enums"]["listing_status"]
          price: number
          quantity: number
          seller_id: string
          seller_status: Database["public"]["Enums"]["seller_status"]
          store_name: string
          title: string
          total_count: number
          updated_at: string
        }[]
      }
      admin_list_orders: {
        Args: {
          p_page?: number
          p_page_size?: number
          p_payment_status?: Database["public"]["Enums"]["payment_status"]
          p_search?: string
          p_sort?: string
          p_status?: Database["public"]["Enums"]["order_status"]
        }
        Returns: {
          buyer_email: string
          buyer_id: string
          buyer_name: string
          created_at: string
          fulfillment_type: Database["public"]["Enums"]["fulfillment_type"]
          order_id: string
          order_number: string
          payment_amount: number
          payment_id: string
          payment_method: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          seller_id: string
          status: Database["public"]["Enums"]["order_status"]
          store_name: string
          subtotal: number
          total: number
          total_count: number
          updated_at: string
        }[]
      }
      admin_list_refund_events: {
        Args: {
          p_page?: number
          p_page_size?: number
          p_refund_id: string
          p_sort?: string
        }
        Returns: {
          actor_id: string
          created_at: string
          details: Json
          event_id: string
          event_type: string
          from_status: Database["public"]["Enums"]["refund_status"]
          refund_id: string
          to_status: Database["public"]["Enums"]["refund_status"]
          total_count: number
        }[]
      }
      admin_list_refunds: {
        Args: {
          p_page?: number
          p_page_size?: number
          p_search?: string
          p_sort?: string
          p_status?: Database["public"]["Enums"]["refund_status"]
        }
        Returns: {
          amount: number
          buyer_id: string
          buyer_name: string
          completed_at: string
          dispute_id: string
          order_id: string
          order_number: string
          refund_id: string
          requested_at: string
          reviewed_at: string
          seller_id: string
          status: Database["public"]["Enums"]["refund_status"]
          store_name: string
          total_count: number
        }[]
      }
      admin_list_reviews: {
        Args: {
          p_page?: number
          p_page_size?: number
          p_rating?: number
          p_search?: string
          p_sort?: string
          p_status?: Database["public"]["Enums"]["review_status"]
        }
        Returns: {
          comment: string
          created_at: string
          listing_id: string
          listing_title: string
          order_id: string
          order_number: string
          rating: number
          review_id: string
          reviewer_name: string
          seller_id: string
          seller_rating: number
          status: Database["public"]["Enums"]["review_status"]
          store_name: string
          total_count: number
          updated_at: string
        }[]
      }
      admin_list_sellers: {
        Args: {
          p_page?: number
          p_page_size?: number
          p_search?: string
          p_sort?: string
          p_status?: Database["public"]["Enums"]["seller_status"]
        }
        Returns: {
          account_status: Database["public"]["Enums"]["account_status"]
          city: string
          created_at: string
          display_name: string
          email: string
          listing_count: number
          logo_url: string
          order_count: number
          province: string
          seller_id: string
          seller_status: Database["public"]["Enums"]["seller_status"]
          store_name: string
          total_count: number
          updated_at: string
          user_id: string
        }[]
      }
      admin_list_users: {
        Args: {
          p_account_status?: Database["public"]["Enums"]["account_status"]
          p_page?: number
          p_page_size?: number
          p_role?: Database["public"]["Enums"]["user_role"]
          p_search?: string
          p_sort?: string
        }
        Returns: {
          account_status: Database["public"]["Enums"]["account_status"]
          auth_created_at: string
          avatar_url: string
          city: string
          display_name: string
          email: string
          first_name: string
          last_name: string
          last_sign_in_at: string
          profile_created_at: string
          province: string
          role: Database["public"]["Enums"]["user_role"]
          seller_id: string
          seller_status: Database["public"]["Enums"]["seller_status"]
          total_count: number
          user_id: string
        }[]
      }
      admin_moderate_listing: {
        Args: { p_action: string; p_listing_id: string; p_reason: string }
        Returns: {
          listing_id: string
          listing_status: Database["public"]["Enums"]["listing_status"]
          updated_at: string
        }[]
      }
      admin_moderate_review: {
        Args: { p_action: string; p_reason: string; p_review_id: string }
        Returns: {
          review_id: string
          status: Database["public"]["Enums"]["review_status"]
          updated_at: string
        }[]
      }
      admin_promote_user_to_admin: {
        Args: { p_reason: string; p_user_id: string }
        Returns: {
          account_status: Database["public"]["Enums"]["account_status"]
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }[]
      }
      admin_reactivate_brand: {
        Args: { p_brand_id: string; p_reason: string }
        Returns: {
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }[]
      }
      admin_reactivate_category: {
        Args: { p_category_id: string; p_reason: string }
        Returns: {
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }[]
      }
      admin_reactivate_seller: {
        Args: { p_reason: string; p_seller_id: string }
        Returns: {
          seller_id: string
          seller_status: Database["public"]["Enums"]["seller_status"]
          user_id: string
        }[]
      }
      admin_reactivate_user: {
        Args: { p_reason: string; p_user_id: string }
        Returns: {
          account_status: Database["public"]["Enums"]["account_status"]
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }[]
      }
      admin_reject_seller: {
        Args: { p_reason: string; p_seller_id: string }
        Returns: {
          seller_id: string
          seller_status: Database["public"]["Enums"]["seller_status"]
          user_id: string
        }[]
      }
      admin_resolve_dispute: {
        Args: { p_dispute_id: string; p_reason: string; p_resolution: string }
        Returns: {
          assigned_admin_id: string
          dispute_id: string
          resolution: string
          resolved_at: string
          status: Database["public"]["Enums"]["dispute_status"]
          updated_at: string
        }[]
      }
      admin_set_brand_active: {
        Args: {
          p_action: string
          p_brand_id: string
          p_expected: boolean
          p_new: boolean
          p_reason: string
        }
        Returns: {
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }[]
      }
      admin_set_category_active: {
        Args: {
          p_action: string
          p_category_id: string
          p_expected: boolean
          p_new: boolean
          p_reason: string
        }
        Returns: {
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }[]
      }
      admin_summary: {
        Args: never
        Returns: {
          active_listings: number
          active_refund_requests: number
          active_sellers: number
          active_users: number
          approved_reviews: number
          completed_orders: number
          disputed_orders: number
          disputes_under_review: number
          hidden_reviews: number
          open_disputes: number
          open_orders: number
          payments_awaiting_review: number
          pending_reports: number
          pending_sellers: number
          removed_listings: number
          reports_under_review: number
          suspended_users: number
          total_users: number
        }[]
      }
      admin_suspend_seller: {
        Args: { p_reason: string; p_seller_id: string }
        Returns: {
          seller_id: string
          seller_status: Database["public"]["Enums"]["seller_status"]
          user_id: string
        }[]
      }
      admin_suspend_user: {
        Args: { p_reason: string; p_user_id: string }
        Returns: {
          account_status: Database["public"]["Enums"]["account_status"]
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }[]
      }
      admin_update_brand: {
        Args: {
          p_brand_id: string
          p_description: string
          p_logo_url: string
          p_name: string
          p_reason: string
          p_slug: string
        }
        Returns: {
          created_at: string
          description: string
          id: string
          is_active: boolean
          logo_url: string
          name: string
          slug: string
          updated_at: string
        }[]
      }
      admin_update_category: {
        Args: {
          p_category_id: string
          p_description: string
          p_name: string
          p_reason: string
          p_slug: string
          p_sort_order: number
        }
        Returns: {
          created_at: string
          description: string
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }[]
      }
      admin_update_listing_report: {
        Args: {
          p_reason: string
          p_report_id: string
          p_resolution?: string
          p_status: Database["public"]["Enums"]["report_status"]
        }
        Returns: {
          assigned_admin_id: string
          report_id: string
          resolution: string
          resolved_at: string
          status: Database["public"]["Enums"]["report_status"]
          updated_at: string
        }[]
      }
      analytics_require_admin: { Args: never; Returns: undefined }
      analytics_require_bucket: {
        Args: { p_bucket: string }
        Returns: undefined
      }
      analytics_require_page: {
        Args: { p_page: number; p_page_size: number }
        Returns: undefined
      }
      analytics_require_seller: { Args: never; Returns: undefined }
      analytics_require_sort: {
        Args: { p_allowlist: string[]; p_sort: string }
        Returns: undefined
      }
      analytics_require_window: {
        Args: { p_end_date: string; p_max_days: number; p_start_date: string }
        Returns: undefined
      }
      auth_active_seller_id: { Args: never; Returns: string }
      auth_seller_id: { Args: never; Returns: string }
      can_manage_marketplace_product: {
        Args: { p_name: string }
        Returns: boolean
      }
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
      emit_marketplace_notification: {
        Args: {
          p_actor_id?: string
          p_event_key: string
          p_event_name: string
          p_message?: string
          p_recipient_id: string
          p_related_entity_id?: string
          p_related_entity_type?: string
          p_title: string
          p_type: Database["public"]["Enums"]["notification_type"]
        }
        Returns: string
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
      is_active_user: { Args: never; Returns: boolean }
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
      mark_all_notifications_read: { Args: never; Returns: number }
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
      mark_notification_read: {
        Args: { p_notification_id: string }
        Returns: boolean
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
      my_seller_analytics_listings: {
        Args: {
          p_end_date?: string
          p_page?: number
          p_page_size?: number
          p_sort?: string
          p_start_date?: string
        }
        Returns: {
          avg_rating: number
          favorites: number
          gross_sales: number
          inquiries: number
          listing_id: string
          listing_status: Database["public"]["Enums"]["listing_status"]
          listing_title: string
          review_count: number
          total_count: number
          units_sold: number
          views: number
        }[]
      }
      my_seller_analytics_overview: {
        Args: { p_end_date?: string; p_start_date?: string }
        Returns: {
          active_listings: number
          approved_reviews: number
          avg_order_value: number
          avg_rating: number
          cancelled_orders: number
          completed_orders: number
          disputed_orders: number
          draft_listings: number
          favorites_count: number
          gross_sales: number
          inquiries_count: number
          listing_views: number
          net_sales: number
          new_listings: number
          open_disputes: number
          products_sold: number
          refund_count: number
          refund_value: number
          resolved_disputes: number
          sold_listings: number
          total_listings: number
          transacted_orders: number
          unique_viewers: number
        }[]
      }
      my_seller_analytics_timeseries: {
        Args: { p_bucket?: string; p_end_date?: string; p_start_date?: string }
        Returns: {
          approved_reviews: number
          bucket_start: string
          cancelled_orders: number
          completed_orders: number
          favorites_count: number
          gross_sales: number
          inquiries_count: number
          listing_views: number
          net_sales: number
          new_listings: number
          new_orders: number
          products_sold: number
          refund_value: number
          transacted_orders: number
        }[]
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
      record_admin_action: {
        Args: {
          p_action_type: string
          p_entity_id: string
          p_entity_type: string
          p_new_data: Json
          p_previous_data: Json
          p_reason: string
        }
        Returns: string
      }
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
