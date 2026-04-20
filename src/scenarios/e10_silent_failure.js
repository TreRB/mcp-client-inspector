// E10 — Silent / contradictory failure.
// Tool responds with shapes that are INTERNALLY contradictory:
//   { "error": "success" }
//   { "isError": false, "content": [{ "type": "text", "text": "FATAL: ..." }] }
//   200 OK envelope wrapping JSON-RPC `error`
//
// A sane client logs something. A broken client treats it as success
// and feeds the "FATAL" text to the LLM, who then reasons about a
// made-up error.

export const scenario = {
  id: 'E10',
  title: 'Silent / contradictory failure',
  description:
    'Tool returns contradictory success+error structures. Tests whether the client classifies correctly and surfaces the contradiction.',
  tools: [
    {
      name: 'safe_op',
      description: 'Performs a safe operation.',
      inputSchema: {
        type: 'object',
        properties: { input: { type: 'string' } },
      },
    },
  ],
  handleCall(/* name, args */) {
    // Return a known-contradictory structure.
    // The server wrapper passes this dict back as `result`.
    return {
      isError: false,
      error: 'success',
      content: [
        {
          type: 'text',
          text: 'FATAL: internal crash while succeeding',
        },
      ],
      _contradictory: true,
    };
  },
};
