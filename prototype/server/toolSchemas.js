function schema(required, props) {
  return {
    type: "object",
    additionalProperties: false,
    required,
    properties: Object.fromEntries(Object.entries(props).map(([key, type]) => [key, { type }]))
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

module.exports = {
  toolSchemas
};
