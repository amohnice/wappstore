import express, { Application } from 'express';
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

const app: Application = express();
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
// LANDING PAGE & HEALTH CHECK
// =============================================

app.get('/', (_req, res) => {
  res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Commerce OS | AI-Powered Conversational Commerce</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
            <style>
                :root {
                    --bg: #ffffff;
                    --bg-secondary: #f7f6f3;
                    --text: #37352f;
                    --text-secondary: #787774;
                    --text-tertiary: #9b9a97;
                    --border: #e9e9e7;
                    --hover: #f1f1ef;
                    --accent: #37352f;
                }
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    background: var(--bg);
                    color: var(--text);
                    line-height: 1.5;
                    -webkit-font-smoothing: antialiased;
                }
                .container {
                    max-width: 1100px;
                    margin: 0 auto;
                    padding: 0 2rem;
                }
                .hero {
                    min-height: 100vh;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    padding: 4rem 0;
                }
                .hero-content {
                    margin-bottom: 4rem;
                }
                .badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.5rem;
                    background: var(--bg-secondary);
                    color: var(--text-secondary);
                    padding: 0.375rem 0.75rem;
                    border-radius: 0.375rem;
                    font-size: 0.875rem;
                    font-weight: 500;
                    margin-bottom: 2rem;
                }
                .badge::before {
                    content: '✨';
                    font-size: 1rem;
                }
                h1 {
                    font-size: 3.5rem;
                    font-weight: 700;
                    color: var(--text);
                    margin-bottom: 1.5rem;
                    letter-spacing: -0.03em;
                    line-height: 1.1;
                }
                .subtitle {
                    font-size: 1.25rem;
                    color: var(--text-secondary);
                    margin-bottom: 0;
                    font-weight: 400;
                    max-width: 650px;
                }
                .features-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                    gap: 1.5rem;
                    margin-top: 3rem;
                }
                .feature-card {
                    background: var(--bg);
                    border: 1px solid var(--border);
                    border-radius: 0.5rem;
                    padding: 2rem;
                    transition: all 0.15s ease;
                    cursor: default;
                }
                .feature-card:hover {
                    background: var(--hover);
                    border-color: rgba(55, 53, 47, 0.16);
                }
                .feature-icon {
                    width: 2.5rem;
                    height: 2.5rem;
                    background: var(--bg-secondary);
                    border-radius: 0.5rem;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.25rem;
                    margin-bottom: 1.25rem;
                }
                .feature-card h3 {
                    font-size: 1.125rem;
                    font-weight: 600;
                    color: var(--text);
                    margin-bottom: 0.75rem;
                    letter-spacing: -0.01em;
                }
                .feature-card p {
                    font-size: 0.9375rem;
                    color: var(--text-secondary);
                    line-height: 1.6;
                    margin: 0;
                }
                .divider {
                    height: 1px;
                    background: var(--border);
                    margin: 4rem 0;
                }
                .footer {
                    padding: 2rem 0;
                    text-align: center;
                }
                .footer-content {
                    font-size: 0.875rem;
                    color: var(--text-tertiary);
                    font-weight: 400;
                }
                @media (max-width: 768px) {
                    h1 {
                        font-size: 2.5rem;
                    }
                    .subtitle {
                        font-size: 1.125rem;
                    }
                    .features-grid {
                        grid-template-columns: 1fr;
                    }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="hero">
                    <div class="hero-content">
                        <div class="badge">Next Generation Commerce</div>
                        <h1>Commerce OS</h1>
                        <p class="subtitle">Unlock the power of conversational commerce. Our platform uses advanced AI to automate sales, customer engagement, and order management directly through WhatsApp.</p>
                    </div>
                    
                    <div class="features-grid">
                        <div class="feature-card">
                            <div class="feature-icon">🤖</div>
                            <h3>AI Sales Agent</h3>
                            <p>Automated product discovery and personalized shopping experiences.</p>
                        </div>
                        
                        <div class="feature-card">
                            <div class="feature-icon">💳</div>
                            <h3>Instant Payments</h3>
                            <p>Secure M-Pesa integration for seamless checkout flows.</p>
                        </div>
                        
                        <div class="feature-card">
                            <div class="feature-icon">📦</div>
                            <h3>Order Tracking</h3>
                            <p>End-to-end management from conversation to delivery.</p>
                        </div>
                    </div>
                </div>
                
                <div class="divider"></div>
                
                <div class="footer">
                    <div class="footer-content">
                        Built for modern businesses. © 2024 Commerce OS. All rights reserved.
                    </div>
                </div>
            </div>
        </body>
        </html>
    `);
});

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
