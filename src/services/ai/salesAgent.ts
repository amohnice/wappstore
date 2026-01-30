import { ai } from './genkit.js';
// import { gemini10Pro } from '@genkit-ai/googleai';
import { z } from 'zod';
import { db } from '../../database/client.js';
import { products, conversations, customers, businesses, orders } from '../../database/schema.js';
import { eq, and, sql, desc } from 'drizzle-orm';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('AI-Agent');

// =============================================
// CONVERSATION STATE ENUM
// =============================================

export const ConversationState = {
    BROWSING: 'BROWSING',
    CART_BUILDING: 'CART_BUILDING',
    CHECKOUT: 'CHECKOUT',
    PAYMENT_PENDING: 'PAYMENT_PENDING',
    FULFILLMENT: 'FULFILLMENT',
    COMPLETED: 'COMPLETED',
    SUPPORT: 'SUPPORT',
} as const;

// =============================================
// AI TOOLS (Function Calling)
// =============================================

export const searchProductsTool = ai.defineTool({
    name: 'searchProducts',
    description: 'Search for products in the merchant catalog by name, category, or description',
    inputSchema: z.object({
        query: z.string().describe('Search query from customer'),
        maxPrice: z.number().optional().describe('Maximum price filter'),
        category: z.string().optional().describe('Product category filter'),
    }),
    outputSchema: z.array(z.object({
        id: z.string(),
        name: z.string(),
        description: z.string().optional(),
        price: z.number(),
        discountPrice: z.number().optional(),
        inStock: z.boolean(),
        stockQuantity: z.number(),
    })),
}, async ({ query, maxPrice, category }, context: any) => {
    // Genkit 0.9+ passes context wrapped in an ActionContext object
    const businessId = context.businessId || context.context?.businessId;

    logger.info('Searching products', { query, businessId });

    // Set tenant context using set_config for safe parameterization
    await db.execute(sql`SELECT set_config('app.current_business_id', ${businessId}, false)`);

    // Build query
    let conditions = [eq(products.businessId, businessId), eq(products.isActive, true)];

    if (maxPrice) {
        conditions.push(sql`${products.basePrice} <= ${maxPrice}`);
    }

    if (category) {
        conditions.push(eq(products.category, category));
    }

    // Search products (simplified - in production use pgvector)
    const results = await db.select({
        id: products.id,
        name: products.name,
        description: products.description,
        price: products.basePrice,
        discountPrice: products.discountPrice,
        stockQuantity: products.stockQuantity,
    })
        .from(products)
        .where(and(...conditions))
        .limit(5);

    return results.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description || undefined,
        price: parseFloat(p.price || '0'),
        discountPrice: p.discountPrice ? parseFloat(p.discountPrice.toString()) : undefined,
        inStock: (p.stockQuantity || 0) > 0,
        stockQuantity: p.stockQuantity || 0,
    }));
});

export const addToCartTool = ai.defineTool({
    name: 'addToCart',
    description: 'Add a product to customer shopping cart',
    inputSchema: z.object({
        productId: z.string(),
        quantity: z.number().min(1),
    }),
    outputSchema: z.object({
        success: z.boolean(),
        cartTotal: z.number(),
        message: z.string(),
    }),
}, async ({ productId, quantity }, context: any) => {
    const businessId = context.businessId || context.context?.businessId;
    const customerPhone = context.customerPhone || context.context?.customerPhone;

    logger.info('Adding to cart', { productId, quantity, customerPhone, businessId });

    // Set tenant context
    await db.execute(sql`SELECT set_config('app.current_business_id', ${businessId}, false)`);

    // Get or create conversation
    const [conversation] = await db.select()
        .from(conversations)
        .where(and(
            eq(conversations.businessId, businessId),
            eq(conversations.customerPhone, customerPhone)
        ))
        .limit(1);

    if (!conversation) {
        return { success: false, cartTotal: 0, message: 'Conversation not found' };
    }

    // Get product details
    const [product] = await db.select()
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

    if (!product) {
        return { success: false, cartTotal: 0, message: 'Product not found' };
    }

    // Update cart
    const currentCart = (conversation.cartItems as any[]) || [];
    const existingItem = currentCart.find((item: any) => item.productId === productId);

    let updatedCart;
    if (existingItem) {
        updatedCart = currentCart.map((item: any) =>
            item.productId === productId
                ? { ...item, quantity: item.quantity + quantity }
                : item
        );
    } else {
        updatedCart = [...currentCart, {
            productId,
            name: product.name,
            price: product.discountPrice
                ? parseFloat(product.discountPrice.toString())
                : parseFloat(product.basePrice || '0'),
            quantity,
        }];
    }

    // Calculate total
    const cartTotal = updatedCart.reduce((sum: number, item: any) =>
        sum + (item.price * item.quantity), 0
    );

    // Update conversation
    await db.update(conversations)
        .set({
            cartItems: updatedCart,
            currentState: ConversationState.CART_BUILDING,
            lastMessageAt: new Date(),
        })
        .where(eq(conversations.id, conversation.id));

    return {
        success: true,
        cartTotal,
        message: `Added ${quantity}x ${product.name} to cart`,
    };
});

