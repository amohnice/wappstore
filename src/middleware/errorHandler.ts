import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ErrorHandler');

export function errorHandler(
    err: any,
    req: Request,
    res: Response,
    _next: NextFunction
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
