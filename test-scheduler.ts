import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({
  model: 'gemini-1.5-pro',
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema: {
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
    }
  },
});

async function main() {
  try {
    const userInput = "1. Dự án cá nhân (Project: PRJ126): Thứ hai (2026-06-29), làm việc với Anti-Gravity trong 4 tiếng để code module Callback Query Router cho Telegram Bot.";
    const result = await model.generateContent(["Extract to schema", userInput]);
    console.log(result.response.text());
  } catch (err) {
    console.error("Error:", err);
  }
}
main();
