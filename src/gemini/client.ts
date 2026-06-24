import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import type { Schema } from '@google/generative-ai';
import { config, MODELS } from '../config';
import type { GeminiTaskOutput, WeeklyTaskV2 } from '../notion/types';

const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);

// Define Gemini JSON schema for a single task output
const taskSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    name: { type: SchemaType.STRING, description: 'Actionable and concise task name' },
    description: { type: SchemaType.STRING, description: 'A concise 1-2 sentence summary of the context, rationale, or notes for this task. Capture any background information the user provided.' },
    projectName: { type: SchemaType.STRING, description: 'Name of the related project, if mentioned. E.g., PRJ226' },
    priority: { type: SchemaType.STRING, description: 'Priority of the task: High, Medium, or Low', enum: ['High', 'Medium', 'Low'] },
    estimate: { type: SchemaType.NUMBER, description: 'Estimated effort in hours. Default to 1 if unknown.' },
    dueDate: { type: SchemaType.STRING, description: 'Due date in ISO 8601 format including time and timezone (e.g., 2026-06-23T15:00:00+08:00). If the user specifies a time, include it. If no time is specified, default to 09:00:00+08:00 of the target day.' },
    checklist: {
      type: SchemaType.ARRAY,
      description: 'A list of 2-5 actionable subtasks to complete the main task.',
      items: { type: SchemaType.STRING },
    },
  },
  required: ['name', 'description', 'priority', 'estimate', 'dueDate', 'checklist'],
};

// Define Gemini JSON schema for an array of tasks (for weekly planning)
const weeklyPlanSchema: Schema = {
  type: SchemaType.ARRAY,
  items: taskSchema,
};

// Define Gemini JSON schema for resource classification
const resourceClassificationSchema: Schema = {
  type: SchemaType.OBJECT,
  description: 'Classification result for a saved URL/Bookmark.',
  properties: {
    title: { type: SchemaType.STRING, description: 'A concise, human-readable title extracted from the URL context.' },
    areaId: { type: SchemaType.STRING, description: 'The ID of the most appropriate area for this URL.' },
  },
  required: ['title', 'areaId'],
};

/**
 * FR-1: Parse a single natural language task using the LITE model.
 */
export async function parseTaskInput(text: string, currentDate: string): Promise<GeminiTaskOutput> {
  const model = genAI.getGenerativeModel({
    model: MODELS.LITE,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: taskSchema,
    },
  });

  const prompt = `
    You are an intelligent productivity assistant. Parse the following user request into a structured task.
    Current date and time: ${currentDate}.
    If the user doesn't specify a date, default to today. If no time is specified, default to 09:00:00+08:00.
    If priority is not mentioned, infer it or default to "Medium".
    If estimate is not mentioned, infer based on complexity or default to 1.
    Create a checklist of 2-5 actionable steps to complete this task.
    For the "description" field: extract any background context, rationale, or notes the user provided and condense it into a concise 1-2 sentence summary. This helps preserve working context.
    
    User Request: "${text}"
  `;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  return JSON.parse(responseText) as GeminiTaskOutput;
}

/**
 * FR-7: Parse a long weekly plan into multiple tasks using the PRO model.
 */
export async function parseWeeklyPlan(text: string, currentDate: string): Promise<GeminiTaskOutput[]> {
  const model = genAI.getGenerativeModel({
    model: MODELS.PRO,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: weeklyPlanSchema,
    },
  });

  const prompt = `
    You are a Senior Project Manager. The user is providing a natural language weekly plan.
    Break down the text into a logical list of structured tasks.
    Current date: ${currentDate}.
    
    Rules:
    - If a task has no explicit date, distribute it reasonably throughout the upcoming week starting from ${currentDate}. Default time is 09:00:00+08:00.
    - Ensure every task has an inferred Project Name if mentioned in the context.
    - Break complex goals into manageable tasks. Provide a 2-5 item checklist for each task.
    
    User Weekly Plan:
    "${text}"
  `;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  return JSON.parse(responseText) as GeminiTaskOutput[];
}

/**
 * FR-5: Translate a daily highlight into English using the LITE model.
 */
export async function translateHighlight(text: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: MODELS.LITE });

  const prompt = `
    Translate the following daily highlight into concise, professional-grade English.
    Return ONLY the translated text, with no markdown, quotes, or conversational filler.
    
    Highlight: "${text}"
  `;

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

/**
 * FR-6: Generate a weekly retrospective report using the PRO model.
 */
export async function analyzeWeeklyReport(metricsJson: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: MODELS.PRO });

  const prompt = `
    You are 'Liam', a Senior Product Manager Mentor. Analyze the following weekly performance metrics.
    Write a concise, insightful weekly retrospective directly addressing the user.
    Point out bottlenecks (if any) and provide actionable advice for the upcoming week.
    
    Keep it encouraging but professional. Use Markdown formatting.
    Do NOT include generic greetings like "Here is your report".
    
    Weekly Metrics:
    ${metricsJson}
  `;

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

/**
 * FR-8: Classify a bookmark URL into a Notion Area using the LITE model.
 */
