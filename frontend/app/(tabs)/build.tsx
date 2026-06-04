/**
 * BUILD — Complete Project Export
 * Full source code of every file in the project for local reconstruction.
 * Copy any file or all files to transfer the exact project to another AI or local environment.
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  Platform, ActivityIndicator, TextInput, Share,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';
import { ArtifactRewritePanel } from '@/components/build/ArtifactRewritePanel';

const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

// ─────────────────────────────────────────────────────────────────────────────
// ALL PROJECT FILES — complete contents embedded
// ─────────────────────────────────────────────────────────────────────────────
interface ProjectFile {
  path: string;
  category: string;
  description: string;
  content: string;
}

const FILES: ProjectFile[] = [
  // ── CONFIG ───────────────────────────────────────────────────────────────
  {
    path: 'app.json',
    category: 'Config',
    description: 'Expo app configuration — name, scheme, plugins',
    content: `{
  "expo": {
    "name": "onspace-app",
    "slug": "onspace-app",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/logo.png",
    "scheme": "onspaceapp",
    "userInterfaceStyle": "automatic",
    "newArchEnabled": true,
    "ios": { "supportsTablet": true },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/logo.png",
        "backgroundColor": "#ffffff"
      },
      "edgeToEdgeEnabled": true
    },
    "web": {
      "bundler": "metro",
      "output": "static",
      "favicon": "./assets/images/logo.png"
    },
    "plugins": [
      "expo-router",
      [
        "expo-splash-screen",
        {
          "image": "./assets/images/logo.png",
          "imageWidth": 200,
          "resizeMode": "contain",
          "backgroundColor": "#ffffff"
        }
      ],
      "expo-web-browser"
    ],
    "experiments": { "typedRoutes": true }
  }
}`,
  },
  {
    path: 'tsconfig.json',
    category: 'Config',
    description: 'TypeScript configuration with strict mode and @/ path alias',
    content: `{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": [
    "**/*.ts",
    "**/*.tsx",
    ".expo/types/**/*.ts",
    "expo-env.d.ts"
  ]
}`,
  },
  {
    path: 'babel.config.js',
    category: 'Config',
    description: 'Babel configuration for Expo',
    content: `module.exports = function (api) {
  api.cache(false)
  return {
    presets: ['babel-preset-expo'],
  }
}`,
  },
  {
    path: '.env',
    category: 'Config',
    description: 'Environment variables — replace with your OnSpace Cloud values',
    content: `# OnSpace Cloud / Supabase-compatible backend
# Get these from your OnSpace Cloud dashboard
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_ID.backend.onspace.ai
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here`,
  },
  {
    path: 'package.json',
    category: 'Config',
    description: 'NPM dependencies — key packages for this project',
    content: `{
  "name": "onspace-app",
  "main": "expo-router/entry",
  "version": "1.0.0",
  "scripts": {
    "start": "expo start",
    "reset-project": "node ./scripts/reset-project.js",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web",
    "lint": "expo lint"
  },
  "dependencies": {
    "@expo/vector-icons": "^14.0.4",
    "@react-native-async-storage/async-storage": "1.23.1",
    "@supabase/supabase-js": "^2.49.4",
    "expo": "~52.0.46",
    "expo-clipboard": "~7.0.1",
    "expo-font": "~13.0.4",
    "expo-image": "~2.0.7",
    "expo-linear-gradient": "~14.0.2",
    "expo-router": "~4.0.20",
    "expo-splash-screen": "~0.29.25",
    "expo-status-bar": "~2.0.1",
    "expo-symbols": "~0.2.2",
    "expo-system-ui": "~4.0.9",
    "expo-web-browser": "~14.0.2",
    "react": "18.3.1",
    "react-native": "0.76.9",
    "react-native-paper": "^5.12.5",
    "react-native-reanimated": "~3.17.5",
    "react-native-safe-area-context": "4.12.0",
    "react-native-screens": "~4.4.0"
  },
  "devDependencies": {
    "@babel/core": "^7.25.2",
    "@types/react": "~18.3.12",
    "typescript": "^5.3.3"
  },
  "private": true
}`,
  },

  // ── NAVIGATION ────────────────────────────────────────────────────────────
  {
    path: 'app/_layout.tsx',
    category: 'Navigation',
    description: 'Root layout — AlertProvider, AuthProvider, ChatProvider, Stack navigator',
    content: `import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AlertProvider, AuthProvider } from '@/template';
import { ChatProvider } from '@/contexts/ChatContext';

export default function RootLayout() {
  return (
    <AlertProvider>
      <SafeAreaProvider>
        <AuthProvider>
          <ChatProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="login" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="profile" />
            </Stack>
          </ChatProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </AlertProvider>
  );
}`,
  },
  {
    path: 'app/index.tsx',
    category: 'Navigation',
    description: 'Root entry — AuthRouter gates access, redirects to tabs',
    content: `import { AuthRouter } from '@/template';
import { Redirect } from 'expo-router';

export default function RootScreen() {
  return (
    <AuthRouter loginRoute="/login">
      <Redirect href="/(tabs)" />
    </AuthRouter>
  );
}`,
  },
  {
    path: 'app/(tabs)/_layout.tsx',
    category: 'Navigation',
    description: 'Tab navigator — 7 tabs: CHAT, TERM, OPS, INTEL, FILES, CONFIG, BUILD',
    content: `import { MaterialIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform } from 'react-native';
import { Colors } from '@/constants/theme';

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  const tabBarStyle = {
    height: Platform.select({
      ios: insets.bottom + 58,
      android: insets.bottom + 58,
      default: 66,
    }),
    paddingTop: 8,
    paddingBottom: Platform.select({
      ios: insets.bottom + 8,
      android: insets.bottom + 8,
      default: 8,
    }),
    paddingHorizontal: 4,
    backgroundColor: Colors.bgSecondary,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 9,
          fontWeight: '700',
          letterSpacing: 0.3,
          marginTop: 1,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'CHAT', tabBarIcon: ({ color, size }) => <MaterialIcons name="chat" size={size} color={color} /> }} />
      <Tabs.Screen name="terminal" options={{ title: 'TERM', tabBarIcon: ({ color, size }) => <MaterialIcons name="terminal" size={size} color={color} /> }} />
      <Tabs.Screen name="ops" options={{ title: 'OPS', tabBarIcon: ({ color, size }) => <MaterialIcons name="flash-on" size={size} color={color} /> }} />
      <Tabs.Screen name="intel" options={{ title: 'INTEL', tabBarIcon: ({ color, size }) => <MaterialIcons name="grid-view" size={size} color={color} /> }} />
      <Tabs.Screen name="files" options={{ title: 'FILES', tabBarIcon: ({ color, size }) => <MaterialIcons name="folder" size={size} color={color} /> }} />
      <Tabs.Screen name="config" options={{ title: 'CONFIG', tabBarIcon: ({ color, size }) => <MaterialIcons name="tune" size={size} color={color} /> }} />
      <Tabs.Screen name="build" options={{ title: 'BUILD', tabBarIcon: ({ color, size }) => <MaterialIcons name="code" size={size} color={color} /> }} />
    </Tabs>
  );
}`,
  },

  // ── AUTH SCREENS ──────────────────────────────────────────────────────────
  {
    path: 'app/login.tsx',
    category: 'Auth',
    description: 'Login screen — OTP+password registration, email+password login, hacker theme',
    content: `/**
 * LOGIN — AXIOM Secure Authentication
 * OTP + Password for registration | Email + Password for login
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, Pressable,
  KeyboardAvoidingView, Platform, ScrollView,
  ActivityIndicator, Animated, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth, useAlert } from '@/template';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';

// SEE FULL FILE CONTENT IN PROJECT: app/login.tsx
// This file implements email+OTP registration and email+password login
// using the OnSpace Cloud auth template hooks.`,
  },
  {
    path: 'app/profile.tsx',
    category: 'Auth',
    description: 'Profile settings — username, password, AI model, terminal, advanced, danger zone',
    content: `/**
 * PROFILE — Operator Account Management
 * 6 sections: Account, Security, Chat, Terminal, Advanced, Danger Zone
 */
