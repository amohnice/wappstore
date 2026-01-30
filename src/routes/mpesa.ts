import { Router, Request, Response } from 'express';
import { createLogger } from '../utils/logger.js';
import { MPesaService } from '../services/payments/mpesa.js';
import { db } from '../database/client.js';
import { orders, transactions, conversations } from '../database/schema.js';
import { eq } from 'drizzle-orm';
import { WhatsAppService } from '../services/whatsapp/client.js';

const router: Router = Router();
const logger = createLogger('M-Pesa-Webhook');
const mpesa = new MPesaService();
const whatsapp = new WhatsAppService();

// =============================================
// STK PUSH CALLBACK
// =============================================

router.post('/callback', async (req: Request, res: Response) => {
    try {
        // Immediately acknowledge receipt
        res.status(200).json({
            ResultCode: 0,
            ResultDesc: 'Accepted',
        });

        logger.info('M-Pesa callback received', {
            body: JSON.stringify(req.body),
        });

        // Validate and extract callback data
        const validation = mpesa.validateCallback(req.body);

        if (!validation.isValid) {
            logger.warn('Invalid M-Pesa callback', {
                resultCode: validation.resultCode,
                resultDesc: validation.resultDesc,
            });
            return;
        }

        // Extract account reference (order number)
        const callbackMetadata = req.body.Body?.stkCallback?.CallbackMetadata?.Item || [];
        const accountRef = callbackMetadata.find((item: any) => item.Name === 'AccountReference')?.Value;

        if (!accountRef) {
            logger.error('No account reference in callback');
            return;
        }

        // Find order
        const [order] = await db.select()
            .from(orders)
            .where(eq(orders.orderNumber, accountRef))
            .limit(1);

        if (!order) {
            logger.error('Order not found', { orderNumber: accountRef });
            return;
        }

        // Check for duplicate transaction
        const [existingTransaction] = await db.select()
            .from(transactions)
            .where(eq(transactions.mpesaReceipt, validation.mpesaReceiptNumber!))
            .limit(1);

        if (existingTransaction) {
            logger.warn('Duplicate transaction detected', {
                mpesaReceipt: validation.mpesaReceiptNumber,
            });
            return;
        }

        // Calculate fees
        const grossAmount = validation.amount!;
        const vatAmount = grossAmount * (parseInt(process.env.VAT_PERCENTAGE || '16') / 100);
        const platformFee = grossAmount * (parseInt(process.env.PLATFORM_FEE_PERCENTAGE || '5') / 100);
        const netAmount = grossAmount - vatAmount - platformFee;

        // Create transaction record
        await db.insert(transactions).values({
            businessId: order.businessId,
            orderId: order.id,
            type: 'SALE',
            grossAmount: grossAmount.toString(),
            vatAmount: vatAmount.toString(),
            platformFee: platformFee.toString(),
            netAmount: netAmount.toString(),
            mpesaReceipt: validation.mpesaReceiptNumber,
            paymentPhone: validation.phoneNumber,
            status: 'COMPLETED',
            processedAt: new Date(),
        });

        // Update order
        await db.update(orders)
            .set({
                paymentStatus: 'PAID',
                mpesaReceipt: validation.mpesaReceiptNumber,
                paidAt: new Date(),
                status: 'PROCESSING',
            })
            .where(eq(orders.id, order.id));

        // Update conversation state
        await db.update(conversations)
            .set({
                currentState: 'FULFILLMENT',
                lastMessageAt: new Date(),
            })
            .where(eq(conversations.businessId, order.businessId));

        logger.info('Payment processed successfully', {
            orderNumber: accountRef,
            amount: grossAmount,
            mpesaReceipt: validation.mpesaReceiptNumber,
        });

        // Notify customer
        const customerPhone = order.customerId; // Need to get from customer record
        await whatsapp.sendMessage(
            customerPhone || validation.phoneNumber!,
            `✅ Payment received! KES ${grossAmount}\n\n` +
            `Order #${order.orderNumber}\n` +
            `M-Pesa Receipt: ${validation.mpesaReceiptNumber}\n\n` +
            `We're preparing your order. You'll receive updates shortly.`
        );

        // TODO: Notify merchant
        // TODO: Generate and send receipt PDF
        // TODO: Trigger eTIMS integration

    } catch (error) {
        logger.error('Callback processing error', { error });
    }
});

// =============================================
// B2C RESULT (Refunds/Payouts)
// =============================================

router.post('/b2c/result', async (req: Request, res: Response) => {
    try {
        res.status(200).json({
            ResultCode: 0,
            ResultDesc: 'Accepted',
        });

        logger.info('B2C result received', {
            body: JSON.stringify(req.body),
        });

        const result = req.body.Result;
        const resultCode = result.ResultCode;

        if (resultCode === 0) {
            // B2C successful
            const transactionId = result.TransactionID;

            logger.info('B2C completed successfully', {
                transactionId,
            });

            // TODO: Update refund/payout record in database
        } else {
            logger.warn('B2C failed', {
                resultCode,
                resultDescription: result.ResultDescription,
            });
        }

    } catch (error) {
        logger.error('B2C result processing error', { error });
    }
});

// =============================================
// B2C TIMEOUT
// =============================================

router.post('/b2c/timeout', async (req: Request, res: Response) => {
    try {
        res.status(200).json({
            ResultCode: 0,
            ResultDesc: 'Accepted',
        });

        logger.warn('B2C timeout', {
            body: JSON.stringify(req.body),
        });

        // TODO: Handle timeout - retry or mark as failed

    } catch (error) {
        logger.error('B2C timeout processing error', { error });
    }
});

export { router as mpesaRouter };
