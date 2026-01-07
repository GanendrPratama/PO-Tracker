import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import Database from '@tauri-apps/plugin-sql';
import { GoogleAuth } from '../types';

// Get credentials from environment variables (set at build time)
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET || '';


interface GoogleAuthContextValue {
    auth: GoogleAuth | null;
    loading: boolean;
    isAuthenticated: boolean;
    isConfigured: boolean;
    authMode: 'oauth' | 'api_key' | null;
    startAuth: () => Promise<void>;
    handleAuthCode: (code: string) => Promise<void>;
    setApiKey: (apiKey: string, userEmail?: string) => Promise<void>;
    signOut: () => Promise<void>;
    reload: () => Promise<void>;
    getAccessToken: () => string | null;
}

const GoogleAuthContext = createContext<GoogleAuthContextValue | null>(null);

let db: Database | null = null;

async function getDatabase(): Promise<Database> {
    if (!db) {
        db = await Database.load('sqlite:potracker.db');

        // Create tables if not exists
        await db.execute(`
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

        // Force add columns if they don't exist (for existing databases)
        try {
            await db.execute("ALTER TABLE google_auth ADD COLUMN auth_mode TEXT DEFAULT 'oauth'");
        } catch (e) { /* Column likely exists */ }

        try {
            await db.execute("ALTER TABLE google_auth ADD COLUMN api_key TEXT");
        } catch (e) { /* Column likely exists */ }
    }
    return db;
}

interface GoogleAuthProviderProps {
    children: ReactNode;
}

export function GoogleAuthProvider({ children }: GoogleAuthProviderProps) {
    const [auth, setAuth] = useState<GoogleAuth | null>(null);
    const [loading, setLoading] = useState(true);

    const loadAuth = useCallback(async () => {
        try {
            const database = await getDatabase();
            const authResult = await database.select<GoogleAuth[]>('SELECT * FROM google_auth WHERE id = 1');
            setAuth(authResult[0] || null);
        } catch (error) {
            console.error('Failed to load Google auth:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadAuth();
    }, [loadAuth]);

    const saveAuth = async (
        accessToken: string,
        refreshToken?: string,
        tokenExpiry?: string,
        userEmail?: string,
        userName?: string,
        authMode: 'oauth' | 'api_key' = 'oauth',
        apiKey?: string
    ) => {
        const database = await getDatabase();
        await database.execute(
            'INSERT OR REPLACE INTO google_auth (id, access_token, refresh_token, token_expiry, user_email, user_name, auth_mode, api_key) VALUES (1, ?, ?, ?, ?, ?, ?, ?)',
            [accessToken, refreshToken || null, tokenExpiry || null, userEmail || null, userName || null, authMode, apiKey || null]
        );
        await loadAuth();
    };

    const startAuth = async () => {
        if (!GOOGLE_CLIENT_ID) {
            throw new Error('Google OAuth is not configured. Please set VITE_GOOGLE_CLIENT_ID environment variable.');
        }

        try {
            // 1. Start OAuth flow on backend - finds available port and starts server
            // Returns the auth URL with the correct dynamic port redirect URI
            const { auth_url: url, port } = await invoke<{ auth_url: string, port: number }>('start_oauth_flow', {
                clientId: GOOGLE_CLIENT_ID
            });

            console.log(`Starting OAuth flow on port ${port}, opening: ${url}`);

            // 2. Open in external browser using Tauri opener plugin
            await openUrl(url);

            // 3. Wait for callback with the auth code
            // This runs in background until the browser redirects to localhost:port
            const code = await invoke<string>('wait_for_oauth_callback', { port });

            console.log('Received auth code automatically');

            // 4. Exchange code for tokens using the correct dynamic redirect URI
            const redirectUri = `http://localhost:${port}/callback`;

            const tokenResponse: any = await invoke('exchange_google_code', {
                clientId: GOOGLE_CLIENT_ID,
                clientSecret: GOOGLE_CLIENT_SECRET,
                code,
                redirectUri
            });

            // 5. Get user info
            const userInfo: any = await invoke('get_google_user_info', {
                accessToken: tokenResponse.access_token
            });

            const expiry = new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString();

            // 6. Save authentication
            await saveAuth(
                tokenResponse.access_token,
                tokenResponse.refresh_token,
                expiry,
                userInfo.email,
                userInfo.name,
                'oauth'
            );

        } catch (error) {
            console.error('OAuth flow failed:', error);
            throw error;
        }
    };

    const handleAuthCode = async (_code: string) => {
        console.warn('Manual auth code handling is deprecated');
    };

    const setApiKey = async (apiKey: string, userEmail?: string) => {
        await saveAuth(
            apiKey,
            undefined,
            undefined,
            userEmail,
            undefined,
            'api_key',
            apiKey
        );
    };

    const signOut = async () => {
        const database = await getDatabase();
        await database.execute('DELETE FROM google_auth WHERE id = 1');
        await loadAuth();
    };

    const getAccessToken = (): string | null => {
        if (!auth) return null;
        if (auth.auth_mode === 'api_key') {
            return auth.api_key || null;
        }
        return auth.access_token || null;
    };

    const value: GoogleAuthContextValue = {
        auth,
        loading,
        isAuthenticated: !!auth && (!!auth.access_token || !!auth.api_key),
        isConfigured: !!GOOGLE_CLIENT_ID && !!GOOGLE_CLIENT_SECRET,
        authMode: auth?.auth_mode || null,
        startAuth,
        handleAuthCode,
        setApiKey,
        signOut,
        reload: loadAuth,
        getAccessToken
    };

    return (
        <GoogleAuthContext.Provider value={value}>
            {children}
        </GoogleAuthContext.Provider>
    );
}

export function useGoogleAuthContext(): GoogleAuthContextValue {
    const context = useContext(GoogleAuthContext);
    if (!context) {
        throw new Error('useGoogleAuthContext must be used within a GoogleAuthProvider');
    }
    return context;
}
