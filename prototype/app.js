const CURRENT_MONTH = "2026-06";
const USER_ID = "demo_user";

const categories = {
  Food: { label: "Ăn uống", icon: "🍲", colorClass: "", limit: 2000000 },
  Bills: { label: "Hóa đơn", icon: "▤", colorClass: "teal", limit: 600000 },
  Transport: { label: "Di chuyển", icon: "⇄", colorClass: "purple", limit: 1200000 },
  Shopping: { label: "Mua sắm", icon: "◈", colorClass: "purple", limit: 2000000 },
  Education: { label: "Học tập", icon: "○", colorClass: "teal", limit: 1500000 },
  Entertainment: { label: "Giải trí", icon: "♪", colorClass: "", limit: 1200000 },
  Family: { label: "Gia đình", icon: "⌂", colorClass: "teal", limit: 1800000 },
  Debt: { label: "Trả nợ", icon: "✓", colorClass: "purple", limit: 1500000 },
  Other: { label: "Khác", icon: "•", colorClass: "", limit: 1000000 }
};

const state = {
  userId: USER_ID,
  month: CURRENT_MONTH,
  today: new Date(2026, 5, 4, 9, 32),
  monthlyBudget: 10000000,
  categoryBudgets: Object.fromEntries(
    Object.entries(categories).map(([key, value]) => [key, value.limit])
  ),
  transactions: [
    createTransaction("Cà phê sáng", 90000, "Food", "2026-06-01"),
    createTransaction("Siêu thị", 420000, "Shopping", "2026-06-01"),
    createTransaction("Ăn trưa", 160000, "Food", "2026-06-02"),
    createTransaction("Taxi", 220000, "Transport", "2026-06-02"),
    createTransaction("Ăn tối", 240000, "Food", "2026-06-03"),
    createTransaction("Hóa đơn điện", 600000, "Bills", "2026-06-03"),
    createTransaction("Mua đồ dùng", 470000, "Shopping", "2026-06-04"),
    createTransaction("Ăn uống cuối tuần", 980000, "Food", "2026-06-04"),
    createTransaction("Sách và học tập", 480000, "Education", "2026-06-04"),
    createTransaction("Vé xem phim", 350000, "Entertainment", "2026-06-04"),
    createTransaction("Chuyển khoản gia đình", 1190000, "Family", "2026-06-04")
  ]
};

const chatLog = document.querySelector("#chatLog");
const chatForm = document.querySelector("#chatForm");
const chatInput = document.querySelector("#chatInput");
const tabs = document.querySelectorAll(".tab");
const screens = document.querySelectorAll(".app-screen");

