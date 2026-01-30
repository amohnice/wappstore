import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';

/**
 * Initialize Genkit with Google AI plugin
 */
export const ai = genkit({
    plugins: [
        googleAI({
            apiKey: process.env.GOOGLE_GENAI_API_KEY || process.env.GOOGLE_API_KEY,
        }),
    ],
});
