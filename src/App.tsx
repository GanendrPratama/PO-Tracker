import { useState, useCallback } from 'react';
import './index.css';
import { Dashboard } from './components/Dashboard';
import { ProductList } from './components/ProductList';
import { OrderList } from './components/OrderList';
import { OrderForm } from './components/OrderForm';
import { ConfirmOrder } from './components/ConfirmOrder';
import { Settings } from './components/Settings';
import { GoogleForms } from './components/GoogleForms';
import { EventManager } from './components/EventManager';

import { View } from './types';
import { useEvents, useAppSettings } from './hooks/useDatabase';
import { useSync } from './hooks/useSync';

// Currency options for the prompt
const CURRENCY_OPTIONS = [
  {
    group: 'Major Currencies', items: [
      { code: 'USD', locale: 'en-US', label: 'USD ($) - US Dollar' },
      { code: 'EUR', locale: 'de-DE', label: 'EUR (€) - Euro' },
      { code: 'GBP', locale: 'en-GB', label: 'GBP (£) - British Pound' },
      { code: 'JPY', locale: 'ja-JP', label: 'JPY (¥) - Japanese Yen' },
      { code: 'AUD', locale: 'en-AU', label: 'AUD ($) - Australian Dollar' },
      { code: 'CAD', locale: 'en-CA', label: 'CAD ($) - Canadian Dollar' },
      { code: 'CHF', locale: 'de-CH', label: 'CHF (Fr) - Swiss Franc' },
      { code: 'CNY', locale: 'zh-CN', label: 'CNY (¥) - Chinese Yuan' },
      { code: 'INR', locale: 'en-IN', label: 'INR (₹) - Indian Rupee' },
    ]
  },
  {
    group: 'Southeast Asia', items: [
      { code: 'IDR', locale: 'id-ID', label: 'IDR (Rp) - Indonesian Rupiah' },
      { code: 'SGD', locale: 'en-SG', label: 'SGD ($) - Singapore Dollar' },
      { code: 'MYR', locale: 'en-MY', label: 'MYR (RM) - Malaysian Ringgit' },
      { code: 'THB', locale: 'th-TH', label: 'THB (฿) - Thai Baht' },
      { code: 'VND', locale: 'vi-VN', label: 'VND (₫) - Vietnamese Dong' },
      { code: 'PHP', locale: 'en-PH', label: 'PHP (₱) - Philippine Peso' },
    ]
  },
  {
    group: 'East Asia', items: [
      { code: 'KRW', locale: 'ko-KR', label: 'KRW (₩) - South Korean Won' },
      { code: 'HKD', locale: 'en-HK', label: 'HKD ($) - Hong Kong Dollar' },
      { code: 'TWD', locale: 'zh-TW', label: 'TWD (NT$) - New Taiwan Dollar' },
    ]
  },
  {
    group: 'Americas', items: [
      { code: 'BRL', locale: 'pt-BR', label: 'BRL (R$) - Brazilian Real' },
      { code: 'MXN', locale: 'es-MX', label: 'MXN ($) - Mexican Peso' },
    ]
  },
  {
    group: 'Europe', items: [
      { code: 'SEK', locale: 'sv-SE', label: 'SEK (kr) - Swedish Krona' },
      { code: 'NOK', locale: 'nb-NO', label: 'NOK (kr) - Norwegian Krone' },
    ]
  },
  {
    group: 'Others', items: [
      { code: 'NZD', locale: 'en-NZ', label: 'NZD ($) - New Zealand Dollar' },
      { code: 'AED', locale: 'en-AE', label: 'AED (د.إ) - UAE Dirham' },
      { code: 'SAR', locale: 'en-SA', label: 'SAR (﷼) - Saudi Riyal' },
      { code: 'ZAR', locale: 'en-ZA', label: 'ZAR (R) - South African Rand' },
    ]
  },
];

