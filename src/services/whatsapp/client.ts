import axios from 'axios';
import { createLogger } from '@/utils/logger';

const logger = createLogger('WhatsApp');

export class WhatsAppService {
    private baseUrl: string;
    private accessToken: string;
    private phoneNumberId: string;

    constructor() {
        this.baseUrl = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v18.0';
        this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
        this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
    }

    // =============================================
    // SEND TEXT MESSAGE
    // =============================================

    async sendMessage(to: string, text: string): Promise<{ messageId: string }> {
        try {
            const response = await axios.post(
                `${this.baseUrl}/${this.phoneNumberId}/messages`,
                {
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to,
                    type: 'text',
                    text: {
                        preview_url: false,
                        body: text,
                    },
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            logger.info('Message sent', {
                to,
                messageId: response.data.messages[0].id,
            });

            return { messageId: response.data.messages[0].id };

        } catch (error) {
            logger.error('Failed to send message', { error, to });
            throw error;
        }
    }

    // =============================================
    // SEND TEMPLATE MESSAGE
    // =============================================

    async sendTemplate(
        to: string,
        templateName: string,
        languageCode: string = 'en',
        parameters?: string[]
    ): Promise<{ messageId: string }> {
        try {
            const components = parameters ? [{
                type: 'body',
                parameters: parameters.map(param => ({
                    type: 'text',
                    text: param,
                })),
            }] : [];

            const response = await axios.post(
                `${this.baseUrl}/${this.phoneNumberId}/messages`,
                {
                    messaging_product: 'whatsapp',
                    to,
                    type: 'template',
                    template: {
                        name: templateName,
                        language: {
                            code: languageCode,
                        },
                        components,
                    },
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            logger.info('Template sent', {
                to,
                template: templateName,
                messageId: response.data.messages[0].id,
            });

            return { messageId: response.data.messages[0].id };

        } catch (error) {
            logger.error('Failed to send template', { error, to, templateName });
            throw error;
        }
    }

    // =============================================
    // SEND IMAGE
    // =============================================

    async sendImage(
        to: string,
        imageUrl: string,
        caption?: string
    ): Promise<{ messageId: string }> {
        try {
            const response = await axios.post(
                `${this.baseUrl}/${this.phoneNumberId}/messages`,
                {
                    messaging_product: 'whatsapp',
                    to,
                    type: 'image',
                    image: {
                        link: imageUrl,
                        caption,
                    },
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            logger.info('Image sent', {
                to,
                messageId: response.data.messages[0].id,
            });

            return { messageId: response.data.messages[0].id };

        } catch (error) {
            logger.error('Failed to send image', { error, to });
            throw error;
        }
    }

    // =============================================
    // SEND INTERACTIVE BUTTON MESSAGE
    // =============================================

    async sendButtons(
        to: string,
        bodyText: string,
        buttons: Array<{ id: string; title: string }>
    ): Promise<{ messageId: string }> {
        try {
            const response = await axios.post(
                `${this.baseUrl}/${this.phoneNumberId}/messages`,
                {
                    messaging_product: 'whatsapp',
                    to,
                    type: 'interactive',
                    interactive: {
                        type: 'button',
                        body: {
                            text: bodyText,
                        },
                        action: {
                            buttons: buttons.map(btn => ({
                                type: 'reply',
                                reply: {
                                    id: btn.id,
                                    title: btn.title.substring(0, 20), // Max 20 chars
                                },
                            })),
                        },
                    },
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            logger.info('Button message sent', {
                to,
                buttonCount: buttons.length,
                messageId: response.data.messages[0].id,
            });

            return { messageId: response.data.messages[0].id };

        } catch (error) {
            logger.error('Failed to send buttons', { error, to });
            throw error;
        }
    }

    // =============================================
    // SEND LIST MESSAGE
    // =============================================

    async sendList(
        to: string,
        bodyText: string,
        buttonText: string,
        sections: Array<{
            title: string;
            rows: Array<{ id: string; title: string; description?: string }>;
        }>
    ): Promise<{ messageId: string }> {
        try {
            const response = await axios.post(
                `${this.baseUrl}/${this.phoneNumberId}/messages`,
                {
                    messaging_product: 'whatsapp',
                    to,
                    type: 'interactive',
                    interactive: {
                        type: 'list',
                        body: {
                            text: bodyText,
                        },
                        action: {
                            button: buttonText,
                            sections,
                        },
                    },
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            logger.info('List message sent', {
                to,
                messageId: response.data.messages[0].id,
            });

            return { messageId: response.data.messages[0].id };

        } catch (error) {
            logger.error('Failed to send list', { error, to });
            throw error;
        }
    }

    // =============================================
    // MARK MESSAGE AS READ
    // =============================================

    async markAsRead(messageId: string): Promise<void> {
        try {
            await axios.post(
                `${this.baseUrl}/${this.phoneNumberId}/messages`,
                {
                    messaging_product: 'whatsapp',
                    status: 'read',
                    message_id: messageId,
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            logger.info('Message marked as read', { messageId });

        } catch (error) {
            logger.error('Failed to mark as read', { error, messageId });
        }
    }

    // =============================================
    // DOWNLOAD MEDIA
    // =============================================

    async downloadMedia(mediaId: string): Promise<Buffer> {
        try {
            // First, get media URL
            const mediaResponse = await axios.get(
                `${this.baseUrl}/${mediaId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                    },
                }
            );

            const mediaUrl = mediaResponse.data.url;

            // Download media
            const downloadResponse = await axios.get(mediaUrl, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                },
                responseType: 'arraybuffer',
            });

            logger.info('Media downloaded', { mediaId });

            return Buffer.from(downloadResponse.data);

        } catch (error) {
            logger.error('Failed to download media', { error, mediaId });
            throw error;
        }
    }
}
