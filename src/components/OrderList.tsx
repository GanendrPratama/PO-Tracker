import { useState, useEffect, useCallback } from 'react';
import { usePreOrders, useCurrency } from '../hooks/useDatabase';
import { PreOrder, OrderItemDetail } from '../types';
import { QRCodeSVG } from 'qrcode.react';

export function OrderList() {
    const { orders, loading, getOrderItems, updateOrderStatus, deleteOrder, reload } = usePreOrders();
    const { formatCurrency } = useCurrency();
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'sent'>('all');

    // Modal state
    const [selectedOrder, setSelectedOrder] = useState<PreOrder | null>(null);
    const [modalItems, setModalItems] = useState<OrderItemDetail[]>([]);
    const [modalItemsLoading, setModalItemsLoading] = useState(false);

    useEffect(() => {
        reload();
    }, [reload]);

    const openModal = useCallback(async (order: PreOrder) => {
        setSelectedOrder(order);
        setModalItemsLoading(true);
        try {
            const items: any[] = await getOrderItems(order.id!);
            const details: OrderItemDetail[] = items.map(item => ({
                id: item.id || 0,
                product_name: item.product_name,
                quantity: item.quantity,
                unit_price: item.unit_price,
                subtotal: item.quantity * item.unit_price
            }));
            setModalItems(details);
        } catch (error) {
            console.error('Failed to load order items:', error);
        } finally {
            setModalItemsLoading(false);
        }
    }, [getOrderItems]);

    const closeModal = useCallback(() => {
        setSelectedOrder(null);
        setModalItems([]);
    }, []);

    // Close modal on Escape key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeModal();
        };
        if (selectedOrder) {
            document.addEventListener('keydown', handleEsc);
            return () => document.removeEventListener('keydown', handleEsc);
        }
    }, [selectedOrder, closeModal]);

    const handleDelete = async (id: number) => {
        await deleteOrder(id);
        if (selectedOrder?.id === id) closeModal();
    };

    const handleStatusChange = async (id: number, newStatus: string) => {
        await updateOrderStatus(id, newStatus);
    };

    const filteredOrders = orders.filter(order => {
        const matchesSearch =
            order.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            order.customer_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (order.confirmation_code && order.confirmation_code.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (order.notes && order.notes.toLowerCase().includes(searchTerm.toLowerCase()));

        const matchesStatus = statusFilter === 'all' || order.status === statusFilter;

        return matchesSearch && matchesStatus;
    });

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
                <h1 className="page-title">Orders</h1>
                <p className="page-subtitle">Manage and view all pre-orders</p>
            </div>

            <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                <div style={{ display: 'flex', gap: 'var(--space-md)', padding: 'var(--space-md)' }}>
                    <div style={{ flex: 1 }}>
                        <input
                            type="text"
                            placeholder="🔍 Search by name, email, code, or notes..."
                            className="form-input"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <select
                        className="form-select"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as any)}
                        style={{ width: '200px' }}
                    >
                        <option value="all">All Statuses</option>
                        <option value="pending">Pending</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="sent">Sent</option>
                    </select>
                </div>
            </div>

            <div className="card">
                <div className="table-container">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Customer</th>
                                <th>Code</th>
                                <th>Status</th>
                                <th>Notes</th>
                                <th style={{ textAlign: 'right' }}>Total</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredOrders.length === 0 ? (
                                <tr>
                                    <td colSpan={7} style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
                                        No orders found matching your criteria.
                                    </td>
                                </tr>
                            ) : (
                                filteredOrders.map(order => (
                                    <tr
                                        key={order.id}
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => openModal(order)}
                                    >
                                        <td>{new Date(order.created_at || '').toLocaleDateString()}</td>
                                        <td>
                                            <div style={{ fontWeight: 500 }}>{order.customer_name}</div>
                                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                                                {order.customer_email}
                                            </div>
                                        </td>
                                        <td>
                                            <span className="badge" style={{ fontFamily: 'monospace' }}>
                                                {order.confirmation_code}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`status-badge status-${order.status}`}>
                                                {order.status}
                                            </span>
                                        </td>
                                        <td>
                                            {order.notes ? (
                                                <span
                                                    style={{
                                                        maxWidth: '150px',
                                                        display: 'inline-block',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                        color: 'var(--color-text-secondary)',
                                                        fontSize: 'var(--text-sm)'
                                                    }}
                                                    title={order.notes}
                                                >
                                                    📝 {order.notes}
                                                </span>
                                            ) : (
                                                <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>—</span>
                                            )}
                                        </td>
                                        <td style={{ textAlign: 'right', fontWeight: 500 }}>
                                            {formatCurrency(order.total_amount)}
                                        </td>
                                        <td>
                                            <div className="btn-group" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    className="btn btn-sm btn-secondary"
                                                    onClick={() => openModal(order)}
                                                >
                                                    👁️ View
                                                </button>
                                                <button
                                                    className="btn btn-icon"
                                                    onClick={() => handleDelete(order.id!)}
                                                    title="Delete Order"
                                                    style={{ color: 'var(--color-error)' }}
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Order Detail Modal */}
            {selectedOrder && (
                <div className="modal-overlay" onClick={closeModal}>
                    <div className="modal modal-lg" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px', maxHeight: '90vh', overflow: 'auto' }}>
                        <div className="modal-header">
                            <h3 className="modal-title">
                                📦 Order Details
                            </h3>
                            <button className="modal-close" onClick={closeModal}>×</button>
                        </div>

                        <div style={{ padding: 'var(--space-lg)' }}>
                            {/* Customer Info + QR Code Row */}
                            <div style={{ display: 'flex', gap: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
                                {/* Customer Info */}
                                <div style={{ flex: 1 }}>
                                    <div style={{ marginBottom: 'var(--space-md)' }}>
                                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: '2px' }}>Customer</div>
                                        <div style={{ fontWeight: 600, fontSize: 'var(--text-lg)' }}>{selectedOrder.customer_name}</div>
                                        <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>{selectedOrder.customer_email}</div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)' }}>
                                        <div>
                                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Date</div>
                                            <div style={{ fontSize: 'var(--text-sm)' }}>{new Date(selectedOrder.created_at || '').toLocaleString()}</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Status</div>
                                            <select
                                                className={`status-badge status-${selectedOrder.status}`}
                                                value={selectedOrder.status}
                                                onChange={(e) => {
                                                    handleStatusChange(selectedOrder.id!, e.target.value);
                                                    setSelectedOrder({ ...selectedOrder, status: e.target.value as any });
                                                }}
                                                style={{ border: 'none', cursor: 'pointer', marginTop: '2px' }}
                                            >
                                                <option value="pending">Pending</option>
                                                <option value="confirmed">Confirmed</option>
                                                <option value="sent">Sent</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* QR Code + Confirmation Code */}
                                {selectedOrder.confirmation_code && (
                                    <div style={{ textAlign: 'center', flexShrink: 0 }}>
                                        <QRCodeSVG value={selectedOrder.confirmation_code} size={120} level="H" />
                                        <div style={{
                                            fontFamily: 'monospace',
                                            fontSize: 'var(--text-lg)',
                                            fontWeight: 700,
                                            color: 'var(--color-primary)',
                                            letterSpacing: '2px',
                                            marginTop: 'var(--space-xs)'
                                        }}>
                                            {selectedOrder.confirmation_code}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Notes */}
                            {selectedOrder.notes && (
                                <div style={{
                                    background: 'var(--bg-secondary)',
                                    borderRadius: 'var(--radius-md)',
                                    padding: 'var(--space-md)',
                                    marginBottom: 'var(--space-lg)',
                                    border: '1px solid var(--color-border)'
                                }}>
                                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-xs)' }}>📝 Notes</div>
                                    <div style={{ fontSize: 'var(--text-sm)', whiteSpace: 'pre-wrap' }}>{selectedOrder.notes}</div>
                                </div>
                            )}

                            {/* Items Table */}
                            <div style={{
                                background: 'var(--bg-secondary)',
                                borderRadius: 'var(--radius-md)',
                                overflow: 'hidden',
                                border: '1px solid var(--color-border)'
                            }}>
                                <div style={{ padding: 'var(--space-sm) var(--space-md)', borderBottom: '1px solid var(--color-border)' }}>
                                    <strong style={{ fontSize: 'var(--text-sm)' }}>Order Items</strong>
                                </div>
                                {modalItemsLoading ? (
                                    <div style={{ textAlign: 'center', padding: 'var(--space-lg)' }}>Loading items...</div>
                                ) : (
                                    <table className="table" style={{ fontSize: 'var(--text-sm)' }}>
                                        <thead>
                                            <tr>
                                                <th>Product</th>
                                                <th style={{ textAlign: 'center' }}>Qty</th>
                                                <th style={{ textAlign: 'right' }}>Unit Price</th>
                                                <th style={{ textAlign: 'right' }}>Subtotal</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {modalItems.map((item, idx) => (
                                                <tr key={idx}>
                                                    <td>{item.product_name}</td>
                                                    <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                                                    <td style={{ textAlign: 'right' }}>{formatCurrency(item.unit_price)}</td>
                                                    <td style={{ textAlign: 'right' }}>{formatCurrency(item.subtotal)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr>
                                                <td colSpan={3} style={{ textAlign: 'right', fontWeight: 600, paddingRight: 'var(--space-md)' }}>Total</td>
                                                <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 'var(--text-base)', color: 'var(--color-primary)' }}>
                                                    {formatCurrency(selectedOrder.total_amount)}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                )}
                            </div>

                            {/* Footer Actions */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)', marginTop: 'var(--space-lg)' }}>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => {
                                        handleDelete(selectedOrder.id!);
                                    }}
                                    style={{ color: 'var(--color-error)' }}
                                >
                                    🗑️ Delete Order
                                </button>
                                <button className="btn btn-primary" onClick={closeModal}>
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
