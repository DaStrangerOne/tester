/**
 * PROFILE — Operator Account Management
 * View account info, update username, change password, advanced settings
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, ScrollView,
  ActivityIndicator, Switch, Modal, Platform, Animated, Easing,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth, useAlert, getSupabaseClient } from '@/template';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import { clearAllSessions } from '@/services/sessionStorage';
import { clearExecLog } from '@/services/executionLog';

const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

// ── Advanced settings keys ────────────────────────────────────────────────────
const PREFS_KEY = 'axiom_user_prefs';

interface UserPrefs {
  defaultLang: string;
  autoScroll: boolean;
  showQuickActions: boolean;
  opsecMode: boolean;
  verboseOutput: boolean;
  streamingEnabled: boolean;
  autoLearn: boolean;
  clearHistoryOnLogout: boolean;
  terminalFontSize: number;
  maxSessions: number;
  defaultModel: string;
  showStealthMeter: boolean;
  showTTPTracker: boolean;
  compactMode: boolean;
  soundFeedback: boolean;
}

const DEFAULT_PREFS: UserPrefs = {
  defaultLang: 'bash',
  autoScroll: true,
  showQuickActions: true,
  opsecMode: false,
  verboseOutput: true,
  streamingEnabled: true,
  autoLearn: true,
  clearHistoryOnLogout: false,
  terminalFontSize: 12,
  maxSessions: 50,
  defaultModel: 'google/gemini-3-flash-preview',
  showStealthMeter: true,
  showTTPTracker: true,
  compactMode: false,
  soundFeedback: false,
};

const TERMINAL_LANGS = ['bash','python','javascript','typescript','go','rust','ruby','c','cpp','php','perl','lua','powershell'];
const FONT_SIZES = [10, 11, 12, 13, 14, 15, 16];

type ProfileSection = 'account' | 'security' | 'chat' | 'terminal' | 'advanced' | 'danger';

async function loadPrefs(): Promise<UserPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch { return DEFAULT_PREFS; }
}

async function savePrefs(prefs: UserPrefs): Promise<void> {
  try { await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {}
}

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, logout, operationLoading } = useAuth();
  const { showAlert } = useAlert();

  const [activeSection, setActiveSection] = useState<ProfileSection>('account');
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  // Account fields
  const [username, setUsername] = useState(user?.username || '');
  const [usernameLoading, setUsernameLoading] = useState(false);

  // Password fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Danger zone
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showClearDataConfirm, setShowClearDataConfirm] = useState(false);
  const [clearDataLoading, setClearDataLoading] = useState(false);

  // Blinking cursor
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
    loadPrefs().then(p => {
      setPrefs(p);
      setPrefsLoaded(true);
    });
  }, []);

  const updatePref = useCallback(async <K extends keyof UserPrefs>(key: K, value: UserPrefs[K]) => {
    setPrefs(prev => {
      const updated = { ...prev, [key]: value };
      savePrefs(updated);
      return updated;
    });
  }, []);

  // ── Update username ────────────────────────────────────────────────────────
  const handleUpdateUsername = useCallback(async () => {
    if (!username.trim()) {
      showAlert('Invalid Username', 'Username cannot be empty.');
      return;
    }
    if (!user?.id) return;
    setUsernameLoading(true);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('user_profiles')
        .update({ username: username.trim() })
        .eq('id', user.id);
      if (error) {
        showAlert('Update Failed', error.message);
      } else {
        showAlert('Username Updated', `Callsign set to ${username.trim()}`);
      }
    } catch (e: any) {
      showAlert('Error', e?.message || 'Unknown error');
    } finally {
      setUsernameLoading(false);
    }
  }, [username, user, showAlert]);

  // ── Change password ────────────────────────────────────────────────────────
  const handleChangePassword = useCallback(async () => {
    if (!newPassword || newPassword.length < 6) {
      showAlert('Weak Password', 'New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showAlert('Mismatch', 'New passwords do not match.');
      return;
    }
    setPasswordLoading(true);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        showAlert('Password Change Failed', error.message);
      } else {
        showAlert('Password Updated', 'Your credentials have been rotated successfully.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (e: any) {
      showAlert('Error', e?.message || 'Unknown error');
    } finally {
      setPasswordLoading(false);
    }
  }, [newPassword, confirmPassword, showAlert]);

  // ── Logout ─────────────────────────────────────────────────────────────────
  const handleLogout = useCallback(async () => {
    setShowLogoutConfirm(false);
    if (prefs.clearHistoryOnLogout) {
      await Promise.all([clearAllSessions(), clearExecLog()]);
    }
    const { error } = await logout();
    if (error) showAlert('Logout Failed', error);
  }, [logout, showAlert, prefs.clearHistoryOnLogout]);

  // ── Clear all local data ───────────────────────────────────────────────────
  const handleClearData = useCallback(async () => {
    setClearDataLoading(true);
    setShowClearDataConfirm(false);
    try {
      await Promise.all([
        clearAllSessions(),
        clearExecLog(),
        AsyncStorage.removeItem('axiom_knowledge_base'),
        AsyncStorage.removeItem('axiom_update_log'),
        AsyncStorage.removeItem('axiom_ui_patches'),
        AsyncStorage.removeItem('axiom_attack_storage'),
        AsyncStorage.removeItem('axiom_exec_log'),
        AsyncStorage.removeItem('axiom_system_prompt'),
        AsyncStorage.removeItem('axiom_model'),
        AsyncStorage.removeItem(PREFS_KEY),
      ]);
      setPrefs(DEFAULT_PREFS);
      showAlert('Data Cleared', 'All local AXIOM data has been wiped. Reload to reinitialize.');
    } catch (e: any) {
      showAlert('Error', e?.message || 'Failed to clear data');
    } finally {
      setClearDataLoading(false);
    }
  }, [showAlert]);

  const formatDate = (d?: string) => d ? new Date(d).toLocaleString() : 'Unknown';
  const joinedDate = (user as any)?.created_at ? formatDate((user as any).created_at) : 'Unknown';
  const lastLogin = (user as any)?.last_sign_in_at ? formatDate((user as any).last_sign_in_at) : 'Unknown';

  const SECTIONS: { id: ProfileSection; label: string; icon: string; color: string }[] = [
    { id: 'account',  label: 'ACCOUNT',  icon: 'person',          color: '#00ccff'       },
    { id: 'security', label: 'SECURITY', icon: 'lock',             color: Colors.primary  },
    { id: 'chat',     label: 'CHAT',     icon: 'chat',             color: Colors.accent   },
    { id: 'terminal', label: 'TERMINAL', icon: 'terminal',         color: '#ffaa00'       },
    { id: 'advanced', label: 'ADVANCED', icon: 'settings-suggest', color: '#aa44ff'       },
    { id: 'danger',   label: 'DANGER',   icon: 'warning',          color: Colors.danger   },
  ];

  if (!prefsLoaded) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
        >
          <MaterialIcons name="arrow-back" size={20} color={Colors.textSecondary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>OPERATOR PROFILE</Text>
          <View style={styles.headerCursor}>
            <Animated.Text style={[styles.cursor, { opacity: cursorAnim }]}>▊</Animated.Text>
          </View>
        </View>
        <Pressable
          onPress={() => setShowLogoutConfirm(true)}
          hitSlop={8}
          style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.7 }]}
        >
          <MaterialIcons name="logout" size={16} color={Colors.danger} />
          <Text style={styles.logoutBtnText}>EXIT</Text>
        </Pressable>
      </View>

      {/* Identity card */}
      <View style={styles.identityCard}>
        <View style={styles.avatarRing}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(user?.username || user?.email || '?')[0].toUpperCase()}
            </Text>
          </View>
          <View style={styles.onlinePip} />
        </View>
        <View style={styles.identityInfo}>
          <Text style={styles.identityName} numberOfLines={1}>
            {user?.username || 'Anonymous Operator'}
          </Text>
          <Text style={styles.identityEmail} numberOfLines={1}>{user?.email}</Text>
          <View style={styles.identityBadge}>
            <View style={styles.activeDot} />
            <Text style={styles.identityBadgeText}>ACTIVE SESSION</Text>
          </View>
        </View>
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
            style={[
              styles.sectionTab,
              activeSection === s.id && { borderBottomColor: s.color, borderBottomWidth: 2 },
            ]}
            onPress={() => setActiveSection(s.id)}
          >
            <MaterialIcons
              name={s.icon as any}
              size={12}
              color={activeSection === s.id ? s.color : Colors.textMuted}
            />
            <Text style={[styles.sectionTabText, activeSection === s.id && { color: s.color }]}>
              {s.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        >

          {/* ══ ACCOUNT ══ */}
          {activeSection === 'account' && (
            <>
              <SectionHeader label="ACCOUNT INFORMATION" color="#00ccff" icon="person" />
              <InfoCard rows={[
                ['OPERATOR ID',  user?.id?.slice(0, 8) + '••••••••••••••••••••••••••••' || '—'],
                ['EMAIL',        user?.email || '—'],
                ['USERNAME',     user?.username || '(not set)'],
                ['JOINED',       joinedDate],
                ['LAST LOGIN',   lastLogin],
              ]} />

              <SectionHeader label="UPDATE CALLSIGN" color="#00ccff" icon="edit" />
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>USERNAME / CALLSIGN</Text>
                <View style={styles.inputWrap}>
                  <MaterialIcons name="person-outline" size={14} color={Colors.textMuted} />
                  <TextInput
                    style={styles.input}
                    value={username}
                    onChangeText={setUsername}
                    placeholder="Enter callsign..."
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!usernameLoading}
                  />
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.actionBtn,
                    { borderColor: '#00ccff55', backgroundColor: '#00ccff0d' },
                    usernameLoading && styles.btnDisabled,
                    pressed && { opacity: 0.75 },
                  ]}
                  onPress={handleUpdateUsername}
                  disabled={usernameLoading}
                >
                  {usernameLoading
                    ? <ActivityIndicator size="small" color="#00ccff" />
                    : <MaterialIcons name="check" size={14} color="#00ccff" />}
                  <Text style={[styles.actionBtnText, { color: '#00ccff' }]}>
                    {usernameLoading ? 'UPDATING...' : 'UPDATE CALLSIGN'}
                  </Text>
                </Pressable>
              </View>

              <SectionHeader label="SESSION INFO" color="#00ccff" icon="info-outline" />
              <InfoCard rows={[
                ['Auth Method', 'Email + Password'],
                ['Provider',    'OnSpace Cloud'],
                ['MFA',         'Not enabled'],
                ['Session',     'JWT Bearer token'],
              ]} />
            </>
          )}

          {/* ══ SECURITY ══ */}
          {activeSection === 'security' && (
            <>
              <SectionHeader label="CHANGE PASSWORD" color={Colors.primary} icon="lock" />
              <View style={styles.infoNote}>
                <MaterialIcons name="info-outline" size={12} color={Colors.primary} />
                <Text style={[styles.infoNoteText, { color: Colors.primary + 'aa' }]}>
                  Password must be at least 6 characters. You will remain logged in after changing.
                </Text>
              </View>

              <View style={styles.form}>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>NEW PASSWORD</Text>
                  <View style={styles.inputWrap}>
                    <MaterialIcons name="lock-outline" size={14} color={Colors.textMuted} />
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      placeholder="min. 6 characters"
                      placeholderTextColor={Colors.textMuted}
                      secureTextEntry={!showNew}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <Pressable onPress={() => setShowNew(v => !v)} hitSlop={8}>
                      <MaterialIcons
                        name={showNew ? 'visibility-off' : 'visibility'}
                        size={14}
                        color={Colors.textMuted}
                      />
                    </Pressable>
                  </View>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>CONFIRM NEW PASSWORD</Text>
                  <View style={[
                    styles.inputWrap,
                    confirmPassword && newPassword !== confirmPassword
                      ? { borderColor: Colors.danger + '55' }
                      : {},
                  ]}>
                    <MaterialIcons name="lock" size={14} color={Colors.textMuted} />
                    <TextInput
                      style={styles.input}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder="repeat new password"
                      placeholderTextColor={Colors.textMuted}
                      secureTextEntry={!showNew}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    {confirmPassword && confirmPassword === newPassword ? (
                      <MaterialIcons name="check-circle" size={14} color={Colors.accent} />
                    ) : null}
                  </View>
                  {confirmPassword && newPassword !== confirmPassword ? (
                    <Text style={styles.errorHint}>Passwords do not match</Text>
                  ) : null}
                </View>

                {/* Strength indicator */}
                {newPassword.length > 0 ? (
                  <View style={styles.strengthBar}>
                    {[4, 8, 12, 16].map((threshold, i) => (
                      <View
                        key={i}
                        style={[
                          styles.strengthSegment,
                          {
                            backgroundColor: newPassword.length >= threshold
                              ? i < 1 ? Colors.danger : i < 2 ? Colors.warning : i < 3 ? Colors.accent : Colors.accent
                              : Colors.surfaceBorder,
                          },
                        ]}
                      />
                    ))}
                    <Text style={styles.strengthLabel}>
                      {newPassword.length < 4 ? 'WEAK' : newPassword.length < 8 ? 'FAIR' : newPassword.length < 12 ? 'GOOD' : 'STRONG'}
                    </Text>
                  </View>
                ) : null}

                <Pressable
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    passwordLoading && styles.btnDisabled,
                    pressed && { opacity: 0.8 },
                  ]}
                  onPress={handleChangePassword}
                  disabled={passwordLoading}
                >
                  {passwordLoading
                    ? <ActivityIndicator size="small" color={Colors.bg} />
                    : <MaterialIcons name="lock" size={15} color={Colors.bg} />}
                  <Text style={styles.primaryBtnText}>
                    {passwordLoading ? 'ROTATING...' : 'ROTATE CREDENTIALS'}
                  </Text>
                </Pressable>
              </View>

              <SectionHeader label="SECURITY STATUS" color={Colors.primary} icon="security" />
              <InfoCard rows={[
                ['Encryption',     'TLS 1.3 in transit'],
                ['Storage',        'AsyncStorage (device-local)'],
                ['Secrets',        'Server-side only (Deno env)'],
                ['Auth Tokens',    'JWT via Supabase Auth'],
                ['Password Min',   '6 characters'],
                ['MFA',            'Not available (email auth)'],
              ]} />
            </>
          )}

          {/* ══ CHAT ══ */}
          {activeSection === 'chat' && (
            <>
              <SectionHeader label="CHAT PREFERENCES" color={Colors.accent} icon="tune" />
              <ToggleCard prefs={prefs} onUpdate={updatePref} items={[
                { key: 'autoScroll',       label: 'Auto-Scroll',       desc: 'Scroll to latest message automatically',       color: Colors.accent  },
                { key: 'showQuickActions', label: 'Quick Actions',      desc: 'Show tactical shortcut buttons in new chats',  color: Colors.accent  },
                { key: 'streamingEnabled', label: 'SSE Streaming',      desc: 'Real-time token streaming from AI',            color: Colors.info    },
                { key: 'autoLearn',        label: 'Auto-Learn',         desc: 'Extract knowledge from high-value exchanges',  color: Colors.accent  },
                { key: 'verboseOutput',    label: 'Verbose Mode',       desc: 'Request full technical detail in AI replies',  color: Colors.warning },
                { key: 'showStealthMeter', label: 'Stealth Meter',      desc: 'Show operational stealth score bar',           color: Colors.accent  },
                { key: 'showTTPTracker',   label: 'TTP Tracker',        desc: 'Enable MITRE TTP extraction panel',            color: Colors.accent  },
                { key: 'compactMode',      label: 'Compact Messages',   desc: 'Reduce message bubble padding and size',       color: Colors.textMuted },
              ]} />

              <SectionHeader label="SESSION CONFIG" color={Colors.accent} icon="history" />
              <View style={styles.stepperCard}>
                <View style={styles.stepperRow}>
                  <View>
                    <Text style={styles.stepperLabel}>MAX SESSIONS</Text>
                    <Text style={styles.stepperDesc}>Older sessions auto-deleted after limit</Text>
                  </View>
                  <View style={styles.stepperControls}>
                    <Pressable
                      style={styles.stepperBtn}
                      onPress={() => updatePref('maxSessions', Math.max(5, prefs.maxSessions - 5))}
                      hitSlop={8}
                    >
                      <MaterialIcons name="remove" size={16} color={Colors.textSecondary} />
                    </Pressable>
                    <Text style={styles.stepperValue}>{prefs.maxSessions}</Text>
                    <Pressable
                      style={styles.stepperBtn}
                      onPress={() => updatePref('maxSessions', Math.min(200, prefs.maxSessions + 5))}
                      hitSlop={8}
                    >
                      <MaterialIcons name="add" size={16} color={Colors.textSecondary} />
                    </Pressable>
                  </View>
                </View>
              </View>
            </>
          )}

          {/* ══ TERMINAL ══ */}
          {activeSection === 'terminal' && (
            <>
              <SectionHeader label="DEFAULT LANGUAGE" color="#ffaa00" icon="terminal" />
              <View style={styles.langGrid}>
                {TERMINAL_LANGS.map(lang => {
                  const isActive = prefs.defaultLang === lang;
                  return (
                    <Pressable
                      key={lang}
                      style={({ pressed }) => [
                        styles.langChip,
                        isActive && { borderColor: '#ffaa0066', backgroundColor: '#ffaa000d' },
                        pressed && { opacity: 0.7 },
                      ]}
                      onPress={() => updatePref('defaultLang', lang)}
                    >
                      <Text style={[styles.langChipText, isActive && { color: '#ffaa00' }]}>
                        {lang}
                      </Text>
                      {isActive ? <MaterialIcons name="check" size={10} color="#ffaa00" /> : null}
                    </Pressable>
                  );
                })}
              </View>

              <SectionHeader label="FONT SIZE" color="#ffaa00" icon="format-size" />
              <View style={styles.stepperCard}>
                <View style={styles.stepperRow}>
                  <View>
                    <Text style={styles.stepperLabel}>TERMINAL FONT SIZE</Text>
                    <Text style={styles.stepperDesc}>Applies to code output and input</Text>
                  </View>
                  <View style={styles.stepperControls}>
                    <Pressable
                      style={styles.stepperBtn}
                      onPress={() => {
                        const idx = FONT_SIZES.indexOf(prefs.terminalFontSize);
                        if (idx > 0) updatePref('terminalFontSize', FONT_SIZES[idx - 1]);
                      }}
                      hitSlop={8}
                    >
                      <MaterialIcons name="remove" size={16} color={Colors.textSecondary} />
                    </Pressable>
                    <Text style={styles.stepperValue}>{prefs.terminalFontSize}px</Text>
                    <Pressable
                      style={styles.stepperBtn}
                      onPress={() => {
                        const idx = FONT_SIZES.indexOf(prefs.terminalFontSize);
                        if (idx < FONT_SIZES.length - 1) updatePref('terminalFontSize', FONT_SIZES[idx + 1]);
                      }}
                      hitSlop={8}
                    >
                      <MaterialIcons name="add" size={16} color={Colors.textSecondary} />
                    </Pressable>
                  </View>
                </View>
                {/* Preview */}
                <View style={styles.fontPreview}>
                  <Text style={[styles.fontPreviewText, { fontSize: prefs.terminalFontSize }]}>
                    {'$ nmap -sV -sC -T4 --open 192.168.1.0/24'}
                  </Text>
                </View>
              </View>

              <SectionHeader label="DISPLAY" color="#ffaa00" icon="monitor" />
              <InfoCard rows={[
                ['Default Lang',   prefs.defaultLang],
                ['Font Size',      `${prefs.terminalFontSize}px`],
                ['Syntax Highlight', 'Enabled (bash)'],
                ['Autocomplete',   'Enabled'],
                ['History Size',   '100 commands'],
              ]} />
            </>
          )}

          {/* ══ ADVANCED ══ */}
          {activeSection === 'advanced' && (
            <>
              <SectionHeader label="OPSEC & PRIVACY" color="#aa44ff" icon="visibility-off" />
              <ToggleCard prefs={prefs} onUpdate={updatePref} items={[
                { key: 'opsecMode',            label: 'OPSEC Mode',              desc: 'Strip metadata from AI output',                      color: '#aa44ff' },
                { key: 'clearHistoryOnLogout', label: 'Wipe on Logout',          desc: 'Delete all sessions and logs when signing out',      color: Colors.danger },
                { key: 'soundFeedback',        label: 'Sound Feedback',          desc: 'Audio cues for execution events',                    color: '#aa44ff' },
              ]} />

              <SectionHeader label="PLATFORM CONFIG" color="#aa44ff" icon="settings-suggest" />
              <InfoCard rows={[
                ['Backend',      'OnSpace Cloud (Supabase-compatible)'],
                ['Edge Runtime', 'Deno v1.x'],
                ['App Version',  '2.5.0'],
                ['SDK',          'Expo SDK 52'],
                ['Router',       'expo-router v4'],
                ['New Arch',     'Enabled (React Native 0.76+)'],
                ['Auth',         'Email + Password / OTP'],
              ]} />

              <SectionHeader label="STORAGE UTILIZATION" color="#aa44ff" icon="storage" />
              <StorageUsageWidget />

              <SectionHeader label="KEYBOARD SHORTCUTS" color="#aa44ff" icon="keyboard" />
              <View style={styles.shortcutCard}>
                {[
                  ['↑ / ↓',       'Navigate terminal history'],
                  ['Enter',        'Send chat / run terminal'],
                  ['New Session',  'Clear chat, start fresh'],
                  ['TTP Panel',    'Toggle MITRE TTP tracker'],
                  ['Stealth',      'Shows operational noise score'],
                ].map(([key, desc]) => (
                  <View key={key} style={styles.shortcutRow}>
                    <View style={styles.shortcutKey}><Text style={styles.shortcutKeyText}>{key}</Text></View>
                    <Text style={styles.shortcutDesc}>{desc}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* ══ DANGER ZONE ══ */}
          {activeSection === 'danger' && (
            <>
              <View style={styles.dangerBanner}>
                <MaterialIcons name="warning" size={18} color={Colors.danger} />
                <Text style={styles.dangerBannerText}>
                  Actions in this section are irreversible. Proceed with extreme caution.
                </Text>
              </View>

              <SectionHeader label="SESSION MANAGEMENT" color={Colors.danger} icon="history" />
              <DangerAction
                icon="delete-sweep"
                label="CLEAR ALL CHAT SESSIONS"
                desc="Permanently delete all saved chat sessions from local storage."
                onPress={async () => {
                  await clearAllSessions();
                  showAlert('Cleared', 'All chat sessions deleted.');
                }}
              />

              <SectionHeader label="LOG MANAGEMENT" color={Colors.danger} icon="history-toggle-off" />
              <DangerAction
                icon="remove-circle"
                label="CLEAR EXECUTION LOG"
                desc="Wipe the entire ops log including terminal history, attack records, and analysis."
                onPress={async () => {
                  await clearExecLog();
                  showAlert('Cleared', 'Execution log wiped.');
                }}
              />

              <SectionHeader label="FULL DATA WIPE" color={Colors.danger} icon="warning" />
              <DangerAction
                icon="delete-forever"
                label="WIPE ALL LOCAL DATA"
                desc="Deletes sessions, logs, knowledge base, system prompt, attack records, and all user preferences."
                critical
                onPress={() => setShowClearDataConfirm(true)}
                loading={clearDataLoading}
              />

              <SectionHeader label="ACCOUNT" color={Colors.danger} icon="exit-to-app" />
              <DangerAction
                icon="logout"
                label="SIGN OUT OF AXIOM"
                desc={prefs.clearHistoryOnLogout
                  ? 'Sign out and wipe all local sessions + logs (Wipe on Logout is ON).'
                  : 'End your authenticated session. Local data is preserved.'}
                onPress={() => setShowLogoutConfirm(true)}
              />
            </>
          )}

        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Logout Confirm ── */}
      <Modal visible={showLogoutConfirm} transparent animationType="fade" onRequestClose={() => setShowLogoutConfirm(false)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmBox}>
            <MaterialIcons name="logout" size={32} color={Colors.danger} />
            <Text style={styles.confirmTitle}>TERMINATE SESSION?</Text>
            <Text style={styles.confirmDesc}>
              {prefs.clearHistoryOnLogout
                ? 'You will be signed out and all local data wiped (Wipe on Logout is enabled).'
                : 'You will be signed out. All local data will remain on device.'}
            </Text>
            <View style={styles.confirmActions}>
              <Pressable
                style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.7 }]}
                onPress={() => setShowLogoutConfirm(false)}
              >
                <Text style={styles.cancelBtnText}>ABORT</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.7 }]}
                onPress={handleLogout}
              >
                {operationLoading
                  ? <ActivityIndicator size="small" color={Colors.bg} />
                  : <Text style={styles.deleteBtnText}>SIGN OUT</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Clear Data Confirm ── */}
      <Modal visible={showClearDataConfirm} transparent animationType="fade" onRequestClose={() => setShowClearDataConfirm(false)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmBox}>
            <MaterialIcons name="delete-forever" size={32} color={Colors.danger} />
            <Text style={styles.confirmTitle}>WIPE ALL DATA?</Text>
            <Text style={styles.confirmDesc}>
              This will permanently delete ALL local AXIOM data including sessions, logs, knowledge base, attack records, and preferences. This cannot be undone.
            </Text>
            <View style={styles.confirmActions}>
              <Pressable
                style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.7 }]}
                onPress={() => setShowClearDataConfirm(false)}
              >
                <Text style={styles.cancelBtnText}>ABORT</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.7 }]}
                onPress={handleClearData}
              >
                <Text style={styles.deleteBtnText}>WIPE DATA</Text>
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
      <MaterialIcons name={icon as any} size={12} color={color} />
      <Text style={[sharedStyles.sectionHeaderText, { color }]}>{label}</Text>
    </View>
  );
}

