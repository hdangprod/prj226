---
title: "Spec: Telegram Bot Notion Second Brain Orchestrator"
version: 1.1.0
date: 2026-06-20
type: specification
---

# Spec: Telegram Bot Notion Second Brain Orchestrator

## Objective
Create a serverless Telegram Bot written in TypeScript, integrated with the Gemini API to manage a 5-database Notion Second Brain system (based on PARA methodology: Tasks, Projects, Areas, Resources, Daily Logs). The bot acts as a conversational productivity assistant that allows the user to manage daily tasks, capture resources, and track performance metrics seamlessly on mobile.

## Tech Stack
- **Language**: TypeScript (v5.3.3)
- **Runtime**: Node.js (v20+)
- **Execution Environment**: GCP Functions Framework (v3.0.0) for HTTP Serverless webhook
- **Notion SDK**: `@notionhq/client` (v2.2.15)
- **Generative AI SDK**: `@google/generative-ai` (v0.21.0)
- **State Management**: `@google-cloud/firestore` (for serverless persistence)
- **Environment Management**: `dotenv` (v16.4.5)
- **Development Tools**: `ts-node` (v10.9.2), `@types/node` (v20.11.24)

## Database Schema (Notion)
Hệ thống kết nối với 5 databases với cấu trúc (lưu ý cột Status của Tasks):
- **Tasks**: `Name` (Title), `Status` (Select: `Not Started`, `On Hold`, `In Progress`, `Done`, `Archived`), `Priority` (Select: High, Medium, Low), `Estimate` (Number), `Date` (Date), `Project` (Relation), `Daily Log` (Relation).
- **Projects**: `Name` (Title), `Status` (Select), `Area` (Relation), `Tasks` (Relation).
- **Daily Logs**: `Name` (Title: YYYY-MM-DD), `Date` (Date), `Highlight` (Rich Text), `Tasks` (Relation).
- **Areas**: `Name` (Title), `Projects` (Relation), `Resources` (Relation).
- **Resources**: `Name` (Title), `URL` (URL), `Area` (Relation).

## Architecture & Data Flow
Hệ thống được thiết kế theo kiến trúc Serverless với luồng dữ liệu End-to-End như sau:

1. **Telegram Webhook**: Điểm tiếp nhận request từ người dùng.
2. **GCP Cloud Run (Functions Framework)**: Nơi xử lý logic nghiệp vụ. Do bản chất là môi trường Stateless (không lưu trạng thái giữa các request), hệ thống cần một tầng đệm trung gian.
3. **GCP Firestore (Native Mode) - State Management Layer**: Đóng vai trò là **State Buffer (Tầng đệm quản lý trạng thái)** nằm giữa Telegram Webhook và Notion API. Firestore chịu trách nhiệm lưu trữ tạm thời các bản nháp (drafts) và phiên hội thoại (user sessions) để chuyển đổi tính chất Stateless của Cloud Run thành Stateful. Điều này là cốt lõi để chuẩn bị cho các luồng duyệt kế hoạch tuần (`plan_week`) hoặc tạo task hội thoại nhiều bước.
4. **Gemini API**: Trí tuệ nhân tạo đảm nhiệm bóc tách và phân loại dữ liệu (NLP).
5. **Notion API**: Hệ thống lưu trữ dữ liệu vĩnh viễn (Second Brain).

## Multi-Model Routing Architecture (Cost & Performance Optimization)
To optimize operational costs while maintaining high-quality reasoning, the system employs a dual-model routing strategy. Tier names are conceptual; the concrete model for each tier is **env-driven** (`GEMINI_MODEL_LITE` / `GEMINI_MODEL_PRO`) so models can be swapped without code changes:
1. **Lightweight Tier (`MODELS.LITE`)**: Used for high-frequency, structured, and deterministic NLP tasks (e.g., Parsing commands, extracting task details, content translation, and Focus Rescue filtering).
2. **Advanced Tier (`MODELS.PRO`)**: Used for low-frequency, complex reasoning, synthesis, and conversational analysis (e.g., Bulk weekly planning and dynamic weekly retrospective reports).