export const getCartTool = ai.defineTool({
    name: 'getCart',
    description: 'View current shopping cart contents',
    inputSchema: z.object({}),
    outputSchema: z.object({
        items: z.array(z.object({
            name: z.string(),
            quantity: z.number(),
            price: z.number(),
            subtotal: z.number(),
        })),
        total: z.number(),
    }),
}, async (_, context: any) => {
    const businessId = context.businessId || context.context?.businessId;
    const customerPhone = context.customerPhone || context.context?.customerPhone;

    // Set tenant context
    await db.execute(sql`SELECT set_config('app.current_business_id', ${businessId}, false)`);

    const [conversation] = await db.select()
        .from(conversations)
        .where(and(
            eq(conversations.businessId, businessId),
            eq(conversations.customerPhone, customerPhone)
        ))
        .limit(1);

    if (!conversation) {
        return { items: [], total: 0 };
    }

    const cartItems = (conversation.cartItems as any[]) || [];
    const items = cartItems.map((item: any) => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        subtotal: item.price * item.quantity,
    }));

    const total = items.reduce((sum, item) => sum + item.subtotal, 0);

    return { items, total };
});

export const checkoutTool = ai.defineTool({
    name: 'checkout',
    description: 'Process the customer order and calculate final totals including delivery fees',
    inputSchema: z.object({}),
    outputSchema: z.object({
        success: z.boolean(),
        subtotal: z.number(),
        deliveryFee: z.number(),
        total: z.number(),
        requiresLocation: z.boolean(),
        message: z.string(),
    }),
}, async (_, context: any) => {
    const businessId = context.businessId || context.context?.businessId;
    const customerPhone = context.customerPhone || context.context?.customerPhone;

    const [conversation] = await db.select()
        .from(conversations)
        .where(and(
            eq(conversations.businessId, businessId),
            eq(conversations.customerPhone, customerPhone)
        ))
        .limit(1);

    if (!conversation) {
        return { success: false, subtotal: 0, deliveryFee: 0, total: 0, requiresLocation: false, message: 'Conversation not found' };
    }

    const cartItems = (conversation.cartItems as any[]) || [];
    if (cartItems.length === 0) {
        return { success: false, subtotal: 0, deliveryFee: 0, total: 0, requiresLocation: false, message: 'Cart is empty' };
    }

    const subtotal = cartItems.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);

    // Delivery fee calculation logic
    let deliveryFee = 0;
    if (!conversation.latitude) {
        return {
            success: false,
            subtotal,
            deliveryFee: 0,
            total: subtotal,
            requiresLocation: true,
            message: 'Please provide your delivery location first so we can calculate the delivery fee.',
        };
    }

    // Simplified delivery fee: Ksh 150 fixed if location is provided
    deliveryFee = 150;
    const total = subtotal + deliveryFee;

    return {
        success: true,
        subtotal,
        deliveryFee,
        total,
        requiresLocation: false,
        message: `Order summarized. Subtotal: Ksh ${subtotal}, Delivery Fee: Ksh ${deliveryFee}, Total: Ksh ${total}.`,
    };
});

