import { AgentSkill } from './base';
import { parseWeeklyPlan } from '../gemini/client';
import { BOT_MESSAGES } from '../constants/messages';
import { findProjectByName, countTasksInProject } from '../notion/client';
import { saveDraft } from '../services/stateManager';
import type { GeminiTaskOutput } from '../notion/types';

export interface PlannedTask {
  task: GeminiTaskOutput;
  projectId?: string;
  prefixedName: string;
}

export interface WeeklyPlanningInput {
  text: string;
  today: string;
}

export interface WeeklyPlanningOutput {
  draftId: string;
  drafts: PlannedTask[];
}

function newDraftId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export class WeeklyPlanningSkill implements AgentSkill<WeeklyPlanningInput, WeeklyPlanningOutput> {
  name = 'WeeklyPlanningSkill';
  description = 'Phân tích văn bản thành các task, tự động gán prefix theo project, và lưu nháp vào Firestore.';

  async execute(input: WeeklyPlanningInput): Promise<WeeklyPlanningOutput> {
    let parsed: GeminiTaskOutput[];
    try {
      parsed = await parseWeeklyPlan(input.text, input.today);
    } catch (error) {
      throw new Error(BOT_MESSAGES.ERRORS.AI_PLANNING_FAULT);
    }

    const drafts: PlannedTask[] = [];

    for (const t of parsed) {
      let projectId: string | undefined;
      let prefix = '';
      
      if (t.projectName) {
        const project = await findProjectByName(t.projectName);
        if (project) {
          projectId = project.id;
          const existingCount = await countTasksInProject(project.id);
          const currentBatchCount = drafts.filter((r) => r.projectId === project.id).length;
          prefix = `${t.projectName}_T${existingCount + currentBatchCount + 1}: `;
        } else {
          prefix = `[New Project] ${t.projectName}_T1: `;
        }
      }
      
      drafts.push({
        task: t,
        projectId,
        prefixedName: `${prefix}${t.name}`,
      });
    }

    const draftId = newDraftId();
    await saveDraft(draftId, drafts);

    return { draftId, drafts };
  }
}