## Commands
- **Build**: `npm run build` (runs `tsc`)
- **Start (Dev Framework)**: `npm run start` (runs `npx @google-cloud/functions-framework --target=helloHttp --source=dist`)
- **Test**: `npm test` (runs `npx ts-node tests/localTest.ts`)
- **Lint**: `npm run lint`

> **Telegram Commands**: `/add_task`, `/view_task`, `/rescue`, `/highlight`, `/plan_week`, `/weekly_report`. Lệnh `/plan_week <text>` (FR-7) cho phép lập kế hoạch tuần bằng ngôn ngữ tự nhiên để tạo hàng loạt task.

## Project Structure
```text
.agents/
├── rules/                  → Quy tắc ràng buộc kỹ thuật (vd: notion-limits)
└── workflows/              → Quy trình kiểm tra hệ thống (vd: deploy-check)
src/
├── index.ts                → HTTP Webhook entry point (Google Cloud Function)
├── config.ts               → Environment variable validation, global config & Model Tier definitions
├── notion/
│     ├── client.ts         → Notion Client wrappers (Pages, Databases, Blocks CRUD)
│     └── types.ts          → Interfaces matching Notion Database properties
├── gemini/
│     └── client.ts         → Gemini API NLP processor (Handles dynamic model selection)
├── telegram/
│     └── client.ts         → Telegram Bot API helper (SendMessage, EditMessage)
├── skills/
│     ├── base.ts           → Interface AgentSkill
│     └── WeeklyPlanningSkill.ts → Đóng gói logic nghiệp vụ cho lệnh /plan_week
├── services/
│     ├── taskService.ts    → Business logic cho Tasks
│     ├── reportService.ts  → Business logic cho Weekly performance reports (Metrics calculation)
│     ├── stateManager.ts   → Firestore state management for draft plans
│     └── highlightService.ts → Daily Highlight logic
tests/
└── localTest.ts            → Local harness to simulate API payloads and flow execution
docs/
└── spec.md                 → This system specification
```

## Code Style & Configuration

### Model Routing Configuration (`src/config.ts`)
Model names change over time, so they are **env-driven** and must NOT be hardcoded in the codebase. The tier names below are conceptual; the actual model used is resolved from environment variables with sensible real defaults.

```typescript
/**
 * Centralized Gemini model tiers (env-driven).
 *   - LITE: high-frequency, deterministic NLP (parsing, translation, filtering)
 *   - PRO:  low-frequency, complex reasoning (bulk planning, retrospective)
 */
export const MODELS = {
  LITE: process.env.GEMINI_MODEL_LITE || 'gemini-1.5-flash', // Tối ưu chi phí
  PRO: process.env.GEMINI_MODEL_PRO || 'gemini-1.5-pro',     // Tối ưu logic
} as const;
```

Override without code changes by setting `GEMINI_MODEL_LITE` / `GEMINI_MODEL_PRO` in the environment (see `.env.example`).

### Task Creation with Auto-Prefixing (`src/notion/client.ts`)
```typescript
import { Client } from '@notionhq/client';

export interface TaskInput {
  name: string;
  description?: string; // Mapped to a Callout block
  projectName?: string;
  priority: 'High' | 'Medium' | 'Low';
  estimate: number; // in hours
  dueDate: string;  // YYYY-MM-DD
  checklist: string[];
}

/**
 * Handles creation of a Task page, auto-generates sequential prefix, and populates checklist blocks.
 */
export async function createTaskInNotion(
  notion: Client,
  dbId: string,
  task: TaskInput,
  projectId?: string,
  dailyLogId?: string
): Promise<string> {
  let taskPrefix = '';
  if (task.projectName) {
    // Query Notion to get the current sequential task count for this project
    const existingTasksCount = await countTasksInProject(notion, dbId, projectId);
    taskPrefix = `${task.projectName}_T${existingTasksCount + 1}: `;
  }

  const properties: any = {
    Name: { title: [{ text: { content: `${taskPrefix}${task.name}` } }] },
    Priority: { select: { name: task.priority } },
    Estimate: { number: task.estimate },
    Date: { date: { start: task.dueDate } },
  };

  if (projectId) {
    properties.Project = { relation: [{ id: projectId }] };
  }
  if (dailyLogId) {
    properties['Daily Log'] = { relation: [{ id: dailyLogId }] };
  }

  const response = await notion.pages.create({
    parent: { database_id: dbId },
    properties,
  });

  const children: any[] = [];
  if (task.description) {
    children.push({
      object: 'block',
      type: 'callout',
      callout: { icon: { type: 'emoji', emoji: '💡' }, color: 'gray_background', rich_text: [{ type: 'text', text: { content: task.description } }] }
    });
  }

  if (task.checklist.length > 0) {
    for (const item of task.checklist) {
      children.push({
        object: 'block',
        type: 'to_do',
        to_do: { rich_text: [{ type: 'text', text: { content: item } }], checked: false }
      });
    }
  }

  if (children.length > 0) {
    await notion.blocks.children.append({ block_id: response.id, children });
  }

  return response.id;
}
```

