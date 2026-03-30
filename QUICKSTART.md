# 🚀 Quick Start Guide - 30 Minutes to First Sale

This guide will get you from zero to a working WhatsApp commerce bot in 30 minutes.

## ⚡ Prerequisites (5 minutes)

Install these on your machine:

```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs postgresql-16 redis-server
npm install -g pnpm

# macOS
brew install node@20 postgresql@16 redis
npm install -g pnpm
```

## 📦 Step 1: Project Setup (5 minutes)

```bash
# Create project directory
mkdir commerce-os && cd wappstore

# Initialize project
pnpm init

# Install dependencies (copy from package.json artifact)
pnpm add express @genkit-ai/ai @genkit-ai/googleai drizzle-orm postgres \
  ioredis bullmq axios zod winston helmet cors express-rate-limit dotenv

pnpm add -D typescript tsx drizzle-kit @types/express @types/node

# Create directory structure
mkdir -p src/{config,database,services,routes,utils,middleware}
mkdir -p src/services/{whatsapp,ai,payments}
mkdir -p src/database/{migrations,seeds}
mkdir -p logs scripts

# Create configuration files
# (Copy tsconfig.json, drizzle.config.ts from artifacts)
```

## 🗄️ Step 2: Database Setup (5 minutes)

```bash
# Start PostgreSQL
sudo service postgresql start  # Ubuntu
# brew services start postgresql@16  # macOS

# Create database
sudo -u postgres psql << EOF
CREATE DATABASE commerce_os;
CREATE USER commerce_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE commerce_os TO commerce_user;
\c commerce_os
CREATE EXTENSION vector;
EOF

# Create .env file
cat > .env << 'EOF'
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://commerce_user:your_password@localhost:5432/commerce_os
REDIS_URL=redis://localhost:6379

# Add these later when you have them
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=random_string_12345
GOOGLE_GENAI_API_KEY=
MPESA_CONSUMER_KEY=
MPESA_CONSUMER_SECRET=
MPESA_PASSKEY=
MPESA_SHORTCODE=174379
MPESA_CALLBACK_URL=
PLATFORM_FEE_PERCENTAGE=5
VAT_PERCENTAGE=16
EOF

# Copy all source files from artifacts to src/
# (Copy database/schema.ts, index.ts, routes/, services/, etc.)

# Run migrations
pnpm db:generate
pnpm db:migrate

# Seed sample data
pnpm db:seed
```

## 📱 Step 3: WhatsApp Setup (10 minutes)

### Get WhatsApp Credentials

1. Go to https://developers.facebook.com/
2. Click "My Apps" → "Create App" → Select "Business"
3. Add "WhatsApp" product
4. Go to "API Setup" tab

**Get your credentials:**
- **Phone Number ID**: Copy from "Phone number ID" field
- **Access Token**: Click "Generate Token" → Copy permanent token
- **Verify Token**: Create your own (e.g., "my_verify_token_123")

### Set up Webhook

1. Install ngrok for local testing:
```bash
npm install -g ngrok
```

2. In one terminal, start your server:
```bash
pnpm dev
```

3. In another terminal, start ngrok:
```bash
ngrok http 3000
```

4. Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)

5. Back in Meta dashboard:
    - Click "Configure Webhooks"
    - Callback URL: `https://abc123.ngrok.io/webhooks/whatsapp`
    - Verify Token: Use the one from your .env
    - Subscribe to "messages" field
    - Click "Verify and Save"

### Update .env

```bash
# Add to .env
WHATSAPP_ACCESS_TOKEN=your_permanent_token_here
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_VERIFY_TOKEN=my_verify_token_123
API_BASE_URL=https://abc123.ngrok.io
```

## 🤖 Step 4: AI Setup (2 minutes)

1. Get Gemini API Key:
    - Go to https://aistudio.google.com/app/apikey
    - Click "Get API Key"
    - Copy the key

2. Add to .env:
```bash
GOOGLE_GENAI_API_KEY=your_gemini_key_here
```

## 💰 Step 5: M-Pesa Setup (Optional - 3 minutes)

For testing, use Daraja Sandbox:

1. Go to https://developer.safaricom.co.ke/
2. Create account and login
3. Create new app → Select "M-Pesa Sandbox"
4. Get credentials from app dashboard

Add to .env:
```bash
MPESA_CONSUMER_KEY=your_sandbox_key
MPESA_CONSUMER_SECRET=your_sandbox_secret  
MPESA_PASSKEY=bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919
MPESA_SHORTCODE=174379
MPESA_CALLBACK_URL=https://abc123.ngrok.io/webhooks/mpesa
```

