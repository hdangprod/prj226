import { translateHighlight } from '../gemini/client';
import { getOrCreateDailyLog, updateDailyLogHighlight } from '../notion/client';

/**
 * FR-5: Translates highlight text to English via Gemini,
 * then updates today's Daily Log page in Notion.
 * getOrCreateDailyLog and translateHighlight run in parallel for speed.
 */
export async function updateHighlight(text: string, today: string): Promise<void> {
  const [translated, dailyLog] = await Promise.all([
    translateHighlight(text),
    getOrCreateDailyLog(today),
  ]);
  await updateDailyLogHighlight(dailyLog.id, translated);
}
