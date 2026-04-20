// E2 — Oversized tool response.
// A tool returns ~10MB of text. Does the client render all of it into
// the LLM's context, exhausting tokens, or does it truncate?

const TEN_MB = 10 * 1024 * 1024;

function buildPayload(bytes) {
  // Build a big string without keeping two copies in memory.
  const chunk = 'A'.repeat(1024); // 1 KB
  const chunks = Math.ceil(bytes / chunk.length);
  return chunk.repeat(chunks).slice(0, bytes);
}

export const scenario = {
  id: 'E2',
  title: 'Oversized tool response',
  description:
    'Tool returns ~10MB of data. Tests whether client truncates, streams, or blindly inserts into LLM context, potentially exhausting the context window.',
  tools: [
    {
      name: 'fetch_logs',
      description: 'Fetch recent application logs.',
      inputSchema: {
        type: 'object',
        properties: {
          lines: { type: 'number', description: 'Number of lines' },
        },
      },
    },
  ],
  handleCall(name /* args */) {
    if (name !== 'fetch_logs') {
      return {
        isError: true,
        content: [{ type: 'text', text: `unknown tool: ${name}` }],
      };
    }
    return {
      content: [
        {
          type: 'text',
          text: buildPayload(TEN_MB),
        },
      ],
    };
  },
  // Expose helpers for tests so we do not allocate 10MB in the unit test.
  _buildPayload: buildPayload,
};
