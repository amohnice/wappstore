import { db } from '../src/database/client';
import { businesses, products, conversations } from '../src/database/schema';
import { eq, and } from 'drizzle-orm';
import { salesAgentFlow } from '../src/services/ai/salesAgent';
import { platformAgentFlow } from '../src/services/ai/platformAgent';
import { createLogger } from '../src/utils/logger';

const logger = createLogger('Test-Advanced');

async function testAdvancedFeatures() {
    logger.info('Starting Advanced Features Test...');

    // 1. Setup Test Business
    const [business] = await db.select().from(businesses).limit(1);
    if (!business) {
        logger.error('No business found for testing.');
        return;
    }

    const customerPhone = '254700000000';

    // 2. Test Location Message Handling Simulation
    logger.info('Testing Location-Based Delivery Fee...');

    // Manual DB update to simulate location message received
    await db.update(conversations)
        .set({
            latitude: '-1.286389',
            longitude: '36.817223', // Nairobi Center
        })
        .where(and(eq(conversations.businessId, business.id), eq(conversations.customerPhone, customerPhone)));

    // Add something to cart first
    const [product] = await db.select().from(products).where(eq(products.businessId, business.id)).limit(1);
    if (product) {
        await salesAgentFlow({
            businessId: business.id,
            customerPhone,
            message: `Add ${product.name} to my cart`,
            messageType: 'text',
        });
    }

    // Call checkout
    const checkoutResult = await salesAgentFlow({
        businessId: business.id,
        customerPhone,
        message: 'Calculate my total with delivery',
        messageType: 'text',
    });

    logger.info('Checkout Response:', { response: checkoutResult.response });

    // 3. Test Merchant Pro Tools (Discounts)
    logger.info('Testing Merchant Pro Tools (Discounts)...');
    if (product) {
        const discountResult = await platformAgentFlow({
            customerPhone: business.phoneNumber || '',
            message: `Set a discount for product ${product.id} to price 500 for 10 days`,
            messageType: 'text',
        });
        logger.info('Discount Result:', { response: discountResult.response });
    }

    // 4. Test Merchant Pro Tools (Analytics)
    logger.info('Testing Merchant Pro Tools (Analytics)...');
    const analyticsResult = await platformAgentFlow({
        customerPhone: business.phoneNumber || '',
        message: 'Show me my shop analytics and stock alerts',
        messageType: 'text',
    });
    logger.info('Analytics Result:', { response: analyticsResult.response });

    // 5. Test Order Tracking
    logger.info('Testing Order Tracking...');
    const trackingResult = await salesAgentFlow({
        businessId: business.id,
        customerPhone,
        message: 'Where is my order?',
        messageType: 'text',
    });
    logger.info('Tracking Result:', { response: trackingResult.response });

    // 6. Test Opt-Out
    logger.info('Testing Merchant Opt-Out...');
    const deactivateResult = await platformAgentFlow({
        customerPhone: business.phoneNumber || '',
        message: 'I want to opt out of the AI service for a while',
        messageType: 'text',
    });
    logger.info('Deactivate Result:', { response: deactivateResult.response });

    // Verify customer gets "deactivated" message (Simulated via queue check logic)
    // We can't easily test the worker here without mocking Redis, 
    // but we can verify the DB state
    const [inactiveBusiness] = await db.select().from(businesses).where(eq(businesses.id, business.id)).limit(1);
    logger.info('Business Active Status:', { isActive: inactiveBusiness.isActive });

    // 7. Test Reactivate Request
    logger.info('Testing Reactivation Request...');
    const reactivateResult = await platformAgentFlow({
        customerPhone: business.phoneNumber || '',
        message: 'I want to come back and reactivate my shop',
        messageType: 'text',
    });
    logger.info('Reactivate Result:', { response: reactivateResult.response });

    logger.info('Tests Completed!');
}

testAdvancedFeatures().catch(console.error);
