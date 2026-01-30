import 'dotenv/config';
import { db } from '../client.js';
import { businesses, products, customers } from '../schema.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('Seed');

async function seed() {
    try {
        logger.info('Starting database seed...');

        // Create sample business
        const [business] = await db.insert(businesses).values({
            name: "Jane's Fashion Store",
            category: 'Fashion & Apparel',
            phoneNumber: '+254712345678',
            whatsappNumberId: 'your_phone_number_id', // Replace with actual
            paybillNumber: '174379',
            verificationStatus: 'VERIFIED',
            subscriptionTier: 'GROWTH',
            defaultLanguage: 'en',
            aiPersona: 'Friendly and helpful fashion advisor. Always enthusiastic about style!',
            isActive: true,
        }).returning();

        logger.info('Business created', { businessId: business.id });

        // Create sample products
        const sampleProducts = [
            {
                name: 'Blue Denim Jacket',
                description: 'Classic blue denim jacket, perfect for casual wear',
                category: 'Jackets',
                basePrice: '2500',
                minimumPrice: '2000',
                stockQuantity: 15,
                images: ['https://example.com/jacket1.jpg'],
            },
            {
                name: 'Red Floral Dress',
                description: 'Beautiful red floral summer dress',
                category: 'Dresses',
                basePrice: '1800',
                minimumPrice: '1500',
                stockQuantity: 8,
                images: ['https://example.com/dress1.jpg'],
            },
            {
                name: 'Black Skinny Jeans',
                description: 'Comfortable black skinny jeans',
                category: 'Jeans',
                basePrice: '1500',
                minimumPrice: '1200',
                stockQuantity: 20,
                images: ['https://example.com/jeans1.jpg'],
            },
            {
                name: 'White Cotton T-Shirt',
                description: 'Plain white cotton t-shirt, premium quality',
                category: 'T-Shirts',
                basePrice: '800',
                minimumPrice: '600',
                stockQuantity: 30,
                images: ['https://example.com/tshirt1.jpg'],
            },
            {
                name: 'Black Leather Shoes',
                description: 'Elegant black leather formal shoes',
                category: 'Shoes',
                basePrice: '3500',
                minimumPrice: '3000',
                stockQuantity: 10,
                images: ['https://example.com/shoes1.jpg'],
            },
            {
                name: 'Striped Summer Blouse',
                description: 'Light striped blouse for summer',
                category: 'Tops',
                basePrice: '1200',
                minimumPrice: '1000',
                stockQuantity: 12,
                images: ['https://example.com/blouse1.jpg'],
            },
            {
                name: 'Khaki Cargo Pants',
                description: 'Utility cargo pants with multiple pockets',
                category: 'Pants',
                basePrice: '1600',
                minimumPrice: '1300',
                stockQuantity: 15,
                images: ['https://example.com/pants1.jpg'],
            },
            {
                name: 'Floral Print Skirt',
                description: 'Elegant floral print midi skirt',
                category: 'Skirts',
                basePrice: '1400',
                minimumPrice: '1100',
                stockQuantity: 9,
                images: ['https://example.com/skirt1.jpg'],
            },
            {
                name: 'Grey Hoodie',
                description: 'Comfortable grey pullover hoodie',
                category: 'Hoodies',
                basePrice: '1800',
                minimumPrice: '1500',
                stockQuantity: 18,
                images: ['https://example.com/hoodie1.jpg'],
            },
            {
                name: 'Blue Sneakers',
                description: 'Casual blue canvas sneakers',
                category: 'Shoes',
                basePrice: '2200',
                minimumPrice: '1800',
                stockQuantity: 14,
                images: ['https://example.com/sneakers1.jpg'],
            },
        ];

        for (const product of sampleProducts) {
            await db.insert(products).values({
                businessId: business.id,
                ...product,
            });
        }

        logger.info(`Created ${sampleProducts.length} products`);

        // Create sample customers
        const sampleCustomers = [
            {
                phoneNumber: '+254722111222',
                name: 'John Doe',
                totalOrders: 3,
                totalSpent: '8500',
                optedInAt: new Date(),
            },
            {
                phoneNumber: '+254733222333',
                name: 'Mary Smith',
                totalOrders: 1,
                totalSpent: '2500',
                optedInAt: new Date(),
            },
            {
                phoneNumber: '+254744333444',
                name: 'Peter Kamau',
                totalOrders: 5,
                totalSpent: '15200',
                optedInAt: new Date(),
            },
        ];

        for (const customer of sampleCustomers) {
            await db.insert(customers).values({
                businessId: business.id,
                ...customer,
            });
        }

        logger.info(`Created ${sampleCustomers.length} customers`);

        logger.info('✅ Database seeded successfully!');
        logger.info(`Business ID: ${business.id}`);
        logger.info(`Business Name: ${business.name}`);

        process.exit(0);

    } catch (error) {
        logger.error('Seed failed', { error });
        process.exit(1);
    }
}

seed();
