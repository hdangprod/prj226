import { Client, Receiver } from '@upstash/qstash';

export const scheduledJobs: Array<{ chatId: number | string; delayMs: number; scheduledAt: number }> = [];

export function clearScheduledJobs(): void {
  scheduledJobs.length = 0;
}

export async function scheduleBufferFlush(chatId: number | string, delayMs: number): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    scheduledJobs.push({ chatId, delayMs, scheduledAt: Date.now() });
    return;
  }

  try {
    const client = new Client({ token: process.env.QSTASH_TOKEN! });
    await client.publishJSON({
      url: `${process.env.WORKER_URL}/worker/process-buffer`,
      body: { chatId: String(chatId) },
      delay: Math.ceil(delayMs / 1000),
    });
  } catch (error) {
    console.error('[QStashClient] Failed to schedule buffer flush', error);
  }
}

export async function verifyQStashSignature(req: { headers: Record<string, string | string[] | undefined>; body: any }): Promise<boolean> {
  if (process.env.NODE_ENV === 'test') {
    return true;
  }

  try {
    const receiver = new Receiver({
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
    });

    const signature = req.headers['upstash-signature'] as string;
    if (!signature) return false;
    
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    await receiver.verify({ signature, body });
    return true;
  } catch (error) {
    console.error('[QStashClient] Signature verification failed', error);
    return false;
  }
}
