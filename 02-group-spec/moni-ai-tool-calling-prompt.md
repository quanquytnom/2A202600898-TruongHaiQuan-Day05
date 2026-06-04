# Prompt - Moni Budget Copilot AI + Tool Calling

Bạn là product designer, fintech AI UX architect và technical architect. Hãy thiết kế tiếp prototype **Moni Budget Copilot** trong app tài chính cá nhân theo hướng chat-first, có thể nối với LLM thật qua tool calling, nhưng vẫn giữ toàn bộ phép tính và thao tác dữ liệu ở backend/tool layer.

## 1. Bối cảnh sản phẩm

Prototype hiện tại là chatbot quản lý ngân sách qua chat. User có thể nhập:

- `Thêm khoản ăn tối 80k`
- `Tăng ngân sách tháng này lên 12 triệu`
- `Thêm học phí 3 triệu`
- `Cập nhật ngân sách ăn uống của tôi lên 3 triệu`

Prototype đã có logic mock:

- Parse khoản chi từ chat.
- Thêm transaction.
- Tính lại monthly budget, total spent, remaining, daily spending rate, forecast cuối tháng và risk level.
- Hiển thị trạng thái safe / warning / over budget.
- Phát hiện khoản bất thường như học phí, trả nợ hoặc khoản lớn.
- Cho user đánh dấu khoản bất thường là `Khoản chi một lần` để loại khỏi forecasting.

Mục tiêu của spec này là biến mock logic thành kiến trúc AI + tool-calling rõ ràng để sau này có thể thay parser mock bằng LLM thật mà không phá vỡ UI hoặc business rules.

## 2. Nguyên tắc AI

LLM không tự ghi dữ liệu tài chính và không tự tính toán ngân sách bằng lời. Mọi thay đổi dữ liệu và mọi con số ngân sách phải đến từ tool/backend.

LLM chịu trách nhiệm:

- Hiểu câu chat tự do của user.
- Xác định intent.
- Trích xuất entity: amount, category, date, transaction reference, exception type.
- Chọn tool phù hợp.
- Không gọi write tool nếu thiếu dữ liệu quan trọng hoặc độ tin cậy thấp.
- Đọc kết quả tool trả về.
- Giải thích lại cho user bằng ngôn ngữ tự nhiên, ngắn gọn và dễ hiểu.
- Đề xuất hành động tiếp theo dựa trên card/actions do backend trả về.

Backend/tool layer chịu trách nhiệm:

- Thêm, sửa, xóa giao dịch.
- Cập nhật ngân sách tổng tháng.
- Cập nhật ngân sách theo danh mục.
- Đánh dấu khoản chi là ngoại lệ.
- Truy xuất dữ liệu chi tiêu và ngân sách của user.
- Tính lại budget snapshot và category snapshot.
- Xác định risk level.
- Tạo safe card / warning card / over-budget card / low-confidence confirmation card.
- Kiểm soát quyền, validation, logging và cấu hình OpenAI.

## 3. Luồng xử lý tổng quát

1. Frontend gửi message đến backend endpoint `POST /api/moni/chat`.
2. Backend lấy context tóm tắt của user: month, budget snapshot, category summary, recent transactions.
3. Backend gọi LLM kèm system prompt, tool schema và context tóm tắt.
4. LLM xác định intent và gọi tool nếu đủ chắc chắn.
5. Backend thực thi tool call bằng business logic nội bộ.
6. Với write tool, backend tự recalculation và card generation.
7. Backend trả tool result về LLM để LLM soạn assistant message.
8. Backend trả về frontend một response chuẩn gồm `assistantMessage`, `toolCalls`, `cards`, `actions` và optional `confirmation`.
9. Frontend render chat message và card trong luồng chat-first.

## 4. Flow ví dụ

User nhắn:

```text
cập nhật ngân sách ăn uống của tôi lên 3 triệu
```

LLM nhận diện:

```json
{
  "intent": "update_category_budget",
  "category": "Food",
  "amount": 3000000,
  "month": "2026-06"
}
```

LLM gọi tool:

```js
updateCategoryBudget({
  category: "Food",
  amount: 3000000,
  month: "2026-06"
})
```

Tool cập nhật dữ liệu ngân sách và trả snapshot mới:

- category budget
- category spent
- category remaining
- monthly budget
- total spent
- forecast
- risk level
- recommended actions