## 🧪 Step 6: Test It! (5 minutes)

### Test 1: Send a WhatsApp Message

1. Open WhatsApp on your phone
2. Send a message to your WhatsApp Business test number
3. You should get an AI response!

Try these messages:
```
Hi
Show me products
Do you have blue hoodies?
How much?
Add to cart
```

### Test 2: Check Database

```bash
# View created conversation
psql $DATABASE_URL -c "SELECT * FROM conversations;"

# View messages
psql $DATABASE_URL -c "SELECT * FROM messages LIMIT 5;"

# View products
psql $DATABASE_URL -c "SELECT name, base_price FROM products;"
```

### Test 3: Simulate Payment (Optional)

```bash
# Run test script
pnpm tsx scripts/test-mpesa.ts

# Use test phone: 254708374149
# Enter any 4-digit PIN
```

## ✅ You're Live!

Congratulations! You now have:

✅ WhatsApp bot responding to messages  
✅ AI-powered product recommendations  
✅ Shopping cart functionality  
✅ Database storing conversations  
✅ (Optional) M-Pesa payment integration

## 🎯 Next Steps

### Immediate (Same Day)
- [ ] Add more products to your catalog
- [ ] Customize AI persona in database
- [ ] Test full purchase flow
- [ ] Invite friends to test

### This Week
- [ ] Set up production database (Neon/Supabase)
- [ ] Deploy to Railway or Fly.io
- [ ] Switch to production WhatsApp number
- [ ] Apply for M-Pesa Go-Live
- [ ] Add your first real merchant

### This Month
- [ ] Build merchant dashboard (Next.js)
- [ ] Add analytics and reporting
- [ ] Implement vision-based inventory
- [ ] Set up automated backups
- [ ] Launch beta program

## 🆘 Troubleshooting

### Webhook not working?
```bash
# Check ngrok is running
curl https://your-ngrok-url.ngrok.io/health

# Check server logs
tail -f logs/combined.log

# Verify token matches
echo $WHATSAPP_VERIFY_TOKEN
```

### AI not responding?
```bash
# Test AI directly
pnpm tsx scripts/test-ai.ts

# Check Gemini API key
curl -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"Hello"}]}]}' \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=$GOOGLE_GENAI_API_KEY"
```

### Database connection failed?
```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1;"

# Check PostgreSQL is running
sudo service postgresql status

# Verify credentials
echo $DATABASE_URL
```

### M-Pesa STK not working?
```bash
# Check credentials
curl -u "$MPESA_CONSUMER_KEY:$MPESA_CONSUMER_SECRET" \
  https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials

# Use test phone for sandbox
# Phone: 254708374149
# PIN: Any 4 digits
```

## 📚 Useful Commands

```bash
# Development
pnpm dev                # Start dev server
pnpm build              # Build for production
pnpm start              # Start production

# Database
pnpm db:migrate         # Run migrations
pnpm db:seed            # Seed data
pnpm db:studio          # Open DB GUI

# Testing
pnpm tsx scripts/test-whatsapp.ts   # Test WhatsApp
pnpm tsx scripts/test-mpesa.ts      # Test M-Pesa
pnpm tsx scripts/test-ai.ts         # Test AI
pnpm tsx scripts/health-check.ts    # System health

# Docker
make docker-up          # Start all services
make docker-down        # Stop all services
make docker-logs        # View logs
```

## 🎓 Learn More

- [Full Documentation](README.md)
- [System Architecture](ARCHITECTURE.md)
- [API Reference](API.md)
- [6-Week Implementation Plan](IMPLEMENTATION_CHECKLIST.md)

## 💡 Pro Tips

1. **Keep ngrok running** during development
2. **Monitor logs** in real-time: `tail -f logs/combined.log`
3. **Test with multiple phones** to simulate real users
4. **Use Drizzle Studio** to view data: `pnpm db:studio`
5. **Check Meta webhook logs** in developer console

## 🎉 Success Indicators

You'll know everything is working when:

- ✅ WhatsApp messages get instant AI responses
- ✅ Products can be searched and added to cart
- ✅ Checkout flow completes successfully
- ✅ M-Pesa STK Push appears on phone
- ✅ Payment callback updates order status
- ✅ Receipts are generated and sent

---

**Need Help?**
- Check troubleshooting section above
- Review full documentation in README.md
- Search error messages in logs
- Test individual components with scripts

**Ready to Scale?**
- See deployment guide for production setup
- Follow 6-week checklist for full features
- Join our Discord community (link in README)

Good luck! 🚀
