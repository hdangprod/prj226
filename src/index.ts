import type { HttpFunction } from '@google-cloud/functions-framework';
import { handleUpdate } from './router';

/**
 * GCP Cloud Functions HTTP entry point.
 * Thin wrapper: receives the Telegram webhook payload, responds 200 immediately,
 * then delegates all business logic to the router.
 */
export const helloHttp: HttpFunction = async (req, res) => {
  // Respond 200 immediately to prevent Telegram webhook retries (must be < 2s)
  res.status(200).send('OK');

  try {
    await handleUpdate(req.body);
  } catch (error) {
    console.error('[Webhook] Unhandled error in handleUpdate:', error);
  }
};