function InfoCard({ rows }: { rows: [string, string][] }) {
  return (
    <View style={sharedStyles.infoCard}>
      {rows.map(([key, val], i) => (
        <View key={key + i} style={[sharedStyles.infoRow, i < rows.length - 1 && sharedStyles.infoBorder]}>
          <Text style={sharedStyles.infoKey}>{key}</Text>
          <Text style={sharedStyles.infoVal} selectable numberOfLines={2}>{val}</Text>
        </View>
      ))}
    </View>
  );
}

function ToggleCard({
  prefs,
  onUpdate,
  items,
}: {
  prefs: UserPrefs;
  onUpdate: <K extends keyof UserPrefs>(key: K, value: UserPrefs[K]) => void;
  items: { key: keyof UserPrefs; label: string; desc: string; color: string }[];
}) {
  return (
    <View style={sharedStyles.toggleCard}>
      {items.map((item, i) => (
        <View key={item.key} style={[sharedStyles.toggleRow, i < items.length - 1 && sharedStyles.toggleBorder]}>
          <View style={sharedStyles.toggleInfo}>
            <Text style={sharedStyles.toggleLabel}>{item.label}</Text>
            <Text style={sharedStyles.toggleDesc}>{item.desc}</Text>
          </View>
          <Switch
            value={Boolean(prefs[item.key])}
            onValueChange={v => onUpdate(item.key, v as any)}
            trackColor={{ false: Colors.surfaceBorder, true: item.color + '66' }}
            thumbColor={Boolean(prefs[item.key]) ? item.color : Colors.textMuted}
            ios_backgroundColor={Colors.surfaceBorder}
          />
        </View>
      ))}
    </View>
  );
}

