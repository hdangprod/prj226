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

  // Bot Webhook Protection (PRD MOD-08 Section 3.2 Yêu cầu 5)
  if (req.body?.message?.from?.is_bot === true) {
    console.log('[Webhook] Bot Webhook Protection: Dropped update from bot user.');
    res.status(200).send('OK');
    return;
  }

  try {
    // Debounce Bypass (PRD MOD-08 Section 3.2 Yêu cầu 1)
    const isReplyMessage = Boolean(req.body?.message?.reply_to_message_id);
    if (isReplyMessage) {
      console.log('[Webhook] Debounce Bypass: Reply detected. Processing directly via intentRouter...');
      await handleWorkerPayload(req.body);
      res.status(200).send('OK');
      return;
    }

    if (process.env.QUEUE_MODE === 'sync') {
      await dispatch(req.body);
    } else {
      dispatch(req.body).catch((err) => {
        console.error('[Webhook] Failed to dispatch payload asynchronously:', err);
      });
    }
  } catch (error) {
    console.error('[Webhook] Error during payload dispatch:', error);
  }

  res.status(200).send('OK');
};
