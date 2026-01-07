import { useEffect, useState, useCallback } from 'react';
import Database from '@tauri-apps/plugin-sql';
import { Product, PreOrder, OrderItem, SmtpSettings, Event, AppSettings } from '../types';

let db: Database | null = null;

export async function getDatabase(): Promise<Database> {
    if (!db) {
        db = await Database.load('sqlite:potracker.db');

        // Run migrations - Events table (must be first)
        await db.execute(`
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                start_date DATE,
                end_date DATE,
                is_active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // App settings
        await db.execute(`
            CREATE TABLE IF NOT EXISTS app_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                current_event_id INTEGER REFERENCES events(id),
                camera_permission_granted INTEGER DEFAULT 0,
                currency_code TEXT DEFAULT 'USD',
                currency_locale TEXT DEFAULT 'en-US'
            )
        `);

        // Products table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                price REAL NOT NULL,
                event_id INTEGER REFERENCES events(id),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Pre-orders table  
        await db.execute(`
            CREATE TABLE IF NOT EXISTS preorders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_name TEXT NOT NULL,
                customer_email TEXT NOT NULL,
                confirmation_code TEXT UNIQUE NOT NULL,
                status TEXT DEFAULT 'pending',
                total_amount REAL NOT NULL,
                notes TEXT,
                event_id INTEGER REFERENCES events(id),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                confirmed_at DATETIME
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS order_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                preorder_id INTEGER NOT NULL,
                product_id INTEGER NOT NULL,
                quantity INTEGER NOT NULL,
                unit_price REAL NOT NULL,
                FOREIGN KEY (preorder_id) REFERENCES preorders(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id)
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS smtp_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                smtp_server TEXT NOT NULL,
                smtp_port INTEGER NOT NULL DEFAULT 587,
                username TEXT NOT NULL,
                password TEXT NOT NULL,
                from_email TEXT NOT NULL,
                from_name TEXT DEFAULT 'POTracker'
            )
        `);

        // Add event_id columns if they don't exist (migration for existing DBs)
        try {
            await db.execute('ALTER TABLE products ADD COLUMN event_id INTEGER REFERENCES events(id)');
        } catch { /* Column might already exist */ }

        try {
            await db.execute('ALTER TABLE preorders ADD COLUMN event_id INTEGER REFERENCES events(id)');
        } catch { /* Column might already exist */ }

        // Add image_url column for product images
        try {
            await db.execute('ALTER TABLE products ADD COLUMN image_url TEXT');
        } catch { /* Column might already exist */ }

        // Add currency columns for existing DBs
        try {
            await db.execute('ALTER TABLE app_settings ADD COLUMN currency_code TEXT DEFAULT "USD"');
            await db.execute('ALTER TABLE app_settings ADD COLUMN currency_locale TEXT DEFAULT "en-US"');
        } catch { /* Column might already exist */ }
    }
    return db;
}

// Products hooks
export function useProducts() {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);

    const loadProducts = useCallback(async () => {
        try {
            const database = await getDatabase();
            const result = await database.select<Product[]>('SELECT * FROM products ORDER BY created_at DESC');
            setProducts(result);
        } catch (error) {
            console.error('Failed to load products:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadProducts();
    }, [loadProducts]);

    const addProduct = async (product: Omit<Product, 'id' | 'created_at'>) => {
        const database = await getDatabase();
        await database.execute(
            'INSERT INTO products (name, description, price, image_url) VALUES (?, ?, ?, ?)',
            [product.name, product.description || null, product.price, product.image_url || null]
        );
        await loadProducts();
    };

    const updateProduct = async (id: number, product: Partial<Product>) => {
        const database = await getDatabase();
        await database.execute(
            'UPDATE products SET name = ?, description = ?, price = ?, image_url = ? WHERE id = ?',
            [product.name, product.description || null, product.price, product.image_url || null, id]
        );
        await loadProducts();
    };

    const deleteProduct = async (id: number) => {
        const database = await getDatabase();
        await database.execute('DELETE FROM products WHERE id = ?', [id]);
        await loadProducts();
    };

    return { products, loading, addProduct, updateProduct, deleteProduct, reload: loadProducts };
}

// Pre-orders hooks
export function usePreOrders() {
    const [orders, setOrders] = useState<PreOrder[]>([]);
    const [loading, setLoading] = useState(true);

    const loadOrders = useCallback(async () => {
        try {
            const database = await getDatabase();
            const result = await database.select<PreOrder[]>('SELECT * FROM preorders ORDER BY created_at DESC');
            setOrders(result);
        } catch (error) {
            console.error('Failed to load orders:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadOrders();
    }, [loadOrders]);

    const createOrder = async (
        customerName: string,
        customerEmail: string,
        confirmationCode: string,
        totalAmount: number,
        notes: string | null,
        items: { productId: number; quantity: number; unitPrice: number }[]
    ) => {
        const database = await getDatabase();

        const result = await database.execute(
            'INSERT INTO preorders (customer_name, customer_email, confirmation_code, total_amount, notes) VALUES (?, ?, ?, ?, ?)',
            [customerName, customerEmail, confirmationCode, totalAmount, notes]
        );

        const orderId = result.lastInsertId;

        for (const item of items) {
            await database.execute(
                'INSERT INTO order_items (preorder_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
                [orderId, item.productId, item.quantity, item.unitPrice]
            );
        }

        await loadOrders();
        return orderId;
    };

    const getOrderItems = async (orderId: number) => {
        const database = await getDatabase();
        return await database.select<(OrderItem & { product_name: string })[]>(
            `SELECT oi.*, p.name as product_name 
       FROM order_items oi 
       JOIN products p ON oi.product_id = p.id 
       WHERE oi.preorder_id = ?`,
            [orderId]
        );
    };

    const updateOrderStatus = async (id: number, status: string) => {
        const database = await getDatabase();
        if (status === 'confirmed') {
            await database.execute(
                'UPDATE preorders SET status = ?, confirmed_at = CURRENT_TIMESTAMP WHERE id = ?',
                [status, id]
            );
        } else {
            await database.execute('UPDATE preorders SET status = ? WHERE id = ?', [status, id]);
        }
        await loadOrders();
    };

    const confirmByCode = async (code: string): Promise<PreOrder | null> => {
        const database = await getDatabase();
        const orders = await database.select<PreOrder[]>(
            'SELECT * FROM preorders WHERE confirmation_code = ?',
            [code.toUpperCase()]
        );

        if (orders.length > 0) {
            await database.execute(
                'UPDATE preorders SET status = ?, confirmed_at = CURRENT_TIMESTAMP WHERE confirmation_code = ?',
                ['confirmed', code.toUpperCase()]
            );
            await loadOrders();
            return { ...orders[0], status: 'confirmed' };
        }
        return null;
    };

    const deleteOrder = async (id: number) => {
        const database = await getDatabase();
        await database.execute('DELETE FROM preorders WHERE id = ?', [id]);
        await loadOrders();
    };

    const updateConfirmationCode = async (id: number, newCode: string) => {
        const database = await getDatabase();
        await database.execute(
            'UPDATE preorders SET confirmation_code = ? WHERE id = ?',
            [newCode, id]
        );
        await loadOrders();
    };

    return { orders, loading, createOrder, getOrderItems, updateOrderStatus, confirmByCode, deleteOrder, updateConfirmationCode, reload: loadOrders };
}

// SMTP Settings hooks
export function useSmtpSettings() {
    const [settings, setSettings] = useState<SmtpSettings | null>(null);
    const [loading, setLoading] = useState(true);

    const loadSettings = useCallback(async () => {
        try {
            const database = await getDatabase();
            const result = await database.select<SmtpSettings[]>('SELECT * FROM smtp_settings WHERE id = 1');
            setSettings(result[0] || null);
        } catch (error) {
            console.error('Failed to load SMTP settings:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    const saveSettings = async (newSettings: SmtpSettings) => {
        const database = await getDatabase();
        await database.execute(
            `INSERT OR REPLACE INTO smtp_settings (id, smtp_server, smtp_port, username, password, from_email, from_name) 
       VALUES (1, ?, ?, ?, ?, ?, ?)`,
            [newSettings.smtp_server, newSettings.smtp_port, newSettings.username, newSettings.password, newSettings.from_email, newSettings.from_name || 'POTracker']
        );
        await loadSettings();
    };

    return { settings, loading, saveSettings };
}

// Stats hooks
export function useStats() {
    const [stats, setStats] = useState({
        totalProducts: 0,
        totalOrders: 0,
        pendingOrders: 0,
        confirmedOrders: 0,
        totalRevenue: 0
    });

    const loadStats = useCallback(async () => {
        try {
            const database = await getDatabase();

            const products = await database.select<{ count: number }[]>('SELECT COUNT(*) as count FROM products');
            const orders = await database.select<{ count: number }[]>('SELECT COUNT(*) as count FROM preorders');
            const pending = await database.select<{ count: number }[]>("SELECT COUNT(*) as count FROM preorders WHERE status = 'pending'");
            const confirmed = await database.select<{ count: number }[]>("SELECT COUNT(*) as count FROM preorders WHERE status = 'confirmed'");
            const revenue = await database.select<{ total: number }[]>("SELECT COALESCE(SUM(total_amount), 0) as total FROM preorders WHERE status = 'confirmed'");

            setStats({
                totalProducts: products[0]?.count || 0,
                totalOrders: orders[0]?.count || 0,
                pendingOrders: pending[0]?.count || 0,
                confirmedOrders: confirmed[0]?.count || 0,
                totalRevenue: revenue[0]?.total || 0
            });
        } catch (error) {
            console.error('Failed to load stats:', error);
        }
    }, []);

    useEffect(() => {
        loadStats();
    }, [loadStats]);

    return { stats, reload: loadStats };
}

// Google Auth hooks
export function useGoogleAuth() {
    const [auth, setAuth] = useState<{
        access_token: string;
        refresh_token?: string;
        token_expiry?: string;
        user_email?: string;
        user_name?: string;
    } | null>(null);
    const [config, setConfig] = useState<{
        client_id: string;
        client_secret: string;
    } | null>(null);
    const [loading, setLoading] = useState(true);

    const loadAuth = useCallback(async () => {
        try {
            const database = await getDatabase();

            // Create tables if not exists
            await database.execute(`
                CREATE TABLE IF NOT EXISTS google_auth (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    access_token TEXT NOT NULL,
                    refresh_token TEXT,
                    token_expiry TEXT,
                    user_email TEXT,
                    user_name TEXT,
                    auth_mode TEXT DEFAULT 'oauth',
                    api_key TEXT
                )
            `);

            await database.execute(`
                CREATE TABLE IF NOT EXISTS google_config (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    client_id TEXT NOT NULL,
                    client_secret TEXT NOT NULL
                )
            `);

            const authResult = await database.select<any[]>('SELECT * FROM google_auth WHERE id = 1');
            const configResult = await database.select<any[]>('SELECT * FROM google_config WHERE id = 1');

            setAuth(authResult[0] || null);
            setConfig(configResult[0] || null);
        } catch (error) {
            console.error('Failed to load Google auth:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadAuth();
    }, [loadAuth]);

    const saveConfig = async (clientId: string, clientSecret: string) => {
        const database = await getDatabase();
        await database.execute(
            'INSERT OR REPLACE INTO google_config (id, client_id, client_secret) VALUES (1, ?, ?)',
            [clientId, clientSecret]
        );
        await loadAuth();
    };

    const saveAuth = async (accessToken: string, refreshToken?: string, tokenExpiry?: string, userEmail?: string, userName?: string) => {
        const database = await getDatabase();
        await database.execute(
            'INSERT OR REPLACE INTO google_auth (id, access_token, refresh_token, token_expiry, user_email, user_name) VALUES (1, ?, ?, ?, ?, ?)',
            [accessToken, refreshToken || null, tokenExpiry || null, userEmail || null, userName || null]
        );
        await loadAuth();
    };

    const clearAuth = async () => {
        const database = await getDatabase();
        await database.execute('DELETE FROM google_auth WHERE id = 1');
        await loadAuth();
    };

    return { auth, config, loading, saveConfig, saveAuth, clearAuth, reload: loadAuth };
}

// Google Forms hooks
export function useGoogleForms() {
    const [forms, setForms] = useState<{
        id: number;
        form_id: string;
        form_url: string;
        responder_url: string;
        title: string;
        created_at: string;
        last_synced_at?: string;
    }[]>([]);
    const [syncSettings, setSyncSettings] = useState<{
        auto_sync_enabled: boolean;
        sync_interval_minutes: number;
    }>({ auto_sync_enabled: false, sync_interval_minutes: 15 });
    const [loading, setLoading] = useState(true);

    const loadForms = useCallback(async () => {
        try {
            const database = await getDatabase();

            // Create tables if not exists
            await database.execute(`
                CREATE TABLE IF NOT EXISTS google_forms (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    form_id TEXT UNIQUE NOT NULL,
                    form_url TEXT NOT NULL,
                    responder_url TEXT NOT NULL,
                    title TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_synced_at DATETIME
                )
            `);

            await database.execute(`
                CREATE TABLE IF NOT EXISTS sync_settings (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    auto_sync_enabled INTEGER DEFAULT 0,
                    sync_interval_minutes INTEGER DEFAULT 15
                )
            `);

            // Create synced_responses table to track which responses we've already imported
            await database.execute(`
                CREATE TABLE IF NOT EXISTS synced_responses (
                    response_id TEXT PRIMARY KEY,
                    form_id TEXT NOT NULL,
                    synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            const formsResult = await database.select<any[]>('SELECT * FROM google_forms ORDER BY created_at DESC');
            const settingsResult = await database.select<any[]>('SELECT * FROM sync_settings WHERE id = 1');

            setForms(formsResult);
            if (settingsResult[0]) {
                setSyncSettings({
                    auto_sync_enabled: !!settingsResult[0].auto_sync_enabled,
                    sync_interval_minutes: settingsResult[0].sync_interval_minutes || 15
                });
            }
        } catch (error) {
            console.error('Failed to load Google forms:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadForms();
    }, [loadForms]);

    const saveForm = async (formId: string, formUrl: string, responderUrl: string, title: string) => {
        const database = await getDatabase();
        await database.execute(
            'INSERT OR REPLACE INTO google_forms (form_id, form_url, responder_url, title) VALUES (?, ?, ?, ?)',
            [formId, formUrl, responderUrl, title]
        );
        await loadForms();
    };

    const updateLastSynced = async (formId: string) => {
        const database = await getDatabase();
        await database.execute(
            'UPDATE google_forms SET last_synced_at = CURRENT_TIMESTAMP WHERE form_id = ?',
            [formId]
        );
        await loadForms();
    };

    const saveSyncSettings = async (autoSyncEnabled: boolean, syncIntervalMinutes: number) => {
        const database = await getDatabase();
        await database.execute(
            'INSERT OR REPLACE INTO sync_settings (id, auto_sync_enabled, sync_interval_minutes) VALUES (1, ?, ?)',
            [autoSyncEnabled ? 1 : 0, syncIntervalMinutes]
        );
        await loadForms();
    };

    const isResponseSynced = async (responseId: string): Promise<boolean> => {
        const database = await getDatabase();
        const result = await database.select<any[]>(
            'SELECT 1 FROM synced_responses WHERE response_id = ?',
            [responseId]
        );
        return result.length > 0;
    };

    const markResponseSynced = async (responseId: string, formId: string) => {
        const database = await getDatabase();
        await database.execute(
            'INSERT OR IGNORE INTO synced_responses (response_id, form_id) VALUES (?, ?)',
            [responseId, formId]
        );
    };

    const deleteForm = async (formId: string) => {
        const database = await getDatabase();
        await database.execute('DELETE FROM google_forms WHERE form_id = ?', [formId]);
        await database.execute('DELETE FROM synced_responses WHERE form_id = ?', [formId]);
        await loadForms();
    };

    return {
        forms,
        syncSettings,
        loading,
        saveForm,
        updateLastSynced,
        saveSyncSettings,
        isResponseSynced,
        markResponseSynced,
        deleteForm,
        reload: loadForms
    };
}

