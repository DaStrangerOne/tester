import React, { useRef, useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useChatContext } from '@/hooks/useChatContext';
import { useRouter } from 'expo-router';
import { useAuth } from '@/template';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { QuickActions } from '@/components/chat/QuickActions';
import { StealthMeter } from '@/components/chat/StealthMeter';
import { TTPTracker } from '@/components/chat/TTPTracker';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';
import { Message, ChatSession } from '@/services/aiService';
import { getCustomAIProvider, setCustomAIProvider, CustomAIProvider } from '@/services/selfUpdateService';

export default function ChatScreen() {
  const {
    messages,
    isLoading,
    inputText,
    setInputText,
    sendUserMessage,
    newSession,
    injectPrompt,
    sessions,
    currentSessionId,
    restoreSession,
    deleteSession,
    sessionTitle,
    autoExec,
    setAutoExec,
  } = useChatContext();
  const flatListRef = useRef<FlatList>(null);
  // Track whether the user is currently parked at the bottom of the chat.
  // We only auto-scroll on content growth when this is true, so scrolling
  // up to read older messages no longer snaps the view back down.
  const stickToBottomRef = useRef(true);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [showHistory, setShowHistory] = useState(false);
  const [showTTP, setShowTTP] = useState(false);

  // ── Chat-tab AI selector: pick between Emergent default and the saved Custom provider ──
  const [customProvider, setCustomProvider] = React.useState<CustomAIProvider | null>(null);
  const [aiPickerOpen, setAiPickerOpen] = useState(false);
  React.useEffect(() => {
    getCustomAIProvider().then(setCustomProvider);
  }, []);
  // Re-read whenever picker closes so changes from Config tab are reflected
  React.useEffect(() => {
    if (!aiPickerOpen) getCustomAIProvider().then(setCustomProvider);
  }, [aiPickerOpen]);

  const setCustomEnabled = React.useCallback(async (enabled: boolean) => {
    if (!customProvider) return;
    if (enabled && (!customProvider.baseUrl || !customProvider.apiKey)) {
      // Custom not configured — bounce to Config tab
      router.push('/config');
      return;
    }
    const updated = { ...customProvider, enabled };
    setCustomProvider(updated);
    await setCustomAIProvider(updated);
  }, [customProvider, router]);

  const activeAiLabel = customProvider?.enabled && customProvider.baseUrl && customProvider.apiKey
    ? (customProvider.model || customProvider.label || 'Custom')
    : 'Emergent · Claude';
  const activeAiColor = customProvider?.enabled ? '#ff8800' : '#00d4ff';

  const handleSend = useCallback(() => {
    if (inputText.trim()) {
      sendUserMessage(inputText);
      // User just sent — they want to see their own message land.
      stickToBottomRef.current = true;
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [inputText, sendUserMessage]);

  // Detect whether the user is currently near the bottom of the chat. If
  // they scroll up to read history, suspend auto-stick; resume the moment
  // they scroll back within 80px of the end.
  const handleScroll = useCallback((e: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom =
      contentSize.height - (contentOffset.y + layoutMeasurement.height);
    stickToBottomRef.current = distanceFromBottom < 80;
  }, []);

  const handleQuickAction = useCallback((prompt: string) => {
    injectPrompt(prompt);
  }, [injectPrompt]);

  const handleRestoreSession = useCallback((s: ChatSession) => {
    restoreSession(s);
    setShowHistory(false);
  }, [restoreSession]);

  const renderMessage = useCallback(({ item }: { item: Message }) => (
    <MessageBubble message={item} />
  ), []);

  const keyExtractor = useCallback((item: Message) => item.id, []);

  const formatDate = (d: Date) => {
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  };

  const hasMessages = messages.length > 1;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.statusDot} />
          <Text style={styles.headerTitle}>AXIOM</Text>
          <View style={styles.versionBadge}>
            <Text style={styles.versionText}>v2.5</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          {/* AI selector chip — pick between Emergent default and saved Custom provider */}
          <Pressable
            style={({ pressed }) => [
              styles.autoExecBtn,
              {
                borderColor: activeAiColor + '66',
                backgroundColor: activeAiColor + '14',
              },
              pressed && { opacity: 0.6 },
            ]}
            onPress={() => setAiPickerOpen(true)}
            hitSlop={6}
            testID="ai-selector-chip"
          >
            <MaterialIcons
              name={customProvider?.enabled ? 'memory' : 'auto-awesome'}
              size={14}
              color={activeAiColor}
            />
            <Text
              style={[styles.autoExecText, { color: activeAiColor, maxWidth: 110 }]}
              numberOfLines={1}
            >
              {activeAiLabel}
            </Text>
            <MaterialIcons name="expand-more" size={12} color={activeAiColor} />
          </Pressable>
          {/* AUTO-EXEC toggle: when ON, AI's code blocks run in the container shell and results feed back */}
          <Pressable
            style={({ pressed }) => [
              styles.autoExecBtn,
              autoExec && styles.autoExecBtnOn,
              pressed && { opacity: 0.6 },
            ]}
            onPress={() => setAutoExec(!autoExec)}
            hitSlop={6}
            testID="auto-exec-toggle"
          >
            <MaterialIcons
              name={autoExec ? 'flash-on' : 'flash-off'}
              size={14}
              color={autoExec ? '#00ff41' : Colors.textMuted}
            />
            <Text style={[styles.autoExecText, autoExec && { color: '#00ff41' }]}>
              AUTO-EXEC
            </Text>
          </Pressable>
          {/* Profile button */}
          <Pressable
            style={({ pressed }) => [styles.avatarBtn, pressed && { opacity: 0.6 }]}
            onPress={() => router.push('/profile')}
            hitSlop={8}
          >
            <Text style={styles.avatarBtnText}>
              {(user?.username || user?.email || '?')[0].toUpperCase()}
            </Text>
          </Pressable>
          {/* TTP toggle */}
          <Pressable
            style={({ pressed }) => [
              styles.iconBtn,
              showTTP && { backgroundColor: Colors.accentMuted, borderColor: Colors.accent + '44' },
              pressed && { opacity: 0.6 },
            ]}
            onPress={() => setShowTTP(v => !v)}
            hitSlop={8}
          >
            <MaterialIcons name="account-tree" size={18} color={showTTP ? Colors.accent : Colors.textSecondary} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
            onPress={() => setShowHistory(true)}
            hitSlop={8}
          >
            <MaterialIcons name="history" size={18} color={Colors.textSecondary} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.newSessionBtn, pressed && { opacity: 0.6 }]}
            onPress={newSession}
            hitSlop={8}
          >
            <MaterialIcons name="add" size={18} color={Colors.textSecondary} />
            <Text style={styles.newSessionText}>New</Text>
          </Pressable>
        </View>
      </View>

      {/* Stealth Meter — always visible when there are messages */}
      {hasMessages ? (
        <StealthMeter messages={messages} />
      ) : null}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={64}
          onContentSizeChange={() => {
            if (stickToBottomRef.current) {
              flatListRef.current?.scrollToEnd({ animated: true });
            }
          }}
          ListHeaderComponent={
            messages.length <= 1 ? (
              <View style={styles.welcomeArea}>
                <Text style={styles.welcomeTitle}>AXIOM</Text>
                <Text style={styles.welcomeSub}>RED TEAM AI · AUTHORIZED RESEARCH</Text>
                <View style={styles.featurePills}>
                  {['MITRE ATT&CK', 'CODE EXEC', 'TTP TRACKER', 'OPSEC ADVISOR'].map(f => (
                    <View key={f} style={styles.featurePill}>
                      <Text style={styles.featurePillText}>{f}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null
          }
        />

        {/* TTP Tracker panel */}
        {showTTP ? (
          <TTPTracker
            messages={messages}
            visible={showTTP}
            onClose={() => setShowTTP(false)}
          />
        ) : null}

        {/* Quick Actions */}
        {messages.length <= 2 ? (
          <QuickActions onSelect={handleQuickAction} />
        ) : null}

        {/* Input Area */}
        <View style={[styles.inputArea, { paddingBottom: insets.bottom > 0 ? insets.bottom : Spacing.base }]}>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Enter tactical query..."
              placeholderTextColor={Colors.textMuted}
              multiline
              maxLength={4000}
              onSubmitEditing={handleSend}
              blurOnSubmit={false}
            />
            <Pressable
              style={({ pressed }) => [
                styles.sendBtn,
                (!inputText.trim() || isLoading) && styles.sendBtnDisabled,
                pressed && styles.sendBtnPressed,
              ]}
              onPress={handleSend}
              disabled={!inputText.trim() || isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={Colors.bg} />
              ) : (
                <MaterialIcons name="send" size={18} color={Colors.bg} />
              )}
            </Pressable>
          </View>
          <Text style={styles.disclaimer}>Authorized security research only · All sessions logged</Text>
        </View>
      </KeyboardAvoidingView>

      {/* Session History Modal */}
      <Modal
        visible={showHistory}
        transparent
        animationType="slide"
        onRequestClose={() => setShowHistory(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>SESSION HISTORY</Text>
              <Pressable onPress={() => setShowHistory(false)} hitSlop={8}>
                <MaterialIcons name="close" size={22} color={Colors.textMuted} />
              </Pressable>
            </View>

            {sessions.length === 0 ? (
              <View style={styles.emptyHistory}>
                <MaterialIcons name="history" size={36} color={Colors.textMuted} />
                <Text style={styles.emptyHistoryText}>No saved sessions yet</Text>
                <Text style={styles.emptyHistorySub}>Sessions are auto-saved as you chat</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={styles.historyList}>
                {sessions.map(s => (
                  <View key={s.id} style={[styles.sessionRow, s.id === currentSessionId && styles.sessionRowActive]}>
                    <Pressable
                      style={({ pressed }) => [styles.sessionInfo, pressed && { opacity: 0.75 }]}
                      onPress={() => handleRestoreSession(s)}
                    >
                      <View style={styles.sessionTitleRow}>
                        {s.id === currentSessionId ? (
                          <View style={styles.activeIndicator} />
                        ) : null}
                        <Text style={[styles.sessionTitle, s.id === currentSessionId && { color: Colors.primary }]} numberOfLines={1}>
                          {s.title}
                        </Text>
                      </View>
                      <View style={styles.sessionMeta}>
                        <MaterialIcons name="chat-bubble-outline" size={11} color={Colors.textMuted} />
                        <Text style={styles.sessionMetaText}>
                          {s.messages.filter(m => m.role !== 'system').length} messages
                        </Text>
                        <Text style={styles.sessionDot}>·</Text>
                        <Text style={styles.sessionMetaText}>{formatDate(new Date(s.createdAt))}</Text>
                      </View>
                    </Pressable>
                    <Pressable
                      onPress={() => deleteSession(s.id)}
                      hitSlop={8}
                      style={styles.deleteBtn}
                    >
                      <MaterialIcons name="delete-outline" size={18} color={Colors.textMuted} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}

            <Pressable
              style={({ pressed }) => [styles.newSessionModalBtn, pressed && { opacity: 0.8 }]}
              onPress={() => { newSession(); setShowHistory(false); }}
            >
              <MaterialIcons name="add" size={18} color={Colors.bg} />
              <Text style={styles.newSessionModalText}>NEW SESSION</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── AI provider picker ─────────────────────────────────────────── */}
      <Modal
        visible={aiPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAiPickerOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' }}
          onPress={() => setAiPickerOpen(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={{
              backgroundColor: Colors.surfaceElevated,
              borderTopWidth: 1,
              borderTopColor: Colors.surfaceBorder,
              paddingHorizontal: Spacing.lg,
              paddingTop: Spacing.lg,
              paddingBottom: Math.max(insets.bottom, Spacing.lg),
              gap: Spacing.md,
              borderTopLeftRadius: Radius.xl,
              borderTopRightRadius: Radius.xl,
            }}
          >
            <View style={{ alignItems: 'center', marginBottom: Spacing.xs }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.surfaceBorder }} />
            </View>
            <Text
              style={{
                color: Colors.textMuted, fontSize: Typography.xs,
                fontWeight: Typography.bold, letterSpacing: 1.5,
                marginBottom: Spacing.xs,
              }}
            >
              CHOOSE AI ENGINE FOR CHAT
            </Text>

            {/* Emergent default option */}
            <Pressable
              testID="ai-option-emergent"
              onPress={() => { setCustomEnabled(false); setAiPickerOpen(false); }}
              style={({ pressed }) => [{
                flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
                padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1,
                borderColor: !customProvider?.enabled ? '#00d4ff88' : Colors.surfaceBorder,
                backgroundColor: !customProvider?.enabled ? '#00d4ff14' : Colors.surface,
                opacity: pressed ? 0.7 : 1,
              }]}
            >
              <MaterialIcons
                name="auto-awesome"
                size={20}
                color={!customProvider?.enabled ? '#00d4ff' : Colors.textMuted}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ color: Colors.textPrimary, fontSize: Typography.base, fontWeight: Typography.bold, letterSpacing: 0.5 }}>
                  Emergent · Claude Sonnet 4.5
                </Text>
                <Text style={{ color: Colors.textMuted, fontSize: 11, marginTop: 2 }}>
                  Default OnSpace/Emergent universal key
                </Text>
              </View>
              {!customProvider?.enabled && (
                <MaterialIcons name="check-circle" size={20} color="#00d4ff" />
              )}
            </Pressable>

            {/* Custom provider option */}
            {customProvider?.saved && customProvider.baseUrl && customProvider.apiKey ? (
              <Pressable
                testID="ai-option-custom"
                onPress={() => { setCustomEnabled(true); setAiPickerOpen(false); }}
                style={({ pressed }) => [{
                  flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
                  padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1,
                  borderColor: customProvider?.enabled ? '#ff880088' : Colors.surfaceBorder,
                  backgroundColor: customProvider?.enabled ? '#ff880014' : Colors.surface,
                  opacity: pressed ? 0.7 : 1,
                }]}
              >
                <MaterialIcons
                  name="memory"
                  size={20}
                  color={customProvider?.enabled ? '#ff8800' : Colors.textMuted}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: Colors.textPrimary, fontSize: Typography.base, fontWeight: Typography.bold, letterSpacing: 0.5 }}>
                    {customProvider.label || 'Custom Provider'}
                  </Text>
                  <Text
                    style={{
                      color: Colors.textMuted, fontSize: 11, marginTop: 2,
                      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                    }}
                    numberOfLines={1}
                  >
                    {(customProvider.model || 'no model') + ' · ' + customProvider.baseUrl.replace(/^https?:\/\//, '')}
                  </Text>
                </View>
                {customProvider?.enabled && (
                  <MaterialIcons name="check-circle" size={20} color="#ff8800" />
                )}
              </Pressable>
            ) : (
              <Pressable
                testID="ai-option-configure"
                onPress={() => { setAiPickerOpen(false); router.push('/config'); }}
                style={({ pressed }) => [{
                  flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
                  padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1,
                  borderColor: Colors.surfaceBorder, backgroundColor: Colors.surface,
                  borderStyle: 'dashed',
                  opacity: pressed ? 0.7 : 1,
                }]}
              >
                <MaterialIcons name="add-circle-outline" size={20} color={Colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: Colors.textPrimary, fontSize: Typography.base, fontWeight: Typography.bold, letterSpacing: 0.5 }}>
                    Configure Custom AI
                  </Text>
                  <Text style={{ color: Colors.textMuted, fontSize: 11, marginTop: 2 }}>
                    Add your own OpenAI-compatible endpoint
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={Colors.textMuted} />
              </Pressable>
            )}

            {/* Manage button (always present once saved) */}
            {customProvider?.saved && (
              <Pressable
                onPress={() => { setAiPickerOpen(false); router.push('/config'); }}
                style={({ pressed }) => [{
                  alignSelf: 'center',
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
                  opacity: pressed ? 0.6 : 1,
                }]}
              >
                <MaterialIcons name="settings" size={13} color={Colors.textMuted} />
                <Text style={{ color: Colors.textMuted, fontSize: 11, fontWeight: Typography.bold, letterSpacing: 1 }}>
                  MANAGE CUSTOM PROVIDER
                </Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    backgroundColor: Colors.bg,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.accent,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
    letterSpacing: 3,
  },
  versionBadge: {
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  versionText: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    fontWeight: Typography.medium,
  },
  avatarBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#00ccff18',
    borderWidth: 1,
    borderColor: '#00ccff44',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarBtnText: {
    color: '#00ccff',
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
  },
  iconBtn: {
    width: 34,
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  newSessionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  newSessionText: {
    color: Colors.textSecondary,
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
  },
  listContent: {
    paddingTop: Spacing.base,
    paddingBottom: Spacing.base,
  },
  welcomeArea: {
    alignItems: 'center',
    paddingVertical: Spacing.xxxl,
    paddingHorizontal: Spacing.xxl,
    gap: Spacing.md,
  },
  welcomeTitle: {
    color: Colors.primary,
    fontSize: Typography.hero,
    fontWeight: Typography.heavy,
    letterSpacing: 6,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
  },
  welcomeSub: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  featurePills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  featurePill: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  featurePillText: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '700' as any,
    letterSpacing: 1,
  },
  inputArea: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    backgroundColor: Colors.bg,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    color: Colors.textPrimary,
    fontSize: Typography.base,
    maxHeight: 120,
    lineHeight: 22,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  sendBtnDisabled: {
    backgroundColor: Colors.surfaceElevated,
    shadowOpacity: 0,
    elevation: 0,
  },
  sendBtnPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  disclaimer: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    textAlign: 'center',
    marginTop: Spacing.xs,
    letterSpacing: 0.5,
  },
  // History Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.bgSecondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.base,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.surfaceBorder,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.base,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.base,
  },
  modalTitle: {
    color: Colors.textPrimary,
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    letterSpacing: 2,
  },
  emptyHistory: {
    alignItems: 'center',
    paddingVertical: Spacing.xxxl,
    gap: Spacing.md,
  },
  emptyHistoryText: {
    color: Colors.textSecondary,
    fontSize: Typography.base,
    fontWeight: Typography.medium,
  },
  emptyHistorySub: {
    color: Colors.textMuted,
    fontSize: Typography.sm,
  },
  historyList: {
    maxHeight: 380,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  sessionRowActive: {
    backgroundColor: Colors.primaryMuted,
    marginHorizontal: -Spacing.base,
    paddingHorizontal: Spacing.base,
    borderRadius: Radius.md,
    borderBottomWidth: 0,
    marginBottom: 1,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: 4,
  },
  activeIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
    flexShrink: 0,
  },
  sessionTitle: {
    color: Colors.textPrimary,
    fontSize: Typography.base,
    fontWeight: Typography.medium,
    flex: 1,
  },
  sessionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  sessionMetaText: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
  },
  sessionDot: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
  },
  deleteBtn: {
    padding: Spacing.sm,
  },
  newSessionModalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: Radius.xl,
    marginTop: Spacing.base,
  },
  newSessionModalText: {
    color: Colors.bg,
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    letterSpacing: 1.5,
  },
  autoExecBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surfaceElevated,
  },
  autoExecBtnOn: {
    borderColor: '#00ff4166',
    backgroundColor: '#00ff4115',
  },
  autoExecText: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '700' as any,
    letterSpacing: 1,
  },
});
