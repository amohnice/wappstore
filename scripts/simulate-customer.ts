import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

async function simulateCustomerMessage(from: string, message: string) {
    const webhookPayload = {
        object: 'whatsapp_business_account',
        entry: [
            {
                id: 'entry-id',
                changes: [
                    {
                        value: {
                            messaging_product: 'whatsapp',
                            metadata: {
                                display_phone_number: '254712345678',
                                phone_number_id: PHONE_NUMBER_ID,
                            },
                            messages: [
                                {
                                    from,
                                    id: `msg-${Date.now()}`,
                                    timestamp: Date.now().toString(),
                                    type: 'text',
                                    text: {
                                        body: message,
                                    },
                                },
                            ],
                        },
                        field: 'messages',
                    },
                ],
            },
        ],
    };

    try {
        const response = await axios.post(
            `${API_URL}/webhooks/whatsapp`,
            webhookPayload
        );

        console.log(`✅ Sent: "${message}"`);
        return response.data;
    } catch (error: any) {
        console.error('❌ Failed:', error.message);
    }
}

async function simulateConversation() {
    console.log('🎭 Simulating Customer Conversation');
    console.log('====================================\n');

    const customerPhone = '+254722111222';

    const conversation = [
        'Hi',
        'Show me dresses',
        'Do you have anything red?',
        'How much is the red dress?',
        'Add to cart',
        'Checkout',
    ];

    for (const message of conversation) {
        console.log(`\n👤 Customer: ${message}`);
        await simulateCustomerMessage(customerPhone, message);

        // Wait a bit before next message
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log('\n✅ Conversation simulation complete!');
    console.log('Check your logs to see AI responses.');
}

simulateConversation();