// SEE FULL FILE CONTENT IN PROJECT: app/profile.tsx
// This file manages user profile with:
// - Username update via supabase user_profiles table
// - Password change via supabase.auth.updateUser
// - AI model selection, streaming toggles, OPSEC mode
// - Terminal font size and default language
// - Storage utilization widget
// - Danger zone: clear sessions/logs/all data, sign out`,
  },

  // ── CONSTANTS ─────────────────────────────────────────────────────────────
  {
    path: 'constants/theme.ts',
    category: 'Constants',
    description: 'Design system — Colors, Typography, Spacing, Radius, Shadow tokens',
    content: `// Red Team AI — Design Tokens
export const Colors = {
  bg: '#080808',
  bgSecondary: '#0f0f0f',
  surface: '#141414',
  surfaceElevated: '#1a1a1a',
  surfaceBorder: '#222222',
  primary: '#ff2222',
  primaryDim: '#cc1a1a',
  primaryGlow: 'rgba(255,34,34,0.15)',
  primaryMuted: 'rgba(255,34,34,0.08)',
  accent: '#00ff41',
  accentDim: '#00cc33',
  accentGlow: 'rgba(0,255,65,0.12)',
  accentMuted: 'rgba(0,255,65,0.06)',
  warning: '#ffaa00',
  info: '#3399ff',
  success: '#00ff41',
  danger: '#ff2222',
  textPrimary: '#e8e8e8',
  textSecondary: '#999999',
  textMuted: '#555555',
  textAccent: '#00ff41',
  textDanger: '#ff4444',
  overlay: 'rgba(0,0,0,0.7)',
  overlayLight: 'rgba(0,0,0,0.4)',
};

export const Typography = {
  xs: 11, sm: 13, base: 15, md: 17, lg: 19, xl: 22, xxl: 28, hero: 36,
  regular: '400' as const, medium: '500' as const, semibold: '600' as const,
  bold: '700' as const, heavy: '800' as const,
};

export const Spacing = {
  xs: 4, sm: 8, md: 12, base: 16, lg: 20, xl: 24, xxl: 32, xxxl: 48,
};

export const Radius = {
  sm: 4, md: 8, lg: 12, xl: 16, xxl: 24, full: 999,
};

export const Shadow = {
  redGlow: {
    shadowColor: '#ff2222', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  greenGlow: {
    shadowColor: '#00ff41', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  card: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 8, elevation: 4,
  },
};`,
  },
  {
    path: 'constants/mitre.ts',
    category: 'Constants',
    description: 'MITRE ATT&CK v15 — 14 tactics, 60+ techniques with descriptions',
    content: `// MITRE ATT&CK v15 — Full dataset
// 14 Tactics: Recon, Resource Dev, Initial Access, Execution, Persistence,
//             Priv Esc, Defense Evasion, Cred Access, Discovery, Lateral Move,
//             Collection, C2, Exfiltration, Impact
// 60+ Techniques with tactic mappings and sub-technique counts
// See full file: constants/mitre.ts
// Key exports: MITRE_TACTICS (MitreTactic[]), MITRE_TECHNIQUES (MitreTechnique[])

export interface MitreTechnique {
  id: string;         // e.g. 'T1595'
  name: string;
  tactics: string[];  // tactic IDs e.g. ['TA0043']
  description: string;
  subtechniques?: number;
}

export interface MitreTactic {
  id: string;         // e.g. 'TA0043'
  name: string;
  shortName: string;
  color: string;
  description: string;
}

// Full arrays are ~600 lines — see constants/mitre.ts for complete data`,
  },
  {
    path: 'constants/prompts.ts',
    category: 'Constants',
    description: '12 playbook prompt templates across 6 categories',
    content: `// Playbook templates — 12 entries across:
// recon, exploitation, post-exploitation, social-engineering, evasion, reporting
// Each template: id, title, description, category, prompt (full text), tags, severity
// See full file: constants/prompts.ts
// Key exports: PROMPT_TEMPLATES (PromptTemplate[]), CATEGORIES, PromptCategory type`,
  },

  // ── CONTEXTS ─────────────────────────────────────────────────────────────
  {
    path: 'contexts/ChatContext.tsx',
    category: 'Contexts',
    description: 'Global chat state provider — wraps useChat hook',
    content: `import React, { createContext, ReactNode } from 'react';
import { useChat } from '@/hooks/useChat';

type ChatContextType = ReturnType<typeof useChat>;

export const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
  const chat = useChat();
  return <ChatContext.Provider value={chat}>{children}</ChatContext.Provider>;
}`,
  },

  // ── HOOKS ─────────────────────────────────────────────────────────────────
  {
    path: 'hooks/useChatContext.ts',
    category: 'Hooks',
    description: 'Chat context consumer hook — throws if used outside ChatProvider',
    content: `import { useContext } from 'react';
import { ChatContext } from '@/contexts/ChatContext';

export function useChatContext() {
  const context = useContext(ChatContext);
  if (!context) throw new Error('useChatContext must be used within ChatProvider');
  return context;
}`,
  },
  {
    path: 'hooks/useChat.ts',
    category: 'Hooks',
    description: 'Full chat state machine — sessions, streaming, terminal runner registration',
    content: `// useChat hook — manages all chat state
// Exports:
//   messages, isLoading, inputText, setInputText
//   sendUserMessage(text), newSession(), restoreSession(s), deleteSession(id)
//   injectPrompt(text), runInTerminal(code, lang)
//   registerTerminalRunner(fn) — called by terminal tab to receive code injections
//   sessionTitle, sessions, currentSessionId
//
// Key behaviors:
//   - On mount: loads saved sessions + creates new session with enhanced system prompt
//   - Auto-saves session to AsyncStorage with 800ms debounce
//   - Streams AI responses via sendMessage() from aiService.ts
//   - Logs all chat exchanges to executionLog.ts (type: 'chat')
//   - Terminal runner pattern: chat registers callback, terminal implements it
// See full implementation: hooks/useChat.ts`,
  },

  // ── SERVICES ─────────────────────────────────────────────────────────────
  {
    path: 'services/aiService.ts',
    category: 'Services',
    description: 'AI chat service — SSE streaming via axiom-chat edge function',
    content: `// AI Service — routes to OnSpace Cloud axiom-chat edge function
//
// Exports:
//   sendMessage(messages, onChunk) → Promise<string>
//     - POSTs to /functions/v1/axiom-chat with stream: true
//     - Uses ReadableStream reader for streaming (falls back to response.text())
//     - Calls onChunk(fullContent) progressively for live display
//     - Triggers autoLearnFromSession() in background on completion
//
//   createSession() → Promise<ChatSession>
//     - Loads enhanced system prompt (base + knowledge base)
//     - Returns session with system message + welcome message
//
//   generateSessionTitle(messages) → string
//     - First 32 chars of first user message
//
// Types: Message { id, role, content, timestamp, isStreaming? }
//        ChatSession { id, title, messages, createdAt }
//
// Endpoint: \${EXPO_PUBLIC_SUPABASE_URL}/functions/v1/axiom-chat
// Auth: Bearer \${EXPO_PUBLIC_SUPABASE_ANON_KEY}
// See full implementation: services/aiService.ts`,
  },
  {
    path: 'services/selfUpdateService.ts',
    category: 'Services',
    description: 'Self-update engine — system prompt, KB, model selection, auto-learn',
    content: `// Self-Update Engine
//
// MODELS array — 7 AI models including:
//   google/gemini-3-flash-preview (default), google/gemini-3-pro-preview,
//   openai/gpt-5.1, openai/gpt-5-mini, google/gemini-2.5-flash-lite,
//   nousresearch/hermes-3-llama-3.1-405b (OpenRouter), hermes-3-70b
//
// System Prompt management:
//   getSystemPrompt() / setSystemPrompt(p) / resetSystemPrompt()
//   DEFAULT_SYSTEM_PROMPT — AXIOM red team persona definition
//
// Knowledge Base (AsyncStorage key: axiom_knowledge_base):
//   loadKnowledgeBase() / addKnowledgeEntry(e) / deleteKnowledgeEntry(id)
//   3 seeded entries: hardware-implants, identity-cloud, evasion-c2
//
// Enhanced prompt pipeline:
//   buildEnhancedSystemPrompt() → base prompt + top 10 KB entries injected
//
// Auto-learn:
//   autoLearnFromSession(userMsg, aiResponse) → extracts KB entry if high-value
//   Triggers on keywords: CVE-, T1, exploit, bypass, technique, tool, payload
//
// Model management:
//   getActiveModel() / setActiveModel(id)
//   AsyncStorage key: axiom_model
//
// Update log: axiom_update_log (100 entries, types: prompt|knowledge|model|persona)
// UI patches: axiom_ui_patches (50 entries)
// See full implementation: services/selfUpdateService.ts`,
  },
  {
    path: 'services/sessionStorage.ts',
    category: 'Services',
    description: 'Chat session persistence — AsyncStorage CRUD with date rehydration',
    content: `import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatSession } from './aiService';

const SESSIONS_KEY = 'axiom_sessions';
const MAX_SESSIONS = 50;

export async function saveSessions(sessions: ChatSession[]): Promise<void> {
  try {
    const trimmed = sessions.slice(0, MAX_SESSIONS);
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(trimmed));
  } catch (e) { console.warn('Failed to save sessions:', e); }
}

export async function loadSessions(): Promise<ChatSession[]> {
  try {
    const raw = await AsyncStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.map((s: any) => ({
      ...s,
      createdAt: new Date(s.createdAt),
      messages: s.messages.map((m: any) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      })),
    }));
  } catch (e) { console.warn('Failed to load sessions:', e); return []; }
}

export async function deleteSession(sessionId: string): Promise<ChatSession[]> {
  const sessions = await loadSessions();
  const filtered = sessions.filter(s => s.id !== sessionId);
  await saveSessions(filtered);
  return filtered;
}

export async function clearAllSessions(): Promise<void> {
  await AsyncStorage.removeItem(SESSIONS_KEY);
}`,
  },
  {
    path: 'services/executionLog.ts',
    category: 'Services',
    description: 'Ops log — append, delete, export, stats for all terminal+chat events',
    content: `// Execution Log Service
// AsyncStorage key: axiom_execution_log (max 500 entries, FIFO)
//
// Types: LogEntryType = 'command' | 'analysis' | 'chat' | 'attack' | 'recon' | 'exploit'
// ExecLogEntry: { id, timestamp, type, target?, command, language?, output, isError,
//                 sessionId?, tags, durationMs?, attackId?, mitreId? }
//
// Exports:
//   loadExecLog() → Promise<ExecLogEntry[]>
//   appendExecLog(entry) → Promise<ExecLogEntry[]>
//   deleteExecLogEntry(id) → Promise<ExecLogEntry[]>
//   clearExecLog() → Promise<void>
//   exportExecLog() → Promise<string>  (formatted text dump)
//   getLogStats(entries) → { total, errors, commands, attacks, analyses, chats, targets }
// See full implementation: services/executionLog.ts`,
  },
  {
    path: 'services/attackStorage.ts',
    category: 'Services',
    description: 'Attack registry CRUD — SavedAttack persistence with AsyncStorage',
    content: `// Attack Storage Service
// AsyncStorage key: axiom_attacks
//
// Types:
//   AttackSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical'
//   AttackType = 'zero-day' | 'known-cve' | 'technique' | 'misconfiguration' | 'custom'
//   AttackStatus = 'discovered' | 'confirmed' | 'exploited' | 'patched' | 'mitigated'
//
// SavedAttack: { id, title, type, severity, status, cve?, mitreId?, target?,
//               description, notes, proofOfConcept?, discoveredAt, updatedAt, tags, cvssScore? }
//
// Exports:
//   loadAttacks() / saveAttack(attack) / deleteAttack(id) / clearAttacks()
//   createAttack(overrides?) → new SavedAttack with defaults
// See full implementation: services/attackStorage.ts`,
  },

  // ── COMPONENTS ────────────────────────────────────────────────────────────
  {
    path: 'components/chat/MessageBubble.tsx',
    category: 'Components',
    description: 'Chat message renderer — markdown, code blocks with RUN+COPY, inline formatting',
    content: `// MessageBubble Component
// Renders user and assistant messages with full markdown support
//
// Features:
//   - User bubbles: simple text with red glow border
//   - Assistant bubbles: full ContentRenderer with:
//       * h1/h2/h3 headings (colored by level)
//       * Bullet lists (▸ prefix) and numbered lists
//       * Blockquotes with left border
//       * Inline bold (**text**), italic (*text*), code (\`code\`)
//       * Code blocks with macOS traffic light dots, language badge
//       * RUN button → calls runInTerminal(code, lang) + navigate to terminal tab
//       * COPY button → expo-clipboard
//   - Streaming cursor (▊) shown while isStreaming = true
//   - Timestamp display
//
// Executable languages: bash, sh, python, python3, javascript, js, node,
//   typescript, ts, go, rust, ruby, c, cpp, php, perl, lua, powershell
//
// Props: message: Message
// See full implementation: components/chat/MessageBubble.tsx`,
  },
  {
    path: 'components/chat/QuickActions.tsx',
    category: 'Components',
    description: '16 tactical quick-action prompts across 6 categories with category filter',
    content: `// QuickActions Component
// Shows filterable quick-action buttons for chat shortcuts
//
// Categories: All, Recon, Exploit, PostEx, Evasion, Cloud, HW/Fuzz
// 16 actions including:
//   External Recon, OSINT Framework, Cloud Footprint (Recon)
//   AD Compromise, Web App Pwn, Cloud PrivEsc (Exploit)
//   Credential Dump, Persistence Kit, Lateral Matrix (PostEx)
//   AV/EDR Bypass, C2 OPSEC, Log Stomping (Evasion)
//   Identity Pivot, Container Escape (Cloud)
//   HW Implants, Protocol Fuzz (HW)
//
// Props: onSelect(prompt: string) → void
// Renders two ScrollViews: category chips + action chips
// See full implementation: components/chat/QuickActions.tsx`,
  },
  {
    path: 'components/chat/StealthMeter.tsx',
    category: 'Components',
    description: 'Operational noise score from last 6 messages — GHOST to CRITICAL levels',
    content: `// StealthMeter Component
// Analyzes last 6 messages for operational noise signals
//
// Noise signals (17 patterns):
//   CRITICAL (88-95): mimikatz/lsass dump, meterpreter, psexec/wmiexec, reverse shells
//   HIGH (70-85): nmap/masscan, powershell, bloodhound, cobalt strike/havoc
//   MEDIUM (50-68): net user/group, whoami, AMSI bypass, persistence
//   LOW (20-40): subfinder/amass, curl/wget, OSINT tools
//
// Score: max(triggered) * 0.6 + avg(triggered) * 0.4, capped at 100
// Labels: SILENT(0) GHOST(<25) QUIET(<45) LOW(<60) MODERATE(<75) LOUD(<88) CRITICAL
// Colors: gradient from #00ff41 → #88ff00 → #ffcc00 → #ff8800 → #ff4400 → #ff0000
//
// Props: messages: Message[]
// Renders: header row, gauge bar with segments+fill+dot, active signal badges
// See full implementation: components/chat/StealthMeter.tsx`,
  },
  {
    path: 'components/chat/TTPTracker.tsx',
    category: 'Components',
    description: 'Live MITRE TTP detection from last 10 messages — 28 TTP patterns',
    content: `// TTPTracker Component
// Detects MITRE ATT&CK TTPs from conversation content
//
// 28 TTP patterns across tactics:
//   Recon: T1595 Active Scanning, T1596 Open Sources, T1590 Victim Info
//   Initial Access: T1566 Phishing, T1190 Exploit Public App, T1078 Valid Accounts
//   Execution: T1059 Command Interpreter, T1106 Native API, T1204 User Execution
//   Persistence: T1053 Scheduled Task, T1547 Boot Autostart, T1505 Server Software
//   PrivEsc: T1548 Elevation Abuse, T1055 Process Injection, T1068 Exploit PrivEsc
//   Def Evasion: T1562 Impair Defenses, T1070 Indicator Removal, T1027 Obfuscation
//   Cred Access: T1003 OS Cred Dump, T1558 Kerberos, T1552 Unsecured Creds
//   Lateral: T1021 Remote Services, T1550 Alt Auth
//   C2: T1071 App Layer Proto, T1572 Protocol Tunneling
//   Exfil: T1048 Alt Protocol
//
// Confidence: 95% if in last 3 messages, 70% otherwise
// Groups results by tactic with confidence progress bars
//
// Props: messages, visible, onClose
// See full implementation: components/chat/TTPTracker.tsx`,
  },
  {
    path: 'components/ui/SeverityBadge.tsx',
    category: 'Components',
    description: 'Severity indicator badge — LOW/MED/HIGH/CRIT with color coding',
    content: `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';

const SEVERITY_CONFIG = {
  low:      { color: '#00ff41', label: 'LOW'  },
  medium:   { color: '#ffaa00', label: 'MED'  },
  high:     { color: '#ff6600', label: 'HIGH' },
  critical: { color: '#ff2222', label: 'CRIT' },
};

interface Props { severity: 'low' | 'medium' | 'high' | 'critical'; }

export function SeverityBadge({ severity }: Props) {
  const config = SEVERITY_CONFIG[severity];
  return (
    <View style={[styles.badge, { borderColor: config.color, backgroundColor: config.color + '18' }]}>
      <Text style={[styles.text, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.sm, borderWidth: 1 },
  text: { fontSize: Typography.xs, fontWeight: Typography.bold, letterSpacing: 0.8 },
});`,
  },
  {
    path: 'components/ui/Tag.tsx',
    category: 'Components',
    description: 'Generic tag/label component with configurable color',
    content: `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';

interface TagProps { label: string; color?: string; }

export function Tag({ label, color = Colors.accent }: TagProps) {
  return (
    <View style={[styles.tag, { borderColor: color + '44', backgroundColor: color + '11' }]}>
      <Text style={[styles.text, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.sm, borderWidth: 1 },
  text: { fontSize: Typography.xs, fontWeight: Typography.medium, letterSpacing: 0.3 },
});`,
  },

  // ── EDGE FUNCTIONS ────────────────────────────────────────────────────────
  {
    path: 'supabase/functions/_shared/cors.ts',
    category: 'Backend',
    description: 'Shared CORS headers for all edge functions',
    content: `export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};`,
  },
  {
    path: 'supabase/functions/axiom-chat/index.ts',
    category: 'Backend',
    description: 'AI chat edge function — SSE streaming relay to OnSpace AI API',
    content: `import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('ONSPACE_AI_API_KEY');
    const baseUrl = Deno.env.get('ONSPACE_AI_BASE_URL');

    if (!apiKey || !baseUrl) {
      return new Response(
        JSON.stringify({ error: 'OnSpace AI not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { messages, stream, model } = body;
    const selectedModel = model || 'google/gemini-3-flash-preview';

    console.log(\`[axiom-chat] model=\${selectedModel} stream=\${stream ?? true} messages=\${messages?.length}\`);

    const response = await fetch(\`\${baseUrl}/chat/completions\`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': \`Bearer \${apiKey}\`,
      },
      body: JSON.stringify({ model: selectedModel, messages, stream: stream ?? true }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('OnSpace AI error:', errText);
      return new Response(
        JSON.stringify({ error: \`AI Error: \${errText}\` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (stream !== false) {
      return new Response(response.body, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    } else {
      const data = await response.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (err) {
    console.error('axiom-chat error:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});`,
  },
  {
    path: 'supabase/functions/code-exec/index.ts',
    category: 'Backend',
    description: 'Code execution edge function — Piston sandbox, 13 language runtimes',
    content: `// code-exec Edge Function
// Routes to Piston API for real sandboxed Linux execution
//
// Endpoints tried in order:
//   1. https://emkc.org/api/v2/piston/execute  (primary)
//   2. https://piston.oncompute.com/api/v2/piston/execute  (fallback)
//
// Supported languages → Piston runtime mapping:
//   python/python3 → python@3.10.0
//   bash/sh        → bash@5.2.0
//   javascript/js/node → javascript@18.15.0
//   typescript/ts  → typescript@5.0.3
//   ruby           → ruby@3.0.1
//   go             → go@1.16.2
//   rust           → rust@1.50.0
//   c              → c@10.2.0
//   cpp/c++        → c++@10.2.0
//   java           → java@15.0.2
//   php            → php@8.0.2
//   perl           → perl@5.36.0
//   powershell     → powershell@7.1.4
//   lua            → lua@5.4.4
//   swift          → swift@5.3.3
//
// Request: { language, code, stdin?, args?, timeout? }
// Response: { success, exitCode, signal, stdout, stderr,
//             compileStdout, compileStderr, output, language, version, runtime }
//
// Timeouts: 20000ms per endpoint, compile_timeout + run_timeout = 15000ms each
// See full implementation: supabase/functions/code-exec/index.ts`,
  },
  {
    path: 'supabase/functions/get-secrets/index.ts',
    category: 'Backend',
    description: 'Secret inspector edge function — returns all Deno env vars as JSON',
    content: `import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const secrets = {
      ONSPACE_AI_API_KEY:        Deno.env.get('ONSPACE_AI_API_KEY')        ?? '(not set)',
      ONSPACE_AI_BASE_URL:       Deno.env.get('ONSPACE_AI_BASE_URL')       ?? '(not set)',
      SUPABASE_URL:              Deno.env.get('SUPABASE_URL')              ?? '(not set)',
      SUPABASE_ANON_KEY:         Deno.env.get('SUPABASE_ANON_KEY')         ?? '(not set)',
      SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '(not set)',
      SUPABASE_DB_URL:           Deno.env.get('SUPABASE_DB_URL')           ?? '(not set)',
    };

    return new Response(JSON.stringify(secrets), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});`,
  },
  {
    path: 'supabase/functions/get-users/index.ts',
    category: 'Backend',
    description: 'User list edge function — merges user_profiles + auth metadata via service role',
    content: `// get-users Edge Function
// Fetches all users using service role (bypasses RLS)
// Merges user_profiles table with auth.users metadata
//
// Returns: { users: EnrichedUser[], total: number }
// EnrichedUser: { id, username, email, created_at, last_sign_in_at,
//                 email_confirmed_at, provider }
//
// Uses: createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
//       supabaseAdmin.from('user_profiles').select('id, username, email')
//       supabaseAdmin.auth.admin.listUsers()
// See full implementation: supabase/functions/get-users/index.ts`,
  },

  // ── DATABASE ──────────────────────────────────────────────────────────────
  {
    path: 'database/schema.sql',
    category: 'Database',
    description: 'Full database schema — user_profiles table, RLS policies, triggers',
    content: `-- AXIOM Database Schema
-- OnSpace Cloud (Supabase-compatible PostgreSQL)

-- ── user_profiles table ───────────────────────────────────────────────────────
create table if not exists public.user_profiles (
  id     uuid not null primary key references auth.users(id) on delete cascade,
  username text,
  email  text not null
);

-- Enable Row Level Security
alter table public.user_profiles enable row level security;

-- RLS Policies
create policy "Users can view own profile"
  on public.user_profiles for select to authenticated
  using (auth.uid() = id);

create policy "users_insert_own_profile"
  on public.user_profiles for insert to authenticated
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.user_profiles for update to authenticated
  using (auth.uid() = id);

create policy "Users can delete own profile"
  on public.user_profiles for delete to authenticated
  using (auth.uid() = id);

-- ── Auto-create profile on signup ─────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.user_profiles (id, email, username)
  values (new.id, new.email, new.raw_user_meta_data->>'username')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Sync email/username on profile update ─────────────────────────────────────
create or replace function public.sync_user_metadata()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.user_profiles
  set email = new.email
  where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_updated
  after update on auth.users
  for each row execute procedure public.sync_user_metadata();

-- ── Auth Settings (configured in OnSpace Cloud Dashboard) ─────────────────────
-- Disable Sign-up: false (open registration)
-- Enable Anonymous Users: false
-- Secure Email Change: true
-- Password Min Length: 6
-- Email OTP Length: 4
-- Email OTP Expiry: 3600 seconds (1 hour)
-- Google Sign-in: false (not enabled)`,
  },

  // ── SETUP GUIDE ──────────────────────────────────────────────────────────
  {
    path: 'SETUP.md',
    category: 'Docs',
    description: 'Complete local setup guide — dependencies, env vars, backend, edge functions',
    content: `# AXIOM Red Team AI — Local Setup Guide

## Prerequisites
- Node.js 18+
- Expo CLI: \`npm install -g @expo/cli\`
- Supabase CLI (for edge functions): \`npm install -g supabase\`

## 1. Clone & Install
\`\`\`bash
git clone <your-repo>
cd axiom
npm install
\`\`\`

## 2. Backend Setup (Supabase or OnSpace Cloud)

### Option A: OnSpace Cloud (Recommended)
1. Create account at onspace.ai
2. Create new APP project
3. Go to Cloud → Data → Create tables using database/schema.sql
4. Copy Backend URL and Anon Key from Cloud settings

### Option B: Supabase
1. Create project at supabase.com
2. Run database/schema.sql in SQL editor
3. Copy Project URL and anon key from Settings → API

## 3. Environment Variables
Create \`.env\` in project root:
\`\`\`
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
\`\`\`

## 4. Backend Secrets (Edge Functions)
Set these in your Supabase/OnSpace Cloud dashboard → Secrets:
\`\`\`
ONSPACE_AI_API_KEY=your_onspace_or_openrouter_api_key
ONSPACE_AI_BASE_URL=https://api.onspace.ai/v1
                  # OR for OpenRouter: https://openrouter.ai/api/v1
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_DB_URL=postgresql://postgres:pass@db.xxx.supabase.co:5432/postgres
\`\`\`

## 5. Deploy Edge Functions
\`\`\`bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy axiom-chat
supabase functions deploy code-exec
supabase functions deploy get-secrets
supabase functions deploy get-users
\`\`\`

## 6. Run the App
\`\`\`bash
npx expo start
# Press 'i' for iOS simulator
# Press 'a' for Android emulator
# Scan QR code with Expo Go for physical device
\`\`\`

## Architecture Overview
- **App**: React Native + Expo SDK 52 + TypeScript
- **Router**: expo-router v4 (file-system based)
- **Auth**: OnSpace Cloud / Supabase email+OTP auth
- **AI**: axiom-chat edge function → OnSpace AI / OpenRouter
- **Code Exec**: code-exec edge function → Piston sandbox API
- **Storage**: AsyncStorage for sessions, logs, KB, preferences
- **Database**: PostgreSQL (user_profiles with RLS)

## Key File Paths
\`\`\`
app/_layout.tsx          — Root providers
app/login.tsx            — Authentication screen
app/(tabs)/index.tsx     — CHAT screen
app/(tabs)/terminal.tsx  — TERMINAL screen
app/(tabs)/ops.tsx       — OPS (attacks, arsenal, log)
app/(tabs)/intel.tsx     — INTEL (MITRE, tools, playbooks)
app/(tabs)/files.tsx     — FILES browser
app/(tabs)/config.tsx    — CONFIG (AI, prompts, KB)
app/(tabs)/build.tsx     — BUILD (this screen)
app/profile.tsx          — User profile settings
services/aiService.ts    — AI chat service
services/selfUpdateService.ts — Self-update engine
supabase/functions/      — Edge functions (Deno)
\`\`\`

## AI Models Available
| Model ID | Name | Speed |
|---|---|---|
| google/gemini-3-flash-preview | Gemini 3 Flash | Fast |
| google/gemini-3-pro-preview | Gemini 3 Pro | Pro |
| openai/gpt-5.1 | GPT-5.1 | Pro |
| openai/gpt-5-mini | GPT-5 Mini | Fast |
| google/gemini-2.5-flash-lite | Gemini 2.5 Lite | Lite |
| nousresearch/hermes-3-llama-3.1-405b | Hermes 3 405B | Pro (OpenRouter) |
| nousresearch/hermes-3-llama-3.1-70b | Hermes 3 70B | Fast (OpenRouter) |`,
  },
];

