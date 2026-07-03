# AI Web Search Assistant

AI Web Search Assistant is a Next.js application that turns a text query or voice query into a research-backed answer using Gemini for planning and synthesis, plus Tavily for live web search and source extraction.

The project is designed to give more authentic, citation-oriented web answers than a plain chat response. Instead of relying on model memory, the app:

- rewrites the user question into a research plan
- searches the web through Tavily with multiple focused queries
- extracts the strongest sources for deeper evidence
- generates a final response grounded in the retrieved material

## Purpose

This project is useful when you want:

- current information instead of stale model-only answers
- a web search assistant that is grounded in live sources
- a voice-friendly interface for asking research questions
- markdown-formatted answers that are easy to read and copy

## Features

- Voice input using the browser speech recognition API
- Text input with instant query submission
- Tavily-powered live web search
- Multi-query research planning for better coverage
- Source extraction from the most relevant URLs
- Markdown rendering for structured answers
- Copy, edit, and regenerate workflow in the UI

## Tech Stack

- Next.js
- React
- TypeScript
- Gemini via `@langchain/google-genai`
- Tavily via `@tavily/core`
- Framer Motion

## Project Structure

- `app/page.tsx` - main chat and voice interface
- `app/api/ask/route.ts` - research pipeline and answer generation
- `types/lucide-react.d.ts` - local type declaration used by the build
- `.env.example` - sample environment variables

## Installation

1. Clone the repository.

```bash
git clone https://github.com/Gm1654/AI-WEBSERACH-ASSISTANT.git
cd AI-WEBSERACH-ASSISTANT
```

2. Install dependencies.

```bash
npm install
```

## Configuration

Create a `.env.local` file in the project root and add your API keys.

```env
GEMINI_API_KEY=your_gemini_api_key
TAVILY_API_KEY=your_tavily_api_key
```

Optional:

```env
GROQ_API_KEY=your_groq_api_key
```

Notes:

- `GEMINI_API_KEY` is required for query planning and final answer synthesis.
- `TAVILY_API_KEY` is required for live web search and source extraction.
- `GROQ_API_KEY` is not used by the main app flow right now, but it exists in the repo for helper scripts and future use.

You can also copy `.env.example` and fill in the values there.

## Running Locally

Start the development server:

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

## How To Use

1. Type a question in the input bar or click the microphone and speak.
2. Wait while the app plans the search and queries Tavily.
3. Read the Markdown answer that is generated from the retrieved sources.
4. Use the copy button to copy the response.
5. Use the edit button to refine the question and rerun the search.

## Available Scripts

- `npm run dev` - start the development server
- `npm run build` - create a production build
- `npm run start` - run the production server
- `npm run lint` - run ESLint

## Notes On Search Quality

The assistant is tuned to favor grounded web research over generic model output. It does this by:

- planning the search before querying Tavily
- running multiple searches for the same request
- extracting the best source pages
- instructing Gemini to answer only from the evidence bundle

If you ask a vague question, the result quality will still depend on how precise the query is. Specific questions usually produce better research.

## Troubleshooting

- If the app says it cannot find verified information, rephrase the question with more detail.
- If speech input does not work, try Chrome or Edge. Browser speech recognition support is limited.
- If the app fails to start, confirm your `.env.local` file contains valid API keys.
- If build or lint fails, run `npm install` again to restore dependencies.

## Deployment

This is a standard Next.js app, so it can be deployed to platforms like Vercel.

Before deploying, make sure these environment variables are configured in the target platform:

- `GEMINI_API_KEY`
- `TAVILY_API_KEY`

## License

No license file is currently included in the repository.
