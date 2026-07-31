import type { Env } from '../config';
import { fetchWithRetry } from '../lib/fetchUtils';

export interface OKFDocument {
  path: string;
  title: string;
  content: string;
  tags: string[];
  category: string | null;
  rawMarkdown: string;
}

export class GitHubReader {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(env: Env) {
    this.baseUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}`;
    this.headers = {
      Authorization: `token ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'PRJ226-Liam/4.1',
    };
  }

  /** Fetch blob content via Git Data API: GET /git/blobs/{sha} */
  async fetchBlob(sha: string): Promise<string> {
    const url = `${this.baseUrl}/git/blobs/${sha}`;
    const response = await fetchWithRetry(url, { headers: this.headers });
    const data = await response.json() as { content: string; encoding: string };
    
    if (data.encoding === 'base64') {
      return atob(data.content);
    }
    return data.content;
  }

  /** Parse OKF YAML front matter + body from a Markdown file */
  parseOKFDocument(path: string, rawMarkdown: string): OKFDocument {
    let title = '';
    let category: string | null = null;
    let tags: string[] = [];
    let content = rawMarkdown;

    const frontMatterMatch = rawMarkdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (frontMatterMatch) {
      const frontMatter = frontMatterMatch[1];
      content = frontMatterMatch[2].trim();

      const titleMatch = frontMatter.match(/^title:\s*(.*)$/m);
      if (titleMatch) title = titleMatch[1].replace(/^["']|["']$/g, '');

      const categoryMatch = frontMatter.match(/^category:\s*(.*)$/m);
      if (categoryMatch) category = categoryMatch[1].replace(/^["']|["']$/g, '');

      const tagsMatch = frontMatter.match(/^tags:\s*\[(.*)\]$/m);
      if (tagsMatch) {
        tags = tagsMatch[1].split(',').map(t => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      }
    }

    if (!title) {
      const h1Match = content.match(/^#\s+(.*)$/m);
      title = h1Match ? h1Match[1] : path.split('/').pop()?.replace('.md', '') || 'Untitled';
    }

    return { path, title, content, tags, category, rawMarkdown };
  }
}