## Testing Strategy
- **Framework**: Simple testing using standalone TypeScript run-scripts in `tests/localTest.ts` to mock incoming updates and perform assertion logs.
- **Mocking**: Mocking Telegram and Notion HTTP calls where necessary, or running live test calls against a test Notion Workspace.
- **Coverage**: Focus on parsing accuracy (Gemini output schema matching), routing fallback correctness, and rollback/rollover integrity.

## Boundaries

### Always
- Catch Notion and Gemini API rate limits and log error codes clearly.
- Return HTTP 200 to Telegram within 2000ms to avoid webhook retry loops, then process business logic asynchronously if needed.
- Validate all expected environment variables and model tier configurations at startup.

### Ask first
- Adding new npm dependencies.
- Modifying the relational mappings between databases.

### Never
- Hardcode API keys or secret tokens.
- Delete items from Notion database (always mark as 'Done' or move status, rather than deleting).

## Success Criteria (Specific and Testable)

### FR-1 (Intelligent Task Parsing & Auto-Prefixing)
- Inputting `/add_task Nghiên cứu đối thủ cạnh tranh cho dự án PRJ226, độ ưu tiên High, dự tính 2h` gửi request qua LITE tier để bóc tách: Task Name `Nghiên cứu đối thủ cạnh tranh`, Project `PRJ226`, Priority `High`, Estimate `2.0`.
- Hệ thống đếm số lượng task hiện có của dự án PRJ226 trong Notion để tự động sinh mã prefix tăng dần (Ví dụ nếu đã có 2 tasks, prefix sẽ là `PRJ226_T3: `).
- Gemini successfully yields a checklist array (e.g., `["Tìm kiếm top 3 đối thủ", "Lập bảng so sánh tính năng", "Viết báo cáo đánh giá"]`).
- Notion Page is created under Tasks DB, containing corresponding unchecked `to_do` blocks.

### FR-2 & FR-3 (Interactive Task & Overdue/Rollover Logic)
- `/view_task` displays today's Tasks with project completion ratios (Completed Tasks / Total Tasks in that Project).
- Pressing `[✅ Complete]` updates Task status to Done in Notion and removes Inline Buttons from the message.
- Pressing `[⏳ Defer]` or sending conversational text `Chưa xong hôm nay, mới được một nửa thôi` sẽ dùng LITE tier xử lý nhanh:
  - Audit of checklist: retrieves and counts unchecked/checked `to_do` blocks.
  - Decreases original Task Estimate in Notion by 50% (Earned value).
  - Marks original Task Status as Done.
  - Clones a new Task for tomorrow named `[Rollover] <Original Name>` (retaining original prefix identifier), keeps the Project relation, and migrates only the unchecked `to_do` blocks as children.

### FR-4 (Focus Rescue Engine)
- Sending `/rescue` queries Tasks DB for active tasks.
- Filters out one Task where Priority = High and Estimate <= 0.5 (30 minutes).
- Returns it to user via LITE tier message processing to eliminate choice paralysis.

### FR-5 (Daily Log Highlights via Text)
- Sending `/highlight Đạt được cột mốc quan trọng trong việc tối ưu cơ sở dữ liệu` looks up today's Daily Log entry.
- Uses LITE tier to translate to English: `Achieved critical milestone in database optimization`.
- Updates the Highlight text property of that Daily Log page in Notion.

