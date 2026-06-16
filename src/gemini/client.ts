import { GoogleGenerativeAI, Schema, Type } from '@google/generative-ai';
import { config, MODELS } from '../config';
import type { GeminiTaskOutput } from '../notion/types';

const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);

// Define Gemini JSON schema for a single task output
const taskSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: 'Actionable and concise task name' },
    projectName: { type: Type.STRING, description: 'Name of the related project, if mentioned. E.g., PRJ226' },
    priority: { type: Type.STRING, description: 'Priority of the task: High, Medium, or Low', enum: ['High', 'Medium', 'Low'] },
    estimate: { type: Type.NUMBER, description: 'Estimated effort in hours. Default to 1 if unknown.' },
    dueDate: { type: Type.STRING, description: 'Due date in YYYY-MM-DD format.' },
    checklist: {
      type: Type.ARRAY,
      description: 'A list of 2-5 actionable subtasks to complete the main task.',
      items: { type: Type.STRING },
    },
  },
  required: ['name', 'priority', 'estimate', 'dueDate', 'checklist'],
};

// Define Gemini JSON schema for an array of tasks (for weekly planning)
const weeklyPlanSchema: Schema = {
  type: Type.ARRAY,
  description: 'An array of tasks planned for the week.',
  items: taskSchema,
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
    Current date: ${currentDate}.
    If the user doesn't specify a date, default to ${currentDate}.
    If priority is not mentioned, infer it or default to "Medium".
    If estimate is not mentioned, infer based on complexity or default to 1.
    Create a checklist of 2-5 actionable steps to complete this task.
    
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
    - If a task has no explicit date, distribute it reasonably throughout the upcoming week starting from ${currentDate}.
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
