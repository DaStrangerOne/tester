/**
 * Artifact Rewrite Panel
 * ----------------------------------------------------------------
 * AI-powered "rewrite the whole app into a single copyable artifact"
 * panel. Lives in the BUILD tab (was previously in the CONFIG tab).
 *
 * Streams the rewrite via the local AXIOM /api/functions/v1/axiom-chat
 * endpoint, supports scoping by category, shows live progress, and
 * exposes a one-tap COPY ALL button.
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, ActivityIndicator, Platform, StyleSheet,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';

const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
const ACCENT = '#ff44ff';

interface ArtifactFile { path: string; label: string; category: string }

const ARTIFACT_FILES: ArtifactFile[] = [
  { path: 'app/_layout.tsx',                        label: 'Root Layout',       category: 'Navigation' },
  { path: 'app/(tabs)/_layout.tsx',                 label: 'Tab Layout',        category: 'Navigation' },
  { path: 'app/(tabs)/index.tsx',                   label: 'Chat Screen',       category: 'Screens' },
  { path: 'app/(tabs)/terminal.tsx',                label: 'Terminal Screen',   category: 'Screens' },
  { path: 'app/(tabs)/ops.tsx',                     label: 'Ops Screen',        category: 'Screens' },
  { path: 'app/(tabs)/intel.tsx',                   label: 'Intel Screen',      category: 'Screens' },
  { path: 'app/(tabs)/files.tsx',                   label: 'Files Screen',      category: 'Screens' },
  { path: 'app/(tabs)/agents.tsx',                  label: 'Agents Screen',     category: 'Screens' },
  { path: 'app/(tabs)/config.tsx',                  label: 'Config Screen',     category: 'Screens' },
  { path: 'app/(tabs)/build.tsx',                   label: 'Build Screen',      category: 'Screens' },
  { path: 'constants/theme.ts',                     label: 'Theme',             category: 'Constants' },
  { path: 'constants/mitre.ts',                     label: 'MITRE ATT&CK',      category: 'Constants' },
  { path: 'constants/prompts.ts',                   label: 'Prompt Templates',  category: 'Constants' },
  { path: 'services/aiService.ts',                  label: 'AI Service',        category: 'Services' },
  { path: 'services/attackStorage.ts',              label: 'Attack Storage',    category: 'Services' },
  { path: 'services/executionLog.ts',               label: 'Execution Log',     category: 'Services' },
  { path: 'services/sessionStorage.ts',             label: 'Session Storage',   category: 'Services' },
  { path: 'services/selfUpdateService.ts',          label: 'Self-Update',       category: 'Services' },
  { path: 'services/autoExec.ts',                   label: 'Auto-Exec',         category: 'Services' },
  { path: 'services/godUser.ts',                    label: 'God User',          category: 'Services' },
  { path: 'hooks/useChat.ts',                       label: 'Chat Hook',         category: 'Hooks' },
  { path: 'hooks/useChatContext.ts',                label: 'Chat Context Hook', category: 'Hooks' },
  { path: 'contexts/ChatContext.tsx',               label: 'Chat Context',      category: 'Contexts' },
  { path: 'components/chat/MessageBubble.tsx',      label: 'Message Bubble',    category: 'Components' },
  { path: 'components/chat/QuickActions.tsx',       label: 'Quick Actions',     category: 'Components' },
  { path: 'components/chat/StealthMeter.tsx',       label: 'Stealth Meter',     category: 'Components' },
  { path: 'components/chat/TTPTracker.tsx',         label: 'TTP Tracker',       category: 'Components' },
  { path: 'backend/server.py',                      label: 'FastAPI Runtime',   category: 'Backend' },
  { path: 'backend/install_tools.sh',               label: 'Tool Installer',    category: 'Backend' },
];

const ARTIFACT_CATS = ['all', 'Navigation', 'Screens', 'Constants', 'Services', 'Hooks', 'Contexts', 'Components', 'Backend'];

export function ArtifactRewritePanel() {
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState<string>('all');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [progress, setProgress] = useState('');

  const filtered = useMemo(
    () => (cat === 'all' ? ARTIFACT_FILES : ARTIFACT_FILES.filter(f => f.category === cat)),
    [cat]
  );

  const generate = useCallback(async () => {
    setLoading(true);
    setContent('');
    setProgress('Compiling file manifest...');

    try {
      const fileList = filtered.map(f => `- ${f.path} (${f.label})`).join('\n');
      setProgress('Requesting AI rewrite...');

      const systemMsg = `You are AXIOM, an expert React Native / Expo + FastAPI developer.
Produce a complete, self-contained ARTIFACT of the app.
Rules:
- Output ONLY raw code — no markdown fences, no explanations.
- Each file starts with: // ==================== FILE: path/to/file.tsx ====================
- Preserve all original logic, styles and functionality.
- Include all imports at the top of each file.
- After the last file add: // ==================== END OF ARTIFACT ====================`;

      const userMsg = `Generate a complete artifact for the AXIOM Red Team AI app.

Files to include (${filtered.length}):
${fileList}

Architecture:
- React Native + Expo SDK 52 + TypeScript (web target as static export)
- expo-router (tabs)
- FastAPI backend at /app/backend with /api/exec, /api/chat, /api/functions/v1/*, /api/god
- AXIOM runtime URL = REACT_APP_BACKEND_URL (local container shell)
- Real CLI tools: nmap, sqlmap, nikto, whatweb, gobuster, hydra, hashcat, john, dig, whois, curl, etc.

Produce one single-file artifact containing the complete app. Include each file block prefixed by:
// ==================== FILE: path/to/file.tsx ====================

Do not include markdown fences, explanations, or extra text. After the final file add: // ==================== END OF ARTIFACT ====================.`;

      const base = (process.env.EXPO_PUBLIC_AXIOM_RUNTIME_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '');
      const res = await fetch(`${base}/api/functions/v1/axiom-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'system', content: systemMsg }, { role: 'user', content: userMsg }], stream: true }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setProgress('Streaming...');
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
                  setProgress(`Streaming... ${fileCount}/${filtered.length} files`);
                  setContent(fullContent);
                }
              } catch {}
            }
          }
        } finally {
          reader.releaseLock();
        }
      }
      setProgress('Artifact complete');
      setTimeout(() => setProgress(''), 2000);
    } catch (err: any) {
      setProgress(`Error: ${err?.message}`);
      setContent(`// GENERATION FAILED\n// Error: ${err?.message}`);
    } finally {
      setLoading(false);
    }
  }, [filtered]);

  const copyArtifact = useCallback(async () => {
    if (!content) return;
    try {
      const Clipboard = await import('expo-clipboard');
      await Clipboard.setStringAsync(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  }, [content]);

  // Collapsed header
  if (!open) {
    return (
      <Pressable
        testID="artifact-rewrite-panel-open"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.collapsed, pressed && { opacity: 0.7 }]}
      >
        <View style={styles.collapsedIcon}>
          <MaterialIcons name="auto-awesome" size={16} color={ACCENT} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.collapsedTitle}>AI REWRITE ARTIFACT</Text>
          <Text style={styles.collapsedSubtitle}>
            Have AXIOM compose every file into a single copyable artifact via the LLM
          </Text>
        </View>
        <MaterialIcons name="expand-more" size={18} color={ACCENT} />
      </Pressable>
    );
  }

  return (
    <View style={styles.panel}>
      <Pressable
        onPress={() => setOpen(false)}
        style={({ pressed }) => [styles.panelHeader, pressed && { opacity: 0.7 }]}
      >
        <MaterialIcons name="auto-awesome" size={14} color={ACCENT} />
        <Text style={styles.panelHeaderText}>AI REWRITE ARTIFACT</Text>
        <View style={{ flex: 1 }} />
        <MaterialIcons name="expand-less" size={18} color={ACCENT} />
      </Pressable>

      <View style={styles.note}>
        <MaterialIcons name="info-outline" size={12} color={ACCENT} />
        <Text style={styles.noteText}>
          AI rewrites the entire app into a single standalone artifact file. Scope by category to focus the rewrite.
        </Text>
      </View>

      <Text style={styles.label}>SCOPE</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {ARTIFACT_CATS.map(c => {
          const active = cat === c;
          const count = c === 'all' ? ARTIFACT_FILES.length : ARTIFACT_FILES.filter(f => f.category === c).length;
          return (
            <Pressable
              key={c}
              onPress={() => setCat(c)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {c === 'all' ? `ALL (${count})` : `${c} (${count})`}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={[styles.label, { marginTop: Spacing.sm }]}>
        FILES TO INCLUDE ({filtered.length})
      </Text>
      <View style={styles.fileList}>
        {filtered.map((f, i) => (
          <View
            key={f.path}
            style={[styles.fileRow, i < filtered.length - 1 && styles.fileRowDivider]}
          >
            <Text style={styles.fileCat}>{f.category}</Text>
            <Text style={styles.filePath} numberOfLines={1}>{f.path}</Text>
          </View>
        ))}
      </View>

      <Pressable
        testID="generate-artifact"
        onPress={generate}
        disabled={loading}
        style={({ pressed }) => [styles.generateBtn, pressed && { opacity: 0.8 }, loading && styles.generateBtnDisabled]}
      >
        {loading
          ? <ActivityIndicator size="small" color={Colors.textMuted} />
          : <MaterialIcons name="auto-awesome" size={16} color={Colors.bg} />}
        <Text style={[styles.generateText, loading && { color: Colors.textMuted }]}>
          {loading ? (progress || 'GENERATING...') : 'GENERATE ARTIFACT'}
        </Text>
      </Pressable>

      {loading && progress ? (
        <View style={styles.progressRow}>
          <ActivityIndicator size="small" color={ACCENT} />
          <Text style={styles.progressText}>{progress}</Text>
        </View>
      ) : null}

      {content ? (
        <>
          <View style={styles.readyRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
              <MaterialIcons name="check-circle" size={14} color={ACCENT} />
              <Text style={styles.readyText}>
                {(content.match(/== FILE:/g) || []).length} files · {(content.length / 1024).toFixed(1)}KB
              </Text>
            </View>
            <Pressable
              onPress={copyArtifact}
              hitSlop={8}
              style={({ pressed }) => [styles.copyPill, copied && styles.copyPillActive, pressed && { opacity: 0.7 }]}
            >
              <MaterialIcons name={copied ? 'check' : 'content-copy'} size={13} color={copied ? ACCENT : Colors.textMuted} />
              <Text style={[styles.copyPillText, copied && { color: ACCENT }]}>
                {copied ? 'COPIED!' : 'COPY ALL'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.codeBox}>
            <ScrollView showsVerticalScrollIndicator nestedScrollEnabled style={{ maxHeight: 420 }}>
              <Text style={styles.codeText} selectable>{content}</Text>
              <View style={{ height: 16 }} />
            </ScrollView>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  collapsed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    margin: Spacing.base,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: ACCENT + '33',
    backgroundColor: ACCENT + '0a',
  },
  collapsedIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: ACCENT + '1a',
    alignItems: 'center', justifyContent: 'center',
  },
  collapsedTitle: {
    color: ACCENT,
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    letterSpacing: 1.5,
  },
  collapsedSubtitle: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  panel: {
    margin: Spacing.base,
    padding: Spacing.md,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: ACCENT + '33',
    backgroundColor: Colors.surface,
    gap: Spacing.sm,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  panelHeaderText: {
    color: ACCENT,
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    letterSpacing: 2,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    padding: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: ACCENT + '22',
    backgroundColor: ACCENT + '08',
  },
  noteText: { flex: 1, color: ACCENT + 'cc', fontSize: 11, lineHeight: 16 },
  label: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    letterSpacing: 2,
  },
  chipRow: { flexDirection: 'row', gap: Spacing.sm, paddingBottom: Spacing.sm },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
  },
  chipActive: { borderColor: ACCENT + '55', backgroundColor: ACCENT + '11' },
  chipText: { color: Colors.textMuted, fontSize: Typography.xs, fontWeight: Typography.medium },
  chipTextActive: { color: ACCENT },
  fileList: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surfaceElevated,
    overflow: 'hidden',
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  fileRowDivider: { borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  fileCat: {
    width: 90,
    color: ACCENT,
    fontSize: 10,
    fontFamily: MONO,
    fontWeight: Typography.bold,
  },
  filePath: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 10,
    fontFamily: MONO,
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ACCENT,
    paddingVertical: Spacing.md + 2,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: ACCENT + '88',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  generateBtnDisabled: {
    backgroundColor: Colors.surfaceElevated,
    borderColor: Colors.surfaceBorder,
    shadowOpacity: 0,
  },
  generateText: {
    color: Colors.bg,
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    letterSpacing: 1.5,
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md },
  progressText: { color: ACCENT, fontSize: Typography.xs, fontFamily: MONO },
  readyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  readyText: {
    color: ACCENT,
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    letterSpacing: 1.5,
  },
  copyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  copyPillActive: { backgroundColor: ACCENT + '22', borderColor: ACCENT + '55' },
  copyPillText: { color: Colors.textMuted, fontSize: Typography.xs, fontWeight: Typography.bold, letterSpacing: 1 },
  codeBox: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: ACCENT + '22',
    backgroundColor: '#0a0008',
    padding: Spacing.sm,
    maxHeight: 480,
  },
  codeText: {
    color: '#ff88ff',
    fontSize: 10,
    lineHeight: 19,
    fontFamily: MONO,
  },
});