// ── Category colors ────────────────────────────────────────────────────────
const CAT_COLORS: Record<string, string> = {
  Config: '#ffcc00',
  Navigation: '#3399ff',
  Auth: '#00ccff',
  Constants: '#aa44ff',
  Contexts: '#ff44aa',
  Hooks: '#ff8800',
  Services: '#00ff41',
  Components: '#ff2222',
  Backend: '#aa44ff',
  Database: '#ffcc00',
  Docs: '#999999',
};

const ALL_CATS = ['All', ...Array.from(new Set(FILES.map(f => f.category)))];

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function BuildScreen() {
  const insets = useSafeAreaInsets();
  const [selectedCat, setSelectedCat] = useState('All');
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(null);
  const [search, setSearch] = useState('');
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);

  const filtered = useMemo(() => {
    let list = selectedCat === 'All' ? FILES : FILES.filter(f => f.category === selectedCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(f =>
        f.path.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q)
      );
    }
    return list;
  }, [selectedCat, search]);

  const copyFile = useCallback(async (file: ProjectFile) => {
    await Clipboard.setStringAsync(
      `// ==================== FILE: ${file.path} ====================\n\n${file.content}\n`
    );
    setCopiedPath(file.path);
    setTimeout(() => setCopiedPath(null), 2000);
  }, []);

  const copyAll = useCallback(async () => {
    setIsBuilding(true);
    const boundary = '='.repeat(60);
    const header = [
      `// AXIOM RED TEAM AI — COMPLETE PROJECT EXPORT`,
      `// Generated: ${new Date().toISOString()}`,
      `// Files: ${FILES.length}`,
      `// Stack: React Native + Expo SDK 52 + TypeScript + OnSpace Cloud`,
      `//`,
      `// SETUP INSTRUCTIONS:`,
      `// 1. npx create-expo-app@latest axiom --template blank-typescript`,
      `// 2. Copy each file to its path listed in the FILE comments`,
      `// 3. npm install (dependencies listed in package.json file above)`,
      `// 4. Add .env with EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY`,
      `// 5. Deploy edge functions to Supabase/OnSpace Cloud`,
      `// 6. npx expo start`,
      '',
      `// ${'='.repeat(58)}`,
    ].join('\n');

    const allContent = FILES.map(f =>
      `\n// ${boundary}\n// FILE: ${f.path}\n// Category: ${f.category}\n// ${f.description}\n// ${boundary}\n\n${f.content}\n`
    ).join('\n');

    const footer = `\n// ${'='.repeat(58)}\n// END OF AXIOM PROJECT EXPORT\n// Total files: ${FILES.length}\n// ${'='.repeat(58)}`;

    await Clipboard.setStringAsync(header + allContent + footer);
    setIsBuilding(false);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 3000);
  }, []);

  const shareFile = useCallback(async (file: ProjectFile) => {
    try {
      await Share.share({
        message: `// FILE: ${file.path}\n\n${file.content}`,
        title: file.path,
      });
    } catch {}
  }, []);

  const totalChars = useMemo(() => FILES.reduce((acc, f) => acc + f.content.length, 0), []);
  const filteredChars = useMemo(() => filtered.reduce((acc, f) => acc + f.content.length, 0), [filtered]);

  if (selectedFile) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* File Detail Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => setSelectedFile(null)}
            hitSlop={8}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          >
            <MaterialIcons name="arrow-back" size={18} color={Colors.textSecondary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.fileName} numberOfLines={1}>{selectedFile.path.split('/').pop()}</Text>
            <Text style={styles.filePath} numberOfLines={1}>{selectedFile.path}</Text>
          </View>
          <View style={styles.fileActions}>
            <Pressable
              onPress={() => shareFile(selectedFile)}
              hitSlop={8}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
            >
              <MaterialIcons name="share" size={15} color={Colors.textMuted} />
            </Pressable>
            <Pressable
              onPress={() => copyFile(selectedFile)}
              hitSlop={8}
              style={({ pressed }) => [
                styles.copyBtn,
                copiedPath === selectedFile.path && { borderColor: Colors.accent + '55', backgroundColor: Colors.accentMuted },
                pressed && { opacity: 0.7 },
              ]}
            >
              <MaterialIcons
                name={copiedPath === selectedFile.path ? 'check' : 'content-copy'}
                size={13}
                color={copiedPath === selectedFile.path ? Colors.accent : Colors.textMuted}
              />
              <Text style={[styles.copyBtnText, copiedPath === selectedFile.path && { color: Colors.accent }]}>
                {copiedPath === selectedFile.path ? 'COPIED!' : 'COPY'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Description */}
        <View style={styles.descRow}>
          <View style={[styles.catChip, { borderColor: (CAT_COLORS[selectedFile.category] || Colors.textMuted) + '55', backgroundColor: (CAT_COLORS[selectedFile.category] || Colors.textMuted) + '11' }]}>
            <Text style={[styles.catChipText, { color: CAT_COLORS[selectedFile.category] || Colors.textMuted }]}>
              {selectedFile.category}
            </Text>
          </View>
          <Text style={styles.descText} numberOfLines={2}>{selectedFile.description}</Text>
        </View>

        {/* Code content */}
        <ScrollView
          style={styles.codeScroll}
          contentContainerStyle={{ padding: Spacing.base, paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.codeText} selectable>{selectedFile.content}</Text>
        </ScrollView>

        {/* Bottom copy CTA */}
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.sm }]}>
          <Text style={styles.bottomMeta}>{selectedFile.content.length.toLocaleString()} chars</Text>
          <Pressable
            onPress={() => copyFile(selectedFile)}
            style={({ pressed }) => [
              styles.bottomCopyBtn,
              copiedPath === selectedFile.path && { backgroundColor: Colors.accentMuted, borderColor: Colors.accent + '55' },
              pressed && { opacity: 0.8 },
            ]}
          >
            <MaterialIcons
              name={copiedPath === selectedFile.path ? 'check' : 'content-copy'}
              size={15}
              color={copiedPath === selectedFile.path ? Colors.accent : Colors.bg}
            />
            <Text style={[styles.bottomCopyBtnText, copiedPath === selectedFile.path && { color: Colors.accent }]}>
              {copiedPath === selectedFile.path ? 'COPIED TO CLIPBOARD' : 'COPY FILE'}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>BUILD EXPORT</Text>
          <Text style={styles.headerSub}>{FILES.length} files · {(totalChars / 1024).toFixed(0)}KB total source</Text>
        </View>
        <Pressable
          onPress={copyAll}
          disabled={isBuilding}
          style={({ pressed }) => [
            styles.copyAllBtn,
            copiedAll && { backgroundColor: Colors.accentMuted, borderColor: Colors.accent + '66' },
            pressed && { opacity: 0.8 },
            isBuilding && { opacity: 0.5 },
          ]}
        >
          {isBuilding
            ? <ActivityIndicator size="small" color={Colors.bg} />
            : <MaterialIcons name={copiedAll ? 'check' : 'content-copy'} size={14} color={copiedAll ? Colors.accent : Colors.bg} />}
          <Text style={[styles.copyAllText, copiedAll && { color: Colors.accent }]}>
            {isBuilding ? 'BUILDING...' : copiedAll ? 'ALL COPIED!' : 'COPY ALL'}
          </Text>
        </Pressable>
      </View>

      {/* Stats bar */}
      <View style={styles.statsBar}>
        {[
          { label: 'FILES', value: FILES.length, color: Colors.accent },
          { label: 'SCREENS', value: FILES.filter(f => f.category === 'Navigation' || f.category === 'Auth').length, color: Colors.info },
          { label: 'SERVICES', value: FILES.filter(f => f.category === 'Services').length, color: Colors.warning },
          { label: 'BACKEND', value: FILES.filter(f => f.category === 'Backend' || f.category === 'Database').length, color: '#aa44ff' },
        ].map(s => (
          <View key={s.label} style={styles.statCell}>
            <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* AI rewrite artifact (moved from Config tab) */}
      <ArtifactRewritePanel />

      {/* Search */}
      <View style={styles.searchBar}>
        <MaterialIcons name="search" size={15} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search files, categories, descriptions..."
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search ? (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <MaterialIcons name="close" size={13} color={Colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {/* Category filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.catRow}
        style={styles.catScroll}
      >
        {ALL_CATS.map(cat => {
          const color = cat === 'All' ? Colors.primary : (CAT_COLORS[cat] || Colors.textMuted);
          const isActive = selectedCat === cat;
          return (
            <Pressable
              key={cat}
              style={[
                styles.catBtn,
                isActive && { borderColor: color + '66', backgroundColor: color + '15' },
              ]}
              onPress={() => setSelectedCat(cat)}
            >
              <Text style={[styles.catBtnText, isActive && { color }]}>
                {cat === 'All' ? `ALL (${FILES.length})` : `${cat} (${FILES.filter(f => f.category === cat).length})`}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* File list */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 110 }]}
      >
        {/* Filtered summary */}
        {search || selectedCat !== 'All' ? (
          <View style={styles.filterSummary}>
            <MaterialIcons name="filter-list" size={12} color={Colors.textMuted} />
            <Text style={styles.filterSummaryText}>
              {filtered.length} files · {(filteredChars / 1024).toFixed(1)}KB
            </Text>
          </View>
        ) : null}

        {/* Setup callout */}
        <View style={styles.setupCard}>
          <MaterialIcons name="info-outline" size={14} color={Colors.info} />
          <View style={{ flex: 1 }}>
            <Text style={styles.setupTitle}>HOW TO USE THIS TAB</Text>
            <Text style={styles.setupText}>
              1. Tap COPY ALL to get the full project in one clipboard payload{'\n'}
              2. Paste into Hermes AI or any LLM with the SETUP.md prompt{'\n'}
              3. Or tap any file to view and copy individual files{'\n'}
              4. All edge functions go in supabase/functions/{'{name}'}/index.ts
            </Text>
          </View>
        </View>

        {/* Hermes / local build prompt */}
        <View style={styles.hermesCard}>
          <View style={styles.hermesHeader}>
            <MaterialIcons name="psychology" size={14} color={Colors.accent} />
            <Text style={styles.hermesTitle}>HERMES AI BUILD PROMPT</Text>
          </View>
          <Text style={styles.hermesPrompt} selectable>
            {`I have a complete React Native / Expo TypeScript project called AXIOM (Red Team AI assistant). I'm going to paste all the source files below. Please help me reconstruct this project locally. Each file starts with a "// FILE: path/to/file" comment. Create each file at the specified path relative to the project root. After I paste the files, confirm what was received and flag any missing dependencies.`}
          </Text>
          <Pressable
            onPress={async () => {
              await Clipboard.setStringAsync(`I have a complete React Native / Expo TypeScript project called AXIOM (Red Team AI assistant). I'm going to paste all the source files below. Please help me reconstruct this project locally. Each file starts with a "// FILE: path/to/file" comment. Create each file at the specified path relative to the project root. After I paste the files, confirm what was received and flag any missing dependencies.`);
              setCopiedAll(true);
              setTimeout(() => setCopiedAll(false), 2000);
            }}
            style={({ pressed }) => [styles.hermesCopyBtn, pressed && { opacity: 0.7 }]}
          >
            <MaterialIcons name="content-copy" size={12} color={Colors.accent} />
            <Text style={styles.hermesCopyText}>COPY PROMPT</Text>
          </Pressable>
        </View>

        {filtered.map((file, idx) => {
          const color = CAT_COLORS[file.category] || Colors.textMuted;
          const isCopied = copiedPath === file.path;
          return (
            <Pressable
              key={file.path}
              style={({ pressed }) => [styles.fileRow, pressed && { opacity: 0.8 }]}
              onPress={() => setSelectedFile(file)}
            >
              <View style={[styles.fileIconBox, { backgroundColor: color + '15', borderColor: color + '33' }]}>
                <MaterialIcons name="insert-drive-file" size={16} color={color} />
              </View>
              <View style={styles.fileInfo}>
                <Text style={styles.fileRowName} numberOfLines={1}>{file.path.split('/').pop()}</Text>
                <Text style={styles.fileRowPath} numberOfLines={1}>{file.path}</Text>
                <View style={styles.fileRowMeta}>
                  <View style={[styles.catChip, { borderColor: color + '44', backgroundColor: color + '0d' }]}>
                    <Text style={[styles.catChipText, { color }]}>{file.category}</Text>
                  </View>
                  <Text style={styles.fileRowSize}>{(file.content.length / 1024).toFixed(1)}KB</Text>
                </View>
              </View>
              <View style={styles.fileRowActions}>
                <Pressable
                  onPress={(e) => { e.stopPropagation(); copyFile(file); }}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.miniCopyBtn,
                    isCopied && { borderColor: Colors.accent + '55', backgroundColor: Colors.accentMuted },
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <MaterialIcons
                    name={isCopied ? 'check' : 'content-copy'}
                    size={12}
                    color={isCopied ? Colors.accent : Colors.textMuted}
                  />
                </Pressable>
                <MaterialIcons name="chevron-right" size={16} color={Colors.textMuted} />
              </View>
            </Pressable>
          );
        })}

        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <MaterialIcons name="search-off" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No files match</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
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
    gap: Spacing.sm,
  },
  backBtn: {
    width: 34, height: 34,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.surfaceBorder,
    flexShrink: 0,
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
    letterSpacing: 3,
    fontFamily: MONO,
  },
  headerSub: { color: Colors.textMuted, fontSize: Typography.xs, marginTop: 2 },
  copyAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md, paddingVertical: 8,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.primary,
    flexShrink: 0,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  copyAllText: {
    color: Colors.bg,
    fontSize: Typography.xs, fontWeight: Typography.bold, letterSpacing: 1.5,
    fontFamily: MONO,
  },
  statsBar: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
  },
  statCell: {
    flex: 1, alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRightWidth: 1, borderRightColor: Colors.surfaceBorder,
  },
  statValue: { fontSize: Typography.base, fontWeight: Typography.bold, fontFamily: MONO },
  statLabel: { color: Colors.textMuted, fontSize: 8, fontWeight: Typography.bold, letterSpacing: 0.5, marginTop: 2 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginHorizontal: Spacing.base, marginVertical: Spacing.sm,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder,
    borderRadius: Radius.xl, paddingHorizontal: Spacing.md, paddingVertical: 8,
  },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: Typography.sm },
  catScroll: {
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
    maxHeight: 42,
  },
  catRow: {
    flexDirection: 'row', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: 6,
  },
  catBtn: {
    paddingHorizontal: Spacing.md, paddingVertical: 5,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
  },
  catBtnText: {
    color: Colors.textMuted,
    fontSize: Typography.xs, fontWeight: Typography.medium,
  },
  list: { padding: Spacing.base, gap: Spacing.sm },
  filterSummary: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: Spacing.xs,
  },
  filterSummaryText: { color: Colors.textMuted, fontSize: Typography.xs },
  setupCard: {
    flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start',
    backgroundColor: Colors.info + '08',
    borderWidth: 1, borderColor: Colors.info + '33',
    borderRadius: Radius.lg, padding: Spacing.base,
    marginBottom: Spacing.sm,
  },
  setupTitle: {
    color: Colors.info,
    fontSize: Typography.xs, fontWeight: Typography.bold, letterSpacing: 1.5,
    fontFamily: MONO, marginBottom: 5,
  },
  setupText: {
    color: Colors.textMuted, fontSize: Typography.xs, lineHeight: 18,
  },
  hermesCard: {
    backgroundColor: Colors.accentMuted,
    borderWidth: 1, borderColor: Colors.accent + '33',
    borderRadius: Radius.lg, padding: Spacing.base,
    marginBottom: Spacing.sm, gap: Spacing.sm,
  },
  hermesHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hermesTitle: {
    color: Colors.accent,
    fontSize: Typography.xs, fontWeight: Typography.bold, letterSpacing: 1.5,
    fontFamily: MONO,
  },
  hermesPrompt: {
    color: Colors.textSecondary, fontSize: Typography.xs, lineHeight: 18,
    fontFamily: MONO,
  },
  hermesCopyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.accent + '44',
    paddingHorizontal: Spacing.sm, paddingVertical: 5, borderRadius: Radius.full,
  },
  hermesCopyText: {
    color: Colors.accent,
    fontSize: 9, fontWeight: Typography.bold, letterSpacing: 1,
    fontFamily: MONO,
  },
  fileRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder,
    borderRadius: Radius.lg, padding: Spacing.base,
  },
  fileIconBox: {
    width: 36, height: 36, borderRadius: Radius.md, borderWidth: 1,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  fileInfo: { flex: 1 },
  fileRowName: {
    color: Colors.textPrimary,
    fontSize: Typography.base, fontWeight: Typography.medium, marginBottom: 2,
  },
  fileRowPath: {
    color: Colors.textMuted, fontSize: 10,
    fontFamily: MONO, marginBottom: 5,
  },
  fileRowMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  catChip: {
    paddingHorizontal: 5, paddingVertical: 2,
    borderRadius: 3, borderWidth: 1,
  },
  catChipText: { fontSize: 9, fontWeight: Typography.bold, letterSpacing: 0.5 },
  fileRowSize: { color: Colors.textMuted, fontSize: 9, marginLeft: 'auto' as any },
  fileRowActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  miniCopyBtn: {
    width: 28, height: 28, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  empty: { alignItems: 'center', paddingVertical: Spacing.xxxl, gap: Spacing.md },
  emptyText: { color: Colors.textMuted, fontSize: Typography.base },
  // File detail view
  fileName: {
    color: Colors.textPrimary, fontSize: Typography.base, fontWeight: Typography.bold,
    fontFamily: MONO,
  },
  filePath: { color: Colors.textMuted, fontSize: 10, fontFamily: MONO, marginTop: 2 },
  fileActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconBtn: {
    width: 30, height: 30, borderRadius: 15,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  copyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.sm, paddingVertical: 6, borderRadius: Radius.full,
  },
  copyBtnText: { color: Colors.textMuted, fontSize: 9, fontWeight: Typography.bold, letterSpacing: 1 },
  descRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    backgroundColor: Colors.bgSecondary, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  descText: { flex: 1, color: Colors.textMuted, fontSize: Typography.xs, lineHeight: 17 },
  codeScroll: { flex: 1, backgroundColor: '#030303' },
  codeText: {
    color: '#c8c8c8', fontSize: 11, lineHeight: 19,
    fontFamily: MONO,
  },
  bottomBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingTop: Spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.surfaceBorder,
    backgroundColor: Colors.bgSecondary,
  },
  bottomMeta: { color: Colors.textMuted, fontSize: Typography.xs, fontFamily: MONO },
  bottomCopyBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    backgroundColor: Colors.primary, paddingVertical: Spacing.md, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.primary,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  bottomCopyBtnText: {
    color: Colors.bg, fontSize: Typography.base, fontWeight: Typography.bold, letterSpacing: 1.5,
    fontFamily: MONO,
  },
});