LLM dùng kết quả tool để trả lời:

```text
Đã cập nhật ngân sách Ăn uống thành 3.000.000đ.
Hiện bạn đã chi 2.440.000đ cho Ăn uống, còn lại 560.000đ.
Nếu giữ tốc độ hiện tại, danh mục này vẫn có nguy cơ vượt nhẹ vào cuối tháng.
```

## 5. Tool list và schema

### 5.1 addExpense

Dùng khi user muốn thêm khoản chi.

Input:

```ts
{
  label: string;
  amount: number;
  category: string;
  date?: string;
  note?: string;
}
```

Output:

```ts
{
  transaction: Transaction;
  budgetSnapshot: BudgetSnapshot;
  categorySnapshot?: CategorySnapshot;
  warningCard?: BudgetCard;
}
```

Ví dụ:

- `Thêm khoản ăn tối 80k`
- `Tôi vừa trả tiền taxi 120 nghìn`
- `Ghi nhận học phí 3 triệu`

### 5.2 updateExpense

Dùng khi user muốn sửa khoản chi đã thêm.

Input:

```ts
{
  transactionId?: string;
  searchQuery?: string;
  amount?: number;
  category?: string;
  label?: string;
  date?: string;
}
```

Output:

```ts
{
  transaction: Transaction;
  budgetSnapshot: BudgetSnapshot;
  categorySnapshot?: CategorySnapshot;
  warningCard?: BudgetCard;
}
```

Ví dụ:

- `Khoản ăn tối lúc nãy là 100k không phải 80k`
- `Đổi khoản taxi hôm qua sang danh mục di chuyển`
- `Sửa học phí thành 2 triệu rưỡi`

### 5.3 deleteExpense

Dùng khi user muốn xóa giao dịch.

Input:

```ts
{
  transactionId?: string;
  searchQuery?: string;
}
```

Output:

```ts
{
  deletedTransaction: Transaction;
  budgetSnapshot: BudgetSnapshot;
  categorySnapshot?: CategorySnapshot;
  warningCard?: BudgetCard;
}
```

Ví dụ:

- `Xóa khoản ăn tối vừa rồi`
- `Giao dịch học phí bị nhập nhầm, bỏ đi`

### 5.4 updateMonthlyBudget

Dùng khi user muốn cập nhật ngân sách tổng tháng.

Input:

```ts
{
  amount: number;
  month: string;
}
```

Output:

```ts
{
  monthlyBudget: number;
  budgetSnapshot: BudgetSnapshot;
  warningCard?: BudgetCard;
}
```

Ví dụ:

- `Tăng ngân sách tháng này lên 12 triệu`
- `Đặt ngân sách tháng 6 là 10 triệu`
- `Giảm ngân sách tổng còn 8 triệu`

### 5.5 updateCategoryBudget

Dùng khi user muốn cập nhật ngân sách theo danh mục.

Input:

```ts
{
  category: string;
  amount: number;
  month: string;
}
```

Output:

```ts
{
  categorySnapshot: CategorySnapshot;
  budgetSnapshot: BudgetSnapshot;
  warningCard?: BudgetCard;
}
```

Ví dụ:

- `Cập nhật ngân sách ăn uống của tôi lên 3 triệu`
- `Đổi ngân sách di chuyển thành 1 triệu`
- `Cho mua sắm còn 2 triệu thôi`

### 5.6 markExpenseException

Dùng khi user đánh dấu khoản chi là ngoại lệ.

Input:

```ts
{
  transactionId?: string;
  searchQuery?: string;
  exceptionType: "one_time" | "debt" | "refund" | "wrong_category" | "normal";
}
```

Output:

```ts
{
  transaction: Transaction;
  budgetSnapshot: BudgetSnapshot;
  categorySnapshot?: CategorySnapshot;
  warningCard?: BudgetCard;
}
```

Ví dụ:

- `Khoản học phí là chi một lần`
- `Khoản này là trả nợ`
- `Đây là chi tiêu bình thường, cứ tính vào dự báo`

### 5.7 getBudgetSnapshot

Dùng khi user hỏi tình trạng ngân sách.

Input:

```ts
{
  month: string;
  category?: string;
}
```

Output:

```ts
{
  monthlyBudget: number;
  totalSpent: number;
  remaining: number;
  dailySpendingRate: number;
  forecastEndOfMonth: number;
  riskLevel: "safe" | "warning" | "danger";
  recommendedDailySpend: number;
  categoryBreakdown: CategorySnapshot[];
  recentTransactions: Transaction[];
}
```

