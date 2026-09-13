import { Client } from '@notionhq/client';

export type NotionPage = {
  id: string;
  title: string;
  editedAt: string;
  url?: string;
};

export function notionConfigured(): boolean {
  return Boolean(process.env.NOTION_TOKEN);
}

function client(): Client {
  return new Client({ auth: process.env.NOTION_TOKEN });
}

/** Pulls the page title out of whichever property happens to hold it. */
function titleOf(page: Record<string, unknown>): string {
  const props = (page.properties ?? {}) as Record<string, Record<string, unknown>>;
  for (const prop of Object.values(props)) {
    if (prop?.type === 'title' && Array.isArray(prop.title)) {
      const text = (prop.title as Array<{ plain_text?: string }>)
        .map((t) => t.plain_text ?? '')
        .join('')
        .trim();
      if (text) return text;
    }
  }
  return 'Untitled';
}

/**
 * Pages shared with this integration, most recently edited first.
 *
 * A Notion integration can only see pages a human has explicitly connected to
 * it, so an empty list usually means "nothing shared yet" rather than a bad
 * token — which the UI says out loud.
 */
export async function listPages(limit = 25): Promise<NotionPage[]> {
  const res = await client().search({
    filter: { property: 'object', value: 'page' },
    sort: { direction: 'descending', timestamp: 'last_edited_time' },
    page_size: limit,
  });

  // The SDK returns a union of full and partial objects; only full pages carry
  // properties, so each result is widened once and checked structurally.
  return res.results
    .map((r) => r as unknown as Record<string, unknown>)
    .filter((page) => page.object === 'page' && Boolean(page.properties))
    .map((page) => ({
      id: String(page.id),
      title: titleOf(page),
      editedAt: String(page.last_edited_time ?? ''),
      url: typeof page.url === 'string' ? page.url : undefined,
    }));
}

const TEXTUAL_BLOCKS = new Set([
  'paragraph',
  'heading_1',
  'heading_2',
  'heading_3',
  'bulleted_list_item',
  'numbered_list_item',
  'to_do',
  'quote',
  'callout',
  'toggle',
  'code',
]);

function richText(block: Record<string, unknown>, type: string): string {
  const content = block[type] as { rich_text?: Array<{ plain_text?: string }> } | undefined;
  return (content?.rich_text ?? []).map((t) => t.plain_text ?? '').join('');
}

/**
 * Flattens a page into plain text.
 *
 * Notion returns children one level at a time, so nested blocks (toggles,
 * indented bullets) are fetched recursively — meeting notes are frequently
 * written as nested bullets, and skipping them would silently drop content.
 */
export async function getPageText(pageId: string): Promise<{ title: string; text: string }> {
  const notion = client();

  const page = (await notion.pages.retrieve({ page_id: pageId })) as unknown as Record<
    string,
    unknown
  >;
  const title = titleOf(page);

  const lines: string[] = [];

  async function walk(blockId: string, depth: number) {
    // Guard against pathological nesting rather than recursing forever.
    if (depth > 8) return;

    let cursor: string | undefined;
    do {
      const res = await notion.blocks.children.list({
        block_id: blockId,
        start_cursor: cursor,
        page_size: 100,
      });

      for (const raw of res.results) {
        const block = raw as unknown as Record<string, unknown>;
        const type = String(block.type ?? '');

        if (TEXTUAL_BLOCKS.has(type)) {
          const text = richText(block, type).trim();
          if (text) {
            const indent = '  '.repeat(depth);
            const bullet =
              type === 'bulleted_list_item' || type === 'to_do'
                ? '- '
                : type === 'numbered_list_item'
                  ? '1. '
                  : '';
            lines.push(`${indent}${bullet}${text}`);
          }
        }

        // Descend regardless of type. Containers that hold no text of their own
        // (columns, synced blocks, and Notion's `transcription` block from AI
        // meeting recordings) still wrap content that must not be skipped.
        if (block.has_children) await walk(String(block.id), depth + 1);
      }

      cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
    } while (cursor);
  }

  await walk(pageId, 0);

  return { title, text: lines.join('\n') };
}

export async function notionStatus(): Promise<{
  connected: boolean;
  pageCount?: number;
  reason?: string;
}> {
  if (!notionConfigured()) return { connected: false, reason: 'NOTION_TOKEN is not set' };
  try {
    const pages = await listPages(25);
    return { connected: true, pageCount: pages.length };
  } catch (err) {
    return { connected: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
