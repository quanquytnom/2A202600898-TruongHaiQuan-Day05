# Moni Budget Copilot Prototype

## Chay server

Tu thu muc goc cua repo:

```powershell
npm install
npm start
```

Mo trinh duyet:

```text
http://localhost:5173
```

Neu port `5173` dang ban:

```powershell
$env:PORT=5174
npm start
```

## Cau hinh OpenAI

Tao file `.env` o thu muc goc repo:

```env
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4.1-mini
```

Neu khong co `OPENAI_API_KEY`, server tu dung mock routing de prototype van chay duoc.

## Xem log

Server in log truc tiep trong terminal dang chay `npm start`:

- `[Moni LLM request]`: request gui vao buoc chon tool.
- `[Moni LLM response]`: response chon tool cua LLM hoac mock router.
- Tool result va final response nam trong `llmTrace` cua response API.

Trong UI, mo panel trace/log neu dang bat hien thi de xem:

- tool da goi
- arguments
- tool result
- final assistant response

Co the test API bang PowerShell:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:5173/api/moni/chat -ContentType "application/json" -Body '{"message":"Tôi có nên mua tai nghe 1.5 triệu không?","userId":"demo_user","month":"2026-06"}'
```

## Cau truc prototype

```text
prototype/
  index.html
  styles.css
  app.js
  server.js
  server/
    env.js
    http.js
    openaiClient.js
    prompts.js
    toolSchemas.js
```

`server.js` giu business logic demo va tool execution. Thu muc `server/` chua cac helper tach rieng cho env, HTTP, prompt, OpenAI client va tool schema.

## Chia viec moi nguoi mot commit

De dua prototype sang repo khac va moi nguoi co dung mot commit, chi chia scope trong thu muc `prototype/`.

1. Tran Quang Huy - 2A202601010
   - Scope: backend chinh, tool-calling flow, OpenAI client, prompt, tool schema va API contract.
   - Files: `prototype/server.js`, `prototype/server/*`, `prototype/moni-chat-backend.example.js`.
   - Commit: `feat: build Moni backend tool-calling flow`

2. Truong Hai Quan - 2A202600898
   - Scope: frontend app logic, chat actions, sync server state, render cards va trace/log trong UI.
   - Files: `prototype/app.js`.
   - Commit: `feat: connect Moni chat UI with backend responses`

3. Bui Minh Hieu - 2A202600876
   - Scope: giao dien, layout, responsive style, assistant Markdown style va dashboard visual polish.
   - Files: `prototype/index.html`, `prototype/styles.css`.
   - Commit: `feat: polish Moni prototype interface`

4. Nguyen Si Viet - 2A202600658
   - Scope: demo scenarios, huong dan chay, test manual cac flow ngan sach va purchase advisor.
   - Files: `prototype/README.md`.
   - Commit: `docs: add Moni prototype run guide and scenarios`

Neu can set author khi commit:

```powershell
git commit --author="Tran Quang Huy <2A202601010@example.com>" -m "feat: build Moni backend tool-calling flow"
```

Lap lai voi tung nguoi va chi stage dung file trong scope cua nguoi do.
