import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import dotenv from 'dotenv';
import { createLogger } from './utils/logger.js';
import { whatsappRouter } from './routes/whatsapp.js';
import { mpesaRouter } from './routes/mpesa.js';
import { merchantRouter } from './routes/merchant.js';
import { errorHandler } from './middleware/errorHandler.js';
import { tenantMiddleware } from './middleware/tenant.js';

// Load environment variables
dotenv.config();

const app: Express = express();
const logger = createLogger('Server');
const PORT = process.env.PORT || 3000;

// =============================================
// SECURITY & MIDDLEWARE
// =============================================

// Security headers
app.use(helmet());

// CORS
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, _res, next) => {
    logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('user-agent'),
    });
    next();
});

// =============================================
// HEALTH CHECK
// =============================================

app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});

// =============================================
// API ROUTES
// =============================================

// WhatsApp webhooks (no auth needed - verified via token)
app.use('/webhooks/whatsapp', whatsappRouter);

// M-Pesa callbacks (verified via signature)
app.use('/webhooks/mpesa', mpesaRouter);

// Merchant API (requires authentication)
app.use('/api/merchant', tenantMiddleware, merchantRouter);

// =============================================
// ERROR HANDLING
// =============================================

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.path} not found`,
    });
});

// Global error handler
app.use(errorHandler);

// =============================================
// START SERVER
// =============================================

if (process.env.NODE_ENV !== 'production' || process.env.VERCEL_ENV === undefined) {
    app.listen(PORT, () => {
        logger.info(`🚀 Commerce OS running on port ${PORT}`);
        logger.info(`📱 WhatsApp webhook: ${process.env.API_BASE_URL}/webhooks/whatsapp`);
        logger.info(`💰 M-Pesa callback: ${process.env.API_BASE_URL}/webhooks/mpesa`);
        logger.info(`🏪 Environment: ${process.env.NODE_ENV}`);
    });
}

export default app;

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    process.exit(0);
});
