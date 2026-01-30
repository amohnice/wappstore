import axios from 'axios';
import { createLogger } from '@/utils/logger';

const logger = createLogger('M-Pesa');

export class MPesaService {
    private consumerKey: string;
    private consumerSecret: string;
    private passkey: string;
    private shortcode: string;
    private baseUrl: string;
    private callbackUrl: string;

    constructor() {
        this.consumerKey = process.env.MPESA_CONSUMER_KEY || '';
        this.consumerSecret = process.env.MPESA_CONSUMER_SECRET || '';
        this.passkey = process.env.MPESA_PASSKEY || '';
        this.shortcode = process.env.MPESA_SHORTCODE || '';
        this.baseUrl = process.env.NODE_ENV === 'production'
            ? 'https://api.safaricom.co.ke'
            : 'https://sandbox.safaricom.co.ke';
        this.callbackUrl = process.env.MPESA_CALLBACK_URL || '';
    }

    // =============================================
    // GET ACCESS TOKEN
    // =============================================

    private async getAccessToken(): Promise<string> {
        try {
            const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');

            const response = await axios.get(
                `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
                {
                    headers: {
                        'Authorization': `Basic ${auth}`,
                    },
                }
            );

            return response.data.access_token;

        } catch (error) {
            logger.error('Failed to get access token', { error });
            throw new Error('M-Pesa authentication failed');
        }
    }

    // =============================================
    // GENERATE PASSWORD
    // =============================================

    private generatePassword(timestamp: string): string {
        const data = `${this.shortcode}${this.passkey}${timestamp}`;
        return Buffer.from(data).toString('base64');
    }

    // =============================================
    // STK PUSH (Customer-Initiated Payment)
    // =============================================

    async initiateSTKPush(params: {
        phoneNumber: string;
        amount: number;
        accountReference: string;
        transactionDesc: string;
    }): Promise<{
        checkoutRequestId: string;
        merchantRequestId: string;
        responseCode: string;
        responseDescription: string;
    }> {
        try {
            const accessToken = await this.getAccessToken();
            const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
            const password = this.generatePassword(timestamp);

            // Format phone number (remove leading 0, add 254)
            let formattedPhone = params.phoneNumber.replace(/^0+/, '');
            if (!formattedPhone.startsWith('254')) {
                formattedPhone = `254${formattedPhone}`;
            }

            const requestBody = {
                BusinessShortCode: this.shortcode,
                Password: password,
                Timestamp: timestamp,
                TransactionType: 'CustomerPayBillOnline',
                Amount: Math.round(params.amount), // Must be integer
                PartyA: formattedPhone,
                PartyB: this.shortcode,
                PhoneNumber: formattedPhone,
                CallBackURL: this.callbackUrl,
                AccountReference: params.accountReference.substring(0, 12), // Max 12 chars
                TransactionDesc: params.transactionDesc.substring(0, 13), // Max 13 chars
            };

            logger.info('Initiating STK Push', {
                phone: formattedPhone,
                amount: params.amount,
                reference: params.accountReference,
            });

            const response = await axios.post(
                `${this.baseUrl}/mpesa/stkpush/v1/processrequest`,
                requestBody,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            const data = response.data;

            if (data.ResponseCode === '0') {
                logger.info('STK Push initiated successfully', {
                    checkoutRequestId: data.CheckoutRequestID,
                });

                return {
                    checkoutRequestId: data.CheckoutRequestID,
                    merchantRequestId: data.MerchantRequestID,
                    responseCode: data.ResponseCode,
                    responseDescription: data.ResponseDescription,
                };
            } else {
                throw new Error(data.ResponseDescription || 'STK Push failed');
            }

        } catch (error: any) {
            logger.error('STK Push failed', {
                error: error.response?.data || error.message,
            });
            throw error;
        }
    }

    // =============================================
    // QUERY STK PUSH STATUS
    // =============================================

    async querySTKPushStatus(checkoutRequestId: string): Promise<any> {
        try {
            const accessToken = await this.getAccessToken();
            const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
            const password = this.generatePassword(timestamp);

            const response = await axios.post(
                `${this.baseUrl}/mpesa/stkpushquery/v1/query`,
                {
                    BusinessShortCode: this.shortcode,
                    Password: password,
                    Timestamp: timestamp,
                    CheckoutRequestID: checkoutRequestId,
                },
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            return response.data;

        } catch (error) {
            logger.error('Failed to query STK status', { error, checkoutRequestId });
            throw error;
        }
    }

    // =============================================
    // B2C (Business to Customer) - Refunds/Payouts
    // =============================================

    async initiateB2C(params: {
        phoneNumber: string;
        amount: number;
        remarks: string;
        occasion?: string;
    }): Promise<{
        conversationId: string;
        originatorConversationId: string;
        responseCode: string;
    }> {
        try {
            const accessToken = await this.getAccessToken();

            // Format phone number
            let formattedPhone = params.phoneNumber.replace(/^0+/, '');
            if (!formattedPhone.startsWith('254')) {
                formattedPhone = `254${formattedPhone}`;
            }

            const response = await axios.post(
                `${this.baseUrl}/mpesa/b2c/v1/paymentrequest`,
                {
                    InitiatorName: 'apiop', // Set during onboarding
                    SecurityCredential: process.env.MPESA_SECURITY_CREDENTIAL,
                    CommandID: 'BusinessPayment',
                    Amount: Math.round(params.amount),
                    PartyA: this.shortcode,
                    PartyB: formattedPhone,
                    Remarks: params.remarks.substring(0, 100),
                    QueueTimeOutURL: `${this.callbackUrl}/b2c/timeout`,
                    ResultURL: `${this.callbackUrl}/b2c/result`,
                    Occasion: params.occasion?.substring(0, 100) || '',
                },
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            logger.info('B2C initiated', {
                phone: formattedPhone,
                amount: params.amount,
            });

            return {
                conversationId: response.data.ConversationID,
                originatorConversationId: response.data.OriginatorConversationID,
                responseCode: response.data.ResponseCode,
            };

        } catch (error: any) {
            logger.error('B2C failed', {
                error: error.response?.data || error.message,
            });
            throw error;
        }
    }

    // =============================================
    // VALIDATE CALLBACK
    // =============================================

    validateCallback(callbackData: any): {
        isValid: boolean;
        resultCode: number;
        resultDesc: string;
        mpesaReceiptNumber?: string;
        transactionDate?: string;
        phoneNumber?: string;
        amount?: number;
    } {
        try {
            const body = callbackData.Body?.stkCallback || callbackData;

            const resultCode = body.ResultCode;
            const resultDesc = body.ResultDesc;

            if (resultCode !== 0) {
                return {
                    isValid: false,
                    resultCode,
                    resultDesc,
                };
            }

            // Extract callback metadata
            const metadata = body.CallbackMetadata?.Item || [];
            const getValue = (name: string) => {
                const item = metadata.find((i: any) => i.Name === name);
                return item?.Value;
            };

            return {
                isValid: true,
                resultCode,
                resultDesc,
                mpesaReceiptNumber: getValue('MpesaReceiptNumber'),
                transactionDate: getValue('TransactionDate'),
                phoneNumber: getValue('PhoneNumber'),
                amount: getValue('Amount'),
            };

        } catch (error) {
            logger.error('Failed to validate callback', { error });
            return {
                isValid: false,
                resultCode: -1,
                resultDesc: 'Invalid callback data',
            };
        }
    }
}
