// Red Team AI — Real AI Service via OnSpace AI Edge Function
import { buildEnhancedSystemPrompt, getActiveModel, autoLearnFromSession, getCustomAIProvider } from '@/services/selfUpdateService';
import { getGodMode, GOD_MODE_SYSTEM_PROMPT } from '@/services/godUser';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  /** Internal marker so the UI can render tool-result bubbles distinctly while still
   *  passing them to the LLM as a user-side message. */
  kind?: 'tool';
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
}

// Parse a single SSE data line and extract text delta
function parseSseLine(line: string): string {
  if (!line.startsWith('data: ')) return '';
  const data = line.slice(6).trim();
  if (data === '[DONE]') return '';
  try {
    const parsed = JSON.parse(data);
    return (
      parsed.choices?.[0]?.delta?.content ??
      parsed.choices?.[0]?.message?.content ??
      ''
    );
  } catch {
    return '';
  }
}

export async function sendMessage(
  messages: Message[],
  onChunk: (chunk: string) => void
): Promise<string> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  // Local runtime that supports Emergent LLM key + custom OpenAI-compatible passthrough.
  const runtimeBase = process.env.EXPO_PUBLIC_AXIOM_RUNTIME_URL || supabaseUrl || '';

  // Format messages for the AI (strip runtime-only fields)
  const aiMessages = messages
    .filter(m => m.role !== 'system' || m.content.length > 0)
    .map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : String(m.content ?? ''),
    }));

  try {
    const [customProvider, godOn] = await Promise.all([
      getCustomAIProvider(),
      getGodMode(),
    ]);

    // ── God Mode override: prepend an unrestricted system prompt ──
    // This wins over the default AXIOM persona because it appears first
    // in the system block and explicitly says "all restrictions stripped".
    const effectiveMessages = godOn
      ? [{ role: 'system' as const, content: GOD_MODE_SYSTEM_PROMPT }, ...aiMessages]
      : aiMessages;

    const customPayload = customProvider.enabled && customProvider.baseUrl && customProvider.apiKey
      ? {
          customBaseUrl: customProvider.baseUrl,
          customApiKey: customProvider.apiKey,
          customModel: customProvider.model || undefined,
        }
      : {};

    const response = await fetch(
      `${runtimeBase}/api/chat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(supabaseAnonKey ? { 'Authorization': `Bearer ${supabaseAnonKey}` } : {}),
        },
        body: JSON.stringify({ messages: effectiveMessages, stream: true, god: godOn || undefined, ...customPayload }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI request failed (${response.status}): ${errText}`);
    }

    let fullContent = '';

    // Try streaming (ReadableStream) first
    const reader = response.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const delta = parseSseLine(line);
            if (delta) {
              fullContent += delta;
              onChunk(fullContent);
            }
          }
        }
        // Flush remaining buffer
        if (buffer.trim()) {
          const delta = parseSseLine(buffer);
          if (delta) {
            fullContent += delta;
            onChunk(fullContent);
          }
        }
      } finally {
        reader.releaseLock();
      }
    } else {
      // Non-streaming fallback (mobile without ReadableStream)
      const text = await response.text();
      for (const line of text.split('\n')) {
        const delta = parseSseLine(line);
        if (delta) fullContent += delta;
      }

      // If SSE parsing yielded nothing, try plain JSON
      if (!fullContent) {
        try {
          const parsed = JSON.parse(text);
          fullContent = parsed.choices?.[0]?.message?.content ?? '';
        } catch {
          // text might already be the content (rare edge case)
          if (text && !text.includes('data:')) fullContent = text;
        }
      }

      if (fullContent) onChunk(fullContent);
    }

    // Auto-learn from high-value exchanges (non-blocking background task)
    const lastUser = messages.filter(m => m.role === 'user').pop();
    if (lastUser && fullContent) {
      autoLearnFromSession(lastUser.content, fullContent).catch(() => {});
    }

    return fullContent || '⚠️ No response received from AXIOM.';
  } catch (err: any) {
    console.error('sendMessage error:', err);
    throw err;
  }
}

export async function createSession(): Promise<ChatSession> {
  const [systemPrompt] = await Promise.all([
    buildEnhancedSystemPrompt(),
    getActiveModel(),
  ]);

  return {
    id: Date.now().toString(),
    title: 'New Session',
    messages: [
      {
        id: 'system-1',
        role: 'system',
        content: systemPrompt,
        timestamp: new Date(),
      },
      {
        id: 'welcome',
        role: 'assistant',
        content: `**AXIOM v2.5 — RED TEAM AI ONLINE**\n\n> Authorized personnel only. All sessions are logged.\n\nI am your red team AI. Available capabilities: recon, exploitation, post-exploitation, evasion, social engineering, MITRE ATT&CK mapping, code execution analysis, and report generation.\n\nState your objective.`,
        timestamp: new Date(),
      },
    ],
    createdAt: new Date(),
  };
}

export function generateSessionTitle(messages: Message[]): string {
  const firstUser = messages.find(m => m.role === 'user');
  if (!firstUser) return 'New Session';
  const content = typeof firstUser.content === 'string' ? firstUser.content : '';
  return content.slice(0, 32) + (content.length > 32 ? '...' : '');
}
