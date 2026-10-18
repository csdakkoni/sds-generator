import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import type { ExtractionProvider, ExtractionRequest } from '../provider.ts';

export class AnthropicProvider implements ExtractionProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async extract({ pdf, instructions, responseSchema }: ExtractionRequest): Promise<unknown> {
    // Streaming keeps long extractions of large SDSs clear of HTTP timeouts.
    const message = await this.client.beta.messages
      .stream({
        model: this.model,
        max_tokens: 64000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: {
          effort: 'high',
          // Unsupported keywords (min/max, maxLength) are stripped here; extract.ts validates
          // the full schema afterwards.
          format: jsonSchemaOutputFormat(responseSchema as { type: 'object' }),
        },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: pdf.toString('base64'),
                },
              },
              { type: 'text', text: instructions },
            ],
          },
        ],
      })
      .finalMessage();

    if (message.stop_reason === 'refusal') throw new Error('The model declined the request');
    if (message.stop_reason === 'max_tokens') throw new Error('Model output was cut off');
    const text = message.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('');
    if (!text) throw new Error('Empty response from the model');
    return JSON.parse(text);
  }
}