Ví dụ:

- `Tháng này tôi còn bao nhiêu tiền để chi?`
- `Ăn uống còn bao nhiêu?`
- `Tôi có nguy cơ vượt ngân sách không?`

### 5.8 reviewUnusualExpenses

Dùng khi user bấm `Rà soát giao dịch` hoặc hỏi các khoản bất thường.

Input:

```ts
{
  month: string;
}
```

Output:

```ts
{
  candidates: Array<{
    transactionId: string;
    label: string;
    amount: number;
    category: string;
    reason: string;
    suggestedActions: string[];
  }>;
  budgetSnapshotBefore: BudgetSnapshot;
  potentialImpact: string;
}
```

Ví dụ:

- `Rà soát giao dịch bất thường`
- `Khoản nào đang làm dự báo sai?`
- `Tại sao Moni báo tôi sắp vượt ngân sách?`

### 5.9 generateBudgetWarningCard

Dùng sau mỗi hành động làm thay đổi dữ liệu tài chính. Đây có thể là internal tool/service, không nhất thiết expose trực tiếp cho LLM nếu backend đã tự gọi.

Input:

```ts
{
  budgetSnapshot: BudgetSnapshot;
  categorySnapshot?: CategorySnapshot;
  triggerTransaction?: Transaction;
}
```

Output:

```ts
{
  cardType: "safe" | "warning" | "danger" | "low_confidence";
  title: string;
  metrics: Record<string, number | string>;
  explanation: string;
  recommendedActions: string[];
}
```

## 6. Intent mapping

| User intent | Ví dụ | Tool |
| --- | --- | --- |
| `add_expense` | `Thêm khoản ăn tối 80k` | `addExpense` |
| `update_expense` | `Khoản taxi hôm qua là 150k` | `updateExpense` |
| `delete_expense` | `Xóa khoản ăn tối vừa rồi` | `deleteExpense` |
| `update_monthly_budget` | `Đặt ngân sách tháng này là 12 triệu` | `updateMonthlyBudget` |
| `update_category_budget` | `Cập nhật ngân sách ăn uống lên 3 triệu` | `updateCategoryBudget` |
| `mark_expense_exception` | `Khoản học phí là chi một lần` | `markExpenseException` |
| `get_budget_snapshot` | `Tháng này tôi còn bao nhiêu?` | `getBudgetSnapshot` |
| `review_unusual_expenses` | `Khoản nào đang làm dự báo sai?` | `reviewUnusualExpenses` |
| `small_talk_or_help` | `Moni giúp gì được?` | Không gọi write tool, trả lời hướng dẫn ngắn |
| `low_confidence_write` | `Sửa khoản hôm qua thành 200k` khi có nhiều khoản | Confirmation card, chưa gọi write tool |

## 7. Confidence rules

LLM không gọi write tool nếu thiếu một trong các dữ liệu bắt buộc:

- `amount` cho các intent thêm/sửa ngân sách/sửa số tiền.
- `category` cho cập nhật ngân sách danh mục.
- `transactionId` hoặc `searchQuery` đủ rõ cho sửa/xóa/đánh dấu ngoại lệ.
- `month` cho các thao tác ngân sách theo tháng.

Khi độ tin cậy thấp:

- Backend/LLM trả confirmation card thay vì gọi write tool.
- Confirmation card phải nêu rõ các lựa chọn và dữ liệu đang thiếu.
- User chọn một option thì frontend gửi lại lựa chọn đó như một message/action mới.

Ví dụ:

```text
User: Sửa khoản hôm qua thành 200k
Moni: Mình tìm thấy 3 khoản hôm qua. Bạn muốn sửa khoản nào?
```

Nếu expense lớn hoặc bất thường:

- Có thể ghi nhận giao dịch trước nếu amount/category/date đủ rõ.
- Sau đó tạo warning/low-confidence card hỏi có phải khoản chi một lần, trả nợ hoặc ngoại lệ không.
- Nếu user xác nhận, gọi `markExpenseException`.

## 8. Recalculation rules

Sau các write tool sau:

- `addExpense`
- `updateExpense`
- `deleteExpense`
- `updateMonthlyBudget`
- `updateCategoryBudget`
- `markExpenseException`