function DangerAction({
  icon, label, desc, onPress, critical = false, loading = false,
}: {
  icon: string; label: string; desc: string; onPress: () => void;
  critical?: boolean; loading?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        sharedStyles.dangerAction,
        critical && sharedStyles.dangerActionCritical,
        pressed && { opacity: 0.7 },
      ]}
      onPress={onPress}
    >
      <View style={[sharedStyles.dangerActionIcon, critical && { borderColor: Colors.danger + '55', backgroundColor: Colors.danger + '18' }]}>
        {loading
          ? <ActivityIndicator size="small" color={Colors.danger} />
          : <MaterialIcons name={icon as any} size={18} color={Colors.danger} />}
      </View>
      <View style={sharedStyles.dangerActionInfo}>
        <Text style={sharedStyles.dangerActionLabel}>{label}</Text>
        <Text style={sharedStyles.dangerActionDesc}>{desc}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={16} color={Colors.danger + '66'} />
    </Pressable>
  );
}

function StorageUsageWidget() {
  const [sizes, setSizes] = useState<Record<string, number>>({});
  useEffect(() => {
    const keys = [
      'axiom_sessions', 'axiom_exec_log', 'axiom_knowledge_base',
      'axiom_attack_storage', 'axiom_system_prompt', 'axiom_update_log',
      'axiom_user_prefs',
    ];
    Promise.all(keys.map(async k => {
      try {
        const v = await AsyncStorage.getItem(k);
        return [k, v ? new TextEncoder().encode(v).length : 0] as [string, number];
      } catch { return [k, 0] as [string, number]; }
    })).then(results => {
      setSizes(Object.fromEntries(results));
    });
  }, []);

  const fmt = (b: number) => b < 1024 ? `${b}B` : `${(b / 1024).toFixed(1)}KB`;
  const total = Object.values(sizes).reduce((a, b) => a + b, 0);
  const labels: Record<string, string> = {
    axiom_sessions: 'Chat Sessions',
    axiom_exec_log: 'Execution Log',
    axiom_knowledge_base: 'Knowledge Base',
    axiom_attack_storage: 'Attack Records',
    axiom_system_prompt: 'System Prompt',
    axiom_update_log: 'Update Log',
    axiom_user_prefs: 'User Prefs',
  };

  return (
    <View style={sharedStyles.infoCard}>
      {Object.entries(sizes).map(([key, size], i, arr) => (
        <View key={key} style={[sharedStyles.infoRow, i < arr.length - 1 && sharedStyles.infoBorder]}>
          <Text style={sharedStyles.infoKey}>{labels[key] || key}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{
              height: 4, width: Math.max(4, total > 0 ? (size / total) * 80 : 0),
              backgroundColor: Colors.accent + '55', borderRadius: 2,
            }} />
            <Text style={[sharedStyles.infoVal, { color: Colors.accent }]}>{fmt(size)}</Text>
          </View>
        </View>
      ))}
      <View style={[sharedStyles.infoRow, { backgroundColor: '#111' }]}>
        <Text style={[sharedStyles.infoKey, { color: Colors.textSecondary, fontWeight: Typography.bold }]}>TOTAL</Text>
        <Text style={[sharedStyles.infoVal, { color: Colors.primary, fontWeight: Typography.bold }]}>{fmt(total)}</Text>
      </View>
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
  infoCard: {
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: Radius.md,
    overflow: 'hidden',
    marginBottom: Spacing.xs,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
    gap: Spacing.md,
  },
  infoBorder: { borderBottomWidth: 1, borderBottomColor: '#111' },
  infoKey: {
    color: Colors.accent,
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    width: 100,
    flexShrink: 0,
  },
  infoVal: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 16,
    textAlign: 'right',
  },
  toggleCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginBottom: Spacing.xs,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  toggleBorder: { borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  toggleInfo: { flex: 1, marginRight: Spacing.md },
  toggleLabel: {
    color: Colors.textPrimary,
    fontSize: Typography.base,
    fontWeight: Typography.medium,
    marginBottom: 2,
  },
  toggleDesc: { color: Colors.textMuted, fontSize: Typography.sm, lineHeight: 18 },
  dangerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.danger + '22',
    borderRadius: Radius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.sm,
  },
  dangerActionCritical: {
    borderColor: Colors.danger + '44',
    backgroundColor: Colors.danger + '08',
  },
  dangerActionIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.danger + '33',
    backgroundColor: Colors.danger + '0d',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  dangerActionInfo: { flex: 1 },
  dangerActionLabel: {
    color: Colors.danger,
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  dangerActionDesc: { color: Colors.textMuted, fontSize: Typography.xs, lineHeight: 16 },
});

