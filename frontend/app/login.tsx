/**
 * LOGIN — AXIOM Secure Authentication
 * OTP + Password for registration | Email + Password for login
 * Matches AXIOM dark hacker theme
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
import { isGodCredential, setGodSession } from '@/services/godUser';
import { useRouter } from 'expo-router';

const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

type AuthMode = 'login' | 'register' | 'verify';

export default function LoginScreen() {
  const { signInWithPassword, signUpWithPassword, sendOTP, verifyOTPAndLogin, operationLoading } = useAuth();
  const { showAlert } = useAlert();
  const router = useRouter();

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  // Blinking cursor animation
  const cursorAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(cursorAnim, { toValue: 0, duration: 500, useNativeDriver: true, easing: Easing.step0 }),
        Animated.timing(cursorAnim, { toValue: 1, duration: 500, useNativeDriver: true, easing: Easing.step0 }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.3, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      showAlert('Missing Fields', 'Enter your email and password.');
      return;
    }
    // ── God bypass: any operator who types a god passphrase skips Supabase entirely ──
    if (isGodCredential(email, password)) {
      await setGodSession(true);
      // Force a hard reload so the AuthProvider re-reads the session
      if (typeof window !== 'undefined' && (window as any).location) {
        (window as any).location.href = '/';
      } else {
        router.replace('/');
      }
      return;
    }
    const { error } = await signInWithPassword(email.trim(), password);
    if (error) showAlert('Login Failed', error);
  };

  const handleSendOTP = async () => {
    if (!email.trim()) {
      showAlert('Missing Email', 'Enter your email address first.');
      return;
    }
    if (password.length < 6) {
      showAlert('Weak Password', 'Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      showAlert('Password Mismatch', 'Passwords do not match.');
      return;
    }
    const { error } = await sendOTP(email.trim());
    if (error) {
      showAlert('OTP Failed', error);
      return;
    }
    setOtpSent(true);
    setMode('verify');
  };

  const handleVerifyOTP = async () => {
    if (otp.length < 4) {
      showAlert('Invalid Code', 'Enter the 4-digit code sent to your email.');
      return;
    }
    const { error } = await verifyOTPAndLogin(email.trim(), otp, { password });
    if (error) showAlert('Verification Failed', error);
    // On success AuthRouter redirects automatically
  };

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setOtp('');
    setOtpSent(false);
  };

  const switchMode = (m: AuthMode) => {
    resetForm();
    setMode(m);
  };

  const isLogin = mode === 'login';
  const isRegister = mode === 'register';
  const isVerify = mode === 'verify';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Scanlines overlay */}
      <View style={styles.scanlines} pointerEvents="none" />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo / Header */}
          <View style={styles.logoArea}>
            <Animated.Text style={[styles.logoTitle, { opacity: glowAnim }]}>
              AXIOM
            </Animated.Text>
            <View style={styles.logoCursor}>
              <Text style={styles.logoSub}>RED TEAM AI · SECURE ACCESS</Text>
              <Animated.Text style={[styles.cursor, { opacity: cursorAnim }]}>▊</Animated.Text>
            </View>
            <View style={styles.statusRow}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>AUTHENTICATION REQUIRED</Text>
            </View>
          </View>

          {/* Mode indicator */}
          <View style={styles.modeCard}>
            <View style={styles.modeHeader}>
              <MaterialIcons
                name={isVerify ? 'verified-user' : isLogin ? 'lock' : 'person-add'}
                size={14}
                color={Colors.accent}
              />
              <Text style={styles.modeTitle}>
                {isVerify ? 'OTP VERIFICATION' : isLogin ? 'OPERATOR LOGIN' : 'NEW OPERATOR'}
              </Text>
            </View>
            <Text style={styles.modeDesc}>
              {isVerify
                ? `Enter the 4-digit code sent to ${email}`
                : isLogin
                ? 'Authenticate with your credentials to access AXIOM.'
                : 'Create your operator account. Email verification required.'}
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* Email — not shown in verify */}
            {!isVerify ? (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>EMAIL ADDRESS</Text>
                <View style={styles.inputWrap}>
                  <MaterialIcons name="alternate-email" size={15} color={Colors.textMuted} />
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="operator@domain.com"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    editable={!operationLoading}
                  />
                </View>
              </View>
            ) : null}

            {/* Password — not shown in verify */}
            {!isVerify ? (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>PASSWORD</Text>
                <View style={styles.inputWrap}>
                  <MaterialIcons name="lock-outline" size={15} color={Colors.textMuted} />
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder={isLogin ? '••••••••' : 'min. 6 characters'}
                    placeholderTextColor={Colors.textMuted}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!operationLoading}
                  />
                  <Pressable onPress={() => setShowPassword(v => !v)} hitSlop={8}>
                    <MaterialIcons
                      name={showPassword ? 'visibility-off' : 'visibility'}
                      size={15}
                      color={Colors.textMuted}
                    />
                  </Pressable>
                </View>
              </View>
            ) : null}

            {/* Confirm password — register only */}
            {isRegister ? (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>CONFIRM PASSWORD</Text>
                <View style={styles.inputWrap}>
                  <MaterialIcons name="lock" size={15} color={Colors.textMuted} />
                  <TextInput
                    style={styles.input}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="repeat password"
                    placeholderTextColor={Colors.textMuted}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!operationLoading}
                  />
                </View>
              </View>
            ) : null}

            {/* OTP field — verify only */}
            {isVerify ? (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>VERIFICATION CODE</Text>
                <View style={[styles.inputWrap, { borderColor: Colors.accent + '55' }]}>
                  <MaterialIcons name="verified" size={15} color={Colors.accent} />
                  <TextInput
                    style={[styles.input, { color: Colors.accent, letterSpacing: 6, fontSize: Typography.xl, textAlign: 'center' }]}
                    value={otp}
                    onChangeText={v => setOtp(v.replace(/\D/g, '').slice(0, 4))}
                    placeholder="0000"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="number-pad"
                    maxLength={4}
                    editable={!operationLoading}
                  />
                </View>
                <Text style={styles.otpHint}>Check your inbox — 4-digit code expires in 1 hour</Text>
              </View>
            ) : null}

            {/* Primary Action */}
            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                operationLoading && styles.btnDisabled,
                pressed && { opacity: 0.8 },
              ]}
              onPress={isVerify ? handleVerifyOTP : isLogin ? handleLogin : handleSendOTP}
              disabled={operationLoading}
            >
              {operationLoading ? (
                <ActivityIndicator size="small" color={Colors.bg} />
              ) : (
                <MaterialIcons
                  name={isVerify ? 'verified-user' : isLogin ? 'login' : 'send'}
                  size={16}
                  color={Colors.bg}
                />
              )}
              <Text style={styles.primaryBtnText}>
                {operationLoading
                  ? 'PROCESSING...'
                  : isVerify
                  ? 'VERIFY & ACTIVATE'
                  : isLogin
                  ? 'ACCESS AXIOM'
                  : 'SEND VERIFICATION CODE'}
              </Text>
            </Pressable>

            {/* Verify mode — back + resend */}
            {isVerify ? (
              <View style={styles.verifyActions}>
                <Pressable
                  onPress={() => switchMode('register')}
                  style={({ pressed }) => [styles.textBtn, pressed && { opacity: 0.6 }]}
                >
                  <MaterialIcons name="arrow-back" size={13} color={Colors.textMuted} />
                  <Text style={styles.textBtnText}>BACK</Text>
                </Pressable>
                <Pressable
                  onPress={handleSendOTP}
                  disabled={operationLoading}
                  style={({ pressed }) => [styles.textBtn, pressed && { opacity: 0.6 }]}
                >
                  <MaterialIcons name="refresh" size={13} color={Colors.accent} />
                  <Text style={[styles.textBtnText, { color: Colors.accent }]}>RESEND CODE</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          {/* Mode switcher */}
          {!isVerify ? (
            <View style={styles.switchArea}>
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>

              {isLogin ? (
                <Pressable
                  style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.8 }]}
                  onPress={() => switchMode('register')}
                >
                  <MaterialIcons name="person-add" size={15} color={Colors.accent} />
                  <Text style={styles.secondaryBtnText}>CREATE OPERATOR ACCOUNT</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.8 }]}
                  onPress={() => switchMode('login')}
                >
                  <MaterialIcons name="login" size={15} color={Colors.accent} />
                  <Text style={styles.secondaryBtnText}>EXISTING OPERATOR — LOGIN</Text>
                </Pressable>
              )}
            </View>
          ) : null}

          {/* Footer disclaimer */}
          <View style={styles.footer}>
            <MaterialIcons name="security" size={11} color={Colors.textMuted} />
            <Text style={styles.footerText}>
              Authorized use only · All sessions logged · AXIOM Red Team Platform
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
  scanlines: {
    ...StyleSheet.absoluteFillObject,
    backgroundImage: undefined,
    opacity: 0.03,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxl,
    justifyContent: 'center',
  },

  // Logo
  logoArea: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
    gap: Spacing.sm,
  },
  logoTitle: {
    color: Colors.primary,
    fontSize: 52,
    fontWeight: Typography.heavy,
    letterSpacing: 12,
    fontFamily: MONO,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
  },
  logoCursor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  logoSub: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    letterSpacing: 2,
    fontFamily: MONO,
  },
  cursor: {
    color: Colors.primary,
    fontSize: Typography.sm,
    fontFamily: MONO,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.warning,
    shadowColor: Colors.warning,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 4,
  },
  statusText: {
    color: Colors.warning,
    fontSize: 9,
    fontWeight: Typography.bold,
    letterSpacing: 2,
    fontFamily: MONO,
  },

  // Mode card
  modeCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.accent + '22',
    borderRadius: Radius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.lg,
  },
  modeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: 6,
  },
  modeTitle: {
    color: Colors.accent,
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    letterSpacing: 2,
    fontFamily: MONO,
  },
  modeDesc: {
    color: Colors.textMuted,
    fontSize: Typography.sm,
    lineHeight: 20,
  },

  // Form
  form: { gap: Spacing.base, marginBottom: Spacing.lg },
  fieldGroup: { gap: Spacing.xs },
  fieldLabel: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    letterSpacing: 1.5,
    fontFamily: MONO,
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
    fontFamily: MONO,
  },
  otpHint: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    textAlign: 'center',
    fontFamily: MONO,
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
    marginTop: Spacing.sm,
    ...Shadow.redGlow,
  },
  primaryBtnText: {
    color: Colors.bg,
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    letterSpacing: 1.5,
    fontFamily: MONO,
  },
  btnDisabled: { opacity: 0.4, shadowOpacity: 0, elevation: 0 },

  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.accentMuted,
    borderWidth: 1,
    borderColor: Colors.accent + '44',
    paddingVertical: Spacing.md,
    borderRadius: Radius.xl,
  },
  secondaryBtnText: {
    color: Colors.accent,
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    letterSpacing: 1.5,
    fontFamily: MONO,
  },

  verifyActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  textBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: Spacing.sm,
  },
  textBtnText: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    letterSpacing: 1,
    fontFamily: MONO,
  },

  // Switch area
  switchArea: { gap: Spacing.base },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.surfaceBorder },
  dividerText: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    fontFamily: MONO,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
    marginTop: Spacing.xl,
  },
  footerText: {
    color: Colors.textMuted,
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 16,
    flex: 1,
  },
});
