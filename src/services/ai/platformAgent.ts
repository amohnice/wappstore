import { z } from 'zod';
import { ai } from './genkit.js';
import { db } from '@/database/client';
import { businesses, products, orders } from '@/database/schema';
import { eq, and, sql } from 'drizzle-orm';
import { createLogger } from '@/utils/logger';


import { MPesaService } from '@/services/payments/mpesa';

const logger = createLogger('Platform-Agent');
const mpesa = new MPesaService();

// =============================================
// TOOLS
// =============================================

export const registerBusinessTool = ai.defineTool(
    {
        name: 'registerBusiness',
        description: 'Register a new business/shop on the platform',
        inputSchema: z.object({
            name: z.string().describe('Name of the business'),
            category: z.string().describe('Category (e.g., Fashion, Electronics)'),
            whatsappNumberId: z.string().describe('The Meta Phone Number ID for this store'),
            merchantPhoneNumber: z.string().describe('The merchant personal phone number'),
        }),
        outputSchema: z.object({
            success: z.boolean(),
            businessId: z.string().optional(),
            message: z.string(),
        }),
    },
    async (input) => {
        try {
            const [business] = await db.insert(businesses).values({
                name: input.name,
                category: input.category,
                whatsappNumberId: input.whatsappNumberId,
                phoneNumber: input.merchantPhoneNumber,
                verificationStatus: 'PENDING',
                isActive: true,
            }).returning();

            return {
                success: true,
                businessId: business.id,
                message: `Business "${input.name}" registered! Status: PENDING_ACTIVATION. They need to pay KES 1 to activate.`,
            };
        } catch (error) {
            logger.error('Failed to register business', { error });
            return {
                success: false,
                message: 'Failed to register business. It might already exist.',
            };
        }
    }
);

export const quickAddProductTool = ai.defineTool(
    {
        name: 'quickAddProduct',
        description: 'Add a new product to the merchant store',
        inputSchema: z.object({
            merchantPhone: z.string().describe('Merchant phone number to identify the store'),
            name: z.string().describe('Product name'),
            price: z.number().describe('Base price'),
            description: z.string().optional().describe('Brief description'),
            category: z.string().optional().describe('Product category'),
        }),
        outputSchema: z.object({
            success: z.boolean(),
            message: z.string(),
        }),
    },
    async (input) => {
        try {
            // Find business by merchant phone
            const [business] = await db.select()
                .from(businesses)
                .where(eq(businesses.phoneNumber, input.merchantPhone))
                .limit(1);

            if (!business) {
                return { success: false, message: 'Business not found for this phone number.' };
            }

            await db.insert(products).values({
                businessId: business.id,
                name: input.name,
                basePrice: input.price.toString(),
                minimumPrice: (input.price * 0.8).toString(), // Default 20% floor
                description: input.description,
                category: input.category || business.category,
                isActive: true,
                stockQuantity: 10, // Default stock
            });

            return {
                success: true,
                message: `Added "${input.name}" to your shop for KES ${input.price}.`,
            };
        } catch (error) {
            logger.error('Failed to add product via platform', { error });
            return {
                success: false,
                message: 'Failed to add product. Please check the details.',
            };
        }
    }
);

export const getBusinessAnalyticsTool = ai.defineTool(
    {
        name: 'getBusinessAnalytics',
        description: 'Get a summary of sales analytics for a shop',
        inputSchema: z.object({
            merchantPhone: z.string().describe('Merchant phone number'),
        }),
        outputSchema: z.object({
            success: z.boolean(),
            message: z.string(),
            revenue: z.number().optional(),
            orders: z.number().optional(),
        }),
    },
    async (input) => {
        try {
            const [business] = await db.select()
                .from(businesses)
                .where(eq(businesses.phoneNumber, input.merchantPhone))
                .limit(1);

            if (!business) {
                return { success: false, message: 'Business not found.' };
            }

            // Get total revenue and order count
            const [res] = await db.select({
                revenue: sql<number>`COALESCE(SUM(CAST(${orders.totalAmount} AS DECIMAL)), 0)`,
                count: sql<number>`COUNT(*)`,
            })
                .from(orders)
                .where(and(
                    eq(orders.businessId, business.id),
                    eq(orders.paymentStatus, 'PAID')
                ));

            return {
                success: true,
                message: `Summary for ${business.name}:`,
                revenue: Number(res.revenue),
                orders: Number(res.count),
            };
        } catch (error) {
            logger.error('Failed to get analytics', { error });
            return {
                success: false,
                message: 'Failed to retrieve analytics dashboard.',
            };
        }
    }
);

