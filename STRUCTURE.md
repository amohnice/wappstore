# 📁 WappStore Project Structure

This document provides a map of the core components in WappStore.

## Directory Overview

```text
commerce-os/
├── 📁 src/                      # Source code
│   ├── 📄 index.ts              # Entry point & Webhook server
│   ├── 📁 database/             # Persistence Layer
│   │   ├── 📄 schema.ts         # Drizzle schema (Multitenant)
│   │   └── 📄 client.ts         # DB Client & Connection
│   ├── 📁 services/             # Logic Layer
│   │   ├── 📁 ai/               # AI Multi-Agent Architecture
│   │   │   ├── 📄 genkit.ts     # Genkit Initialization
│   │   │   ├── 📄 salesAgent.ts # B2C Shopping Flow
│   │   │   └── 📄 platformAgent.ts # B2B Merchant Tools
│   │   ├── 📁 whatsapp/         # Meta Integration
│   │   ├── 📁 payments/         # M-Pesa STK & Callbacks
│   │   └── 📄 queue.ts          # Job Orchestration (BullMQ)
│   ├── 📁 routes/               # API Endpoints
│   └── 📁 utils/                # Loggers & Helpers
├── 📁 scripts/                  # DevOps & Testing
│   └── 📄 verify-all.ts         # End-to-end verification
└── 📄 README.md                 # Core Documentation
```

## Core Components

### 1. Multi-Agent AI (`src/services/ai/`)
The system uses a two-agent architecture:
- **Sales Agent**: Handles customer interaction, product search, cart management, and order tracking.
- **Platform Agent**: Handles merchant onboarding, analytics, and store settings.

### 2. Message Orchestration (`src/services/queue.ts`)
Uses BullMQ and Redis to ensure messages are processed reliably. This layer handles routing between agents based on the sender's role and the target phone number ID.

### 3. Payment Integration (`src/services/payments/`)
Direct integration with Safaricom M-Pesa. Supports automated STK push requests and asynchronous status updates via webhooks.

### 4. Database Schema (`src/database/schema.ts`)
A multi-tenant PostgreSQL schema using UUIDs for isolation. Key tables include `businesses`, `products`, `orders`, and `conversations`.

## Data Retention Policy
All business data (products, orders, analytics) is preserved even if a merchant opts out of AI services. This ensures a seamless "reactivation" experience where history is never lost.