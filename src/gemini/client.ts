import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config';
import { NotionProject, NotionArea } from '../notion/types';

const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);

export interface ParsedTask {
  name: string;
  priority: 'High' | 'Medium' | 'Low';
  estimate: number;
  dueDate: string;
  projectId: string | null;
  checklist: string[];
}

export class GeminiAssistant {
  private modelName = 'gemini-1.5-flash';

  /**
   * Semantic parsing of user's task input into structured Task format
   */
  public async parseTaskInput(
    rawInput: string,
    activeProjects: NotionProject[]
  ): Promise<ParsedTask> {
    const model = genAI.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        responseMimeType: 'application/json'
      }
    });

    const currentDate = new Date();
    const currentLocalDateStr = currentDate.toLocaleDateString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh'
    });
    const currentDayOfWeek = currentDate.toLocaleDateString('en-US', {
      weekday: 'long'
    });

    const prompt = `
You are Liam, a supreme productivity assistant. Parse the user's natural language request to create a task, match it to an active project, and generate a step-by-step checklist.

User Input: "${rawInput}"

Active Projects from Notion:
${activeProjects.length > 0 ? JSON.stringify(activeProjects.map(p => ({ id: p.id, name: p.name })), null, 2) : 'No active projects found.'}

Current Date Context:
- UTC Time: ${currentDate.toISOString()}
- Local Date in Vietnam: ${currentLocalDateStr} (Day of week: ${currentDayOfWeek})

Instructions:
1. "name": Extract a clean, professional English or Vietnamese task title. Strip out inline instructions like "priority high" or "project X".
2. "priority": Analyze priority from text (e.g., "gấp", "priority high", "ưu tiên cao", "quan trọng", "high" -> "High"; "low", "thấp", "rảnh làm" -> "Low"). Default to "Medium".
3. "estimate": Extract estimate in hours (e.g., "2 hours", "30p" -> 0.5, "1.5h" -> 1.5). Default to 1.0 if not found.
4. "dueDate": Parse relative dates (e.g., "today", "mai", "tomorrow", "Friday", "thứ sáu này") relative to the current date context. Format strictly as YYYY-MM-DD. If unspecified, default to today's date in local time.
5. "projectId": Match the task's context to the most relevant project name in the Active Projects list. Return the "id" string if matched. If no project matches or input is ambiguous, return null.
6. "checklist": Decompose the task into 3-5 logical, chronological, actionable subtasks/checklists.

Response Schema:
Provide your response as a JSON object matching this structure:
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
    } catch (error: any) {
      console.error('Error in Gemini parseTaskInput:', error);
      throw error;
    }
  }

  /**
   * Classify a URL/Resource to the most relevant Area ID
   */
  public async classifyResource(
    title: string,
    url: string,
    areas: NotionArea[]
  ): Promise<string | null> {
    const model = genAI.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        responseMimeType: 'application/json'
      }
    });

    const prompt = `
You are a Second Brain organizer. Your task is to match a web resource (URL and title) to the most relevant Area of focus from the list of Areas below.

Resource Title: "${title}"
Resource URL: "${url}"

Active Areas:
${JSON.stringify(areas, null, 2)}

Instructions:
Match the resource to the best Area. Return the Area "id" if a match is confident. If no matching area fits or is found, return null.

Response Schema:
Provide your response as a JSON object matching this structure:
{
  "areaId": string or null
}
`;

    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const parsed = JSON.parse(text);
      return parsed.areaId || null;
    } catch (error: any) {
      console.error('Error in Gemini classifyResource:', error);
      return null;
    }
  }

  /**
   * Translate a Daily Log highlight to professional-grade English
   */
  public async translateHighlight(text: string): Promise<string> {
    const model = genAI.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        responseMimeType: 'application/json'
      }
    });

    const prompt = `
Translate the following user daily highlight text (often in Vietnamese) into professional-grade English. Optimize it for clarity and conciseness.

Highlight Input: "${text}"

Response Schema:
Provide your response as a JSON object matching this structure:
{
  "highlight": string
}
`;

    try {
      const result = await model.generateContent(prompt);
      const resultText = result.response.text();
      const parsed = JSON.parse(resultText);
      return parsed.highlight || text;
    } catch (error: any) {
      console.error('Error in Gemini translateHighlight:', error);
      return text; // Fallback to original text on failure
    }
  }

  /**
   * Classify a list of task names into 'Discovery' or 'Delivery'
   */
  public async classifyTasksDiscoveryDelivery(
    taskNames: string[]
  ): Promise<{ name: string; type: 'Discovery' | 'Delivery' }[]> {
    if (taskNames.length === 0) return [];

    const model = genAI.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        responseMimeType: 'application/json'
      }
    });

    const prompt = `
You are an agile PM analyst. Classify each of the following task names into either "Discovery" or "Delivery" based on these guidelines:
- Discovery: research, learning, study, design, mockup, prototype, feedback, analysis, exploration, planning.
- Delivery: implementation, coding, writing code, testing, deployment, bug fixing, refactoring, building, configuring.

Tasks list:
${JSON.stringify(taskNames, null, 2)}

Response Schema:
Provide your response as a JSON object matching this structure:
{
  "classifications": [
    {
      "name": string,
      "type": "Discovery" | "Delivery"
    }
  ]
}
`;

    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const parsed = JSON.parse(text);
      return parsed.classifications || [];
    } catch (error: any) {
      console.error('Error in Gemini classifyTasksDiscoveryDelivery:', error);
      // Fallback: Default everything to Delivery
      return taskNames.map(name => ({ name, type: 'Delivery' }));
    }
  }
}
export const geminiAssistant = new GeminiAssistant();