// Events hooks
export function useEvents() {
    const [events, setEvents] = useState<Event[]>([]);
    const [loading, setLoading] = useState(true);

    const loadEvents = useCallback(async () => {
        try {
            const database = await getDatabase();
            const result = await database.select<Event[]>('SELECT * FROM events ORDER BY created_at DESC');
            setEvents(result.map(e => ({ ...e, is_active: !!e.is_active })));
        } catch (error) {
            console.error('Failed to load events:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadEvents();
    }, [loadEvents]);

    const addEvent = async (event: Omit<Event, 'id' | 'created_at'>) => {
        const database = await getDatabase();
        await database.execute(
            'INSERT INTO events (name, description, start_date, end_date, is_active) VALUES (?, ?, ?, ?, ?)',
            [event.name, event.description || null, event.start_date || null, event.end_date || null, event.is_active !== false ? 1 : 0]
        );
        await loadEvents();
    };

    const updateEvent = async (id: number, event: Partial<Event>) => {
        const database = await getDatabase();
        await database.execute(
            'UPDATE events SET name = ?, description = ?, start_date = ?, end_date = ?, is_active = ? WHERE id = ?',
            [event.name, event.description || null, event.start_date || null, event.end_date || null, event.is_active !== false ? 1 : 0, id]
        );
        await loadEvents();
    };

    const deleteEvent = async (id: number) => {
        const database = await getDatabase();
        // Clear event reference from products and orders
        await database.execute('UPDATE products SET event_id = NULL WHERE event_id = ?', [id]);
        await database.execute('UPDATE preorders SET event_id = NULL WHERE event_id = ?', [id]);
        await database.execute('DELETE FROM events WHERE id = ?', [id]);
        await loadEvents();
    };

    return { events, loading, addEvent, updateEvent, deleteEvent, reload: loadEvents };
}

// App Settings hooks (camera permission, current event, currency)
export function useAppSettings() {
    const [settings, setSettings] = useState<AppSettings>({
        current_event_id: undefined,
        camera_permission_granted: false,
        currency_code: 'USD',
        currency_locale: 'en-US'
    });
    const [loading, setLoading] = useState(true);

    const loadSettings = useCallback(async () => {
        try {
            const database = await getDatabase();
            // Initialize if empty using INSERT OR IGNORE
            await database.execute('INSERT OR IGNORE INTO app_settings (id, currency_code, currency_locale) VALUES (1, "USD", "en-US")');

            const result = await database.select<any[]>('SELECT * FROM app_settings WHERE id = 1');
            if (result[0]) {
                setSettings({
                    current_event_id: result[0].current_event_id || undefined,
                    camera_permission_granted: !!result[0].camera_permission_granted,
                    currency_code: result[0].currency_code || 'USD',
                    currency_locale: result[0].currency_locale || 'en-US'
                });
            }
        } catch (error) {
            console.error('Failed to load app settings:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    const setCurrentEvent = async (eventId: number | null) => {
        const database = await getDatabase();
        await database.execute(
            'UPDATE app_settings SET current_event_id = ? WHERE id = 1',
            [eventId]
        );
        await loadSettings();
    };

    const setCameraPermission = async (granted: boolean) => {
        const database = await getDatabase();
        await database.execute(
            'UPDATE app_settings SET camera_permission_granted = ? WHERE id = 1',
            [granted ? 1 : 0]
        );
        await loadSettings();
    };

    const resetCameraPermission = async () => {
        await setCameraPermission(false);
    };

    const setCurrency = async (code: string, locale: string) => {
        const database = await getDatabase();
        await database.execute(
            'UPDATE app_settings SET currency_code = ?, currency_locale = ? WHERE id = 1',
            [code, locale]
        );
        await loadSettings();
    };

    return { settings, loading, setCurrentEvent, setCameraPermission, resetCameraPermission, setCurrency, reload: loadSettings };
}

// Hook for using currency formatting anywhere
export function useCurrency() {
    const { settings } = useAppSettings();

    const formatCurrency = (amount: number) => {
        // Fallback to USD if not loaded yet
        const code = settings.currency_code || 'USD';
        const locale = settings.currency_locale || 'en-US';

        try {
            return new Intl.NumberFormat(locale, {
                style: 'currency',
                currency: code
            }).format(amount);
        } catch (error) {
            // Fallback if locale/currency combo is invalid
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD'
            }).format(amount);
        }
    };

    return {
        formatCurrency,
        currencyCode: settings.currency_code || 'USD',
        currencyLocale: settings.currency_locale || 'en-US'
    };
}
