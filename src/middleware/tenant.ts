import { Request, Response, NextFunction } from 'express';
import { db } from '@/database/client';
import { sql } from 'drizzle-orm';

export async function tenantMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        // Extract business ID from:
        // 1. JWT token (if authenticated)
        // 2. API key header
        // 3. Query parameter (for testing)

        const businessId = req.headers['x-business-id'] as string || req.query.businessId as string;

        if (!businessId) {
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Business ID required',
            });
            return;
        }

        // Set PostgreSQL session variable for RLS
        await db.execute(sql`SET app.current_business_id = ${businessId}`);

        // Attach to request for use in routes
        (req as any).businessId = businessId;

        next();
        return;
    } catch (error) {
        next(error);
        return;
    }
}
