import Anthropic from '@anthropic-ai/sdk';
import type { ExtractionProvider, ExtractionRequest } from '../provider.ts';

const TOOL_NAME = 'record_extraction';

export class AnthropicProvider implements ExtractionProvider {
  readonly name = 'anthropic';
  readonly model: string;
  private readonly client: Anthropic;

  // No parameter properties: the CLI runs under Node's strip-only TypeScript mode.
  constructor(apiKey: string, model: string) {
    this.model = model;
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
        output_config: { effort: 'high' },
        // The schema has ~50 nullable fields, above the structured-output limit for union
        // types, so it goes in as a non-strict tool schema; extract.ts validates the result.
        tools: [
          {
            name: TOOL_NAME,
            description: 'Record the data extracted from the SDS.',
            input_schema: responseSchema as { type: 'object' },
          },
        ],
        // Forcing a specific tool is not supported for this model; the prompt asks for it.
        tool_choice: { type: 'auto' },
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
              {
                type: 'text',
                text: `${instructions}\n\nReturn the result only by calling the ${TOOL_NAME} tool once.`,
              },
            ],
          },
        ],
      })
      .finalMessage();

    if (message.stop_reason === 'refusal') throw new Error('The model declined the request');
    if (message.stop_reason === 'max_tokens') throw new Error('Model output was cut off');
    const call = message.content.find((block) => block.type === 'tool_use');
    if (!call) throw new Error('The model did not return the extraction');
    return call.input;
  }
}
