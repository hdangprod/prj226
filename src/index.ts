import type { HttpFunction } from '@google-cloud/functions-framework';
import { dispatch } from './sensors/eventDispatcher';
import { handleWorkerPayload } from './governance/intentRouter';

/**
 * GCP Cloud Functions HTTP entry point.
 * Matches routes via req.path:
 *   - /worker: Invoked by Cloud Tasks to process decoupled operations. Awaits execution.
 *   - default / webhook: Invoked by Telegram. Dispatches asynchronously and responds 200 OK immediately.
 */
export const helloHttp: HttpFunction = async (req, res) => {
  const path = req.path || '/';

  if (path === '/worker') {
    console.log('[Webhook] Received worker task callback.');
    try {
      await handleWorkerPayload(req.body);
    } catch (error) {
      console.error('[Webhook] Error processing worker task:', error);
    }
    // We must send a 200 OK to Cloud Tasks once done
    res.status(200).send('OK');
    return;
  }

  // Telegram webhook route
  console.log('[Webhook] Received Telegram update payload.');
  try {
    // Dispatch execution (async in cloud_tasks mode, sync inline in sync mode)
    // Note: dispatch is async but we do NOT await it here if in cloud_tasks mode
    // to allow early response, but we await it in sync mode to allow local tests to succeed.
    if (process.env.QUEUE_MODE === 'sync') {
      await dispatch(req.body);
    } else {
      // Fire-and-forget push to Cloud Tasks (which runs extremely fast)
      dispatch(req.body).catch((err) => {
        console.error('[Webhook] Failed to dispatch payload asynchronously:', err);
      });
    }
  } catch (error) {
    console.error('[Webhook] Error during payload dispatch:', error);
  }

  // Instantly return 200 OK to Telegram to avoid duplicates
  res.status(200).send('OK');
};
