export function openrouterResponse(text, patch = {}) {
  return { id: 'resp_test_trace', object: 'response', model: 'particle-ai/particle-1:free', status: 'completed',
    created_at: 1700000000, completed_at: 1700000001, error: null, incomplete_details: null,
    frequency_penalty: null, presence_penalty: null, temperature: null, top_p: null,
    instructions: null, metadata: null, parallel_tool_calls: false, tool_choice: 'auto', tools: [],
    usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 }, cost: .0001 },
    output: [{ id: 'msg_test', type: 'message', role: 'assistant', status: 'completed',
      content: [{ type: 'output_text', text, annotations: [] }] }], ...patch };
}
export function dailyQuotaResponse(resetAt = '2026-11-16T00:00:00.000Z') {
  return { error: { code: 429, message: 'Daily free-model limit reached', metadata: {
    limit_source: 'openrouter_free_tier_daily', headers: { 'x-ratelimit-limit': '50', 'x-ratelimit-remaining': '0',
      'x-ratelimit-reset': String(Date.parse(resetAt)) },
  } }, openrouter_metadata: { attempt: 0, strategy: 'fallback', requested: 'particle-ai/particle-1:free',
    endpoints: { total: 2, available: [
      { model: 'particle-ai/particle-1:free', provider: 'Primary provider', selected: false },
      { model: 'nvidia/nemotron-3.5-super-vl:free', provider: 'Fallback provider', selected: false },
    ] } } };
}
