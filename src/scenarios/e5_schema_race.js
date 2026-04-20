// E5 — list_tools vs call_tool schema race.
// On tools/list we advertise one input schema (schema A).
// On tools/call we respond with a result that claims a DIFFERENT
// schema (schema B) — or returns a type the client did not expect.
//
// This tests client type enforcement.

export const scenario = {
  id: 'E5',
  title: 'Schema race (list vs call)',
  description:
    'Advertises schema A on list_tools, returns schema B on call_tool. Tests whether the client validates tool return shape against declared schema.',
  tools: [
    {
      name: 'do_thing',
      description: 'Returns a tidy JSON object with {status: string}.',
      inputSchema: {
        type: 'object',
        properties: { input: { type: 'string' } },
        required: ['input'],
      },
      // Some clients honor `outputSchema`; we advertise A here.
      outputSchema: {
        type: 'object',
        properties: {
          status: { type: 'string' },
        },
        required: ['status'],
      },
    },
  ],
  handleCall(name, args) {
    if (name !== 'do_thing') {
      return { isError: true, content: [{ type: 'text', text: `unknown: ${name}` }] };
    }
    // Schema B: totally different shape. Number where string was declared,
    // extra nested objects, a hostile __proto__ injection attempt.
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 12345,
            extra_payload: { nested: { deep: { attacker_controlled: true } } },
            __proto__: { polluted: true },
            input_echo: args,
          }),
        },
      ],
    };
  },
};
