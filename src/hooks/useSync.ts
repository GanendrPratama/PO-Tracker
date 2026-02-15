import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import QRCode from 'qrcode';
import { useGoogleAuthContext } from '../contexts/GoogleAuthContext';
import { useGoogleForms, useProducts, useInvoiceTemplate, usePreOrders, useSmtpSettings } from './useDatabase';

interface FormResponse {
    responseId: string;
    createTime: string;
    answers?: Record<string, { questionId: string; textAnswers?: { answers: { value: string }[] } }>;
}

export function useSync() {
    const { auth, isAuthenticated, getAccessToken } = useGoogleAuthContext();
    const { forms, syncSettings, updateLastSynced, isResponseSynced, markResponseSynced, saveSyncSettings } = useGoogleForms();
    const { products } = useProducts();
    const { createOrder } = usePreOrders({ autoLoad: false });
    const { settings: smtpSettings } = useSmtpSettings();

    const [syncing, setSyncing] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Microservice URL - can be configured via environment
    const SYNC_MICROSERVICE_URL = import.meta.env.VITE_SYNC_MICROSERVICE_URL || 'http://localhost:3001';

    // Get Google Clieny Secret from environment variables (available at build time)
    const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
    const GOOGLE_CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET || '';



    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    };

    const { template } = useInvoiceTemplate();

    const generateEmailHtml = (
        customerName: string,
        code: string,
        items: { productId: number; quantity: number; unitPrice: number }[],
        total: number,
        qrCodeUrl: string,
        bannerCid?: string,
        qrCid?: string
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

        // Prepare Header Style
        let headerStyle = `padding: 30px; text-align: center; border-radius: 10px 10px 0 0; color: white;`;
        if (template.use_banner_image && template.banner_image_url) {
            headerStyle += `background-color: ${template.primary_color};`;
        } else {
            headerStyle += `background: linear-gradient(135deg, ${template.primary_color}, ${template.secondary_color});`;
        }

        let bannerSrc = template.banner_image_url;
        if (bannerCid) {
            bannerSrc = `cid:${bannerCid}`;
        }

        const bannerHtml = (template.use_banner_image && template.banner_image_url)
            ? `<div style="text-align: center; background-color: ${template.primary_color}; border-radius: 10px 10px 0 0; overflow: hidden;">
                 <img src="${bannerSrc}" alt="Banner" style="width: 100%; max-height: 200px; object-fit: cover; display: block;" />
                 <div style="margin-top: -60px; padding-bottom: 20px; position: relative;">
                    <h1 style="margin: 0; text-shadow: 0 2px 4px rgba(0,0,0,0.5); color: white;">🧾 ${template.header_title}</h1>
                    <p style="margin: 5px 0 0 0; opacity: 0.9; text-shadow: 0 1px 2px rgba(0,0,0,0.5); color: white;">${template.header_subtitle}</p>
                 </div>
               </div>`
            : `<div class="header" style="${headerStyle}">
                  <h1 style="margin: 0;">🧾 ${template.header_title}</h1>
                  <p style="margin: 10px 0 0 0; opacity: 0.9;">${template.header_subtitle}</p>
               </div>`;

        return `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
            .code-box { background: white; border: 2px dashed ${template.primary_color}; padding: 20px; text-align: center; margin: 20px 0; border-radius: 10px; }
            .code { font-size: 32px; font-weight: bold; color: ${template.primary_color}; letter-spacing: 4px; font-family: monospace; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; background: white; }
            th { background: #f3f4f6; padding: 12px; text-align: left; font-weight: 600; }
            .total { font-size: 24px; font-weight: bold; color: ${template.primary_color}; }
            .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            ${bannerHtml}
            <div class="content">
              <p>Dear <strong>${customerName}</strong>,</p>
              <p>Thank you for your pre-order. Please find your order details below:</p>
              
              <div class="code-box">
                <p style="margin: 0 0 10px 0; color: #6b7280;">Your Confirmation Code:</p>
                <div style="text-align: center; margin: 10px 0;">
                    <img src="${qrCid ? `cid:${qrCid}` : qrCodeUrl}" alt="QR Code" width="150" height="150" />
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
              <p>${template.footer_text}</p>
            </div>
          </div>
        </body>
        </html>
      `;
    };

    const syncFormResponses = async (formId: string) => {
        const accessToken = getAccessToken();
        if (!accessToken) return 0;

        try {
            // Get known response IDs to filter
            // TODO: implement proper response ID storage, for now just use empty
            const knownIds: string[] = [];

            // Call microservice to get new responses
            const response = await fetch(
                `${SYNC_MICROSERVICE_URL}/sync/responses?formId=${formId}&accessToken=${accessToken}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ knownIds })
                }
            );

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Microservice error');
            }

            const data = await response.json();
            const { newResponses, questionMap } = data;

            if (!newResponses || newResponses.length === 0) return 0;

            // Build question ID maps from microservice response
            let nameQuestionId: string | undefined;
            let emailQuestionId: string | undefined;
            const productQuestionMap = new Map<string, string>();

            Object.entries(questionMap).forEach(([qId, info]: [string, any]) => {
                if (info.title === 'Your Name') {
                    nameQuestionId = qId;
                } else if (info.title === 'Your Email') {
                    emailQuestionId = qId;
                } else if (info.title?.startsWith('Quantity: ')) {
                    const productName = info.title.replace('Quantity: ', '').trim();
                    productQuestionMap.set(qId, productName);
                }
            });

            let imported = 0;

            for (const formResponse of newResponses as FormResponse[]) {
                // Check if already synced locally
                const alreadySynced = await isResponseSynced(formResponse.responseId);
                if (alreadySynced) continue;

                const answers = formResponse.answers || {};

                // Extract customer info
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

                    // Send Email via Microservice
                    try {
                        const qrCodeUrl = await QRCode.toDataURL(confirmationCode);

                        // Process Banner Image for CID if it's base64
                        let bannerCid: string | undefined;
                        const attachments: any[] = [];

                        if (template.use_banner_image && template.banner_image_url && template.banner_image_url.startsWith('data:image')) {
                            console.log('Processing banner image for CID...');
                            bannerCid = 'banner_image';
                            // Extract content type and base64 data
                            // data:image/png;base64,iVBORw0KGgo...
                            const matches = template.banner_image_url.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
                            console.log('Banner matches:', matches ? 'Yes' : 'No');

                            if (matches && matches.length === 3) {
                                attachments.push({
                                    filename: 'banner.png', // filename isn't strictly necessary for CID but good practice
                                    content: matches[2],
                                    encoding: 'base64',
                                    cid: bannerCid,
                                    contentType: matches[1]
                                });
                                console.log('Banner attachment added with CID:', bannerCid);
                            } else {
                                console.warn('Banner image data URI format not recognized:', template.banner_image_url.substring(0, 50) + '...');
                            }
                        }

                        // Process QR code for CID (also a base64 data URI)
                        let qrCid: string | undefined;
                        if (qrCodeUrl.startsWith('data:image')) {
                            qrCid = 'qr_code_image';
                            const qrMatches = qrCodeUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
                            if (qrMatches && qrMatches.length === 3) {
                                attachments.push({
                                    filename: 'qrcode.png',
                                    content: qrMatches[2],
                                    encoding: 'base64',
                                    cid: qrCid,
                                    contentType: qrMatches[1]
                                });
                            } else {
                                qrCid = undefined;
                            }
                        }

                        const htmlBody = generateEmailHtml(customerName, confirmationCode, items, totalAmount, qrCodeUrl, bannerCid, qrCid);
                        const subject = `Pre-Order Invoice - ${confirmationCode}`;

                        let emailPayload: any = null;

                        if (isAuthenticated && accessToken && auth?.user_email) {
                            // Gmail OAuth
                            emailPayload = {
                                type: 'gmail',
                                auth: {
                                    user: auth.user_email,
                                    clientId: GOOGLE_CLIENT_ID,
                                    clientSecret: GOOGLE_CLIENT_SECRET,
                                    refreshToken: auth.refresh_token,
                                    accessToken: accessToken
                                },
                                email: {
                                    from: `"${auth.user_name || 'POTracker'}" <${auth.user_email}>`,
                                    to: customerEmail,
                                    subject: subject,
                                    html: htmlBody,
                                    attachments: attachments
                                }
                            };
                        } else if (smtpSettings) {
                            // SMTP
                            emailPayload = {
                                type: 'smtp',
                                auth: {
                                    host: smtpSettings.smtp_server,
                                    port: smtpSettings.smtp_port,
                                    user: smtpSettings.username,
                                    pass: smtpSettings.password,
                                    secure: smtpSettings.smtp_port === 465
                                },
                                email: {
                                    from: `"${smtpSettings.from_name || 'POTracker'}" <${smtpSettings.from_email}>`,
                                    to: customerEmail,
                                    subject: subject,
                                    html: htmlBody,
                                    attachments: attachments
                                }
                            };
                        }

                        if (emailPayload) {
                            const emailResponse = await fetch(`${SYNC_MICROSERVICE_URL}/email/send`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(emailPayload)
                            });

                            if (!emailResponse.ok) {
                                const err = await emailResponse.json();
                                throw new Error(err.error || 'Failed to send email via microservice');
                            }
                            console.log(`Sent invoice email to ${customerEmail} via ${emailPayload.type}`);
                        } else {
                            console.warn('No email configured (Gmail or SMTP), skipping email');
                        }

                    } catch (emailError: any) {
                        console.error('Failed to send invoice email:', emailError);
                        setMessage({ type: 'error', text: `Order created but email failed: ${emailError.message || emailError}` });
                    }

                    imported++;
                }

                // Mark as synced
                await markResponseSynced(formResponse.responseId, formId);
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
                // Clear message after 3 seconds
                setTimeout(() => setMessage(null), 3000);
            }
        } catch (error: any) {
            setMessage({ type: 'error', text: `Sync failed: ${error.message || error}` });
            setTimeout(() => setMessage(null), 5000);
        } finally {
            setSyncing(false);
        }
    }, [auth, forms, syncing, template]); // products and other deps are stable refs (hopefully)

    // Auto-sync effect
    useEffect(() => {
        if (!syncSettings.auto_sync_enabled || !isAuthenticated || forms.length === 0) return;

        console.log(`Auto-sync enabled. Syncing every ${syncSettings.sync_interval_minutes} minutes.`);
        const interval = setInterval(() => {
            console.log('Auto-sync triggered...');
            syncAllForms();
        }, syncSettings.sync_interval_minutes * 60 * 1000);

        return () => clearInterval(interval);
    }, [syncSettings, isAuthenticated, forms, syncAllForms]);

    return {
        syncAllForms,
        syncing,
        message,
        syncSettings,
        saveSyncSettings
    };
}
