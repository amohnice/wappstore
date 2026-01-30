import { Router } from 'express';
import { db } from '@/database/client';
import { products, orders, customers } from '@/database/schema';
import { eq, and, desc, sql, gte } from 'drizzle-orm';
import { z } from 'zod';
import { createLogger } from '@/utils/logger';

const router: Router = Router();
const logger = createLogger('MerchantAPI');

// =============================================
// PRODUCTS
// =============================================

// Get all products
router.get('/products', async (req, res, next) => {
    try {
        const businessId = (req as any).businessId;

        const allProducts = await db.select()
            .from(products)
            .where(eq(products.businessId, businessId))
            .orderBy(desc(products.createdAt));

        res.json({
            success: true,
            products: allProducts,
        });
    } catch (error) {
        next(error);
    }
});

// Create product
const CreateProductSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    category: z.string(),
    basePrice: z.number().positive(),
    minimumPrice: z.number().positive(),
    images: z.array(z.string()).optional(),
    stockQuantity: z.number().int().min(0).default(0),
});

router.post('/products', async (req, res, next) => {
    try {
        const businessId = (req as any).businessId;
        const data = CreateProductSchema.parse(req.body);

        const [product] = await db.insert(products).values({
            businessId,
            name: data.name,
            description: data.description,
            category: data.category,
            basePrice: data.basePrice.toString(),
            minimumPrice: data.minimumPrice.toString(),
            images: data.images || [],
            stockQuantity: data.stockQuantity,
        }).returning();

        logger.info('Product created', { productId: product.id, businessId });

        res.status(201).json({
            success: true,
            product,
        });
    } catch (error) {
        next(error);
    }
});

// Update product
router.patch('/products/:id', async (req, res, next) => {
    try {
        const businessId = (req as any).businessId;
        const productId = req.params.id;

        const [updated] = await db.update(products)
            .set({
                ...req.body,
                updatedAt: new Date(),
            })
            .where(and(
                eq(products.id, productId),
                eq(products.businessId, businessId)
            ))
            .returning();

        if (!updated) {
            return res.status(404).json({
                success: false,
                error: 'Product not found',
            });
        }

        res.json({
            success: true,
            product: updated,
        });
        return;
    } catch (error) {
        next(error);
        return;
    }
});

// Delete product
router.delete('/products/:id', async (req, res, next) => {
    try {
        const businessId = (req as any).businessId;
        const productId = req.params.id;

        const [deleted] = await db.delete(products)
            .where(and(
                eq(products.id, productId),
                eq(products.businessId, businessId)
            ))
            .returning();

        if (!deleted) {
            return res.status(404).json({
                success: false,
                error: 'Product not found',
            });
        }

        res.json({
            success: true,
            message: 'Product deleted',
        });
        return;
    } catch (error) {
        next(error);
        return;
    }
});

// =============================================
// ORDERS
// =============================================

// Get all orders
router.get('/orders', async (req, res, next) => {
    try {
        const businessId = (req as any).businessId;
        const status = req.query.status as string | undefined;

        const conditions = [eq(orders.businessId, businessId)];
        if (status) {
            conditions.push(eq(orders.status, status));
        }

        const allOrders = await db.select()
            .from(orders)
            .where(and(...conditions))
            .orderBy(desc(orders.createdAt));

        res.json({
            success: true,
            orders: allOrders,
        });
    } catch (error) {
        next(error);
    }
});

// Get single order
router.get('/orders/:id', async (req, res, next) => {
    try {
        const businessId = (req as any).businessId;
        const orderId = req.params.id;

        const [order] = await db.select()
            .from(orders)
            .where(and(
                eq(orders.id, orderId),
                eq(orders.businessId, businessId)
            ))
            .limit(1);

        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found',
            });
        }

        res.json({
            success: true,
            order,
        });
        return;
    } catch (error) {
        next(error);
        return;
    }
});

// Update order status
router.patch('/orders/:id/status', async (req, res, next) => {
    try {
        const businessId = (req as any).businessId;
        const orderId = req.params.id;
        const { status } = req.body;

        const [updated] = await db.update(orders)
            .set({
                status,
                ...(status === 'COMPLETED' && { completedAt: new Date() }),
            })
            .where(and(
                eq(orders.id, orderId),
                eq(orders.businessId, businessId)
            ))
            .returning();

        if (!updated) {
            return res.status(404).json({
                success: false,
                error: 'Order not found',
            });
        }

        res.json({
            success: true,
            order: updated,
        });
        return;
    } catch (error) {
        next(error);
        return;
    }
});

