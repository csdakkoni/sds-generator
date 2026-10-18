/**
 * Model providers behind one interface, so the provider can be swapped without touching
 * the CLI. API keys come from environment variables only.
 */
export interface ExtractionRequest {
  pdf: Buffer;
  fileName: string;
  instructions: string;
  /** JSON Schema the model output must follow. */
  responseSchema: Record<string, unknown>;
}

export interface ExtractionProvider {
  readonly name: string;
  readonly model: string;
  /** Returns the parsed JSON produced by the model; validation happens in the caller. */
  extract(request: ExtractionRequest): Promise<unknown>;
}

export type ProviderName = 'anthropic';

export async function createProvider(
  name: ProviderName,
  model: string | undefined,
): Promise<ExtractionProvider> {
  switch (name) {
    case 'anthropic': {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
      const { AnthropicProvider } = await import('./providers/anthropic.ts');
      return new AnthropicProvider(
        apiKey,
        model ?? process.env.ANTHROPIC_MODEL ?? 'claude-opus-5-5',
      );
    }
  }
}
