import { useState, useEffect } from 'react';
import { useSmtpSettings, useAppSettings } from '../hooks/useDatabase';
import { useGoogleAuthContext } from '../contexts/GoogleAuthContext';

export function Settings() {
    const { settings, loading, saveSettings } = useSmtpSettings();
    const { settings: appSettings, resetCameraPermission, setCurrency } = useAppSettings();
    const {
        auth,
        isAuthenticated,
        isConfigured,
        authMode,
        startAuth,

        setApiKey,
        signOut,
        loading: authLoading
    } = useGoogleAuthContext();

    const [formData, setFormData] = useState({
        smtp_server: '',
        smtp_port: 587,
        username: '',
        password: '',
        from_email: '',
        from_name: 'POTracker'
    });
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [showSmtpConfig, setShowSmtpConfig] = useState(false);

    // Auth modal state
    // Auth modal state - REMOVED (Automatic flow used)

    // API Key state
    const [selectedAuthMode, setSelectedAuthMode] = useState<'oauth' | 'api_key'>('oauth');
    const [apiKeyInput, setApiKeyInput] = useState('');
    const [apiKeyEmail, setApiKeyEmail] = useState('');

    useEffect(() => {
        if (settings) {
            setFormData({
                smtp_server: settings.smtp_server,
                smtp_port: settings.smtp_port,
                username: settings.username,
                password: settings.password,
                from_email: settings.from_email,
                from_name: settings.from_name || 'POTracker'
            });
        }
    }, [settings]);

    // Initialize auth mode from context
    useEffect(() => {
        if (authMode) {
            setSelectedAuthMode(authMode);
        }
    }, [authMode]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setMessage(null);

        try {
            await saveSettings({
                smtp_server: formData.smtp_server,
                smtp_port: formData.smtp_port,
                username: formData.username,
                password: formData.password,
                from_email: formData.from_email,
                from_name: formData.from_name
            });
            setMessage({ type: 'success', text: 'SMTP settings saved successfully!' });
        } catch (error) {
            console.error('Failed to save settings:', error);
            setMessage({ type: 'error', text: 'Failed to save settings' });
        } finally {
            setSaving(false);
        }
    };

    const handleResetCamera = async () => {
        await resetCameraPermission();
        setMessage({ type: 'success', text: 'Camera permission reset! The scanner will ask for permission again.' });
    };

    const handleStartAuth = async () => {
        try {
            await startAuth();
            setMessage({ type: 'success', text: 'Authentication successful!' });
        } catch (error) {
            console.error('Failed to start auth:', error);
            setMessage({ type: 'error', text: `${error}` });
        }
    };



    const handleSignOut = async () => {
        await signOut();
        setApiKeyInput('');
        setApiKeyEmail('');
        setMessage({ type: 'success', text: 'Signed out successfully' });
    };

    const handleSaveApiKey = async () => {
        if (!apiKeyInput.trim()) {
            setMessage({ type: 'error', text: 'Please enter an API key' });
            return;
        }
        try {
            await setApiKey(apiKeyInput.trim(), apiKeyEmail.trim() || undefined);
            setMessage({ type: 'success', text: 'API key saved successfully!' });
        } catch (error) {
            console.error('Failed to save API key:', error);
            setMessage({ type: 'error', text: `Failed to save API key: ${error}` });
        }
    };

    if (loading || authLoading) {
        return (
            <div className="loading">
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Settings</h1>
                <p className="page-subtitle">Configure your Google account and app settings</p>
            </div>

            {/* Google Account Card */}
            <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                <div className="card-header">
                    <h3 className="card-title">🔐 Google Authentication</h3>
                </div>

                {/* Authentication Mode Selector */}
                {!isAuthenticated && (
                    <div style={{ marginBottom: 'var(--space-lg)' }}>
                        <label style={{
                            display: 'block',
                            marginBottom: 'var(--space-sm)',
                            fontWeight: 500,
                            color: 'var(--color-text-primary)'
                        }}>
                            Choose Authentication Method
                        </label>
                        <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
                            <label style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--space-sm)',
                                cursor: 'pointer',
                                padding: 'var(--space-sm) var(--space-md)',
                                border: `2px solid ${selectedAuthMode === 'oauth' ? 'var(--color-primary)' : 'var(--color-border)'}`,
                                borderRadius: 'var(--radius-md)',
                                background: selectedAuthMode === 'oauth' ? 'var(--color-bg-tertiary)' : 'transparent',
                                flex: 1
                            }}>
                                <input
                                    type="radio"
                                    name="authMode"
                                    value="oauth"
                                    checked={selectedAuthMode === 'oauth'}
                                    onChange={(e) => setSelectedAuthMode(e.target.value as 'oauth')}
                                    style={{ width: 18, height: 18 }}
                                />
                                <div>
                                    <div style={{ fontWeight: 500 }}>Google OAuth</div>
                                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                                        Sign in with Google account
                                    </div>
                                </div>
                            </label>
                            <label style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--space-sm)',
                                cursor: 'pointer',
                                padding: 'var(--space-sm) var(--space-md)',
                                border: `2px solid ${selectedAuthMode === 'api_key' ? 'var(--color-primary)' : 'var(--color-border)'}`,
                                borderRadius: 'var(--radius-md)',
                                background: selectedAuthMode === 'api_key' ? 'var(--color-bg-tertiary)' : 'transparent',
                                flex: 1
                            }}>
                                <input
                                    type="radio"
                                    name="authMode"
                                    value="api_key"
                                    checked={selectedAuthMode === 'api_key'}
                                    onChange={(e) => setSelectedAuthMode(e.target.value as 'api_key')}
                                    style={{ width: 18, height: 18 }}
                                />
                                <div>
                                    <div style={{ fontWeight: 500 }}>API Key</div>
                                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                                        Use your own Gmail API key
                                    </div>
                                </div>
                            </label>
                        </div>
                    </div>
                )}

                {/* OAuth Mode */}
                {selectedAuthMode === 'oauth' && !isAuthenticated && (
                    <>
                        {!isConfigured ? (
                            <div className="empty-state">
                                <div className="empty-icon">⚠️</div>
                                <p>Google OAuth is not configured.</p>
                                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginTop: 'var(--space-sm)' }}>
                                    Please set VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_CLIENT_SECRET environment variables.
                                </p>
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: 'var(--space-lg)' }}>
                                <p style={{ marginBottom: 'var(--space-md)', color: 'var(--color-text-secondary)' }}>
                                    Sign in with Google to send emails and manage Google Forms
                                </p>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleStartAuth}
                                    style={{
                                        background: 'linear-gradient(135deg, #4285f4, #34a853)',
                                        padding: 'var(--space-md) var(--space-xl)'
                                    }}
                                >
                                    🚀 Sign in with Google
                                </button>
                            </div>
                        )}
                    </>
                )}

                {/* API Key Mode */}
                {selectedAuthMode === 'api_key' && !isAuthenticated && (
                    <div>
                        <div style={{
                            background: 'var(--color-bg-tertiary)',
                            padding: 'var(--space-md)',
                            borderRadius: 'var(--radius-md)',
                            marginBottom: 'var(--space-lg)',
                            fontSize: 'var(--text-sm)'
                        }}>
                            <p style={{ marginBottom: 'var(--space-sm)' }}>
                                <strong>📝 How to get a Gmail API key:</strong>
                            </p>
                            <ol style={{ marginLeft: 'var(--space-lg)', color: 'var(--color-text-secondary)' }}>
                                <li>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)' }}>Google Cloud Console</a></li>
                                <li>Create a new project or select an existing one</li>
                                <li>Enable Gmail API and Google Forms API</li>
                                <li>Go to Credentials → Create Credentials → API Key</li>
                                <li>Restrict the key to Gmail API and Forms API for security</li>
                            </ol>
                        </div>

                        <div className="form-group" style={{ marginBottom: 'var(--space-md)' }}>
                            <label className="form-label">Gmail API Key *</label>
                            <input
                                type="text"
                                className="form-input"
                                value={apiKeyInput}
                                onChange={(e) => setApiKeyInput(e.target.value)}
                                placeholder="AIzaSy..."
                            />
                        </div>

                        <div className="form-group" style={{ marginBottom: 'var(--space-lg)' }}>
                            <label className="form-label">Your Email (Optional)</label>
                            <input
                                type="email"
                                className="form-input"
                                value={apiKeyEmail}
                                onChange={(e) => setApiKeyEmail(e.target.value)}
                                placeholder="your.email@gmail.com"
                            />
                            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-xs)' }}>
                                Used for display purposes only
                            </p>
                        </div>

                        <button
                            className="btn btn-primary"
                            onClick={handleSaveApiKey}
                            disabled={!apiKeyInput.trim()}
                        >
                            💾 Save API Key
                        </button>
                    </div>
                )}

                {/* Authenticated State */}
                {isAuthenticated && (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                            <div>
                                <p style={{ fontWeight: 500 }}>
                                    ✅ Authenticated {authMode === 'api_key' ? 'with API Key' : 'via Google OAuth'}
                                </p>
                                {auth?.user_email && (
                                    <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                                        {auth.user_email}
                                    </p>
                                )}
                                {auth?.user_name && authMode === 'oauth' && (
                                    <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                                        {auth.user_name}
                                    </p>
                                )}
                            </div>
                            <button className="btn btn-secondary" onClick={handleSignOut}>
                                Sign Out
                            </button>
                        </div>
                        <div style={{
                            background: 'var(--color-bg-tertiary)',
                            padding: 'var(--space-md)',
                            borderRadius: 'var(--radius-md)',
                            fontSize: 'var(--text-sm)',
                            color: 'var(--color-text-secondary)'
                        }}>
                            <p>✅ Gmail API enabled - emails will be sent via {authMode === 'api_key' ? 'your API key' : 'your Google account'}</p>
                            <p>✅ Google Forms API enabled - you can create and sync forms</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Currency Settings Card */}
            <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                <h3 className="card-title" style={{ marginBottom: 'var(--space-lg)' }}>
                    💰 Currency Settings
                </h3>

                <div className="form-group">
                    <label className="form-label">Preferred Currency</label>
                    <select
                        className="form-select"
                        value={appSettings.currency_code || 'USD'}
                        onChange={async (e) => {
                            const code = e.target.value;
                            let locale = 'en-US';
                            switch (code) {
                                case 'IDR': locale = 'id-ID'; break;
                                case 'EUR': locale = 'de-DE'; break;
                                case 'GBP': locale = 'en-GB'; break;
                                case 'JPY': locale = 'ja-JP'; break;
                                case 'AUD': locale = 'en-AU'; break;
                                case 'CAD': locale = 'en-CA'; break;
                                default: locale = 'en-US';
                            }
                            await setCurrency(code, locale);
                            setMessage({ type: 'success', text: `Currency updated to ${code}` });
                        }}
                        style={{
                            background: 'var(--color-bg-secondary)',
                            color: 'var(--color-text-primary)'
                        }}
                    >
                        <option value="USD">USD ($) - US Dollar</option>
                        <option value="IDR">IDR (Rp) - Indonesian Rupiah</option>
                        <option value="EUR">EUR (€) - Euro</option>
                        <option value="GBP">GBP (£) - British Pound</option>
                        <option value="JPY">JPY (¥) - Japanese Yen</option>
                        <option value="AUD">AUD ($) - Australian Dollar</option>
                        <option value="CAD">CAD ($) - Canadian Dollar</option>
                    </select>
                </div>
            </div>

            {/* Camera Settings Card */}
            <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                <h3 className="card-title" style={{ marginBottom: 'var(--space-lg)' }}>
                    📷 Camera Settings
                </h3>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <p style={{ marginBottom: 'var(--space-xs)' }}>Camera Permission Status</p>
                        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                            {appSettings.camera_permission_granted
                                ? '✅ Camera permission granted'
                                : '⏳ Camera permission not yet requested'}
                        </p>
                    </div>
                    <button
                        className="btn btn-secondary"
                        onClick={handleResetCamera}
                    >
                        🔄 Reset Permission
                    </button>
                </div>

                <p style={{
                    marginTop: 'var(--space-md)',
                    color: 'var(--color-text-muted)',
                    fontSize: 'var(--text-sm)',
                    fontStyle: 'italic'
                }}>
                    Resetting will make the QR scanner ask for camera permission again
                </p>
            </div>

            {/* SMTP Fallback Card (Collapsible) */}
            <div className="card">
                <div
                    className="card-header"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setShowSmtpConfig(!showSmtpConfig)}
                >
                    <h3 className="card-title">
                        📧 SMTP Configuration (Optional Fallback)
                    </h3>
                    <span style={{ fontSize: 'var(--text-lg)' }}>
                        {showSmtpConfig ? '▼' : '▶'}
                    </span>
                </div>

                {!showSmtpConfig && (
                    <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-sm)' }}>
                        {isAuthenticated
                            ? 'Using Google account for emails. Click to configure SMTP fallback.'
                            : 'Configure SMTP as an alternative to Google for sending emails.'}
                    </p>
                )}

                {showSmtpConfig && (
                    <form onSubmit={handleSubmit} style={{ marginTop: 'var(--space-lg)' }}>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">SMTP Server *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={formData.smtp_server}
                                    onChange={(e) => setFormData({ ...formData, smtp_server: e.target.value })}
                                    placeholder="smtp.gmail.com"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Port *</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={formData.smtp_port}
                                    onChange={(e) => setFormData({ ...formData, smtp_port: parseInt(e.target.value) })}
                                    placeholder="587"
                                    required
                                />
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Username *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={formData.username}
                                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                    placeholder="your.email@gmail.com"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Password / App Password *</label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        className="form-input"
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        placeholder="Your app password"
                                        required
                                        style={{ paddingRight: '50px' }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        style={{
                                            position: 'absolute',
                                            right: '10px',
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            fontSize: '18px'
                                        }}
                                    >
                                        {showPassword ? '🙈' : '👁️'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">From Email *</label>
                                <input
                                    type="email"
                                    className="form-input"
                                    value={formData.from_email}
                                    onChange={(e) => setFormData({ ...formData, from_email: e.target.value })}
                                    placeholder="noreply@yourstore.com"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">From Name</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={formData.from_name}
                                    onChange={(e) => setFormData({ ...formData, from_name: e.target.value })}
                                    placeholder="POTracker"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={saving}
                            style={{ marginTop: 'var(--space-md)' }}
                        >
                            {saving ? '💾 Saving...' : '💾 Save SMTP Settings'}
                        </button>
                    </form>
                )}
            </div>

            {/* MANUAL AUTH MODAL REMOVED - DO NOT RESTORE */}
            {/* The app uses Automatic OAuth Flow. No code entry is required. */}


            {message && (
                <div className={`toast ${message.type}`}>
                    {message.type === 'success' ? '✅' : '❌'} {message.text}
                </div>
            )}
        </div>
    );
}
