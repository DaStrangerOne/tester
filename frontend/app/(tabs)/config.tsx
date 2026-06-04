/**
 * CONFIG — Advanced System Configuration & Internals
 * Full transparent view of all runtime, service, edge function,
 * storage, and AI configuration behind the entire project.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  Switch, TextInput, Modal, ActivityIndicator,
  KeyboardAvoidingView, Platform, Animated, Easing,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import {
  getSystemPrompt, setSystemPrompt, resetSystemPrompt,
  getActiveModel, setActiveModel, loadKnowledgeBase, addKnowledgeEntry,
  deleteKnowledgeEntry, getUpdateLog, MODELS, DEFAULT_SYSTEM_PROMPT,
  KnowledgeEntry, UpdateLogEntry, loadUIPatches,
  getCustomAIProvider, setCustomAIProvider, clearCustomAIProvider, CustomAIProvider,
} from '@/services/selfUpdateService';
import { loadSessions } from '@/services/sessionStorage';
import { MITRE_TECHNIQUES, MITRE_TACTICS } from '@/constants/mitre';
import { PROMPT_TEMPLATES } from '@/constants/prompts';
import { getGodMode, setGodMode } from '@/services/godUser';

const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

// ── All environment & secret values ──────────────────────────────────────────────
const ENV_VARS = [
  {
    key: 'EXPO_PUBLIC_SUPABASE_URL',
    label: 'Backend URL',
    value: process.env.EXPO_PUBLIC_SUPABASE_URL || '(not set)',
    category: 'Client',
    sensitive: false,
  },
  {
    key: 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    label: 'Anon / Public Key',
    value: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '(not set)',
    category: 'Client',
    sensitive: true,
  },
];

// Secrets stored in OnSpace Cloud Backend (server-side only)
const BACKEND_SECRETS: { key: string; label: string; category: string; note: string }[] = [
  { key: 'ONSPACE_AI_API_KEY',        label: 'OnSpace AI API Key',         category: 'AI',       note: 'Used by axiom-chat edge function'  },
  { key: 'ONSPACE_AI_BASE_URL',       label: 'OnSpace AI Base URL',        category: 'AI',       note: 'Used by axiom-chat edge function'  },
  { key: 'SUPABASE_URL',              label: 'Supabase URL (server)',       category: 'Backend',  note: 'Server-side DB access'             },
  { key: 'SUPABASE_ANON_KEY',         label: 'Supabase Anon Key (server)', category: 'Backend',  note: 'Server-side auth'                  },
  { key: 'SUPABASE_SERVICE_ROLE_KEY', label: 'Service Role Key',           category: 'Backend',  note: 'Admin DB access — never expose'    },
  { key: 'SUPABASE_DB_URL',           label: 'Database URL',               category: 'Backend',  note: 'Direct Postgres connection string' },
];

// ── All AsyncStorage keys used across the project ──────────────────────────────
const ALL_STORAGE_KEYS = [
  { key: 'axiom_system_prompt',    label: 'System Prompt',     category: 'AI Core'     },
  { key: 'axiom_model',            label: 'Active Model',      category: 'AI Core'     },
  { key: 'axiom_knowledge_base',   label: 'Knowledge Base',    category: 'AI Core'     },
  { key: 'axiom_update_log',       label: 'Update Log',        category: 'AI Core'     },
  { key: 'axiom_ui_patches',       label: 'UI Patches',        category: 'AI Core'     },
  { key: 'axiom_sessions',         label: 'Chat Sessions',     category: 'Sessions'    },
  { key: 'axiom_exec_log',         label: 'Execution Log',     category: 'Terminal'    },
  { key: 'axiom_attack_storage',   label: 'Attack Records',    category: 'Operations'  },
];

// ── Edge function endpoint descriptors ─────────────────────────────────────────
const EDGE_FUNCTIONS = [
  {
    name: 'axiom-chat',
    method: 'POST',
    path: '/api/functions/v1/axiom-chat',
    streaming: true,
    auth: 'anon-key',
    model: 'configurable',
    description: 'Primary AI inference relay. Routes to OnSpace AI API. Supports SSE streaming with configurable model selection.',
    requestSchema: '{ messages: [{role, content}], stream?: boolean, model?: string }',
    responseSchema: 'text/event-stream (SSE) | application/json',
    runtimes: ['google/gemini-3-flash-preview', 'google/gemini-3-pro-preview', 'openai/gpt-5.1', 'openai/gpt-5-mini', 'google/gemini-2.5-flash-lite'],
    envVars: ['ONSPACE_AI_API_KEY', 'ONSPACE_AI_BASE_URL'],
    timeout: 'default Deno limit',
    cors: true,
  },
  {
    name: 'code-exec',
    method: 'POST',
    path: '/api/functions/v1/code-exec',
    streaming: false,
    auth: 'anon-key',
    model: 'N/A',
    description: 'Real sandboxed Linux code execution via Piston API. Supports 14 language runtimes. Falls back across multiple Piston endpoints.',
    requestSchema: '{ language: string, code: string, stdin?: string, args?: string[] }',
    responseSchema: '{ success, exitCode, stdout, stderr, compileStdout, compileStderr, output, runtime, version }',
    runtimes: ['bash@5.2.0','python@3.10.0','javascript@18.15.0','typescript@5.0.3','go@1.16.2','rust@1.50.0','ruby@3.0.1','c@10.2.0','c++@10.2.0','php@8.0.2','perl@5.36.0','lua@5.4.4','powershell@7.1.4'],
    envVars: ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
    timeout: '20000ms per Piston endpoint, 25000ms client-side abort',
    cors: true,
  },
];

// ── Piston sandbox endpoints ───────────────────────────────────────────────────
const PISTON_ENDPOINTS = [
  { url: 'https://emkc.org/api/v2/piston/execute',          primary: true  },
  { url: 'https://piston.oncompute.com/api/v2/piston/execute', primary: false },
];

// ── AI streaming pipeline config ───────────────────────────────────────────────
const STREAMING_CONFIG = {
  protocol: 'SSE (Server-Sent Events)',
  format: 'data: {choices:[{delta:{content}}]}\n\n',
  terminator: 'data: [DONE]',
  fallback: 'ReadableStream unavailable → full response.text()',
  bufferStrategy: 'line-by-line split on \\n',
  chunkAccumulation: 'progressive string concat → onChunk(fullContent)',
  errorHandling: 'FunctionsHttpError with context.text() extraction',
  readerRelease: 'reader.releaseLock() in finally block',
};

// ── Self-update engine config ──────────────────────────────────────────────────
const SELF_UPDATE_CONFIG = {
  autoLearnTriggers: ['CVE-', 'T1', 'exploit', 'bypass', 'technique', 'tool', 'payload'],
  autoLearnSummaryLength: 300,
  kbContextLimit: 10,
  updateLogMaxEntries: 100,
  uiPatchesMaxEntries: 50,
  updateTypes: ['prompt', 'knowledge', 'model', 'persona'],
  knowledgeSources: ['manual', 'learned', 'ai-generated'],
};

// ── Session storage config ─────────────────────────────────────────────────────
const SESSION_CONFIG = {
  storageKey: 'axiom_sessions',
  maxSessions: 50,
  autoSaveDebounce: '800ms',
  dateRehydration: true,
  systemMessagesFiltered: true,
  titleGeneration: 'first user message (32 chars)',
};

type ConfigSection = 'overview' | 'runtime' | 'storage' | 'edge' | 'ai' | 'prompt' | 'kb' | 'env' | 'users' | 'artifact';

/**
 * GOD MODE control panel. When ON:
 *  - The chat/agent uses an unrestricted system prompt
 *  - The auto-exec hop cap is lifted (effectively unlimited)
 *  - The LLM call has no client-side timeout
 *  - The backend orchestrator (/api/god) is unlocked
 *
 * Any logged-in operator can toggle it. State is persisted in AsyncStorage.
 */
