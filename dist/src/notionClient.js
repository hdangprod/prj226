"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchProjects = fetchProjects;
exports.addTask = addTask;
exports.fetchTodayTasks = fetchTodayTasks;
exports.completeTask = completeTask;
exports.getTaskWithBlocks = getTaskWithBlocks;
exports.updateTaskEstimate = updateTaskEstimate;
exports.cloneTaskForNextDay = cloneTaskForNextDay;
const client_1 = require("@notionhq/client");
const NOTION_TOKEN = process.env.NOTION_TOKEN || '';
const PROJECTS_DB_ID = process.env.PROJECTS_DB_ID || '';
const TASKS_DB_ID = process.env.TASKS_DB_ID || '';
const notion = new client_1.Client({ auth: NOTION_TOKEN });
/**
 * Dynamically discover property names and types in a Notion Database.
 * This prevents crashes due to slight spelling or casing differences.
 */
async function getDbPropertiesMap(databaseId) {
    try {
        const db = await notion.databases.retrieve({ database_id: databaseId });
        const properties = db.properties;
        const mapping = {};
        for (const [name, prop] of Object.entries(properties)) {
            const lowerName = name.toLowerCase();
            if (prop.type === 'title') {
                mapping.name = name;
            }
            else if (prop.type === 'status') {
                mapping.status = { name, type: 'status' };
            }
            else if (prop.type === 'select') {
                if (lowerName.includes('status') && (!mapping.status || mapping.status.type === 'select')) {
                    mapping.status = { name, type: 'select' };
                }
                else if (lowerName.includes('priority') || lowerName.includes('ưu tiên') || lowerName.includes('độ ưu tiên')) {
                    mapping.priority = { name, type: 'select' };
                }
            }
            else if (prop.type === 'date') {
                if (lowerName.includes('date') || lowerName.includes('ngày') || lowerName.includes('timeline') || lowerName.includes('start/end')) {
                    mapping.date = name;
                }
            }
            else if (prop.type === 'number') {
                if (lowerName.includes('estimate') || lowerName.includes('giờ') || lowerName.includes('hour') || lowerName.includes('dự lượng')) {
                    mapping.estimate = name;
                }
            }
            else if (prop.type === 'relation') {
                if (lowerName.includes('project') || lowerName.includes('dự án')) {
                    mapping.project = name;
                }
            }
        }
        // Default Fallbacks
        return {
            name: mapping.name || 'Name',
            status: mapping.status || { name: 'Status', type: 'status' },
            priority: mapping.priority || { name: 'Priority', type: 'select' },
            date: mapping.date || 'Date',
            estimate: mapping.estimate || 'Estimate (Hours)',
            project: mapping.project || 'Project'
        };
    }
    catch (error) {
        console.error('Error retrieving database schema:', error);
        return {
            name: 'Name',
            status: { name: 'Status', type: 'status' },
            priority: { name: 'Priority', type: 'select' },
            date: 'Date',
            estimate: 'Estimate (Hours)',
            project: 'Project'
        };
    }
}
/**
 * Fetch all active projects from the Projects DB to provide matching context to Gemini.
 */
async function fetchProjects() {
    if (!PROJECTS_DB_ID)
        return [];
    try {
        const response = await notion.databases.query({
            database_id: PROJECTS_DB_ID,
        });
        return response.results.map(page => {
            const pageWithProps = page;
            const titleProperty = Object.values(pageWithProps.properties).find((prop) => prop.type === 'title');
            const name = titleProperty?.title[0]?.plain_text || 'Untitled Project';
            return {
                id: page.id,
                name: name
            };
        });
    }
    catch (error) {
        console.error('Error fetching projects:', error);
        return [];
    }
}
/**
 * Add a new task with checklist blocks into Notion Tasks DB.
 */
async function addTask({ name, priority, estimate, dueDate, projectId, checklist = [] }) {
    const propsMap = await getDbPropertiesMap(TASKS_DB_ID);
    const properties = {
        [propsMap.name]: {
            title: [{ text: { content: name } }]
        },
        [propsMap.status.name]: propsMap.status.type === 'status'
            ? { status: { name: 'To Do' } }
            : { select: { name: 'To Do' } },
        [propsMap.priority.name]: {
            select: { name: priority }
        },
        [propsMap.date]: {
            date: { start: dueDate }
        },
        [propsMap.estimate]: {
            number: parseFloat(estimate.toString()) || 1.0
        }
    };
    if (projectId) {
        properties[propsMap.project] = {
            relation: [{ id: projectId }]
        };
    }
    const children = checklist.map(item => ({
        object: 'block',
        type: 'to_do',
        to_do: {
            rich_text: [{ type: 'text', text: { content: item } }],
            checked: false
        }
    }));
    try {
        const response = await notion.pages.create({
            parent: { database_id: TASKS_DB_ID },
            properties: properties,
            children: children.length > 0 ? children : undefined
        });
        return response;
    }
    catch (error) {
        console.error('Error adding task to Notion:', error);
        throw error;
    }
}
/**
 * Fetch all uncompleted tasks scheduled for today or overdue.
 */