// =============================================
// CUSTOMERS
// =============================================

// Get all customers
router.get('/customers', async (req, res, next) => {
    try {
        const businessId = (req as any).businessId;

        const allCustomers = await db.select()
            .from(customers)
            .where(eq(customers.businessId, businessId))
            .orderBy(desc(customers.createdAt));

        res.json({
            success: true,
            customers: allCustomers,
        });
    } catch (error) {
        next(error);
    }
});

// =============================================
// ANALYTICS
// =============================================

// Dashboard stats
router.get('/analytics/dashboard', async (req, res, next) => {
    try {
        const businessId = (req as any).businessId;
        const period = req.query.period || '7d'; // 7d, 30d, 90d

        // Calculate date range
        const daysAgo = period === '7d' ? 7 : period === '30d' ? 30 : 90;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysAgo);

        // Total revenue
        const [revenueResult] = await db.select({
            total: sql<number>`COALESCE(SUM(CAST(${orders.totalAmount} AS DECIMAL)), 0)`,
        })
            .from(orders)
            .where(and(
                eq(orders.businessId, businessId),
                eq(orders.paymentStatus, 'PAID'),
                gte(orders.createdAt, startDate)
            ));

        // Total orders
        const [ordersResult] = await db.select({
            count: sql<number>`COUNT(*)`,
        })
            .from(orders)
            .where(and(
                eq(orders.businessId, businessId),
                gte(orders.createdAt, startDate)
            ));

        // Total customers
        const [customersResult] = await db.select({
            count: sql<number>`COUNT(*)`,
        })
            .from(customers)
            .where(eq(customers.businessId, businessId));

        // Payment success rate
        const [successRate] = await db.select({
            total: sql<number>`COUNT(*)`,
            paid: sql<number>`COUNT(*) FILTER (WHERE ${orders.paymentStatus} = 'PAID')`,
        })
            .from(orders)
            .where(and(
                eq(orders.businessId, businessId),
                gte(orders.createdAt, startDate)
            ));

        const paymentSuccessRate = successRate.total > 0
            ? (successRate.paid / successRate.total) * 100
            : 0;

        res.json({
            success: true,
            analytics: {
                revenue: parseFloat(revenueResult.total.toString()),
                orders: ordersResult.count,
                customers: customersResult.count,
                paymentSuccessRate: paymentSuccessRate.toFixed(2),
                period,
            },
        });
    } catch (error) {
        next(error);
    }
});

// Sales by day
router.get('/analytics/sales-by-day', async (req, res, next) => {
    try {
        const businessId = (req as any).businessId;
        const days = parseInt(req.query.days as string) || 7;

        const salesByDay = await db.select({
            date: sql<string>`DATE(${orders.createdAt})`,
            revenue: sql<number>`COALESCE(SUM(CAST(${orders.totalAmount} AS DECIMAL)), 0)`,
            orders: sql<number>`COUNT(*)`,
        })
            .from(orders)
            .where(and(
                eq(orders.businessId, businessId),
                eq(orders.paymentStatus, 'PAID'),
                sql`${orders.createdAt} >= NOW() - INTERVAL '${days} days'`
            ))
            .groupBy(sql`DATE(${orders.createdAt})`)
            .orderBy(sql`DATE(${orders.createdAt})`);

        res.json({
            success: true,
            data: salesByDay,
        });
    } catch (error) {
        next(error);
    }
});

// Top products
router.get('/analytics/top-products', async (req, res, next) => {
    try {
        const businessId = (req as any).businessId;
        const limit = parseInt(req.query.limit as string) || 10;

        // This requires parsing order items JSON
        // Simplified version - in production, use proper JSON query
        const topProducts = await db.select()
            .from(products)
            .where(eq(products.businessId, businessId))
            .orderBy(desc(products.stockQuantity))
            .limit(limit);

        res.json({
            success: true,
            products: topProducts,
        });
    } catch (error) {
        next(error);
    }
});

export { router as merchantRouter };
