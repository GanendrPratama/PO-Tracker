// POTracker Types

// Event entity - organizes products and orders
export interface Event {
    id?: number;
    name: string;
    description?: string;
    start_date?: string;
    end_date?: string;
    is_active?: boolean;
    created_at?: string;
}

export interface ProductPrice {
    id?: number;
    product_id?: number;
    currency_code: string;
    price: number;
}

export interface Tag {
    id?: number;
    name: string;
    color: string; // hex color for badge display
}

export interface Product {
    id?: number;
    unique_id?: string;
    name: string;
    description?: string;
    price: number;
    currency_code?: string;
    prices?: ProductPrice[];
    tags?: Tag[];
    image_url?: string;
    event_id?: number;
    created_at?: string;
}

export interface PreOrder {
    id?: number;
    customer_name: string;
    customer_email: string;
    confirmation_code?: string;
    status?: 'pending' | 'sent' | 'confirmed';
    total_amount: number;
    notes?: string;
    event_id?: number;
    created_at?: string;
    confirmed_at?: string;
}

export interface OrderItem {
    id?: number;
    preorder_id: number;
    product_id: number;
    quantity: number;
    unit_price: number;
}

export interface OrderItemDetail {
    id: number;
    product_name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
}

export interface OrderWithItems {
    order: PreOrder;
    items: OrderItemDetail[];
}

export interface SmtpSettings {
    smtp_server: string;
    smtp_port: number;
    username: string;
    password: string;
    from_email: string;
    from_name?: string;
}

export interface CreateOrderRequest {
    customer_name: string;
    customer_email: string;
    notes?: string;
    items: OrderItemInput[];
}

export interface OrderItemInput {
    product_id: number;
    quantity: number;
}

// App Settings
export interface AppSettings {
    current_event_id?: number;
    camera_permission_granted?: boolean;
    currency_code?: string;   // e.g., 'USD', 'IDR'
    currency_locale?: string; // e.g., 'en-US', 'id-ID'
    currency_set?: boolean;   // true if user has explicitly chosen a currency
}

// Google OAuth types
export interface GoogleAuthConfig {
    client_id: string;
    client_secret: string;
}

export interface GoogleAuth {
    access_token: string;
    refresh_token?: string;
    token_expiry?: string;
    user_email?: string;
    user_name?: string;
    auth_mode?: 'oauth' | 'api_key';
    api_key?: string;
}

export interface GoogleForm {
    id?: number;
    form_id: string;
    form_url: string;
    responder_url: string;
    title: string;
    created_at?: string;
    last_synced_at?: string;
}

export interface SyncSettings {
    auto_sync_enabled: boolean;
    sync_interval_minutes: number;
}

// Invoice Template types
export interface InvoiceSection {
    id: string;
    type: 'header' | 'greeting' | 'qr_code' | 'items_table' | 'total' | 'footer';
    label: string;
    enabled: boolean;
    order: number;
}

export interface InvoiceTemplate {
    sections: InvoiceSection[];
    header_title: string;
    header_subtitle: string;
    footer_text: string;
    primary_color: string;
    secondary_color: string;
    use_banner_image: boolean;
    banner_image_url: string;
}

export type View = 'dashboard' | 'products' | 'new-order' | 'confirm' | 'settings' | 'google-forms' | 'events' | 'orders';

