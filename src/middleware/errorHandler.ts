import { Request, Response } from 'express';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ErrorHandler');

export function errorHandler(
    err: Error,
    req: Request,
    res: Response
) {
    logger.error('Unhandled error', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
    });

    // Don't leak error details in production
    const message = process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message;

    res.status(500).json({
        error: 'Internal Server Error',
        message,
    });
}
