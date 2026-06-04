import OpenAI from "openai";
import "dotenv/config";

const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

function assertOpenAIConfig() {
  if (!process.env.OPENAI_API_KEY) {
    return {
      ok: false,
      error: {
        code: "missing_openai_api_key",
        message: "Thiếu OPENAI_API_KEY trong file .env"
      }
    };
  }
  return { ok: true };
}

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export async function postMoniChat(req, res) {
  const config = assertOpenAIConfig();
  if (!config.ok) {
    res.status(500).json({ error: config.error });
    return;
  }

  const { message, userId = "demo_user", month = "2026-06" } = req.body || {};
  if (!message) {
    res.status(400).json({
      error: {
        code: "missing_message",
        message: "Thiếu message trong request"
      }
    });
    return;
  }

  const context = await loadBudgetContext({ userId, month });

  const selectionResponse = await client.responses.create({
    model,
    input: [
      {
        role: "system",
        content: [
          "Bạn là Moni Budget Copilot.",
          "Bước này chỉ chọn tool và trích xuất arguments.",
          "Không tự ghi dữ liệu tài chính.",
          "Không tự tính ngân sách bằng lời.",
          "Mọi thay đổi dữ liệu phải thông qua tool.",
          "Khi user hỏi có nên mua/đăng ký/nâng cấp/đi du lịch/chi/trả tiền, bắt buộc gọi advisePurchaseDecision.",
          "Trả về function_call nếu cần dữ liệu hoặc cần ghi dữ liệu."
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify({
          message,
          context
        })
      }
    ],
    tools: moniToolSchemas()
  });

  const toolCalls = extractToolCalls(selectionResponse);
  const toolResults = [];

  for (const call of toolCalls) {
    const result = await executeMoniTool({
      userId,
      month,
      name: call.name,
      arguments: call.arguments
    });
    toolResults.push({ call, result });
  }

  const finalResponse = await client.responses.create({
    model,
    input: [
      {
        role: "system",
        content: [
          "Bạn là Moni Budget Copilot.",
          "Bước này tạo câu trả lời cuối cùng bằng tiếng Việt.",
          "Chỉ dùng số liệu từ context hoặc toolResults.",
          "Không tự bịa số liệu tài chính.",
          "Với purchase advice, phải nêu quyết định, safeToSpendScore và lý do dựa trên ngân sách/forecast.",
          "assistantMessage phải dùng Markdown thân thiện: đoạn ngắn, bullet points cho số liệu, **bold** cho số tiền/điểm quan trọng.",
          "Không viết một đoạn văn dài.",
          "Không expose tên biến nội bộ hoặc implementation details.",
          "Không output JSON bên trong assistantMessage.",
          "Giải thích ngắn gọn, dễ hiểu."
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify({
          message,
          context,
          toolResults
        })
      }
    ]
  });

  res.json({
    assistantMessage: buildAssistantMessage(finalResponse, toolResults),
    toolCalls,
    cards: toolResults.flatMap((item) => item.result.cards || []),
    trace: {
      selectionResponse,
      toolResults,
      finalResponse
    }
  });
}

function moniToolSchemas() {
  return [
    {
      type: "function",
      name: "addExpense",
      description: "Thêm khoản chi mới.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["label", "amount", "category"],
        properties: {
          label: { type: "string" },
          amount: { type: "number" },
          category: { type: "string" },
          date: { type: "string" },
          note: { type: "string" }
        }
      }
    },
    {
      type: "function",
      name: "updateCategoryBudget",
      description: "Cập nhật ngân sách theo danh mục.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["category", "amount", "month"],
        properties: {
          category: { type: "string" },
          amount: { type: "number" },
          month: { type: "string" }
        }
      }
    },
    {
      type: "function",
      name: "simulateExpense",
      description: "Mô phỏng khoản chi tương lai, không ghi dữ liệu thật.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["label", "amount", "category", "month"],
        properties: {
          label: { type: "string" },
          amount: { type: "number" },
          category: { type: "string" },
          month: { type: "string" },
          date: { type: "string" }
        }
      }
    },
    {
      type: "function",
      name: "advisePurchaseDecision",
      description: "Đánh giá một khoản mua/đăng ký/nâng cấp/du lịch có an toàn về tài chính không.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["item", "amount", "category", "month"],
        properties: {
          item: { type: "string" },
          amount: { type: "number" },
          category: { type: "string" },
          month: { type: "string" }
        }
      }
    },
    {
      type: "function",
      name: "getSpendingBreakdown",
      description: "Lấy phân bổ chi tiêu theo danh mục.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["month"],
        properties: {
          month: { type: "string" }
        }
      }
    },
    {
      type: "function",
      name: "getForecastAnalysis",
      description: "Giải thích lý do cảnh báo/nguy cơ vượt ngân sách.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["month"],
        properties: {
          month: { type: "string" }
        }
      }
    },
    {
      type: "function",
      name: "getBudgetSnapshot",
      description: "Lấy tình trạng ngân sách.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["month"],
        properties: {
          month: { type: "string" },
          category: { type: "string" }
        }
      }
    }
  ];
}

async function loadBudgetContext({ userId, month }) {
  return {
    userId,
    currentMonth: month,
    monthlyBudget: 10000000,
    totalSpent: 7200000,
    remaining: 2800000,
    forecastEndOfMonth: 14400000,
    riskLevel: "warning",
    categories: [],
    recentTransactions: []
  };
}

async function executeMoniTool({ name, arguments: args }) {
  throw new Error(`Chưa nối tool backend thật: ${name} ${JSON.stringify(args)}`);
}

function extractToolCalls(response) {
  return (response.output || [])
    .filter((item) => item.type === "function_call")
    .map((item) => ({
      id: item.call_id,
      name: item.name,
      arguments: JSON.parse(item.arguments || "{}")
    }));
}

function buildAssistantMessage(response, toolResults) {
  return response.output_text || "Mình chưa xử lý được yêu cầu này.";
}
