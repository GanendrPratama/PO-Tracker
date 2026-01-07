import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import QRCode from 'qrcode';
import { useStats, usePreOrders, useSmtpSettings } from '../hooks/useDatabase';
import { useGoogleAuthContext } from '../contexts/GoogleAuthContext';

export function Dashboard() {
    const { stats } = useStats();
    const { orders, deleteOrder, updateConfirmationCode, getOrderItems } = usePreOrders(); // Updated destructuring
    const { settings: smtpSettings } = useSmtpSettings();
    const { auth, isAuthenticated, getAccessToken } = useGoogleAuthContext();

    const [showCodes, setShowCodes] = useState(false);
    const [processingId, setProcessingId] = useState<number | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    };

    const formatDate = (dateStr: string | undefined) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const generateEmailHtml = (
        customerName: string,
        code: string,
        items: { product_name: string; quantity: number; unit_price: number }[],
        total: number,
        qrCodeUrl: string
    ) => {
        const itemsHtml = items
            .map((item) => {
                const subtotal = item.unit_price * item.quantity;
                return `<tr>
            <td style="padding: 12px; border-bottom: 1px solid #eee;">${item.product_name}</td>
            <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
            <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(item.unit_price)}</td>
            <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(subtotal)}</td>
          </tr>`;
            })
            .join('');

        return `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #6366f1, #a855f7); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
            .code-box { background: white; border: 2px dashed #6366f1; padding: 20px; text-align: center; margin: 20px 0; border-radius: 10px; }
            .code { font-size: 32px; font-weight: bold; color: #6366f1; letter-spacing: 4px; font-family: monospace; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; background: white; }
            th { background: #f3f4f6; padding: 12px; text-align: left; font-weight: 600; }
            .total { font-size: 24px; font-weight: bold; color: #6366f1; }
            .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">🧾 Reprocessed Invoice</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">Here is your updated confirmation code.</p>
            </div>
            <div class="content">
              <p>Dear <strong>${customerName}</strong>,</p>
              <p>Your order details have been reprocessed. Please use the new confirmation code below:</p>
              
              <div class="code-box">
                <p style="margin: 0 0 10px 0; color: #6b7280;">New Confirmation Code:</p>
                <div style="text-align: center; margin: 10px 0;">
                    <img src="${qrCodeUrl}" alt="QR Code" width="150" height="150" />
                </div>
                <div class="code">${code}</div>
                <p style="margin: 10px 0 0 0; color: #6b7280; font-size: 14px;">Present this code to confirm your order pickup</p>
              </div>
              
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th style="text-align: center;">Qty</th>
                    <th style="text-align: right;">Price</th>
                    <th style="text-align: right;">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHtml}
                </tbody>
              </table>
              
              <div style="text-align: right; padding: 20px; background: white; border-radius: 10px;">
                <span class="total">Total: ${formatCurrency(total)}</span>
              </div>
            </div>
            <div class="footer">
              <p>This is an automated email from POTracker</p>
            </div>
          </div>
        </body>
        </html>
      `;
    };

    const handleDelete = async (id: number) => {
        if (confirm('Are you sure you want to delete this order? This action cannot be undone.')) {
            setProcessingId(id);
            try {
                await deleteOrder(id);
                setMessage({ type: 'success', text: 'Order deleted successfully' });
            } catch (error) {
                console.error('Failed to delete order:', error);
                setMessage({ type: 'error', text: 'Failed to delete order' });
            } finally {
                setProcessingId(null);
            }
        }
    };

    const handleResendInvoice = async (orderId: number, customerName: string, customerEmail: string, totalAmount: number) => {
        if (!confirm('This will generate a NEW confirmation code and email it to the customer. Continue?')) {
            return;
        }

        setProcessingId(orderId);
        try {
            // 1. Generate new code
            const newCode: string = await invoke('generate_confirmation_code');

            // 2. Update DB
            await updateConfirmationCode(orderId, newCode);

            // 3. Get Items for email
            const items = await getOrderItems(orderId);

            // 4. Send Email
            const qrCodeUrl = await QRCode.toDataURL(newCode);
            const htmlBody = generateEmailHtml(customerName, newCode, items, totalAmount, qrCodeUrl);
            const subject = `Updated Order Invoice - ${newCode}`;
            const accessToken = getAccessToken();

            if (isAuthenticated && accessToken && auth?.user_email) {
                await invoke('send_gmail_email', {
                    accessToken,
                    toEmail: customerEmail,
                    toName: customerName,
                    fromEmail: auth.user_email,
                    fromName: auth.user_name || 'POTracker',
                    subject,
                    htmlBody
                });
                setMessage({ type: 'success', text: `New code generated (${newCode}) and email sent!` });
            } else if (smtpSettings) {
                await invoke('send_invoice_email', {
                    smtpSettings: smtpSettings,
                    toEmail: customerEmail,
                    toName: customerName,
                    subject,
                    htmlBody
                });
                setMessage({ type: 'success', text: `New code generated (${newCode}) and email sent!` });
            } else {
                setMessage({ type: 'error', text: 'New code generated, but email failed (No email settings configured).' });
            }

        } catch (error) {
            console.error('Failed to reprocessing order:', error);
            setMessage({ type: 'error', text: `Failed to reprocess order: ${error}` });
        } finally {
            setProcessingId(null);
        }
    };

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Dashboard</h1>
                <p className="page-subtitle">Overview of your pre-orders and products</p>
            </div>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-value">{stats.totalProducts}</div>
                    <div className="stat-label">Total Products</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{stats.totalOrders}</div>
                    <div className="stat-label">Total Orders</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{stats.pendingOrders}</div>
                    <div className="stat-label">Pending Orders</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{stats.confirmedOrders}</div>
                    <div className="stat-label">Confirmed Orders</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{formatCurrency(stats.totalRevenue)}</div>
                    <div className="stat-label">Total Revenue</div>
                </div>
            </div>

            <div className="card">
                <div className="card-header">
                    <h2 className="card-title">Recent Orders</h2>
                </div>

                {orders.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">📦</div>
                        <p>No orders yet. Create your first pre-order!</p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>
                                        Code
                                        <button
                                            className="btn-icon"
                                            onClick={() => setShowCodes(!showCodes)}
                                            style={{ marginLeft: '8px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.2em' }}
                                            title={showCodes ? "Hide Codes" : "Show Codes"}
                                        >
                                            {showCodes ? '👁️' : '🔒'}
                                        </button>
                                    </th>
                                    <th>Customer</th>
                                    <th>Email</th>
                                    <th>Amount</th>
                                    <th>Status</th>
                                    <th>Created</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders.slice(0, 10).map((order) => (
                                    <tr key={order.id}>
                                        <td>
                                            <code style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                                                {showCodes ? order.confirmation_code : '••••••••'}
                                            </code>
                                        </td>
                                        <td>{order.customer_name}</td>
                                        <td>{order.customer_email}</td>
                                        <td>{formatCurrency(order.total_amount)}</td>
                                        <td>
                                            <span className={`status-badge ${order.status}`}>
                                                {order.status}
                                            </span>
                                        </td>
                                        <td>{formatDate(order.created_at)}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button
                                                    className="btn btn-sm"
                                                    onClick={() => handleResendInvoice(order.id!, order.customer_name, order.customer_email, order.total_amount)}
                                                    disabled={processingId === order.id}
                                                    title="Regenerate Code & Resend Email"
                                                    style={{ padding: '4px 8px', fontSize: '0.9em' }}
                                                >
                                                    {processingId === order.id ? '⏳' : '🔄'}
                                                </button>
                                                <button
                                                    className="btn btn-sm btn-danger"
                                                    onClick={() => handleDelete(order.id!)}
                                                    disabled={processingId === order.id}
                                                    title="Delete Order"
                                                    style={{ padding: '4px 8px', fontSize: '0.9em', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '4px' }}
                                                >
                                                    {processingId === order.id ? 'Deleting...' : 'Delete'}
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

            {message && (
                <div className={`toast ${message.type}`}>
                    {message.text}
                </div>
            )}
        </div>
    );
}