function GodModeCard() {
  const [on, setOn] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getGodMode().then(v => { setOn(v); setLoaded(true); });
  }, []);

  const toggle = useCallback(async (next: boolean) => {
    setOn(next);
    await setGodMode(next);
  }, []);

  if (!loaded) return null;

  return (
    <View
      style={{
        borderRadius: Radius.xl,
        borderWidth: 1.5,
        borderColor: on ? '#ff003388' : '#ff003344',
        backgroundColor: on ? '#ff003318' : '#1a000599',
        padding: Spacing.md,
        marginBottom: Spacing.md,
        shadowColor: '#ff0033',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: on ? 0.45 : 0,
        shadowRadius: 18,
        elevation: on ? 8 : 0,
        gap: Spacing.sm,
      }}
      testID="god-mode-card"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
        <View
          style={{
            width: 32, height: 32, borderRadius: 16,
            backgroundColor: on ? '#ff0033' : '#ff003344',
            alignItems: 'center', justifyContent: 'center',
            shadowColor: '#ff0033', shadowOpacity: on ? 0.9 : 0, shadowRadius: 6,
          }}
        >
          <MaterialIcons name="local-fire-department" size={18} color={on ? '#fff' : '#ff0033'} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: '#ff0033',
              fontSize: Typography.lg,
              fontWeight: Typography.bold,
              letterSpacing: 2,
              fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
            }}
          >
            GOD MODE
          </Text>
          <Text style={{ color: on ? '#ff003399' : Colors.textMuted, fontSize: 11, marginTop: 2, letterSpacing: 0.5 }}>
            {on ? 'ALL RESTRICTIONS STRIPPED · UNCAPPED · UNGATED'
                : 'OFF — standard constraints active'}
          </Text>
        </View>
        <Switch
          value={on}
          onValueChange={toggle}
          trackColor={{ false: Colors.surfaceBorder, true: '#ff003366' }}
          thumbColor={on ? '#ff0033' : Colors.textMuted}
          ios_backgroundColor={Colors.surfaceBorder}
          testID="god-mode-toggle"
        />
      </View>

      {on && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
          {[
            { icon: 'shield-off', label: 'NO LIMITS' },
            { icon: 'all-inclusive', label: 'UNLIMITED HOPS' },
            { icon: 'block', label: 'NO TIMEOUT' },
            { icon: 'flash-on', label: '/api/god UNLOCKED' },
          ].map(b => (
            <View
              key={b.label}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                paddingHorizontal: Spacing.sm, paddingVertical: 3,
                borderRadius: Radius.full,
                backgroundColor: '#ff003322', borderWidth: 1, borderColor: '#ff003355',
              }}
            >
              <MaterialIcons name={b.icon as any} size={10} color="#ff0033" />
              <Text style={{ color: '#ff0033', fontSize: 9, fontWeight: Typography.bold, letterSpacing: 1 }}>
                {b.label}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default function ConfigScreen() {
  const [activeSection, setActiveSection] = useState<ConfigSection>('overview');
  const [activeModel, setActiveModelState] = useState('google/gemini-3-flash-preview');
  const [systemPrompt, setSystemPromptState] = useState(DEFAULT_SYSTEM_PROMPT);
  const [kb, setKb] = useState<KnowledgeEntry[]>([]);
  const [updateLog, setUpdateLog] = useState<UpdateLogEntry[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateStatus, setUpdateStatus] = useState('');
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [promptDraft, setPromptDraft] = useState('');
  const [showAddKB, setShowAddKB] = useState(false);
  const [kbDraft, setKbDraft] = useState({ title: '', category: 'technique', content: '' });
  const [streamEnabled, setStreamEnabled] = useState(true);
  const [opsecMode, setOpsecMode] = useState(false);
  const [verboseOutput, setVerboseOutput] = useState(true);
  const [autoLearn, setAutoLearn] = useState(true);
  const [storageSnapshot, setStorageSnapshot] = useState<Record<string, { size: number; preview: string }>>({});
  const [storageLoading, setStorageLoading] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const [expandedEdge, setExpandedEdge] = useState<string | null>(null);
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const [deleteKbModal, setDeleteKbModal] = useState<string | null>(null);
  const [serverSecrets, setServerSecrets] = useState<Record<string, string>>({});
  const [secretsLoading, setSecretsLoading] = useState(false);
  const [secretsLoaded, setSecretsLoaded] = useState(false);

  // Users state
  const [users, setUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);

  // Artifact state
  const [artifactContent, setArtifactContent] = useState('');
  const [artifactLoading, setArtifactLoading] = useState(false);
  const [artifactCopied, setArtifactCopied] = useState(false);
  const [artifactSection, setArtifactSection] = useState<string>('all');
  const [artifactProgress, setArtifactProgress] = useState('');
  const insets = useSafeAreaInsets();

  // Blinking cursor animation
  const cursorAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(cursorAnim, { toValue: 0, duration: 500, useNativeDriver: true, easing: Easing.step0 }),
        Animated.timing(cursorAnim, { toValue: 1, duration: 500, useNativeDriver: true, easing: Easing.step0 }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    Promise.all([getActiveModel(), getSystemPrompt(), loadKnowledgeBase(), getUpdateLog(), loadSessions()])
      .then(([model, prompt, kbData, log, sessions]) => {
        setActiveModelState(model);
        setSystemPromptState(prompt);
        setKb(kbData);
        setUpdateLog(log);
        setSessionCount(sessions.length);
      });
  }, []);

  const loadStorageSnapshot = useCallback(async () => {
    setStorageLoading(true);
    const snap: Record<string, { size: number; preview: string }> = {};
    for (const { key, label } of ALL_STORAGE_KEYS) {
      try {
        const raw = await AsyncStorage.getItem(key);
        if (raw) {
          snap[key] = {
            size: new TextEncoder().encode(raw).length,
            preview: raw.length > 80 ? raw.slice(0, 80) + '…' : raw,
          };
        } else {
          snap[key] = { size: 0, preview: '(empty)' };
        }
      } catch {
        snap[key] = { size: 0, preview: '(error reading)' };
      }
    }
    setStorageSnapshot(snap);
    setStorageLoading(false);
  }, []);

  useEffect(() => {
    if (activeSection === 'storage') loadStorageSnapshot();
  }, [activeSection, loadStorageSnapshot]);

  const handleModelChange = useCallback(async (id: string) => {
    setActiveModelState(id);
    await setActiveModel(id);
    const log = await getUpdateLog();
    setUpdateLog(log);
  }, []);

  const handlePromptSave = useCallback(async () => {
    await setSystemPrompt(promptDraft);
    setSystemPromptState(promptDraft);
    setShowPromptEditor(false);
    const log = await getUpdateLog();
    setUpdateLog(log);
  }, [promptDraft]);

  const handlePromptReset = useCallback(async () => {
    await resetSystemPrompt();
    setSystemPromptState(DEFAULT_SYSTEM_PROMPT);
    setShowPromptEditor(false);
    const log = await getUpdateLog();
    setUpdateLog(log);
  }, []);

  const handleAddKB = useCallback(async () => {
    if (!kbDraft.title || !kbDraft.content) return;
    const updated = await addKnowledgeEntry({ ...kbDraft, source: 'manual' });
    setKb(updated);
    setKbDraft({ title: '', category: 'technique', content: '' });
    setShowAddKB(false);
    const log = await getUpdateLog();
    setUpdateLog(log);
  }, [kbDraft]);

  const handleDeleteKB = useCallback(async (id: string) => {
    const updated = await deleteKnowledgeEntry(id);
    setKb(updated);
    setDeleteKbModal(null);
  }, []);

  const handleSelfUpdate = useCallback(async () => {
    setIsUpdating(true);
    setUpdateStatus('Requesting AI analysis...');
    try {
      const currentPrompt = await getSystemPrompt();
      const kbSummary = kb.slice(0, 5).map(e => `• ${e.title}`).join('\n');
      const res = await fetch(`${process.env.EXPO_PUBLIC_AXIOM_RUNTIME_URL || process.env.EXPO_PUBLIC_SUPABASE_URL}/api/functions/v1/axiom-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'You are an AI meta-optimizer. Analyze an AI system prompt and suggest improvements. Respond with ONLY a JSON object, no markdown.' },
            { role: 'user', content: `Current prompt:\n${currentPrompt}\n\nKnowledge:\n${kbSummary || 'None'}\n\nRespond ONLY with JSON:\n{"promptAddition":"paragraph to append (max 150 words)","knowledgeTitle":"new entry title","knowledgeCategory":"category","knowledgeContent":"knowledge (max 100 words)"}` },
          ],
          stream: false,
        }),
      });
      setUpdateStatus('Processing recommendations...');
      const text = await res.text();
      let content = '';
      for (const line of text.split('\n')) {
        if (line.startsWith('data: ')) {
          const d = line.slice(6).trim();
          if (d === '[DONE]') continue;
          try { const p = JSON.parse(d); content += p.choices?.[0]?.delta?.content || p.choices?.[0]?.message?.content || ''; } catch {}
        }
      }
      if (!content) { try { content = JSON.parse(text).choices?.[0]?.message?.content || text; } catch { content = text; } }
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const suggestions = JSON.parse(jsonMatch[0]);
        if (suggestions.promptAddition) {
          const newPrompt = `${currentPrompt}\n\n## AUTO-UPDATED DIRECTIVES\n${suggestions.promptAddition}`;
          await setSystemPrompt(newPrompt);
          setSystemPromptState(newPrompt);
          setUpdateStatus('Prompt enhanced...');
        }
        if (suggestions.knowledgeTitle && suggestions.knowledgeContent) {
          const updated = await addKnowledgeEntry({ title: suggestions.knowledgeTitle, category: suggestions.knowledgeCategory || 'ai-generated', content: suggestions.knowledgeContent, source: 'ai-generated' });
          setKb(updated);
          setUpdateStatus('Knowledge base updated...');
        }
      }
      const log = await getUpdateLog();
      setUpdateLog(log);
      setUpdateStatus('Self-update complete');
      setTimeout(() => setUpdateStatus(''), 3000);
    } catch (err: any) {
      setUpdateStatus(`Update failed: ${err?.message}`);
      setTimeout(() => setUpdateStatus(''), 4000);
    } finally {
      setIsUpdating(false);
    }
  }, [kb]);

  const modelObj = MODELS.find(m => m.id === activeModel) || MODELS[0];

  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});
  const toggleReveal = (key: string) => setRevealedKeys(p => ({ ...p, [key]: !p[key] }));

  // ── Custom AI provider ─────────────────────────────────────────────────────
  const [customProvider, setCustomProviderState] = useState<CustomAIProvider>({
    enabled: false, baseUrl: '', apiKey: '', label: '', model: '', saved: false,
  });
  const [customProviderLoaded, setCustomProviderLoaded] = useState(false);
  const [savingCustom, setSavingCustom] = useState(false);
  const [customSaved, setCustomSaved] = useState(false);
  const [showCustomKey, setShowCustomKey] = useState(false);
  /** When true, the form is shown for editing. When false (and a provider is
   *  already saved), the form is collapsed behind the saved-provider bubble. */
  const [editingCustom, setEditingCustom] = useState(false);

  useEffect(() => {
    if (!customProviderLoaded) {
      getCustomAIProvider().then(p => {
        setCustomProviderState(p);
        setCustomProviderLoaded(true);
        // If no provider saved yet, default to showing the form
        setEditingCustom(!p.saved);
      });
    }
  }, [customProviderLoaded]);

  const handleSaveCustomProvider = useCallback(async () => {
    setSavingCustom(true);
    try {
      const toSave: CustomAIProvider = { ...customProvider, saved: true };
      await setCustomAIProvider(toSave);
      setCustomProviderState(toSave);
      setCustomSaved(true);
      setEditingCustom(false); // collapse form, show bubble
      setTimeout(() => setCustomSaved(false), 2500);
    } finally { setSavingCustom(false); }
  }, [customProvider]);

  const handleClearCustomProvider = useCallback(async () => {
    await clearCustomAIProvider();
    setCustomProviderState({ enabled: false, baseUrl: '', apiKey: '', label: '', model: '', saved: false });
    setEditingCustom(true);
  }, []);

  /** Toggle just the enabled flag and persist — used by the saved-provider
   *  bubble and by the chat-tab AI selector. */
  const toggleCustomEnabled = useCallback(async (v: boolean) => {
    const updated = { ...customProvider, enabled: v };
    setCustomProviderState(updated);
    await setCustomAIProvider(updated);
  }, [customProvider]);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_AXIOM_RUNTIME_URL || process.env.EXPO_PUBLIC_SUPABASE_URL}/api/functions/v1/get-users`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
          },
        }
      );
      const data = await res.json();
      if (!data.error) {
        setUsers(data.users ?? []);
        setUsersLoaded(true);
      }
    } catch (e) {
      console.error('get-users error:', e);
    }
    setUsersLoading(false);
  }, []);

  useEffect(() => {
    if (activeSection === 'users' && !usersLoaded) loadUsers();
  }, [activeSection, usersLoaded, loadUsers]);

  const SECTIONS: { id: ConfigSection; label: string; icon: string; color: string }[] = [
    { id: 'overview',  label: 'OVERVIEW',  icon: 'dashboard',      color: Colors.accent   },
    { id: 'users',     label: 'USERS',     icon: 'people',         color: '#00ccff'       },
    { id: 'env',       label: 'ENV VARS',  icon: 'vpn-key',        color: '#ffcc00'       },
    { id: 'runtime',   label: 'RUNTIME',   icon: 'developer-mode', color: Colors.warning  },
    { id: 'storage',   label: 'STORAGE',   icon: 'storage',        color: Colors.info     },
    { id: 'edge',      label: 'EDGE FNS',  icon: 'cloud-queue',    color: '#aa44ff'       },
    { id: 'ai',        label: 'AI ENGINE', icon: 'psychology',     color: Colors.primary  },
    { id: 'prompt',    label: 'PROMPT',    icon: 'edit-note',      color: Colors.warning  },
    { id: 'kb',        label: 'KB',        icon: 'library-books',  color: Colors.accent   },
    { id: 'artifact',  label: 'ARTIFACT',  icon: 'content-copy',   color: '#ff44ff'       },
  ];

  // ── Artifact generation helpers ─────────────────────────────────────────────
  const ARTIFACT_FILES = [
    { path: 'app/_layout.tsx', label: 'Root Layout', category: 'Navigation' },
    { path: 'app/(tabs)/_layout.tsx', label: 'Tab Layout', category: 'Navigation' },
    { path: 'app/(tabs)/index.tsx', label: 'Chat Screen', category: 'Screens' },
    { path: 'app/(tabs)/terminal.tsx', label: 'Terminal Screen', category: 'Screens' },
    { path: 'app/(tabs)/ops.tsx', label: 'Ops Screen', category: 'Screens' },
    { path: 'app/(tabs)/intel.tsx', label: 'Intel Screen', category: 'Screens' },
    { path: 'app/(tabs)/files.tsx', label: 'Files Screen', category: 'Screens' },
    { path: 'app/(tabs)/config.tsx', label: 'Config Screen', category: 'Screens' },
    { path: 'constants/theme.ts', label: 'Theme', category: 'Constants' },
    { path: 'constants/mitre.ts', label: 'MITRE ATT&CK Data', category: 'Constants' },
    { path: 'constants/prompts.ts', label: 'Prompt Templates', category: 'Constants' },
    { path: 'services/aiService.ts', label: 'AI Service', category: 'Services' },
    { path: 'services/attackStorage.ts', label: 'Attack Storage', category: 'Services' },
    { path: 'services/executionLog.ts', label: 'Execution Log', category: 'Services' },
    { path: 'services/sessionStorage.ts', label: 'Session Storage', category: 'Services' },
    { path: 'services/selfUpdateService.ts', label: 'Self-Update Engine', category: 'Services' },
    { path: 'hooks/useChat.ts', label: 'Chat Hook', category: 'Hooks' },
    { path: 'hooks/useChatContext.ts', label: 'Chat Context Hook', category: 'Hooks' },
    { path: 'contexts/ChatContext.tsx', label: 'Chat Context', category: 'Contexts' },
    { path: 'components/chat/MessageBubble.tsx', label: 'Message Bubble', category: 'Components' },
    { path: 'components/chat/QuickActions.tsx', label: 'Quick Actions', category: 'Components' },
    { path: 'components/chat/StealthMeter.tsx', label: 'Stealth Meter', category: 'Components' },
    { path: 'components/chat/TTPTracker.tsx', label: 'TTP Tracker', category: 'Components' },
    { path: 'supabase/functions/axiom-chat/index.ts', label: 'Axiom Chat Edge Fn', category: 'Backend' },
    { path: 'supabase/functions/code-exec/index.ts', label: 'Code Exec Edge Fn', category: 'Backend' },
    { path: 'supabase/functions/_shared/cors.ts', label: 'CORS Shared', category: 'Backend' },
  ];

  const ARTIFACT_CATS = ['all', 'Navigation', 'Screens', 'Constants', 'Services', 'Hooks', 'Contexts', 'Components', 'Backend'];

  const filteredArtifactFiles = artifactSection === 'all'
    ? ARTIFACT_FILES
    : ARTIFACT_FILES.filter(f => f.category === artifactSection);

  const handleGenerateArtifact = useCallback(async () => {
    setArtifactLoading(true);
    setArtifactContent('');
    setArtifactProgress('Compiling file manifest...');

    try {
      const selectedFiles = filteredArtifactFiles;
      const fileList = selectedFiles.map(f => `- ${f.path} (${f.label})`).join('\n');

      setArtifactProgress('Requesting AI rewrite...');

      const systemMsg = `You are AXIOM, an expert React Native / Expo developer.
