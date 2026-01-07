import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import QRCode from 'qrcode';
import { invoke } from '@tauri-apps/api/core';
import { useProducts, usePreOrders, useSmtpSettings, useCurrency } from '../hooks/useDatabase';
import { useGoogleAuthContext } from '../contexts/GoogleAuthContext';
import { Product } from '../types';

interface OrderFormProps {
    onOrderCreated?: () => void;
}

export function OrderForm({ onOrderCreated }: OrderFormProps) {
    const { products } = useProducts();
    const { createOrder } = usePreOrders();
    const { settings: smtpSettings } = useSmtpSettings();
    const { auth, isAuthenticated, getAccessToken } = useGoogleAuthContext();
    const { formatCurrency } = useCurrency();

    const [customerName, setCustomerName] = useState('');
    const [customerEmail, setCustomerEmail] = useState('');
    const [notes, setNotes] = useState('');
    const [selectedItems, setSelectedItems] = useState<Map<number, number>>(new Map());
    const [createdOrder, setCreatedOrder] = useState<{
        code: string;
        total: number;
        customerEmail: string;
        customerName: string;
    } | null>(null);
    const [sending, setSending] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const handleQuantityChange = (productId: number, quantity: number) => {
        const newItems = new Map(selectedItems);
        if (quantity <= 0) {
            newItems.delete(productId);
        } else {
            newItems.set(productId, quantity);
        }
        setSelectedItems(newItems);
    };

    const calculateTotal = () => {
        let total = 0;
        selectedItems.forEach((quantity, productId) => {
            const product = products.find(p => p.id === productId);
            if (product) {
                total += product.price * quantity;
            }
        });
        return total;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (selectedItems.size === 0) {
            setMessage({ type: 'error', text: 'Please select at least one product' });
            return;
        }

        try {
            const confirmationCode: string = await invoke('generate_confirmation_code');
            const total = calculateTotal();

            const items: { productId: number; quantity: number; unitPrice: number }[] = [];
            selectedItems.forEach((quantity, productId) => {
                const product = products.find(p => p.id === productId);
                if (product) {
                    items.push({
                        productId,
                        quantity,
                        unitPrice: product.price
                    });
                }
            });

            await createOrder(
                customerName,
                customerEmail,
                confirmationCode,
                total,
                notes || null,
                items
            );

            setCreatedOrder({
                code: confirmationCode,
                total,
                customerEmail,
                customerName
            });

            setMessage({ type: 'success', text: 'Order created successfully!' });
            onOrderCreated?.();
        } catch (error) {
            console.error('Failed to create order:', error);
            setMessage({ type: 'error', text: 'Failed to create order' });
        }
    };

    const generateEmailHtml = (qrCodeUrl: string) => {
        const itemsHtml = Array.from(selectedItems.entries())
            .map(([productId, quantity]) => {
                const product = products.find(p => p.id === productId);
                if (!product) return '';
                const subtotal = product.price * quantity;
                return `<tr>
            <td style="padding: 12px; border-bottom: 1px solid #eee;">${product.name}</td>
            <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">${quantity}</td>
            <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(product.price)}</td>
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
              <h1 style="margin: 0;">🧾 Pre-Order Invoice</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">Thank you for your order!</p>
            </div>
            <div class="content">
              <p>Dear <strong>${createdOrder?.customerName}</strong>,</p>
              <p>Thank you for your pre-order. Please find your order details below:</p>
              
              <div class="code-box">
                <p style="margin: 0 0 10px 0; color: #6b7280;">Your Confirmation Code:</p>
                <div style="text-align: center; margin: 10px 0;">
                    <img src="${qrCodeUrl}" alt="QR Code" width="150" height="150" />
                </div>
                <div class="code">${createdOrder?.code}</div>
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
                <span class="total">Total: ${formatCurrency(createdOrder?.total || 0)}</span>
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

    const sendEmail = async () => {
        if (!createdOrder) {
            setMessage({ type: 'error', text: 'No order to send' });
            return;
        }

        // Check if we can send emails
        if (!isAuthenticated && !smtpSettings) {
            setMessage({ type: 'error', text: 'Please sign in with Google or configure SMTP settings to send emails' });
            return;
        }

        setSending(true);
        try {
            const qrCodeUrl = await QRCode.toDataURL(createdOrder.code);
            const htmlBody = generateEmailHtml(qrCodeUrl);
            const subject = `Pre-Order Invoice - ${createdOrder.code}`;

            const accessToken = getAccessToken();
            if (isAuthenticated && accessToken && auth?.user_email) {
                // Send via Gmail API (works with both OAuth and API key)
                await invoke('send_gmail_email', {
                    accessToken,
                    toEmail: createdOrder.customerEmail,
                    toName: createdOrder.customerName,
                    fromEmail: auth.user_email,
                    fromName: auth.user_name || 'POTracker',
                    subject,
                    htmlBody
                });
                setMessage({ type: 'success', text: 'Invoice email sent via Gmail!' });
            } else if (smtpSettings) {
                // Fallback to SMTP
                await invoke('send_invoice_email', {
                    smtpSettings: smtpSettings,
                    toEmail: createdOrder.customerEmail,
                    toName: createdOrder.customerName,
                    subject,
                    htmlBody
                });
                setMessage({ type: 'success', text: 'Invoice email sent via SMTP!' });
            }
        } catch (error) {
            console.error('Failed to send email:', error);
            setMessage({ type: 'error', text: `Failed to send email: ${error}` });
        } finally {
            setSending(false);
        }
    };

    const resetForm = () => {
        setCustomerName('');
        setCustomerEmail('');
        setNotes('');
        setSelectedItems(new Map());
        setCreatedOrder(null);
        setMessage(null);
    };

    const canSendEmail = isAuthenticated || !!smtpSettings;

    if (createdOrder) {
        return (
            <div>
                <div className="page-header">
                    <h1 className="page-title">Order Created! 🎉</h1>
                    <p className="page-subtitle">Share this confirmation code with your customer</p>
                </div>

                <div className="card">
                    <div className="qr-container">
                        <QRCodeSVG value={createdOrder.code} size={200} level="H" />
                        <div className="confirmation-code">{createdOrder.code}</div>
                    </div>

                    <div className="order-summary">
                        <div className="order-summary-row">
                            <span>Customer</span>
                            <span>{createdOrder.customerName}</span>
                        </div>
                        <div className="order-summary-row">
                            <span>Email</span>
                            <span>{createdOrder.customerEmail}</span>
                        </div>
                        <div className="order-summary-row">
                            <span>Total Amount</span>
                            <span>{formatCurrency(createdOrder.total)}</span>
                        </div>
                    </div>

                    <div className="btn-group" style={{ marginTop: 'var(--space-xl)', justifyContent: 'center' }}>
                        <button
                            className="btn btn-primary"
                            onClick={sendEmail}
                            disabled={sending || !canSendEmail}
                        >
                            {sending ? '📧 Sending...' : '📧 Send Invoice Email'}
                        </button>
                        <button className="btn btn-secondary" onClick={resetForm}>
                            ➕ Create Another Order
                        </button>
                    </div>

                    {!canSendEmail && (
                        <p style={{ textAlign: 'center', color: 'var(--color-warning)', marginTop: 'var(--space-md)' }}>
                            ⚠️ Sign in with Google or configure SMTP in Settings to send emails
                        </p>
                    )}

                    {canSendEmail && (
                        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', marginTop: 'var(--space-md)', fontSize: 'var(--text-sm)' }}>
                            {isAuthenticated
                                ? `📧 Email will be sent from ${auth?.user_email}`
                                : '📧 Email will be sent via SMTP'}
                        </p>
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

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">New Pre-Order</h1>
                <p className="page-subtitle">Create a new pre-order for a customer</p>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                    <h3 className="card-title" style={{ marginBottom: 'var(--space-lg)' }}>Customer Information</h3>

                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Customer Name *</label>
                            <input
                                type="text"
                                className="form-input"
                                value={customerName}
                                onChange={(e) => setCustomerName(e.target.value)}
                                placeholder="Enter customer name"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Email Address *</label>
                            <input
                                type="email"
                                className="form-input"
                                value={customerEmail}
                                onChange={(e) => setCustomerEmail(e.target.value)}
                                placeholder="customer@email.com"
                                required
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Notes</label>
                        <textarea
                            className="form-textarea"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Any additional notes for this order..."
                        />
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                    <h3 className="card-title" style={{ marginBottom: 'var(--space-lg)' }}>Select Products</h3>

                    {products.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-icon">📦</div>
                            <p>No products available. Add products first!</p>
                        </div>
                    ) : (
                        <div>
                            {products.map((product: Product) => {
                                const quantity = selectedItems.get(product.id!) || 0;
                                return (
                                    <div
                                        key={product.id}
                                        className={`product-select-item ${quantity > 0 ? 'selected' : ''}`}
                                    >
                                        <div className="product-info">
                                            <div className="product-name">{product.name}</div>
                                            <div className="product-price">{formatCurrency(product.price)}</div>
                                            {product.description && (
                                                <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', marginTop: '4px' }}>
                                                    {product.description}
                                                </div>
                                            )}
                                        </div>
                                        <input
                                            type="number"
                                            min="0"
                                            className="quantity-input"
                                            value={quantity}
                                            onChange={(e) => handleQuantityChange(product.id!, parseInt(e.target.value) || 0)}
                                            placeholder="0"
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {selectedItems.size > 0 && (
                    <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                        <h3 className="card-title" style={{ marginBottom: 'var(--space-lg)' }}>Order Summary</h3>
                        <div className="order-summary">
                            {Array.from(selectedItems.entries()).map(([productId, quantity]) => {
                                const product = products.find(p => p.id === productId);
                                if (!product) return null;
                                return (
                                    <div key={productId} className="order-summary-row">
                                        <span>{product.name} × {quantity}</span>
                                        <span>{formatCurrency(product.price * quantity)}</span>
                                    </div>
                                );
                            })}
                            <div className="order-summary-row">
                                <span>Total</span>
                                <span>{formatCurrency(calculateTotal())}</span>
                            </div>
                        </div>
                    </div>
                )}

                <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ width: '100%', padding: 'var(--space-md)' }}
                    disabled={products.length === 0}
                >
                    Create Pre-Order
                </button>
            </form>

            {message && (
                <div className={`toast ${message.type}`}>
                    {message.text}
                </div>
            )}
        </div>
    );
}
