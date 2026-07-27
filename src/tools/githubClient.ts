/**
 * PRJ226 v3.0: GitHub Client (Tool Layer)
 *
 * Read-only access to the OKF GitHub Vault repository.
 * Used by knowledgeSearchSkill to retrieve full content of synthesized wiki entries.
 *
 * Operations:
 *   - listVaultFiles: list all .md files in the vault
 *   - getFileContent: fetch content of a specific OKF file
 *   - parseOKFMetadata: extract YAML front matter from OKF Markdown
 */

import type { Env } from '../config';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VaultFile {
  path: string;
  name: string;
  sha: string;
  size: number;
  downloadUrl: string;
}

export interface OKFDocument {
  path: string;
  title: string;
  content: string;
  tags: string[];
  category: string | null;
  rawMarkdown: string;
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class GitHubClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(env: Env) {
    this.baseUrl = `https://api.github.com/repos/${env.GITHUB_VAULT_REPO}`;
    this.headers = {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'PRJ226-Liam/3.0',
    };
  }

  /** List all Markdown files in the vault (recursive) */
  async listVaultFiles(directory = 'vault'): Promise<VaultFile[]> {
    const response = await fetch(
      `${this.baseUrl}/contents/${directory}`,
      { headers: this.headers },
    );

    if (!response.ok) {
      if (response.status === 404) return []; // Vault directory not yet created
      throw new Error(`GitHub API error ${response.status}: ${await response.text()}`);
    }

    const items = (await response.json()) as Array<{
      type: string;
      path: string;
      name: string;
      sha: string;
      size: number;
      download_url: string;
    }>;

    const files: VaultFile[] = [];
    for (const item of items) {
      if (item.type === 'file' && item.name.endsWith('.md')) {
        files.push({
          path: item.path,
          name: item.name,
          sha: item.sha,
          size: item.size,
          downloadUrl: item.download_url,
        });
      }
      // Note: recursive directory traversal omitted for simplicity;
      // OpenWiki typically writes flat files to the vault directory
    }

    return files;
  }

  /** Fetch the raw content of a vault file */
  async getFileContent(path: string): Promise<string> {
    const response = await fetch(
      `${this.baseUrl}/contents/${path}`,
      { headers: this.headers },
    );

    if (!response.ok) {
      throw new Error(`GitHub content fetch failed ${response.status}`);
    }

    const data = (await response.json()) as { content: string; encoding: string };

    if (data.encoding === 'base64') {
      // Cloudflare Workers: use atob for base64 decoding
      return atob(data.content.replace(/\n/g, ''));
    }

    return data.content;
  }

  /** Parse OKF YAML front matter + body from a Markdown file */
  parseOKFDocument(path: string, rawMarkdown: string): OKFDocument {
    const frontMatterMatch = rawMarkdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

    let title = path.split('/').pop()?.replace('.md', '') ?? 'Untitled';
    let tags: string[] = [];
    let category: string | null = null;
    let content = rawMarkdown;

    if (frontMatterMatch) {
      const yamlSection = frontMatterMatch[1];
      content = frontMatterMatch[2].trim();

      // Simple YAML key-value extraction (no full YAML parser needed)
      const titleMatch = yamlSection.match(/^title:\s*["']?(.+?)["']?\s*$/m);
      const tagsMatch = yamlSection.match(/^tags:\s*\[(.+?)\]\s*$/m);
      const categoryMatch = yamlSection.match(/^category:\s*["']?(.+?)["']?\s*$/m);

      if (titleMatch) title = titleMatch[1];
      if (tagsMatch) tags = tagsMatch[1].split(',').map((t) => t.trim().replace(/["']/g, ''));
      if (categoryMatch) category = categoryMatch[1];
    }

    return { path, title, content, tags, category, rawMarkdown };
  }
}
