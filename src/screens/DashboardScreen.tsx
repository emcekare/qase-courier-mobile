import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Linking,
  Alert,
  useWindowDimensions,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';

type CourierStatus = 'on_duty' | 'on_break' | 'off_duty' | null;

interface Order {
  id: string | number;
  customerName: string;
  paymentMethod: string;
  totalAmount: number | string;
  deliveryAddress: string;
  latitude?: number | null;
  longitude?: number | null;
}

interface CourierSession {
  startTime: string; // Backend'den startTime olarak çekiliyor
  totalDeliveries: number;
  cashTotal: number;
  creditCardTotal: number;
}

const API_BASE = process.env.EXPO_PUBLIC_API_URL;
const STATUS_API_URL = `${API_BASE}/courier/status`;
const ORDERS_API_URL = `${API_BASE}/courier/orders`;
const SESSION_API_URL = `${API_BASE}/courier/session/current`;
const TOKEN_KEY = 'jwt_token';

export default function DashboardScreen({ navigation }: any) {
  const { width, height } = useWindowDimensions();

  // ── Statü State'leri ──
  const [currentStatus, setCurrentStatus] = useState<CourierStatus>(null);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [isWaitingInQueue, setIsWaitingInQueue] = useState<boolean>(false);

  // ── Özet / Session State'leri ──
  const [sessionData, setSessionData] = useState<CourierSession | null>(null);

  // ── Sipariş State'leri ──
  const [orders, setOrders] = useState<Order[]>([]);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // ── YARDIMCI FONKSİYON ──
  const formatTime = (dateStr: string) => {
    if (!dateStr) return '--:--';
    if (dateStr.includes('T')) {
      const date = new Date(dateStr);
      return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    }
    return dateStr;
  };

  // ── API İSTEKLERİ ──
  const fetchCurrentSession = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!token) return;

      const response = await fetch(SESSION_API_URL, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setSessionData(data?.session || data || null);
      }
    } catch {
      // Sessiz hata
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      setError('');
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!token) return;

      const response = await fetch(ORDERS_API_URL, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Siparişler alınamadı.');
      }

      const data = await response.json();
      const fetchedOrders = data?.orders || data || [];
      setOrders(fetchedOrders);
      if (fetchedOrders.length > 0) {
        setIsWaitingInQueue(false);
      }
    } catch (err: any) {
      setError('Siparişler güncellenirken hata oluştu.');
    }
  }, []);

  const updateStatus = async (newStatus: CourierStatus) => {
    if (!newStatus || newStatus === currentStatus) return;

    setIsUpdating(true);
    setError('');

    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!token) throw new Error('Oturum bulunamadı. Lütfen tekrar giriş yapın.');

      const response = await fetch(STATUS_API_URL, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        throw new Error('Durum güncellenirken hata oluştu.');
      }

      setCurrentStatus(newStatus);

      await fetchCurrentSession();
      if (newStatus === 'on_duty') {
        await fetchOrders();
      } else {
        setOrders([]);
        setIsWaitingInQueue(false);
      }

    } catch (err: any) {
      setError(err.message || 'Bağlantı hatası.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleBackToShop = async () => {
    setIsUpdating(true);
    setError('');

    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!token) throw new Error('Oturum bulunamadı. Lütfen tekrar giriş yapın.');

      const response = await fetch(STATUS_API_URL, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ status: currentStatus, isBackToShop: true }),
      });

      if (!response.ok) {
        throw new Error('Sıraya girme işlemi başarısız.');
      }

      await fetchCurrentSession();
      setIsWaitingInQueue(true);
    } catch (err: any) {
      setError(err.message || 'Bağlantı hatası.');
    } finally {
      setIsUpdating(false);
    }
  };

  const completeOrderSimulation = async (orderId: string | number) => {
    setIsUpdating(true);
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      const url = `${process.env.EXPO_PUBLIC_API_URL}/courier/orders/${orderId}/complete`;

      const response = await fetch(url, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        await fetchOrders();
        await fetchCurrentSession();
      } else {
        throw new Error('Siparişi düşürürken hata oluştu.');
      }
    } catch (err: any) {
      setError('Simülasyon başarısız: ' + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  useEffect(() => {
    fetchCurrentSession();
    if (currentStatus === 'on_duty') {
      fetchOrders();
    } else {
      setOrders([]);
    }
  }, [currentStatus, fetchOrders, fetchCurrentSession]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await fetchCurrentSession();
    if (currentStatus === 'on_duty') {
      await fetchOrders();
    }
    setIsRefreshing(false);
  };

  const handleLogout = async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    navigation.replace('Login');
  };

  const openMaps = (order: Order) => {
    if (order.latitude && order.longitude) {
      const url = `https://maps.google.com/?q=${order.latitude},${order.longitude}`;
      Linking.openURL(url);
    } else {
      const url = `https://maps.google.com/?q=${encodeURIComponent(order.deliveryAddress)}`;
      Linking.openURL(url);
    }
  };

  const handlePavoPayment = (order: Order) => {
    try {
      Linking.sendIntent('com.pavo.ACTION_PAYMENT', [
        { key: 'amount', value: String(order.totalAmount) },
        { key: 'orderId', value: String(order.id) },
        { key: 'paymentType', value: order.paymentMethod }
      ]);
    } catch (e) {
      Alert.alert('Hata', 'Pavo başlatılamadı.');
    }
  };

  // ── RENDER FONKSİYONLARI (CONTEXTUAL UI) ──

  const renderTopBar = () => {
    if (!sessionData) return null;
    return (
      <View style={styles.topBar}>
        <View style={styles.topBarStat}>
          <Text style={styles.topBarLabel}>BAŞLANGIÇ</Text>
          <Text style={styles.topBarValue}>{formatTime(sessionData.startTime)}</Text>
        </View>
        <View style={styles.topBarStat}>
          <Text style={styles.topBarLabel}>PAKET</Text>
          <Text style={[styles.topBarValue, { color: '#FFC107' }]}>{sessionData.totalDeliveries}</Text>
        </View>
        <View style={styles.topBarStat}>
          <Text style={styles.topBarLabel}>NAKİT</Text>
          <Text style={[styles.topBarValue, styles.cashColor]}>{sessionData.cashTotal}₺</Text>
        </View>
        <View style={styles.topBarStat}>
          <Text style={styles.topBarLabel}>KART</Text>
          <Text style={[styles.topBarValue, styles.creditColor]}>{sessionData.creditCardTotal}₺</Text>
        </View>
      </View>
    );
  };

  const renderOffDutyContext = () => (
    <View style={styles.fillCenter}>
      <TouchableOpacity
        style={styles.massiveGreenButton}
        onPress={() => updateStatus('on_duty')}
        disabled={isUpdating}
        activeOpacity={0.8}
      >
        <Text style={styles.massiveButtonText}>AKTİF OL{'\n'}(MESAİYE BAŞLA)</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutTrigger} onPress={handleLogout} activeOpacity={0.6}>
        <Text style={styles.logoutTriggerText}>SİSTEMDEN ÇIKIŞ YAP</Text>
      </TouchableOpacity>
    </View>
  );

  const renderBreakContext = () => (
    <View style={styles.fillCenter}>
      <View style={styles.breakStatusBox}>
        <Text style={styles.breakStatusText}>MOLA DURUMUNDASINIZ</Text>
      </View>

      <TouchableOpacity
        style={styles.massiveGreenButton}
        onPress={() => updateStatus('on_duty')}
        disabled={isUpdating}
        activeOpacity={0.8}
      >
        <Text style={styles.massiveButtonText}>MESAİYE DÖN</Text>
      </TouchableOpacity>

      <View style={styles.idleBottomRowContainer}>
        <TouchableOpacity style={[styles.thinButton, styles.endShiftButtonColor]} onPress={() => updateStatus('off_duty')} disabled={isUpdating}>
          <Text style={styles.thinButtonText}>MESAİYİ BİTİR</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderIdleContext = () => (
    <ScrollView
      contentContainerStyle={styles.idleScrollContent}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#FFC107" />}
    >
      <View style={styles.idleCenter}>
        {isWaitingInQueue ? (
          <View style={styles.queuePanel}>
            <Text style={styles.queuePanelText}>KUYRUKTA BEKLENİYOR...{'\n'}AKTİF GÖREV BEKLENİYOR</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.massiveBlueButton}
            onPress={handleBackToShop}
            disabled={isUpdating}
            activeOpacity={0.8}
          >
            <Text style={styles.massiveButtonText}>DÜKKANA DÖNDÜM{'\n'}/ SIRAYA GİR</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.idleBottomRowContainer}>
        <TouchableOpacity style={[styles.thinButton, styles.breakButtonColor]} onPress={() => updateStatus('on_break')} disabled={isUpdating}>
          <Text style={styles.thinButtonText}>MOLAYA GİR</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.thinButton, styles.endShiftButtonColor]} onPress={() => updateStatus('off_duty')} disabled={isUpdating}>
          <Text style={styles.thinButtonText}>MESAİYİ BİTİR</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const renderActiveContext = () => (
    <FlatList
      data={orders}
      keyExtractor={(item, index) => item.id ? String(item.id) : String(index)}
      contentContainerStyle={styles.activeListContent}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#FFC107" />}
      renderItem={({ item }) => (
        <View style={[styles.activeOrderCard, { minHeight: height * 0.75 }]}>
          <View style={styles.orderCardHeader}>
            <Text style={styles.orderCustomerName}>{item.customerName}</Text>
            <Text style={styles.orderPaymentInfo}>{item.paymentMethod?.toUpperCase()} - {item.totalAmount} TL</Text>
          </View>

          <View style={styles.orderCardBody}>
            <Text style={styles.orderAddressText}>{item.deliveryAddress}</Text>
          </View>

          <View style={styles.orderCardFooter}>
            <TouchableOpacity style={styles.mapButtonFlex} onPress={() => openMaps(item)}>
              <Text style={styles.mapButtonText}>YOL TARİFİ AL</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.pavoButtonFlex}
              onPress={() => handlePavoPayment(item)}
              onLongPress={() => completeOrderSimulation(item.id)}
            >
              <Text style={styles.pavoButtonText}>TAHSİLAT YAP</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    />
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {renderTopBar()}

      {/* Global Alerts */}
      {error !== '' && (
        <View style={styles.globalAlert}>
          <Text style={styles.globalAlertText}>{error}</Text>
        </View>
      )}
      {isUpdating && (
        <View style={styles.globalAlertWarning}>
          <ActivityIndicator size="small" color="#1A1A1A" style={{ marginRight: 10 }} />
          <Text style={styles.globalAlertTextDark}>İşlem Yapılıyor...</Text>
        </View>
      )}

      {/* Context Switcher */}
      <View style={styles.contextualContainer}>
        {(currentStatus === 'off_duty' || currentStatus === null) && renderOffDutyContext()}
        {currentStatus === 'on_break' && renderBreakContext()}
        {currentStatus === 'on_duty' && orders.length === 0 && renderIdleContext()}
        {currentStatus === 'on_duty' && orders.length > 0 && renderActiveContext()}
      </View>
    </SafeAreaView>
  );
}