export const createOrderTool = ai.defineTool({
    name: 'createOrder',
    description: 'Create a final order for the customer after they confirm checkout',
    inputSchema: z.object({
        paymentMethod: z.enum(['COD', 'MPESA']),
    }),
    outputSchema: z.object({
        success: z.boolean(),
        orderNumber: z.string().optional(),
        message: z.string(),
    }),
}, async ({ paymentMethod }, context: any) => {
    const businessId = context.businessId || context.context?.businessId;
    const customerPhone = context.customerPhone || context.context?.customerPhone;

    const [conversation] = await db.select()
        .from(conversations)
        .where(and(
            eq(conversations.businessId, businessId),
            eq(conversations.customerPhone, customerPhone)
        ))
        .limit(1);

    if (!conversation || !conversation.cartItems) {
        return { success: false, message: 'No active cart found' };
    }

    const cartItems = conversation.cartItems as any[];
    const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const deliveryFee = conversation.latitude ? 150 : 0;
    const total = subtotal + deliveryFee;

    const orderNumber = `ORD-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

    // Create order in DB
    await db.insert(orders).values({
        businessId,
        orderNumber,
        subtotal: subtotal.toString(),
        deliveryFee: deliveryFee.toString(),
        totalAmount: total.toString(),
        items: cartItems,
        deliveryAddress: conversation.deliveryAddress,
        latitude: conversation.latitude,
        longitude: conversation.longitude,
        paymentMethod,
        status: 'PENDING',
    });

    // Clear cart and update state
    await db.update(conversations)
        .set({
            cartItems: [],
            currentState: ConversationState.COMPLETED,
        })
        .where(eq(conversations.id, conversation.id));

    return {
        success: true,
        orderNumber,
        message: `Asante sana! Order ${orderNumber} has been placed. Total: Ksh ${total}.`,
    };
});

export const trackOrderTool = ai.defineTool({
    name: 'trackOrder',
    description: 'Check the status of a customer order',
    inputSchema: z.object({
        orderNumber: z.string().optional(),
    }),
    outputSchema: z.object({
        found: z.boolean(),
        status: z.string().optional(),
        details: z.string().optional(),
        message: z.string(),
    }),
}, async ({ orderNumber }, context: any) => {
    const businessId = context.businessId || context.context?.businessId;
    const customerPhone = context.customerPhone || context.context?.customerPhone;

    let conditions = [eq(orders.businessId, businessId)];

    if (orderNumber) {
        conditions.push(eq(orders.orderNumber, orderNumber));
    } else {
        // Find latest order for this customer
        const [customer] = await db.select().from(customers)
            .where(and(eq(customers.businessId, businessId), eq(customers.phoneNumber, customerPhone)))
            .limit(1);

        if (customer) {
            conditions.push(eq(orders.customerId, customer.id));
        } else {
            return { found: false, message: 'No customer profile found to track orders.' };
        }
    }

    const [order] = await db.select().from(orders)
        .where(and(...conditions))
        .orderBy(desc(orders.createdAt))
        .limit(1);

    if (!order) {
        return { found: false, message: 'Sina habari (I have no info) on that order. Please check the order number.' };
    }

    return {
        found: true,
        status: order.status || undefined,
        message: `Order ${order.orderNumber} status is ${order.status}. Total: Ksh ${order.totalAmount}.`,
    };
});

// =============================================
// MAIN SALES AGENT FLOW
// =============================================

export const salesAgentFlow = ai.defineFlow({
    name: 'salesAgent',
    inputSchema: z.object({
        businessId: z.string(),
        customerPhone: z.string(),
        customerName: z.string().optional(),
        message: z.string(),
        messageType: z.enum(['text', 'image', 'location']).default('text'),
        imageUrl: z.string().optional(),
    }),
    outputSchema: z.object({
        response: z.string(),
        newState: z.string(),
        requiresHumanHandoff: z.boolean(),
        confidence: z.number(),
        interactive: z.object({
            type: z.enum(['button', 'list']),
            buttons: z.array(z.object({
                id: z.string(),
                title: z.string(),
            })).optional(),
        }).nullable().optional(),
    }),
}, async (input) => {
    try {
        logger.info('Processing message', {
            businessId: input.businessId,
            customerPhone: input.customerPhone,
            messageType: input.messageType,
        });

        // Get or create conversation
        const conversation = await getOrCreateConversation(
            input.businessId,
            input.customerPhone,
            input.customerName
        );

        // Get business details for persona
        const business = await getBusinessDetails(input.businessId);

        // Build system prompt
        const systemPrompt = buildSystemPrompt(business, conversation);

        // Generate AI response
        const result = await ai.generate({
            model: 'googleai/gemini-flash-latest',
            prompt: `${systemPrompt}

Customer message: ${input.message}

Current conversation state: ${conversation.currentState}
Cart items: ${JSON.stringify(conversation.cartItems)}
Delivery Location: ${conversation.latitude ? `${conversation.latitude}, ${conversation.longitude}` : 'Not provided'}

Respond naturally to help the customer. Use tools when needed to search products, manage cart, etc.`,
            tools: [searchProductsTool, addToCartTool, getCartTool, checkoutTool, createOrderTool, trackOrderTool],
            output: {
                schema: z.object({
                    responseText: z.string().describe('The natural language response to the customer'),
                    interactive: z.object({
                        type: z.enum(['button', 'list']),
                        buttons: z.array(z.object({
                            id: z.string(),
                            title: z.string(),
                        })).optional(),
                    }).nullable().optional(),
                }),
            },
            config: {
                temperature: 0.7,
                maxOutputTokens: 1000,
            },
            context: {
                businessId: input.businessId,
                customerPhone: input.customerPhone,
            },
        });

        const output = result.output as any;
        const responseText = output?.responseText || result.text;
        const interactive = output?.interactive;

        // Determine if handoff needed
        const requiresHandoff = shouldHandoffToHuman(result, conversation);

        // Update conversation state
        const newState = determineNewState(conversation.currentState || 'BROWSING', result);

        await updateConversationState(conversation.id, newState, requiresHandoff);

        return {
            response: responseText,
            newState,
            requiresHumanHandoff: requiresHandoff,
            confidence: 0.85,
            interactive,
        };

    } catch (error) {
        logger.error('AI flow error', { error });

        return {
            response: "I'm having trouble right now. Let me connect you with our team.",
            newState: ConversationState.SUPPORT,
            requiresHumanHandoff: true,
            confidence: 0.0,
        };
    }
});

// =============================================
// HELPER FUNCTIONS
// =============================================

async function getOrCreateConversation(
    businessId: string,
    customerPhone: string,
    customerName?: string
) {
    const [existing] = await db.select()
        .from(conversations)
        .where(and(
            eq(conversations.businessId, businessId),
            eq(conversations.customerPhone, customerPhone)
        ))
        .limit(1);

    if (existing) {
        return existing;
    }

    const [newConv] = await db.insert(conversations)
        .values({
            businessId,
            customerPhone,
            currentState: ConversationState.BROWSING,
            cartItems: [],
            contextMemory: {},
        })
        .returning();

    await db.insert(customers)
        .values({
            businessId,
            phoneNumber: customerPhone,
            name: customerName,
            optedInAt: new Date(),
        })
        .onConflictDoNothing();

    return newConv;
}

async function getBusinessDetails(businessId: string) {
    const [business] = await db.select()
        .from(businesses)
        .where(eq(businesses.id, businessId))
        .limit(1);

    return business;
}

function buildSystemPrompt(business: any, _conversation: any): string {
    return `You are a helpful sales assistant for ${business.name}, a ${business.category} business in Kenya.

Your role:
- Help customers find products
- Answer questions about products and pricing
- Manage their shopping cart
- Guide them through checkout

Important rules:
- Be friendly and conversational
- Speak in ${business.defaultLanguage || 'English'} (also understand Kiswahili and Sheng)
- NEVER invent prices - only use prices from the searchProducts tool
- NEVER confirm out-of-stock items
- If you don't know something, say so
- Keep responses concise (2-3 sentences max)

${business.aiPersona || 'Be professional and helpful.'}

INTERACTIVE BUTTON RULES:
- If the state is CHECKOUT:
  - If the business prefers Cash on Delivery (${business.prefersCod}), include:
    - id: 'confirm_order_cod', title: '✅ Confirm Order'
  - Else (M-Pesa Automated), include:
    - id: 'pay_now', title: '💳 Pay Now'
  - Always include:
    - id: 'talk_human', title: '🙋 Talk to Human'
- If you are suggesting a handoff, include:
  - id: 'talk_human', title: '🙋 Talk to Human'
- If the state is CHECKOUT and no delivery location is provided (${_conversation.latitude ? 'provided' : 'missing'}), politely ask the customer to "Send Location" using the WhatsApp clip icon.
- Maximum 3 buttons. Title max 20 characters.`;
}

function shouldHandoffToHuman(result: any, _conversation: any): boolean {
    const response = (result.output?.responseText || result.text || '').toLowerCase();
    const toolCalls = result.toolCalls || [];

    if (response.trim().length === 0 && toolCalls.length === 0) {
        return true;
    }

    const handoffKeywords = ['owner', 'manager', 'speak to human', 'talk to someone', 'complaint'];
    const hasHandoffKeyword = handoffKeywords.some(keyword =>
        response.toLowerCase().includes(keyword)
    );

    const isLowConfidence = response.length < 10 && toolCalls.length === 0;

    return hasHandoffKeyword || isLowConfidence;
}

function determineNewState(currentState: string, result: any): string {
    const toolCalls = result.toolCalls || [];
    const hasAddToCart = toolCalls.some((tc: any) => tc.name === 'addToCart');
    if (hasAddToCart) {
        return ConversationState.CART_BUILDING;
    }

    const text = (result.output?.responseText || result.text || '').toLowerCase();
    if (text.includes('checkout') || text.includes('pay') || text.includes('buy now')) {
        return ConversationState.CHECKOUT;
    }

    return currentState;
}

async function updateConversationState(
    conversationId: string,
    newState: string,
    handoff: boolean
) {
    await db.update(conversations)
        .set({
            currentState: newState,
            handoffToHuman: handoff,
            lastMessageAt: new Date(),
        })
        .where(eq(conversations.id, conversationId));
}