Backend phải tự động:

1. Recalculate `BudgetSnapshot`.
2. Recalculate `CategorySnapshot` nếu có category liên quan.
3. Loại các transaction có exception phù hợp khỏi forecast nếu business rule yêu cầu.
4. Determine `riskLevel`.
5. Generate card nếu cần.
6. Trả kết quả về LLM.
7. LLM phản hồi user kèm message, card và action buttons.

Risk level đề xuất:

- `safe`: forecast cuối tháng <= 90% monthly budget.
- `warning`: forecast > 90% và <= 100% monthly budget, hoặc category sắp vượt.
- `danger`: total spent hoặc forecast > monthly/category budget.
- `low_confidence`: thiếu dữ liệu để write an toàn hoặc có nhiều transaction match.

## 9. Card generation rules

Card là output có cấu trúc để frontend render nhất quán. LLM chỉ viết lời giải thích, không tự bịa metric.

Card màu:

- Green = `safe`
- Yellow = `warning`
- Red = `danger`
- Neutral / bordered = `low_confidence`

Action buttons:

1. `Xem chi tiết`: gọi `getBudgetSnapshot` hoặc mở dashboard detail.
2. `Điều chỉnh ngân sách`: mở flow chọn ngân sách tổng/danh mục, sau đó gọi `updateMonthlyBudget` hoặc `updateCategoryBudget`.
3. `Rà soát giao dịch`: gọi `reviewUnusualExpenses`.
4. `Đánh dấu khoản chi một lần`: gọi `markExpenseException`.
5. `Đổi danh mục`: gọi `updateExpense`.

Card response shape đề xuất:

```ts
{
  type: "budget" | "category_budget" | "transaction" | "review" | "confirmation";
  riskLevel: "safe" | "warning" | "danger" | "low_confidence";
  title: string;
  metrics?: Record<string, number | string>;
  explanation?: string;
  actions: Array<{
    label: string;
    actionType: "tool_call" | "open_dashboard" | "confirm_selection";
    payload?: Record<string, unknown>;
  }>;
}
```

## 10. Data context cho LLM

LLM chỉ nhận context tóm tắt, không nhận toàn bộ database:

```json
{
  "currentMonth": "2026-06",
  "monthlyBudget": 10000000,
  "totalSpent": 7200000,
  "remaining": 2800000,
  "forecastEndOfMonth": 14400000,
  "riskLevel": "warning",
  "categories": [
    {
      "id": "Food",
      "label": "Ăn uống",
      "budget": 2000000,
      "spent": 3240000,
      "remaining": -1240000,
      "riskLevel": "danger"
    }
  ],
  "recentTransactions": [
    {
      "id": "tx_001",
      "label": "Ăn tối",
      "amount": 80000,
      "category": "Food",
      "date": "2026-06-15"
    }
  ]
}
```

LLM không được tự ý chỉnh sửa context này. Mọi thay đổi phải thông qua tool.

## 11. Data model cần có

```ts
type Transaction = {
  id: string;
  userId: string;
  label: string;
  amount: number;
  category: string;
  date: string;
  note?: string;
  exceptionType?: "one_time" | "debt" | "refund" | "wrong_category" | "normal";
  excludedFromForecast?: boolean;
  createdAt: string;
  updatedAt: string;
};

type MonthlyBudget = {
  userId: string;
  month: string;
  amount: number;
  updatedAt: string;
};

type CategoryBudget = {
  userId: string;
  month: string;
  category: string;
  amount: number;
  updatedAt: string;
};

type CategorySnapshot = {
  category: string;
  label: string;
  budget: number;
  spent: number;
  remaining: number;
  forecastEndOfMonth: number;
  riskLevel: "safe" | "warning" | "danger";
};

type BudgetSnapshot = {
  month: string;
  monthlyBudget: number;
  totalSpent: number;
  remaining: number;
  dailySpendingRate: number;
  forecastEndOfMonth: number;
  recommendedDailySpend: number;
  riskLevel: "safe" | "warning" | "danger";
  categoryBreakdown: CategorySnapshot[];
  recentTransactions: Transaction[];
};

type BudgetCard = {
  type: "budget" | "category_budget" | "transaction" | "review" | "confirmation";
  riskLevel: "safe" | "warning" | "danger" | "low_confidence";
  title: string;
  metrics?: Record<string, number | string>;
  explanation?: string;
  actions: Array<{
    label: string;
    actionType: "tool_call" | "open_dashboard" | "confirm_selection";
    payload?: Record<string, unknown>;
  }>;
};
```

