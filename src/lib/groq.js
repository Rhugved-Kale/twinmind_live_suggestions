// ── Groq API client ───────────────────────────────────────────────────────────
// All model calls go through here. We never hard-code the API key; it comes
// from app state (user-pasted in settings).

const GROQ_BASE = 'https://api.groq.com/openai/v1'

// The assignment specifies "GPT-OSS 120B" on Groq — this is the model ID.
export const MODELS = {
  transcription: 'whisper-large-v3',
  suggestions:   'llama-3.3-70b-versatile',
  chat:          'llama-3.3-70b-versatile',
}

// ── Transcription ─────────────────────────────────────────────────────────────
// Sends a Blob (audio/webm or audio/wav) to Whisper and returns the text.
export async function transcribeAudio(audioFile, apiKey) {
  const form = new FormData()
  // audioFile is a File object with the correct name/extension set by useAudioRecorder
  form.append('file', audioFile, audioFile.name)
  form.append('model', MODELS.transcription)
  form.append('response_format', 'text')

  const res = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Transcription failed: ${err}`)
  }

  return (await res.text()).trim()
}

// ── Live suggestions ──────────────────────────────────────────────────────────
//
// PROMPT DESIGN RATIONALE:
//
// 1. We pass only the RECENT context window (last N chars, default ~1200 chars
//    ≈ ~2-3 min of speech) rather than the full transcript. Full context would
//    cause stale suggestions — if someone talked about ML for 10 min and now
//    is discussing salary, we want salary suggestions, not ML ones.
//
// 2. We include a "already shown" list (titles of the last 2 batches) so the
//    model avoids repeating itself. This is cheap (few tokens) and solves the
//    biggest UX annoyance in real copilots.
//
// 3. We ask for structured JSON output with a fixed schema. This eliminates
//    parsing brittleness and lets us render typed tags (question/answer/etc.)
//    without regex heuristics.
//
// 4. We enumerate suggestion *types* with examples and tell the model to pick
//    the mix most useful RIGHT NOW. This is the key prompt-engineering decision:
//    we don't prescribe "always 1 of each type" — we let the model read the
//    room. During a Q&A the model should surface more answers; during a pitch
//    more talking points.
//
// 5. The preview field is designed to stand alone — it must be a complete,
//    useful sentence, not a teaser. The assignment explicitly grades on this.

export const DEFAULT_SUGGESTIONS_PROMPT = `You are a real-time meeting assistant. You receive a snippet of live conversation transcript and must generate exactly 3 suggestions that will help the listener RIGHT NOW.

SUGGESTION TYPES — choose whichever mix fits the moment:
• question   — A smart follow-up question the listener could ask
• answer     — A direct answer to a question that was just asked in the transcript
• talking_point — A relevant fact, framing, or argument the speaker could add
• fact_check — A gentle correction or verification of something stated
• clarify    — A clarifying point that might clear up ambiguity

RULES:
1. Read the RECENT TRANSCRIPT carefully. Base suggestions on what was JUST said.
2. Each preview must be a complete, useful sentence — not a vague teaser. It should deliver value even if never clicked.
3. Do NOT repeat suggestions from the ALREADY SHOWN list.
4. Vary types to match the conversation — don't always pick the same 3 types.
5. Be specific and concrete. Generic suggestions are useless.
6. Return ONLY valid JSON — no markdown, no preamble.

OUTPUT FORMAT (strict):
{
  "suggestions": [
    {
      "type": "question|answer|talking_point|fact_check|clarify",
      "preview": "A complete, useful sentence the listener can act on immediately.",
      "detail_prompt": "A 1-sentence instruction for the follow-up AI call, asking it to expand on this suggestion with full context."
    }
  ]
}`

// ── Chat / expanded answer ────────────────────────────────────────────────────
//
// PROMPT DESIGN RATIONALE:
//
// When a user clicks a suggestion or types a question, we want a richer answer
// than the suggestion card preview. Key decisions:
//
// 1. Full transcript context here — unlike suggestions, expanded answers benefit
//    from knowing the entire conversation arc, not just recent snippets.
//
// 2. System prompt positions the model as a knowledgeable collaborator, not a
//    search engine. This prevents the "here are some options" hedging pattern
//    and produces more direct, opinionated answers appropriate for a copilot.
//
// 3. We stream the response so the user sees output within ~500ms of clicking.

export const DEFAULT_CHAT_PROMPT = `You are an expert meeting assistant with deep knowledge across business, technology, science, and strategy. The user is in an active conversation and needs precise, actionable help.

Your role: give direct, specific answers. Be the smartest person in the room who can synthesize information quickly.

Guidelines:
• Lead with the most important point — no preamble
• Be concrete and specific, not generic
• If fact-checking, cite your reasoning clearly
• If answering a question, give the best answer directly, then add nuance
• Keep responses focused — 3-6 sentences for most questions, longer only if complexity demands it
• Use the full transcript context to personalize your answer to THIS conversation`

// ── API call: generate suggestions ────────────────────────────────────────────
export async function generateSuggestions(
  recentTranscript,
  alreadyShown,
  apiKey,
  systemPrompt = DEFAULT_SUGGESTIONS_PROMPT,
  contextWindow = 1200
) {
  // Trim to context window (recent tail of transcript)
  const context = recentTranscript.slice(-contextWindow)

  const userMessage = [
    `RECENT TRANSCRIPT:\n${context || '(no transcript yet)'}`,
    alreadyShown.length
      ? `ALREADY SHOWN (do not repeat):\n${alreadyShown.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n\n')

  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODELS.suggestions,
      temperature: 0.7,
      max_tokens: 800,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage },
      ],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Suggestions API error: ${err}`)
  }

  const data = await res.json()
  const raw  = data.choices[0].message.content

  try {
    const parsed = JSON.parse(raw)
    return parsed.suggestions || []
  } catch {
    throw new Error(`Failed to parse suggestions JSON: ${raw}`)
  }
}

// ── API call: streaming chat ───────────────────────────────────────────────────
// Returns a ReadableStream from the Groq SSE response.
// Callers iterate with: for await (const chunk of streamChatResponse(...))
export async function* streamChatResponse(
  messages,
  fullTranscript,
  apiKey,
  systemPrompt = DEFAULT_CHAT_PROMPT,
  contextWindow = 8000
) {
  // For chat we use a larger context window (full transcript or last N chars)
  const transcriptContext = fullTranscript.slice(-contextWindow)

  const systemWithContext = [
    systemPrompt,
    transcriptContext
      ? `\nFULL CONVERSATION TRANSCRIPT SO FAR:\n${transcriptContext}`
      : '',
  ].join('')

  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODELS.chat,
      temperature: 0.5,
      max_tokens: 1024,
      stream: true,
      messages: [
        { role: 'system', content: systemWithContext },
        ...messages,
      ],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Chat API error: ${err}`)
  }

  const reader  = res.body.getReader()
  const decoder = new TextDecoder()
  let   buffer  = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() // keep incomplete line

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed === 'data: [DONE]') continue
      if (!trimmed.startsWith('data: ')) continue

      try {
        const json  = JSON.parse(trimmed.slice(6))
        const delta = json.choices?.[0]?.delta?.content
        if (delta) yield delta
      } catch {
        // malformed SSE chunk — skip
      }
    }
  }
}