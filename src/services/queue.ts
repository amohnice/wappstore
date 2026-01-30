import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { createLogger } from '../utils/logger.js';
import { salesAgentFlow } from './ai/salesAgent.js';
import { platformAgentFlow } from './ai/platformAgent.js';
import { WhatsAppService } from './whatsapp/client.js';
import { db } from '../database/client.js';
import { messages, businesses, conversations } from '../database/schema.js';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

const logger = createLogger('MessageQueue');

// =============================================
// REDIS CONNECTION
// =============================================

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
});

// =============================================
// MESSAGE QUEUE
// =============================================

export const messageQueue = new Queue('message-processing', {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000,
        },
        removeOnComplete: {
            count: 100, // Keep last 100 completed jobs
        },
        removeOnFail: {
            count: 500, // Keep last 500 failed jobs for debugging
        },
    },
});

// =============================================
// PROCESS MESSAGE LOGIC
// =============================================

export async function processMessage(data: any, jobId?: string) {
    const { phoneNumberId, from, messageId, type, content } = data;

    logger.info('Processing message', {
        jobId,
        from,
        type,
    });

    try {
        // 1. Check if this is a platform message or a business message
        const isPlatform = phoneNumberId === process.env.PLATFORM_PHONE_NUMBER_ID;

        if (isPlatform) {
            // Process as Platform Agent (B2B)
            let platformResponse;
            if (type === 'text') {
                platformResponse = await platformAgentFlow({
                    customerPhone: from,
                    message: content.text,
                    messageType: 'text',
                });
            } else {
                logger.warn('Unsupported platform message type', { type });
                return;
            }

            logger.info('Platform Response Generated', { response: platformResponse.response });

            const whatsapp = new WhatsAppService();
            await whatsapp.sendMessage(from, platformResponse.response);

            return { success: true };
        }

        // 2. Find business by phone number ID (B2C)
        const [business] = await db.select()
            .from(businesses)
            .where(eq(businesses.whatsappNumberId, phoneNumberId))
            .limit(1);

        if (!business) {
            logger.error('Business not found for phone number', { phoneNumberId });
            throw new Error('Business not found');
        }

        // 2. Store incoming message (Evidence Vault)
        const contentHash = crypto
            .createHash('sha256')
            .update(JSON.stringify(content))
            .digest('hex');

        await db.insert(messages).values({
            businessId: business.id,
            direction: 'INBOUND',
            content: JSON.stringify(content),
            contentHash,
            whatsappMessageId: messageId,
        });

        // 2b. Subscription Guard
        if (business.subscriptionStatus !== 'ACTIVE' || !business.isActive) {
            const isMerchant = from === business.phoneNumber;
            const whatsapp = new WhatsAppService();

            if (isMerchant) {
                // Merchant is trying to use their own store while inactive
                // Redirect to Platform Agent to handle activation
                const platformResponse = await platformAgentFlow({
                    customerPhone: from,
                    message: content.text,
                    messageType: 'text',
                });
                await whatsapp.sendMessage(from, platformResponse.response);
            } else {
                // Customer trying to shop at an inactive/deactivated store
                const statusMsg = business.subscriptionStatus === 'DEACTIVATED' || !business.isActive
                    ? `Thank you for reaching out to ${business.name}. Our AI assistant is currently deactivated by the business owner. Please contact them directly.`
                    : `Thank you for reaching out to ${business.name}. Our AI assistant is currently undergoing maintenance. Please try again later.`;

                await whatsapp.sendMessage(from, statusMsg);
            }
            return; // Stop processing for this message
        }

        // 3. Process with AI based on message type
        let aiResponse;

        if (type === 'text') {
            aiResponse = await salesAgentFlow({
                businessId: business.id,
                customerPhone: from,
                message: content.text,
                messageType: 'text',
            });
        } else if (type === 'image') {
            // TODO: Handle image search
            aiResponse = await salesAgentFlow({
                businessId: business.id,
                customerPhone: from,
                message: 'Customer sent an image',
                messageType: 'image',
                imageUrl: content.imageId,
            });
        } else if (type === 'location') {
            // Store location in conversation
            await db.update(conversations)
                .set({
                    latitude: content.latitude.toString(),
                    longitude: content.longitude.toString(),
                })
                .where(and(
                    eq(conversations.businessId, business.id),
                    eq(conversations.customerPhone, from)
                ));

            aiResponse = await salesAgentFlow({
                businessId: business.id,
                customerPhone: from,
                message: `Customer sent their location: ${content.latitude}, ${content.longitude}`,
                messageType: 'text',
            });
        } else {
            logger.warn('Unsupported message type', { type });
            return;
        }

        // 4. Send response via WhatsApp
        logger.info('AI Response Generated', {
            response: aiResponse.response,
            requiresHandoff: aiResponse.requiresHumanHandoff
        });

        const whatsapp = new WhatsAppService();

        if (aiResponse.requiresHumanHandoff) {
            // Notify merchant
            await whatsapp.sendMessage(
                business.phoneNumber,
                `\ud83d\udd14 New customer needs help!\n\nCustomer: ${from}\nMessage: "${content.text}"\n\nPlease respond.`
            );

            // If AI suggested buttons for handoff, use them
            if (aiResponse.interactive?.type === 'button' && aiResponse.interactive.buttons?.length) {
                await whatsapp.sendButtons(from, aiResponse.response, aiResponse.interactive.buttons);
            } else {
                // Inform customer
                await whatsapp.sendMessage(
                    from,
                    aiResponse.response || `I'm connecting you with ${business.name}. They'll respond shortly.`
                );
            }
        } else if (aiResponse.interactive?.type === 'button' && aiResponse.interactive.buttons?.length) {
            // Send AI response with buttons
            await whatsapp.sendButtons(from, aiResponse.response, aiResponse.interactive.buttons);
        } else {
            // Send standard AI response
            await whatsapp.sendMessage(from, aiResponse.response);
        }

        // 5. Store outgoing message
        const outboundHash = crypto
            .createHash('sha256')
            .update(aiResponse.response)
            .digest('hex');

        await db.insert(messages).values({
            businessId: business.id,
            direction: 'OUTBOUND',
            content: aiResponse.response,
            contentHash: outboundHash,
        });

        logger.info('Message processed successfully', {
            jobId,
            requiresHandoff: aiResponse.requiresHumanHandoff,
        });

        return { success: true };

    } catch (error) {
        logger.error('Message processing failed', {
            jobId,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error; // Will trigger retry
    }
}

// =============================================
// MESSAGE WORKER
// =============================================

const messageWorker = new Worker(
    'message-processing',
    async (job) => {
        return processMessage(job.data, job.id);
    },
    {
        connection,
        concurrency: 10, // Process 10 messages concurrently
    }
);

// =============================================
// ENQUEUE HELPER
// =============================================

export async function enqueueMessage(data: any) {
    if (process.env.SYNC_MODE === 'true') {
        logger.info('Running in SYNC_MODE, processing message immediately');
        return processMessage(data, 'sync');
    }

    return messageQueue.add('process-message', data, {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000,
        },
        removeOnComplete: true,
        removeOnFail: false,
    });
}

// =============================================
// WORKER EVENT HANDLERS
// =============================================

messageWorker.on('completed', (job) => {
    logger.info('Job completed', { jobId: job.id });
});

messageWorker.on('failed', (job, err) => {
    logger.error('Job failed', {
        jobId: job?.id,
        error: err.message,
        attempts: job?.attemptsMade,
    });
});

messageWorker.on('error', (err) => {
    logger.error('Worker error', { error: err.message });
});

// =============================================
// GRACEFUL SHUTDOWN
// =============================================

process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, closing worker...');
    await messageWorker.close();
    await connection.quit();
});

export { messageWorker };
