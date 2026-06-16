import { analyzeWeeklyReport } from '../gemini/client';
import { notion } from '../notion/client';
import { config } from '../config';

// Define a simple structure for the extracted metrics
export interface WeeklyMetrics {
  totalPlannedTasks: number;
  deferredTasks: number;
  slippageRate: number; // percentage
  doneTasks: number;
  velocityScore: number; // sum of estimates for done tasks
  discoveryPercentage: number;
  deliveryPercentage: number;
}

export async function generateWeeklyReport(): Promise<string> {
  // Determine date range for "this week" (past 7 days for simplicity)
  const today = new Date();
  const lastWeek = new Date();
  lastWeek.setDate(today.getDate() - 7);

  const startDateStr = lastWeek.toISOString().split('T')[0];
  const endDateStr = today.toISOString().split('T')[0];

  // Fetch tasks in this date range from Notion
  const response = await notion.databases.query({
    database_id: config.NOTION_TASKS_DB_ID,
    filter: {
      and: [
        { property: 'Date', date: { on_or_after: startDateStr } },
        { property: 'Date', date: { on_or_before: endDateStr } }
      ]
    }
  });

  const tasks = response.results as any[];

  let deferredTasksCount = 0;
  let doneTasksCount = 0;
  let velocityScore = 0;
  let discoveryTasksCount = 0;
  let deliveryTasksCount = 0;

  for (const task of tasks) {
    const status = task.properties['Status']?.select?.name;
    const name = task.properties['Name']?.title?.[0]?.plain_text || '';
    const estimate = task.properties['Estimate']?.number || 0;

    if (name.includes('[Rollover]')) {
      deferredTasksCount++;
    }

    if (status === 'Done') {
      doneTasksCount++;
      velocityScore += estimate;
    }

    // Heuristic for PM framework (Discovery vs Delivery)
    const lowerName = name.toLowerCase();
    if (
      lowerName.includes('nghiên cứu') || 
      lowerName.includes('research') || 
      lowerName.includes('tìm hiểu') || 
      lowerName.includes('phân tích') || 
      lowerName.includes('design')
    ) {
      discoveryTasksCount++;
    } else {
      deliveryTasksCount++;
    }
  }

  const totalPlannedTasks = tasks.length;
  const slippageRate = totalPlannedTasks > 0 ? (deferredTasksCount / totalPlannedTasks) * 100 : 0;
  
  const totalClassified = discoveryTasksCount + deliveryTasksCount;
  const discoveryPercentage = totalClassified > 0 ? (discoveryTasksCount / totalClassified) * 100 : 0;
  const deliveryPercentage = totalClassified > 0 ? (deliveryTasksCount / totalClassified) * 100 : 0;

  const metrics: WeeklyMetrics = {
    totalPlannedTasks,
    deferredTasks: deferredTasksCount,
    slippageRate: Math.round(slippageRate),
    doneTasks: doneTasksCount,
    velocityScore,
    discoveryPercentage: Math.round(discoveryPercentage),
    deliveryPercentage: Math.round(deliveryPercentage)
  };

  // Analyze metrics with PRO model
  const analysis = await analyzeWeeklyReport(JSON.stringify(metrics, null, 2));

  return analysis;
}
