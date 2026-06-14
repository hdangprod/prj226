import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

export interface ParsedTask {
  name: string;
  priority: 'High' | 'Medium' | 'Low';
  estimate: number;
  dueDate: string;
  projectId: string | null;
  checklist: string[];
}

export interface ProjectInfo {
  id: string;
  name: string;
}

/**
 * Parses a natural language task description into a structured JSON task object.
 * @param rawInput The user's input (e.g. "Review contract, priority high, project PRJ226, estimate 2 hours")
 * @param activeProjects List of projects fetched from Notion Tasks DB context
 * @returns Structured task object
 */
export async function parseTaskInput(rawInput: string, activeProjects: ProjectInfo[] = []): Promise<ParsedTask> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
    }
  });

  const currentDate = new Date();
  const currentLocalDateStr = currentDate.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const currentDayOfWeek = currentDate.toLocaleDateString('en-US', { weekday: 'long' });

  const prompt = `
You are Liam, a supreme productivity AI assistant. Your job is to parse the user's natural language command to add a task, match it to an existing project if applicable, and generate a step-by-step checklist.

User Input: "${rawInput}"

Active Projects from Notion:
${activeProjects.length > 0 ? JSON.stringify(activeProjects, null, 2) : "No active projects found."}

Current Date Context:
- Local Time: ${currentDate.toISOString()}
- Local Date in Vietnam: ${currentLocalDateStr} (Day of week: ${currentDayOfWeek})

Instructions:
1. "name": Extract a clean, professional English or Vietnamese task title (based on input language). Strip out parts like "priority high" or "project X".
2. "priority": Analyze priority from text (e.g., "gấp", "priority high", "ưu tiên cao", "quan trọng" -> "High"; "low", "thấp", "rảnh làm" -> "Low"). Default to "Medium".
3. "estimate": Extract estimate in hours (e.g., "2 hours", "30p" -> 0.5, "1.5h" -> 1.5). Default to 1.0 if not found.
4. "dueDate": Parse relative dates (e.g., "today", "mai", "tomorrow", "Friday", "thứ sáu này") relative to the current date context. Format strictly as YYYY-MM-DD. If unspecified, default to today's date in local time.
5. "projectId": Match the task's context to the most relevant project name in the Active Projects list. Return the "id" string if matched. If no project matches or input is ambiguous, return null.
6. "checklist": Decompose the task into 3-5 logical, chronological, actionable subtasks/checklists.

Response Schema:
Provide your response as a JSON object with these fields:
{
  "name": string,
  "priority": "High" | "Medium" | "Low",
  "estimate": number (hours),
  "dueDate": string (YYYY-MM-DD),
  "projectId": string or null,
  "checklist": string[]
}
`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return JSON.parse(text) as ParsedTask;
  } catch (error) {
    console.error('Error in parseTaskInput:', error);
    throw error;
  }
}