// ─── STİLLER (Responsive & Flexbox) ──────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  contextualContainer: {
    flex: 1,
  },

  // ── Top Bar Özeti (Sabit ve Şık) ──
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#151515',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  topBarStat: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarLabel: {
    color: '#888',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 4,
    letterSpacing: 1,
  },
  topBarValue: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
  },
  cashColor: { color: '#00E676' },
  creditColor: { color: '#29B6F6' },

  // ── Global Uyarılar ──
  globalAlert: {
    backgroundColor: '#D32F2F',
    padding: 10,
    alignItems: 'center',
  },
  globalAlertText: { color: '#FFF', fontWeight: 'bold' },
  globalAlertWarning: {
    backgroundColor: '#FFC107',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  globalAlertTextDark: { color: '#1A1A1A', fontWeight: 'bold', fontSize: 16 },

  // ── Off Duty Context ──
  fillCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  logoutTrigger: {
    padding: 20,
    marginTop: 40,
  },
  logoutTriggerText: {
    color: '#666',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 2,
  },

  // ── Break Context Özel ──
  breakStatusBox: {
    marginBottom: 40,
    padding: 16,
    backgroundColor: '#3E2723',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#795548',
  },
  breakStatusText: {
    color: '#FFB300',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2,
  },

  // ── Idle Context ──
  idleScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 30,
  },
  idleCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  idleBottomRowContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 40,
  },

  // ── Sahada (Active) Context ──
  activeListContent: {
    flexGrow: 1,
    padding: 16,
  },
  activeOrderCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 24,
    borderWidth: 3,
    borderColor: '#333333',
    padding: 24,
    marginBottom: 24,
    flexDirection: 'column',
    // Yükseklik dışarıdan minHeight ile dinamik ayarlanıyor (%75)
  },
  orderCardHeader: {
    marginBottom: 16,
  },
  orderCustomerName: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 8,
  },
  orderPaymentInfo: {
    color: '#00E676',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 1,
  },
  orderCardBody: {
    flex: 1, // Ekranın kalan boşluğunu esneterek adresin etrafında güvenli alan sağlar
    justifyContent: 'center',
  },
  orderAddressText: {
    color: '#E0E0E0',
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 36,
  },
  orderCardFooter: {
    marginTop: 16,
    flexDirection: 'column',
  },

  // ── Dynamic & Devasa Butonlar ──
  massiveGreenButton: {
    width: '100%',
    flex: 0.5, // Ekranın yarısını kaplar
    backgroundColor: '#1B5E20',
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#2E7D32',
    elevation: 10,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  massiveBlueButton: {
    width: '100%',
    flex: 0.5, // Ekranın yarısını kaplar
    backgroundColor: '#0D47A1',
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#1976D2',
    elevation: 10,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  queuePanel: {
    width: '100%',
    flex: 0.5, // Ekranın yarısını kaplar
    backgroundColor: '#1B5E20',
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#2E7D32',
    elevation: 8,
  },
  massiveButtonText: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
    lineHeight: 48,
  },
  queuePanelText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
    lineHeight: 42,
  },

  // ── Alt Seçenek Butonları (İnce, Yan Yana) ──
  thinButton: {
    flex: 1, // Yan yana eşit yer kaplarlar
    paddingVertical: 24, // Yeterli dokunma alanı ama kalın değil
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    marginHorizontal: 8,
  },
  breakButtonColor: {
    backgroundColor: '#E65100',
    borderColor: '#EF6C00',
  },
  endShiftButtonColor: {
    backgroundColor: '#424242',
    borderColor: '#616161',
  },
  thinButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // ── Sipariş Kartı Aksiyon Butonları ──
  mapButtonFlex: {
    width: '100%',
    backgroundColor: '#1565C0',
    paddingVertical: 24,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#1E88E5',
    elevation: 4,
  },
  mapButtonText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 2,
  },
  pavoButtonFlex: {
    width: '100%',
    backgroundColor: '#FFC107',
    paddingVertical: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFB300',
    elevation: 6,
  },
  pavoButtonText: {
    color: '#1A1A1A',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 2,
  },
});