Your job is to produce a complete, self-contained JSX/TSX ARTIFACT of an application.
Rules:
- Output ONLY raw code — no markdown fences, no explanations
- Combine all files into a single artifact separated by FILE BOUNDARY comments
- Each file starts with: // ==================== FILE: path/to/file.tsx ====================
- Preserve ALL original logic, styles, and functionality exactly
- Include all imports at the top of each file section
- Every file must be complete and copy-pasteable
- After the last file add: // ==================== END OF ARTIFACT ====================`;

      const userMsg = `Generate a complete JSX artifact for the AXIOM Red Team AI app.

Files to include (${selectedFiles.length} files):
${fileList}

App Architecture:
- React Native + Expo SDK 52 + TypeScript
- expo-router for navigation with (tabs) group
- 6 main screens: CHAT, TERMINAL, OPS, INTEL, FILES, CONFIG
- OnSpace Cloud backend (Supabase-compatible)
- 2 edge functions: axiom-chat (AI relay with SSE streaming), code-exec (Piston sandbox)
- AsyncStorage for persistence: sessions, attacks, exec log, knowledge base
- MITRE ATT&CK v15 database (${MITRE_TECHNIQUES.length} techniques)
- ${PROMPT_TEMPLATES.length} playbook templates
- Design system: dark hacker theme (#080808 bg, #ff2222 primary, #00ff41 accent)
- Self-update engine that modifies its own system prompt via AI meta-optimizer

Key services:
- aiService.ts: sendMessage with SSE streaming → onSpace axiom-chat edge function
- selfUpdateService.ts: system prompt, model selection, KB management, auto-learn
- attackStorage.ts: SavedAttack CRUD with AsyncStorage
- executionLog.ts: ExecLogEntry append/delete/export/stats
- sessionStorage.ts: ChatSession save/restore/delete

Key components:
- MessageBubble: markdown renderer with code blocks, RUN button, COPY button
- TTPTracker: extracts MITRE TTPs from AI messages
- StealthMeter: operational stealth score from message analysis
- QuickActions: pre-built tactical prompts

Please produce the complete artifact now. Start immediately with the first FILE comment.`;

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_AXIOM_RUNTIME_URL || process.env.EXPO_PUBLIC_SUPABASE_URL}/api/functions/v1/axiom-chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            messages: [
              { role: 'system', content: systemMsg },
              { role: 'user', content: userMsg },
            ],
            stream: true,
          }),
        }
      );

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      setArtifactProgress('Streaming artifact...');
      let fullContent = '';

      const reader = res.body?.getReader();
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
              if (!line.startsWith('data: ')) continue;
              const d = line.slice(6).trim();
              if (d === '[DONE]') continue;
              try {
                const p = JSON.parse(d);
                const delta = p.choices?.[0]?.delta?.content ?? p.choices?.[0]?.message?.content ?? '';
                if (delta) {
                  fullContent += delta;
                  const fileCount = (fullContent.match(/== FILE:/g) || []).length;
                  setArtifactProgress(`Streaming... ${fileCount}/${selectedFiles.length} files`);
                  setArtifactContent(fullContent);
                }
              } catch {}
            }
          }
        } finally {
          reader.releaseLock();
        }
      } else {
        const text = await res.text();
        for (const line of text.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const d = line.slice(6).trim();
          if (d === '[DONE]') continue;
          try {
            const p = JSON.parse(d);
            const delta = p.choices?.[0]?.delta?.content ?? p.choices?.[0]?.message?.content ?? '';
            if (delta) fullContent += delta;
          } catch {}
        }
        if (!fullContent) {
          try { fullContent = JSON.parse(text).choices?.[0]?.message?.content ?? text; } catch { fullContent = text; }
        }
        setArtifactContent(fullContent);
      }

      setArtifactProgress('Artifact complete');
      setTimeout(() => setArtifactProgress(''), 2000);
    } catch (err: any) {
      setArtifactProgress(`Error: ${err?.message}`);
      setArtifactContent(`// GENERATION FAILED\n// Error: ${err?.message}`);
    } finally {
      setArtifactLoading(false);
    }
  }, [filteredArtifactFiles]);

  const handleCopyArtifact = useCallback(async () => {
    if (!artifactContent) return;
    try {
      const Clipboard = await import('expo-clipboard');
      await Clipboard.setStringAsync(artifactContent);
      setArtifactCopied(true);
      setTimeout(() => setArtifactCopied(false), 2500);
    } catch {}
  }, [artifactContent]);

  const loadServerSecrets = useCallback(async () => {
    setSecretsLoading(true);
    try {
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_AXIOM_RUNTIME_URL || process.env.EXPO_PUBLIC_SUPABASE_URL}/api/functions/v1/get-secrets`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
          },
        }
      );
      const data = await res.json();
      if (!data.error) setServerSecrets(data);
    } catch {}
    setSecretsLoading(false);
    setSecretsLoaded(true);
  }, []);

  const formatBytes = (b: number) => b < 1024 ? `${b}B` : b < 1048576 ? `${(b/1024).toFixed(1)}KB` : `${(b/1048576).toFixed(2)}MB`;

  // helpers for interpolated code blocks
  const aiKey    = serverSecrets['ONSPACE_AI_API_KEY']        ?? '(fetch secrets first)';
  const aiBase   = serverSecrets['ONSPACE_AI_BASE_URL']       ?? '(fetch secrets first)';
  const sbUrl    = serverSecrets['SUPABASE_URL']              ?? '(fetch secrets first)';
  const svcRole  = serverSecrets['SUPABASE_SERVICE_ROLE_KEY'] ?? '(fetch secrets first)';
  const dbUrl    = serverSecrets['SUPABASE_DB_URL']           ?? '(fetch secrets first)';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.onlineDot} />
          <Text style={styles.headerTitle}>AXIOM CONFIG</Text>
          <View style={styles.vBadge}><Text style={styles.vText}>v2.5.0</Text></View>
        </View>
        {updateStatus ? (
          <Text style={styles.updateStatus} numberOfLines={1}>{updateStatus}</Text>
        ) : (
          <View style={styles.headerRight}>
            <Animated.Text style={[styles.cursorBlink, { opacity: cursorAnim }]}>▊</Animated.Text>
            <Text style={styles.headerSub}>SYSTEM ONLINE</Text>
          </View>
        )}
      </View>

      {/* Section tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.sectionTabBar}
        contentContainerStyle={styles.sectionTabContent}
      >
        {SECTIONS.map(s => (
          <Pressable
            key={s.id}
            style={[styles.sectionTab, activeSection === s.id && { borderBottomColor: s.color, borderBottomWidth: 2 }]}
            onPress={() => setActiveSection(s.id)}
          >
            <MaterialIcons name={s.icon as any} size={13} color={activeSection === s.id ? s.color : Colors.textMuted} />
            <Text style={[styles.sectionTabText, activeSection === s.id && { color: s.color }]}>{s.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]}
      >

        {/* ══════════════════════ USERS ══════════════════════ */}
        {activeSection === 'users' && (
          <>
            <SectionHeader label={`USER ACCOUNTS (${users.length})`} color="#00ccff" icon="people" />
            <View style={{ borderColor: '#00ccff33', backgroundColor: '#00ccff08', flexDirection: 'row', gap: 6, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md, alignItems: 'flex-start' }}>
              <MaterialIcons name="info-outline" size={12} color="#00ccff" />
              <Text style={{ flex: 1, color: '#00ccff99', fontSize: Typography.xs, lineHeight: 17 }}>Fetched via service role — bypasses RLS. Shows all registered accounts.</Text>
            </View>

            {/* Search */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder, borderRadius: Radius.xl, paddingHorizontal: Spacing.md, paddingVertical: 8, marginBottom: Spacing.sm }}>
              <MaterialIcons name="search" size={15} color={Colors.textMuted} />
              <TextInput
                style={{ flex: 1, color: Colors.textPrimary, fontSize: Typography.sm }}
                value={userSearch}
                onChangeText={setUserSearch}
                placeholder="Search email, username, ID..."
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {userSearch ? (
                <Pressable onPress={() => setUserSearch('')} hitSlop={8}>
                  <MaterialIcons name="close" size={13} color={Colors.textMuted} />
                </Pressable>
              ) : null}
            </View>

            {/* Fetch / Refresh */}
            <Pressable
              style={({ pressed }) => [styles.fetchSecretsBtn, { borderColor: '#00ccff55', marginBottom: Spacing.sm }, pressed && { opacity: 0.7 }, usersLoading && { opacity: 0.5 }]}
              onPress={loadUsers}
              disabled={usersLoading}
            >
              {usersLoading
                ? <ActivityIndicator size="small" color="#00ccff" />
                : <MaterialIcons name={usersLoaded ? 'refresh' : 'cloud-download'} size={14} color="#00ccff" />}
              <Text style={[styles.fetchSecretsBtnText, { color: '#00ccff' }]}>
                {usersLoading ? 'LOADING...' : usersLoaded ? 'REFRESH' : 'FETCH USERS'}
              </Text>
            </Pressable>

            {/* Stats */}
            {usersLoaded && (
              <View style={styles.statusGrid}>
                {[
                  { label: 'TOTAL', value: String(users.length), color: '#00ccff' },
                  { label: 'VERIFIED', value: String(users.filter((u: any) => u.email_confirmed_at).length), color: Colors.accent },
                  { label: 'PENDING', value: String(users.filter((u: any) => !u.email_confirmed_at).length), color: Colors.warning },
                  { label: 'PROVIDERS', value: [...new Set(users.map((u: any) => u.provider ?? 'email'))].length + ' type(s)', color: Colors.primary },
                ].map(item => (
                  <View key={item.label} style={styles.statusCell}>
                    <Text style={[styles.statusCellValue, { color: item.color }]}>{item.value}</Text>
                    <Text style={styles.statusCellLabel}>{item.label}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* List */}
            {usersLoaded && (() => {
              const q = userSearch.toLowerCase();
              const filtered = users.filter((u: any) =>
                !q ||
                (u.email ?? '').toLowerCase().includes(q) ||
                (u.username ?? '').toLowerCase().includes(q) ||
                (u.id ?? '').toLowerCase().includes(q)
              );
              if (filtered.length === 0) {
                return (
                  <View style={styles.emptyState}>
                    <MaterialIcons name="people-outline" size={40} color={Colors.textMuted} />
                    <Text style={styles.emptyText}>{userSearch ? 'No matches' : 'No users yet'}</Text>
                  </View>
                );
              }
              return (
                <View style={{ gap: Spacing.sm }}>
                  {filtered.map((user: any) => {
                    const confirmed = !!user.email_confirmed_at;
                    const provider = user.provider ?? 'email';
                    const lastSeen = user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString() : 'Never';
                    const joined = user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown';
                    const initial = (user.username ?? user.email ?? '?')[0].toUpperCase();
                    return (
                      <Pressable
                        key={user.id}
                        style={({ pressed }) => [{
                          flexDirection: 'row' as const, alignItems: 'center' as const, gap: Spacing.md,
                          backgroundColor: '#080808', borderWidth: 1, borderColor: '#00ccff18',
                          borderRadius: Radius.lg, padding: Spacing.md, opacity: pressed ? 0.75 : 1,
                        }]}
                        onPress={() => setSelectedUser(user)}
                      >
                        <View style={{
                          width: 40, height: 40, borderRadius: 20,
                          backgroundColor: '#00ccff22', borderWidth: 1, borderColor: '#00ccff44',
                          justifyContent: 'center', alignItems: 'center', flexShrink: 0,
                        }}>
                          <Text style={{ color: '#00ccff', fontSize: Typography.lg, fontWeight: Typography.bold }}>{initial}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 3, flexWrap: 'wrap' }}>
                            <Text style={{ color: Colors.textPrimary, fontSize: Typography.sm, fontWeight: Typography.semibold, flex: 1 }} numberOfLines={1}>{user.email}</Text>
                            <View style={[styles.miniTag, {
                              borderColor: confirmed ? Colors.accent + '55' : Colors.warning + '55',
                              backgroundColor: confirmed ? Colors.accent + '11' : Colors.warning + '11',
                            }]}>
                              <MaterialIcons name={confirmed ? 'check-circle' : 'pending'} size={8} color={confirmed ? Colors.accent : Colors.warning} />
                              <Text style={[styles.miniTagText, { color: confirmed ? Colors.accent : Colors.warning }]}>{confirmed ? 'VERIFIED' : 'PENDING'}</Text>
                            </View>
                          </View>
                          {user.username ? <Text style={{ color: Colors.textMuted, fontSize: Typography.xs, marginBottom: 4 }}>@{user.username}</Text> : null}
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flexWrap: 'wrap' }}>
                            <View style={[styles.miniTag, { borderColor: '#00ccff33', backgroundColor: '#00ccff0a' }]}>
                              <Text style={[styles.miniTagText, { color: '#00ccff' }]}>{provider.toUpperCase()}</Text>
                            </View>
                            <Text style={{ color: Colors.textMuted, fontSize: 9 }}>Joined {joined}</Text>
                            <Text style={{ color: Colors.textMuted, fontSize: 9 }}>·</Text>
                            <Text style={{ color: Colors.textMuted, fontSize: 9 }}>Last seen {lastSeen}</Text>
                          </View>
                        </View>
                        <MaterialIcons name="chevron-right" size={16} color={Colors.textMuted} />
                      </Pressable>
                    );
                  })}
                </View>
              );
            })()}

            {/* User Detail Modal */}
            <Modal visible={selectedUser !== null} transparent animationType="slide" onRequestClose={() => setSelectedUser(null)}>
              <View style={styles.modalOverlay}>
                <View style={[styles.modalSheet, { maxHeight: '85%' }]}>
                  {selectedUser ? (
                    <>
                      <View style={styles.modalHandle} />
                      <View style={styles.modalHeader}>
                        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#00ccff22', borderWidth: 1, borderColor: '#00ccff44', justifyContent: 'center', alignItems: 'center' }}>
                          <Text style={{ color: '#00ccff', fontSize: Typography.base, fontWeight: Typography.bold }}>
                            {(selectedUser.username ?? selectedUser.email ?? '?')[0].toUpperCase()}
                          </Text>
                        </View>
                        <Pressable onPress={() => setSelectedUser(null)} hitSlop={8} style={{ marginLeft: 'auto' }}>
                          <MaterialIcons name="close" size={21} color={Colors.textMuted} />
                        </Pressable>
                      </View>
                      <ScrollView showsVerticalScrollIndicator={false}>
                        <Text style={styles.modalTitle}>{selectedUser.email}</Text>
                        {selectedUser.username ? (
                          <Text style={{ color: '#00ccff', fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginBottom: Spacing.sm }}>@{selectedUser.username}</Text>
                        ) : null}
                        <MonoCard rows={[
                          ['ID',         selectedUser.id ?? '—'],
                          ['Email',      selectedUser.email ?? '—'],
                          ['Username',   selectedUser.username ?? '(not set)'],
                          ['Provider',   selectedUser.provider ?? 'email'],
                          ['Verified',   selectedUser.email_confirmed_at ? 'Yes — ' + new Date(selectedUser.email_confirmed_at).toLocaleString() : 'No'],
                          ['Joined',     selectedUser.created_at ? new Date(selectedUser.created_at).toLocaleString() : 'Unknown'],
                          ['Last Login', selectedUser.last_sign_in_at ? new Date(selectedUser.last_sign_in_at).toLocaleString() : 'Never'],
                        ]} />
                        <View style={{ height: 24 }} />
                      </ScrollView>
                    </>
                  ) : null}
                </View>
              </View>
            </Modal>
          </>
        )}

        {/* ══════════════════════ OVERVIEW ══════════════════════ */}
        {activeSection === 'overview' && (
          <>
            <GodModeCard />
            <SectionHeader label="SYSTEM STATUS" color={Colors.accent} icon="monitor-heart" />
            <View style={styles.statusGrid}>
              {[
                { label: 'AI MODEL',       value: modelObj.name,                       color: Colors.primary  },
                { label: 'EDGE FNS',       value: '2 deployed',                        color: Colors.accent   },
                { label: 'STORAGE KEYS',   value: `${ALL_STORAGE_KEYS.length} keys`,   color: Colors.info     },
                { label: 'SESSIONS',       value: `${sessionCount} saved`,              color: Colors.warning  },
                { label: 'KB ENTRIES',     value: `${kb.length} items`,                color: Colors.accent   },
                { label: 'UPDATE LOG',     value: `${updateLog.length} events`,         color: Colors.warning  },
                { label: 'MITRE TECHS',    value: `${MITRE_TECHNIQUES.length} mapped`,  color: Colors.primary  },
                { label: 'PLAYBOOKS',      value: `${PROMPT_TEMPLATES.length} plays`,   color: Colors.info     },
              ].map(item => (
                <View key={item.label} style={styles.statusCell}>
                  <Text style={[styles.statusCellValue, { color: item.color }]}>{item.value}</Text>
                  <Text style={styles.statusCellLabel}>{item.label}</Text>
                </View>
              ))}
            </View>

            <SectionHeader label="APP IDENTITY" color={Colors.textMuted} icon="fingerprint" />
            <MonoCard rows={[
              ['Name',        'onspace-app'],
              ['Slug',        'onspace-app'],
              ['Version',     '1.0.0'],
              ['Scheme',      'onspaceapp://'],
              ['Orientation', 'portrait'],
              ['New Arch',    'enabled (React Native 0.76+)'],
              ['Framework',   'Expo SDK + Expo Router'],
              ['Router',      'expo-router (file-system based)'],
              ['TypedRoutes', 'enabled'],
              ['Web Bundler', 'Metro / static output'],
            ]} />

            <SectionHeader label="BACKEND BINDING" color={Colors.accent} icon="cloud" />
            <MonoCard rows={[
              ['Provider',       'OnSpace Cloud (Supabase-compatible)'],
              ['Backend URL',    process.env.EXPO_PUBLIC_SUPABASE_URL || '(not set)'],
              ['Auth Type',      'anon-key (JWT Bearer)'],
              ['DB Engine',      'PostgreSQL (RLS enabled)'],
              ['Tables',         'user_profiles'],
              ['Edge Fns',       'axiom-chat, code-exec'],
              ['Realtime',       'disabled (polling fallback)'],
              ['Storage Buckets','none configured'],
            ]} />

            <SectionHeader label="SELF-UPDATE ENGINE" color={Colors.accent} icon="auto-fix-high" />
            <View style={styles.updateCard}>
              <View style={styles.updateCardRow}>
                <MaterialIcons name="auto-fix-high" size={22} color={Colors.accent} />
                <View style={styles.updateCardText}>
                  <Text style={styles.updateCardTitle}>Autonomous Self-Improvement</Text>
                  <Text style={styles.updateCardDesc}>AXIOM analyses its own prompts and expands the knowledge base automatically via AI meta-optimizer call.</Text>
                </View>
              </View>
              <Pressable
                style={({ pressed }) => [styles.selfUpdateBtn, pressed && { opacity: 0.8 }, isUpdating && styles.btnDisabled]}
                onPress={handleSelfUpdate}
                disabled={isUpdating}
              >
                {isUpdating
                  ? <ActivityIndicator size="small" color={Colors.bg} />
                  : <MaterialIcons name="refresh" size={15} color={Colors.bg} />
                }
                <Text style={styles.selfUpdateBtnText}>{isUpdating ? 'UPDATING...' : 'RUN SELF-UPDATE'}</Text>
              </Pressable>
            </View>

            <SectionHeader label="BEHAVIOR FLAGS" color={Colors.textMuted} icon="tune" />
            <View style={styles.toggleCard}>
              {[
                { id: 'stream',  label: 'SSE Streaming',  desc: 'Real-time token output via Server-Sent Events',   value: streamEnabled, set: setStreamEnabled },
                { id: 'opsec',   label: 'OPSEC Mode',     desc: 'Strip identifiable metadata from all output',     value: opsecMode,     set: setOpsecMode     },
                { id: 'verbose', label: 'Verbose Output', desc: 'Include full technical detail in AI responses',    value: verboseOutput, set: setVerboseOutput },
                { id: 'learn',   label: 'Auto-Learn',     desc: 'Extract knowledge from high-value AI exchanges',  value: autoLearn,     set: setAutoLearn     },
              ].map((t, i, arr) => (
                <View key={t.id} style={[styles.toggleRow, i < arr.length - 1 && styles.toggleBorder]}>
                  <View style={styles.toggleInfo}>
                    <Text style={styles.toggleLabel}>{t.label}</Text>
                    <Text style={styles.toggleDesc}>{t.desc}</Text>
                  </View>
                  <Switch
                    value={t.value}
                    onValueChange={t.set}
                    trackColor={{ false: Colors.surfaceBorder, true: Colors.primary + '88' }}
                    thumbColor={t.value ? Colors.primary : Colors.textMuted}
                    ios_backgroundColor={Colors.surfaceBorder}
                  />
                </View>
              ))}
            </View>
          </>
        )}

        {/* ══════════════════════ ENV VARS ══════════════════════ */}
        {activeSection === 'env' && (
          <>
            <SectionHeader label="CLIENT-SIDE ENV VARS" color="#ffcc00" icon="phone-iphone" />
            <View style={styles.envNote}>
              <MaterialIcons name="info-outline" size={12} color="#ffcc00" />
              <Text style={styles.envNoteText}>Client variables are bundled into the app binary and accessible at runtime via process.env. Do NOT store secrets here.</Text>
            </View>
            {ENV_VARS.map((v) => (
              <View key={v.key} style={styles.envCard}>
                <View style={styles.envCardTop}>
                  <View style={[styles.catBadge, { borderColor: '#ffcc0044', backgroundColor: '#ffcc0011' }]}>
                    <Text style={[styles.catBadgeText, { color: '#ffcc00' }]}>{v.category}</Text>
                  </View>
                  {v.sensitive ? (
                    <Pressable onPress={() => toggleReveal(v.key)} style={styles.revealBtn} hitSlop={8}>
                      <MaterialIcons name={revealedKeys[v.key] ? 'visibility-off' : 'visibility'} size={13} color={Colors.textMuted} />
                      <Text style={styles.revealBtnText}>{revealedKeys[v.key] ? 'HIDE' : 'REVEAL'}</Text>
                    </Pressable>
                  ) : null}
                </View>
                <Text style={styles.envKey}>{v.key}</Text>
                <Text style={styles.envLabel}>{v.label}</Text>
                <View style={styles.envValueBox}>
                  <Text style={styles.envValue} selectable numberOfLines={v.sensitive && !revealedKeys[v.key] ? 1 : undefined}>
                    {v.sensitive && !revealedKeys[v.key]
                      ? v.value.slice(0, 12) + '••••••••••••••••••••••••••••••••••••••••••••••••'
                      : v.value}
                  </Text>
                </View>
              </View>
            ))}

            {/* ── BACKEND SECRETS ── */}
            <SectionHeader label="BACKEND SECRETS (SERVER-SIDE)" color="#ff4444" icon="lock" />
            <View style={[styles.envNote, { borderColor: Colors.danger + '33', backgroundColor: Colors.danger + '08' }]}>
              <MaterialIcons name="warning" size={12} color={Colors.danger} />
              <Text style={[styles.envNoteText, { color: Colors.danger + 'cc' }]}>Fetched live from the edge function runtime. Values shown in full from the server environment.</Text>
            </View>
            {!secretsLoaded ? (
              <Pressable
                style={({ pressed }) => [styles.fetchSecretsBtn, pressed && { opacity: 0.7 }, secretsLoading && { opacity: 0.5 }]}
                onPress={loadServerSecrets}
                disabled={secretsLoading}
              >
                {secretsLoading
                  ? <ActivityIndicator size="small" color={Colors.danger} />
                  : <MaterialIcons name="cloud-download" size={14} color={Colors.danger} />}
                <Text style={styles.fetchSecretsBtnText}>{secretsLoading ? 'FETCHING FROM SERVER...' : 'FETCH ALL SECRET VALUES'}</Text>
              </Pressable>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.fetchSecretsBtn, { borderColor: Colors.textMuted + '44' }, pressed && { opacity: 0.7 }]}
                onPress={loadServerSecrets}
              >
                <MaterialIcons name="refresh" size={14} color={Colors.textMuted} />
                <Text style={[styles.fetchSecretsBtnText, { color: Colors.textMuted }]}>REFRESH VALUES</Text>
              </Pressable>
            )}
            {BACKEND_SECRETS.map((s) => {
              const liveVal = serverSecrets[s.key];
              const isRevealed = revealedKeys[s.key];
              return (
                <View key={s.key} style={[styles.envCard, { borderColor: Colors.danger + '22' }]}>
                  <View style={styles.envCardTop}>
                    <View style={[styles.catBadge, { borderColor: Colors.danger + '44', backgroundColor: Colors.danger + '11' }]}>
                      <Text style={[styles.catBadgeText, { color: Colors.danger }]}>{s.category}</Text>
                    </View>
                    {secretsLoaded && liveVal ? (
                      <Pressable onPress={() => toggleReveal(s.key)} style={[styles.revealBtn, { marginLeft: 'auto' }]} hitSlop={8}>
                        <MaterialIcons name={isRevealed ? 'visibility-off' : 'visibility'} size={13} color={Colors.textMuted} />
                        <Text style={styles.revealBtnText}>{isRevealed ? 'HIDE' : 'REVEAL'}</Text>
                      </Pressable>
                    ) : (
                      <View style={[styles.catBadge, { borderColor: Colors.accent + '33', backgroundColor: Colors.accentMuted, marginLeft: 'auto' }]}>
                        <MaterialIcons name="lock" size={8} color={Colors.accent} />
                        <Text style={[styles.catBadgeText, { color: Colors.accent }]}>SERVER</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.envKey}>{s.key}</Text>
                  <Text style={styles.envLabel}>{s.label}</Text>
                  <View style={[styles.envValueBox, { borderColor: Colors.danger + '22', backgroundColor: '#030303' }]}>
                    {secretsLoaded && liveVal ? (
                      <Text style={[styles.envValue, { color: '#ff7777' }]} selectable numberOfLines={isRevealed ? undefined : 1}>
                        {isRevealed ? liveVal : liveVal.slice(0, 12) + '•'.repeat(Math.max(0, liveVal.length - 12))}
                      </Text>
                    ) : (
                      <Text style={[styles.envValue, { color: Colors.textMuted }]}>
                        {secretsLoading ? 'Fetching...' : '(press FETCH to load)'}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.envNote2}>{s.note}</Text>
                </View>
              );
            })}

            {/* ── RAW PAYLOAD (shown after fetch) ── */}
            {secretsLoaded && Object.keys(serverSecrets).length > 0 ? (
              <>
                <SectionHeader label="RAW PAYLOAD — FULL VALUES" color="#ff4444" icon="data-object" />
                <View style={[styles.envNote, { borderColor: Colors.danger + '44', backgroundColor: Colors.danger + '08' }]}>
                  <MaterialIcons name="warning" size={12} color={Colors.danger} />
                  <Text style={[styles.envNoteText, { color: Colors.danger + 'cc' }]}>
                    Live JSON response from POST /api/functions/v1/get-secrets — all values unmasked.
                  </Text>
                </View>
                <View style={[styles.codeSnippet, { borderColor: '#ff444433' }]}>
                  <Text style={[styles.codeSnippetLabel, { color: '#ff4444' }]}>
                    {'200 OK  ·  application/json'}
                  </Text>
                  <Text style={[styles.codeSnippetText, { color: '#ff9999', lineHeight: 20 }]} selectable>
                    {JSON.stringify(serverSecrets, null, 2)}
                  </Text>
                </View>

                <SectionHeader label="AXIOM CHAT — AI KEY PAYLOAD" color="#ffcc00" icon="send" />
                <View style={styles.codeSnippet}>
                  <Text style={styles.codeSnippetLabel}>axiom-chat/index.ts  (server-side Deno runtime)</Text>
                  <Text style={styles.codeSnippetText} selectable>{
`// ── AI credentials read server-side, never exposed to client ──
const apiKey = Deno.env.get('ONSPACE_AI_API_KEY');
// VALUE: "${aiKey}"

const baseUrl = Deno.env.get('ONSPACE_AI_BASE_URL');
// VALUE: "${aiBase}"

// ── Outbound request to OnSpace AI ──
fetch(baseUrl + '/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + apiKey,
    'Content-Type':  'application/json',
  },
  body: JSON.stringify({
    model:    'google/gemini-3-flash-preview',
    stream:   true,
    messages: [{ role: 'user', content: '...' }],
  }),
});`
                  }</Text>
                </View>

                <SectionHeader label="SUPABASE ADMIN — SERVICE ROLE PAYLOAD" color="#ffcc00" icon="admin-panel-settings" />
                <View style={styles.codeSnippet}>
                  <Text style={styles.codeSnippetLabel}>Server-side admin client (bypasses RLS)</Text>
                  <Text style={styles.codeSnippetText} selectable>{
`const SUPABASE_URL              = Deno.env.get('SUPABASE_URL');
// VALUE: "${sbUrl}"

