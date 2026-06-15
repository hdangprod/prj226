import * as dotenv from 'dotenv';
dotenv.config();

// Initialize mock variables if not set, to avoid throw at load-time in src/config.ts
const liveTelegram = process.env.TELEGRAM_BOT_TOKEN;
const liveNotion = process.env.NOTION_TOKEN;
const liveGemini = process.env.GEMINI_API_KEY;

if (!liveTelegram) process.env.TELEGRAM_BOT_TOKEN = 'mock-telegram-token';
if (!liveNotion) process.env.NOTION_TOKEN = 'mock-notion-token';
if (!liveGemini) process.env.GEMINI_API_KEY = 'mock-gemini-api-key';
if (!process.env.PROJECTS_DB_ID) process.env.PROJECTS_DB_ID = 'mock-projects-db-id';
if (!process.env.DAILY_LOGS_DB_ID) process.env.DAILY_LOGS_DB_ID = 'mock-daily-logs-db-id';
if (!process.env.TASKS_DB_ID) process.env.TASKS_DB_ID = 'mock-tasks-db-id';
if (!process.env.AREAS_DB_ID) process.env.AREAS_DB_ID = 'mock-areas-db-id';
if (!process.env.RESOURCES_DB_ID) process.env.RESOURCES_DB_ID = 'mock-resources-db-id';

import { NotionSecondBrainClient } from './src/notion/client';
import { geminiAssistant } from './src/gemini/client';
import { telegramClient } from './src/telegram/client';
import { taskService } from './src/services/taskService';
import { reportService } from './src/services/reportService';
import { NotionTask, NotionProject, NotionDailyLog, NotionArea } from './src/notion/types';

async function runLocalVerification() {
  console.log('=== LOGGING CONFIGURATION CHECK ===');
  const hasNotion = !!liveNotion;
  const hasTelegram = !!liveTelegram;
  const hasGemini = !!liveGemini;

  console.log('TELEGRAM_BOT_TOKEN:', hasTelegram ? 'SET ✅' : 'NOT SET ❌');
  console.log('NOTION_TOKEN:', hasNotion ? 'SET ✅' : 'NOT SET ❌');
  console.log('GEMINI_API_KEY:', hasGemini ? 'SET ✅' : 'NOT SET ❌');

  if (!hasNotion || !hasTelegram || !hasGemini) {
    console.log('\n⚠️ Live credentials are missing. Initiating MOCK SIMULATION MODE to verify logic...');
    await runMockSimulation();
  } else {
    console.log('\n🚀 Live credentials detected. Initiating LIVE INTEGRATION TEST...');
    await runLiveTest();
  }
}

/**
 * Runs a complete simulation with mocked Notion, Gemini, and Telegram clients in memory
 */
