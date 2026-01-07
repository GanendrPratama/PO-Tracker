import { useState, useCallback } from 'react';
import './index.css';
import { Dashboard } from './components/Dashboard';
import { ProductList } from './components/ProductList';
import { OrderForm } from './components/OrderForm';
import { ConfirmOrder } from './components/ConfirmOrder';
import { Settings } from './components/Settings';
import { GoogleForms } from './components/GoogleForms';
import { EventManager } from './components/EventManager';
import { GoogleAuthProvider } from './contexts/GoogleAuthContext';
import { View } from './types';
import { useEvents, useAppSettings } from './hooks/useDatabase';

function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const { events, reload: reloadEvents } = useEvents();
  const { settings: appSettings, setCurrentEvent } = useAppSettings();

  // Force refresh events in sidebar
  const handleEventsChanged = useCallback(() => {
    reloadEvents();
  }, [reloadEvents]);

  const navItems: { id: View; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'events', label: 'Events', icon: '📅' },
    { id: 'products', label: 'Products', icon: '📦' },
    { id: 'new-order', label: 'New Order', icon: '➕' },
    { id: 'google-forms', label: 'Google Forms', icon: '📝' },
    { id: 'confirm', label: 'Confirm Order', icon: '✅' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard />;
      case 'events':
        return <EventManager onEventsChanged={handleEventsChanged} />;
      case 'products':
        return <ProductList />;
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
    <GoogleAuthProvider>
      <div className="app">
        <aside className="sidebar">
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
                onClick={() => setCurrentView(item.id)}
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
      </div>
    </GoogleAuthProvider>
  );
}

export default App;