## 12. UI behavior

- Chat là giao diện chính.
- Dashboard `Ngân sách` là màn hỗ trợ để xem chi tiết và chỉnh cấu hình.
- Sau mỗi write tool, Moni phản hồi bằng message + card.
- Card luôn hiển thị metric lấy từ backend.
- Action button gửi payload có cấu trúc thay vì chỉ gửi text tự do nếu frontend đã biết action.
- Confirmation card không thay đổi dữ liệu cho tới khi user xác nhận.

## 13. OpenAI configuration

Dự án có thể khai báo biến môi trường trong file `.env`:

```env
OPENAI_API_KEY=...
OPENAI_MODEL=...
```

Khi triển khai AI thật, backend phải đọc model và API key từ biến môi trường, không hard-code trong source code.

Yêu cầu:

1. Đọc API key từ:

```js
process.env.OPENAI_API_KEY
```

2. Đọc model từ:

```js
process.env.OPENAI_MODEL
```

3. Nếu thiếu `OPENAI_API_KEY`:
   - Không gọi OpenAI API.
   - Trả lỗi cấu hình rõ ràng: `Thiếu OPENAI_API_KEY trong file .env`.

4. Nếu thiếu `OPENAI_MODEL`:
   - Dùng fallback an toàn: `gpt-4.1-mini`.
   - Hoặc trả lỗi cấu hình nếu team muốn bắt buộc cấu hình model.

5. Không expose `OPENAI_API_KEY` ra frontend.
   - Prototype frontend chỉ gọi backend endpoint nội bộ, ví dụ `POST /api/moni/chat`.

6. Backend chịu trách nhiệm:
   - Load `.env`.
   - Gọi OpenAI.
   - Đăng ký tools.
   - Thực thi tool call.
   - Trả về message + card data cho frontend.

7. Frontend không gọi OpenAI trực tiếp bằng API key.

Ví dụ backend setup:

```js
import OpenAI from "openai";
import "dotenv/config";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("Thiếu OPENAI_API_KEY trong file .env");
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
```

## 14. API contract đề xuất

Endpoint:

```text
POST /api/moni/chat
```

Request:

```json
{
  "message": "cập nhật ngân sách ăn uống của tôi lên 3 triệu",
  "userId": "demo_user",
  "month": "2026-06"
}
```

Response:

```json
{
  "assistantMessage": "Đã cập nhật ngân sách Ăn uống thành 3.000.000đ.",
  "toolCalls": [
    {
      "name": "updateCategoryBudget",
      "arguments": {
        "category": "Food",
        "amount": 3000000,
        "month": "2026-06"
      }
    }
  ],
  "cards": [
    {
      "type": "category_budget",
      "riskLevel": "warning",
      "title": "Ngân sách Ăn uống",
      "metrics": {
        "budget": 3000000,
        "spent": 2440000,
        "remaining": 560000
      },
      "actions": [
        {
          "label": "Xem chi tiết",
          "actionType": "open_dashboard",
          "payload": {
            "category": "Food"
          }
        },
        {
          "label": "Rà soát giao dịch",
          "actionType": "tool_call",
          "payload": {
            "tool": "reviewUnusualExpenses",
            "arguments": {
              "month": "2026-06"
            }
          }
        },
        {
          "label": "Điều chỉnh ngân sách",
          "actionType": "open_dashboard",
          "payload": {
            "flow": "edit_category_budget",
            "category": "Food"
          }
        }
      ]
    }
  ]
}
```

## 15. Failure paths

Thiếu `OPENAI_API_KEY`:

```json
{
  "error": {
    "code": "missing_openai_api_key",
    "message": "Thiếu OPENAI_API_KEY trong file .env"
  }
}
```

LLM không chắc giao dịch cần sửa:

```json
{
  "assistantMessage": "Mình tìm thấy nhiều khoản phù hợp. Bạn muốn sửa khoản nào?",
  "cards": [
    {
      "type": "confirmation",
      "riskLevel": "low_confidence",
      "title": "Chọn giao dịch",
      "actions": [
        {
          "label": "Ăn tối - 80.000đ",
          "actionType": "confirm_selection",
          "payload": {
            "transactionId": "tx_001"
          }
        }
      ]
    }
  ]
}
```

