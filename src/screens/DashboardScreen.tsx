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

const STATUS_API_URL = 'http://192.168.1.117:3000/api/courier/status';
const ORDERS_API_URL = 'http://192.168.1.117:3000/api/courier/orders';
const SESSION_API_URL = 'http://192.168.1.117:3000/api/courier/session/current';
const TOKEN_KEY = 'jwt_token';

export default function DashboardScreen({ navigation }: any) {
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
    return dateStr; // Sadece "09:30" olarak geliyorsa direkt döndürür
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
      // Özet panele hata bastırarak siparişi/akışı bozmayalım
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
        throw new Error('Durum güncellenirken hata oluştu. Lütfen tekrar deneyin.');
      }

      // Başarılı (200 OK)
      setCurrentStatus(newStatus);
      
      // Statü her güncellendiğinde hem API'yi hem Session Panelini tazele
      await fetchCurrentSession();
      if (newStatus === 'on_duty') {
        await fetchOrders();
      } else {
        setOrders([]);
        setIsWaitingInQueue(false);
      }
      
    } catch (err: any) {
      setError(err.message || 'Bağlantı hatası. Ağ bağlantınızı kontrol edin.');
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
        throw new Error('Sıraya girme işlemi başarısız. Lütfen tekrar deneyin.');
      }

      await fetchCurrentSession(); // Kasa vs güncellenmesi için
      setIsWaitingInQueue(true);
    } catch (err: any) {
      setError(err.message || 'Bağlantı hatası. Ağ bağlantınızı kontrol edin.');
    } finally {
      setIsUpdating(false);
    }
  };

  // ── GİZLİ SİMÜLASYON API (PAVO Uzun Basıldığında) ──
  const completeOrderSimulation = async (orderId: string | number) => {
    setIsUpdating(true);
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      const url = `http://192.168.1.117:3000/api/courier/orders/${orderId}/complete`;
      
      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        Alert.alert('Simülasyon Başarılı', 'Sipariş test modunda tamamlandı (200 OK).');
        await fetchOrders(); // Siparişi düştükten sonra ekranı yenile
        await fetchCurrentSession(); // Kasayı yenile
      } else {
        throw new Error('Siparişi düşürürken (Complete) hata oluştu.');
      }
    } catch (err: any) {
      setError('Simülasyon başarısız: ' + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  // ── ETKİLEŞİMLER (EFFECTS) ──
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

  // ── DİĞER FONKSİYONLAR ──

  const handleLogout = async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    navigation.replace('Login');
  };

  const openMaps = (order: Order) => {
    if (order.latitude && order.longitude) {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${order.latitude},${order.longitude}`;
      Linking.openURL(url);
    } else {
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.deliveryAddress)}`;
      Linking.openURL(url);
    }
  };

  const handlePavoPayment = (order: Order) => {
    try {
      // Android bazlı SendIntent ile Pavo/Pos Entegrasyonu eylemi gönderiyoruz
      Linking.sendIntent('com.pavo.ACTION_PAYMENT', [
        { key: 'amount', value: String(order.totalAmount) },
        { key: 'orderId', value: String(order.id) },
        { key: 'paymentType', value: order.paymentMethod }
      ]);
    } catch (e) {
      Alert.alert('Hata', 'Pavo başlatılamadı. Android Linking entegrasyonunu kontrol ediniz.');
    }
  };

  const getOpacity = (status: CourierStatus) => {
    if (currentStatus === null) return 1;
    return currentStatus === status ? 1 : 0.4;
  };

  // ── RENDER (DİZİLİM) YARDIMCILARI ──

  // Sipariş Kartı
  const renderOrderCard = ({ item }: { item: Order }) => (
    <View style={styles.orderCard}>
      <Text style={styles.customerName}>{item.customerName}</Text>
      
      <Text style={styles.paymentInfo}>
        {item.paymentMethod?.toUpperCase()} - {item.totalAmount} TL
      </Text>
      
      <Text style={styles.addressText}>{item.deliveryAddress}</Text>

      {/* Aksiyon Butonları (Yol Tarifi ve Altında Devasa Tahsilat Yap Butonu) */}
      <View style={styles.actionsColumn}>
        <TouchableOpacity 
          style={[styles.mapButton, styles.actionButton]} 
          onPress={() => openMaps(item)}
          activeOpacity={0.7}
        >
          <Text style={styles.mapButtonText}>YOL TARİFİ AL</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.pavoButton, styles.actionButton]} 
          onPress={() => handlePavoPayment(item)}
          onLongPress={() => completeOrderSimulation(item.id)}
          activeOpacity={0.8}
        >
          <Text style={styles.pavoButtonText}>TAHSİLAT YAP</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Üst Kısım (Vardiya Paneli, Statüler vb.)
  const renderHeader = () => (
    <View style={styles.headerContainer}>
      {/* Vardiya Özet Paneli (Top Bar) */}
      {sessionData && (
        <View style={styles.sessionPanel}>
          <View style={styles.sessionTopRow}>
            <Text style={styles.sessionBaseText}>Başlangıç: <Text style={styles.sessionBoldStr}>{formatTime(sessionData.startTime)}</Text></Text>
            <Text style={styles.sessionBaseText}>Teslimat: <Text style={styles.sessionBoldStr}>{sessionData.totalDeliveries}</Text></Text>
          </View>
          <View style={styles.sessionBottomRow}>
            <Text style={[styles.sessionMoneyText, styles.cashColor]}>Nakit: {sessionData.cashTotal || 0} TL</Text>
            <Text style={[styles.sessionMoneyText, styles.creditColor]}>K. Kartı: {sessionData.creditCardTotal || 0} TL</Text>
          </View>
        </View>
      )}

      {/* Başlık */}
      <View style={styles.headerBlock}>
        <Text style={styles.headerTitle}>OPERASYON</Text>
      </View>

      {/* Hata Mesajı */}
      {error !== '' && (
        <View style={styles.errorBox}>
          <Text style={styles.errorIcon}>⚠</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Loading Göstergesi */}
      {isUpdating && (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#FFC107" />
          <Text style={styles.loadingText}>SİSTEMLE EŞLEŞİLİYOR...</Text>
        </View>
      )}

      {/* Statü Butonları Alanı */}
      <View style={styles.buttonsContainer}>
        <TouchableOpacity
          style={[
            styles.statusButton,
            styles.onDutyButton,
            { opacity: getOpacity('on_duty') },
            currentStatus === 'on_duty' && styles.activeSelection,
          ]}
          onPress={() => updateStatus('on_duty')}
          disabled={isUpdating}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>AKTİF</Text>
          <Text style={styles.buttonSubText}>ÇALIŞIYOR</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.statusButton,
            styles.onBreakButton,
            { opacity: getOpacity('on_break') },
            currentStatus === 'on_break' && styles.activeSelection,
          ]}
          onPress={() => updateStatus('on_break')}
          disabled={isUpdating}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>MOLADA</Text>
          <Text style={styles.buttonSubText}>DİNLENİYOR</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.statusButton,
            styles.offDutyButton,
            { opacity: getOpacity('off_duty') },
            currentStatus === 'off_duty' && styles.activeSelection,
          ]}
          onPress={() => updateStatus('off_duty')}
          disabled={isUpdating}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>PASİF</Text>
          <Text style={styles.buttonSubText}>MESAİ DIŞI</Text>
        </TouchableOpacity>
      </View>

      {/* Aktif Siparişler Başlığı */}
      {currentStatus === 'on_duty' && (
        <View style={styles.ordersHeader}>
          <Text style={styles.ordersTitle}>AKTİF SİPARİŞLER</Text>
          <View style={styles.ordersDivider} />
        </View>
      )}
    </View>
  );

  // Alt Kısım (Çıkış Yap Butonu)
  const renderFooter = () => (
    <View style={styles.footerContainer}>
      <TouchableOpacity 
        style={styles.logoutButton} 
        onPress={handleLogout}
        disabled={isUpdating}
        activeOpacity={0.7}
      >
        <Text style={styles.logoutText}>ÇIKIŞ YAP</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <FlatList
        data={orders}
        keyExtractor={(item, index) => item.id ? String(item.id) : String(index)}
        renderItem={renderOrderCard}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        contentContainerStyle={styles.flatListContent}
        refreshControl={
          <RefreshControl 
            refreshing={isRefreshing} 
            onRefresh={onRefresh} 
            colors={['#FFC107']}
            tintColor="#FFC107"
          />
        }
        ListEmptyComponent={
          currentStatus === 'on_duty' ? (
            <View style={styles.emptyListContainer}>
              {isWaitingInQueue ? (
                <View style={styles.queuePanel}>
                  <Text style={styles.queuePanelText}>KUYRUKTA BEKLENİYOR...{'\n'}AKTİF GÖREV BEKLENİYOR</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.emptyText}>Henüz aktif sipariş bulunmuyor, sayfayı aşağı çekerek yenileyebilirsiniz.</Text>
                  <TouchableOpacity
                    style={styles.backToShopButton}
                    onPress={handleBackToShop}
                    disabled={isUpdating}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.backToShopButtonText}>DÜKKANA DÖNDÜM{'\n'}/ SIRAYA GİR</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          ) : null
        }
      />
    </View>
  );
}

