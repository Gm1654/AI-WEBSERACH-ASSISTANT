import { NextResponse } from 'next/server';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { tavily } from '@tavily/core';

type TavilySearchResult = {
  title?: string;
  url?: string;
  content?: string;
  rawContent?: string;
  score?: number;
  publishedDate?: string;
  favicon?: string;
};

type TavilyExtractResult = {
  url?: string;
  rawContent?: string;
};

type SourceItem = {
  title: string;
  url: string;
  favicon?: string;
};

type ResearchPlan = {
  primaryQuery: string;
  supportingQueries: string[];
  topic: 'general' | 'news';
  timeRange?: 'day' | 'week' | 'month' | 'year';
  includeDomains?: string[];
  excludeDomains?: string[];
};

const FALLBACK_MESSAGE = 'I could not find verified information on this. Please try rephrasing.';

function stripCodeFences(value: string) {
  return value.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
}

function dedupeUrls(results: TavilySearchResult[]) {
  const seen = new Set<string>();

  return results.filter((result) => {
    const url = result.url?.trim();
    if (!url) return false;

    const normalized = url.replace(/\/$/, '').toLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function buildEvidenceBundle(results: TavilySearchResult[]) {
  return results
    .map((result, index) => {
      const content = (result.rawContent ?? result.content ?? '').trim() || 'No extract available.';

      return [
        `[${index + 1}] ${result.title ?? 'Untitled source'}`,
        `URL: ${result.url ?? 'Unknown URL'}`,
        result.publishedDate ? `Published: ${result.publishedDate}` : '',
        typeof result.score === 'number' ? `Relevance score: ${result.score.toFixed(3)}` : '',
        `Content: ${content}`,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
}

function stripExistingSourcesSection(answer: string) {
  return answer
    .replace(/\n## Sources[\s\S]*$/i, '')
    .replace(/\n# Sources[\s\S]*$/i, '')
    .trim();
}

function normalizeTitle(value: string | undefined, fallback: string) {
  return value?.trim() || fallback;
}

function buildSourceItems(results: TavilySearchResult[]): SourceItem[] {
  const items: SourceItem[] = [];

  results.forEach((result, index) => {
    const url = result.url?.trim();
    if (!url) return;

    items.push({
      title: normalizeTitle(result.title, `Source ${index + 1}`),
      url,
      favicon: result.favicon?.trim() || undefined,
    });
  });

  return items;
}

function parseResearchPlan(rawText: string, fallbackQuery: string): ResearchPlan {
  try {
    const parsed = JSON.parse(stripCodeFences(rawText));

    const supportingQueries = Array.isArray(parsed.supportingQueries)
      ? parsed.supportingQueries.filter((item: unknown) => typeof item === 'string' && item.trim())
      : [];

    const includeDomains = Array.isArray(parsed.includeDomains)
      ? parsed.includeDomains.filter((item: unknown) => typeof item === 'string' && item.trim())
      : undefined;

    const excludeDomains = Array.isArray(parsed.excludeDomains)
      ? parsed.excludeDomains.filter((item: unknown) => typeof item === 'string' && item.trim())
      : undefined;

    const topic = parsed.topic === 'news' ? 'news' : 'general';
    const timeRange = ['day', 'week', 'month', 'year'].includes(parsed.timeRange) ? parsed.timeRange : undefined;

    return {
      primaryQuery: typeof parsed.primaryQuery === 'string' && parsed.primaryQuery.trim()
        ? parsed.primaryQuery.trim()
        : fallbackQuery,
      supportingQueries: supportingQueries.slice(0, 3),
      topic,
      timeRange,
      includeDomains,
      excludeDomains,
    };
  } catch {
    return {
      primaryQuery: fallbackQuery,
      supportingQueries: [],
      topic: 'general',
    };
  }
}

export async function POST(req: Request) {
  try {
    const { query } = await req.json();

    if (!query || typeof query !== 'string' || query.trim() === '') {
      return NextResponse.json({ answer: "I didn't catch that. Could you repeat?" }, { status: 400 });
    }

    const queryText = query.trim();
    const timeSensitive = /\b(latest|today|now|current|recent|this week|this month|breaking|news|update|price|prices|release|released|announced|2026)\b/i.test(queryText);

    const llm = new ChatGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY,
      model: 'gemini-3.1-flash-lite',
      temperature: 0.2,
    });

    const searchOptimizationPrompt = `You are a web research planner for Tavily.

Return a single JSON object only, with this shape:
{
  "primaryQuery": "string",
  "supportingQueries": ["string", "string"],
  "topic": "general" | "news",
  "timeRange": "day" | "week" | "month" | "year" | null,
  "includeDomains": ["string"],
  "excludeDomains": ["string"]
}

Rules:
- primaryQuery must be the best Tavily search query for the user request
- supportingQueries should be short, distinct follow-up searches that cover adjacent angles
- use topic "news" and a timeRange when the question is time-sensitive or current-event oriented
- keep includeDomains/excludeDomains empty unless they clearly improve accuracy
- do not wrap the JSON in markdown or code fences

User request: "${queryText}"
Time sensitive: ${timeSensitive ? 'yes' : 'no'}`;

    const optimizedQueryResponse = await llm.invoke(searchOptimizationPrompt);
    const researchPlan = parseResearchPlan(
      typeof optimizedQueryResponse.content === 'string' ? optimizedQueryResponse.content : '',
      queryText
    );

    const optimizedQuery = researchPlan.primaryQuery || queryText;
    const searchQueries = [optimizedQuery, ...researchPlan.supportingQueries]
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 4);

    console.log('Original query:', queryText);
    console.log('Optimized query:', optimizedQuery);

    const tavilyClient = tavily({
      apiKey: process.env.TAVILY_API_KEY!,
    });

    const searchResponses = await Promise.all(
      searchQueries.map((searchQuery, index) =>
        tavilyClient.search(searchQuery, {
          maxResults: index === 0 ? 7 : 4,
          searchDepth: 'advanced',
          topic: researchPlan.topic,
          ...(researchPlan.timeRange ? { timeRange: researchPlan.timeRange } : {}),
          ...(researchPlan.includeDomains && researchPlan.includeDomains.length > 0
            ? { includeDomains: researchPlan.includeDomains }
            : {}),
          ...(researchPlan.excludeDomains && researchPlan.excludeDomains.length > 0
            ? { excludeDomains: researchPlan.excludeDomains }
            : {}),
          includeAnswer: false,
          includeRawContent: 'markdown',
        })
      )
    );

    const combinedSearchResults = dedupeUrls(
      searchResponses.flatMap((response) => response.results ?? [])
    ).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    console.log('Tavily search responses:', searchResponses.length);
    console.log('Tavily combined results:', combinedSearchResults.length);

    if (combinedSearchResults.length === 0) {
      return NextResponse.json({ answer: FALLBACK_MESSAGE });
    }

    const topUrls = combinedSearchResults.slice(0, 3).map((result) => result.url!).filter(Boolean);
    const extractResponse = topUrls.length > 0
      ? await tavilyClient.extract(topUrls, {
          extractDepth: 'advanced',
          format: 'markdown',
          query: optimizedQuery,
          chunksPerSource: 3,
          includeFavicon: true,
        })
      : null;

    const extractedByUrl = new Map<string, string>();
    extractResponse?.results?.forEach((result: TavilyExtractResult) => {
      if (result?.url && typeof result?.rawContent === 'string' && result.rawContent.trim()) {
        extractedByUrl.set(result.url.replace(/\/$/, '').toLowerCase(), result.rawContent.trim());
      }
    });

    const enrichedResults = combinedSearchResults.map((result) => {
      const key = result.url?.replace(/\/$/, '').toLowerCase() ?? '';
      const extractedContent = extractedByUrl.get(key);

      return {
        ...result,
        rawContent: extractedContent ?? result.rawContent,
      };
    });

    const resultsText = buildEvidenceBundle(enrichedResults);
    const sourceLines = enrichedResults
      .map((result, index) => `[${index + 1}] ${result.title ?? 'Untitled source'} - ${result.url ?? 'Unknown URL'}`)
      .join('\n');

    const systemPrompt = `You are an expert research assistant. You must answer only from the evidence bundle.

Goals:
- Provide an accurate, citation-backed answer grounded in the Tavily search and extraction results.
- Prefer specific facts over generic summaries.
- If the evidence is weak or conflicting, say so instead of guessing.
- Use markdown with a short direct answer first, then sections for details and sources.

Rules:
1. Use only facts present in the evidence bundle.
2. Do not invent details, statistics, dates, claims, or URLs.
3. Do not use bracket citations like [1], [4, 7], or similar numeric citation markers.
4. If the evidence does not support the answer, return exactly: ${FALLBACK_MESSAGE}
5. Do not write a Sources section. It will be appended separately from the verified Tavily URLs.

Evidence bundle:
${resultsText}

Source index:
${sourceLines}`;

    const finalResponse = await llm.invoke([
      ['system', systemPrompt],
      ['human', queryText],
    ]);

    const answer = typeof finalResponse.content === 'string'
      ? stripExistingSourcesSection(finalResponse.content)
      : FALLBACK_MESSAGE;

    const sources = buildSourceItems(enrichedResults);

    return NextResponse.json({ answer, sources });
  } catch (error) {
    console.error('Error processing query:', error);
    return NextResponse.json(
      { answer: FALLBACK_MESSAGE },
      { status: 500 }
    );
  }
}
