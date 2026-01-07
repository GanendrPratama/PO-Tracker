import { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Html5Qrcode } from 'html5-qrcode';
import { invoke } from '@tauri-apps/api/core';
import { usePreOrders, useSmtpSettings } from '../hooks/useDatabase';
import { useGoogleAuthContext } from '../contexts/GoogleAuthContext';
import { PreOrder } from '../types';

export function ConfirmOrder() {
    const { confirmByCode } = usePreOrders();
    const { settings: smtpSettings } = useSmtpSettings();
    const { auth, isAuthenticated, getAccessToken } = useGoogleAuthContext();

    const [code, setCode] = useState('');
    const [confirmedOrder, setConfirmedOrder] = useState<PreOrder | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [scannerActive, setScannerActive] = useState(false);
    const [scannerError, setScannerError] = useState('');
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const scannerDivRef = useRef<HTMLDivElement>(null);

    // Cleanup scanner on unmount
    useEffect(() => {
        return () => {
            if (scannerRef.current) {
                scannerRef.current.stop().catch(() => { });
            }
        };
    }, []);

    const startScanner = async () => {
        setScannerError('');

        // First check if getUserMedia is available
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setScannerError('Camera not supported in this environment. Please use manual code entry.');
            return;
        }

        try {
            // Pre-check camera permission
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            // Stop the stream immediately - we just needed to check permission
            stream.getTracks().forEach(track => track.stop());
        } catch (permErr: any) {
            console.error('Camera permission check failed:', permErr);
            if (permErr.name === 'NotAllowedError' || permErr.name === 'PermissionDeniedError') {
                setScannerError('Camera permission denied. Please allow camera access in your browser/system settings.');
            } else if (permErr.name === 'NotFoundError') {
                setScannerError('No camera found on this device.');
            } else {
                setScannerError(`Camera access failed: ${permErr.message || permErr.name}`);
            }
            return;
        }

        try {
            // Clean up existing scanner if any
            if (scannerRef.current) {
                try {
                    await scannerRef.current.stop();
                } catch {
                    // Ignore
                }
                scannerRef.current = null;
            }

            scannerRef.current = new Html5Qrcode('qr-reader');

            await scannerRef.current.start(
                { facingMode: 'environment' },
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 },
                },
                async (decodedText) => {
                    // QR code scanned successfully
                    setCode(decodedText.toUpperCase());
                    await stopScanner();

                    // Auto-submit
                    handleConfirm(decodedText.toUpperCase());
                },
                () => {
                    // QR code not found in frame - this is normal
                }
            );

            setScannerActive(true);
        } catch (err: any) {
            console.error('Failed to start scanner:', err);
            setScannerError(`Failed to start camera scanner: ${err.message || err}`);
        }
    };

    const stopScanner = async () => {
        if (scannerRef.current) {
            try {
                await scannerRef.current.stop();
            } catch (err) {
                // Ignore errors when stopping
            }
        }
        setScannerActive(false);
    };

    const generateConfirmedEmailHtml = (customerName: string, orderCode: string) => {
        return `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
            .order-info { background: white; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">✅ Order Confirmed</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">Your order has been successfully picked up!</p>
            </div>
            <div class="content">
              <p>Dear <strong>${customerName}</strong>,</p>
              <p>This email is to confirm that your order <strong>${orderCode}</strong> has been successfully processed and picked up.</p>
              
              <div class="order-info">
                <p style="margin: 0;"><strong>Status:</strong> Confirmed & Completed</p>
                <p style="margin: 5px 0 0 0;"><strong>Time:</strong> ${new Date().toLocaleString()}</p>
              </div>

              <p>Thank you for your business!</p>
            </div>
            <div class="footer">
              <p>This is an automated email from POTracker</p>
            </div>
          </div>
        </body>
        </html>
        `;
    };

    const handleConfirm = async (confirmCode: string) => {
        setError('');
        setLoading(true);

        try {
            const order = await confirmByCode(confirmCode);
            if (order) {
                setConfirmedOrder(order);

                // Send confirmation email
                try {
                    const htmlBody = generateConfirmedEmailHtml(order.customer_name, order.confirmation_code || 'Unknown');
                    const subject = `Order Confirmed - ${order.confirmation_code}`;
                    const accessToken = getAccessToken();

                    if (isAuthenticated && accessToken && auth?.user_email) {
                        await invoke('send_gmail_email', {
                            accessToken,
                            toEmail: order.customer_email,
                            toName: order.customer_name,
                            fromEmail: auth.user_email,
                            fromName: auth.user_name || 'POTracker',
                            subject,
                            htmlBody
                        });
                        console.log('Confirmation email sent via Gmail');
                    } else if (smtpSettings) {
                        await invoke('send_invoice_email', {
                            smtpSettings: smtpSettings,
                            toEmail: order.customer_email,
                            toName: order.customer_name,
                            subject,
                            htmlBody
                        });
                        console.log('Confirmation email sent via SMTP');
                    }
                } catch (emailErr) {
                    console.error('Failed to send confirmation email:', emailErr);
                    // Don't block the UI for email failure, just log it
                }

            } else {
                setError('Invalid confirmation code. Please check and try again.');
            }
        } catch (err) {
            console.error('Failed to confirm order:', err);
            setError('Failed to confirm order. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await handleConfirm(code);
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    };

    const resetForm = () => {
        setCode('');
        setConfirmedOrder(null);
        setError('');
        setScannerError('');
    };

    if (confirmedOrder) {
        return (
            <div>
                <div className="page-header">
                    <h1 className="page-title">Order Confirmed! ✅</h1>
                    <p className="page-subtitle">This order has been successfully confirmed</p>
                </div>

                <div className="card" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '4rem', marginBottom: 'var(--space-lg)' }}>🎉</div>

                    <div className="qr-container">
                        <QRCodeSVG value={confirmedOrder.confirmation_code || ''} size={150} level="H" />
                        <div className="confirmation-code">{confirmedOrder.confirmation_code}</div>
                    </div>

                    <div className="order-summary" style={{ textAlign: 'left' }}>
                        <div className="order-summary-row">
                            <span>Customer</span>
                            <span>{confirmedOrder.customer_name}</span>
                        </div>
                        <div className="order-summary-row">
                            <span>Email</span>
                            <span>{confirmedOrder.customer_email}</span>
                        </div>
                        <div className="order-summary-row">
                            <span>Status</span>
                            <span className="status-badge confirmed">{confirmedOrder.status}</span>
                        </div>
                        <div className="order-summary-row">
                            <span>Total Amount</span>
                            <span>{formatCurrency(confirmedOrder.total_amount)}</span>
                        </div>
                    </div>

                    <button
                        className="btn btn-primary"
                        onClick={resetForm}
                        style={{ marginTop: 'var(--space-xl)' }}
                    >
                        Confirm Another Order
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Confirm Order</h1>
                <p className="page-subtitle">Scan QR code or enter confirmation code to verify an order</p>
            </div>

            {/* QR Scanner Section */}
            <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                <h3 className="card-title" style={{ marginBottom: 'var(--space-lg)' }}>
                    📷 Scan QR Code
                </h3>

                <div
                    id="qr-reader"
                    ref={scannerDivRef}
                    style={{
                        width: '100%',
                        maxWidth: '400px',
                        margin: '0 auto',
                        borderRadius: 'var(--radius-lg)',
                        overflow: 'hidden',
                        display: scannerActive ? 'block' : 'none'
                    }}
                />

                {!scannerActive ? (
                    <div style={{ textAlign: 'center' }}>
                        <button
                            className="btn btn-primary"
                            onClick={startScanner}
                            style={{
                                padding: 'var(--space-md) var(--space-xl)',
                                fontSize: 'var(--text-lg)'
                            }}
                        >
                            📷 Start Camera Scanner
                        </button>
                        <p style={{
                            marginTop: 'var(--space-md)',
                            color: 'var(--color-text-secondary)',
                            fontSize: 'var(--text-sm)'
                        }}>
                            Point your camera at the QR code on the customer's invoice
                        </p>
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', marginTop: 'var(--space-lg)' }}>
                        <button
                            className="btn btn-secondary"
                            onClick={stopScanner}
                        >
                            ✖️ Stop Scanner
                        </button>
                    </div>
                )}

                {scannerError && (
                    <div style={{
                        color: 'var(--color-error)',
                        marginTop: 'var(--space-lg)',
                        padding: 'var(--space-md)',
                        background: 'rgba(239, 68, 68, 0.1)',
                        borderRadius: 'var(--radius-md)',
                        textAlign: 'center'
                    }}>
                        ⚠️ {scannerError}
                    </div>
                )}
            </div>

            {/* Manual Code Entry */}
            <div className="card">
                <h3 className="card-title" style={{ marginBottom: 'var(--space-lg)' }}>
                    ⌨️ Or Enter Code Manually
                </h3>

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Confirmation Code</label>
                        <input
                            type="text"
                            className="form-input"
                            value={code}
                            onChange={(e) => setCode(e.target.value.toUpperCase())}
                            placeholder="Enter 8-character code"
                            style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: 'var(--text-xl)',
                                textAlign: 'center',
                                letterSpacing: '0.2em',
                                textTransform: 'uppercase'
                            }}
                            maxLength={8}
                            required
                        />
                    </div>

                    {error && (
                        <div style={{
                            color: 'var(--color-error)',
                            marginBottom: 'var(--space-lg)',
                            padding: 'var(--space-md)',
                            background: 'rgba(239, 68, 68, 0.1)',
                            borderRadius: 'var(--radius-md)'
                        }}>
                            ❌ {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="btn btn-success"
                        style={{ width: '100%' }}
                        disabled={loading || code.length < 1}
                    >
                        {loading ? '🔍 Searching...' : '✅ Confirm Order'}
                    </button>
                </form>
            </div>
        </div>
    );
}
