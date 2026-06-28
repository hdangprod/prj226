import type { HttpFunction } from '@google-cloud/functions-framework';
import { handleUpdate } from './router';

/**
 * GCP Cloud Functions HTTP entry point.
 * Thin wrapper: receives the Telegram webhook payload, responds 200 immediately,
 * then delegates all business logic to the router.
 */
export const helloHttp: HttpFunction = async (req, res) => {
  try {
    await handleUpdate(req.body);
  } catch (error) {
    console.error('[Webhook] Unhandled error in handleUpdate:', error);
  }
  
  // Bắt buộc phải phản hồi 200 SAU KHI xử lý xong, 
  // nếu không Cloud Functions sẽ đóng băng CPU và gây lỗi "query is too old"
  res.status(200).send('OK');
};