async function fetchTodayTasks() {
    const propsMap = await getDbPropertiesMap(TASKS_DB_ID);
    const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
    const filter = {
        and: [
            {
                property: propsMap.status.name,
                [propsMap.status.type]: propsMap.status.type === 'status'
                    ? { status: { does_not_equal: 'Done' } }
                    : { select: { does_not_equal: 'Done' } }
            },
            {
                or: [
                    {
                        property: propsMap.date,
                        date: { on_or_before: todayStr }
                    },
                    {
                        property: propsMap.date,
                        date: { is_empty: true }
                    }
                ]
            }
        ]
    };
    try {
        const response = await notion.databases.query({
            database_id: TASKS_DB_ID,
            filter: filter,
        });
        return response.results.map(page => {
            const pageWithProps = page;
            const name = pageWithProps.properties[propsMap.name]?.title[0]?.plain_text || 'Untitled Task';
            const priority = pageWithProps.properties[propsMap.priority.name]?.select?.name || 'Medium';
            const date = pageWithProps.properties[propsMap.date]?.date?.start || 'No Date';
            const estimate = pageWithProps.properties[propsMap.estimate]?.number || 0;
            const projectRelation = pageWithProps.properties[propsMap.project]?.relation || [];
            const projectId = projectRelation[0]?.id || null;
            return {
                id: page.id,
                name,
                priority,
                date,
                estimate,
                projectId
            };
        });
    }
    catch (error) {
        console.error('Error querying today\'s tasks:', error);
        throw error;
    }
}
/**
 * Complete a task (Set status to 'Done')
 */
async function completeTask(taskId) {
    const propsMap = await getDbPropertiesMap(TASKS_DB_ID);
    try {
        return await notion.pages.update({
            page_id: taskId,
            properties: {
                [propsMap.status.name]: propsMap.status.type === 'status'
                    ? { status: { name: 'Done' } }
                    : { select: { name: 'Done' } }
            }
        });
    }
    catch (error) {
        console.error(`Error completing task ${taskId}:`, error);
        throw error;
    }
}
/**
 * Get task details including child blocks (checklist items)
 */
async function getTaskWithBlocks(taskId) {
    const propsMap = await getDbPropertiesMap(TASKS_DB_ID);
    try {
        const page = await notion.pages.retrieve({ page_id: taskId });
        const blocksResponse = await notion.blocks.children.list({ block_id: taskId });
        const pageWithProps = page;
        const name = pageWithProps.properties[propsMap.name]?.title[0]?.plain_text || 'Untitled Task';
        const estimate = pageWithProps.properties[propsMap.estimate]?.number || 1.0;
        const projectRelation = pageWithProps.properties[propsMap.project]?.relation || [];
        const projectId = projectRelation[0]?.id || null;
        const priority = pageWithProps.properties[propsMap.priority.name]?.select?.name || 'Medium';
        const date = pageWithProps.properties[propsMap.date]?.date?.start || '';
        const checklistItems = blocksResponse.results
            .filter((block) => block.type === 'to_do')
            .map((block) => ({
            id: block.id,
            text: block.to_do.rich_text[0]?.plain_text || '',
            checked: block.to_do.checked
        }));
        return {
            id: page.id,
            name,
            estimate,
            projectId,
            priority,
            date,
            checklist: checklistItems
        };
    }
    catch (error) {
        console.error(`Error fetching task ${taskId} with blocks:`, error);
        throw error;
    }
}
/**
 * Update task estimate
 */
async function updateTaskEstimate(taskId, newEstimate) {
    const propsMap = await getDbPropertiesMap(TASKS_DB_ID);
    try {
        return await notion.pages.update({
            page_id: taskId,
            properties: {
                [propsMap.estimate]: { number: newEstimate }
            }
        });
    }
    catch (error) {
        console.error(`Error updating task estimate for ${taskId}:`, error);
        throw error;
    }
}
/**
 * Clones a task for the next day, prefixing the name with '[Rollover]' and copying unchecked items.
 */
async function cloneTaskForNextDay(originalTask, uncheckedItems = []) {
    const propsMap = await getDbPropertiesMap(TASKS_DB_ID);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }); // "YYYY-MM-DD"
    const newEstimate = parseFloat((originalTask.estimate * 0.5).toFixed(2)) || 0.5;
    const properties = {
        [propsMap.name]: {
            title: [{ text: { content: `[Rollover] ${originalTask.name}` } }]
        },
        [propsMap.status.name]: propsMap.status.type === 'status'
            ? { status: { name: 'To Do' } }
            : { select: { name: 'To Do' } },
        [propsMap.priority.name]: {
            select: { name: originalTask.priority }
        },
        [propsMap.date]: {
            date: { start: tomorrowStr }
        },
        [propsMap.estimate]: {
            number: newEstimate
        }
    };
    if (originalTask.projectId) {
        properties[propsMap.project] = {
            relation: [{ id: originalTask.projectId }]
        };
    }
    const children = uncheckedItems.map(item => ({
        object: 'block',
        type: 'to_do',
        to_do: {
            rich_text: [{ type: 'text', text: { content: item.text } }],
            checked: false
        }
    }));
    try {
        return await notion.pages.create({
            parent: { database_id: TASKS_DB_ID },
            properties: properties,
            children: children.length > 0 ? children : undefined
        });
    }
    catch (error) {
        console.error('Error cloning task for next day:', error);
        throw error;
    }
}