async function runMockSimulation() {
  // Mock active data
  const mockProjects: NotionProject[] = [
    { id: 'proj-1', name: 'PRJ226 Telegram Bot', status: 'Active' },
    { id: 'proj-2', name: 'Health & Fitness Plan', status: 'Active' }
  ];

  const mockAreas: NotionArea[] = [
    { id: 'area-1', name: 'Work & Tech' },
    { id: 'area-2', name: 'Health' }
  ];

  // In-memory Task database
  const inMemoryTasks: NotionTask[] = [];

  // Mock NotionClient methods
  const originalFetchProjects = NotionSecondBrainClient.prototype.fetchActiveProjects;
  const originalFindOrCreateDailyLog = NotionSecondBrainClient.prototype.findOrCreateDailyLog;
  const originalAddTask = NotionSecondBrainClient.prototype.addTask;
  const originalGetTaskWithChecklist = NotionSecondBrainClient.prototype.getTaskWithChecklist;
  const originalUpdateTaskEstimate = NotionSecondBrainClient.prototype.updateTaskEstimate;
  const originalCompleteTask = NotionSecondBrainClient.prototype.completeTask;
  const originalCloneTaskForTomorrow = NotionSecondBrainClient.prototype.cloneTaskForTomorrow;
  const originalFetchTodayTasks = NotionSecondBrainClient.prototype.fetchTodayTasks;
  const originalFetchAreas = NotionSecondBrainClient.prototype.fetchAreas;
  const originalAddResource = NotionSecondBrainClient.prototype.addResource;
  const originalFetchWeeklyTasksForReport = NotionSecondBrainClient.prototype.fetchWeeklyTasksForReport;
  const originalUpdateDailyLogHighlight = NotionSecondBrainClient.prototype.updateDailyLogHighlight;
  const originalFetchProjectTasksProgress = NotionSecondBrainClient.prototype.fetchProjectTasksProgress;

  // Mock GeminiAssistant methods
  const originalParseTaskInput = geminiAssistant.parseTaskInput;
  const originalClassifyResource = geminiAssistant.classifyResource;
  const originalTranslateHighlight = geminiAssistant.translateHighlight;
  const originalClassifyTasksDiscoveryDelivery = geminiAssistant.classifyTasksDiscoveryDelivery;

  // Mock TelegramClient methods
  const originalSendMessage = telegramClient.sendMessage;

  // Override prototypes
  NotionSecondBrainClient.prototype.fetchActiveProjects = async () => mockProjects;
  NotionSecondBrainClient.prototype.findOrCreateDailyLog = async (dateStr) => `log-${dateStr}`;
  NotionSecondBrainClient.prototype.fetchAreas = async () => mockAreas;
  
  NotionSecondBrainClient.prototype.addTask = async (task, projectId, dailyLogId) => {
    const id = `task-${inMemoryTasks.length + 1}`;
    inMemoryTasks.push({
      id,
      name: task.name,
      status: task.status || 'Not Started',
      priority: task.priority,
      estimate: task.estimate,
      dueDate: task.dueDate,
      projectId,
      dailyLogId,
      checklist: task.checklist.map((text, index) => ({
        id: `block-${index + 1}`,
        text,
        checked: false
      }))
    });
    return id;
  };

  NotionSecondBrainClient.prototype.getTaskWithChecklist = async (taskId) => {
    const task = inMemoryTasks.find(t => t.id === taskId);
    if (!task) throw new Error(`Mock Task not found: ${taskId}`);
    return task;
  };

  NotionSecondBrainClient.prototype.updateTaskEstimate = async (taskId, newEstimate) => {
    const task = inMemoryTasks.find(t => t.id === taskId);
    if (task) task.estimate = newEstimate;
  };

  NotionSecondBrainClient.prototype.completeTask = async (taskId) => {
    const task = inMemoryTasks.find(t => t.id === taskId);
    if (task) task.status = 'Done';
  };

  NotionSecondBrainClient.prototype.cloneTaskForTomorrow = async (originalTask, uncheckedItems, newEstimate) => {
    const id = `task-cloned-${inMemoryTasks.length + 1}`;
    inMemoryTasks.push({
      id,
      name: `[Rollover] ${originalTask.name}`,
      status: 'Not Started',
      priority: originalTask.priority,
      estimate: newEstimate,
      dueDate: '2026-06-16',
      projectId: originalTask.projectId,
      dailyLogId: 'log-2026-06-16',
      checklist: uncheckedItems
    });
    return id;
  };

  NotionSecondBrainClient.prototype.fetchTodayTasks = async () => {
    return inMemoryTasks.filter(t => t.status !== 'Done');
  };

  NotionSecondBrainClient.prototype.fetchWeeklyTasksForReport = async () => {
    return inMemoryTasks;
  };

  NotionSecondBrainClient.prototype.updateDailyLogHighlight = async () => {};

  NotionSecondBrainClient.prototype.fetchProjectTasksProgress = async (projectId) => {
    const projectTasks = inMemoryTasks.filter(t => t.projectId === projectId);
    const completed = projectTasks.filter(t => t.status === 'Done').length;
    return { completed, total: projectTasks.length };
  };

  NotionSecondBrainClient.prototype.addResource = async () => 'resource-1';

  geminiAssistant.parseTaskInput = async (rawInput) => {
    return {
      name: 'Nghiên cứu đối thủ cạnh tranh',
      priority: 'High',
      estimate: 2.0,
      dueDate: '2026-06-15',
      projectId: 'proj-1',
      checklist: ['Tìm kiếm top 3 đối thủ', 'Lập bảng so sánh tính năng']
    };
  };

  geminiAssistant.classifyResource = async () => 'area-1';
  geminiAssistant.translateHighlight = async (text) => `Translated: ${text}`;
  geminiAssistant.classifyTasksDiscoveryDelivery = async (names) => {
    return names.map(name => ({
      name,
      type: name.includes('Nghiên cứu') ? 'Discovery' : 'Delivery'
    }));
  };

  telegramClient.sendMessage = async (chatId, text) => {
    console.log(`[MOCK TG SEND to ${chatId}]:\n${text}\n--------------------`);
    return { ok: true, result: { message_id: 123 } };
  };

  try {
    console.log('\n--- 1. Testing Task Creation ---');
    const inputTask = 'Nghiên cứu đối thủ cạnh tranh cho dự án PRJ226, độ ưu tiên High, dự tính 2h';
    const createdTask = await taskService.createTaskFromNaturalLanguage(inputTask);
    console.log('Task Created Detail:', JSON.stringify(createdTask, null, 2));

    console.log('\n--- 2. Testing Today\'s Tasks query ---');
    const todayTasks = await NotionSecondBrainClient.prototype.fetchTodayTasks();
    console.log(`Found ${todayTasks.length} active tasks today.`);

    console.log('\n--- 3. Testing Rollover/Defer logic ---');
    const createdTaskId = inMemoryTasks[0].id;
    const rolloverResult = await taskService.deferAndRolloverTask(createdTaskId);
    console.log('Rollover Output:', JSON.stringify(rolloverResult, null, 2));

    console.log('\n--- 4. Testing Focus Rescue Engine ---');
    // Add a quick high priority task first
    await NotionSecondBrainClient.prototype.addTask(
      {
        name: 'Sửa lỗi build',
        priority: 'High',
        estimate: 0.5, // 30 minutes
        dueDate: '2026-06-15',
        checklist: []
      },
      'proj-1',
      'log-2026-06-15'
    );
    const rescueRecommended = await taskService.rescueTask();
    console.log('Rescue Recommended Task:', rescueRecommended ? rescueRecommended.name : 'None');

    console.log('\n--- 5. Testing Capture Resource ---');
    const savedRes = await taskService.saveResource(
      'https://notion.so/api-docs',
      'https://notion.so/api-docs Notion API Reference Guide'
    );
    console.log('Saved Resource Detail:', JSON.stringify(savedRes, null, 2));

    console.log('\n--- 6. Testing Highlight Addition ---');
    const highlight = await taskService.addDailyHighlight('Đồng bộ xong database Notion');
    console.log('Added highlight:', highlight);

    console.log('\n--- 7. Testing Performance Weekly Retrospective ---');
    const reportText = await reportService.getWeeklyReportMessage();
    console.log(reportText);

    console.log('\n=== ALL MOCK SIMULATION TESTS COMPLETED SUCCESSFULLY! ✅ ===');
  } catch (error) {
    console.error('\n❌ Mock simulation failed with error:', error);
    process.exit(1);
  } finally {
    // Restore original prototypes
    NotionSecondBrainClient.prototype.fetchActiveProjects = originalFetchProjects;
    NotionSecondBrainClient.prototype.findOrCreateDailyLog = originalFindOrCreateDailyLog;
    NotionSecondBrainClient.prototype.addTask = originalAddTask;
    NotionSecondBrainClient.prototype.getTaskWithChecklist = originalGetTaskWithChecklist;
    NotionSecondBrainClient.prototype.updateTaskEstimate = originalUpdateTaskEstimate;
    NotionSecondBrainClient.prototype.completeTask = originalCompleteTask;
    NotionSecondBrainClient.prototype.cloneTaskForTomorrow = originalCloneTaskForTomorrow;
    NotionSecondBrainClient.prototype.fetchTodayTasks = originalFetchTodayTasks;
    NotionSecondBrainClient.prototype.fetchAreas = originalFetchAreas;
    NotionSecondBrainClient.prototype.addResource = originalAddResource;
    NotionSecondBrainClient.prototype.fetchWeeklyTasksForReport = originalFetchWeeklyTasksForReport;
    NotionSecondBrainClient.prototype.updateDailyLogHighlight = originalUpdateDailyLogHighlight;
    NotionSecondBrainClient.prototype.fetchProjectTasksProgress = originalFetchProjectTasksProgress;

    geminiAssistant.parseTaskInput = originalParseTaskInput;
    geminiAssistant.classifyResource = originalClassifyResource;
    geminiAssistant.translateHighlight = originalTranslateHighlight;
    geminiAssistant.classifyTasksDiscoveryDelivery = originalClassifyTasksDiscoveryDelivery;

    telegramClient.sendMessage = originalSendMessage;
  }
}

