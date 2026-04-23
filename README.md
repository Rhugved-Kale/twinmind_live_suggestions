# TwinMind — Live Suggestions

A web app that listens to live audio from your mic, transcribes it every ~30s using Groq Whisper, and continuously surfaces 3 contextual suggestions based on what is being said. Clicking a suggestion opens a detailed streaming answer in the chat panel.

Built as a TwinMind engineering assignment.

---

## Live Demo

Vercel URL: 

---

## Stack

- **Frontend**: React 18 + Vite (pure client-side, no backend)
- **Transcription**: Groq Whisper Large V3 via `audio/transcriptions`
- **Suggestions + Chat**: `moonshotai/kimi-k1.5-32k` on Groq (GPT-OSS 120B)
- **Audio capture**: MediaRecorder API, chunked at 30s intervals
- **Deployment**: Vercel (static export)

No backend, no login, no data persistence. The user's Groq API key is stored only in React state and never leaves the browser except in direct calls to Groq's API.

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Start dev server
npm run dev
# Opens at http://localhost:5173

# 3. Build for production
npm run build

# 4. Preview production build locally
npm run preview
```

Open the app, click **Add API Key** in the top right, paste your Groq API key from [console.groq.com](https://console.groq.com), and save. Then click the mic button to start.

---

## Deploying to Vercel

```bash
# Install Vercel CLI if needed
npm i -g vercel

# Deploy (first time sets up the project)
vercel

# Subsequent deployments
vercel --prod
```

Vercel auto-detects Vite projects. The `vercel.json` handles SPA routing rewrites.

Alternatively: push to GitHub and connect the repo to Vercel via the dashboard — it will build and deploy automatically on every push.

---

## Prompt Strategy

### Live Suggestions (`moonshotai/kimi-k1.5-32k`)

**Context passed**: The last 1,200 characters of transcript (~2-3 minutes of speech). This is intentionally narrow — passing the full transcript causes stale suggestions. If someone has been discussing ML for 10 minutes and just pivoted to budget, we want budget suggestions.

**Anti-repetition**: The previews from the last 2 suggestion batches are passed as "already shown" so the model doesn't repeat itself.

**Output format**: Strict JSON `{ suggestions: [{ type, preview, detail_prompt }] }`. Using `response_format: { type: 'json_object' }` eliminates markdown fences and parsing brittleness.

**Type selection**: The model is given 5 suggestion types (question, answer, talking_point, fact_check, clarify) and instructed to pick whichever mix fits the moment. The assignment explicitly says the mix should vary by context — so we don't hardcode "1 of each." During a Q&A, the model surfaces more answers; during a pitch, more talking points. This is the key judgment call.

**Preview quality**: The prompt explicitly instructs that each preview must be a complete, useful sentence that stands alone without clicking. This matches the assignment rubric point that "the preview alone should already deliver value."

### Chat / Expanded Answers (`moonshotai/kimi-k1.5-32k`, streamed)

**Context passed**: Full transcript up to 8,000 characters (configurable). For expanded answers, historical context matters — a question asked in minute 2 might be relevant to what's being said in minute 15.

**System prompt**: Positions the model as a direct, knowledgeable collaborator. The instruction to "lead with the most important point" prevents the model from burying the answer in caveats.

**Streaming**: First token arrives in ~300-600ms via Groq's SSE endpoint. The streaming cursor is shown during generation.

### Tradeoffs considered

| Decision | Choice | Alternative considered |
|---|---|---|
| Context window for suggestions | Recent 1,200 chars | Full transcript — caused stale suggestions |
| Suggestion type selection | Model decides per context | Hardcoded 1-of-each — too rigid |
| Output format | JSON schema | Free text — unreliable parsing |
| Transcription timing | 30s MediaRecorder chunks | Continuous stream — higher cost, more complexity |
| Architecture | Pure client-side | Next.js API routes — unnecessary for this use case |

---

## Project Structure

```
src/
  components/
    TranscriptColumn.jsx   # Left column: mic + transcript
    SuggestionsColumn.jsx  # Middle column: suggestion batches
    ChatColumn.jsx         # Right column: streaming chat
    SettingsPanel.jsx      # Overlay: API key + prompt editing
  hooks/
    useAudioRecorder.js    # MediaRecorder + 30s chunk emission
    useAutoRefresh.js      # 30s interval tied to recording state
  lib/
    groq.js                # All Groq API calls + default prompts
    export.js              # Session JSON export
  styles/
    global.css             # All styles (CSS variables, layout, components)
  App.jsx                  # Root — all state, all handlers
  main.jsx                 # Entry point
```

---

## Known limitations

- **No backend**: API key is visible in browser memory (DevTools). Acceptable for an assignment; a production version would proxy through a server.
- **30s transcription delay**: First transcript chunk appears 30s after recording starts. This is a deliberate tradeoff — shorter chunks cost more and the spec says "every ~30s."
- **Safari**: MediaRecorder support on Safari is limited; tested on Chrome and Firefox.