function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const { events, reload: reloadEvents } = useEvents();
  const { settings: appSettings, setCurrentEvent, setCurrency, loading: appSettingsLoading } = useAppSettings();
  const [selectedCurrency, setSelectedCurrency] = useState('USD');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Initialize background sync
  useSync();

  // Force refresh events in sidebar
  const handleEventsChanged = useCallback(() => {
    reloadEvents();
  }, [reloadEvents]);

  const handleCurrencySelect = async () => {
    const option = CURRENCY_OPTIONS.flatMap(g => g.items).find(c => c.code === selectedCurrency);
    if (option) {
      await setCurrency(option.code, option.locale);
    }
  };

  // Show currency prompt on first install (currency_set is false)
  const showCurrencyPrompt = !appSettingsLoading && !appSettings.currency_set;

  const navItems: { id: View; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'events', label: 'Events', icon: '📅' },
    { id: 'products', label: 'Products', icon: '📦' },
    { id: 'orders', label: 'Orders', icon: '🛒' },
    { id: 'new-order', label: 'New Order', icon: '➕' },
    { id: 'google-forms', label: 'Google Forms', icon: '📝' },
    { id: 'confirm', label: 'Confirm Order', icon: '✅' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  const currentNavItem = navItems.find(item => item.id === currentView);

  const handleNavClick = (id: View) => {
    setCurrentView(id);
    setMobileMenuOpen(false);
  };

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard />;
      case 'events':
        return <EventManager onEventsChanged={handleEventsChanged} />;
      case 'products':
        return <ProductList />;
      case 'orders':
        return <OrderList />;
      case 'new-order':
        return <OrderForm />;
      case 'google-forms':
        return <GoogleForms />;
      case 'confirm':
        return <ConfirmOrder />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="app">
      {/* Mobile Header */}
      <div className="mobile-header">
        <div className="logo">
          <div className="logo-icon">📋</div>
          <span>POTracker</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            {currentNavItem?.icon} {currentNavItem?.label}
          </span>
          <button
            className="mobile-menu-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {/* Mobile Dropdown Overlay */}
      {mobileMenuOpen && (
        <div className="mobile-menu-backdrop" onClick={() => setMobileMenuOpen(false)} />
      )}

      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo">
            <div className="logo-icon">📋</div>
            <span>POTracker</span>
          </div>
        </div>

        {/* Event Selector */}
        <div style={{
          padding: '0 var(--space-md) var(--space-md)',
          borderBottom: '1px solid var(--color-border)'
        }}>
          <label style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-muted)',
            display: 'block',
            marginBottom: 'var(--space-xs)'
          }}>
            Current Event
          </label>
          <select
            className="form-select"
            value={appSettings.current_event_id || ''}
            onChange={(e) => setCurrentEvent(e.target.value ? parseInt(e.target.value) : null)}
            style={{
              width: '100%',
              fontSize: 'var(--text-sm)',
              padding: 'var(--space-xs) var(--space-sm)',
              background: 'var(--color-bg-secondary)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border)',
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2394a3b8%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 0.7em top 50%',
              backgroundSize: '0.65em auto',
            }}
          >
            <option value="" style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' }}>All Events</option>
            {events.map(event => (
              <option key={event.id} value={event.id} style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' }}>
                {event.name}
              </option>
            ))}
          </select>
        </div>

        <nav className="nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${currentView === item.id ? 'active' : ''}`}
              onClick={() => handleNavClick(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div style={{
          marginTop: 'auto',
          padding: 'var(--space-md)',
          color: 'var(--color-text-muted)',
          fontSize: 'var(--text-xs)',
          textAlign: 'center'
        }}>
          POTracker v1.0
        </div>
      </aside>

      <main className="main-content">
        {renderView()}
      </main>

      {/* Currency Selection Modal - shown on first install */}
      {showCurrencyPrompt && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3 className="modal-title">💰 Select Your Preferred Currency</h3>
            </div>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-lg)' }}>
              Welcome to POTracker! Please choose your preferred currency for prices and invoices. You can change this later in Settings.
            </p>
            <div className="form-group">
              <select
                className="form-select"
                value={selectedCurrency}
                onChange={(e) => setSelectedCurrency(e.target.value)}
                style={{
                  width: '100%',
                  padding: 'var(--space-md)',
                  fontSize: 'var(--text-md)',
                  background: 'var(--color-bg-secondary)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)'
                }}
              >
                {CURRENCY_OPTIONS.map(group => (
                  <optgroup key={group.group} label={group.group}>
                    {group.items.map(item => (
                      <option key={item.code} value={item.code}>{item.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-xl)' }}>
              <button
                className="btn btn-primary"
                onClick={handleCurrencySelect}
                style={{ padding: 'var(--space-md) var(--space-xl)' }}
              >
                ✓ Confirm Currency
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
