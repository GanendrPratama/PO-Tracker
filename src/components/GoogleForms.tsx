import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import QRCode from 'qrcode';
import { useGoogleAuthContext } from '../contexts/GoogleAuthContext';
import { useGoogleForms, useProducts, usePreOrders, useSmtpSettings } from '../hooks/useDatabase';
import { FormEditor } from './FormEditor';
import { Product } from '../types';

interface FormResponse {
    responseId: string;
    createTime: string;
    answers?: Record<string, { questionId: string; textAnswers?: { answers: { value: string }[] } }>;
}

interface GoogleFormDetails {
    formId: string;
    items?: FormItem[];
}

interface FormItem {
    itemId: string;
    title?: string;
    questionItem?: {
        question: {
            questionId: string;
        }
    }
}

export function GoogleForms() {
    const { auth, isAuthenticated, isConfigured, startAuth, signOut, getAccessToken, loading: authLoading } = useGoogleAuthContext();
    const { forms, syncSettings, saveForm, updateLastSynced, saveSyncSettings, isResponseSynced, markResponseSynced, deleteForm, loading: formsLoading } = useGoogleForms();
    const { products } = useProducts();
    const { createOrder } = usePreOrders();
    const { settings: smtpSettings } = useSmtpSettings();

    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [creating, setCreating] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [showFormEditor, setShowFormEditor] = useState(false);
    const [orderedProducts, setOrderedProducts] = useState<Product[]>([]);

    // Initialize ordered products when products change
    useEffect(() => {
        if (products.length > 0 && orderedProducts.length === 0) {
            setOrderedProducts(products);
        }
    }, [products, orderedProducts.length]);

    // Auto-sync timer
    useEffect(() => {
        if (!syncSettings.auto_sync_enabled || !getAccessToken() || forms.length === 0) return;

        const interval = setInterval(() => {
            syncAllForms();
        }, syncSettings.sync_interval_minutes * 60 * 1000);

        return () => clearInterval(interval);
    }, [syncSettings, auth, forms]);

    const startGoogleAuth = async () => {
        try {
            await startAuth();
        } catch (error) {
            console.error('Failed to start auth:', error);
            setMessage({ type: 'error', text: `Failed to start authentication: ${error}` });
        }
    };



    const handleSignOut = async () => {
        await signOut();
        setMessage({ type: 'success', text: 'Signed out successfully' });
    };

    const createPreOrderForm = async () => {
        const accessToken = getAccessToken();
        if (!accessToken) {
            setMessage({ type: 'error', text: 'Please sign in with Google first' });
            return;
        }

        const productsToUse = orderedProducts.length > 0 ? orderedProducts : products;

        if (productsToUse.length === 0) {
            setMessage({ type: 'error', text: 'No products available. Add products first!' });
            return;
        }

        setCreating(true);
        try {
            const title = `Pre-Order Form - ${new Date().toLocaleDateString()}`;

            // Create form
            const formResponse: any = await invoke('create_google_form', {
                accessToken,
                title
            });

            // Add questions with ordered products
            const questions = productsToUse.map(p => ({
                name: p.name,
                price: p.price,
                id: p.id
            }));

            await invoke('add_form_questions', {
                accessToken,
                formId: formResponse.formId,
                questions
            });

            // Save form to database
            await saveForm(
                formResponse.formId,
                `https://docs.google.com/forms/d/${formResponse.formId}/edit`,
                formResponse.responderUri,
                title
            );

            setMessage({ type: 'success', text: 'Form created successfully!' });
        } catch (error) {
            console.error('Failed to create form:', error);
            setMessage({ type: 'error', text: `Failed to create form: ${error}` });
        } finally {
            setCreating(false);
        }
    };

    const handleScanDrive = async () => {
        const accessToken = getAccessToken();
        if (!accessToken) {
            setMessage({ type: 'error', text: 'Please sign in to Google first.' });
            return;
        }

        setScanning(true);
        try {
            setMessage({ type: 'success', text: 'Scanning "po-tracker" folder in Drive...' });

            interface ScannedForm {
                form_id: string;
                name: string;
                url: string;
                responder_url: string;
            }

            const scannedForms: ScannedForm[] = await invoke('scan_drive_forms', { accessToken });

            let newCount = 0;
            for (const form of scannedForms) {
                // Check if already exists locally
                const exists = forms.some(f => f.form_id === form.form_id);
                if (!exists) {
                    await saveForm(form.form_id, form.url, form.responder_url, form.name);
                    newCount++;
                }
            }

            if (newCount > 0) {
                setMessage({ type: 'success', text: `Found and imported ${newCount} form(s) from Drive!` });
            } else if (scannedForms.length === 0) {
                setMessage({ type: 'error', text: 'No forms found in "po-tracker" folder.' });
            } else {
                setMessage({ type: 'success', text: 'All forms in Drive are already synced.' });
            }
        } catch (error) {
            console.error('Failed to scan Drive:', error);
            setMessage({ type: 'error', text: `Failed to scan Drive: ${error}` });
        } finally {
            setScanning(false);
        }
    };

    const handleFormEditorSave = (newOrder: Product[]) => {
        setOrderedProducts(newOrder);
        setShowFormEditor(false);
        setMessage({ type: 'success', text: 'Form layout updated!' });
    };

    const syncFormResponses = async (formId: string) => {
        const accessToken = getAccessToken();
        if (!accessToken) return;

        try {
            // 1. Get form definition to map Question IDs
            const formDetails: GoogleFormDetails = await invoke('get_form_details', {
                accessToken,
                formId
            });

            // Build Question ID maps
            const nameQuestionId = formDetails.items?.find(i => i.title === 'Your Name')?.questionItem?.question.questionId;
            const emailQuestionId = formDetails.items?.find(i => i.title === 'Your Email')?.questionItem?.question.questionId;

            // Map: QuestionID -> ProductName
            const productQuestionMap = new Map<string, string>(); // ID -> Name

            formDetails.items?.forEach(item => {
                if (item.title?.startsWith('Quantity: ') && item.questionItem) {
                    const productName = item.title.replace('Quantity: ', '').trim();
                    productQuestionMap.set(item.questionItem.question.questionId, productName);
                }
            });

            // 2. Get responses
            const responsesData: any = await invoke('get_form_responses', {
                accessToken,
                formId
            });

            if (!responsesData.responses) return 0;

            let imported = 0;

            for (const response of responsesData.responses as FormResponse[]) {
                // Check if already synced
                const alreadySynced = await isResponseSynced(response.responseId);
                if (alreadySynced) continue;

                const answers = response.answers || {};

                // Extract customer info using mapped IDs
                let customerName = 'Unknown';
                let customerEmail = 'unknown@email.com';

                if (nameQuestionId && answers[nameQuestionId]?.textAnswers?.answers[0]?.value) {
                    customerName = answers[nameQuestionId].textAnswers!.answers[0].value;
                }

                if (emailQuestionId && answers[emailQuestionId]?.textAnswers?.answers[0]?.value) {
                    customerEmail = answers[emailQuestionId].textAnswers!.answers[0].value;
                }

                // Extract products
                const items: { productId: number; quantity: number; unitPrice: number }[] = [];
                let totalAmount = 0;

                // Iterate over all answers to find product quantities
                for (const [questionId, answer] of Object.entries(answers)) {
                    if (productQuestionMap.has(questionId)) {
                        const productName = productQuestionMap.get(questionId);
                        const product = products.find(p => p.name === productName);

                        if (product) {
                            const quantityStr = answer.textAnswers?.answers[0]?.value || '0';
                            const quantity = parseInt(quantityStr) || 0;

                            if (quantity > 0) {
                                items.push({
                                    productId: product.id!,
                                    quantity,
                                    unitPrice: product.price
                                });
                                totalAmount += product.price * quantity;
                            }
                        }
                    }
                }

                if (items.length > 0) {
                    // Generate confirmation code
                    const confirmationCode: string = await invoke('generate_confirmation_code');

                    // Create order
                    await createOrder(
                        customerName,
                        customerEmail,
                        confirmationCode,
                        totalAmount,
                        `Imported from Google Form on ${new Date().toLocaleString()}`,
                        items
                    );

                    // Send Email
                    try {
                        const qrCodeUrl = await QRCode.toDataURL(confirmationCode);
                        const htmlBody = generateEmailHtml(customerName, confirmationCode, items, totalAmount, qrCodeUrl);
                        const subject = `Pre-Order Invoice - ${confirmationCode}`;

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
                            console.log(`Sent invoice email to ${customerEmail} via Gmail`);
                        } else if (smtpSettings) {
                            await invoke('send_invoice_email', {
                                smtpSettings: smtpSettings,
                                toEmail: customerEmail,
                                toName: customerName,
                                subject,
                                htmlBody
                            });
                            console.log(`Sent invoice email to ${customerEmail} via SMTP`);
                        }
                    } catch (emailError) {
                        console.error('Failed to send invoice email:', emailError);
                        // Don't fail the sync - just log error
                        setMessage({ type: 'error', text: `Order created but email failed: ${emailError}` });
                    }

                    imported++;
                }

                // Mark as synced
                await markResponseSynced(response.responseId, formId);
            }

            return imported;
        } catch (error) {
            console.error('Failed to sync responses:', error);
            throw error;
        }
    };

    const syncAllForms = useCallback(async () => {
        const accessToken = getAccessToken();
        if (!accessToken || syncing) return;

        setSyncing(true);
        let totalImported = 0;

        try {
            for (const form of forms) {
                const imported = await syncFormResponses(form.form_id);
                await updateLastSynced(form.form_id);
                totalImported += imported || 0;
            }

            if (totalImported > 0) {
                setMessage({ type: 'success', text: `Imported ${totalImported} new order(s)!` });
            } else {
                setMessage({ type: 'success', text: 'No new responses to import' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: `Sync failed: ${error}` });
        } finally {
            setSyncing(false);
        }
    }, [auth, forms, syncing]);

    const formatDate = (dateStr: string | undefined) => {
        if (!dateStr) return 'Never';
        return new Date(dateStr).toLocaleString();
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    };

    const generateEmailHtml = (
        customerName: string,
        code: string,
        items: { productId: number; quantity: number; unitPrice: number }[],
        total: number,
        qrCodeUrl: string
    ) => {
        const itemsHtml = items
            .map((item) => {
                const product = products.find(p => p.id === item.productId);
                const productName = product ? product.name : 'Unknown Product';
                const subtotal = item.unitPrice * item.quantity;
                return `<tr>
            <td style="padding: 12px; border-bottom: 1px solid #eee;">${productName}</td>
            <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
            <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(item.unitPrice)}</td>
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
              <p>Dear <strong>${customerName}</strong>,</p>
              <p>Thank you for your pre-order. Please find your order details below:</p>
              
              <div class="code-box">
                <p style="margin: 0 0 10px 0; color: #6b7280;">Your Confirmation Code:</p>
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

    if (authLoading || formsLoading) {
        return (
            <div className="loading">
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Google Forms</h1>
                <p className="page-subtitle">Create and manage pre-order forms with Google Forms</p>
            </div>

            {/* Google Account Status Banner */}
            <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                <div className="card-header">
                    <h3 className="card-title">🔐 Google Account</h3>
                </div>

                {!isConfigured ? (
                    <div className="empty-state">
                        <div className="empty-icon">⚠️</div>
                        <p>Google OAuth is not configured.</p>
                        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginTop: 'var(--space-sm)' }}>
                            Please set environment variables in .env file.
                        </p>
                    </div>
                ) : !isAuthenticated ? (
                    <div style={{ textAlign: 'center', padding: 'var(--space-lg)' }}>
                        <button
                            className="btn btn-primary"
                            onClick={startGoogleAuth}
                            style={{
                                background: 'linear-gradient(135deg, #4285f4, #34a853)',
                                padding: 'var(--space-md) var(--space-xl)'
                            }}
                        >
                            🚀 Sign in with Google
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <p style={{ fontWeight: 500 }}>✅ Signed in as: {auth?.user_email}</p>
                            {auth?.user_name && (
                                <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                                    {auth.user_name}
                                </p>
                            )}
                        </div>
                        <button className="btn btn-secondary" onClick={handleSignOut}>
                            Sign Out
                        </button>
                    </div>
                )}
            </div>

            {/* Create Form Card */}
            {isAuthenticated && (
                <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                    <div className="card-header">
                        <h3 className="card-title">📝 Create Pre-Order Form</h3>
                        <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowFormEditor(true)}
                                disabled={products.length === 0}
                            >
                                ✏️ Edit Layout
                            </button>
                        </div>
                    </div>
                    <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-lg)' }}>
                        Create a new Google Form with your {products.length} product(s).
                        Forms are automatically organized in a <strong>'po-tracker'</strong> folder in your Google Drive.
                    </p>
                    <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
                        <button
                            className="btn btn-primary"
                            onClick={createPreOrderForm}
                            disabled={creating || products.length === 0}
                        >
                            {creating ? '⏳ Creating...' : '➕ Create New Form'}
                        </button>
                        <button
                            className="btn btn-secondary"
                            onClick={handleScanDrive}
                            disabled={scanning}
                        >
                            {scanning ? '⏳ Scanning...' : '📂 Scan Drive for Forms'}
                        </button>
                    </div>
                </div>
            )}

            {/* Existing Forms */}
            {forms.length > 0 && (
                <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                    <div className="card-header">
                        <h3 className="card-title">📋 Your Forms</h3>
                        <button
                            className="btn btn-primary"
                            onClick={syncAllForms}
                            disabled={syncing}
                        >
                            {syncing ? '⏳ Syncing...' : '🔄 Sync All'}
                        </button>
                    </div>

                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Title</th>
                                    <th>Created</th>
                                    <th>Last Synced</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {forms.map((form) => (
                                    <tr key={form.id}>
                                        <td style={{ fontWeight: 500 }}>{form.title}</td>
                                        <td>{formatDate(form.created_at)}</td>
                                        <td>{formatDate(form.last_synced_at)}</td>
                                        <td>
                                            <div className="btn-group">
                                                <a
                                                    href={form.responder_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="btn btn-secondary"
                                                    style={{ textDecoration: 'none' }}
                                                >
                                                    📝 Fill
                                                </a>
                                                <a
                                                    href={form.form_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="btn btn-secondary"
                                                    style={{ textDecoration: 'none' }}
                                                >
                                                    ✏️ Edit
                                                </a>
                                                <button
                                                    className="btn btn-icon"
                                                    onClick={() => deleteForm(form.form_id)}
                                                    title="Remove"
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
                </div>
            )}

            {/* Sync Settings */}
            {isAuthenticated && (
                <div className="card">
                    <h3 className="card-title" style={{ marginBottom: 'var(--space-lg)' }}>⏰ Auto-Sync Settings</h3>

                    <div style={{ display: 'flex', gap: 'var(--space-lg)', alignItems: 'center', flexWrap: 'wrap' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={syncSettings.auto_sync_enabled}
                                onChange={(e) => saveSyncSettings(e.target.checked, syncSettings.sync_interval_minutes)}
                                style={{ width: 20, height: 20 }}
                            />
                            Enable auto-sync
                        </label>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                            <span>Sync every</span>
                            <input
                                type="number"
                                className="form-input"
                                value={syncSettings.sync_interval_minutes}
                                onChange={(e) => saveSyncSettings(syncSettings.auto_sync_enabled, Math.max(1, parseInt(e.target.value) || 1))}
                                style={{ width: 80, padding: '4px 8px' }}
                                min="1"
                            />
                            <span>minutes</span>
                        </div>
                    </div>
                </div>
            )}



            {/* Form Editor Modal */}
            {showFormEditor && (
                <FormEditor
                    products={orderedProducts.length > 0 ? orderedProducts : products}
                    onSave={handleFormEditorSave}
                    onCancel={() => setShowFormEditor(false)}
                />
            )}

            {/* Toast */}
            {message && (
                <div className={`toast ${message.type}`}>
                    {message.text}
                </div>
            )}
        </div>
    );
}
