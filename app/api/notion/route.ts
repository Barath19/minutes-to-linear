import { getPageText, listPages, notionConfigured } from '@/lib/notion';

export const maxDuration = 120;

/** Lists pages shared with the integration. */
export async function GET() {
  if (!notionConfigured()) {
    return Response.json({ error: 'NOTION_TOKEN is not set' }, { status: 503 });
  }
  try {
    return Response.json({ pages: await listPages() });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}

/** Imports one page as plain text. */
export async function POST(req: Request) {
  const { pageId } = (await req.json()) as { pageId?: string };
  if (!pageId) return Response.json({ error: 'pageId is required' }, { status: 400 });
  if (!notionConfigured()) {
    return Response.json({ error: 'NOTION_TOKEN is not set' }, { status: 503 });
  }
  try {
    return Response.json(await getPageText(pageId));
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