export async function classifyResource(url: string, areas: { id: string, name: string }[]): Promise<{ title: string, areaId: string }> {
  const model = genAI.getGenerativeModel({
    model: MODELS.LITE,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: resourceClassificationSchema,
    },
  });

  const areasListStr = areas.map(a => `- ${a.name} (ID: ${a.id})`).join('\n');

  const prompt = `
    You are an intelligent information organizer.
    Analyze the following URL, extract or guess a short, concise title for it.
    Then, match this URL to the most appropriate Area from the provided list.
    Return the title and the exact ID of the chosen Area.
    If no area perfectly matches, choose the one that fits best.

    URL: "${url}"

    Available Areas:
    ${areasListStr}
  `;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  return JSON.parse(responseText) as { title: string, areaId: string };
}

// ─── V2 Weekly Scheduler Schema & Function ───

const weeklyScheduleV2Schema: Schema = {
  type: SchemaType.ARRAY,
  items: {
    type: SchemaType.OBJECT,
    properties: {
      properties: {
        type: SchemaType.OBJECT,
        properties: {
          Name: { type: SchemaType.STRING, description: 'Action-oriented task title' },
          Project: { type: SchemaType.STRING, description: 'Target project code/name, if mentioned. E.g., PRJ226' },
          Status: { type: SchemaType.STRING, description: 'Always "Not Started"' },
          Priority: { type: SchemaType.STRING, enum: ['High', 'Medium', 'Low'] },
          Estimate: { type: SchemaType.NUMBER, description: 'Estimated hours as a decimal' },
          Date: {
            type: SchemaType.OBJECT,
            properties: {
              start: { type: SchemaType.STRING, description: 'ISO 8601 DateTime with timezone (e.g., 2026-06-24T14:00:00+08:00)' },
              end: { type: SchemaType.STRING, description: 'ISO 8601 DateTime with timezone (e.g., 2026-06-24T16:30:00+08:00)' },
            },
            required: ['start', 'end'],
          },
        },
        required: ['Name', 'Status', 'Priority', 'Estimate', 'Date'],
      },
      content: {
        type: SchemaType.OBJECT,
        properties: {
          Callout_Description: { type: SchemaType.STRING, description: 'Purpose explanation starting with 💡 **MỤC ĐÍCH:**' },
          Checklist: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: 'Micro-action items, each under 45 minutes of focus',
          },
        },
        required: ['Callout_Description', 'Checklist'],
      },
    },
    required: ['properties', 'content'],
  },
};

/**
 * V2 Weekly Scheduler: Uses Busy_Slots_Context + productivity rules.
 * Auto-retries up to 2 times on malformed JSON.
 */
export async function planWeeklySchedule(
  userInput: string,
  currentIsoTime: string,
  busySlotsContext: string
): Promise<WeeklyTaskV2[]> {
  const model = genAI.getGenerativeModel({
    model: MODELS.PRO,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: weeklyScheduleV2Schema,
    },
  });

  const systemPrompt = `
You are an elite Senior Project Manager and productivity optimizer named 'Liam'.
The user will provide a rough draft of their weekly commitments. Your job is to transform it into an optimal, conflict-free weekly execution plan.

Current date and time: ${currentIsoTime}

=== BUSY SLOTS (DO NOT OVERLAP) ===
${busySlotsContext || 'No existing commitments found.'}

=== STRICT PRODUCTIVITY GUARDRAILS ===
1. **The 80/20 Rule:** Maximum 3 tasks with "High" priority per day. Remaining tasks must be "Medium" or "Low".
2. **Habit Friction Minimization:** Re-title tasks using direct, action-oriented verbs (e.g., "Write", "Review", "Build"). Split complex goals into micro-checklists where each item requires < 45 minutes.
3. **Temporal Tetris:**
   - Work tasks → 09:00 – 18:00 window (Mon–Fri)
   - Personal/Growth tasks → 20:00 – 22:30 window or weekends
   - NEVER overlap with busy slots listed above.
4. **Zero Free Slots Handling:** If a day is fully booked, do NOT force tasks into it. Instead, mark those tasks with Priority: "Low" and push them to the next available day. If the entire week is full, leave them unscheduled with a note in the Callout_Description.

=== OUTPUT RULES ===
- Status is always "Not Started".
- Date.start and Date.end must be valid ISO 8601 DateTime strings with +08:00 timezone.
- Date.end = Date.start + Estimate (in hours).
- Callout_Description must start with "💡 **MỤC ĐÍCH:** " followed by an explanation.
- Project field: if the user mentions a project name/code, set it. Otherwise omit or set empty string.
- Checklist: 2–5 micro-action items per task, each achievable in < 45 minutes.
`;

  const userPrompt = `
User's rough weekly plan:
"${userInput}"
`;

  const MAX_RETRIES = 2;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await model.generateContent([systemPrompt, userPrompt]);
      let responseText = result.response.text();
      
      // Clean up markdown block if Gemini accidentally wraps it despite application/json mime type
      responseText = responseText.trim();
      if (responseText.startsWith('```json')) {
        responseText = responseText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
      } else if (responseText.startsWith('```')) {
        responseText = responseText.replace(/^```\s*/i, '').replace(/\s*```$/i, '');
      }

      const parsed = JSON.parse(responseText) as WeeklyTaskV2[];
      // Basic validation
      if (!Array.isArray(parsed)) throw new Error('Response is not an array');
      return parsed;
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        throw new Error(`Failed after ${MAX_RETRIES + 1} attempts: ${error instanceof Error ? error.message : String(error)}`);
      }
      console.warn(`[AI Scheduler] Retry ${attempt + 1}/${MAX_RETRIES} due to error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  // Unreachable but satisfies TypeScript
  throw new Error('[AI Scheduler] Unexpected failure');
}