### FR-6 (Weekly Dynamic Retrospective via Advanced AI)
- Executing the retro calculates hard metrics:
  - **Slippage Rate** = (deferred or rescheduled tasks this week / total tasks planned this week) * 100%.
  - **Velocity Score** = Sum of Estimate values for all tasks marked Done this week.
  - **PM Framework Analysis** = Classification of Task Names: Discovery vs Delivery percentage split.
- **AI Flexible Evaluation**: Các thông số trên được gom thành một payload JSON và gửi sang PRO tier (Advanced). Sử dụng System Prompt giả lập persona Mentor Liam, model tiến hành phân tích sâu sắc các chỉ số, chỉ ra các bottleneck trong tuần, đưa ra lời khuyên mang tính chất định hướng Product Management linh hoạt và gửi về Telegram dưới dạng một tin nhắn retro tổng hợp (không fix cứng câu từ).

### FR-7 (Conversational Weekly Planning & Bulk Task Creation via Advanced AI)
Cho phép người dùng mô tả kế hoạch tuần bằng ngôn ngữ tự nhiên (hoặc dán lại nội dung trao đổi giữa người dùng và Gemini), sau đó bot tự bóc tách thành nhiều task và tạo hàng loạt vào Notion sau khi người dùng xác nhận.

- **Kích hoạt**: Người dùng gửi `/plan_week <text>`, trong đó `<text>` là đoạn mô tả dài (ví dụ: `/plan_week Trong tuần tới tôi sẽ làm về dự án phát triển sản phẩm học tiếng Anh, các đầu việc gồm: lên kế hoạch nghiên cứu người dùng, tạo customer journey map, làm competitive analysis...`).
- **Routing**: Toàn bộ payload được gửi sang **PRO tier** (Advanced) vì tác vụ đòi hỏi suy luận phân rã nhiều task, suy ra Project/Priority/Estimate và sinh checklist cho từng task.
- **Output schema (bắt buộc JSON)**: Model trả về một mảng task, mỗi phần tử khớp interface `TaskInput` (`name`, `projectName?`, `priority`, `estimate`, `dueDate`, `checklist[]`). Nếu một trường không suy ra được, model gán mặc định hợp lý (Priority `Medium`, Estimate ước lượng theo độ phức tạp).
- **Project mapping**: Model suy ra tên dự án từ văn cảnh (ví dụ "dự án phát triển sản phẩm học tiếng Anh"). Hệ thống truy vấn Projects DB để tìm project khớp gần đúng (fuzzy match) và link relation; nếu không tìm thấy thì hỏi người dùng / tạo project mới.
- **Auto-prefix**: Mọi task trong batch áp dụng logic prefix tăng dần `<Project>_T<n>` như FR-1, đánh số tuần tự tiếp nối số task hiện có của project (kể cả các task vừa tạo trong cùng batch).
- **Preview & Confirm (bắt buộc)**: Trước khi ghi vào Notion, bot gửi một tin nhắn nháp liệt kê toàn bộ task dự kiến (tên + prefix, project, priority, estimate, checklist) kèm inline buttons:
  - `[✅ Tạo tất cả]` → tạo hàng loạt vào Tasks DB.
  - `[✏️ Sửa]` → cho phép người dùng điều chỉnh (gửi lại text hoặc hủy từng mục).
  - `[❌ Hủy]` → bỏ toàn bộ, không ghi gì vào Notion.
- **Bulk creation**: Khi nhấn `[✅ Tạo tất cả]`, hệ thống gọi `createTaskInNotion` cho từng task tuần tự có chèn **Throttle delay (350ms)** để tránh Notion API Rate Limits (HTTP 429). Sau đó trả về Telegram các **Deep Link `notion://`** để mở native app nhanh chóng.
- **Report ingestion**: Ngoài kế hoạch tuần, người dùng có thể dán một báo cáo/transcript trao đổi với Gemini qua cùng lệnh `/plan_week`; bot áp dụng cùng pipeline bóc tách → preview → confirm → bulk create.
- **Idempotency & State**: Mỗi phiên `/plan_week` gắn một draft ID lưu trữ trong **GCP Firestore** (thay vì in-memory Map) để bảo toàn state khi scale serverless functions. Chỉ tạo task khi người dùng nhấn confirm, tránh tạo trùng nếu nhấn nút nhiều lần. Cuối cùng, bot dọn dẹp (delete) draft trên Firestore.
