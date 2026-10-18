import { GoogleGenAI } from '@google/genai';
import type { ExtractionProvider, ExtractionRequest } from '../provider.ts';

export class GeminiProvider implements ExtractionProvider {
  readonly name = 'gemini';
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async extract({ pdf, instructions, responseSchema }: ExtractionRequest): Promise<unknown> {
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'application/pdf', data: pdf.toString('base64') } },
            { text: instructions },
          ],
        },
      ],
      config: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseJsonSchema: responseSchema,
      },
    });
    const text = response.text;
    if (!text) throw new Error('Empty response from Gemini');
    return JSON.parse(text);
  }
}