Tool validation lỗi:

- Amount <= 0: trả `invalid_amount`.
- Category không tồn tại: trả `unknown_category` kèm category suggestions.
- Month sai format: trả `invalid_month`.
- Transaction không tìm thấy: trả `transaction_not_found`.
- User không có quyền với transaction: trả `forbidden`.

OpenAI API lỗi hoặc timeout:

- Backend không ghi dữ liệu.
- Trả message fallback: `Mình chưa xử lý được yêu cầu này. Bạn thử lại sau nhé.`
- Ghi log nội bộ không chứa API key hoặc dữ liệu nhạy cảm quá mức.

## 16. Example conversations

### Thêm khoản chi bình thường

```text
User: Thêm khoản ăn tối 80k
Moni: Đã ghi nhận Ăn tối 80.000đ vào Ăn uống.
Card: Chi tiêu tháng này - còn lại 2.720.000đ - trạng thái warning.
```

Tool call:

```js
addExpense({
  label: "Ăn tối",
  amount: 80000,
  category: "Food",
  date: "2026-06-04"
})
```

### Khoản chi bất thường

```text
User: Thêm học phí 3 triệu
Moni: Đã ghi nhận Học phí 3.000.000đ. Khoản này khá lớn so với chi tiêu thường ngày. Đây có phải khoản chi một lần không?
Card actions: Đánh dấu khoản chi một lần, Đổi danh mục, Xem chi tiết
```

Tool call:

```js
addExpense({
  label: "Học phí",
  amount: 3000000,
  category: "Education",
  date: "2026-06-04"
})
```

### Hỏi ngân sách còn lại

```text
User: Tháng này tôi còn bao nhiêu tiền để chi?
Moni: Tháng này bạn còn 2.800.000đ. Với tốc độ hiện tại, dự báo cuối tháng là 14.400.000đ nên đang có nguy cơ vượt ngân sách.
```

Tool call:

```js
getBudgetSnapshot({
  month: "2026-06"
})
```

### Sửa giao dịch thiếu rõ ràng

```text
User: Sửa khoản hôm qua thành 200k
Moni: Mình tìm thấy 3 khoản hôm qua. Bạn muốn sửa khoản nào?
Card: Chọn giao dịch
```

Không gọi write tool cho tới khi user chọn transaction.

## 17. Cách nối prototype hiện tại với LLM thật

Giai đoạn 1 - Chuẩn hóa mock tool layer:

- Tách parser mock hiện tại khỏi business logic.
- Đóng gói các thao tác hiện có thành function cùng tên với tool schema.
- Mọi function write đều trả `budgetSnapshot`, optional `categorySnapshot` và optional `warningCard`.
- Frontend đọc card data thay vì tự suy luận risk/message.

Giai đoạn 2 - Thêm backend endpoint:

- Tạo `POST /api/moni/chat`.
- Endpoint nhận message, userId, month.
- Endpoint lấy context tóm tắt từ data store/mock store.
- Endpoint dùng mock intent parser trước nếu chưa bật OpenAI.
- Response vẫn giữ cùng contract để frontend không cần đổi lớn.

Giai đoạn 3 - Bật OpenAI tool calling:

- Load `.env` ở backend.
- Khởi tạo OpenAI client bằng `process.env.OPENAI_API_KEY`.
- Dùng `process.env.OPENAI_MODEL || "gpt-4.1-mini"`.
- Đăng ký tool schema tương ứng các function backend.
- Thực thi tool calls ở backend, không ở frontend.
- Trả tool results lại cho model để sinh assistant message.

Giai đoạn 4 - Hardening:

- Thêm validation cho amount, month, category và transaction ownership.
- Thêm confirmation flow cho low-confidence write.
- Thêm audit log cho write tool.
- Thêm test cho recalculation và risk card.
- Không log hoặc expose `OPENAI_API_KEY`.

## 18. Security requirements

- Không commit giá trị thật của `OPENAI_API_KEY`.
- `.env` phải nằm trong `.gitignore`.
- Dùng `.env.example` với key giả:

```env
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4.1-mini
```

- Frontend chỉ gọi backend nội bộ.
- Backend là nơi duy nhất gọi OpenAI API.
- Response gửi về frontend không bao gồm prompt nội bộ, raw API key hoặc dữ liệu tài chính ngoài phạm vi cần hiển thị.
