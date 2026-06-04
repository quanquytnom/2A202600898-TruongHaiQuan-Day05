const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = __dirname;
const port = Number(process.env.PORT || 5173);
const env = loadEnv(path.join(rootDir, "..", ".env"));

const CURRENT_MONTH = "2026-06";
const USER_ID = "demo_user";

const categories = {
  Food: { label: "Ăn uống", limit: 2000000 },
  Bills: { label: "Hóa đơn", limit: 600000 },
  Transport: { label: "Di chuyển", limit: 1200000 },
  Shopping: { label: "Mua sắm", limit: 2000000 },
  Education: { label: "Học tập", limit: 1500000 },
  Entertainment: { label: "Giải trí", limit: 1200000 },
  Family: { label: "Gia đình", limit: 1800000 },
  Debt: { label: "Trả nợ", limit: 1500000 },
  Other: { label: "Khác", limit: 1000000 }
};

const state = {
  userId: USER_ID,
  month: CURRENT_MONTH,
  today: new Date(2026, 5, 4, 9, 32),
  monthlyBudget: 10000000,
  categoryBudgets: Object.fromEntries(Object.entries(categories).map(([key, value]) => [key, value.limit])),
  transactions: [
    tx("Cà phê sáng", 90000, "Food", "2026-06-01"),
    tx("Siêu thị", 420000, "Shopping", "2026-06-01"),
    tx("Ăn trưa", 160000, "Food", "2026-06-02"),
    tx("Taxi", 220000, "Transport", "2026-06-02"),
    tx("Ăn tối", 240000, "Food", "2026-06-03"),
    tx("Hóa đơn điện", 600000, "Bills", "2026-06-03"),
    tx("Mua đồ dùng", 470000, "Shopping", "2026-06-04"),
    tx("Ăn uống cuối tuần", 980000, "Food", "2026-06-04"),
    tx("Sách và học tập", 480000, "Education", "2026-06-04"),
    tx("Vé xem phim", 350000, "Entertainment", "2026-06-04"),
    tx("Chuyển khoản gia đình", 1190000, "Family", "2026-06-04")
  ]
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/moni/chat") {
      const body = await readJson(req);
      const payload = await handleMoniChat(body);
      sendJson(res, 200, payload);
      return;
    }

    if (req.method === "GET" && req.url === "/api/moni/config") {
      sendJson(res, 200, {
        hasOpenAIKey: Boolean(env.OPENAI_API_KEY),
        model: env.OPENAI_MODEL || "gpt-4.1-mini",
        mode: env.OPENAI_API_KEY ? "openai" : "mock"
      });
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    console.error("[Moni server error]", error);
    sendJson(res, 500, {
      error: {
        code: error.code || "server_error",
        message: error.message || "Server error"
      }
    });
  }
});

server.listen(port, () => {
  console.log(`Moni prototype server: http://localhost:${port}`);
  console.log(`LLM mode: ${env.OPENAI_API_KEY ? "OpenAI" : "mock fallback"}`);
  if (!env.OPENAI_API_KEY) {
    console.log("OPENAI_API_KEY is missing, so /api/moni/chat will use mock LLM routing.");
  }
});

async function handleMoniChat({ message, userId = USER_ID, month = CURRENT_MONTH }) {
  if (!message) {
    return {
      assistantMessage: "Bạn nhập tin nhắn trước nhé.",
      toolCalls: [],
      cards: [],
      error: { code: "missing_message" }
    };
  }

  const context = buildLLMContext(month);
  const selectionRequest = {
    system: [
      "Bạn là Moni Budget Copilot.",
      "Nhiệm vụ bước 1: xác định intent/entity và chọn tool phù hợp.",
      "Không tự ghi dữ liệu tài chính.",
      "Không tự tính toán ngân sách bằng lời.",
      "Mọi con số tài chính phải đến từ context hoặc tool result.",
      "Nếu thiếu dữ liệu để write an toàn, trả needsConfirmation.",
      "Khi user hỏi có nên mua, có nên đăng ký, có nên nâng cấp, có nên đi du lịch, có nên chi hoặc có nên trả tiền, BẮT BUỘC gọi advisePurchaseDecision.",
      "Không trả lời tư vấn mua sắm trực tiếp bằng kiến thức chung.",
      "Trả JSON ngắn gọn, không markdown."
    ].join("\n"),
    user: { message, userId, month, context },
    tools: toolSchemas()
  };

  const selectionResponse = env.OPENAI_API_KEY
    ? await callOpenAIForToolSelection(selectionRequest)
    : mockLLMRoute(message);

  console.log("\n[Moni LLM request]");
  console.log(JSON.stringify(selectionRequest, null, 2));
  console.log("[Moni LLM response]");
  console.log(JSON.stringify(selectionResponse, null, 2));

  if (!selectionResponse.tool) {
    return {
      assistantMessage: selectionResponse.assistantMessage || "Mình có thể thêm khoản chi, cập nhật ngân sách hoặc rà soát giao dịch.",
      toolCalls: [],
      cards: selectionResponse.cards || [],
      intent: selectionResponse.intent,
      llmTrace: {
        mode: env.OPENAI_API_KEY ? "openai" : "server_mock",
        request: { selection: selectionRequest },
        response: { selection: selectionResponse }
      }
    };
  }

  const toolName = normalizeToolName(selectionResponse.tool);
  const preparedArguments = prepareToolArguments({
    toolName,
    args: selectionResponse.arguments || {},
    message,
    month
  });
  const toolCall = {
    name: toolName,
    arguments: { ...preparedArguments, userId, month: preparedArguments.month || month }
  };
  const toolResult = executeTool(toolName, preparedArguments);

  if (toolResult.needsConfirmation) {
    return {
      ...toolResult,
      toolCalls: [toolCall],
      intent: selectionResponse.intent,
      llmTrace: {
        mode: env.OPENAI_API_KEY ? "openai" : "server_mock",
        request: { selection: selectionRequest },
        response: { selection: selectionResponse, toolResults: [{ call: toolCall, result: toolResult }] }
      }
    };
  }

  const finalRequest = buildFinalReasoningRequest({
    message,
    userId,
    month,
    context,
    toolResults: [{ call: toolCall, result: toolResult }]
  });
  const finalResponse = env.OPENAI_API_KEY
    ? await callOpenAIFinalResponse(finalRequest)
    : mockFinalResponse({ toolName, toolResult });
  const fallbackCards = cardsForTool(toolName, toolResult);
  const finalCards = Array.isArray(finalResponse.cards) && finalResponse.cards.length
    ? finalResponse.cards
    : fallbackCards;

  return {
    assistantMessage: finalResponse.assistantMessage || assistantMessageForTool(toolName, toolResult),
    toolCalls: [toolCall],
    cards: finalCards,
    toolResult,
    intent: selectionResponse.intent,
    llmTrace: {
      mode: env.OPENAI_API_KEY ? "openai" : "server_mock",
      request: {
        selection: selectionRequest,
        final: finalRequest
      },
      response: {
        selection: selectionResponse,
        toolResults: [{ call: toolCall, result: toolResult }],
        final: finalResponse
      }
    },
    serverState: {
      monthlyBudget: state.monthlyBudget,
      categoryBudgets: state.categoryBudgets,
      transactions: state.transactions
    }
  };
}

