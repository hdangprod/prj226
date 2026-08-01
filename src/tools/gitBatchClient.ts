import type { Env } from '../config';
import type { PendingCapture } from './d1Client';
import { fetchWithRetry } from '../lib/fetchUtils';

interface GitRef { object: { sha: string } }
interface GitCommit { tree: { sha: string } }
interface GitBlob { sha: string }
interface GitTree { sha: string }
interface GitNewCommit { sha: string }

export async function batchCommitCaptures(captures: PendingCapture[], env: Env): Promise<void> {
  if (captures.length === 0) return;

  const headers = {
    Authorization: `token ${env.GITHUB_TOKEN}`,
    'User-Agent': 'PRJ226-Liam/4.1',
    'Content-Type': 'application/json',
  };
  const baseUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}`;

  const MAX_RETRIES = 3;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      // Step 1: Get current commit SHA of main branch dynamically
      const refRes = await fetchWithRetry(`${baseUrl}/git/refs/heads/main`, { headers });
      const currentCommitSha = (await refRes.json() as GitRef).object.sha;

      // Step 2: Get latest base tree SHA
      const commitRes = await fetchWithRetry(`${baseUrl}/git/commits/${currentCommitSha}`, { headers });
      const baseTreeSha = (await commitRes.json() as GitCommit).tree.sha;

      // Step 3: Create blobs for each capture
      const blobs = await Promise.all(captures.map(async (c) => {
        const res = await fetchWithRetry(`${baseUrl}/git/blobs`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ content: c.content, encoding: 'utf-8' }),
        });
        return (await res.json()) as GitBlob;
      }));

      // Step 4: Create tree anchored to current baseTreeSha
      const treeNodes = blobs.map((b, i) => ({
        path: captures[i].file_path,
        mode: '100644' as const,
        type: 'blob' as const,
        sha: b.sha,
      }));

      const treeRes = await fetchWithRetry(`${baseUrl}/git/trees`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ base_tree: baseTreeSha, tree: treeNodes }),
      });
      const newTreeSha = (await treeRes.json() as GitTree).sha;

      // Step 5: Create single commit pointing to latest currentCommitSha as parent
      const newCommitRes = await fetchWithRetry(`${baseUrl}/git/commits`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          parents: [currentCommitSha],
          tree: newTreeSha,
          message: `feat(inbox): batch capture ${captures.length} notes [skip ci]`,
        }),
      });
      const newCommitSha = (await newCommitRes.json() as GitNewCommit).sha;

      // Step 6: Update ref (fast-forward)
      await fetchWithRetry(`${baseUrl}/git/refs/heads/main`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ sha: newCommitSha, force: false }),
      });

      console.log(JSON.stringify({
        event: 'batch_commit_success',
        captures_count: captures.length,
        commit_sha: newCommitSha,
        timestamp: new Date().toISOString(),
      }));
      return; // Success
    } catch (error: any) {
      if (attempt < MAX_RETRIES && (error?.status === 422 || String(error?.message).includes('422'))) {
        console.warn(`[Git Push Collision 422] Retrying attempt ${attempt}/${MAX_RETRIES}...`);
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
        continue;
      }
      console.error(JSON.stringify({
        event: 'batch_commit_error',
        error: error instanceof Error ? error.message : String(error),
        captures_count: captures.length,
        timestamp: new Date().toISOString(),
      }));
      throw error;
    }
  }
}
