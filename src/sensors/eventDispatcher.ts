import { CloudTasksClient } from '@google-cloud/tasks';
import { handleWorkerPayload } from '../governance/intentRouter';

const client = new CloudTasksClient();

export async function dispatch(payload: any): Promise<void> {
  const queueMode = process.env.QUEUE_MODE || 'sync';

  if (queueMode === 'sync') {
    console.log('[EventDispatcher] Synchronous execution mode (sync). Executing inline...');
    // We run it asynchronously but do not wait for it here if the caller wants early returns,
    // but in local tests, we want to await it so we can verify results!
    // So we await it here.
    await handleWorkerPayload(payload);
    return;
  }

  if (queueMode === 'cloud_tasks') {
    console.log('[EventDispatcher] Asynchronous execution mode (cloud_tasks). Pushing to Cloud Tasks...');

    const projectId = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
    const location = process.env.GCP_LOCATION;
    const queueName = process.env.GCP_QUEUE_NAME;
    const workerUrl = process.env.WORKER_URL;

    if (!projectId || !location || !queueName || !workerUrl) {
      throw new Error(
        `[EventDispatcher] Missing Cloud Tasks configurations. ` +
        `Required envs: GCP_PROJECT_ID, GCP_LOCATION, GCP_QUEUE_NAME, WORKER_URL`
      );
    }

    const queuePath = client.queuePath(projectId, location, queueName);

    const task: any = {
      httpRequest: {
        httpMethod: 'POST',
        url: workerUrl,
        headers: {
          'Content-Type': 'application/json',
        },
        body: Buffer.from(JSON.stringify(payload)).toString('base64'),
      },
    };

    // If a service account email is set, add OIDC token for secure authentication
    if (process.env.GCP_SERVICE_ACCOUNT_EMAIL) {
      task.httpRequest.oidcToken = {
        serviceAccountEmail: process.env.GCP_SERVICE_ACCOUNT_EMAIL,
      };
    }

    await client.createTask({
      parent: queuePath,
      task: task,
    });

    console.log('[EventDispatcher] Task pushed successfully to Cloud Tasks.');
  }
}
