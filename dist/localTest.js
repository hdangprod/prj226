"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const notionClient_1 = require("./src/notionClient");
const geminiClient_1 = require("./src/geminiClient");
async function runLocalTest() {
    console.log('=== LOGGING CONFIGURATION CHECK ===');
    console.log('TELEGRAM_BOT_TOKEN:', process.env.TELEGRAM_BOT_TOKEN ? 'SET ✅' : 'NOT SET ❌');
    console.log('NOTION_TOKEN:', process.env.NOTION_TOKEN ? 'SET ✅' : 'NOT SET ❌');
    console.log('PROJECTS_DB_ID:', process.env.PROJECTS_DB_ID ? 'SET ✅' : 'NOT SET ❌');
    console.log('DAILY_LOGS_DB_ID:', process.env.DAILY_LOGS_DB_ID ? 'SET ✅' : 'NOT SET ❌');
    console.log('TASKS_DB_ID:', process.env.TASKS_DB_ID ? 'SET ✅' : 'NOT SET ❌');
    console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? 'SET ✅' : 'NOT SET ❌');
    if (!process.env.NOTION_TOKEN || !process.env.TASKS_DB_ID || !process.env.GEMINI_API_KEY) {
        console.error('\n⚠️ Please configure your NOTION_TOKEN, TASKS_DB_ID, and GEMINI_API_KEY in the .env file before running the test.');
        process.exit(1);
    }
    try {
        // 1. Fetch active projects
        console.log('\n--- 1. Fetching active projects from Notion ---');
        const projects = await (0, notionClient_1.fetchProjects)();
        console.log(`Fetched ${projects.length} projects:`);
        projects.forEach(p => console.log(`- [${p.id}] ${p.name}`));
        // 2. Parse a test prompt via Gemini API
        const testInput = 'Viết tài liệu kỹ thuật cho dự án PRJ226, độ ưu tiên cao, dự kiến làm trong 3 giờ';
        console.log(`\n--- 2. Parsing prompt with Gemini AI: "${testInput}" ---`);
        const parsedTask = await (0, geminiClient_1.parseTaskInput)(testInput, projects);
        console.log('Gemini Structured Output:', JSON.stringify(parsedTask, null, 2));
        // 3. Write task to Notion
        console.log('\n--- 3. Writing task to Notion ---');
        const notionPage = await (0, notionClient_1.addTask)({
            name: parsedTask.name,
            priority: parsedTask.priority,
            estimate: parsedTask.estimate,
            dueDate: parsedTask.dueDate,
            projectId: parsedTask.projectId,
            checklist: parsedTask.checklist
        });
        const createdTaskId = notionPage.id;
        console.log(`Task created successfully in Notion! Page ID: ${createdTaskId}`);
        // 4. Retrieve task with blocks (verifying checklist retrieval)
        console.log('\n--- 4. Fetching task details and subtasks from Notion ---');
        const retrievedTask = await (0, notionClient_1.getTaskWithBlocks)(createdTaskId);
        console.log(`Retrieved task Name: "${retrievedTask.name}"`);
        console.log(`Estimate: ${retrievedTask.estimate}h`);
        console.log(`Subtasks Count: ${retrievedTask.checklist.length}`);
        retrievedTask.checklist.forEach((item, index) => {
            console.log(`  ${index + 1}. [${item.checked ? 'x' : ' '}] ${item.text} (ID: ${item.id})`);
        });
        // 5. Test Rollover logic (Simulate deferring this task)
        console.log('\n--- 5. Simulating Deferral / Rollover of the created task ---');
        // Halve original task estimate
        const newOriginalEstimate = retrievedTask.estimate * 0.5;
        console.log(`Calibrating original task estimate down to: ${newOriginalEstimate}h`);
        await (0, notionClient_1.updateTaskEstimate)(createdTaskId, newOriginalEstimate);
        // Complete original task
        console.log('Marking original task as Done...');
        await (0, notionClient_1.completeTask)(createdTaskId);
        // Clone task to next day with unchecked checklist items
        console.log('Cloning task to tomorrow with remaining checklist items...');
        const unchecked = retrievedTask.checklist.filter(item => !item.checked);
        const clonedPage = await (0, notionClient_1.cloneTaskForNextDay)(retrievedTask, unchecked);
        console.log(`Rollover task successfully created! Cloned Page ID: ${clonedPage.id}`);
        console.log('\n=== ALL LOCAL TESTS COMPLETED SUCCESSFULLY! ✅ ===');
    }
    catch (error) {
        console.error('\n❌ Test execution failed with error:', error);
    }
}
runLocalTest();