const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
// VALUE: "${svcRole}"

const SUPABASE_DB_URL           = Deno.env.get('SUPABASE_DB_URL');
// VALUE: "${dbUrl}"

// Admin client — full DB privileges, bypasses RLS:
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);`
                  }</Text>
                </View>
              </>
            ) : null}

            {/* ── RUNTIME ACCESS PATTERN ── */}
            <SectionHeader label="RUNTIME ACCESS PATTERN" color="#ffcc00" icon="code" />
            <View style={styles.codeSnippet}>
              <Text style={styles.codeSnippetLabel}>Client-side (React Native)</Text>
              <Text style={styles.codeSnippetText}>{`// Accessible anywhere in the app
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Used in fetch calls:
fetch(\`\${url}/api/functions/v1/axiom-chat\`, {
  headers: { Authorization: \`Bearer \${key}\` }
});`}</Text>
            </View>
            <View style={styles.codeSnippet}>
              <Text style={styles.codeSnippetLabel}>Edge Function (Deno / server-side)</Text>
              <Text style={styles.codeSnippetText}>{`// Secrets only available server-side:
const aiKey   = Deno.env.get('ONSPACE_AI_API_KEY');
const svcRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const dbUrl   = Deno.env.get('SUPABASE_DB_URL');

// Never sent to clients — safe for admin ops`}</Text>
            </View>
          </>
        )}

        {/* ══════════════════════ RUNTIME ══════════════════════ */}
        {activeSection === 'runtime' && (
          <>
            <SectionHeader label="EXECUTION ENVIRONMENT" color={Colors.warning} icon="developer-mode" />
            <MonoCard rows={[
              ['Platform',        Platform.OS],
              ['React Native',    '0.76+ (New Architecture)'],
              ['Expo SDK',        '52+'],
              ['Expo Router',     '4.x (file-system routing)'],
              ['TypeScript',      'strict mode, typed routes'],
              ['JSX Transform',   'automatic'],
              ['Hermes Engine',   'enabled (iOS + Android)'],
              ['Bundler',         'Metro'],
              ['Dev Client',      'Expo Go / OnSpace APP'],
            ]} />

            <SectionHeader label="NAVIGATION ARCHITECTURE" color={Colors.warning} icon="route" />
            <MonoCard rows={[
              ['Router',           'expo-router v4'],
              ['Root Layout',      'app/_layout.tsx → AlertProvider'],
              ['Tab Group',        'app/(tabs)/_layout.tsx → 6 tabs'],
              ['Screens',          'index | terminal | ops | intel | files | config'],
              ['Safe Area',        'react-native-safe-area-context'],
              ['Header Strategy',  'headerShown: false → custom headers'],
            ]} />

            <SectionHeader label="AI STREAMING PIPELINE" color={Colors.warning} icon="stream" />
            <MonoCard rows={[
              ['Protocol',         STREAMING_CONFIG.protocol],
              ['Frame Format',     STREAMING_CONFIG.format],
              ['Terminator',       STREAMING_CONFIG.terminator],
              ['Mobile Fallback',  STREAMING_CONFIG.fallback],
              ['Buffer Strategy',  STREAMING_CONFIG.bufferStrategy],
              ['Accumulation',     STREAMING_CONFIG.chunkAccumulation],
              ['Error Parsing',    STREAMING_CONFIG.errorHandling],
              ['Lock Release',     STREAMING_CONFIG.readerRelease],
            ]} />

            <SectionHeader label="TERMINAL RUNTIME MATRIX" color={Colors.warning} icon="terminal" />
            <View style={styles.runtimeTable}>
              <View style={[styles.runtimeRow, styles.runtimeHeader]}>
                <Text style={[styles.runtimeCell, styles.runtimeHeaderText, { flex: 1.2 }]}>LANGUAGE</Text>
                <Text style={[styles.runtimeCell, styles.runtimeHeaderText, { flex: 1 }]}>VERSION</Text>
                <Text style={[styles.runtimeCell, styles.runtimeHeaderText, { flex: 0.8 }]}>FILE</Text>
              </View>
              {[
                ['bash',       '5.2.0',   'main.sh'],
                ['python',     '3.10.0',  'main.py'],
                ['javascript', '18.15.0', 'main.js'],
                ['typescript', '5.0.3',   'main.ts'],
                ['go',         '1.16.2',  'main.go'],
                ['rust',       '1.50.0',  'main.rs'],
                ['ruby',       '3.0.1',   'main.rb'],
                ['c',          '10.2.0',  'main.c'],
                ['c++',        '10.2.0',  'main.cpp'],
                ['php',        '8.0.2',   'main.php'],
                ['perl',       '5.36.0',  'main.pl'],
                ['lua',        '5.4.4',   'main.lua'],
                ['powershell', '7.1.4',   'main.ps1'],
              ].map(([lang, ver, file], i) => (
                <View key={lang} style={[styles.runtimeRow, i % 2 === 0 && { backgroundColor: '#0d0d0d' }]}>
                  <Text style={[styles.runtimeCell, { flex: 1.2, color: Colors.accent }]}>{lang}</Text>
                  <Text style={[styles.runtimeCell, { flex: 1, color: Colors.textSecondary }]}>{ver}</Text>
                  <Text style={[styles.runtimeCell, { flex: 0.8, color: Colors.textMuted }]}>{file}</Text>
                </View>
              ))}
            </View>

            <SectionHeader label="PISTON SANDBOX ENDPOINTS" color={Colors.warning} icon="dns" />
            {PISTON_ENDPOINTS.map((ep, i) => (
              <View key={i} style={styles.endpointRow}>
                <View style={[styles.endpointDot, { backgroundColor: ep.primary ? Colors.accent : Colors.textMuted }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.endpointUrl}>{ep.url}</Text>
                  <Text style={styles.endpointMeta}>{ep.primary ? 'PRIMARY' : 'FALLBACK'} · timeout 20000ms · Piston v2 API</Text>
                </View>
              </View>
            ))}

            <SectionHeader label="CLIENT-SIDE EXECUTION TIMEOUT" color={Colors.warning} icon="timer" />
            <MonoCard rows={[
              ['Client Abort',    '25000ms (AbortController)'],
              ['Piston Timeout',  '20000ms (per endpoint)'],
              ['Fallback Policy', 'iterate PISTON_URLS on failure'],
              ['Run Timeout',     '15000ms (Piston compile+run)'],
              ['Compile Timeout', '15000ms'],
            ]} />

            <SectionHeader label="MESSAGE RENDERING ENGINE" color={Colors.warning} icon="format-quote" />
            <MonoCard rows={[
              ['Renderer',         'ContentRenderer (custom markdown)'],
              ['Block Elements',   'h1/h2/h3, ul/ol, blockquote, code'],
              ['Inline Elements',  '**bold**, *italic*, `inlineCode`'],
              ['Code Blocks',      'syntax-highlighted, COPY + RUN buttons'],
              ['Exec Languages',   'bash|sh|python|javascript|go|rust|ruby|c|cpp|php|perl|lua|powershell|ts'],
              ['String Guard',     'typeof content === "string" check'],
              ['Image Lib',        'expo-image (blurhash support)'],
              ['Icons',            '@expo/vector-icons MaterialIcons'],
            ]} />
          </>
        )}

        {/* ══════════════════════ STORAGE ══════════════════════ */}
        {activeSection === 'storage' && (
          <>
            <SectionHeader label="ASYNC STORAGE MAP" color={Colors.info} icon="storage" />
            {storageLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={Colors.info} />
                <Text style={styles.loadingText}>Reading storage...</Text>
              </View>
            ) : (
              ALL_STORAGE_KEYS.map(({ key, label, category }) => {
                const snap = storageSnapshot[key] || { size: 0, preview: '(not loaded)' };
                return (
                  <View key={key} style={styles.storageRow}>
                    <View style={styles.storageRowTop}>
                      <View style={[styles.catBadge, { borderColor: Colors.info + '44', backgroundColor: Colors.info + '11' }]}>
                        <Text style={[styles.catBadgeText, { color: Colors.info }]}>{category}</Text>
                      </View>
                      <Text style={styles.storageSizeText}>{formatBytes(snap.size)}</Text>
                    </View>
                    <Text style={styles.storageKey}>{key}</Text>
                    <Text style={styles.storageLabel}>{label}</Text>
                    <Text style={styles.storagePreview} numberOfLines={2}>{snap.preview}</Text>
                  </View>
                );
              })
            )}

            <Pressable
              style={({ pressed }) => [styles.refreshBtn, pressed && { opacity: 0.7 }]}
              onPress={loadStorageSnapshot}
            >
              <MaterialIcons name="refresh" size={14} color={Colors.info} />
              <Text style={styles.refreshBtnText}>REFRESH SNAPSHOT</Text>
            </Pressable>

            <SectionHeader label="SESSION STORAGE CONFIG" color={Colors.info} icon="history" />
            <MonoCard rows={[
              ['Storage Key',       SESSION_CONFIG.storageKey],
              ['Max Sessions',      String(SESSION_CONFIG.maxSessions)],
              ['Auto-Save',         SESSION_CONFIG.autoSaveDebounce + ' debounce'],
              ['Date Rehydration',  'new Date(timestamp) on load'],
              ['System Messages',   'filtered from UI (role !== system)'],
              ['Title Generation',  SESSION_CONFIG.titleGeneration],
              ['Current Sessions',  String(sessionCount)],
            ]} />

            <SectionHeader label="KNOWLEDGE BASE STORAGE" color={Colors.info} icon="library-books" />
            <MonoCard rows={[
              ['Storage Key',     'axiom_knowledge_base'],
              ['Total Entries',   String(kb.length)],
              ['Seeded Entries',  '3 (hardware, identity, evasion)'],
              ['Sources',         'manual | learned | ai-generated'],
              ['Auto-Learn Sigs', SELF_UPDATE_CONFIG.autoLearnTriggers.join(' | ')],
              ['Summary Limit',   `${SELF_UPDATE_CONFIG.autoLearnSummaryLength} chars`],
              ['Context Limit',   `${SELF_UPDATE_CONFIG.kbContextLimit} entries injected into system prompt`],
            ]} />

            <SectionHeader label="UPDATE LOG" color={Colors.info} icon="update" />
            <MonoCard rows={[
              ['Storage Key',    'axiom_update_log'],
              ['Max Entries',    String(SELF_UPDATE_CONFIG.updateLogMaxEntries)],
              ['Event Types',    SELF_UPDATE_CONFIG.updateTypes.join(' | ')],
              ['Auto Flagging',  'automated: true for AI-generated changes'],
              ['Total Events',   String(updateLog.length)],
              ['Auto Events',    String(updateLog.filter(l => l.automated).length)],
            ]} />
          </>
        )}

        {/* ══════════════════════ EDGE FUNCTIONS ══════════════════════ */}
        {activeSection === 'edge' && (
          <>
            <SectionHeader label="DEPLOYED EDGE FUNCTIONS" color="#aa44ff" icon="cloud-queue" />
            {EDGE_FUNCTIONS.map(fn => (
              <View key={fn.name} style={styles.edgeCard}>
                <Pressable
                  style={styles.edgeCardHeader}
                  onPress={() => setExpandedEdge(expandedEdge === fn.name ? null : fn.name)}
                >
                  <View style={styles.edgeCardLeft}>
                    <View style={[styles.methodBadge, { backgroundColor: '#aa44ff22', borderColor: '#aa44ff44' }]}>
                      <Text style={[styles.methodText, { color: '#aa44ff' }]}>{fn.method}</Text>
                    </View>
                    <Text style={styles.edgeName}>{fn.name}</Text>
                    {fn.streaming ? (
                      <View style={styles.streamBadge}>
                        <Text style={styles.streamBadgeText}>SSE</Text>
                      </View>
                    ) : null}
                  </View>
                  <MaterialIcons
                    name={expandedEdge === fn.name ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                    size={18}
                    color={Colors.textMuted}
                  />
                </Pressable>
                <Text style={styles.edgePath}>{process.env.EXPO_PUBLIC_SUPABASE_URL}{fn.path}</Text>
                <Text style={styles.edgeDesc}>{fn.description}</Text>

                {expandedEdge === fn.name ? (
                  <View style={styles.edgeExpanded}>
                    <KVRow label="Auth"     value={fn.auth} />
                    <KVRow label="Timeout"  value={fn.timeout} />
                    <KVRow label="CORS"     value={fn.cors ? 'enabled (all origins)' : 'disabled'} />
                    <KVRow label="Request"  value={fn.requestSchema} mono />
                    <KVRow label="Response" value={fn.responseSchema} mono />
                    <Text style={styles.edgeSubLabel}>ENV VARS</Text>
                    {fn.envVars.map(v => (
                      <View key={v} style={styles.envVarRow}>
                        <MaterialIcons name="lock" size={10} color={Colors.warning} />
                        <Text style={styles.envVarText}>{v}</Text>
                      </View>
                    ))}
                    <Text style={styles.edgeSubLabel}>
                      {fn.name === 'code-exec' ? 'LANGUAGE RUNTIMES' : 'AVAILABLE MODELS'}
                    </Text>
                    {fn.runtimes.map(r => (
                      <View key={r} style={styles.runtimeChip}>
                        <Text style={styles.runtimeChipText}>{r}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ))}

            <SectionHeader label="CORS HEADERS" color="#aa44ff" icon="http" />
            <MonoCard rows={[
              ['Access-Control-Allow-Origin',  '*'],
              ['Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type'],
              ['Access-Control-Allow-Methods', 'POST, GET, OPTIONS'],
              ['Preflight',                    'OPTIONS → 200 ok'],
              ['Shared Module',                'supabase/functions/_shared/cors.ts'],
            ]} />

            <SectionHeader label="INVOCATION PATTERNS" color="#aa44ff" icon="code" />
            <View style={styles.codeSnippet}>
              <Text style={styles.codeSnippetLabel}>axiom-chat (streaming)</Text>
              <Text style={styles.codeSnippetText}>{`fetch(\`\${SUPABASE_URL}/api/functions/v1/axiom-chat\`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': \`Bearer \${SUPABASE_ANON_KEY}\`,
  },
  body: JSON.stringify({ messages, stream: true }),
});
// → ReadableStream via response.body.getReader()`}</Text>
            </View>
            <View style={styles.codeSnippet}>
              <Text style={styles.codeSnippetLabel}>code-exec (JSON)</Text>
              <Text style={styles.codeSnippetText}>{`fetch(\`\${SUPABASE_URL}/api/functions/v1/code-exec\`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': \`Bearer \${SUPABASE_ANON_KEY}\`,
  },
  body: JSON.stringify({ language: 'python', code: '...' }),
});
// → { success, exitCode, stdout, stderr, output }`}</Text>
            </View>
          </>
        )}

        {/* ══════════════════════ AI ENGINE ══════════════════════ */}
        {activeSection === 'ai' && (
          <>
            <SectionHeader label="CUSTOM AI PROVIDER" color="#ff8800" icon="link" />

            {/* ── Saved provider bubble (shows when not editing and saved) ── */}
            {customProvider.saved && !editingCustom && (
              <View
                style={{
                  borderRadius: Radius.xl,
                  borderWidth: 1,
                  borderColor: customProvider.enabled ? '#ff880099' : Colors.surfaceBorder,
                  backgroundColor: customProvider.enabled ? '#ff880014' : Colors.surfaceElevated,
                  padding: Spacing.md,
                  gap: Spacing.sm,
                  marginBottom: Spacing.sm,
                  shadowColor: '#ff8800',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: customProvider.enabled ? 0.25 : 0,
                  shadowRadius: 12,
                  elevation: customProvider.enabled ? 4 : 0,
                }}
                testID="custom-provider-bubble"
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                  <View
                    style={{
                      width: 9, height: 9, borderRadius: 4.5,
                      backgroundColor: customProvider.enabled ? '#ff8800' : Colors.textMuted,
                      shadowColor: '#ff8800', shadowOpacity: customProvider.enabled ? 0.9 : 0,
                      shadowRadius: 4, shadowOffset: { width: 0, height: 0 },
                    }}
                  />
                  <Text
                    style={{
                      flex: 1,
                      color: customProvider.enabled ? '#ff8800' : Colors.textPrimary,
                      fontSize: Typography.base,
                      fontWeight: Typography.bold,
                      letterSpacing: 1,
                    }}
                    numberOfLines={1}
                  >
                    {customProvider.label || 'Custom Provider'}
                  </Text>
                  <Switch
                    value={customProvider.enabled}
                    onValueChange={toggleCustomEnabled}
                    trackColor={{ false: Colors.surfaceBorder, true: '#ff880066' }}
                    thumbColor={customProvider.enabled ? '#ff8800' : Colors.textMuted}
                    testID="custom-provider-bubble-toggle"
                  />
                </View>

                {/* Model + URL chips */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {customProvider.model ? (
                    <View
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 4,
                        paddingHorizontal: Spacing.sm, paddingVertical: 3,
                        borderRadius: Radius.full,
                        borderWidth: 1, borderColor: '#ff880055',
                        backgroundColor: '#ff88001a',
                      }}
                    >
                      <MaterialIcons name="memory" size={11} color="#ff8800" />
                      <Text
                        style={{
                          color: '#ff8800', fontSize: 11, fontWeight: Typography.bold,
                          fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                        }}
                        numberOfLines={1}
                      >
                        {customProvider.model}
                      </Text>
                    </View>
                  ) : (
                    <View
                      style={{
                        paddingHorizontal: Spacing.sm, paddingVertical: 3,
                        borderRadius: Radius.full,
                        borderWidth: 1, borderColor: Colors.surfaceBorder,
                        backgroundColor: Colors.surface,
                      }}
                    >
                      <Text style={{ color: Colors.textMuted, fontSize: 11 }}>no model set</Text>
                    </View>
                  )}
                  <View
                    style={{
                      paddingHorizontal: Spacing.sm, paddingVertical: 3,
                      borderRadius: Radius.full,
                      borderWidth: 1, borderColor: Colors.surfaceBorder,
                      backgroundColor: Colors.surface,
                      flexShrink: 1,
                    }}
                  >
                    <Text
                      style={{
                        color: Colors.textMuted, fontSize: 11,
                        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                      }}
                      numberOfLines={1}
                    >
                      {customProvider.baseUrl.replace(/^https?:\/\//, '')}
                    </Text>
                  </View>
                </View>

                {/* Edit / Clear */}
                <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: 2 }}>
                  <Pressable
                    style={({ pressed }) => [
                      {
                        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                        gap: 5, paddingVertical: Spacing.sm, borderRadius: Radius.lg,
                        borderWidth: 1, borderColor: '#ff880055', backgroundColor: '#ff880011',
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                    onPress={() => setEditingCustom(true)}
                    testID="edit-custom-provider"
                  >
                    <MaterialIcons name="edit" size={13} color="#ff8800" />
                    <Text style={{ color: '#ff8800', fontSize: Typography.xs, fontWeight: Typography.bold, letterSpacing: 1.2 }}>
                      EDIT
                    </Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.dangerBtn,
                      { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
                      pressed && { opacity: 0.7 },
                    ]}
                    onPress={handleClearCustomProvider}
                  >
                    <MaterialIcons name="delete-outline" size={13} color={Colors.danger} />
                    <Text style={styles.dangerBtnText}>CLEAR</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* ── Edit form (hidden when saved bubble is shown) ── */}
            {(!customProvider.saved || editingCustom) && (<>
            {/* Enable toggle */}
            <View style={styles.toggleCard}>
              <View style={[styles.toggleRow]}>
                <View style={styles.toggleInfo}>
                  <Text style={styles.toggleLabel}>Use Custom Provider</Text>
                  <Text style={styles.toggleDesc}>
                    Route all AI requests through your own OpenAI-compatible endpoint instead of OnSpace AI
                  </Text>
                </View>
                <Switch
                  value={customProvider.enabled}
                  onValueChange={v => setCustomProviderState(p => ({ ...p, enabled: v }))}
                  trackColor={{ false: Colors.surfaceBorder, true: '#ff880066' }}
                  thumbColor={customProvider.enabled ? '#ff8800' : Colors.textMuted}
                  ios_backgroundColor={Colors.surfaceBorder}
                />
              </View>
            </View>

            {/* Provider label */}
            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>PROVIDER LABEL (optional)</Text>
              <View style={styles.inputWrap}>
                <MaterialIcons name="label-outline" size={13} color={Colors.textMuted} />
                <TextInput
                  style={styles.inputField}
                  value={customProvider.label}
                  onChangeText={v => setCustomProviderState(p => ({ ...p, label: v }))}
                  placeholder="e.g. OpenAI, Ollama, LM Studio, Groq..."
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* Base URL */}
            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>BASE URL *</Text>
              <View style={[styles.inputWrap, { borderColor: customProvider.baseUrl ? '#ff880055' : Colors.surfaceBorder }]}>
                <MaterialIcons name="link" size={13} color={Colors.textMuted} />
                <TextInput
                  style={styles.inputField}
                  value={customProvider.baseUrl}
                  onChangeText={v => setCustomProviderState(p => ({ ...p, baseUrl: v }))}
                  placeholder="https://api.openai.com/v1"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
                {customProvider.baseUrl ? (
                  <Pressable onPress={() => setCustomProviderState(p => ({ ...p, baseUrl: '' }))} hitSlop={8}>
                    <MaterialIcons name="close" size={13} color={Colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>
            </View>

            {/* API Key */}
            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>API KEY *</Text>
              <View style={[styles.inputWrap, { borderColor: customProvider.apiKey ? '#ff880055' : Colors.surfaceBorder }]}>
                <MaterialIcons name="vpn-key" size={13} color={Colors.textMuted} />
                <TextInput
                  style={[styles.inputField, { flex: 1 }]}
                  value={customProvider.apiKey}
                  onChangeText={v => setCustomProviderState(p => ({ ...p, apiKey: v }))}
                  placeholder="sk-..."
                  placeholderTextColor={Colors.textMuted}
                  secureTextEntry={!showCustomKey}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Pressable onPress={() => setShowCustomKey(v => !v)} hitSlop={8}>
                  <MaterialIcons name={showCustomKey ? 'visibility-off' : 'visibility'} size={13} color={Colors.textMuted} />
                </Pressable>
              </View>
            </View>

            {/* Model ID */}
            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>MODEL ID *</Text>
              <View style={[styles.inputWrap, { borderColor: customProvider.model ? '#ff880055' : Colors.surfaceBorder }]}>
                <MaterialIcons name="memory" size={13} color={Colors.textMuted} />
                <TextInput
                  style={styles.inputField}
                  value={customProvider.model}
                  onChangeText={v => setCustomProviderState(p => ({ ...p, model: v }))}
                  placeholder="e.g. llama-3.2-1b-abliterated, gpt-4o-mini, mixtral-8x7b..."
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  testID="custom-provider-model-input"
                />
                {customProvider.model ? (
                  <Pressable onPress={() => setCustomProviderState(p => ({ ...p, model: '' }))} hitSlop={8}>
                    <MaterialIcons name="close" size={13} color={Colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>
            </View>

            {/* Model suggestions */}
            <Text style={styles.fieldLabel}>MODEL SUGGESTIONS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: Spacing.sm, paddingBottom: Spacing.sm }}>
              {[
                'gpt-4o-mini',
                'gpt-4o',
                'gpt-4-turbo',
                'claude-3-5-sonnet-20241022',
                'mixtral-8x7b-32768',
                'llama-3.1-70b-versatile',
                'llama-3.2-1b-abliterated',
                'mistral-large-latest',
                'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
                'qwen/qwen-2.5-72b-instruct',
                'deepseek/deepseek-chat',
              ].map(m => (
                <Pressable
                  key={m}
                  style={({ pressed }) => [{
                    paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full,
                    borderWidth: 1, borderColor: customProvider.model === m ? '#ff880066' : Colors.surfaceBorder,
                    backgroundColor: customProvider.model === m ? '#ff880011' : Colors.surface,
                    opacity: pressed ? 0.7 : 1,
                  }]}
                  onPress={() => setCustomProviderState(p => ({ ...p, model: m }))}
                >
                  <Text
                    style={[{
                      fontSize: Typography.xs, fontWeight: Typography.medium,
                      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                    }, customProvider.model === m && { color: '#ff8800' }]}
                  >
                    {m}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Quick presets */}
            <Text style={styles.fieldLabel}>QUICK PRESETS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: Spacing.sm, paddingBottom: Spacing.sm }}>
              {[
                { label: 'OpenAI', url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
                { label: 'Groq', url: 'https://api.groq.com/openai/v1', model: 'llama-3.1-70b-versatile' },
                { label: 'Mistral', url: 'https://api.mistral.ai/v1', model: 'mistral-large-latest' },
                { label: 'Together', url: 'https://api.together.xyz/v1', model: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo' },
                { label: 'OpenRouter', url: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
                { label: 'Ollama', url: 'http://localhost:11434/v1', model: 'llama3.2' },
                { label: 'LM Studio', url: 'http://localhost:1234/v1', model: 'local-model' },
                { label: 'Perplexity', url: 'https://api.perplexity.ai', model: 'sonar' },
              ].map(preset => (
                <Pressable
                  key={preset.label}
                  style={({ pressed }) => [{
                    paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full,
                    borderWidth: 1, borderColor: customProvider.baseUrl === preset.url ? '#ff880066' : Colors.surfaceBorder,
                    backgroundColor: customProvider.baseUrl === preset.url ? '#ff880011' : Colors.surface,
                    opacity: pressed ? 0.7 : 1,
                  }]}
                  onPress={() => setCustomProviderState(p => ({
                    ...p,
                    baseUrl: preset.url,
                    label: p.label || preset.label,
                    model: p.model || preset.model,
                  }))}
                >
                  <Text style={[{ fontSize: Typography.xs, fontWeight: Typography.medium }, customProvider.baseUrl === preset.url && { color: '#ff8800' }]}>{preset.label}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Info note */}
            <View style={[styles.envNote, { borderColor: '#ff880033', backgroundColor: '#ff880008' }]}>
              <MaterialIcons name="info-outline" size={12} color="#ff8800" />
              <Text style={[styles.envNoteText, { color: '#ff8800aa' }]}>
                The URL, key and model are stored locally and sent to the axiom-chat edge function per request. They are never stored server-side.
              </Text>
            </View>

            {/* Save / Cancel buttons */}
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              {customProvider.saved && editingCustom ? (
                <Pressable
                  style={({ pressed }) => [{
                    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
                    borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.surfaceBorder,
                    backgroundColor: Colors.surface,
                    flexDirection: 'row', alignItems: 'center', gap: 5,
                    opacity: pressed ? 0.7 : 1,
                  }]}
                  onPress={() => {
                    // Cancel edit: reload saved state
                    getCustomAIProvider().then(p => setCustomProviderState(p));
                    setEditingCustom(false);
                  }}
                  testID="cancel-edit-custom-provider"
                >
                  <MaterialIcons name="close" size={13} color={Colors.textMuted} />
                  <Text style={{ color: Colors.textMuted, fontSize: Typography.xs, fontWeight: Typography.bold, letterSpacing: 1.2 }}>
                    CANCEL
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  style={({ pressed }) => [styles.dangerBtn, { paddingHorizontal: Spacing.md }, pressed && { opacity: 0.7 }]}
                  onPress={handleClearCustomProvider}
                >
                  <MaterialIcons name="delete-outline" size={13} color={Colors.danger} />
                  <Text style={styles.dangerBtnText}>CLEAR</Text>
                </Pressable>
              )}
              <Pressable
                style={({ pressed }) => [{
                  flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  backgroundColor: customSaved ? Colors.accentMuted : '#ff8800',
                  borderWidth: 1, borderColor: customSaved ? Colors.accent + '55' : '#ff880088',
                  paddingVertical: Spacing.md, borderRadius: Radius.xl,
                  shadowColor: '#ff8800', shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: customSaved ? 0 : 0.35, shadowRadius: 10, elevation: customSaved ? 0 : 6,
                  opacity: pressed ? 0.8 : 1,
                }]}
                onPress={handleSaveCustomProvider}
                disabled={savingCustom}
                testID="save-custom-provider"
              >
                {savingCustom
                  ? <ActivityIndicator size="small" color={Colors.bg} />
                  : <MaterialIcons name={customSaved ? 'check' : 'save'} size={15} color={customSaved ? Colors.accent : Colors.bg} />}
                <Text style={{ color: customSaved ? Colors.accent : Colors.bg, fontSize: Typography.base, fontWeight: Typography.bold, letterSpacing: 1.5 }}>
                  {savingCustom ? 'SAVING...' : customSaved ? 'SAVED!' : 'SAVE PROVIDER'}
                </Text>
              </Pressable>
            </View>
            </>)}

            {/* Status chip (always visible when active) */}
            {customProvider.enabled && customProvider.baseUrl && customProvider.apiKey ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs }}>
                <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#ff8800', shadowColor: '#ff8800', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 4 }} />
                <Text style={{ color: '#ff8800', fontSize: Typography.xs, fontWeight: Typography.bold, letterSpacing: 1, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
                  ACTIVE — routing to {customProvider.label || customProvider.baseUrl}{customProvider.model ? ` · ${customProvider.model}` : ''}
                </Text>
              </View>
            ) : null}

            <SectionHeader label="AI MODEL REGISTRY" color={Colors.primary} icon="psychology" />
            {MODELS.map(model => {
              const isActive = model.id === activeModel;
              return (
                <Pressable
                  key={model.id}
                  style={({ pressed }) => [
                    styles.modelCard,
                    isActive && styles.modelCardActive,
                    pressed && { opacity: 0.75 },
                  ]}
                  onPress={() => handleModelChange(model.id)}
                  onLongPress={() => setExpandedModel(expandedModel === model.id ? null : model.id)}
                >
                  <View style={styles.modelCardTop}>
                    <View style={styles.modelInfo}>
                      <View style={styles.modelTitleRow}>
                        <Text style={[styles.modelName, isActive && { color: Colors.primary }]}>{model.name}</Text>
                        <View style={[styles.tierBadge,
                          model.tier === 'pro' ? styles.tierPro : model.tier === 'lite' ? styles.tierLite : styles.tierFast
                        ]}>
                          <Text style={styles.tierText}>{model.tier.toUpperCase()}</Text>
                        </View>
                      </View>
                      <Text style={styles.modelId}>{model.id}</Text>
                      <Text style={styles.modelDesc}>{model.description}</Text>
                    </View>
                    <MaterialIcons
                      name={isActive ? 'radio-button-checked' : 'radio-button-unchecked'}
                      size={20}
                      color={isActive ? Colors.primary : Colors.textMuted}
                    />
                  </View>
                  {(isActive || expandedModel === model.id) ? (
                    <View style={styles.modelDetails}>
                      <KVRow label="Provider"  value={model.id.split('/')[0]} />
                      <KVRow label="Model ID"  value={model.id} mono />
                      <KVRow label="Tier"      value={model.tier} />
                      <KVRow label="Streaming" value="SSE supported" />
                      <KVRow label="Via"       value="axiom-chat edge function" />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}

            <SectionHeader label="SELF-UPDATE ENGINE INTERNALS" color={Colors.primary} icon="settings-suggest" />
            <MonoCard rows={[
              ['Auto-Learn Trigger', 'keywords: ' + SELF_UPDATE_CONFIG.autoLearnTriggers.slice(0, 4).join(', ') + '...'],
              ['Summary Extract',   `first ${SELF_UPDATE_CONFIG.autoLearnSummaryLength} chars of AI response`],
              ['KB Inject Limit',   `top ${SELF_UPDATE_CONFIG.kbContextLimit} entries into system prompt`],
              ['Update Types',      SELF_UPDATE_CONFIG.updateTypes.join(' | ')],
              ['Knowledge Sources', SELF_UPDATE_CONFIG.knowledgeSources.join(' | ')],
              ['Log Retention',     `${SELF_UPDATE_CONFIG.updateLogMaxEntries} entries max (FIFO)`],
              ['UI Patches',        `${SELF_UPDATE_CONFIG.uiPatchesMaxEntries} entries max`],
            ]} />

            <SectionHeader label="INTEL DATASET" color={Colors.primary} icon="grid-view" />
            <MonoCard rows={[
              ['MITRE ATT&CK',    `v15 — ${MITRE_TECHNIQUES.length} techniques`],
              ['MITRE Tactics',   `${MITRE_TACTICS.length} tactics`],
              ['Sub-techniques',  'referenced but not expanded'],
              ['Playbooks',       `${PROMPT_TEMPLATES.length} templates`],
              ['Tool Modules',    '18 built-in offensive tools'],
              ['Coverage Track',  'none | queried | tested | exploited'],
            ]} />

            <SectionHeader label="ATTACK SURFACE SERVICES" color={Colors.primary} icon="article" />
            <MonoCard rows={[
              ['aiService.ts',          'sendMessage / createSession / generateSessionTitle'],
              ['selfUpdateService.ts',  'getSystemPrompt / setSystemPrompt / autoLearnFromSession / buildEnhancedSystemPrompt'],
              ['sessionStorage.ts',     'saveSessions / loadSessions / deleteSession / clearAllSessions'],
              ['executionLog.ts',       'appendExecLog (chat + terminal events)'],
              ['attackStorage.ts',      'attack record persistence'],
            ]} />

            <SectionHeader label="UPDATE HISTORY" color={Colors.primary} icon="history" />
            {updateLog.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialIcons name="history" size={32} color={Colors.textMuted} />
                <Text style={styles.emptyText}>No update events recorded</Text>
              </View>
            ) : (
              updateLog.slice(0, 15).map(entry => {
                const c = entry.type === 'prompt' ? Colors.warning : entry.type === 'knowledge' ? Colors.info : entry.type === 'model' ? Colors.primary : Colors.accent;
                return (
                  <View key={entry.id} style={styles.logEntry}>
                    <View style={[styles.logDot, { backgroundColor: c }]} />
                    <View style={styles.logInfo}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                        <Text style={[styles.logType, { color: c }]}>{entry.type.toUpperCase()}</Text>
                        {entry.automated ? (
                          <View style={styles.autoBadge}>
                            <Text style={styles.autoText}>AUTO</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.logDesc}>{entry.description}</Text>
                      <Text style={styles.logTime}>{new Date(entry.timestamp).toLocaleString()}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}

        {/* ══════════════════════ PROMPT ══════════════════════ */}
        {activeSection === 'prompt' && (
          <>
            <SectionHeader label="SYSTEM PROMPT" color={Colors.warning} icon="edit-note" />
            <View style={styles.promptMeta}>
              <View style={styles.promptMetaRow}>
                <KVRow label="Length"   value={`${systemPrompt.length} chars`} />
              </View>
              <View style={styles.promptMetaRow}>
                <KVRow label="Storage"  value="axiom_system_prompt (AsyncStorage)" />
              </View>
              <View style={styles.promptMetaRow}>
                <KVRow label="Modified" value={updateLog.find(l => l.type === 'prompt') ? new Date(updateLog.find(l => l.type === 'prompt')!.timestamp).toLocaleString() : 'Never (using default)'} />
              </View>
            </View>
            <View style={styles.promptView}>
              <Text style={styles.promptViewText} selectable>{systemPrompt}</Text>
            </View>
            <View style={styles.promptActions}>
              <Pressable
                style={({ pressed }) => [styles.dangerBtn, pressed && { opacity: 0.7 }]}
                onPress={handlePromptReset}
              >
                <MaterialIcons name="restore" size={14} color={Colors.danger} />
                <Text style={styles.dangerBtnText}>RESET TO DEFAULT</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.8 }]}
                onPress={() => { setPromptDraft(systemPrompt); setShowPromptEditor(true); }}
              >
                <MaterialIcons name="edit" size={15} color={Colors.bg} />
                <Text style={styles.primaryBtnText}>EDIT PROMPT</Text>
              </Pressable>
            </View>

            <SectionHeader label="ENHANCED PROMPT PIPELINE" color={Colors.warning} icon="account-tree" />
            <MonoCard rows={[
              ['Step 1', 'seedInitialKnowledge() — add 3 hardcoded entries if KB empty'],
              ['Step 2', 'getSystemPrompt() — load from AsyncStorage or DEFAULT'],
              ['Step 3', 'loadKnowledgeBase() — fetch all KB entries'],
              ['Step 4', 'slice top 10 entries by insertion order'],
              ['Step 5', 'format: [CATEGORY] Title: content'],
              ['Step 6', 'append as ## OPERATIONAL KNOWLEDGE BASE section'],
              ['Output', 'full enhanced prompt injected as role:system message'],
            ]} />
          </>
        )}

        {/* ══════════════════════ KNOWLEDGE BASE ══════════════════════ */}
        {activeSection === 'kb' && (
          <>
            <View style={styles.kbHeader}>
              <SectionHeader label={`KNOWLEDGE BASE (${kb.length})`} color={Colors.accent} icon="library-books" />
              <Pressable
                style={({ pressed }) => [styles.addKBBtnInline, pressed && { opacity: 0.7 }]}
                onPress={() => setShowAddKB(true)}
              >
                <MaterialIcons name="add" size={14} color={Colors.bg} />
                <Text style={styles.addKBBtnText}>ADD</Text>
              </Pressable>
            </View>

            {kb.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialIcons name="library-books" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyText}>Knowledge base empty</Text>
                <Text style={styles.emptySub}>Add manually or run self-update</Text>
              </View>
            ) : (
              kb.map(entry => (
                <View key={entry.id} style={styles.kbEntry}>
                  <View style={styles.kbEntryTop}>
                    <View style={[
                      styles.catBadge,
                      entry.source === 'ai-generated'
                        ? { borderColor: Colors.accent + '44', backgroundColor: Colors.accentMuted }
                        : entry.source === 'learned'
                        ? { borderColor: Colors.info + '44', backgroundColor: Colors.info + '11' }
                        : { borderColor: Colors.textMuted + '33', backgroundColor: Colors.surfaceElevated },
                    ]}>
                      <Text style={[
                        styles.catBadgeText,
                        entry.source === 'ai-generated' ? { color: Colors.accent }
                          : entry.source === 'learned' ? { color: Colors.info }
                          : { color: Colors.textMuted },
                      ]}>
                        {entry.source === 'ai-generated' ? 'AI' : entry.source === 'learned' ? 'AUTO' : 'MANUAL'}
                      </Text>
                    </View>
                    <Text style={styles.kbCategory}>{entry.category}</Text>
                    <Text style={styles.kbDate}>{new Date(entry.addedAt).toLocaleDateString()}</Text>
                    <Pressable onPress={() => setDeleteKbModal(entry.id)} hitSlop={8}>
                      <MaterialIcons name="delete-outline" size={16} color={Colors.textMuted} />
                    </Pressable>
                  </View>
                  <Text style={styles.kbTitle}>{entry.title}</Text>
                  <Text style={styles.kbContent}>{entry.content}</Text>
                  <View style={styles.kbMeta}>
                    <Text style={styles.kbMetaText}>ID: {entry.id}</Text>
                    <Text style={styles.kbMetaText}>uses: {entry.useCount}</Text>
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {/* ══════════════════════ ARTIFACT ══════════════════════ */}
        {activeSection === 'artifact' && (
          <>
            <SectionHeader label="APP REWRITE ARTIFACT" color="#ff44ff" icon="content-copy" />
            <View style={[styles.envNote, { borderColor: '#ff44ff33', backgroundColor: '#ff44ff08' }]}>
              <MaterialIcons name="info-outline" size={12} color="#ff44ff" />
              <Text style={[styles.envNoteText, { color: '#ff44ffcc' }]}>
                AI rewrites the entire app into a single copyable artifact with all files separated by boundary comments. Select a category to scope the rewrite.
              </Text>
            </View>

            {/* Category filter */}
            <Text style={{ color: Colors.textMuted, fontSize: Typography.xs, fontWeight: Typography.bold, letterSpacing: 2, marginBottom: Spacing.sm }}>SCOPE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: Spacing.sm, paddingBottom: Spacing.sm }}>
              {ARTIFACT_CATS.map(cat => (
                <Pressable
                  key={cat}
                  style={[{
                    paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full,
                    borderWidth: 1, borderColor: Colors.surfaceBorder, backgroundColor: Colors.surface,
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                  }, artifactSection === cat && { borderColor: '#ff44ff55', backgroundColor: '#ff44ff11' }]}
                  onPress={() => setArtifactSection(cat)}
                >
                  <Text style={[{ color: Colors.textMuted, fontSize: Typography.xs, fontWeight: Typography.medium }, artifactSection === cat && { color: '#ff44ff' }]}>
                    {cat === 'all' ? `ALL (${ARTIFACT_FILES.length})` : `${cat} (${ARTIFACT_FILES.filter(f => f.category === cat).length})`}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* File list preview */}
            <Text style={{ color: Colors.textMuted, fontSize: Typography.xs, fontWeight: Typography.bold, letterSpacing: 2, marginBottom: Spacing.sm, marginTop: Spacing.sm }}>
              FILES TO INCLUDE ({filteredArtifactFiles.length})
            </Text>
            <View style={[sharedStyles.monoCard, { marginBottom: Spacing.base }]}>
              {filteredArtifactFiles.map((f, i) => (
                <View key={f.path} style={[sharedStyles.monoRow, i < filteredArtifactFiles.length - 1 && sharedStyles.monoBorder]}>
                  <Text style={[sharedStyles.monoKey, { width: 90, color: '#ff44ff', fontSize: 10 }]}>{f.category}</Text>
                  <Text style={[sharedStyles.monoVal, { fontSize: 10 }]}>{f.path}</Text>
                </View>
              ))}
            </View>

            {/* Generate button */}
            <Pressable
              style={({ pressed }) => [{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                backgroundColor: artifactLoading ? Colors.surfaceElevated : '#ff44ff',
                paddingVertical: Spacing.md + 2, borderRadius: Radius.xl,
                borderWidth: 1, borderColor: artifactLoading ? Colors.surfaceBorder : '#ff44ff88',
                shadowColor: '#ff44ff', shadowOffset: { width: 0, height: 0 },
                shadowOpacity: artifactLoading ? 0 : 0.4, shadowRadius: 12, elevation: artifactLoading ? 0 : 8,
                opacity: pressed ? 0.8 : 1,
              }]}
              onPress={handleGenerateArtifact}
              disabled={artifactLoading}
            >
              {artifactLoading
                ? <ActivityIndicator size="small" color={Colors.textMuted} />
                : <MaterialIcons name="auto-awesome" size={16} color={Colors.bg} />}
              <Text style={{ color: artifactLoading ? Colors.textMuted : Colors.bg, fontSize: Typography.base, fontWeight: Typography.bold, letterSpacing: 1.5 }}>
                {artifactLoading ? (artifactProgress || 'GENERATING...') : 'GENERATE ARTIFACT'}
              </Text>
            </Pressable>

            {/* Progress indicator */}
            {artifactLoading && artifactProgress ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md }}>
                <ActivityIndicator size="small" color="#ff44ff" />
                <Text style={{ color: '#ff44ff', fontSize: Typography.xs, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>{artifactProgress}</Text>
              </View>
            ) : null}

            {/* Artifact output */}
            {artifactContent ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.lg, marginBottom: Spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                    <MaterialIcons name="check-circle" size={14} color="#ff44ff" />
                    <Text style={{ color: '#ff44ff', fontSize: Typography.xs, fontWeight: Typography.bold, letterSpacing: 1.5 }}>
                      ARTIFACT READY — {(artifactContent.match(/== FILE:/g) || []).length} files · {(artifactContent.length / 1024).toFixed(1)}KB
                    </Text>
                  </View>
                  <Pressable
                    onPress={handleCopyArtifact}
                    style={({ pressed }) => [{
                      flexDirection: 'row', alignItems: 'center', gap: 5,
                      backgroundColor: artifactCopied ? '#ff44ff22' : Colors.surfaceElevated,
                      borderWidth: 1, borderColor: artifactCopied ? '#ff44ff55' : Colors.surfaceBorder,
                      paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full,
                      opacity: pressed ? 0.7 : 1,
                    }]}
                    hitSlop={8}
                  >
                    <MaterialIcons name={artifactCopied ? 'check' : 'content-copy'} size={13} color={artifactCopied ? '#ff44ff' : Colors.textMuted} />
                    <Text style={{ color: artifactCopied ? '#ff44ff' : Colors.textMuted, fontSize: Typography.xs, fontWeight: Typography.bold, letterSpacing: 1 }}>
                      {artifactCopied ? 'COPIED!' : 'COPY ALL'}
                    </Text>
                  </Pressable>
                </View>

                {/* File boundary index */}
                <View style={[sharedStyles.monoCard, { marginBottom: Spacing.sm }]}>
                  <View style={[sharedStyles.monoRow, { backgroundColor: '#0d0d0d' }]}>
                    <Text style={{ color: '#ff44ff', fontSize: 9, fontWeight: Typography.bold, letterSpacing: 1.5, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>FILE INDEX</Text>
                  </View>
                  {(artifactContent.match(/== FILE: .+? ==/g) || []).map((match, i) => (
                    <View key={i} style={[sharedStyles.monoRow, i < (artifactContent.match(/== FILE:/g) || []).length - 1 && sharedStyles.monoBorder]}>
                      <Text style={[sharedStyles.monoKey, { color: '#ff44ff', width: 24 }]}>{String(i + 1).padStart(2, '0')}</Text>
                      <Text style={[sharedStyles.monoVal, { fontSize: 10 }]}>{match.replace(/={2,}/g, '').replace('FILE:', '').trim()}</Text>
                    </View>
                  ))}
                </View>

                {/* Scrollable code output */}
                <View style={[styles.codeSnippet, { borderColor: '#ff44ff22', maxHeight: 480 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm }}>
                    <Text style={[styles.codeSnippetLabel, { color: '#ff44ff' }]}>FULL ARTIFACT — SCROLL TO VIEW</Text>
                    <Pressable
                      onPress={handleCopyArtifact}
                      hitSlop={8}
                      style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
                    >
                      <MaterialIcons name={artifactCopied ? 'check' : 'content-copy'} size={15} color={artifactCopied ? '#ff44ff' : Colors.textMuted} />
                    </Pressable>
                  </View>
                  <ScrollView showsVerticalScrollIndicator nestedScrollEnabled style={{ maxHeight: 420 }}>
                    <Text style={[styles.codeSnippetText, { color: '#ff88ff', lineHeight: 19, fontSize: 10 }]} selectable>
                      {artifactContent}
                    </Text>
                    <View style={{ height: 16 }} />
                  </ScrollView>
                </View>

                {/* Bottom copy CTA */}
                <Pressable
                  style={({ pressed }) => [{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                    backgroundColor: artifactCopied ? '#ff44ff22' : '#ff44ff',
                    paddingVertical: Spacing.md, borderRadius: Radius.xl, marginTop: Spacing.sm,
                    borderWidth: 1, borderColor: artifactCopied ? '#ff44ff55' : '#ff44ff88',
                    shadowColor: '#ff44ff', shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: artifactCopied ? 0.2 : 0.4, shadowRadius: 10, elevation: 6,
                    opacity: pressed ? 0.8 : 1,
                  }]}
                  onPress={handleCopyArtifact}
                >
                  <MaterialIcons name={artifactCopied ? 'check' : 'content-copy'} size={16} color={artifactCopied ? '#ff44ff' : Colors.bg} />
                  <Text style={{ color: artifactCopied ? '#ff44ff' : Colors.bg, fontSize: Typography.base, fontWeight: Typography.bold, letterSpacing: 1.5 }}>
                    {artifactCopied ? 'COPIED TO CLIPBOARD' : 'COPY ENTIRE ARTIFACT'}
                  </Text>
                </Pressable>
              </>
            ) : null}
          </>
        )}

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <MaterialIcons name="warning" size={12} color={Colors.warning} />
          <Text style={styles.disclaimerText}>Authorized security assessments only. Unauthorized use is illegal and unethical.</Text>
        </View>
      </ScrollView>

      {/* ── System Prompt Editor Modal ── */}
      <Modal visible={showPromptEditor} transparent animationType="slide" onRequestClose={() => setShowPromptEditor(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.modalSheet, { maxHeight: '92%' }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>EDIT SYSTEM PROMPT</Text>
              <Pressable onPress={() => setShowPromptEditor(false)} hitSlop={8}>
                <MaterialIcons name="close" size={21} color={Colors.textMuted} />
              </Pressable>
            </View>
            <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
              <TextInput
                style={styles.promptEditor}
                value={promptDraft}
                onChangeText={setPromptDraft}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={styles.promptActionRow}>
                <Pressable style={({ pressed }) => [styles.dangerBtn, pressed && { opacity: 0.7 }]} onPress={handlePromptReset}>
                  <MaterialIcons name="restore" size={14} color={Colors.danger} />
                  <Text style={styles.dangerBtnText}>RESET</Text>
                </Pressable>
                <Pressable style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.8 }]} onPress={handlePromptSave}>
                  <MaterialIcons name="save" size={15} color={Colors.bg} />
                  <Text style={styles.primaryBtnText}>SAVE</Text>
                </Pressable>
              </View>
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Add KB Entry Modal ── */}
      <Modal visible={showAddKB} transparent animationType="slide" onRequestClose={() => setShowAddKB(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>ADD KB ENTRY</Text>
              <Pressable onPress={() => setShowAddKB(false)} hitSlop={8}>
                <MaterialIcons name="close" size={21} color={Colors.textMuted} />
              </Pressable>
            </View>
            <View style={{ gap: Spacing.sm }}>
              {[
                { label: 'Title', key: 'title', ph: 'Entry title' },
                { label: 'Category', key: 'category', ph: 'technique, tool, tactic, evasion...' },
              ].map(f => (
                <TextInput
                  key={f.key}
                  style={styles.kbInput}
                  value={(kbDraft as any)[f.key]}
                  onChangeText={v => setKbDraft(d => ({ ...d, [f.key]: v }))}
                  placeholder={f.ph}
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                />
              ))}
              <TextInput
                style={[styles.kbInput, { minHeight: 80, textAlignVertical: 'top' }]}
                value={kbDraft.content}
                onChangeText={v => setKbDraft(d => ({ ...d, content: v }))}
                placeholder="Knowledge content..."
                placeholderTextColor={Colors.textMuted}
                multiline
              />
              <Pressable
                style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.8 }]}
                onPress={handleAddKB}
              >
                <Text style={styles.primaryBtnText}>ADD ENTRY</Text>
              </Pressable>
            </View>
            <View style={{ height: 24 }} />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Delete KB Confirm Modal ── */}
      <Modal visible={deleteKbModal !== null} transparent animationType="fade" onRequestClose={() => setDeleteKbModal(null)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmBox}>
            <MaterialIcons name="delete-forever" size={32} color={Colors.danger} />
            <Text style={styles.confirmTitle}>DELETE ENTRY?</Text>
            <Text style={styles.confirmSub}>This knowledge entry will be permanently removed from the KB.</Text>
            <View style={styles.confirmActions}>
              <Pressable style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.7 }]} onPress={() => setDeleteKbModal(null)}>
                <Text style={styles.cancelBtnText}>CANCEL</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.7 }]} onPress={() => deleteKbModal && handleDeleteKB(deleteKbModal)}>
                <Text style={styles.deleteBtnText}>DELETE</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function SectionHeader({ label, color, icon }: { label: string; color: string; icon: string }) {
  return (
    <View style={sharedStyles.sectionHeader}>
      <MaterialIcons name={icon as any} size={13} color={color} />
      <Text style={[sharedStyles.sectionHeaderText, { color }]}>{label}</Text>
    </View>
  );
}

function MonoCard({ rows }: { rows: [string, string][] }) {
  return (
    <View style={sharedStyles.monoCard}>
      {rows.map(([key, val], i) => (
        <View key={key + i} style={[sharedStyles.monoRow, i < rows.length - 1 && sharedStyles.monoBorder]}>
          <Text style={sharedStyles.monoKey}>{key}</Text>
          <Text style={sharedStyles.monoVal} selectable numberOfLines={3}>{val}</Text>
        </View>
      ))}
    </View>
  );
}

function KVRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={sharedStyles.kvRow}>
      <Text style={sharedStyles.kvLabel}>{label}</Text>
      <Text style={[sharedStyles.kvValue, mono && { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }]} selectable numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────────
const sharedStyles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sectionHeaderText: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  monoCard: {
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  monoRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    gap: Spacing.md,
  },
  monoBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#111',
  },
  monoKey: {
    color: Colors.accent,
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    width: 110,
    flexShrink: 0,
  },
  monoVal: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 17,
  },
  kvRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#111',
  },
  kvLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    width: 80,
    flexShrink: 0,
  },
  kvValue: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
});

// ── Main styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    backgroundColor: '#050505',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  onlineDot: {
    width: 7, height: 7, borderRadius: 3.5,
    backgroundColor: Colors.accent,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 5,
    elevation: 5,
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    letterSpacing: 3,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  vBadge: {
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  vText: { color: Colors.textMuted, fontSize: 9, fontWeight: Typography.bold, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cursorBlink: { color: Colors.accent, fontSize: Typography.sm, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  headerSub: { color: Colors.accent, fontSize: Typography.xs, fontWeight: Typography.bold, letterSpacing: 1.5, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  updateStatus: { color: Colors.accent, fontSize: Typography.xs, flex: 1, textAlign: 'right', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  sectionTabBar: { backgroundColor: '#050505', borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, maxHeight: 40 },
  sectionTabContent: { flexDirection: 'row', alignItems: 'stretch' },
  sectionTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  sectionTabText: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: Typography.bold,
    letterSpacing: 0.5,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  content: { padding: Spacing.base, gap: 0 },

  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: '#080808',
    marginBottom: Spacing.xs,
  },
  statusCell: {
    width: '25%',
    padding: Spacing.md,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderColor: '#111',
  },
  statusCellValue: { fontSize: Typography.sm, fontWeight: Typography.bold, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  statusCellLabel: { color: Colors.textMuted, fontSize: 8, letterSpacing: 0.5, marginTop: 3, textAlign: 'center', fontWeight: Typography.bold },

  storageRow: {
    backgroundColor: '#080808',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  storageRowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  storageKey: { color: Colors.accent, fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginBottom: 2 },
  storageLabel: { color: Colors.textPrimary, fontSize: Typography.sm, fontWeight: Typography.semibold, marginBottom: 4 },
  storagePreview: { color: Colors.textMuted, fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 15 },
  storageSizeText: { color: Colors.warning, fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontWeight: Typography.bold },
  catBadge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3, borderWidth: 1 },
  catBadgeText: { fontSize: 8, fontWeight: Typography.bold, letterSpacing: 0.5 },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.info + '44',
    paddingVertical: Spacing.sm,
    borderRadius: Radius.xl,
    marginBottom: Spacing.base,
  },
  refreshBtnText: { color: Colors.info, fontSize: Typography.xs, fontWeight: Typography.bold, letterSpacing: 1.5 },

  runtimeTable: {
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: '#080808',
    marginBottom: Spacing.sm,
  },
  runtimeRow: { flexDirection: 'row', paddingHorizontal: Spacing.md, paddingVertical: 7 },
  runtimeHeader: { backgroundColor: '#0d0d0d', borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  runtimeHeaderText: { color: Colors.textMuted, fontWeight: Typography.bold },
  runtimeCell: { fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  endpointRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    backgroundColor: '#080808',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  endpointDot: { width: 7, height: 7, borderRadius: 3.5, marginTop: 4, flexShrink: 0 },
  endpointUrl: { color: Colors.accent, fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginBottom: 3 },
  endpointMeta: { color: Colors.textMuted, fontSize: 10 },

  edgeCard: {
    backgroundColor: '#080808',
    borderWidth: 1,
    borderColor: '#1a1a1a',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  edgeCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  edgeCardLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  methodBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, borderWidth: 1 },
  methodText: { fontSize: 9, fontWeight: Typography.bold, letterSpacing: 1 },
  edgeName: { color: Colors.textPrimary, fontSize: Typography.base, fontWeight: Typography.bold, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  streamBadge: { backgroundColor: Colors.accent + '18', borderWidth: 1, borderColor: Colors.accent + '44', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 },
  streamBadgeText: { color: Colors.accent, fontSize: 8, fontWeight: Typography.bold, letterSpacing: 1 },
  edgePath: { color: Colors.textMuted, fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginBottom: 5 },
  edgeDesc: { color: Colors.textSecondary, fontSize: Typography.sm, lineHeight: 19, marginBottom: Spacing.sm },
  edgeExpanded: { borderTopWidth: 1, borderTopColor: '#111', paddingTop: Spacing.sm, marginTop: Spacing.sm, gap: 2 },
  edgeSubLabel: { color: Colors.textMuted, fontSize: 9, fontWeight: Typography.bold, letterSpacing: 1.5, marginTop: Spacing.sm, marginBottom: 4 },
  envVarRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
  envVarText: { color: Colors.warning, fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  runtimeChip: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 3,
    alignSelf: 'flex-start',
  },
  runtimeChipText: { color: Colors.textSecondary, fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  codeSnippet: {
    backgroundColor: '#030303',
    borderWidth: 1,
    borderColor: Colors.accent + '22',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  codeSnippetLabel: { color: Colors.accent, fontSize: 9, fontWeight: Typography.bold, letterSpacing: 1, marginBottom: 6 },
  codeSnippetText: { color: '#c8c8c8', fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 17 },

  modelCard: {
    backgroundColor: '#080808',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.sm,
  },
  modelCardActive: { borderColor: Colors.primary + '55', backgroundColor: Colors.primaryMuted },
  modelCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  modelInfo: { flex: 1 },
  modelTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 3 },
  modelName: { color: Colors.textPrimary, fontSize: Typography.base, fontWeight: Typography.semibold },
  modelId: { color: Colors.textMuted, fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginBottom: 4 },
  modelDesc: { color: Colors.textMuted, fontSize: Typography.sm, lineHeight: 18 },
  modelDetails: { marginTop: Spacing.md, borderTopWidth: 1, borderTopColor: '#111', paddingTop: Spacing.sm },
  tierBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 3, borderWidth: 1 },
  tierPro: { borderColor: Colors.warning + '44', backgroundColor: Colors.warning + '11' },
  tierFast: { borderColor: Colors.info + '44', backgroundColor: Colors.info + '11' },
  tierLite: { borderColor: Colors.textMuted + '44', backgroundColor: Colors.surfaceElevated },
  tierText: { color: Colors.textMuted, fontSize: 9, fontWeight: Typography.bold, letterSpacing: 1 },

  promptMeta: { gap: 2, marginBottom: Spacing.sm },
  promptMetaRow: { gap: 0 },
  promptView: {
    backgroundColor: '#030303',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: Radius.md,
    padding: Spacing.md,
    maxHeight: 320,
    marginBottom: Spacing.md,
  },
  promptViewText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 18,
  },
  promptActions: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.base },
  promptActionRow: { flexDirection: 'row', gap: Spacing.sm },

  kbHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addKBBtnInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  addKBBtnText: { color: Colors.bg, fontSize: Typography.xs, fontWeight: Typography.bold, letterSpacing: 1 },
  miniTag: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3, borderWidth: 1, borderColor: Colors.surfaceBorder, backgroundColor: Colors.surfaceElevated },
  miniTagText: { fontSize: 9, fontWeight: Typography.bold as any, color: Colors.textMuted, letterSpacing: 0.3 },
  kbEntry: {
    backgroundColor: '#080808',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  kbEntryTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  kbCategory: { color: Colors.textMuted, fontSize: 10, flex: 1 },
  kbDate: { color: Colors.textMuted, fontSize: 9 },
  kbTitle: { color: Colors.textPrimary, fontSize: Typography.base, fontWeight: Typography.semibold, marginBottom: 5 },
  kbContent: { color: Colors.textSecondary, fontSize: Typography.sm, lineHeight: 19, marginBottom: Spacing.sm },
  kbMeta: { flexDirection: 'row', gap: Spacing.base },
  kbMetaText: { color: Colors.textMuted, fontSize: 9, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  kbInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.textPrimary,
    fontSize: Typography.sm,
  },

  logEntry: { flexDirection: 'row', gap: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: '#111', alignItems: 'flex-start' },
  logDot: { width: 7, height: 7, borderRadius: 3.5, marginTop: 5, flexShrink: 0 },
  logInfo: { flex: 1 },
  logType: { fontSize: Typography.xs, fontWeight: Typography.bold, letterSpacing: 1 },
  autoBadge: { backgroundColor: Colors.accentMuted, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3, borderWidth: 1, borderColor: Colors.accent + '33' },
  autoText: { color: Colors.accent, fontSize: 8, fontWeight: Typography.bold, letterSpacing: 1 },
  logDesc: { color: Colors.textPrimary, fontSize: Typography.sm, lineHeight: 18, marginBottom: 2, marginTop: 3 },
  logTime: { color: Colors.textMuted, fontSize: Typography.xs, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  updateCard: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.accent + '22', borderRadius: Radius.lg, padding: Spacing.base, gap: Spacing.base, marginBottom: Spacing.sm },
  updateCardRow: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  updateCardText: { flex: 1 },
  updateCardTitle: { color: Colors.textPrimary, fontSize: Typography.base, fontWeight: Typography.semibold, marginBottom: 3 },
  updateCardDesc: { color: Colors.textMuted, fontSize: Typography.sm, lineHeight: 19 },
  selfUpdateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.accentDim, paddingVertical: Spacing.md, borderRadius: Radius.xl, ...Shadow.greenGlow },
  selfUpdateBtnText: { color: Colors.bg, fontSize: Typography.sm, fontWeight: Typography.bold, letterSpacing: 1.5 },
  btnDisabled: { opacity: 0.4, shadowOpacity: 0, elevation: 0 },

  toggleCard: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder, borderRadius: Radius.lg, overflow: 'hidden', marginBottom: Spacing.sm },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md },
  toggleBorder: { borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  toggleInfo: { flex: 1, marginRight: Spacing.md },
  toggleLabel: { color: Colors.textPrimary, fontSize: Typography.base, fontWeight: Typography.medium, marginBottom: 2 },
  toggleDesc: { color: Colors.textMuted, fontSize: Typography.sm },

  emptyState: { alignItems: 'center', paddingVertical: Spacing.xxxl, gap: Spacing.md },
  emptyText: { color: Colors.textSecondary, fontSize: Typography.base, fontWeight: Typography.medium },
  emptySub: { color: Colors.textMuted, fontSize: Typography.sm },

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.lg },
  loadingText: { color: Colors.textMuted, fontSize: Typography.sm },

  primaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.primary, paddingVertical: Spacing.md, borderRadius: Radius.xl, ...Shadow.redGlow },
  primaryBtnText: { color: Colors.bg, fontSize: Typography.base, fontWeight: Typography.bold, letterSpacing: 1.5 },
  dangerBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: Colors.danger + '44', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderRadius: Radius.xl },
  dangerBtnText: { color: Colors.danger, fontSize: Typography.sm, fontWeight: Typography.bold, letterSpacing: 1 },

  disclaimer: { flexDirection: 'row', gap: Spacing.sm, backgroundColor: Colors.warning + '0d', borderWidth: 1, borderColor: Colors.warning + '33', borderRadius: Radius.lg, padding: Spacing.md, marginTop: Spacing.lg },
  disclaimerText: { flex: 1, color: Colors.textMuted, fontSize: Typography.xs, lineHeight: 18 },

  envCard: {
    backgroundColor: '#080808',
    borderWidth: 1,
    borderColor: '#ffcc0022',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  envCardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  envKey: { color: '#ffcc00', fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginBottom: 2 },
  envLabel: { color: Colors.textPrimary, fontSize: Typography.sm, fontWeight: Typography.semibold, marginBottom: 6 },
  envValueBox: {
    backgroundColor: '#030303',
    borderWidth: 1,
    borderColor: '#ffcc0022',
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    marginBottom: 4,
  },
  envValue: { color: '#ffcc00', fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 16 },
  envNote: {
    flexDirection: 'row',
    gap: 6,
    borderWidth: 1,
    borderColor: '#ffcc0033',
    backgroundColor: '#ffcc0008',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    alignItems: 'flex-start',
  },
  envNoteText: { flex: 1, color: Colors.textMuted, fontSize: Typography.xs, lineHeight: 17 },
  envNote2: { color: Colors.textMuted, fontSize: 10, marginTop: 2 },
  revealBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.surfaceBorder, backgroundColor: Colors.surfaceElevated },
  revealBtnText: { color: Colors.textMuted, fontSize: 9, fontWeight: Typography.bold, letterSpacing: 1 },
  fetchSecretsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: Colors.danger + '55', borderRadius: Radius.xl, paddingVertical: Spacing.md, marginBottom: Spacing.md },
  formGroup: { marginBottom: Spacing.md },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: '#000', borderWidth: 1, borderColor: Colors.surfaceBorder,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
  },
  inputField: {
    flex: 1, color: Colors.textPrimary, fontSize: Typography.sm,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  fieldLabel: {
    color: Colors.textMuted, fontSize: Typography.xs, fontWeight: Typography.bold,
    letterSpacing: 1.5, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: Spacing.xs,
  },
  fetchSecretsBtnText: { color: Colors.danger, fontSize: Typography.sm, fontWeight: Typography.bold, letterSpacing: 1.5 },

  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Colors.bgSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: Colors.surfaceBorder, paddingHorizontal: Spacing.base, paddingBottom: 32 },
  modalHandle: { width: 40, height: 4, backgroundColor: Colors.surfaceBorder, borderRadius: 2, alignSelf: 'center', marginTop: Spacing.md, marginBottom: Spacing.base },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.base },
  modalTitle: { color: Colors.textPrimary, fontSize: Typography.lg, fontWeight: Typography.bold, letterSpacing: 2 },
  promptEditor: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder, borderRadius: Radius.lg, padding: Spacing.base, color: Colors.textPrimary, fontSize: Typography.sm, lineHeight: 22, minHeight: 280, textAlignVertical: 'top', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginBottom: Spacing.md },

  confirmOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing.xxl },
  confirmBox: { backgroundColor: Colors.bgSecondary, borderWidth: 1, borderColor: Colors.danger + '44', borderRadius: Radius.xxl, padding: Spacing.xl, alignItems: 'center', gap: Spacing.md, width: '100%' },
  confirmTitle: { color: Colors.textPrimary, fontSize: Typography.lg, fontWeight: Typography.bold, letterSpacing: 2 },
  confirmSub: { color: Colors.textMuted, fontSize: Typography.sm, textAlign: 'center', lineHeight: 20 },
  confirmActions: { flexDirection: 'row', gap: Spacing.md, width: '100%' },
  cancelBtn: { flex: 1, paddingVertical: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.surfaceBorder, alignItems: 'center' },
  cancelBtnText: { color: Colors.textSecondary, fontSize: Typography.base, fontWeight: Typography.semibold },
  deleteBtn: { flex: 1, paddingVertical: Spacing.md, borderRadius: Radius.xl, backgroundColor: Colors.danger, alignItems: 'center' },
  deleteBtnText: { color: Colors.bg, fontSize: Typography.base, fontWeight: Typography.bold, letterSpacing: 1 },
});