export const requestSubscriptionPaymentTool = ai.defineTool(
    {
        name: 'requestSubscriptionPayment',
        description: 'Initiate M-Pesa STK push for merchant subscription (KES 1)',
        inputSchema: z.object({
            merchantPhone: z.string().describe('The merchant phone number to charge'),
            businessName: z.string().describe('The name of the business'),
        }),
        outputSchema: z.object({
            success: z.boolean(),
            message: z.string(),
            checkoutRequestId: z.string().optional(),
        }),
    },
    async (input) => {
        try {
            const response = await mpesa.initiateSTKPush({
                phoneNumber: input.merchantPhone,
                amount: 1, // KES 1 activation fee
                accountReference: 'OS_ACTIVATE',
                transactionDesc: `Activate ${input.businessName}`,
            });

            return {
                success: true,
                message: 'STK Push sent! Please enter your PIN on your phone to activate.',
                checkoutRequestId: response.checkoutRequestId,
            };
        } catch (error) {
            logger.error('Failed to initiate subscription payment', { error });
            return {
                success: false,
                message: 'Failed to send payment request. Please check the number.',
            };
        }
    }
);

export const setProductDiscountTool = ai.defineTool(
    {
        name: 'setProductDiscount',
        description: 'Set a discounted price for a product to boost sales',
        inputSchema: z.object({
            merchantPhone: z.string().describe('Merchant phone number'),
            productId: z.string().describe('Product ID to discount'),
            discountPrice: z.number().describe('The new discounted price'),
            durationDays: z.number().default(7).describe('How many days the discount should last'),
        }),
        outputSchema: z.object({
            success: z.boolean(),
            message: z.string(),
        }),
    },
    async (input) => {
        try {
            const [business] = await db.select().from(businesses)
                .where(eq(businesses.phoneNumber, input.merchantPhone)).limit(1);

            if (!business) return { success: false, message: 'Business not found.' };

            const endsAt = new Date();
            endsAt.setDate(endsAt.getDate() + input.durationDays);

            await db.update(products)
                .set({
                    discountPrice: input.discountPrice.toString(),
                    discountEndsAt: endsAt,
                })
                .where(and(eq(products.id, input.productId), eq(products.businessId, business.id)));

            return {
                success: true,
                message: `Discount set! Product is now KES ${input.discountPrice} for the next ${input.durationDays} days.`,
            };
        } catch (error) {
            logger.error('Failed to set discount', { error });
            return { success: false, message: 'Failed to set discount.' };
        }
    }
);

export const getDetailedAnalyticsTool = ai.defineTool(
    {
        name: 'getDetailedAnalytics',
        description: 'Get deep insights into sales, top products, and inventory alerts',
        inputSchema: z.object({
            merchantPhone: z.string().describe('Merchant phone number'),
        }),
        outputSchema: z.object({
            success: z.boolean(),
            message: z.string(),
            topProducts: z.array(z.object({ name: z.string(), sales: z.number() })).optional(),
            lowStock: z.array(z.object({ name: z.string(), count: z.number() })).optional(),
        }),
    },
    async (input) => {
        try {
            const [business] = await db.select().from(businesses)
                .where(eq(businesses.phoneNumber, input.merchantPhone)).limit(1);
            if (!business) return { success: false, message: 'Business not found.' };

            // 1. Get Inventory Alerts (Simplified)
            const productsList = await db.select({ name: products.name, stock: products.stockQuantity })
                .from(products).where(eq(products.businessId, business.id));

            const lowStock = productsList.filter(p => (p.stock || 0) < 5).map(p => ({
                name: p.name,
                count: p.stock || 0
            }));

            return {
                success: true,
                message: `Analytics for ${business.name}: You have ${lowStock.length} items running low on stock.`,
                lowStock,
                topProducts: [], // Placeholder for real sales aggregation
            };
        } catch (error) {
            logger.error('Failed to get detailed analytics', { error });
            return { success: false, message: 'Failed to get analytics.' };
        }
    }
);