function createTransaction(label, amount, category, date, options = {}) {
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

function money(value) {
  return `${Math.round(value).toLocaleString("vi-VN")}đ`;
}

function shortMoney(value) {
  return `${Math.round(value / 1000).toLocaleString("vi-VN")}k`;
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

function parseAmount(text) {
  const normalized = removeVietnameseTone(text).toLowerCase().replace(",", ".");
  const numberMatch = normalized.match(/(\d+(?:\.\d+)?)/);
  if (!numberMatch) return null;

  const value = Number(numberMatch[1]);
  if (normalized.includes("trieu")) return value * 1000000;
  if (normalized.includes("nghin") || normalized.includes("k")) return value * 1000;
  return value;
}

function parseCategory(text) {
  const lower = removeVietnameseTone(text).toLowerCase();
  if (/(an|com|toi|trua|food|uong|cafe|ca phe)/.test(lower)) return "Food";
  if (/(hoa don|dien|nuoc|bill)/.test(lower)) return "Bills";
  if (/(taxi|xe|di chuyen|bus|grab)/.test(lower)) return "Transport";
  if (/(hoc|hoc phi|sach|giao duc)/.test(lower)) return "Education";
  if (/(no|vay|tra no)/.test(lower)) return "Debt";
  if (/(mua|shopping|sieu thi)/.test(lower)) return "Shopping";
  if (/(phim|giai tri|nhac|game)/.test(lower)) return "Entertainment";
  if (/(gia dinh|nha)/.test(lower)) return "Family";
  return "Other";
}

function parseLabel(text, category) {
  const lower = removeVietnameseTone(text).toLowerCase();
  if (lower.includes("hoc phi")) return "Học phí";
  if (lower.includes("an toi")) return "Ăn tối";
  if (lower.includes("an trua")) return "Ăn trưa";
  if (lower.includes("taxi")) return "Taxi";
  if (lower.includes("sieu thi")) return "Siêu thị";
  if (lower.includes("ca phe")) return "Cà phê";
  return categoryLabel(category);
}

function removeVietnameseTone(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function normalizeSearch(text) {
  return removeVietnameseTone(text).toLowerCase();
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function formatDate(date) {
  const value = new Date(date);
  return value.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function getCategorySnapshot(category, month = state.month) {
  const spent = state.transactions
    .filter((item) => item.category === category && item.date.startsWith(month))
    .reduce((sum, item) => sum + item.amount, 0);
  const forecastBase = state.transactions
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

  return {
    category,
    label: categoryLabel(category),
    budget,
    spent,
    remaining,
    forecastEndOfMonth,
    riskLevel
  };
}

function getBudgetSnapshot({ month = state.month, category } = {}) {
  const monthTransactions = state.transactions.filter((item) => item.date.startsWith(month));
  const totalSpent = monthTransactions.reduce((sum, item) => sum + item.amount, 0);
  const forecastBase = monthTransactions
    .filter((item) => !item.excludedFromForecast)
    .reduce((sum, item) => sum + item.amount, 0);
  const dailySpendingRate = forecastBase / daysElapsed();
  const forecastEndOfMonth = dailySpendingRate * daysInMonth(month);
  const remaining = state.monthlyBudget - totalSpent;
  const recommendedDailySpend = Math.max(remaining, 0) / Math.max(daysLeft(), 1);
  const riskLevel = totalSpent > state.monthlyBudget || forecastEndOfMonth > state.monthlyBudget
    ? "danger"
    : forecastEndOfMonth > state.monthlyBudget * 0.9
      ? "warning"
      : "safe";
  const categoryBreakdown = Object.keys(categories).map((key) => getCategorySnapshot(key, month));
  const recentTransactions = monthTransactions
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 8);

  if (category) {
    return {
      monthlyBudget: state.monthlyBudget,
      totalSpent,
      remaining,
      dailySpendingRate,
      forecastEndOfMonth,
      riskLevel,
      recommendedDailySpend,
      categoryBreakdown: [getCategorySnapshot(category, month)],
      recentTransactions: recentTransactions.filter((item) => item.category === category)
    };
  }

  return {
    month,
    monthlyBudget: state.monthlyBudget,
    totalSpent,
    remaining,
    dailySpendingRate,
    forecastEndOfMonth,
    riskLevel,
    recommendedDailySpend,
    categoryBreakdown,
    recentTransactions
  };
}

function generateBudgetWarningCard({ budgetSnapshot, categorySnapshot, triggerTransaction }) {
  if (categorySnapshot) {
    const title = `Ngân sách ${categorySnapshot.label}`;
    const explanation = categorySnapshot.riskLevel === "danger"
      ? `${categorySnapshot.label} đang có nguy cơ vượt ngân sách.`
      : categorySnapshot.riskLevel === "warning"
        ? `${categorySnapshot.label} đang gần chạm ngân sách.`
        : `${categorySnapshot.label} vẫn trong vùng an toàn.`;

    return {
      type: "category_budget",
      riskLevel: categorySnapshot.riskLevel,
      title,
      metrics: {
        budget: categorySnapshot.budget,
        spent: categorySnapshot.spent,
        remaining: categorySnapshot.remaining,
        forecast: categorySnapshot.forecastEndOfMonth
      },
      explanation,
      actions: defaultActions(categorySnapshot.category, triggerTransaction)
    };
  }

  const title = budgetSnapshot.riskLevel === "danger"
    ? "Vượt ngân sách"
    : budgetSnapshot.riskLevel === "warning"
      ? "Nguy cơ vượt ngân sách"
      : "Ngân sách khỏe";
  const explanation = budgetSnapshot.riskLevel === "danger"
    ? "Bạn đã vượt hoặc được dự báo sẽ vượt ngân sách tháng này."
    : budgetSnapshot.riskLevel === "warning"
      ? "Tốc độ chi hiện tại đang khá cao so với ngân sách tháng."
      : "Tốc độ chi hiện tại vẫn nằm trong ngân sách tháng.";

  return {
    type: "budget",
    riskLevel: budgetSnapshot.riskLevel,
    title,
    metrics: {
      budget: budgetSnapshot.monthlyBudget,
      spent: budgetSnapshot.totalSpent,
      remaining: budgetSnapshot.remaining,
      forecast: budgetSnapshot.forecastEndOfMonth
    },
    explanation,
    actions: defaultActions(triggerTransaction?.category, triggerTransaction)
  };
}

function defaultActions(category, triggerTransaction) {
  const actions = [
    {
      label: "Xem chi tiết",
      actionType: "open_dashboard",
      payload: { category }
    },
    {
      label: "Rà soát giao dịch",
      actionType: "tool_call",
      payload: { tool: "reviewUnusualExpenses", arguments: { month: state.month } }
    },
    {
      label: "Điều chỉnh ngân sách",
      actionType: "prompt",
      payload: { message: category ? `Cập nhật ngân sách ${categoryLabel(category)} lên 3 triệu` : "Tăng ngân sách tháng này lên 12 triệu" }
    }
  ];

  if (triggerTransaction && triggerTransaction.exceptionType === "normal") {
    actions.push({
      label: "Đánh dấu khoản chi một lần",
      actionType: "tool_call",
      payload: {
        tool: "markExpenseException",
        arguments: { transactionId: triggerTransaction.id, exceptionType: "one_time" }
      }
    });
  }

  return actions;
}

function findTransactions(searchQuery) {
  if (!searchQuery) return [];
  const normalized = normalizeSearch(searchQuery);
  const yesterday = new Date(state.today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayDate = yesterday.toISOString().slice(0, 10);

  return state.transactions.filter((item) => {
    const haystack = normalizeSearch(`${item.label} ${categoryLabel(item.category)} ${item.date}`);
    if (normalized.includes("hom qua")) return item.date === yesterdayDate;
    if (normalized.includes("vua roi") || normalized.includes("luc nay")) return item === state.transactions[0];
    return haystack.includes(normalized) || normalized.includes(normalizeSearch(item.label));
  });
}

function recalculateAfterWrite(category, triggerTransaction) {
  const budgetSnapshot = getBudgetSnapshot({ month: state.month });
  const categorySnapshot = category ? getCategorySnapshot(category, state.month) : undefined;
  const warningCard = generateBudgetWarningCard({ budgetSnapshot, categorySnapshot, triggerTransaction });
  renderAll();
  return { budgetSnapshot, categorySnapshot, warningCard };
}

const moniTools = {
  addExpense({ label, amount, category, date, note }) {
    validateAmount(amount);
    const transaction = createTransaction(label, amount, category, date || todayIso(), { note });
    state.transactions.unshift(transaction);
    const snapshots = recalculateAfterWrite(category, transaction);
    return { transaction, ...snapshots };
  },

  updateExpense({ transactionId, searchQuery, amount, category, label, date }) {
    const matches = transactionId
      ? state.transactions.filter((item) => item.id === transactionId)
      : findTransactions(searchQuery);

    if (matches.length !== 1) {
      return lowConfidenceTransactionCard(matches, "Bạn muốn sửa khoản nào?", (item) => ({
        tool: "updateExpense",
        arguments: { transactionId: item.id, amount, category, label, date }
      }));
    }
    if (amount !== undefined) validateAmount(amount);

    const transaction = matches[0];
    const oldCategory = transaction.category;
    if (amount !== undefined) transaction.amount = amount;
    if (category) transaction.category = category;
    if (label) transaction.label = label;
    if (date) transaction.date = date;
    transaction.updatedAt = new Date().toISOString();

    const snapshots = recalculateAfterWrite(category || oldCategory, transaction);
    return { transaction, ...snapshots };
  },

  deleteExpense({ transactionId, searchQuery }) {
    const matches = transactionId
      ? state.transactions.filter((item) => item.id === transactionId)
      : findTransactions(searchQuery);

    if (matches.length !== 1) {
      return lowConfidenceTransactionCard(matches, "Bạn muốn xóa khoản nào?", (item) => ({
        tool: "deleteExpense",
        arguments: { transactionId: item.id }
      }));
    }

    const deletedTransaction = matches[0];
    state.transactions = state.transactions.filter((item) => item.id !== deletedTransaction.id);
    const snapshots = recalculateAfterWrite(deletedTransaction.category);
    return { deletedTransaction, ...snapshots };
  },

  updateMonthlyBudget({ amount }) {
    validateAmount(amount);
    state.monthlyBudget = amount;
    const snapshots = recalculateAfterWrite();
    return { monthlyBudget: amount, ...snapshots };
  },

  updateCategoryBudget({ category, amount }) {
    validateAmount(amount);
    state.categoryBudgets[category] = amount;
    const snapshots = recalculateAfterWrite(category);
    return { categorySnapshot: snapshots.categorySnapshot, budgetSnapshot: snapshots.budgetSnapshot, warningCard: snapshots.warningCard };
  },

  markExpenseException({ transactionId, searchQuery, exceptionType }) {
    const matches = transactionId
      ? state.transactions.filter((item) => item.id === transactionId)
      : findTransactions(searchQuery);

    if (matches.length !== 1) {
      return lowConfidenceTransactionCard(matches, "Bạn muốn đánh dấu khoản nào?", (item) => ({
        tool: "markExpenseException",
        arguments: { transactionId: item.id, exceptionType }
      }));
    }

    const transaction = matches[0];
    transaction.exceptionType = exceptionType;
    transaction.excludedFromForecast = ["one_time", "debt", "refund"].includes(exceptionType);
    if (exceptionType === "debt") transaction.category = "Debt";
    transaction.updatedAt = new Date().toISOString();

    const snapshots = recalculateAfterWrite(transaction.category, transaction);
    return { transaction, ...snapshots };
  },

  getBudgetSnapshot,

  reviewUnusualExpenses({ month }) {
    const budgetSnapshotBefore = getBudgetSnapshot({ month });
    const candidates = state.transactions
      .filter((item) => item.date.startsWith(month))
      .filter((item) => item.amount >= 1000000 || item.excludedFromForecast || /học phí|trả nợ|vay/i.test(item.label))
      .map((item) => ({
        transactionId: item.id,
        label: item.label,
        amount: item.amount,
        category: item.category,
        reason: item.excludedFromForecast
          ? "Đang được loại khỏi dự báo"
          : "Khoản lớn hoặc có tính chất bất thường",
        suggestedActions: ["Đánh dấu khoản chi một lần", "Đổi danh mục", "Giữ là chi tiêu bình thường"]
      }));

    const potentialImpact = candidates.length
      ? "Nếu loại đúng các khoản một lần, dự báo cuối tháng sẽ sát thực tế hơn."
      : "Chưa thấy khoản nào đủ bất thường để cần rà soát.";

    return { candidates, budgetSnapshotBefore, potentialImpact };
  }
};

function validateAmount(amount) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("invalid_amount");
  }
}

function todayIso() {
  return state.today.toISOString().slice(0, 10);
}

function lowConfidenceTransactionCard(matches, title, buildFollowUp) {
  return {
    needsConfirmation: true,
    assistantMessage: matches.length
      ? `Mình tìm thấy ${matches.length} khoản phù hợp. ${title}`
      : "Mình chưa tìm thấy giao dịch phù hợp. Bạn mô tả rõ hơn giúp mình nhé.",
    cards: [
      {
        type: "confirmation",
        riskLevel: "low_confidence",
        title,
        actions: matches.slice(0, 4).map((item) => {
          const followUp = buildFollowUp?.(item);
          return {
            label: `${item.label} - ${money(item.amount)} (${formatDate(item.date)})`,
            actionType: followUp ? "tool_call" : "confirm_selection",
            payload: followUp || { transactionId: item.id }
          };
        })
      }
    ]
  };
}

function buildLLMContext() {
  const snapshot = getBudgetSnapshot({ month: state.month });
  return {
    currentMonth: state.month,
    monthlyBudget: snapshot.monthlyBudget,
    totalSpent: snapshot.totalSpent,
    remaining: snapshot.remaining,
    forecastEndOfMonth: snapshot.forecastEndOfMonth,
    riskLevel: snapshot.riskLevel,
    categories: snapshot.categoryBreakdown.map((item) => ({
      id: item.category,
      label: item.label,
      budget: item.budget,
      spent: item.spent,
      remaining: item.remaining,
      riskLevel: item.riskLevel
    })),
    recentTransactions: snapshot.recentTransactions.map((item) => ({
      id: item.id,
      label: item.label,
      amount: item.amount,
      category: item.category,
      date: item.date
    }))
  };
}

function mockLLMRoute(message) {
  const lower = normalizeSearch(message);
  const amount = parseAmount(message);
  const category = parseCategory(message);
  const context = buildLLMContext();

  if (/(ra soat|bat thuong|du bao sai|tai sao)/.test(lower)) {
    return { intent: "review_unusual_expenses", tool: "reviewUnusualExpenses", arguments: { month: context.currentMonth } };
  }

  if (/(con bao nhieu|con lai|du bao|nguy co|tinh trang)/.test(lower)) {
    return { intent: "get_budget_snapshot", tool: "getBudgetSnapshot", arguments: { month: context.currentMonth, category: lower.includes("an uong") ? "Food" : undefined } };
  }

  if (/(xoa|bo di|nhap nham)/.test(lower)) {
    return { intent: "delete_expense", tool: "deleteExpense", arguments: { searchQuery: message } };
  }

  if (/(sua|doi khoan|khong phai|thanh)/.test(lower) && /(khoan|taxi|an|hoc phi|hom qua|luc nay)/.test(lower)) {
    const args = { searchQuery: message };
    if (amount) args.amount = amount;
    if (/(danh muc|sang)/.test(lower)) args.category = category;
    return { intent: "update_expense", tool: "updateExpense", arguments: args };
  }

  if (/(chi mot lan|tra no|hoan tien|binh thuong|cu tinh)/.test(lower)) {
    const exceptionType = lower.includes("tra no")
      ? "debt"
      : lower.includes("binh thuong") || lower.includes("cu tinh")
        ? "normal"
        : "one_time";
    return { intent: "mark_expense_exception", tool: "markExpenseException", arguments: { searchQuery: message, exceptionType } };
  }

  if (/(ngan sach)/.test(lower) && amount) {
    if (/(an uong|di chuyen|mua sam|hoc|giai tri|hoa don|gia dinh)/.test(lower)) {
      return {
        intent: "update_category_budget",
        tool: "updateCategoryBudget",
        arguments: { category, amount, month: context.currentMonth }
      };
    }
    return { intent: "update_monthly_budget", tool: "updateMonthlyBudget", arguments: { amount, month: context.currentMonth } };
  }

  if (/(them|ghi|toi vua|khoan|chi|tra tien)/.test(lower)) {
    if (!amount) {
      return {
        intent: "low_confidence_write",
        needsConfirmation: true,
        assistantMessage: "Mình chưa đọc được số tiền. Bạn gửi lại theo mẫu như: Thêm ăn tối 80k nhé.",
        cards: []
      };
    }
    return {
      intent: "add_expense",
      tool: "addExpense",
      arguments: {
        label: parseLabel(message, category),
        amount,
        category,
        date: todayIso()
      }
    };
  }

  return {
    intent: "small_talk_or_help",
    assistantMessage: "Mình có thể thêm/sửa/xóa khoản chi, cập nhật ngân sách, rà soát giao dịch bất thường và cho bạn biết nguy cơ vượt ngân sách."
  };
}

function moniChatEndpoint({ message, userId, month }) {
  const llmDecision = mockLLMRoute(message, buildLLMContext());
  const llmTrace = {
    mode: "browser_mock",
    request: {
      message,
      userId,
      month,
      context: buildLLMContext()
    },
    response: llmDecision
  };
  if (!llmDecision.tool) {
    return {
      assistantMessage: llmDecision.assistantMessage,
      toolCalls: [],
      cards: llmDecision.cards || [],
      intent: llmDecision.intent,
      llmTrace
    };
  }

  const toolCall = {
    name: llmDecision.tool,
    arguments: { ...llmDecision.arguments, userId, month: llmDecision.arguments.month || month }
  };

  try {
    const toolResult = moniTools[llmDecision.tool](llmDecision.arguments);
    if (toolResult.needsConfirmation) {
      return { ...toolResult, toolCalls: [toolCall], intent: llmDecision.intent };
    }

    return {
      assistantMessage: assistantMessageForTool(llmDecision.tool, toolResult),
      toolCalls: [toolCall],
      cards: cardsForTool(llmDecision.tool, toolResult),
      toolResult,
      intent: llmDecision.intent,
      llmTrace
    };
  } catch (error) {
    return {
      assistantMessage: failureMessage(error.message),
      toolCalls: [toolCall],
      cards: [],
      llmTrace,
      error: { code: error.message }
    };
  }
}

async function callMoniChat({ message, userId, month }) {
  if (location.protocol === "http:" || location.protocol === "https:") {
    const response = await fetch("/api/moni/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, userId, month })
    });

    const payload = await response.json();
    if (!response.ok) {
      return {
        assistantMessage: payload.error?.message || "Server chưa xử lý được yêu cầu này.",
        toolCalls: [],
        cards: [],
        llmTrace: payload.llmTrace,
        error: payload.error
      };
    }
    return payload;
  }

  return moniChatEndpoint({ message, userId, month });
}

function syncServerState(serverState) {
  if (!serverState) return;

  if (Number.isFinite(serverState.monthlyBudget)) {
    state.monthlyBudget = serverState.monthlyBudget;
  }

  if (serverState.categoryBudgets) {
    state.categoryBudgets = {
      ...state.categoryBudgets,
      ...serverState.categoryBudgets
    };
  }

  if (Array.isArray(serverState.transactions)) {
    state.transactions = serverState.transactions;
  }

  renderAll();
}

function assistantMessageForTool(tool, result) {
  if (tool === "addExpense") {
    const item = result.transaction;
    const unusual = item.amount >= 2500000 || ["Education", "Debt"].includes(item.category);
    return unusual
      ? `Đã ghi nhận ${item.label} ${money(item.amount)} vào ${categoryLabel(item.category)}. Khoản này khá lớn, bạn có muốn đánh dấu là khoản chi một lần không?`
      : `Đã ghi nhận ${item.label} ${money(item.amount)} vào ${categoryLabel(item.category)}.`;
  }

  if (tool === "updateMonthlyBudget") {
    return `Đã cập nhật ngân sách tháng này thành ${money(result.monthlyBudget)}.`;
  }

  if (tool === "updateCategoryBudget") {
    const category = result.categorySnapshot;
    return `Đã cập nhật ngân sách ${category.label} thành ${money(category.budget)}. Hiện bạn đã chi ${money(category.spent)}, còn lại ${money(category.remaining)}.`;
  }

  if (tool === "updateExpense") {
    return `Đã cập nhật khoản ${result.transaction.label} thành ${money(result.transaction.amount)}.`;
  }

  if (tool === "deleteExpense") {
    return `Đã xóa khoản ${result.deletedTransaction.label} ${money(result.deletedTransaction.amount)}.`;
  }

  if (tool === "markExpenseException") {
    const item = result.transaction;
    return item.excludedFromForecast
      ? `Đã đánh dấu ${item.label} là ngoại lệ và loại khỏi dự báo chi tiêu thường xuyên.`
      : `Đã giữ ${item.label} là chi tiêu bình thường trong dự báo.`;
  }

  if (tool === "getBudgetSnapshot") {
    const snap = result;
    return `Tháng này bạn còn ${money(snap.remaining)}. Dự báo cuối tháng là ${money(snap.forecastEndOfMonth)}, trạng thái ${riskText(snap.riskLevel).toLowerCase()}.`;
  }

  if (tool === "reviewUnusualExpenses") {
    return result.candidates.length
      ? `Mình tìm thấy ${result.candidates.length} khoản nên rà soát vì có thể làm dự báo lệch.`
      : "Mình chưa thấy khoản bất thường rõ ràng trong tháng này.";
  }

  return "Mình đã xử lý xong yêu cầu.";
}

function cardsForTool(tool, result) {
  if (["addExpense", "updateExpense", "deleteExpense", "updateMonthlyBudget", "updateCategoryBudget", "markExpenseException"].includes(tool)) {
    return [result.warningCard].filter(Boolean);
  }

  if (tool === "getBudgetSnapshot") {
    return [generateBudgetWarningCard({ budgetSnapshot: result })];
  }

  if (tool === "reviewUnusualExpenses") {
    return [
      {
        type: "review",
        riskLevel: result.candidates.length ? "warning" : "safe",
        title: "Rà soát giao dịch",
        explanation: result.potentialImpact,
        metrics: {
          candidates: result.candidates.length,
          forecast: result.budgetSnapshotBefore.forecastEndOfMonth
        },
        candidates: result.candidates,
        actions: result.candidates.flatMap((candidate) => [
          {
            label: `Một lần: ${candidate.label}`,
            actionType: "tool_call",
            payload: {
              tool: "markExpenseException",
              arguments: { transactionId: candidate.transactionId, exceptionType: "one_time" }
            }
          },
          {
            label: `Giữ bình thường: ${candidate.label}`,
            actionType: "tool_call",
            payload: {
              tool: "markExpenseException",
              arguments: { transactionId: candidate.transactionId, exceptionType: "normal" }
            }
          }
        ])
      }
    ];
  }

  return [];
}

function failureMessage(code) {
  const messages = {
    invalid_amount: "Số tiền chưa hợp lệ. Bạn nhập lại giúp mình nhé.",
    unknown_category: "Mình chưa nhận ra danh mục này. Bạn chọn lại danh mục giúp mình nhé.",
    transaction_not_found: "Mình chưa tìm thấy giao dịch phù hợp.",
    forbidden: "Bạn không có quyền cập nhật giao dịch này."
  };
  return messages[code] || "Mình chưa xử lý được yêu cầu này. Bạn thử lại sau nhé.";
}

function riskText(risk) {
  return risk === "safe" ? "An toàn" : risk === "warning" ? "Cảnh báo" : risk === "danger" ? "Đã vượt" : "Cần xác nhận";
}

function addUserMessage(text) {
  const node = document.createElement("article");
  node.className = "message user";
  node.innerHTML = `<div class="bubble">${escapeHtml(text)}</div>`;
  chatLog.append(node);
  scrollChat();
}

function addMoniResponse(response) {
  const node = document.createElement("article");
  node.className = "message moni";
  node.innerHTML = `
    <div class="moni-message-markdown">${renderMarkdown(response.assistantMessage || "")}</div>
    ${renderLLMTrace(response.llmTrace)}
    ${renderToolTrace(response.toolCalls)}
    ${(response.cards || []).map(renderCard).join("")}
  `;
  chatLog.append(node);
  scrollChat();
}

function renderMarkdown(source) {
  const lines = escapeHtml(source).replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let listType = null;

  const closeList = () => {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      continue;
    }

    const unordered = trimmed.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      if (listType !== "ul") {
        closeList();
        html.push("<ul>");
        listType = "ul";
      }
      html.push(`<li>${renderInlineMarkdown(unordered[1])}</li>`);
      continue;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      if (listType !== "ol") {
        closeList();
        html.push("<ol>");
        listType = "ol";
      }
      html.push(`<li>${renderInlineMarkdown(ordered[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${renderInlineMarkdown(trimmed)}</p>`);
  }

  closeList();
  return html.join("");
}

function renderInlineMarkdown(text) {
  return text
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function renderLLMTrace(trace) {
  if (!trace) return "";
  return `
    <details class="tool-trace llm-trace">
      <summary>LLM trace: ${escapeHtml(trace.mode || "unknown")}</summary>
      <div class="trace-block">
        <strong>Request</strong>
        <pre>${escapeHtml(JSON.stringify(trace.request, null, 2))}</pre>
      </div>
      <div class="trace-block">
        <strong>Response</strong>
        <pre>${escapeHtml(JSON.stringify(trace.response, null, 2))}</pre>
      </div>
    </details>
  `;
}

function renderToolTrace(toolCalls = []) {
  if (!toolCalls.length) return "";
  const call = toolCalls[0];
  return `
    <details class="tool-trace">
      <summary>Tool call: ${escapeHtml(call.name)}</summary>
      <pre>${escapeHtml(JSON.stringify(call.arguments, null, 2))}</pre>
    </details>
  `;
}

function renderCard(card) {
  if (card.type === "confirmation") return renderConfirmationCard(card);
  if (card.type === "review") return renderReviewCard(card);

  const metrics = card.metrics || {};
  const metricEntries = Object.entries(metrics);
  return `
    <section class="insight-card ${card.riskLevel === "safe" ? "" : card.riskLevel}">
      <div class="card-title">
        <strong>${escapeHtml(card.title)}</strong>
        <span class="status-chip ${card.riskLevel}">${riskText(card.riskLevel)}</span>
      </div>
      ${card.explanation ? `<p class="card-explain">${escapeHtml(card.explanation)}</p>` : ""}
      ${metricEntries.length ? `<div class="budget-stats">
        ${metricEntries.map(([key, value]) => `
          <div>
            <span>${metricLabel(key)}</span>
            <strong>${typeof value === "number" ? money(value) : escapeHtml(value)}</strong>
          </div>
        `).join("")}
      </div>` : renderCardData(card.data)}
      ${renderActions(card.actions)}
    </section>
  `;
}

function renderCardData(data) {
  if (!data) return "";
  const rows = [];
  if (Array.isArray(data.topCategories)) {
    rows.push(...data.topCategories.slice(0, 4).map((item) => ({
      label: item.label,
      value: money(item.spent)
    })));
  }
  if (data.impact) {
    rows.push(
      { label: "Chi thêm", value: money(data.impact.additionalSpent) },
      { label: "Dự báo đổi", value: money(data.impact.forecastChange) },
      { label: "Vượt dự kiến", value: money(data.impact.overBudgetAmount) }
    );
  }
  if (data.safeToSpendScore !== undefined) {
    rows.push(
      { label: "Safe score", value: `${data.safeToSpendScore}/100` },
      { label: "Khoản mua", value: money(data.purchaseAmount || 0) },
      { label: "Còn tháng", value: money(data.remainingBudget || 0) },
      { label: "Dự báo sau mua", value: money(data.forecastAfterPurchase || 0) }
    );
  }
  if (!rows.length) return "";
  return `
    <div class="budget-stats">
      ${rows.map((row) => `
        <div>
          <span>${escapeHtml(row.label)}</span>
          <strong>${escapeHtml(row.value)}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function renderReviewCard(card) {
  return `
    <section class="insight-card ${card.riskLevel}">
      <div class="card-title">
        <strong>${escapeHtml(card.title)}</strong>
        <span class="status-chip ${card.riskLevel}">${riskText(card.riskLevel)}</span>
      </div>
      <p class="card-explain">${escapeHtml(card.explanation || "")}</p>
      <div class="review-list">
        ${(card.candidates || []).map((item) => `
          <article>
            <strong>${escapeHtml(item.label)}</strong>
            <span>${money(item.amount)} • ${categoryLabel(item.category)}</span>
            <p>${escapeHtml(item.reason)}</p>
          </article>
        `).join("") || "<p>Không có khoản cần rà soát.</p>"}
      </div>
      ${renderActions(card.actions)}
    </section>
  `;
}

function renderConfirmationCard(card) {
  return `
    <section class="confirm-card">
      <h3>${escapeHtml(card.title)}</h3>
      <div class="confirm-options">
        ${(card.actions || []).map((action) => `
          <button type="button" data-action='${escapeHtml(JSON.stringify(action))}'>${escapeHtml(action.label)}</button>
        `).join("") || "<p>Không có lựa chọn phù hợp.</p>"}
      </div>
    </section>
  `;
}

function renderActions(actions = []) {
  if (!actions.length) return "";
  return `
    <div class="actions">
      ${actions.map((action) => `
        <button type="button" data-action='${escapeHtml(JSON.stringify(action))}'>${escapeHtml(action.label)}</button>
      `).join("")}
    </div>
  `;
}

function metricLabel(key) {
  const labels = {
    budget: "Budget",
    spent: "Spent",
    remaining: "Remaining",
    forecast: "Forecast",
    candidates: "Khoản cần xem"
  };
  return labels[key] || key;
}

async function handleMessage(text) {
  addUserMessage(text);
  const response = await callMoniChat({ message: text, userId: state.userId, month: state.month });
  syncServerState(response.serverState);
  addMoniResponse(response);
}

function executeAction(action) {
  if (action.actionType === "open_dashboard") {
    switchScreen("budgetScreen");
    return;
  }

  if (action.actionType === "prompt") {
    chatInput.value = action.payload?.message || "";
    chatInput.focus();
    return;
  }

  if (action.actionType === "confirm_selection") {
    chatInput.value = `Sửa giao dịch ${action.payload.transactionId}`;
    chatInput.focus();
    return;
  }

  if (action.actionType === "tool_call") {
    const tool = action.payload.tool;
    const args = action.payload.arguments || {};
    const result = moniTools[tool](args);
    addMoniResponse({
      assistantMessage: assistantMessageForTool(tool, result),
      toolCalls: [{ name: tool, arguments: args }],
      cards: cardsForTool(tool, result)
    });
  }
}

function renderAll() {
  renderDashboard();
  renderCategories();
  renderTransactions();
  renderChart();
}

function renderDashboard() {
  const snap = getBudgetSnapshot({ month: state.month });
  const progress = Math.min((snap.totalSpent / state.monthlyBudget) * 100, 100);
  const progressColor = snap.riskLevel === "safe" ? "var(--green)" : snap.riskLevel === "warning" ? "var(--yellow)" : "var(--red)";

  document.querySelector("#daysLeftLabel").textContent = `Còn ${daysLeft()} ngày`;
  document.querySelector("#dashboardBudget").textContent = money(state.monthlyBudget);
  document.querySelector("#dashboardSpent").textContent = money(snap.totalSpent);
  document.querySelector("#dashboardRemaining").textContent = money(snap.remaining);
  document.querySelector("#dashboardForecast").textContent = money(snap.forecastEndOfMonth);
  document.querySelector("#dashboardDaily").textContent = money(snap.recommendedDailySpend);
  document.querySelector("#dashboardRisk").textContent = riskText(snap.riskLevel);
  document.querySelector("#dashboardRisk").className = `status-chip ${snap.riskLevel}`;
  document.querySelector("#budgetProgress").style.width = `${progress}%`;
  document.querySelector("#budgetProgress").style.background = progressColor;
}

function renderCategories() {
  const items = getBudgetSnapshot({ month: state.month }).categoryBreakdown
    .filter((item) => item.spent > 0 || item.budget > 0)
    .sort((a, b) => a.label.localeCompare(b.label, "vi"));

  document.querySelector("#categoryList").innerHTML = items.map((item) => {
    const meta = categories[item.category] || categories.Other;
    const label = item.remaining < 0 ? `Vượt ${money(Math.abs(item.remaining))}` : `Còn lại ${money(item.remaining)}`;
    const chip = item.remaining < 0
      ? "Đã vượt"
      : item.riskLevel === "danger"
        ? "Dự báo vượt"
        : item.riskLevel === "warning"
          ? "Gần hết"
          : "Ổn định";
    return `
      <article class="category-card">
        <span class="cat-icon ${meta.colorClass}">${meta.icon}</span>
        <div>
          <h3>${item.label}</h3>
          <p>Hạn mức: ${money(item.budget)}</p>
          <strong class="${item.riskLevel === "danger" ? "danger-text" : ""}">${label}</strong>
        </div>
        <span class="status-chip ${item.riskLevel} cat-state">${chip}</span>
      </article>
    `;
  }).join("");
}

function renderTransactions() {
  document.querySelector("#transactionList").innerHTML = state.transactions.slice(0, 6).map((item) => `
    <article class="transaction-mini">
      <div>
        <strong>${escapeHtml(item.label)}</strong>
        <span>${categoryLabel(item.category)}${item.excludedFromForecast ? " • ngoại lệ" : ""}</span>
      </div>
      <strong>-${money(item.amount)}</strong>
    </article>
  `).join("");
}

function categoryTotals() {
  return state.transactions.reduce((map, item) => {
    map[item.category] = (map[item.category] || 0) + item.amount;
    return map;
  }, {});
}

function renderChart() {
  const totals = categoryTotals();
  const max = Math.max(...Object.values(totals), 1);
  document.querySelector("#categoryChart").innerHTML = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key, value]) => `
      <div class="chart-row">
        <strong>${categoryLabel(key)}</strong>
        <span class="chart-track"><span style="width: ${(value / max) * 100}%"></span></span>
        <span>${shortMoney(value)}</span>
      </div>
    `).join("");
}