// ── Main styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    backgroundColor: '#050505',
    gap: Spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    flexShrink: 0,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    letterSpacing: 3,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  headerCursor: { marginLeft: 2 },
  cursor: {
    color: Colors.primary,
    fontSize: Typography.sm,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.danger + '44',
    backgroundColor: Colors.danger + '0d',
    flexShrink: 0,
  },
  logoutBtnText: {
    color: Colors.danger,
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    letterSpacing: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // Identity card
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.base,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    backgroundColor: '#080808',
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  avatarRing: { position: 'relative', flexShrink: 0 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#00ccff18',
    borderWidth: 2,
    borderColor: '#00ccff44',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#00ccff',
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  onlinePip: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.accent,
    borderWidth: 2,
    borderColor: Colors.bg,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  identityInfo: { flex: 1 },
  identityName: {
    color: Colors.textPrimary,
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    marginBottom: 2,
  },
  identityEmail: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 5,
  },
  identityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.accent,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 3,
  },
  identityBadgeText: {
    color: Colors.accent,
    fontSize: 9,
    fontWeight: Typography.bold,
    letterSpacing: 1.5,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // Section tabs
  sectionTabBar: {
    backgroundColor: '#050505',
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    maxHeight: 40,
  },
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

  content: {
    padding: Spacing.base,
  },

  // Form
  form: { gap: Spacing.base },
  fieldGroup: { gap: Spacing.xs, marginBottom: Spacing.sm },
  fieldLabel: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    letterSpacing: 1.5,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: Typography.base,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  errorHint: {
    color: Colors.danger,
    fontSize: Typography.xs,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 3,
  },
  infoNote: {
    flexDirection: 'row',
    gap: 6,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.base,
    alignItems: 'flex-start',
    borderColor: Colors.primary + '33',
    backgroundColor: Colors.primary + '08',
  },
  infoNoteText: {
    flex: 1,
    fontSize: Typography.xs,
    lineHeight: 17,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // Password strength
  strengthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: -Spacing.xs,
  },
  strengthSegment: {
    height: 3,
    width: 32,
    borderRadius: 2,
  },
  strengthLabel: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: Typography.bold,
    letterSpacing: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginLeft: 4,
  },

  // Buttons
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.base,
    borderRadius: Radius.xl,
    ...Shadow.redGlow,
  },
  primaryBtnText: {
    color: Colors.bg,
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    letterSpacing: 1.5,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: Radius.xl,
    borderWidth: 1,
    marginTop: Spacing.sm,
  },
  actionBtnText: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    letterSpacing: 1.5,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  btnDisabled: { opacity: 0.4 },

  // Model grid
  modelGrid: {
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  modelChip: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: Radius.lg,
    padding: Spacing.md,
  },
  modelChipTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  modelChipName: {
    color: Colors.textPrimary,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    flex: 1,
  },
  tierDot: { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
  modelChipDesc: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    lineHeight: 17,
    marginBottom: 4,
  },
  modelActiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  modelActiveTxt: {
    fontSize: 9,
    fontWeight: Typography.bold,
    letterSpacing: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // Language grid
  langGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  langChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
  },
  langChipText: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // Stepper
  stepperCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.sm,
    gap: Spacing.base,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepperLabel: {
    color: Colors.textPrimary,
    fontSize: Typography.base,
    fontWeight: Typography.medium,
    marginBottom: 2,
  },
  stepperDesc: { color: Colors.textMuted, fontSize: Typography.xs },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  stepperValue: {
    color: Colors.textPrimary,
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    minWidth: 48,
    textAlign: 'center',
  },
  fontPreview: {
    backgroundColor: '#000',
    borderRadius: Radius.sm,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  fontPreviewText: {
    color: '#00ff41',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 20,
  },

  // Shortcut card
  shortcutCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  shortcutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  shortcutKey: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    minWidth: 60,
    alignItems: 'center',
  },
  shortcutKeyText: {
    color: Colors.accent,
    fontSize: 10,
    fontWeight: Typography.bold,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  shortcutDesc: { color: Colors.textSecondary, fontSize: Typography.sm, flex: 1 },

  // Danger zone
  dangerBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.danger + '0d',
    borderWidth: 1,
    borderColor: Colors.danger + '33',
    borderRadius: Radius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.sm,
  },
  dangerBannerText: {
    color: Colors.danger + 'aa',
    fontSize: Typography.sm,
    lineHeight: 20,
    flex: 1,
  },

  // Confirm modals
  confirmOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  confirmBox: {
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1,
    borderColor: Colors.danger + '44',
    borderRadius: Radius.xxl,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
    width: '100%',
  },
  confirmTitle: {
    color: Colors.textPrimary,
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  confirmDesc: {
    color: Colors.textMuted,
    fontSize: Typography.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    width: '100%',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: Colors.textSecondary,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    letterSpacing: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  deleteBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: Radius.xl,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: {
    color: Colors.bg,
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    letterSpacing: 1.5,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
