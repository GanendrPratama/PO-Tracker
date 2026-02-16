const express = require('express');
const cors = require('cors');
const CryptoJS = require('crypto-js');
const fetch = require('node-fetch');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const PORT = process.env.PORT || 3001;

// Google Forms API base URL
const FORMS_API = 'https://forms.googleapis.com/v1/forms';

/**
 * Calculate checksum from response IDs
 */
function calculateChecksum(responseIds) {
    if (!responseIds || responseIds.length === 0) {
        return 'empty';
    }
    const sorted = [...responseIds].sort();
    const joined = sorted.join(',');
    return CryptoJS.MD5(joined).toString();
}

/**
 * Fetch form responses from Google Forms API
 */
async function fetchFormResponses(formId, accessToken) {
    const response = await fetch(`${FORMS_API}/${formId}/responses`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Google Forms API error: ${error}`);
    }

    return response.json();
}

/**
 * Fetch form details (questions) from Google Forms API
 */
async function fetchFormDetails(formId, accessToken) {
    const response = await fetch(`${FORMS_API}/${formId}`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Google Forms API error: ${error}`);
    }

    return response.json();
}

/**
 * GET /sync/check
 * Returns checksum and count of responses for a form
 * Query params: formId, accessToken
 */
app.get('/sync/check', async (req, res) => {
    try {
        const { formId, accessToken } = req.query;

        if (!formId || !accessToken) {
            return res.status(400).json({ error: 'formId and accessToken are required' });
        }

        const data = await fetchFormResponses(formId, accessToken);
        const responses = data.responses || [];
        const responseIds = responses.map(r => r.responseId);
        const checksum = calculateChecksum(responseIds);

        res.json({
            checksum,
            responseCount: responses.length,
            formId
        });
    } catch (error) {
        console.error('Check error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /sync/responses
 * Returns responses for a form, optionally filtering by known IDs
 * Query params: formId, accessToken
 * Body (optional): { knownIds: string[] }
 */
app.post('/sync/responses', async (req, res) => {
    try {
        const { formId, accessToken } = req.query;
        const { knownIds = [] } = req.body || {};

        if (!formId || !accessToken) {
            return res.status(400).json({ error: 'formId and accessToken are required' });
        }

        // Fetch form details to get question mapping
        const formDetails = await fetchFormDetails(formId, accessToken);

        // Build question ID to title map
        const questionMap = {};
        if (formDetails.items) {
            formDetails.items.forEach(item => {
                if (item.questionItem?.question?.questionId) {
                    questionMap[item.questionItem.question.questionId] = {
                        title: item.title || '',
                        type: item.questionItem.question.textQuestion ? 'text' : 'other'
                    };
                }
            });
        }

        // Fetch responses
        const data = await fetchFormResponses(formId, accessToken);
        const allResponses = data.responses || [];

        // Filter out known responses
        const knownIdSet = new Set(knownIds);
        const newResponses = allResponses.filter(r => !knownIdSet.has(r.responseId));

        // Calculate new checksum
        const allIds = allResponses.map(r => r.responseId);
        const checksum = calculateChecksum(allIds);

        res.json({
            checksum,
            totalCount: allResponses.length,
            newCount: newResponses.length,
            newResponses,
            questionMap
        });
    } catch (error) {
        console.error('Responses error:', error);
        res.status(500).json({ error: error.message });
    }
});


/**
 * POST /email/send
 * Sends an email using Gmail OAuth2 or SMTP
 * Body: {
 *   type: 'gmail' | 'smtp',
 *   auth: { ... },
 *   email: { from, to, subject, html }
 * }
 */
app.post('/email/send', async (req, res) => {
    try {
        const { type, auth, email } = req.body;

        if (!type || !auth || !email) {
            return res.status(400).json({ error: 'Missing required fields: type, auth, email' });
        }

        const mailOptions = {
            from: email.from,
            to: email.to,
            subject: email.subject,
            html: email.html,
            attachments: email.attachments
        };

        if (type === 'gmail') {
            // Use nodemailer to compile the MIME message (handles CID, multipart, etc.)
            // Then send the raw message via Gmail REST API with bearer token
            const transporter = nodemailer.createTransport({ streamTransport: true });
            const info = await transporter.sendMail(mailOptions);

            // Read the compiled message stream into a buffer
            const rawMessage = await new Promise((resolve, reject) => {
                const chunks = [];
                info.message.on('data', (chunk) => chunks.push(chunk));
                info.message.on('end', () => resolve(Buffer.concat(chunks)));
                info.message.on('error', reject);
            });

            // Base64url encode the raw message for Gmail API
            const encodedMessage = rawMessage
                .toString('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');

            // Send via Gmail REST API
            const gmailResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${auth.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ raw: encodedMessage })
            });

            if (!gmailResponse.ok) {
                const errorText = await gmailResponse.text();
                throw new Error(`Gmail API error: ${errorText}`);
            }

            const result = await gmailResponse.json();
            console.log(`Email sent via Gmail API: ${result.id}`);
            if (email.attachments && email.attachments.length > 0) {
                console.log(`   With ${email.attachments.length} CID attachments`);
            }
            res.json({ success: true, messageId: result.id });

        } else if (type === 'smtp') {
            const transporterConfig = {
                host: auth.host,
                port: auth.port || 587,
                secure: auth.secure || false,
                auth: {
                    user: auth.user,
                    pass: auth.pass
                }
            };

            const transporter = nodemailer.createTransport(transporterConfig);
            const info = await transporter.sendMail(mailOptions);

            console.log(`Email sent via SMTP: ${info.messageId}`);
            if (email.attachments && email.attachments.length > 0) {
                console.log(`   With ${email.attachments.length} attachments`);
            }
            res.json({ success: true, messageId: info.messageId });

        } else {
            return res.status(400).json({ error: 'Invalid email type. Must be "gmail" or "smtp"' });
        }

    } catch (error) {
        console.error('Email send error:', error);
        res.status(500).json({ error: error.message || 'Failed to send email' });
    }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`🚀 POTracker Sync Microservice running on port ${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/health`);
});
