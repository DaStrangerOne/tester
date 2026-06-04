import { useState, useCallback, useRef, useEffect } from 'react';
import { Message, ChatSession, createSession, sendMessage, generateSessionTitle } from '@/services/aiService';
import { saveSessions, loadSessions } from '@/services/sessionStorage';
import { appendExecLog } from '@/services/executionLog';
import { extractRunnableBlocks, runCode, formatExecResults, type ExecResult } from '@/services/autoExec';
import { getGodMode, GOD_MODE_SYSTEM_PROMPT } from '@/services/godUser';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTOEXEC_KEY = 'axiom:auto-exec';
const NORMAL_AUTOEXEC_MAX_HOPS = 3;     // safety cap when god mode is OFF
const GOD_AUTOEXEC_MAX_HOPS = 999;      // effectively unlimited when god mode is ON

export function useChat() {
  const [session, setSession] = useState<ChatSession | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [inputText, setInputText] = useState('');
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [autoExec, setAutoExecState] = useState<boolean>(true);
  const streamingIdRef = useRef<string | null>(null);

  const messages = (session?.messages || []).filter(m => m.role !== 'system');

  // Init: load sessions and create initial session (async, supports dynamic system prompt)
  useEffect(() => {
    let cancelled = false;
    Promise.all([loadSessions(), createSession(), AsyncStorage.getItem(AUTOEXEC_KEY)]).then(
      ([stored, newSess, savedAuto]) => {
        if (cancelled) return;
        setSessions(stored);
        setSession(newSess);
        setSessionsLoaded(true);
        if (savedAuto !== null) setAutoExecState(savedAuto === '1');
      }
    );
    return () => { cancelled = true; };
  }, []);

  const setAutoExec = useCallback((v: boolean) => {
    setAutoExecState(v);
    AsyncStorage.setItem(AUTOEXEC_KEY, v ? '1' : '0').catch(() => {});
  }, []);

  // Save current session whenever messages change
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!sessionsLoaded || !session) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      setSessions(prev => {
        const idx = prev.findIndex(s => s.id === session.id);
        let updated: ChatSession[];
        if (idx >= 0) {
          updated = [...prev];
          updated[idx] = session;
        } else {
          updated = [session, ...prev];
        }
        saveSessions(updated);
        return updated;
      });
    }, 800);
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, [session, sessionsLoaded]);

  // Internal: stream one LLM turn into a new assistant message.
  // Returns the final assistant content and the updated message list (post-turn).
  const runOneTurn = useCallback(async (
    convo: Message[],
    titleHint: string,
  ): Promise<{ finalContent: string; nextMessages: Message[] }> => {
    if (!session) return { finalContent: '', nextMessages: convo };

    const streamingId = `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    streamingIdRef.current = streamingId;

    const streamingMessage: Message = {
      id: streamingId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };

    const withStreaming = [...convo, streamingMessage];
    setSession(prev => prev ? {
      ...prev,
      messages: withStreaming,
      title: prev.title === 'New Session' && titleHint
        ? generateSessionTitle([...convo])
        : prev.title,
    } : prev);

    let finalContent = '';
    await sendMessage(convo, (chunk) => {
      finalContent = chunk;
      setSession(prev => prev ? {
        ...prev,
        messages: prev.messages.map(m =>
          m.id === streamingId ? { ...m, content: chunk, isStreaming: true } : m
        ),
      } : prev);
    });

    setSession(prev => prev ? {
      ...prev,
      messages: prev.messages.map(m =>
        m.id === streamingId ? { ...m, isStreaming: false } : m
      ),
    } : prev);

    const nextMessages: Message[] = [
      ...convo,
      { ...streamingMessage, content: finalContent, isStreaming: false },
    ];
    return { finalContent, nextMessages };
  }, [session]);

  const sendUserMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading || !session) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };

    setSession(prev => prev ? {
      ...prev,
      messages: [...prev.messages, userMessage],
    } : prev);
    setInputText('');
    setIsLoading(true);

    try {
      let convo: Message[] = [...session.messages, userMessage];

      // First LLM turn
      let { finalContent, nextMessages } = await runOneTurn(convo, text);
      convo = nextMessages;

      // Log the initial chat turn
      if (finalContent) {
        appendExecLog({
          type: 'chat',
          command: text.trim(),
          output: finalContent,
          isError: false,
          sessionId: session.id,
          tags: ['chat', 'axiom', 'ai-response'],
        }).catch(() => {});
      }

      // ── Auto-exec closed loop ────────────────────────────────────────────
      // If the AI emitted any executable code blocks AND auto-exec is on,
      // run them, append results as a visible message, then ask the AI to
      // continue. Cap depends on god mode.
      if (autoExec) {
        const godOn = await getGodMode().catch(() => false);
        const maxHops = godOn ? GOD_AUTOEXEC_MAX_HOPS : NORMAL_AUTOEXEC_MAX_HOPS;
        for (let hop = 0; hop < maxHops; hop++) {
          const blocks = extractRunnableBlocks(finalContent);
          if (blocks.length === 0) break;

          // Execute each block sequentially
          const results: ExecResult[] = [];
          for (const b of blocks) {
            try {
              const r = await runCode(b.code, b.lang);
              results.push(r);
              appendExecLog({
                type: 'terminal',
                command: `[${b.lang}] ${b.code}`,
                output: r.output,
                isError: !r.success,
                sessionId: session.id,
                tags: ['auto-exec', b.lang, r.success ? 'success' : 'failed'],
              }).catch(() => {});
            } catch (e: any) {
              results.push({
                lang: b.lang,
                code: b.code,
                output: `[runtime error] ${e?.message || e}`,
                exitCode: -1,
                durationMs: 0,
                success: false,
              });
            }
          }

          const resultMd = formatExecResults(results);
          const execMessage: Message = {
            id: `exec-${Date.now()}-${hop}`,
            role: 'user', // sent to LLM as user "tool result"; rendered with a special header in UI
            kind: 'tool',
            content: resultMd,
            timestamp: new Date(),
          };

          // Push the exec result into the visible conversation
          setSession(prev => prev ? {
            ...prev,
            messages: [...prev.messages, execMessage],
          } : prev);
          convo = [...convo, execMessage];

          // Ask the AI to interpret / decide next step
          ({ finalContent, nextMessages } = await runOneTurn(convo, ''));
          convo = nextMessages;
        }
      }
    } catch (err: any) {
      const errMsgId = `err-${Date.now()}`;
      setSession(prev => prev ? {
        ...prev,
        messages: [...prev.messages, {
          id: errMsgId,
          role: 'assistant',
          content: `⚠️ Error: ${err?.message || 'Connection failed. Retry.'}`,
          timestamp: new Date(),
        }],
      } : prev);
    } finally {
      setIsLoading(false);
      streamingIdRef.current = null;
    }
  }, [session, isLoading, autoExec, runOneTurn]);

  const newSession = useCallback(async () => {
    const fresh = await createSession();
    setSession(fresh);
    setInputText('');
    setIsLoading(false);
  }, []);

  const restoreSession = useCallback((s: ChatSession) => {
    setSession(s);
    setInputText('');
    setIsLoading(false);
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    setSessions(prev => {
      const updated = prev.filter(s => s.id !== sessionId);
      saveSessions(updated);
      return updated;
    });
    if (session?.id === sessionId) {
      const fresh = await createSession();
      setSession(fresh);
    }
  }, [session?.id]);

  const injectPrompt = useCallback((prompt: string) => {
    setInputText(prompt);
  }, []);

  // Callback ref so terminal screen can register itself
  const terminalRunRef = useRef<((code: string, lang: string) => void) | null>(null);

  const registerTerminalRunner = useCallback((fn: (code: string, lang: string) => void) => {
    terminalRunRef.current = fn;
  }, []);

  const runInTerminal = useCallback((code: string, lang = 'bash') => {
    if (terminalRunRef.current) {
      terminalRunRef.current(code, lang);
    }
  }, []);

  return {
    messages,
    isLoading,
    inputText,
    setInputText,
    sendUserMessage,
    newSession,
    restoreSession,
    deleteSession,
    injectPrompt,
    runInTerminal,
    registerTerminalRunner,
    autoExec,
    setAutoExec,
    sessionTitle: session?.title || 'New Session',
    sessions,
    currentSessionId: session?.id || '',
  };
}
