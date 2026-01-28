import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import QRCode from 'qrcode';
import { useGoogleAuthContext } from '../contexts/GoogleAuthContext';
import { useGoogleForms, useProducts, usePreOrders, useSmtpSettings, useEvents } from '../hooks/useDatabase';
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

interface ScannedProject {
    folder_id: string;
    name: string;
    form?: {
        form_id: string;
        name: string;
        url: string;
        responder_url: string;
    };
    products_json?: string;
}

interface ScannedProject {
    folder_id: string;
    name: string;
    form?: {
        form_id: string;
        name: string;
        url: string;
        responder_url: string;
    };
    products_json?: string;
}

export function GoogleForms() {
    const { auth, isAuthenticated, isConfigured, startAuth, signOut, getAccessToken, loading: authLoading } = useGoogleAuthContext();
    const { forms, syncSettings, saveForm, updateLastSynced, saveSyncSettings, isResponseSynced, markResponseSynced, deleteForm, loading: formsLoading } = useGoogleForms();
    const { products } = useProducts();
    const { events } = useEvents();
    const { createOrder } = usePreOrders();
    const { settings: smtpSettings } = useSmtpSettings();

    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [creating, setCreating] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [showFormEditor, setShowFormEditor] = useState(false);
    const [orderedProducts, setOrderedProducts] = useState<Product[]>([]);
    const [projects, setProjects] = useState<ScannedProject[]>([]); // New state for projects containing forms

    // Form Creation Options
    const [selectionMode, setSelectionMode] = useState<'manual' | 'event'>('manual');
    const [selectedEventId, setSelectedEventId] = useState<string>('');

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

        let productsToUse: Product[] = [];

        if (selectionMode === 'event') {
            if (!selectedEventId) {
                setMessage({ type: 'error', text: 'Please select an event first' });
                return;
            }
            productsToUse = products.filter(p => p.event_id?.toString() === selectedEventId);
        } else {
            productsToUse = orderedProducts.length > 0 ? orderedProducts : products;
        }

        if (productsToUse.length === 0) {
            setMessage({ type: 'error', text: 'No products available for selected option. Add products first!' });
            return;
        }

        setCreating(true);
        try {
            // Get Event Name if applicable
            let titleSuffix = new Date().toLocaleDateString();
            if (selectionMode === 'event') {
                const event = events.find(e => e.id?.toString() === selectedEventId);
                if (event) titleSuffix = event.name;
            }
            const title = `Pre-Order Form - ${titleSuffix}`;

            // Create form (and folder, and products.json)
            const formResponse: any = await invoke('create_google_form', {
                accessToken,
                title,
                productsJson: JSON.stringify(productsToUse)
            });

            // Upload product images and build questions with Drive URLs
            const questions = [];
            for (const p of productsToUse) {
                // Build description with prices
                const baseCurrency = p.currency_code || 'USD';
                const priceStrs = [`${baseCurrency} ${p.price.toLocaleString()}`];

                if (p.prices && p.prices.length > 0) {
                    p.prices.forEach(pp => {
                        priceStrs.push(`${pp.currency_code} ${pp.price.toLocaleString()}`);
                    });
                }
                const description = `Price: ${priceStrs.join(' / ')}`;

                let imageUrl = '';

                // If product has an image URL, check if it's a local asset that needs uploading
                if (p.image_url) {
                    if (p.image_url.startsWith('asset://') || p.image_url.startsWith('https://asset.localhost/')) {
                        // Local image - need to upload to Drive
                        try {
                            // Read the local file and convert to base64
                            const response = await fetch(p.image_url);
                            const blob = await response.blob();
                            const arrayBuffer = await blob.arrayBuffer();
                            const base64 = btoa(
                                new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
                            );

                            // Get mime type
                            const mimeType = blob.type || 'image/png';
                            const ext = mimeType.split('/')[1] || 'png';
                            const imageName = `${p.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.${ext}`;

                            // Upload to Drive
                            const driveUrl: string = await invoke('upload_product_image', {
                                accessToken,
                                projectFolderId: formResponse.projectFolderId,
                                imageName,
                                imageDataBase64: base64,
                                mimeType
                            });

                            imageUrl = driveUrl;
                            console.log(`Uploaded image for ${p.name}: ${driveUrl}`);
                        } catch (imgError) {
                            console.error(`Failed to upload image for ${p.name}:`, imgError);
                        }
                    } else if (p.image_url.startsWith('http://') || p.image_url.startsWith('https://')) {
                        // Remote URL - use directly (Forms can handle these)
                        imageUrl = p.image_url;
                    }
                }

                questions.push({
                    name: p.name,
                    price: p.price,
                    description_override: description,
                    id: p.id,
                    image_url: imageUrl
                });
            }

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

    const handleScanProjects = async () => {
        const accessToken = getAccessToken();
        if (!accessToken) {
            setMessage({ type: 'error', text: 'Please sign in to Google first.' });
            return;
        }

        setScanning(true);
        try {
            setMessage({ type: 'success', text: 'Scanning "po-tracker" folders...' });

            const scannedProjects: ScannedProject[] = await invoke('scan_project_folders', { accessToken });

            setProjects(scannedProjects);

            let newCount = 0;
            // Auto-import forms if they exist in the project
            for (const proj of scannedProjects) {
                if (proj.form) {
                    const exists = forms.some(f => f.form_id === proj.form!.form_id);
                    if (!exists) {
                        await saveForm(proj.form.form_id, proj.form.url, proj.form.responder_url, proj.name);
                        newCount++;
                    }
                }
            }

            if (newCount > 0) {
                setMessage({ type: 'success', text: `Found ${scannedProjects.length} projects and imported ${newCount} new form(s)!` });
            } else if (scannedProjects.length === 0) {
                setMessage({ type: 'error', text: 'No project folders found.' });
            } else {
                setMessage({ type: 'success', text: `Found ${scannedProjects.length} projects. All forms synced.` });
            }
        } catch (error) {
            console.error('Failed to scan projects:', error);
            setMessage({ type: 'error', text: `Failed to scan projects: ${error}` });
        } finally {
            setScanning(false);
        }
    };

    // View products in a project
    const handleViewProjectProducts = (proj: ScannedProject) => {
        if (!proj.products_json) {
            alert('No product data found for this project.');
            return;
        }
        try {
            const products: Product[] = JSON.parse(proj.products_json);
            console.log("Project Products:", products);
            // Could show a modal here, for now just alert count
            alert(`Project "${proj.name}" has ${products.length} configured products.\n\n(Check console for details)`);
        } catch (e) {
            alert('Failed to parse product data.');
        }
    };

    const handleDeleteProject = async (folderId: string, name: string) => {
        if (!window.confirm(`Are you sure you want to delete the project folder "${name}"?\n\nThis will move the folder and its contents to the Trash in Google Drive.`)) {
            return;
        }

        const accessToken = getAccessToken();
        if (!accessToken) return;

        try {
            setMessage({ type: 'success', text: 'Deleting project...' });
            await invoke('delete_drive_file', { accessToken, fileId: folderId });
            setMessage({ type: 'success', text: `Project "${name}" moved to trash.` });

            // Remove from list
            setProjects(prev => prev.filter(p => p.folder_id !== folderId));
        } catch (error) {
            console.error('Failed to delete project:', error);
            setMessage({ type: 'error', text: `Failed to delete project: ${error}` });
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
                        Create a new Google Form.
                        Forms are automatically organized in a <strong>'po-tracker'</strong> folder in your Google Drive.
                    </p>

                    <div style={{ marginBottom: 'var(--space-md)', padding: 'var(--space-md)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                        <label className="form-label" style={{ marginBottom: '8px' }}>Select Products Source:</label>
                        <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input
                                    type="radio"
                                    name="selectionMode"
                                    checked={selectionMode === 'manual'}
                                    onChange={() => setSelectionMode('manual')}
                                />
                                All Products / Manual Layout
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input
                                    type="radio"
                                    name="selectionMode"
                                    checked={selectionMode === 'event'}
                                    onChange={() => setSelectionMode('event')}
                                />
                                By Event
                            </label>
                        </div>

                        {selectionMode === 'event' && (
                            <div className="form-group">
                                <select
                                    className="form-input"
                                    value={selectedEventId}
                                    onChange={(e) => setSelectedEventId(e.target.value)}
                                >
                                    <option value="">-- Select Event --</option>
                                    {events.map(e => (
                                        <option key={e.id} value={e.id}>{e.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

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
                            onClick={handleScanProjects}
                            disabled={scanning}
                        >
                            {scanning ? '⏳ Scanning...' : '📂 Scan Projects'}
                        </button>
                    </div>
                </div>
            )
            }

            {/* Scanned Projects List */}
            {projects.length > 0 && (
                <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                    <div className="card-header">
                        <h3 className="card-title">📁 Cloud Projects</h3>
                    </div>
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Project Name</th>
                                    <th>Form Status</th>
                                    <th>Products Config</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {projects.map(proj => (
                                    <tr key={proj.folder_id}>
                                        <td style={{ fontWeight: 500 }}>{proj.name}</td>
                                        <td>
                                            {proj.form ? <span style={{ color: 'green' }}>✅ Linked</span> : <span style={{ color: 'orange' }}>⚠️ Missing Form</span>}
                                        </td>
                                        <td>
                                            {proj.products_json ? <span style={{ color: 'green' }}>✅ Saved</span> : <span style={{ color: 'gray' }}>Not available</span>}
                                        </td>
                                        <td>
                                            <div className="btn-group">
                                                {proj.products_json && (
                                                    <button
                                                        className="btn btn-sm btn-secondary"
                                                        onClick={() => handleViewProjectProducts(proj)}
                                                        title="View Configured Products"
                                                    >
                                                        👁️
                                                    </button>
                                                )}
                                                <button
                                                    className="btn btn-icon"
                                                    onClick={() => handleDeleteProject(proj.folder_id, proj.name)}
                                                    title="Delete Project Folder"
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
                </div>
            )}

            {/* Existing Forms */}
            {
                forms.length > 0 && (
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
                )
            }

            {/* Sync Settings */}
            {
                isAuthenticated && (
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
                )
            }



            {/* Form Editor Modal */}
            {
                showFormEditor && (
                    <FormEditor
                        products={orderedProducts.length > 0 ? orderedProducts : products}
                        onSave={handleFormEditorSave}
                        onCancel={() => setShowFormEditor(false)}
                    />
                )
            }

            {/* Toast */}
            {
                message && (
                    <div className={`toast ${message.type}`}>
                        {message.text}
                    </div>
                )
            }
        </div >
    );
}
