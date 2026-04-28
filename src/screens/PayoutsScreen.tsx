// QASE KURYE — HAKEDİŞLERİM EKRANI
//
// Sunucu sözleşmesi: GET /api/courier/my-payouts
// (qase-os reposu — Sprint 1 Hakediş, Faz 6).
// Kurye SADECE onaylanmış hakedişleri görür (DRAFT/CANCELLED gizli).
//
// Tasarım: kurumsal palet (#0D0D0D, #FFC107). Eldivenli kullanım için büyük
// dokunma alanı, yüksek kontrast, fontSize 26+. Pull-to-refresh.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';

const API_BASE = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/+$/, '');
const PAYOUTS_URL = `${API_BASE}/api/courier/my-payouts`;
const TOKEN_KEY = 'jwt_token';

type PayoutStatus = 'APPROVED' | 'INVOICED' | 'PAID';

interface Payout {
  id: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  totalHours: string;
  totalDeliveries: number;
  totalAmount: string;
  status: PayoutStatus;
  approvedAt: string | null;
  paidAt: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  invoiceUrl: string | null;
  invoiceStatus: string | null;
}

interface Summary {
  totalApproved: string;
  totalPaid: string;
  totalPending: string;
  count: number;
}

const STATUS_LABEL: Record<PayoutStatus, string> = {
  APPROVED: 'ONAYLI',
  INVOICED: 'FATURA OK',
  PAID: 'ÖDENDİ',
};

const STATUS_COLOR: Record<PayoutStatus, { bg: string; border: string; text: string }> = {
  APPROVED: { bg: '#1A1A1A', border: '#FFC107', text: '#FFC107' },
  INVOICED: { bg: '#1A1A1A', border: '#5B9DFF', text: '#5B9DFF' },
  PAID: { bg: '#0F2A14', border: '#4CAF50', text: '#4CAF50' },
};

const fmtTRY = (s: string) => {
  const v = parseFloat(s);
  if (isNaN(v)) return '0,00';
  return v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtDate = (iso: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export default function PayoutsScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);

  const fetchPayouts = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!token) {
        navigation.replace('Login');
        return;
      }
      const res = await fetch(PAYOUTS_URL, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${token.trim()}`,
        },
      });

      if (res.status === 401) {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        navigation.replace('Login');
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        Alert.alert('Hata', err.error || 'Hakedişler yüklenemedi');
        return;
      }
      const data = await res.json();
      setPayouts(data.payouts || []);
      setSummary(data.summary || null);
    } catch (e: any) {
      Alert.alert('Bağlantı Hatası', e.message || String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [navigation]);

  useEffect(() => {
    fetchPayouts();
  }, [fetchPayouts]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPayouts();
  };

  if (loading) {
    return (
      <View style={styles.fullScreen}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#FFC107" />
        <Text style={styles.loadingText}>HAKEDİŞLER YÜKLENİYOR...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} activeOpacity={0.7}>
          <Text style={styles.backButtonText}>{'←'} GERİ</Text>
        </TouchableOpacity>
        <Text style={styles.title}>HAKEDİŞLERİM</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFC107" />
        }
      >
        {/* Özet kartları */}
        {summary && (
          <View style={styles.summaryGrid}>
            <View style={[styles.summaryCard, { borderColor: '#4CAF50' }]}>
              <Text style={styles.summaryLabel}>ÖDENEN</Text>
              <Text style={[styles.summaryValue, { color: '#4CAF50' }]}>
                ₺{fmtTRY(summary.totalPaid)}
              </Text>
            </View>
            <View style={[styles.summaryCard, { borderColor: '#FFC107' }]}>
              <Text style={styles.summaryLabel}>BEKLEYEN</Text>
              <Text style={[styles.summaryValue, { color: '#FFC107' }]}>
                ₺{fmtTRY(summary.totalPending)}
              </Text>
            </View>
          </View>
        )}

        {/* Liste */}
        {payouts.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>HENÜZ HAKEDİŞİN YOK</Text>
            <Text style={styles.emptyText}>
              Periyot kapandığında onaylanan hakedişlerin burada listelenir.
            </Text>
          </View>
        ) : (
          payouts.map((p) => {
            const colors = STATUS_COLOR[p.status];
            return (
              <View key={p.id} style={[styles.payoutCard, { borderColor: colors.border }]}>
                {/* Üst satır: periyot + status */}
                <View style={styles.cardTopRow}>
                  <Text style={styles.periodText}>{p.periodLabel}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                    <Text style={[styles.statusBadgeText, { color: colors.text }]}>
                      {STATUS_LABEL[p.status]}
                    </Text>
                  </View>
                </View>

                {/* Tutar */}
                <Text style={styles.amountText}>₺{fmtTRY(p.totalAmount)}</Text>

                {/* Saat & Teslimat */}
                <View style={styles.statsRow}>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>SAAT</Text>
                    <Text style={styles.statValue}>{p.totalHours}</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>TESLİMAT</Text>
                    <Text style={styles.statValue}>{p.totalDeliveries}</Text>
                  </View>
                </View>

                {/* Ödeme detayı (varsa) */}
                {p.paidAt && (
                  <View style={styles.paymentInfo}>
                    <Text style={styles.paymentLabel}>ÖDEME</Text>
                    <Text style={styles.paymentText}>
                      {fmtDate(p.paidAt)}
                      {p.paymentReference ? ` · ${p.paymentReference}` : ''}
                    </Text>
                  </View>
                )}

                {/* Fatura bilgisi (varsa) */}
                {p.invoiceNumber && (
                  <View style={styles.invoiceInfo}>
                    <Text style={styles.invoiceLabel}>FATURA</Text>
                    <Text style={styles.invoiceText}>
                      No: {p.invoiceNumber}
                      {p.invoiceDate ? ` · ${fmtDate(p.invoiceDate)}` : ''}
                    </Text>
                  </View>
                )}
              </View>
            );
          })
        )}

        {/* Bilgilendirme — V2 hatırlatması */}
        <View style={styles.footerInfo}>
          <Text style={styles.footerInfoText}>
            E-fatura uygulamadan kesim özelliği yakında eklenecek.{'\n'}
            Şimdilik faturayı kendi sisteminden kes ve muhasebeye gönder.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  fullScreen: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#FFC107',
    fontSize: 18,
    marginTop: 24,
    fontWeight: '700',
    letterSpacing: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 18,
    backgroundColor: '#0D0D0D',
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 80,
  },
  backButtonText: {
    color: '#FFC107',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 3,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 60,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 14,
  },
  summaryLabel: {
    color: '#AAAAAA',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 6,
  },
  summaryValue: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 1,
  },
  emptyBox: {
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    padding: 32,
    marginTop: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333333',
  },
  emptyTitle: {
    color: '#FFC107',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 8,
  },
  emptyText: {
    color: '#AAAAAA',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  payoutCard: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 18,
    marginBottom: 14,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  periodText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  amountText: {
    color: '#FFC107',
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 1,
    marginVertical: 8,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  statLabel: {
    color: '#666666',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 4,
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  paymentInfo: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#333333',
  },
  paymentLabel: {
    color: '#4CAF50',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 4,
  },
  paymentText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  invoiceInfo: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#333333',
  },
  invoiceLabel: {
    color: '#5B9DFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 4,
  },
  invoiceText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  footerInfo: {
    marginTop: 20,
    padding: 14,
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#FFC107',
  },
  footerInfoText: {
    color: '#AAAAAA',
    fontSize: 12,
    lineHeight: 18,
    fontStyle: 'italic',
  },
});
