import { useState } from 'react';
import { useEvents, useAppSettings } from '../hooks/useDatabase';
import { Event } from '../types';
import { CustomDatePicker } from './ui/DatePicker';

interface EventManagerProps {
    onEventsChanged?: () => void;
}

export function EventManager({ onEventsChanged }: EventManagerProps) {
    const { events, loading, addEvent, updateEvent, deleteEvent } = useEvents();
    const { settings, setCurrentEvent } = useAppSettings();

    const [showModal, setShowModal] = useState(false);
    const [editingEvent, setEditingEvent] = useState<Event | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        start_date: '',
        end_date: ''
    });
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);

    const openCreateModal = () => {
        setEditingEvent(null);
        setFormData({ name: '', description: '', start_date: '', end_date: '' });
        setShowModal(true);
    };

    const openEditModal = (event: Event) => {
        setEditingEvent(event);
        setFormData({
            name: event.name,
            description: event.description || '',
            start_date: event.start_date || '',
            end_date: event.end_date || ''
        });
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            if (editingEvent?.id) {
                await updateEvent(editingEvent.id, {
                    name: formData.name,
                    description: formData.description || undefined,
                    start_date: formData.start_date || undefined,
                    end_date: formData.end_date || undefined,
                    is_active: true
                });
                setMessage({ type: 'success', text: 'Event updated!' });
            } else {
                await addEvent({
                    name: formData.name,
                    description: formData.description || undefined,
                    start_date: formData.start_date || undefined,
                    end_date: formData.end_date || undefined,
                    is_active: true
                });
                setMessage({ type: 'success', text: 'Event created!' });
            }
            setShowModal(false);
            onEventsChanged?.();
        } catch (error) {
            setMessage({ type: 'error', text: `Failed: ${error}` });
        }
    };

    const handleDelete = async (id: number) => {
        setDeleting(true);
        try {
            await deleteEvent(id);
            setMessage({ type: 'success', text: 'Event deleted' });
            onEventsChanged?.();
        } finally {
            setDeleting(false);
            setDeleteConfirmId(null);
        }
    };

    const handleSetActive = async (eventId: number) => {
        await setCurrentEvent(eventId);
        setMessage({ type: 'success', text: 'Switched to event!' });
        onEventsChanged?.();
    };

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString();
    };

    if (loading) {
        return (
            <div className="loading">
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Events</h1>
                <p className="page-subtitle">Organize products and orders by event or campaign</p>
            </div>

            {/* Current Event Banner */}
            <div className="card" style={{ marginBottom: 'var(--space-lg)', background: 'linear-gradient(135deg, var(--color-accent), var(--color-primary))' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <p style={{ fontSize: 'var(--text-sm)', opacity: 0.8 }}>Current Event</p>
                        <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 600 }}>
                            {settings.current_event_id
                                ? events.find(e => e.id === settings.current_event_id)?.name || 'Unknown Event'
                                : 'All Events (No Filter)'}
                        </h2>
                    </div>
                    {settings.current_event_id && (
                        <button
                            className="btn btn-secondary"
                            onClick={() => setCurrentEvent(null)}
                        >
                            Clear Filter
                        </button>
                    )}
                </div>
            </div>

            {/* Events List */}
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">📅 Your Events</h3>
                    <button className="btn btn-primary" onClick={openCreateModal}>
                        ➕ Create Event
                    </button>
                </div>

                {events.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">📅</div>
                        <h3>No Events Yet</h3>
                        <p>Create your first event to organize products and orders</p>
                        <button className="btn btn-primary" onClick={openCreateModal}>
                            Create Event
                        </button>
                    </div>
                ) : (
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Description</th>
                                    <th>Start Date</th>
                                    <th>End Date</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {events.map((event) => (
                                    <tr key={event.id} style={{
                                        background: settings.current_event_id === event.id
                                            ? 'rgba(99, 102, 241, 0.15)'
                                            : undefined
                                    }}>
                                        <td style={{ fontWeight: 500 }}>
                                            {event.name}
                                            {settings.current_event_id === event.id && (
                                                <span style={{
                                                    marginLeft: 'var(--space-sm)',
                                                    fontSize: 'var(--text-xs)',
                                                    background: 'var(--color-accent)',
                                                    padding: '2px 8px',
                                                    borderRadius: 'var(--radius-sm)'
                                                }}>
                                                    Active
                                                </span>
                                            )}
                                        </td>
                                        <td style={{ color: 'var(--color-text-secondary)' }}>
                                            {event.description || '-'}
                                        </td>
                                        <td>{formatDate(event.start_date)}</td>
                                        <td>{formatDate(event.end_date)}</td>
                                        <td>
                                            <div className="btn-group">
                                                <button
                                                    className="btn btn-primary"
                                                    onClick={() => handleSetActive(event.id!)}
                                                    disabled={settings.current_event_id === event.id}
                                                >
                                                    🎯 Select
                                                </button>
                                                <button
                                                    className="btn btn-secondary"
                                                    onClick={() => openEditModal(event)}
                                                >
                                                    ✏️
                                                </button>
                                                <button
                                                    className="btn btn-icon"
                                                    onClick={() => setDeleteConfirmId(event.id!)}
                                                    style={{ color: 'var(--color-error)' }}
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Info card */}
            <div className="card" style={{ marginTop: 'var(--space-lg)', background: 'var(--color-bg-tertiary)' }}>
                <h4 style={{ marginBottom: 'var(--space-md)' }}>💡 How Events Work</h4>
                <ul style={{ color: 'var(--color-text-secondary)', paddingLeft: 'var(--space-lg)', margin: 0 }}>
                    <li>Select an event to filter products and orders to that event only</li>
                    <li>New products and orders will be linked to the selected event</li>
                    <li>Use "Clear Filter" to view all products and orders across events</li>
                </ul>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">
                                {editingEvent ? 'Edit Event' : 'Create Event'}
                            </h3>
                            <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label className="form-label">Event Name *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g., Christmas Sale 2024"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Description</label>
                                <textarea
                                    className="form-input"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Optional description"
                                    rows={2}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                                <CustomDatePicker
                                    label="Start Date"
                                    selected={formData.start_date ? new Date(formData.start_date + 'T12:00:00') : null}
                                    onChange={(date) => setFormData({
                                        ...formData,
                                        start_date: date ? date.toISOString().split('T')[0] : ''
                                    })}
                                    placeholderText="Select start date"
                                />

                                <CustomDatePicker
                                    label="End Date"
                                    selected={formData.end_date ? new Date(formData.end_date + 'T12:00:00') : null}
                                    onChange={(date) => setFormData({
                                        ...formData,
                                        end_date: date ? date.toISOString().split('T')[0] : ''
                                    })}
                                    placeholderText="Select end date"
                                />
                            </div>

                            <div className="btn-group" style={{ justifyContent: 'flex-end', marginTop: 'var(--space-lg)' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    {editingEvent ? 'Update' : 'Create'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Toast */}
            {message && (
                <div className={`toast ${message.type}`}>
                    {message.text}
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirmId != null && (
                <div className="modal-overlay" onClick={() => setDeleteConfirmId(null)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                        <div className="modal-header">
                            <h3 className="modal-title">⚠️ Delete Event</h3>
                            <button className="modal-close" onClick={() => setDeleteConfirmId(null)}>×</button>
                        </div>
                        <p style={{ marginBottom: 'var(--space-lg)', color: 'var(--color-text-secondary)' }}>
                            Are you sure you want to delete this event? Products and orders will be unlinked.
                        </p>
                        <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
                            <button className="btn btn-secondary" onClick={() => setDeleteConfirmId(null)} disabled={deleting}>
                                Cancel
                            </button>
                            <button className="btn btn-danger" onClick={() => handleDelete(deleteConfirmId)} disabled={deleting}>
                                {deleting ? '⏳ Deleting...' : '🗑️ Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