// ─── STİLLER ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  flatListContent: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  
  // ── Vardiya Özet Paneli ──
  sessionPanel: {
    backgroundColor: '#1E1E1E',
    borderWidth: 2,
    borderColor: '#333333',
    borderRadius: 16,
    padding: 20,
    marginBottom: 32, // Statü butonlarına mesafeli, okunaklı ayırım
  },
  sessionTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sessionBaseText: {
    color: '#AAAAAA',
    fontSize: 16,
    fontWeight: '600',
  },
  sessionBoldStr: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  sessionBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 16,
    borderTopWidth: 2,
    borderTopColor: '#333333',
  },
  sessionMoneyText: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1,
  },
  cashColor: {
    color: '#00E676', // Canlı yeşil, yüksek okunabilirlik
  },
  creditColor: {
    color: '#29B6F6', // Canlı açık mavi/camgöbeği
  },

  // ── Header Component ──
  headerContainer: {
    marginBottom: 10,
  },
  headerBlock: {
    alignItems: 'center',
    marginBottom: 24,
  },
  headerTitle: {
    color: '#FFC107',
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: 4,
  },

  // ── Hata Mesajı ──
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4A0000',
    borderWidth: 2,
    borderColor: '#D32F2F',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  errorIcon: {
    fontSize: 28,
    color: '#FF5252',
    marginRight: 12,
  },
  errorText: {
    color: '#FF5252',
    fontSize: 18,
    fontWeight: '800',
    flex: 1,
  },

  // ── Yükleniyor Uyarısı ──
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    paddingVertical: 16,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#FFC107',
  },
  loadingText: {
    color: '#FFC107',
    fontSize: 18,
    fontWeight: '800',
    marginLeft: 16,
    letterSpacing: 1,
  },

  // ── Statü Butonları Alanı ──
  buttonsContainer: {
    justifyContent: 'center',
  },
  statusButton: {
    borderRadius: 24,
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 4,
    borderColor: 'transparent',
    elevation: 8,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  onDutyButton: {
    backgroundColor: '#1B5E20',
  },
  onBreakButton: {
    backgroundColor: '#E65100',
  },
  offDutyButton: {
    backgroundColor: '#424242',
  },
  activeSelection: {
    borderColor: '#FFFFFF', 
    borderWidth: 6,
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.8,
    shadowRadius: 20,
    transform: [{ scale: 1.02 }],
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: 4,
  },
  buttonSubText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 8,
    opacity: 0.9,
    letterSpacing: 2,
  },

  // ── Aktif Siparişler Başlık ──
  ordersHeader: {
    marginTop: 40,
    marginBottom: 10,
    alignItems: 'center',
  },
  ordersTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 3,
  },
  ordersDivider: {
    width: 60,
    height: 4,
    backgroundColor: '#1B5E20',
    marginTop: 10,
    borderRadius: 2,
  },

  // ── List Empty Durumu ──
  emptyListContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  emptyText: {
    color: '#AAAAAA',
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 30,
    fontWeight: '600',
    lineHeight: 30,
  },
  backToShopButton: {
    backgroundColor: '#0D47A1', // Göz alıcı koyu mavi
    width: '100%',
    borderRadius: 24,
    paddingVertical: 40, // Devasa buton
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#1976D2',
    elevation: 8,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    marginBottom: 40,
  },
  backToShopButtonText: {
    color: '#FFFFFF',
    fontSize: 32, // Devasa metin
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
    lineHeight: 46,
  },
  queuePanel: {
    backgroundColor: '#1B5E20', // Askeri yeşil
    width: '100%',
    borderRadius: 24,
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#2E7D32',
    elevation: 8,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    marginBottom: 40,
  },
  queuePanelText: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
    lineHeight: 40,
  },

  // ── Sipariş Kartları (Military-Grade) ──
  orderCard: {
    backgroundColor: '#1E1E1E',
    borderWidth: 3,
    borderColor: '#333333',
    borderRadius: 16,
    padding: 24,
    marginTop: 24,
    marginBottom: 32, // Altın Kurallar gereği siparişler arası büyük boşluk
  },
  customerName: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 12,
  },
  paymentInfo: {
    color: '#00E676', 
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 16,
  },
  addressText: {
    color: '#E0E0E0',
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 32,
    marginBottom: 24,
  },
  
  // ── Aksiyon Butonları (Yol Tarifi ve Pavo - ALTA ALTA) ──
  actionsColumn: {
    flexDirection: 'column',
    marginTop: 8,
  },
  actionButton: {
    width: '100%',
    borderRadius: 12,
    paddingVertical: 24, // Eldivenle basılabilecek ekstra büyük yükseklik
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    elevation: 4,
    marginBottom: 16,
  },
  mapButton: {
    backgroundColor: '#1565C0',
    borderColor: '#1E88E5',
  },
  mapButtonText: {
    color: '#FFFFFF',
    fontSize: 24, // Artık tam genişlikte, fontu iyice büyütebiliriz
    fontWeight: '900',
    letterSpacing: 2,
  },
  pavoButton: {
    backgroundColor: '#FFC107', // Amber / Sarı
    borderColor: '#FFB300',
    marginBottom: 0, // Son eleman olduğu için alt marja gerek yok
  },
  pavoButtonText: {
    color: '#1A1A1A', // Yüksek kontrastlı siyah metin
    fontSize: 26, // "TAHSİLAT" en önemli buton oldu
    fontWeight: '900',
    letterSpacing: 2,
  },

  // ── Footer Component (Çıkış Yap Butonu) ──
  footerContainer: {
    marginTop: 40,
  },
  logoutButton: {
    backgroundColor: '#D32F2F', 
    borderRadius: 16,
    paddingVertical: 26, 
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#B71C1C',
  },
  logoutText: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 3,
  },
});
