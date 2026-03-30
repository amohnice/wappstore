# WappStore 🚀

A multi-tenant conversational commerce platform built for WhatsApp, leveraging Genkit AI and M-Pesa. Developed for modern African merchants to scale via AI-driven conversational commerce.

## ✨ Features

### 🛍️ Conversational Shopping (B2C)
- **AI Sales Agent**: Natural language product search and personalized recommendations.
- **Interactive Cart**: Multi-item cart management via WhatsApp interactive buttons.
- **Location-Based Delivery**: Precise delivery fee calculation using WhatsApp location sharing.
- **Automated Tracking**: Real-time order status tracking directly in the chat.
- **Payment Flexibility**: Support for both M-Pesa STK Push and Cash on Delivery (COD).

### 🏪 Merchant Pro Tools (B2B)
- **Platform Agent**: Dedicated AI agent for merchant onboarding and store management.
- **Smart Analytics**: Detailed insights into top-selling products and low-stock alerts.
- **Promotion Manager**: Set product discounts and boost sales with time-limited offers.
- **Account Management**: Seamlessly opt-out of AI services or reactivate your account anytime.

### ⚙️ Core Architecture
- **Multi-Agent Routing**: Intelligent message routing between B2B (Platform) and B2C (Sales) agents.
- **Evidence Vault**: Secure storage of all incoming/outgoing messages for audit and debugging.
- **Hybrid Processing**: Supports both BullMQ-powered background processing and Serverless Sync Mode.

## 🛠️ Tech Stack

- **Framework**: [Genkit AI](https://github.com/google/genkit)
- **Runtime**: Node.js (TypeScript)
- **Database**: PostgreSQL with Drizzle ORM (Neon recommended)
- **Messaging**: Meta WhatsApp Business Cloud API
- **Payments**: M-Pesa (Safaricom Daraja API)
- **Queue/Sate**: Redis (Upstash recommended for serverless)
- **Deployment**: Local Node.js or Vercel (Serverless)

## 🚀 Quick Start

### 1. Local Setup
1. **Clone & Install**:
   ```bash
   git clone https://github.com/amohnice/wappstore.git
   cd wappstore
   pnpm install
   ```
2. **Environment Setup**:
   Copy `.env.example` to `.env` and fill in the required keys.
3. **Database Setup**:
   ```bash
   pnpm db:push
   pnpm db:seed
   ```
4. **Run Dev Server**:
   ```bash
   pnpm dev
   ```

### 2. Vercel Deployment (Production)
This project is optimized for Vercel Serverless Functions.
1. **Prepare Env**: Use `.env.production.example` as a template for your Vercel Environment Variables.
2. **Synchronous Mode**: Set `SYNC_MODE=true` in Vercel to allow immediate AI responses without a separate worker process.
3. **Deploy**: Connect your repository to Vercel and it will auto-deploy using `vercel.json`.

## 🧪 Testing & Processing Modes

WappStore supports two processing modes:

| Mode | Trigger | Use Case | Requirements |
|---|---|---|---|
| **Queue Mode** | `SYNC_MODE=false` | Production high-volume usage. | Redis + Background Worker |
| **Sync Mode** | `SYNC_MODE=true` | Serverless (Vercel) / Simple testing. | No worker needed |

## 📖 Project Structure

```text
src/
├── services/
│   ├── ai/            # Multi-Agent Logic (Sales & Platform)
│   ├── whatsapp/      # Meta WhatsApp API Client
│   ├── payments/      # M-Pesa Integration
│   └── queue.ts       # Hybrid Processing Logic (Sync/Async)
├── database/          # Drizzle Schema & Migrations
└── index.ts           # Express App Entry (Serverless compatible)
```

## 📜 License

MIT
