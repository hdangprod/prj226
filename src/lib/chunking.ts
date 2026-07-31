export interface Chunk {
  id: string;
  title: string | null;
  content: string;
  chunkIndex: number;
  tags: string | null;
}

export interface ParsedFrontMatter {
  title: string | null;
  tags: string[] | null;
  body: string;
}

/**
 * Parses YAML front matter from a markdown string.
 */
export function parseFrontMatter(markdown: string): ParsedFrontMatter {
  let title: string | null = null;
  let tags: string[] | null = null;
  let body = markdown;

  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  if (match) {
    body = markdown.slice(match[0].length);
    const frontMatter = match[1];
    
    const titleMatch = frontMatter.match(/title:\s*"?([^"\n]+)"?/);
    if (titleMatch) title = titleMatch[1].trim();

    const tagsMatch = frontMatter.match(/tags:\s*\[?([^\]\n]+)\]?/);
    if (tagsMatch) {
      tags = tagsMatch[1]
        .split(',')
        .map((t) => t.trim().replace(/['"]/g, ''))
        .filter((t) => t.length > 0);
    }
  }

  return { title, tags, body };
}

/**
 * Chunks a markdown document by H2 (##) headings.
 */
export async function chunkByHeadings(markdown: string, githubPath: string): Promise<Chunk[]> {
  const { title: docTitle, tags, body } = parseFrontMatter(markdown);
  const tagsStr = tags ? JSON.stringify(tags) : null;

  const words = body.split(/\s+/).length;
  const hasH2 = /^## /m.test(body);

  if (!hasH2 || words < 300) {
    return [
      {
        id: await generateChunkId(githubPath, 0),
        title: docTitle || githubPath,
        content: markdown.trim(),
        chunkIndex: 0,
        tags: tagsStr,
      },
    ];
  }

  const chunks: Chunk[] = [];
  const parts = body.split(/^(## .*$)/m);
  
  let chunkIndex = 0;
  
  if (parts[0].trim()) {
    chunks.push({
      id: await generateChunkId(githubPath, chunkIndex),
      title: docTitle || githubPath,
      content: parts[0].trim(),
      chunkIndex,
      tags: tagsStr,
    });
    chunkIndex++;
  }

  for (let i = 1; i < parts.length; i += 2) {
    const heading = parts[i];
    const sectionContent = parts[i + 1] || '';
    const sectionTitle = heading.replace(/^## /, '').trim();
    const fullContent = `${heading}\n${sectionContent}`.trim();

    if (fullContent) {
      chunks.push({
        id: await generateChunkId(githubPath, chunkIndex),
        title: sectionTitle,
        content: fullContent,
        chunkIndex,
        tags: tagsStr,
      });
      chunkIndex++;
    }
  }

  return chunks;
}

/**
 * Generates a consistent UUID-like hash for a chunk based on its path and index.
 */
async function generateChunkId(githubPath: string, chunkIndex: number): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${githubPath}:${chunkIndex}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
}