export const deactivateBusinessTool = ai.defineTool(
    {
        name: 'deactivateBusiness',
        description: 'Deactivate your business AI services. No data will be lost.',
        inputSchema: z.object({
            merchantPhone: z.string().describe('Merchant phone number'),
        }),
        outputSchema: z.object({
            success: z.boolean(),
            message: z.string(),
        }),
    },
    async (input) => {
        try {
            const [business] = await db.select().from(businesses)
                .where(eq(businesses.phoneNumber, input.merchantPhone)).limit(1);
            if (!business) return { success: false, message: 'Business not found.' };

            await db.update(businesses)
                .set({ isActive: false, subscriptionStatus: 'DEACTIVATED' })
                .where(eq(businesses.id, business.id));

            return {
                success: true,
                message: `Your business "${business.name}" has been deactivated. Customers will no longer be able to chat with your AI. You can reactivate anytime!`,
            };
        } catch (error) {
            logger.error('Failed to deactivate business', { error });
            return { success: false, message: 'Failed to deactivate account.' };
        }
    }
);

export const reactivateBusinessTool = ai.defineTool(
    {
        name: 'reactivateBusiness',
        description: 'Reactivate your business AI services',
        inputSchema: z.object({
            merchantPhone: z.string().describe('Merchant phone number'),
        }),
        outputSchema: z.object({
            success: z.boolean(),
            message: z.string(),
        }),
    },
    async (input) => {
        try {
            const [business] = await db.select().from(businesses)
                .where(eq(businesses.phoneNumber, input.merchantPhone)).limit(1);
            if (!business) return { success: false, message: 'Business not found.' };

            if (business.isActive) {
                return { success: true, message: 'Your business is already active!' };
            }

            // In a real app, this might trigger a payment flow again
            // For now, we'll guide them to use requestSubscriptionPayment
            return {
                success: true,
                message: `Welcome back! To reactivate "${business.name}", please confirm if you'd like me to send an M-Pesa push for the activation fee (KES 1).`,
            };
        } catch (error) {
            logger.error('Failed to reactivate business', { error });
            return { success: false, message: 'Failed to initiate reactivation.' };
        }
    }
);

// =============================================
// FLOW
// =============================================

export const platformAgentFlow = ai.defineFlow({
    name: 'platformAgentFlow',
    inputSchema: z.object({
        customerPhone: z.string(),
        message: z.string(),
        messageType: z.enum(['text', 'image']).default('text'),
    }),
    outputSchema: z.object({
        response: z.string(),
        requiresHumanHandoff: z.boolean(),
    }),
}, async (input) => {
    try {
        const result = await ai.generate({
            model: 'googleai/gemini-flash-latest',
            prompt: `You are the Merchant Success Assistant for Commerce OS. 
            Your job is to help business owners onboard and manage their shops.
            
            Merchant Interaction Flow:
            1. If they want to join, ask for Business Name, Category, Meta Phone Number ID, and their contact phone.
            2. After registration, explain that there is a KES 1 one-time activation fee to use the AI chatbot.
            3. Use requestSubscriptionPayment to trigger the M-Pesa prompt for them.
            4. Ask if they prefer 'Automated M-Pesa' or 'Cash on Delivery' for their customers. (Automated means the AI provides a Pay button).
            5. If they want to add products, use the quickAddProduct tool.
            6. If they ask how they are doing or for sales info, use getBusinessAnalytics or getDetailedAnalytics.
            7. If they want to run a promotion or discount, use setProductDiscount.
            8. If they want to stop using the service, use deactivateBusiness. Explain that no data is lost and they can return anytime.
            9. If they want to come back/reactivate, use reactivateBusiness.
            
            Current Merchant Phone: ${input.customerPhone}
            Customer Message: ${input.message}
            
            Respond naturally and use tools when appropriate.`,
            tools: [
                registerBusinessTool,
                quickAddProductTool,
                getBusinessAnalyticsTool,
                requestSubscriptionPaymentTool,
                setProductDiscountTool,
                getDetailedAnalyticsTool,
                deactivateBusinessTool,
                reactivateBusinessTool
            ],
        });

        return {
            response: result.text,
            requiresHumanHandoff: false,
        };
    } catch (error) {
        logger.error('Platform flow error', { error });
        return {
            response: "I'm having a bit of trouble connecting to the platform services. Please try again in a moment.",
            requiresHumanHandoff: true,
        };
    }
});
