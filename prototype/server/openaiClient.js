function normalizeToolName(toolName = "") {
  return String(toolName).replace(/^functions\./, "");
}

function extractOutputText(raw) {
  if (raw.output_text) return raw.output_text;

  return (raw.output || [])
    .flatMap((item) => item.content || [])
    .filter((content) => content.type === "output_text" && content.text)
    .map((content) => content.text)
    .join("\n")
    .trim();
}

async function callOpenAIForToolSelection({ env, request }) {
  const model = env.OPENAI_MODEL || "gpt-4.1-mini";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: request.system },
        {
          role: "user",
          content: [
            "Return only JSON with shape:",
            '{"intent":"...","tool":"...","arguments":{...},"assistantMessage":"...","cards":[]}',
            JSON.stringify(request.user)
          ].join("\n")
        }
      ],
      tools: request.tools,
      tool_choice: "auto"
    })
  });

  const raw = await response.json();
  if (!response.ok) {
    return {
      intent: "openai_error",
      assistantMessage: "Mình chưa gọi được OpenAI API. Server sẽ dùng mock routing.",
      raw
    };
  }

  const functionCall = (raw.output || []).find((item) => item.type === "function_call");
  if (functionCall) {
    return {
      intent: normalizeToolName(functionCall.name),
      tool: normalizeToolName(functionCall.name),
      arguments: JSON.parse(functionCall.arguments || "{}"),
      raw
    };
  }

  const text = extractOutputText(raw);
  try {
    const parsed = JSON.parse(text);
    return { ...parsed, tool: normalizeToolName(parsed.tool), raw };
  } catch {
    return {
      intent: "small_talk_or_help",
      assistantMessage: text || "Mình chưa hiểu rõ yêu cầu.",
      raw
    };
  }
}

async function callOpenAIFinalResponse({ env, request }) {
  const model = env.OPENAI_MODEL || "gpt-4.1-mini";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: request.system },
        {
          role: "user",
          content: [
            "Return only JSON with shape:",
            '{"assistantMessage":"...","cards":[]}',
            JSON.stringify(request.user)
          ].join("\n")
        }
      ]
    })
  });

  const raw = await response.json();
  if (!response.ok) {
    return {
      assistantMessage: "",
      cards: [],
      error: { code: "openai_final_failed", raw }
    };
  }

  const text = extractOutputText(raw);
  try {
    return { ...JSON.parse(text), raw };
  } catch {
    return {
      assistantMessage: text,
      cards: [],
      raw
    };
  }
}

module.exports = {
  callOpenAIForToolSelection,
  callOpenAIFinalResponse,
  normalizeToolName
};
