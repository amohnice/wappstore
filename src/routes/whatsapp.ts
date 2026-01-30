import { Router } from 'express';

import { createLogger } from '@/utils/logger';
import { enqueueMessage } from '@/services/queue';
import { z } from 'zod';

const router: Router = Router();
const logger = createLogger('WhatsApp');

// =============================================
// WEBHOOK VERIFICATION (Meta requirement)
// =============================================

router.get('/', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    logger.info('Webhook verification attempt', {
        mode,
        tokenReceived: token,
        tokenExpected: process.env.WHATSAPP_VERIFY_TOKEN,
        tokensMatch: token === process.env.WHATSAPP_VERIFY_TOKEN,
        challenge
    });

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        logger.info('Webhook verified successfully');
        res.status(200).send(challenge);
    } else {
        logger.warn('Webhook verification failed', {
            modeOk: mode === 'subscribe',
            tokenOk: token === process.env.WHATSAPP_VERIFY_TOKEN
        });
        res.sendStatus(403);
    }
});

// =============================================
// MESSAGE WEBHOOK
// =============================================

const WhatsAppMessageSchema = z.object({
    object: z.literal('whatsapp_business_account'),
    entry: z.array(z.object({
        id: z.string(),
        changes: z.array(z.object({
            value: z.object({
                messaging_product: z.literal('whatsapp'),
                metadata: z.object({
                    display_phone_number: z.string(),
                    phone_number_id: z.string(),
                }),
                contacts: z.array(z.object({
                    profile: z.object({
                        name: z.string(),
                    }),
                    wa_id: z.string(),
                })).optional(),
                messages: z.array(z.object({
                    from: z.string(),
                    id: z.string(),
                    timestamp: z.string(),
                    type: z.enum(['text', 'image', 'document', 'audio', 'video', 'location']),
                    text: z.object({
                        body: z.string(),
                    }).optional(),
                    image: z.object({
                        id: z.string(),
                        mime_type: z.string(),
                    }).optional(),
                    location: z.object({
                        latitude: z.number(),
                        longitude: z.number(),
                    }).optional(),
                })).optional(),
                statuses: z.array(z.object({
                    id: z.string(),
                    status: z.enum(['sent', 'delivered', 'read', 'failed']),
                    timestamp: z.string(),
                    recipient_id: z.string(),
                })).optional(),
            }),
            field: z.string(),
        })),
    })),
});

router.post('/', async (req, res) => {
    try {
        // Immediately respond 200 to Meta (required)
        res.sendStatus(200);

        // Validate webhook payload
        const payload = WhatsAppMessageSchema.parse(req.body);

        logger.info('Received webhook', {
            entries: payload.entry.length
        });

        // Process each entry
        for (const entry of payload.entry) {
            for (const change of entry.changes) {
                const { value } = change;

                // Handle incoming messages
                if (value.messages && value.messages.length > 0) {
                    for (const message of value.messages) {
                        await handleIncomingMessage(value.metadata.phone_number_id, message);
                    }
                }

                // Handle status updates (delivery receipts)
                if (value.statuses && value.statuses.length > 0) {
                    for (const status of value.statuses) {
                        await handleStatusUpdate(status);
                    }
                }
            }
        }

    } catch (error) {
        logger.error('Webhook processing error', { error });
        // Don't send error to Meta - already sent 200
    }
});

// =============================================
// MESSAGE HANDLER
// =============================================

async function handleIncomingMessage(phoneNumberId: string, message: any) {
    try {
        logger.info('Processing message', {
            from: message.from,
            type: message.type,
            messageId: message.id,
        });

        // Add to processing queue (Redis + BullMQ)
        await enqueueMessage({
            phoneNumberId,
            from: message.from,
            messageId: message.id,
            type: message.type,
            timestamp: message.timestamp,
            content: getMessageContent(message),
        });

        logger.info('Message queued successfully', { messageId: message.id });

    } catch (error) {
        logger.error('Failed to queue message', { error, message });
    }
}

// =============================================
// EXTRACT MESSAGE CONTENT
// =============================================

function getMessageContent(message: any) {
    switch (message.type) {
        case 'text':
            return {
                type: 'text',
                text: message.text?.body || '',
            };

        case 'image':
            return {
                type: 'image',
                imageId: message.image?.id,
                mimeType: message.image?.mime_type,
            };

        case 'location':
            return {
                type: 'location',
                latitude: message.location?.latitude,
                longitude: message.location?.longitude,
            };

        default:
            return {
                type: message.type,
                raw: message,
            };
    }
}

// =============================================
// STATUS UPDATE HANDLER
// =============================================

async function handleStatusUpdate(status: any) {
    try {
        logger.info('Message status update', {
            messageId: status.id,
            status: status.status,
            recipient: status.recipient_id,
        });

        // Update message status in database
        // TODO: Implement database update

    } catch (error) {
        logger.error('Failed to handle status update', { error, status });
    }
}

export { router as whatsappRouter };