function switchScreen(id) {
  screens.forEach((screen) => screen.classList.toggle("active", screen.id === id));
  tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.target === id));
}

function scrollChat() {
  chatLog.scrollTop = chatLog.scrollHeight;
}

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = "";
  handleMessage(text);
});

document.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-action]");
  if (actionButton) {
    executeAction(JSON.parse(actionButton.dataset.action));
    return;
  }

  const nav = event.target.closest("[data-nav]");
  if (nav) switchScreen(nav.dataset.nav);
});

tabs.forEach((tab) => tab.addEventListener("click", () => switchScreen(tab.dataset.target)));
document.querySelector("#backToChat").addEventListener("click", () => switchScreen("chatScreen"));
document.querySelector("#reviewTransactions").addEventListener("click", () => {
  switchScreen("chatScreen");
  handleMessage("Rà soát giao dịch bất thường");
});
document.querySelector("#seedWarning").addEventListener("click", () => {
  switchScreen("chatScreen");
  chatInput.value = "Thêm học phí 3 triệu";
  chatInput.focus();
});

async function seedChat() {
  chatLog.innerHTML = `<div class="date-stamp">04/06/2026, 09:32</div>`;
  await handleMessage("Thêm khoản ăn tối 80k");
  await handleMessage("Cập nhật ngân sách ăn uống của tôi lên 3 triệu");
}

renderAll();
seedChat();
