import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';

// ─── Sabitler ────────────────────────────────────────────────────
const API_URL = `${process.env.EXPO_PUBLIC_API_URL}/courier/login`;
const TOKEN_KEY = 'jwt_token';

// ─── Login Ekranı ────────────────────────────────────────────────
export default function LoginScreen({ navigation }: any): React.JSX.Element {
  const [phone, setPhone] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string>('');

  // ── Giriş işlemi ──
  const handleLogin = async (): Promise<void> => {
    // Validasyon
    if (!phone.trim()) {
      setError('Telefon numarası boş bırakılamaz.');
      return;
    }
    if (!pin.trim() || pin.length !== 4) {
      setError('PIN 4 haneli olmalıdır.');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), pin: pin.trim() }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setError(`Vercel'in Yanıtı: [${response.status}] ${errorData.error || 'Gizli Hata'}`);
        setIsSubmitting(false);
        return;
      }
      const data = await response.json();

      if (!data.token) {
        setError('Sunucudan geçersiz yanıt alındı.');
        setIsSubmitting(false);
        return;
      }

      // Token'ı cihaza kaydet
      await SecureStore.setItemAsync(TOKEN_KEY, data.token);

      setIsSubmitting(false);
      setSuccessMessage('Giriş Başarılı');

      // Başarı sonrası kısa süre bekleyip Dashboard'a yönlendir
      setTimeout(() => {
        navigation.replace('Dashboard');
      }, 500);

    } catch {
      setError('Bağlantı hatası. Ağ bağlantınızı kontrol edin.');
      setIsSubmitting(false);
    }
  };

  // ── Giriş Başarılı Ekranı ──
  if (successMessage) {
    return (
      <View style={styles.centeredContainer}>
        <StatusBar style="light" />
        <View style={styles.successBadge}>
          <Text style={styles.successIcon}>✓</Text>
        </View>
        <Text style={styles.successText}>{successMessage}</Text>
      </View>
    );
  }

  // ── Giriş Ekranı ──
  return (
    <KeyboardAvoidingView
      style={styles.loginContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="light" />

      {/* Başlık */}
      <View style={styles.headerBlock}>
        <Text style={styles.headerTitle}>KURYE GİRİŞ</Text>
        <View style={styles.headerDivider} />
      </View>

      {/* Hata Mesajı */}
      {error !== '' && (
        <View style={styles.errorBox}>
          <Text style={styles.errorIcon}>⚠</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Telefon Numarası */}
      <Text style={styles.inputLabel}>TELEFON NUMARASI</Text>
      <TextInput
        style={styles.input}
        placeholder="05XX XXX XX XX"
        placeholderTextColor="#666"
        keyboardType="phone-pad"
        autoComplete="tel"
        maxLength={15}
        value={phone}
        onChangeText={(text: string) => {
          setPhone(text);
          setError('');
        }}
        editable={!isSubmitting}
      />

      {/* PIN */}
      <Text style={styles.inputLabel}>4 HANELİ PIN</Text>
      <TextInput
        style={styles.input}
        placeholder="● ● ● ●"
        placeholderTextColor="#666"
        keyboardType="number-pad"
        secureTextEntry
        maxLength={4}
        value={pin}
        onChangeText={(text: string) => {
          setPin(text);
          setError('');
        }}
        editable={!isSubmitting}
      />

      {/* Giriş Butonu */}
      <TouchableOpacity
        style={[styles.loginButton, isSubmitting && styles.loginButtonDisabled]}
        onPress={handleLogin}
        disabled={isSubmitting}
        activeOpacity={0.7}
      >
        {isSubmitting ? (
          <View style={styles.buttonLoadingRow}>
            <ActivityIndicator size="large" color="#1A1A1A" />
            <Text style={styles.loginButtonText}>BEKLEYİNİZ...</Text>
          </View>
        ) : (
          <Text style={styles.loginButtonText}>GİRİŞ YAP</Text>
        )}
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

// ─── Stiller ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
  centeredContainer: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  loginContainer: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  // ── Başarı Ekranı ──
  successBadge: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#2E7D32',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },

  successIcon: {
    fontSize: 64,
    color: '#FFFFFF',
    fontWeight: '900',
  },

  successText: {
    color: '#4CAF50',
    fontSize: 32,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 2,
  },

  // ── Başlık ──
  headerBlock: {
    alignItems: 'center',
    marginBottom: 40,
  },

  headerTitle: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 4,
  },

  headerDivider: {
    width: 80,
    height: 4,
    backgroundColor: '#FFC107',
    marginTop: 12,
    borderRadius: 2,
  },

  // ── Hata ──
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4A0000',
    borderWidth: 2,
    borderColor: '#D32F2F',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 24,
  },

  errorIcon: {
    fontSize: 28,
    color: '#FF5252',
    marginRight: 12,
  },

  errorText: {
    color: '#FF5252',
    fontSize: 20,
    fontWeight: '800',
    flex: 1,
  },

  // ── Input ──
  inputLabel: {
    color: '#AAAAAA',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: 2,
  },

  input: {
    backgroundColor: '#1A1A1A',
    borderWidth: 2,
    borderColor: '#333333',
    borderRadius: 16,
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '700',
    paddingVertical: 22,
    paddingHorizontal: 20,
    marginBottom: 20,
    textAlign: 'center',
    letterSpacing: 3,
  },

  // ── Buton ──
  loginButton: {
    backgroundColor: '#FFC107',
    borderRadius: 16,
    paddingVertical: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    elevation: 8,
    shadowColor: '#FFC107',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },

  loginButtonDisabled: {
    backgroundColor: '#8C6D00',
    elevation: 0,
    shadowOpacity: 0,
  },

  loginButtonText: {
    color: '#1A1A1A',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 3,
  },

  buttonLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
});
