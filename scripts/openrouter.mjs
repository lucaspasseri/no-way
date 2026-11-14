// Node-only smoke test. Credentials are read at request time and never logged.
import { pathToFileURL } from 'node:url';
import { OpenRouter } from '@openrouter/sdk';

export const DEFAULT_MODEL = 'inclusionai/ling-3.2-flash:free';
const DEFAULT_PROMPT = 'Reply with exactly: OK';

export class OpenRouterRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OpenRouterRequestError';
  }
}

function requestError(error) {
  const messages = {
    400: 'OpenRouter rejected the request. Check the model slug and request parameters.',
    401: 'OpenRouter authentication failed. Check OPENROUTER_API_KEY at https://openrouter.ai/keys.',
    402: 'OpenRouter requires more credits. Check the account balance and key spending limit.',
    403: 'OpenRouter denied access. Check the key permissions and provider privacy settings.',
    404: 'The OpenRouter model or endpoint is unavailable. Choose a slug from https://openrouter.ai/models.',
    408: 'OpenRouter timed out. Please try again.',
    429: 'OpenRouter rate limit reached. Wait before retrying or choose another model.',
  };
  if (messages[error?.statusCode]) return new OpenRouterRequestError(messages[error.statusCode]);
  if (error?.statusCode >= 500) return new OpenRouterRequestError('OpenRouter or its provider is temporarily unavailable. Please try again.');
  if (['RequestTimeoutError', 'RequestAbortedError', 'TimeoutError', 'AbortError'].includes(error?.name)) {
    return new OpenRouterRequestError('OpenRouter timed out or the request was cancelled. Please try again.');
  }
  // SDK errors can include request/response details. Never forward or log them.
  return new OpenRouterRequestError('OpenRouter request failed. Check network connectivity and model availability.');
}

/** Make a single bounded request using the official SDK. No automatic retries.
 * @param {{ model?: string, prompt?: string }} options
 */
export async function requestOpenRouter({ model, prompt = DEFAULT_PROMPT } = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new OpenRouterRequestError('OPENROUTER_API_KEY is not set. Create a key at https://openrouter.ai/keys and add it to .env or your server environment.');
  }
  const selectedModel = model?.trim() || process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
  if (!selectedModel.includes('/') || /\s/.test(selectedModel)) {
    throw new OpenRouterRequestError('Use a model slug such as inclusionai/ling-3.2-flash:free from https://openrouter.ai/models.');
  }
  if (typeof prompt !== 'string' || !prompt.trim()) {
    throw new OpenRouterRequestError('Provide a nonempty text prompt.');
  }

  let response;
  try {
    const client = new OpenRouter({
      apiKey,
      serverURL: 'https://openrouter.ai/api/v1',
      timeoutMs: 30000,
      retryConfig: { strategy: 'none' },
    });
    response = await client.responses.send({
      responsesRequest: {
        model: selectedModel,
        input: prompt,
        maxOutputTokens: 128,
        reasoning: { effort: 'none' },
        stream: false,
        store: false,
      },
    });
  } catch (error) {
    throw requestError(error);
  }

  if (response.status !== 'completed' || !Array.isArray(response.output)) {
    throw new OpenRouterRequestError('OpenRouter did not complete the response. Try a different model or a shorter prompt.');
  }
  const text = response.output
    .filter(item => item.type === 'message')
    .flatMap(item => item.content)
    .filter(part => part.type === 'output_text')
    .map(part => part.text)
    .join('');
  if (!text.trim()) throw new OpenRouterRequestError('OpenRouter returned no text. Try a different model or prompt.');
  return { model: response.model || selectedModel, text };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [model, ...words] = process.argv.slice(2);
    const result = await requestOpenRouter({ model, ...(words.length && { prompt: words.join(' ') }) });
    console.log(`Model: ${result.model}\n${result.text}`);
  } catch (error) {
    console.error(error instanceof OpenRouterRequestError ? error.message : 'The OpenRouter test could not run. Check the SDK installation and server configuration.');
    process.exitCode = 1;
  }
}