/**
 * Runs a live integration test against the real Notion, Telegram, and Gemini APIs
 */
async function runLiveTest() {
  const notionClient = new NotionSecondBrainClient();
  try {
    console.log('--- 1. Testing Live Active Projects fetching ---');
    const projects = await notionClient.fetchActiveProjects();
    console.log(`Successfully fetched ${projects.length} projects from Notion.`);

    console.log('\n--- 2. Testing Live Areas fetching ---');
    const areas = await notionClient.fetchAreas();
    console.log(`Successfully fetched ${areas.length} Areas.`);

    console.log('\n--- 3. Testing Live Gemini Task parsing ---');
    const testInput = 'Viết tài liệu kỹ thuật cho dự án PRJ226, độ ưu tiên cao, dự kiến làm trong 30 phút';
    const parsed = await geminiAssistant.parseTaskInput(testInput, projects);
    console.log('Gemini parsed task output:', JSON.stringify(parsed, null, 2));

    console.log('\n--- 4. Testing Live Notion Task addition ---');
    const todayStr = notionClient.getLocalDateString();
    const todayLogId = await notionClient.findOrCreateDailyLog(todayStr);

    const createdTaskId = await notionClient.addTask(
      {
        name: parsed.name,
        status: 'Not Started',
        priority: parsed.priority,
        estimate: parsed.estimate,
        dueDate: parsed.dueDate,
        checklist: parsed.checklist
      },
      parsed.projectId || undefined,
      todayLogId
    );
    console.log(`Task successfully created in Notion with ID: ${createdTaskId}`);

    console.log('\n--- 5. Auditing and Simulating Rollover/Deferral ---');
    const rollover = await taskService.deferAndRolloverTask(createdTaskId);
    console.log(`Rollover completed successfully! Original adjusted estimate: ${rollover.adjustedOriginalEstimate}h. Rollover Task ID: ${rollover.clonedTaskId}`);

    console.log('\n=== ALL LIVE INTEGRATION TESTS COMPLETED SUCCESSFULLY! ✅ ===');
  } catch (error) {
    console.error('\n❌ Live integration test failed:', error);
    process.exit(1);
  }
}

runLocalVerification();
