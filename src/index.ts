import type { HttpFunction } from '@google-cloud/functions-framework';
import { dispatch } from './sensors/eventDispatcher';
import { handleWorkerPayload } from './governance/intentRouter';
import { ingestMessage, processBuffer, isDebounceEnabled } from './sensors/debounceBuffer';
import { verifyQStashSignature } from './tools/qstashClient';

/**
 * GCP Cloud Functions HTTP entry point.
 * Matches routes via req.path:
 *   - /worker: Invoked by Cloud Tasks to process decoupled operations. Awaits execution.
 *   - /worker/process-buffer: Invoked by QStash to flush debounce buffer (MOD-07).
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

  // ─── MOD-07: QStash Debounce Buffer Flush Endpoint ───
  if (path === '/worker/process-buffer') {
    console.log('[Webhook] Received QStash process-buffer callback.');

    // ERR-04: Security — verify QStash signature
    const isValid = await verifyQStashSignature(req as any);
    if (!isValid) {
      console.warn('[Webhook] Rejected unauthorized process-buffer request.');
      res.status(401).send('Unauthorized');
      return;
    }

    try {
      const { chatId } = req.body;
      await processBuffer(chatId);
    } catch (error) {
      console.error('[Webhook] Error processing debounce buffer:', error);
    }
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
    // Callback queries are button presses — always process directly, never debounce
    if (req.body?.callback_query) {
      console.log('[Webhook] Callback query detected. Processing directly via intentRouter...');
      if (process.env.QUEUE_MODE === 'sync') {
        await handleWorkerPayload(req.body);
      } else {
        dispatch(req.body).catch((err) => {
          console.error('[Webhook] Failed to dispatch callback query:', err);
        });
      }
      res.status(200).send('OK');
      return;
    }

    // Reply Bypass (PRD MOD-07 Section 3.1 Yêu cầu 2 & MOD-08 Section 3.2 Yêu cầu 1)
    const isReplyMessage = Boolean(req.body?.message?.reply_to_message_id);
    if (isReplyMessage) {
      console.log('[Webhook] Debounce Bypass: Reply detected. Processing directly via intentRouter...');
      await handleWorkerPayload(req.body);
      res.status(200).send('OK');
      return;
    }

    // ─── MOD-07: Debounce Buffer Integration ───
    const chatId = req.body?.message?.chat?.id;
    const debounceEnabled = chatId && isDebounceEnabled(chatId);

    if (debounceEnabled) {
      const result = await ingestMessage(req.body);
      if (result === 'fallback') {
        // ERR-05: Redis unavailable → fail-open, dispatch directly
        console.warn('[Webhook] Redis unavailable. Fail-open: dispatching directly.');
        if (process.env.QUEUE_MODE === 'sync') {
          await dispatch(req.body);
        } else {
          dispatch(req.body).catch((err) => {
            console.error('[Webhook] Failed to dispatch payload asynchronously:', err);
          });
        }
      }
      // 'buffered' → message is in Redis, QStash timer scheduled. No further action.
    } else {
      // Debounce disabled → original behavior
      if (process.env.QUEUE_MODE === 'sync') {
        await dispatch(req.body);
      } else {
        dispatch(req.body).catch((err) => {
          console.error('[Webhook] Failed to dispatch payload asynchronously:', err);
        });
      }
    }
  } catch (error) {
    console.error('[Webhook] Error during payload dispatch:', error);
  }

  res.status(200).send('OK');
};
