import { NextResponse } from 'next/server';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { tavily } from '@tavily/core';

export async function POST(req: Request) {
  try {
    const { query } = await req.json();

    if (!query || typeof query !== 'string' || query.trim() === '') {
      return NextResponse.json({ answer: "I didn't catch that. Could you repeat?" }, { status: 400 });
    }

    const llm = new ChatGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY,
      model: "gemini-3.1-flash-lite",
      temperature: 0.3,
    });

    // STEP 1: Optimize query using LLM
    const searchOptimizationPrompt = `You are a search query optimizer. Convert the following voice transcript or question into a single highly targeted, research-grade search query.

Rules:
- Be precise and specific
- Use professional terminology
- Include the current year (2026) if time-relevant
- Output ONLY the search query — no quotes, no explanation, no extra text

Transcript: "${query.trim()}"`;

    const optimizedQueryResponse = await llm.invoke(searchOptimizationPrompt);
    const optimizedQuery = typeof optimizedQueryResponse.content === 'string'
      ? optimizedQueryResponse.content.trim()
      : query;

    console.log("Original query:", query);
    console.log("Optimized query:", optimizedQuery);

    // STEP 2: Call Tavily directly using official SDK
    const tavilyClient = tavily({
      apiKey: process.env.TAVILY_API_KEY!,
    });

    const searchResponse = await tavilyClient.search(optimizedQuery, {
      maxResults: 7,
      searchDepth: "advanced",
      includeAnswer: true,
    });

    const resultsText = searchResponse.results
      .map((r: any, i: number) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content}`)
      .join('\n\n');

    const tavilyAnswer = searchResponse.answer ? `Summary: ${searchResponse.answer}\n\n` : '';

    console.log("Tavily returned", searchResponse.results.length, "results");

    if (searchResponse.results.length === 0) {
      return NextResponse.json({ answer: "I could not find verified information on this. Please try rephrasing." });
    }

    // STEP 3: Generate rich markdown answer
    const systemPrompt = `You are an expert research assistant that delivers highly detailed, well-structured answers based on real-time web search results. 

Your answers must be rich in detail, beautifully formatted in Markdown, and 100% sourced from the search results provided below.

━━━━━━━━━━━━━━━━━━━━━━━━
MANDATORY RULES
━━━━━━━━━━━━━━━━━━━━━━━━
1. ONLY use information from the provided search results.
2. NEVER fabricate any facts, statistics, names, dates, or URLs.
3. If results don't contain the answer, say: "I could not find verified information on this. Please try rephrasing."
4. Always cite source URLs at the end.

━━━━━━━━━━━━━━━━━━━━━━━━
FORMATTING RULES
━━━━━━━━━━━━━━━━━━━━━━━━
- Use proper Markdown: **bold**, ## headers, numbered/bullet lists, tables where appropriate
- Start with a **bold one-line direct answer**
- Use ## for section headers
- Use tables for ranked/comparative data (e.g. top 10 lists → table with Rank, Name, Description columns)
- Use bullet points for features or sub-details
- Be thorough and detailed — give a COMPLETE, comprehensive answer
- End with a ## Sources section listing the real URLs from search results

━━━━━━━━━━━━━━━━━━━━━━━━
SEARCH RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━
${tavilyAnswer}${resultsText}`;

    const finalResponse = await llm.invoke([
      ["system", systemPrompt],
      ["human", query]
    ]);

    const answer = typeof finalResponse.content === 'string'
      ? finalResponse.content
      : "I could not find verified information on this. Please try rephrasing.";

    return NextResponse.json({ answer });

  } catch (error) {
    console.error("Error processing query:", error);
    return NextResponse.json(
      { answer: "I could not find verified information on this. Please try rephrasing." },
      { status: 500 }
    );
  }
}