function buildFinalReasoningRequest({ message, userId, month, context, toolResults }) {
  return {
    system: [
      "Bạn là Moni Budget Copilot.",
      "Nhiệm vụ bước 2: dùng tool result để trả lời user bằng tiếng Việt.",
      "Không tự bịa số liệu. Chỉ dùng số trong toolResults hoặc context.",
      "Với purchase advice, phải nêu quyết định, safeToSpendScore và lý do dựa trên ngân sách/forecast.",
      "assistantMessage phải là Markdown thân thiện: dùng đoạn ngắn, bullet points cho số liệu, **bold** cho số tiền/điểm quan trọng.",
      "Không viết một đoạn văn dài.",
      "Không expose tên biến nội bộ như safeToSpendThresholds.",
      "Không nhắc implementation details.",
      "Không output JSON bên trong assistantMessage.",
      "Nếu tool result thiếu dữ liệu, hỏi lại user.",
      "Trả JSON: {\"assistantMessage\":\"...\",\"cards\":[]}."
    ].join("\n"),
    user: {
      message,
      userId,
      month,
      context,
      toolResults
    }
  };
}

async function callOpenAIForToolSelection(llmRequest) {
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
        { role: "system", content: llmRequest.system },
        {
          role: "user",
          content: [
            "Return only JSON with shape:",
            '{"intent":"...","tool":"...","arguments":{...},"assistantMessage":"...","cards":[]}',
            JSON.stringify(llmRequest.user)
          ].join("\n")
        }
      ],
      tools: llmRequest.tools,
      tool_choice: "auto"
    })
  });

  const raw = await response.json();
  if (!response.ok) {
    return {
      intent: "openai_error",
      assistantMessage: "Mình chưa gọi được OpenAI API. Server sẽ dùng mock routing.",
      raw,
      fallback: mockLLMRoute(llmRequest.user.message)
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

async function callOpenAIFinalResponse(finalRequest) {
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
        { role: "system", content: finalRequest.system },
        {
          role: "user",
          content: [
            "Return only JSON with shape:",
            '{"assistantMessage":"...","cards":[]}',
            JSON.stringify(finalRequest.user)
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

function executeTool(toolName, args) {
  if (!tools[toolName]) {
    return {
      ok: false,
      error: {
        code: "unknown_tool",
        message: `Unknown tool: ${toolName}`,
        recoverable: true
      },
      cards: []
    };
  }
  try {
    const data = tools[toolName](args);
    return {
      ok: true,
      toolName,
      ...data
    };
  } catch (error) {
    return {
      ok: false,
      toolName,
      error: {
        code: error.message || "tool_execution_failed",
        message: error.message || "Tool execution failed",
        recoverable: true
      },
      cards: []
    };
  }
}

function prepareToolArguments({ toolName, args, message, month }) {
  if (toolName !== "advisePurchaseDecision") return args;
  const item = args.item || parsePurchaseItem(message);
  const category = args.category || parsePurchaseCategory(message);
  const amount = Number.isFinite(args.amount) && args.amount > 0
    ? args.amount
    : inferPurchaseAmount(message);
  return {
    ...args,
    item,
    amount,
    category,
    month: args.month || month
  };
}

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

const tools = {
  addExpense({ label, amount, category, date, note }) {
    validateAmount(amount);
    category = canonicalCategory(category);
    const transaction = tx(label, amount, category, date || todayIso(), { note });
    state.transactions.unshift(transaction);
    return { transaction, ...recalculateAfterWrite(category, transaction) };
  },

  updateMonthlyBudget({ amount }) {
    validateAmount(amount);
    state.monthlyBudget = amount;
    return { monthlyBudget: amount, ...recalculateAfterWrite() };
  },

  updateCategoryBudget({ category, amount }) {
    validateAmount(amount);
    category = canonicalCategory(category);
    state.categoryBudgets[category] = amount;
    const snapshots = recalculateAfterWrite(category);
    return {
      categorySnapshot: snapshots.categorySnapshot,
      budgetSnapshot: snapshots.budgetSnapshot,
      warningCard: snapshots.warningCard
    };
  },

  markExpenseException({ transactionId, searchQuery, exceptionType }) {
    const matches = transactionId
      ? state.transactions.filter((item) => item.id === transactionId)
      : findTransactions(searchQuery);
    if (matches.length !== 1) return lowConfidenceTransactionCard(matches, "Bạn muốn đánh dấu khoản nào?");

    const transaction = matches[0];
    transaction.exceptionType = exceptionType;
    transaction.excludedFromForecast = ["one_time", "debt", "refund"].includes(exceptionType);
    if (exceptionType === "debt") transaction.category = "Debt";
    transaction.category = canonicalCategory(transaction.category);
    transaction.updatedAt = new Date().toISOString();
    return { transaction, ...recalculateAfterWrite(transaction.category, transaction) };
  },

  getBudgetSnapshot({ month = state.month, category } = {}) {
    return getBudgetSnapshot({ month, category });
  },

  reviewUnusualExpenses({ month = state.month }) {
    const budgetSnapshotBefore = getBudgetSnapshot({ month });
    const candidates = state.transactions
      .filter((item) => item.date.startsWith(month))
      .filter((item) => item.amount >= 1000000 || item.excludedFromForecast || /học phí|trả nợ|vay/i.test(item.label))
      .map((item) => ({
        transactionId: item.id,
        label: item.label,
        amount: item.amount,
        category: item.category,
        reason: item.excludedFromForecast ? "Đang được loại khỏi dự báo" : "Khoản lớn hoặc có tính chất bất thường",
        suggestedActions: ["Đánh dấu khoản chi một lần", "Đổi danh mục", "Giữ là chi tiêu bình thường"]
      }));

    return {
      candidates,
      budgetSnapshotBefore,
      potentialImpact: candidates.length
        ? "Nếu loại đúng các khoản một lần, dự báo cuối tháng sẽ sát thực tế hơn."
        : "Chưa thấy khoản nào đủ bất thường để cần rà soát."
    };
  },

  getSpendingBreakdown({ month = state.month }) {
    const snapshot = getBudgetSnapshot({ month });
    const topCategories = snapshot.categoryBreakdown
      .filter((item) => item.spent > 0)
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 5)
      .map((item) => ({
        category: item.category,
        label: item.label,
        spent: item.spent,
        budget: item.budget,
        remaining: item.remaining,
        riskLevel: item.riskLevel,
        shareOfTotal: snapshot.totalSpent ? item.spent / snapshot.totalSpent : 0
      }));

    return {
      snapshot,
      topCategories,
      summary: topCategories.length ? `Nhom chi cao nhat la ${topCategories[0].label}.` : "Chua co du lieu chi tieu."
    };
  },

  getRecentTransactions({ month = state.month, limit = 8 } = {}) {
    return {
      transactions: state.transactions
        .filter((item) => item.date.startsWith(month))
        .slice(0, limit)
    };
  },

  simulateExpense({ label = "Khoan chi mo phong", amount, category = "Other", date = todayIso(), month = state.month }) {
    validateAmount(amount);
    category = canonicalCategory(category);
    const before = getBudgetSnapshot({ month });
    const simulatedTransaction = tx(label, amount, category, date);
    const simulatedTransactions = [simulatedTransaction, ...state.transactions];
    const after = calculateSnapshotFromTransactions({ month, transactions: simulatedTransactions });
    const categoryAfter = calculateCategorySnapshotFromTransactions({ category, month, transactions: simulatedTransactions });

    return {
      simulationOnly: true,
      simulatedTransaction,
      before,
      after,
      categoryAfter,
      impact: {
        additionalSpent: amount,
        remainingChange: after.remaining - before.remaining,
        forecastChange: after.forecastEndOfMonth - before.forecastEndOfMonth,
        overBudgetAmount: Math.max(after.forecastEndOfMonth - state.monthlyBudget, 0)
      }
    };
  },

  advisePurchaseDecision({ item, amount, category = "Shopping", month = state.month }) {
    if (!item) item = categoryLabel(category);
    validateAmount(amount);
    category = canonicalCategory(category);

    const budgetSnapshot = getBudgetSnapshot({ month });
    const categorySnapshot = getCategorySnapshot(category, month);
    const forecastAfterPurchase = budgetSnapshot.forecastEndOfMonth + amount;
    const remainingCategoryBudget = categorySnapshot.remaining;
    const remainingMonthlyBudget = budgetSnapshot.remaining;
    const wouldExceedCategoryBudget = amount > remainingCategoryBudget;
    const wouldExceedMonthlyBudget = amount > remainingMonthlyBudget;
    const categorySpentAfterPurchase = categorySnapshot.spent + amount;
    const totalSpentAfterPurchase = budgetSnapshot.totalSpent + amount;
    const additionalRisk = determineAdditionalPurchaseRisk({
      amount,
      budgetSnapshot,
      categorySnapshot,
      forecastAfterPurchase,
      wouldExceedCategoryBudget,
      wouldExceedMonthlyBudget
    });
    const safeToSpendScore = calculateSafeToSpendScore({
      amount,
      budgetSnapshot,
      categorySnapshot,
      forecastAfterPurchase,
      wouldExceedCategoryBudget,
      wouldExceedMonthlyBudget
    });
    const decision = safeToSpendScore >= 80
      ? "recommended"
      : safeToSpendScore >= 40
        ? "warning"
        : "not_recommended";

    return {
      decision,
      confidence: "high",
      item,
      amount,
      category,
      reasoning: {
        remainingCategoryBudget,
        remainingMonthlyBudget,
        wouldExceedCategoryBudget,
        wouldExceedMonthlyBudget,
        currentRiskLevel: budgetSnapshot.riskLevel,
        categoryRiskLevel: categorySnapshot.riskLevel,
        forecastAfterPurchase,
        safeToSpendScore,
        additionalRisk,
        categoryBudget: categorySnapshot.budget,
        categorySpent: categorySnapshot.spent,
        categorySpentAfterPurchase,
        monthlyBudget: budgetSnapshot.monthlyBudget,
        totalSpent: budgetSnapshot.totalSpent,
        totalSpentAfterPurchase
      },
      budgetSnapshot,
      categorySnapshot
    };
  },

  getForecastAnalysis({ month = state.month }) {
    const snapshot = getBudgetSnapshot({ month });
    const breakdown = tools.getSpendingBreakdown({ month });
    const elapsedRatio = daysElapsed() / daysInMonth(month);
    const budgetUsedRatio = state.monthlyBudget ? snapshot.totalSpent / state.monthlyBudget : 0;
    const riskReason = snapshot.riskLevel === "safe"
      ? "Toc do chi hien tai van nam trong ngan sach."
      : `Ban da dung ${(budgetUsedRatio * 100).toFixed(0)}% ngan sach khi thang moi di qua ${(elapsedRatio * 100).toFixed(0)}%.`;

    return {
      snapshot,
      topCategories: breakdown.topCategories,
      daysElapsed: daysElapsed(),
      daysRemaining: daysLeft(),
      budgetUsedRatio,
      elapsedRatio,
      riskReason
    };
  },

  getCategorySummary({ category, month = state.month }) {
    category = canonicalCategory(category);
    return {
      categorySnapshot: getCategorySnapshot(category, month),
      recentTransactions: state.transactions
        .filter((item) => item.date.startsWith(month) && item.category === category)
        .slice(0, 5)
    };
  }
};

function mockLLMRoute(message) {
  const lower = normalize(message);
  const amount = parseAmount(message);
  const category = parseCategory(message);

  if (isPurchaseAdviceQuestion(lower)) {
    return {
      intent: "purchase_decision_advice",
      tool: "advisePurchaseDecision",
      arguments: {
        item: parsePurchaseItem(message),
        amount: amount || inferPurchaseAmount(message),
        category: parsePurchaseCategory(message),
        month: state.month
      }
    };
  }
  if (/(neu|thi sao|gia su)/.test(lower) && amount) {
    return {
      intent: "simulate_expense",
      tool: "simulateExpense",
      arguments: { label: parseLabel(message, category), amount, category, date: todayIso(), month: state.month }
    };
  }
  if (/(tai sao|vi sao|ly do|canh bao)/.test(lower)) {
    return { intent: "get_forecast_analysis", tool: "getForecastAnalysis", arguments: { month: state.month } };
  }
  if (/(phan bo|breakdown|nhom chi|danh muc nao|chi nhieu)/.test(lower)) {
    return { intent: "get_spending_breakdown", tool: "getSpendingBreakdown", arguments: { month: state.month } };
  }
  if (/(ra soat|bat thuong|du bao sai)/.test(lower)) {
    return { intent: "review_unusual_expenses", tool: "reviewUnusualExpenses", arguments: { month: state.month } };
  }
  if (/(con bao nhieu|con lai|du bao|nguy co|tinh trang)/.test(lower)) {
    return { intent: "get_budget_snapshot", tool: "getBudgetSnapshot", arguments: { month: state.month } };
  }
  if (/(chi mot lan|tra no|hoan tien|binh thuong|cu tinh)/.test(lower)) {
    return {
      intent: "mark_expense_exception",
      tool: "markExpenseException",
      arguments: {
        searchQuery: message,
        exceptionType: lower.includes("tra no") ? "debt" : lower.includes("binh thuong") ? "normal" : "one_time"
      }
    };
  }
  if (/(ngan sach)/.test(lower) && amount) {
    if (/(an uong|di chuyen|mua sam|hoc|giai tri|hoa don|gia dinh)/.test(lower)) {
      return { intent: "update_category_budget", tool: "updateCategoryBudget", arguments: { category, amount, month: state.month } };
    }
    return { intent: "update_monthly_budget", tool: "updateMonthlyBudget", arguments: { amount, month: state.month } };
  }
  if (/(them|ghi|toi vua|khoan|chi|tra tien)/.test(lower)) {
    if (!amount) {
      return {
        intent: "low_confidence_write",
        assistantMessage: "Mình chưa đọc được số tiền. Bạn gửi lại theo mẫu như: Thêm ăn tối 80k nhé.",
        cards: []
      };
    }
    return {
      intent: "add_expense",
      tool: "addExpense",
      arguments: { label: parseLabel(message, category), amount, category, date: todayIso() }
    };
  }
  return {
    intent: "small_talk_or_help",
    assistantMessage: "Mình có thể thêm khoản chi, cập nhật ngân sách, rà soát giao dịch bất thường và dự báo ngân sách."
  };
}

function getBudgetSnapshot({ month = state.month, category } = {}) {
  return calculateSnapshotFromTransactions({ month, category, transactions: state.transactions });
}

function calculateSnapshotFromTransactions({ month = state.month, category, transactions }) {
  const monthTransactions = transactions.filter((item) => item.date.startsWith(month));
  const totalSpent = monthTransactions.reduce((sum, item) => sum + item.amount, 0);
  const forecastBase = monthTransactions.filter((item) => !item.excludedFromForecast).reduce((sum, item) => sum + item.amount, 0);
  const dailySpendingRate = forecastBase / daysElapsed();
  const forecastEndOfMonth = dailySpendingRate * daysInMonth(month);
  const remaining = state.monthlyBudget - totalSpent;
  const recommendedDailySpend = Math.max(remaining, 0) / Math.max(daysLeft(), 1);
  const riskLevel = totalSpent > state.monthlyBudget || forecastEndOfMonth > state.monthlyBudget
    ? "danger"
    : forecastEndOfMonth > state.monthlyBudget * 0.9
      ? "warning"
      : "safe";
  const categoryBreakdown = Object.keys(categories).map((key) => calculateCategorySnapshotFromTransactions({ category: key, month, transactions }));

  return {
    month,
    monthlyBudget: state.monthlyBudget,
    totalSpent,
    remaining,
    dailySpendingRate,
    forecastEndOfMonth,
    recommendedDailySpend,
    riskLevel,
    categoryBreakdown: category ? categoryBreakdown.filter((item) => item.category === category) : categoryBreakdown,
    recentTransactions: monthTransactions.slice(0, 8)
  };
}

function getCategorySnapshot(category, month) {
  return calculateCategorySnapshotFromTransactions({ category, month, transactions: state.transactions });
}

function calculateCategorySnapshotFromTransactions({ category, month, transactions }) {
  const spent = transactions
    .filter((item) => item.category === category && item.date.startsWith(month))
    .reduce((sum, item) => sum + item.amount, 0);
  const forecastBase = transactions
    .filter((item) => item.category === category && item.date.startsWith(month) && !item.excludedFromForecast)
    .reduce((sum, item) => sum + item.amount, 0);
  const budget = state.categoryBudgets[category] || categories.Other.limit;
  const forecastEndOfMonth = (forecastBase / daysElapsed()) * daysInMonth(month);
  const remaining = budget - spent;
  const riskLevel = spent > budget || forecastEndOfMonth > budget
    ? "danger"
    : forecastEndOfMonth > budget * 0.9
      ? "warning"
      : "safe";
  return { category, label: categoryLabel(category), budget, spent, remaining, forecastEndOfMonth, riskLevel };
}

function recalculateAfterWrite(category, triggerTransaction) {
  const budgetSnapshot = getBudgetSnapshot({ month: state.month });
  const categorySnapshot = category ? getCategorySnapshot(category, state.month) : undefined;
  const warningCard = generateCard({ budgetSnapshot, categorySnapshot, triggerTransaction });
  return { budgetSnapshot, categorySnapshot, warningCard };
}

function generateCard({ budgetSnapshot, categorySnapshot, triggerTransaction }) {
  if (categorySnapshot) {
    return {
      type: "category_budget",
      riskLevel: categorySnapshot.riskLevel,
      title: `Ngân sách ${categorySnapshot.label}`,
      metrics: {
        budget: categorySnapshot.budget,
        spent: categorySnapshot.spent,
        remaining: categorySnapshot.remaining,
        forecast: categorySnapshot.forecastEndOfMonth
      },
      explanation: `${categorySnapshot.label} hiện ở trạng thái ${riskText(categorySnapshot.riskLevel).toLowerCase()}.`,
      actions: defaultActions(categorySnapshot.category, triggerTransaction)
    };
  }
  return {
    type: "budget",
    riskLevel: budgetSnapshot.riskLevel,
    title: budgetSnapshot.riskLevel === "safe" ? "Ngân sách khỏe" : "Nguy cơ vượt ngân sách",
    metrics: {
      budget: budgetSnapshot.monthlyBudget,
      spent: budgetSnapshot.totalSpent,
      remaining: budgetSnapshot.remaining,
      forecast: budgetSnapshot.forecastEndOfMonth
    },
    explanation: `Ngân sách tháng hiện ở trạng thái ${riskText(budgetSnapshot.riskLevel).toLowerCase()}.`,
    actions: defaultActions(triggerTransaction?.category, triggerTransaction)
  };
}

function defaultActions(category, triggerTransaction) {
  const actions = [
    { label: "Xem chi tiết", actionType: "open_dashboard", payload: { category } },
    { label: "Rà soát giao dịch", actionType: "tool_call", payload: { tool: "reviewUnusualExpenses", arguments: { month: state.month } } },
    { label: "Điều chỉnh ngân sách", actionType: "prompt", payload: { message: category ? `Cập nhật ngân sách ${categoryLabel(category)} lên 3 triệu` : "Tăng ngân sách tháng này lên 12 triệu" } }
  ];
  if (triggerTransaction) {
    actions.push({
      label: "Đánh dấu khoản chi một lần",
      actionType: "tool_call",
      payload: { tool: "markExpenseException", arguments: { transactionId: triggerTransaction.id, exceptionType: "one_time" } }
    });
  }
  return actions;
}

function cardsForTool(tool, result) {
  if (["addExpense", "updateMonthlyBudget", "updateCategoryBudget", "markExpenseException"].includes(tool)) {
    return [result.warningCard].filter(Boolean);
  }
  if (tool === "getBudgetSnapshot") return [generateCard({ budgetSnapshot: result })];
  if (tool === "reviewUnusualExpenses") {
    return [{
      type: "review",
      riskLevel: result.candidates.length ? "warning" : "safe",
      title: "Rà soát giao dịch",
      explanation: result.potentialImpact,
      candidates: result.candidates,
      actions: []
    }];
  }
  if (tool === "getSpendingBreakdown") {
    return [{
      type: "spending_breakdown",
      riskLevel: result.snapshot.riskLevel,
      title: "Phân bổ chi tiêu",
      explanation: result.summary,
      data: { topCategories: result.topCategories },
      actions: defaultActions()
    }];
  }
  if (tool === "getForecastAnalysis") {
    return [{
      type: "forecast_analysis",
      riskLevel: result.snapshot.riskLevel,
      title: "Phân tích cảnh báo",
      explanation: result.riskReason,
      data: {
        daysElapsed: result.daysElapsed,
        daysRemaining: result.daysRemaining,
        topCategories: result.topCategories,
        forecastEndOfMonth: result.snapshot.forecastEndOfMonth
      },
      actions: defaultActions()
    }];
  }
  if (tool === "simulateExpense") {
    return [{
      type: "simulation_result",
      riskLevel: result.after.riskLevel,
      title: "Mô phỏng khoản chi",
      explanation: `Khoản chi này không được ghi vào dữ liệu thật. Dự báo thay đổi ${money(result.impact.forecastChange)}.`,
      data: {
        simulatedTransaction: result.simulatedTransaction,
        before: result.before,
        after: result.after,
        impact: result.impact
      },
      actions: defaultActions(result.simulatedTransaction.category)
    }];
  }
  if (tool === "advisePurchaseDecision") {
    const riskLevel = result.decision === "recommended"
      ? "safe"
      : result.decision === "warning"
        ? "warning"
        : "danger";
    const categoryLabelText = categoryLabel(result.category);
    const explanation = result.reasoning.wouldExceedCategoryBudget
      ? `Khoản mua này có thể khiến bạn vượt ngân sách ${categoryLabelText}.`
      : result.reasoning.wouldExceedMonthlyBudget
        ? "Khoản mua này có thể khiến bạn vượt ngân sách tháng."
        : "Khoản mua này vẫn nằm trong phần ngân sách còn lại.";

    return [{
      type: "purchase_advice",
      riskLevel,
      title: "Đánh giá khoản mua",
      explanation,
      data: {
        decision: result.decision,
        safeToSpendScore: result.reasoning.safeToSpendScore,
        purchaseAmount: result.amount,
        remainingBudget: result.reasoning.remainingMonthlyBudget,
        remainingCategoryBudget: result.reasoning.remainingCategoryBudget,
        forecastAfterPurchase: result.reasoning.forecastAfterPurchase,
        wouldExceedCategoryBudget: result.reasoning.wouldExceedCategoryBudget,
        wouldExceedMonthlyBudget: result.reasoning.wouldExceedMonthlyBudget
      },
      actions: [
        {
          label: "Mô phỏng chi tiết",
          actionType: "tool_call",
          payload: {
            tool: "simulateExpense",
            arguments: {
              label: result.item,
              amount: result.amount,
              category: result.category,
              month: state.month
            }
          }
        }
      ]
    }];
  }
  if (tool === "getCategorySummary") {
    return [{
      type: "category_summary",
      riskLevel: result.categorySnapshot.riskLevel,
      title: `Tổng quan ${result.categorySnapshot.label}`,
      explanation: `${result.categorySnapshot.label} đã chi ${money(result.categorySnapshot.spent)}.`,
      data: result,
      actions: defaultActions(result.categorySnapshot.category)
    }];
  }
  return [];
}

function assistantMessageForTool(tool, result) {
  if (tool === "addExpense") {
    const item = result.transaction;
    return `Đã ghi nhận ${item.label} ${money(item.amount)} vào ${categoryLabel(item.category)}.`;
  }
  if (tool === "updateMonthlyBudget") return `Đã cập nhật ngân sách tháng này thành ${money(result.monthlyBudget)}.`;
  if (tool === "updateCategoryBudget") {
    const item = result.categorySnapshot;
    return `Đã cập nhật ngân sách ${item.label} thành ${money(item.budget)}. Hiện bạn đã chi ${money(item.spent)}, còn lại ${money(item.remaining)}.`;
  }
  if (tool === "markExpenseException") return `Đã cập nhật trạng thái ngoại lệ cho ${result.transaction.label}.`;
  if (tool === "getBudgetSnapshot") return `Tháng này bạn còn ${money(result.remaining)}. Dự báo cuối tháng là ${money(result.forecastEndOfMonth)}.`;
  if (tool === "reviewUnusualExpenses") return result.candidates.length ? `Mình tìm thấy ${result.candidates.length} khoản nên rà soát.` : "Chưa thấy khoản bất thường rõ ràng.";
  if (tool === "getSpendingBreakdown") return result.summary;
  if (tool === "getForecastAnalysis") return result.riskReason;
  if (tool === "simulateExpense") return `Nếu thêm ${money(result.simulatedTransaction.amount)}, dự báo cuối tháng sẽ là ${money(result.after.forecastEndOfMonth)}.`;
  if (tool === "advisePurchaseDecision") {
    const score = result.reasoning.safeToSpendScore;
    const advice = result.decision === "recommended"
      ? "Mình đánh giá khoản mua này khá an toàn."
      : result.decision === "warning"
        ? "Mình khuyên bạn cân nhắc hoặc tìm lựa chọn rẻ hơn."
        : "Mình không khuyên mua lúc này.";
    return `${advice} Safe To Spend Score: ${score}/100.`;
  }
  if (tool === "getCategorySummary") return `${result.categorySnapshot.label} đã chi ${money(result.categorySnapshot.spent)} / ${money(result.categorySnapshot.budget)}.`;
  return "Đã xử lý xong.";
}

function buildLLMContext(month) {
  const snap = getBudgetSnapshot({ month });
  const breakdown = tools.getSpendingBreakdown({ month });
  const exceptions = state.transactions.filter((item) => item.excludedFromForecast && item.date.startsWith(month));
  return {
    currentMonth: month,
    monthlyBudget: snap.monthlyBudget,
    totalSpent: snap.totalSpent,
    remaining: snap.remaining,
    daysElapsed: daysElapsed(),
    daysRemaining: daysLeft(),
    dailyAverage: snap.dailySpendingRate,
    recommendedDailySpend: snap.recommendedDailySpend,
    forecastEndOfMonth: snap.forecastEndOfMonth,
    riskLevel: snap.riskLevel,
    topCategories: breakdown.topCategories,
    purchaseAdviceSignals: {
      safeToSpendThresholds: {
        safe: 80,
        mostlySafe: 60,
        warning: 40,
        highRisk: 20
      },
      defaultPurchaseCategory: "Shopping"
    },
    exceptionTransactions: exceptions.map((item) => ({
      id: item.id,
      label: item.label,
      amount: item.amount,
      category: item.category,
      exceptionType: item.exceptionType
    })),
    riskReason: tools.getForecastAnalysis({ month }).riskReason,
    categories: snap.categoryBreakdown.map((item) => ({
      id: item.category,
      label: item.label,
      budget: item.budget,
      spent: item.spent,
      remaining: item.remaining,
      riskLevel: item.riskLevel
    })),
    recentTransactions: snap.recentTransactions.map((item) => ({
      id: item.id,
      label: item.label,
      amount: item.amount,
      category: item.category,
      date: item.date
    }))
  };
}

function toolSchemas() {
  return [
    { type: "function", name: "addExpense", description: "Thêm khoản chi.", parameters: schema(["label", "amount", "category"], { label: "string", amount: "number", category: "string", date: "string", note: "string" }) },
    { type: "function", name: "updateMonthlyBudget", description: "Cập nhật ngân sách tổng tháng.", parameters: schema(["amount", "month"], { amount: "number", month: "string" }) },
    { type: "function", name: "updateCategoryBudget", description: "Cập nhật ngân sách danh mục.", parameters: schema(["category", "amount", "month"], { category: "string", amount: "number", month: "string" }) },
    { type: "function", name: "markExpenseException", description: "Đánh dấu khoản chi là ngoại lệ.", parameters: schema(["exceptionType"], { transactionId: "string", searchQuery: "string", exceptionType: "string" }) },
    { type: "function", name: "getBudgetSnapshot", description: "Lấy snapshot ngân sách.", parameters: schema(["month"], { month: "string", category: "string" }) },
    { type: "function", name: "reviewUnusualExpenses", description: "Rà soát khoản bất thường.", parameters: schema(["month"], { month: "string" }) },
    { type: "function", name: "getSpendingBreakdown", description: "Phân tích nhóm chi tiêu lớn nhất.", parameters: schema(["month"], { month: "string" }) },
    { type: "function", name: "getRecentTransactions", description: "Lấy các giao dịch gần đây.", parameters: schema(["month"], { month: "string", limit: "number" }) },
    { type: "function", name: "simulateExpense", description: "Mô phỏng một khoản chi tương lai, không ghi dữ liệu thật.", parameters: schema(["label", "amount", "category", "month"], { label: "string", amount: "number", category: "string", date: "string", month: "string" }) },
    { type: "function", name: "advisePurchaseDecision", description: "Đánh giá có nên mua/đăng ký/nâng cấp/đi du lịch dựa trên ngân sách, forecast và spending velocity.", parameters: schema(["item", "amount", "category", "month"], { item: "string", amount: "number", category: "string", month: "string" }) },
    { type: "function", name: "getForecastAnalysis", description: "Giải thích lý do cảnh báo hoặc nguy cơ vượt ngân sách.", parameters: schema(["month"], { month: "string" }) },
    { type: "function", name: "getCategorySummary", description: "Lấy tổng quan một danh mục.", parameters: schema(["category", "month"], { category: "string", month: "string" }) }
  ];
}

function schema(required, props) {
  return {
    type: "object",
    additionalProperties: false,
    required,
    properties: Object.fromEntries(Object.entries(props).map(([key, type]) => [key, { type }]))
  };
}

function tx(label, amount, category, date, options = {}) {
  const now = new Date().toISOString();
  return {
    id: options.id || `tx_${Math.random().toString(16).slice(2, 10)}`,
    userId: USER_ID,
    label,
    amount,
    category,
    date,
    note: options.note || "",
    exceptionType: options.exceptionType || "normal",
    excludedFromForecast: Boolean(options.excludedFromForecast),
    createdAt: now,
    updatedAt: now
  };
}

function parseAmount(text) {
  const normalized = normalize(text).replace(",", ".");
  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number(match[1]);
  if (normalized.includes("trieu")) return value * 1000000;
  if (normalized.includes("nghin") || normalized.includes("k")) return value * 1000;
  return value;
}

function parseCategory(text) {
  const lower = normalize(text);
  if (/(an|com|toi|trua|food|uong|cafe|ca phe)/.test(lower)) return "Food";
  if (/(hoa don|dien|nuoc|bill)/.test(lower)) return "Bills";
  if (/(taxi|xe|di chuyen|bus|grab)/.test(lower)) return "Transport";
  if (/(hoc|hoc phi|sach|giao duc)/.test(lower)) return "Education";
  if (/(no|vay|tra no)/.test(lower)) return "Debt";
  if (/(mua|shopping|sieu thi|tai nghe|dien thoai|laptop|ban phim|pc|nang cap|chatgpt|plus|du lich)/.test(lower)) return "Shopping";
  return "Other";
}

function canonicalCategory(value) {
  const normalized = normalize(value || "");
  const direct = Object.keys(categories).find((key) => key.toLowerCase() === String(value || "").toLowerCase());
  if (direct) return direct;
  if (/(an uong|food|an|com|cafe|ca phe)/.test(normalized)) return "Food";
  if (/(hoa don|bill|dien|nuoc)/.test(normalized)) return "Bills";
  if (/(di chuyen|transport|taxi|grab|xe)/.test(normalized)) return "Transport";
  if (/(mua sam|shopping|sieu thi)/.test(normalized)) return "Shopping";
  if (/(hoc|education|hoc tap|hoc phi)/.test(normalized)) return "Education";
  if (/(giai tri|entertainment|phim|nhac)/.test(normalized)) return "Entertainment";
  if (/(gia dinh|family)/.test(normalized)) return "Family";
  if (/(tra no|debt|no|vay)/.test(normalized)) return "Debt";
  return "Other";
}

function parseLabel(text, category) {
  const lower = normalize(text);
  if (lower.includes("hoc phi")) return "Học phí";
  if (lower.includes("an toi")) return "Ăn tối";
  if (lower.includes("an trua")) return "Ăn trưa";
  if (lower.includes("taxi")) return "Taxi";
  return categoryLabel(category);
}

function isPurchaseAdviceQuestion(normalizedText) {
  return /(co nen mua|nen mua khong|co nen dang ky|co nen di du lich|co nen nang cap|co nen chi|co nen tra tien)/.test(normalizedText);
}

function parsePurchaseItem(text) {
  const lower = normalize(text);
  const patterns = [
    /co nen mua (.+?)(?: \d| khong| không|\?|$)/,
    /nen mua (.+?)(?: \d| khong| không|\?|$)/,
    /co nen dang ky (.+?)(?: \d| khong| không|\?|$)/,
    /co nen di du lich (.+?)(?: \d| khong| không|\?|$)/,
    /co nen nang cap (.+?)(?: \d| khong| không|\?|$)/,
    /co nen chi (.+?)(?: \d| khong| không|\?|$)/,
    /co nen tra tien (.+?)(?: \d| khong| không|\?|$)/
  ];
  const match = patterns.map((pattern) => lower.match(pattern)).find(Boolean);
  if (!match) return parseLabel(text, parseCategory(text));
  return titleCaseVietnamese(match[1].replace(/\s+/g, " ").trim());
}

function parsePurchaseCategory(text) {
  const lower = normalize(text);
  if (/(du lich|da nang|hotel|ve may bay|khach san)/.test(lower)) return "Entertainment";
  if (/(chatgpt|plus|dang ky|subscription|phan mem|software)/.test(lower)) return "Education";
  if (/(dien thoai|tai nghe|laptop|ban phim|pc|nang cap|may tinh|tablet)/.test(lower)) return "Shopping";
  return parseCategory(text);
}

function inferPurchaseAmount(text) {
  const lower = normalize(text);
  if (/(chatgpt|plus)/.test(lower)) return 500000;
  if (/(ban phim)/.test(lower)) return 1500000;
  if (/(tai nghe)/.test(lower)) return 1500000;
  if (/(dien thoai)/.test(lower)) return 15000000;
  if (/(laptop)/.test(lower)) return 20000000;
  if (/(du lich)/.test(lower)) return 5000000;
  return 1000000;
}

function titleCaseVietnamese(value) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function calculateSafeToSpendScore({ amount, budgetSnapshot, categorySnapshot, forecastAfterPurchase, wouldExceedCategoryBudget, wouldExceedMonthlyBudget }) {
  let score = 100;
  const monthlyUsageAfter = budgetSnapshot.monthlyBudget
    ? (budgetSnapshot.totalSpent + amount) / budgetSnapshot.monthlyBudget
    : 1;
  const categoryUsageAfter = categorySnapshot.budget
    ? (categorySnapshot.spent + amount) / categorySnapshot.budget
    : 1;
  const purchaseMonthlyShare = budgetSnapshot.monthlyBudget ? amount / budgetSnapshot.monthlyBudget : 1;
  const remainingMonthlyShare = budgetSnapshot.monthlyBudget ? budgetSnapshot.remaining / budgetSnapshot.monthlyBudget : 0;

  score -= Math.max(0, monthlyUsageAfter - 0.7) * 70;
  score -= Math.max(0, categoryUsageAfter - 0.8) * 45;
  score -= forecastAfterPurchase > budgetSnapshot.monthlyBudget ? 25 : 0;
  score -= wouldExceedCategoryBudget ? 20 : 0;
  score -= wouldExceedMonthlyBudget ? 35 : 0;
  score -= purchaseMonthlyShare > 0.15 ? 15 : 0;
  score -= remainingMonthlyShare < 0.2 ? 10 : 0;
  if (budgetSnapshot.riskLevel === "danger") score -= 15;
  if (budgetSnapshot.riskLevel === "warning") score -= 8;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function determineAdditionalPurchaseRisk({ amount, budgetSnapshot, categorySnapshot, forecastAfterPurchase, wouldExceedCategoryBudget, wouldExceedMonthlyBudget }) {
  const reasons = [];
  if (wouldExceedCategoryBudget) reasons.push("category_budget_exceeded");
  if (wouldExceedMonthlyBudget) reasons.push("monthly_remaining_exceeded");
  if (forecastAfterPurchase > budgetSnapshot.monthlyBudget) reasons.push("forecast_over_monthly_budget");
  if (categorySnapshot.budget && amount / categorySnapshot.budget > 0.5) reasons.push("large_vs_category_budget");
  if (!reasons.length) reasons.push("no_major_new_risk");
  return reasons;
}

function findTransactions(searchQuery) {
  const normalized = normalize(searchQuery || "");
  return state.transactions.filter((item) => normalized.includes(normalize(item.label)));
}

function lowConfidenceTransactionCard(matches, title) {
  return {
    needsConfirmation: true,
    assistantMessage: matches.length ? `Mình tìm thấy ${matches.length} khoản phù hợp. ${title}` : "Mình chưa tìm thấy giao dịch phù hợp.",
    cards: [{
      type: "confirmation",
      riskLevel: "low_confidence",
      title,
      actions: matches.slice(0, 4).map((item) => ({
        label: `${item.label} - ${money(item.amount)}`,
        actionType: "tool_call",
        payload: { tool: "markExpenseException", arguments: { transactionId: item.id, exceptionType: "one_time" } }
      }))
    }]
  };
}

function validateAmount(amount) {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("invalid_amount");
}

function normalize(text) {
  return String(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}

function todayIso() {
  return state.today.toISOString().slice(0, 10);
}

function daysInMonth(month = state.month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber, 0).getDate();
}

function daysElapsed() {
  return state.today.getDate();
}

function daysLeft() {
  return Math.max(daysInMonth() - daysElapsed(), 0);
}

function categoryLabel(category) {
  return categories[category]?.label || categories.Other.label;
}

function riskText(risk) {
  return risk === "safe" ? "An toàn" : risk === "warning" ? "Cảnh báo" : "Đã vượt";
}

function money(value) {
  return `${Math.round(value).toLocaleString("vi-VN")}đ`;
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).reduce((acc, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return acc;
    const index = trimmed.indexOf("=");
    if (index === -1) return acc;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    acc[key] = value;
    process.env[key] ||= value;
    return acc;
  }, {});
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const requested = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = path.normalize(path.join(rootDir, requested));
  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const ext = path.extname(filePath);
  const contentType = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8"
  }[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(res);
}
