import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { BarChart, PieChart } from "react-native-chart-kit";

const SESSIONS_KEY = "@focus_sessions_v1";
const screenWidth = Dimensions.get("window").width;

type FocusSession = {
  id: string;
  category: string;
  durationSeconds: number;
  distractions: number;
  startTime: string; // ISO
  endTime: string; // ISO
  date: string; // YYYY-MM-DD
};

type Last7DayItem = {
  date: string; // YYYY-MM-DD
  label: string; // 02/12 gibi
  totalSeconds: number;
};

export default function ReportsScreen() {
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [loading, setLoading] = useState(true);

  const [todayTotalSeconds, setTodayTotalSeconds] = useState(0);
  const [allTimeTotalSeconds, setAllTimeTotalSeconds] = useState(0);
  const [totalDistractions, setTotalDistractions] = useState(0);
  const [last7Days, setLast7Days] = useState<Last7DayItem[]>([]);
  const [categoryTotals, setCategoryTotals] = useState<
    { category: string; totalSeconds: number }[]
  >([]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (seconds === 0) return "0 dk";
    if (m === 0) return `${s} sn`;
    if (s === 0) return `${m} dk`;
    return `${m} dk ${s} sn`;
  };

  const computeStats = (items: FocusSession[]) => {
    const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // Bugün toplam süre
    const todaySessions = items.filter((s) => s.date === todayStr);
    const todaySeconds = todaySessions.reduce(
      (sum, s) => sum + s.durationSeconds,
      0
    );
    setTodayTotalSeconds(todaySeconds);

    // Tüm zamanların toplam süresi
    const allTimeSeconds = items.reduce(
      (sum, s) => sum + s.durationSeconds,
      0
    );
    setAllTimeTotalSeconds(allTimeSeconds);

    // Toplam dikkat dağınıklığı
    const allDistractions = items.reduce(
      (sum, s) => sum + s.distractions,
      0
    );
    setTotalDistractions(allDistractions);

    // Son 7 gün
    const last7: Last7DayItem[] = [];
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const label = `${d.getDate().toString().padStart(2, "0")}/${(
        d.getMonth() + 1
      )
        .toString()
        .padStart(2, "0")}`;

      const dayTotal = items
        .filter((s) => s.date === dateStr)
        .reduce((sum, s) => sum + s.durationSeconds, 0);

      last7.push({ date: dateStr, label, totalSeconds: dayTotal });
    }

    setLast7Days(last7);

    // Kategorilere göre toplam süre
    const categoryMap = new Map<string, number>();
    for (const s of items) {
      const prev = categoryMap.get(s.category) ?? 0;
      categoryMap.set(s.category, prev + s.durationSeconds);
    }

    const categoryArray = Array.from(categoryMap.entries()).map(
      ([category, totalSeconds]) => ({ category, totalSeconds })
    );
    setCategoryTotals(categoryArray);
  };

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await AsyncStorage.getItem(SESSIONS_KEY);
      const parsed: FocusSession[] = raw ? JSON.parse(raw) : [];
      setSessions(parsed);
      computeStats(parsed);
    } catch (err) {
      console.warn("Seanslar okunurken hata:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSessions();
    }, [loadSessions])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8 }}>Veriler yükleniyor...</Text>
      </View>
    );
  }

  if (sessions.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>
          Henüz kayıtlı seans yok. Ana ekrandan bir odaklanma seansı başlat.
        </Text>
      </View>
    );
  }

  // ---- Chart verileri ----

  // Son 7 gün BarChart verisi (dakika cinsinden gösterelim)
  const barChartData = {
    labels: last7Days.map((d) => d.label),
    datasets: [
      {
        data: last7Days.map((d) => Number((d.totalSeconds / 60).toFixed(1))), // dakika
      },
    ],
  };

  // Kategori PieChart verisi
  const totalCategorySeconds = categoryTotals.reduce(
    (sum, c) => sum + c.totalSeconds,
    0
  );

  const pieChartData = categoryTotals.map((item, index) => {
    const percentage =
      totalCategorySeconds === 0
        ? 0
        : (item.totalSeconds / totalCategorySeconds) * 100;

    // Basit renk paleti
    const colors = ["#2e7d32", "#1565c0", "#f9a825", "#6a1b9a", "#d32f2f"];
    const color = colors[index % colors.length];

    return {
      name: item.category,
      population: Number(percentage.toFixed(1)), // PieChart için değer
      color,
      legendFontColor: "#333",
      legendFontSize: 12,
    };
  });

  const chartConfig = {
    backgroundGradientFrom: "#ffffff",
    backgroundGradientTo: "#ffffff",
    decimalPlaces: 1,
    color: (opacity = 1) => `rgba(46, 125, 50, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
    barPercentage: 0.6,
    propsForBackgroundLines: {
      strokeDasharray: "", // düz çizgi
    },
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 24 }}
    >
      <Text style={styles.title}>Raporlar & İstatistikler</Text>

      {/* Genel İstatistikler */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Genel İstatistikler</Text>

        <View style={styles.statsCard}>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Bugün Toplam Odaklanma Süresi</Text>
            <Text style={styles.statValue}>
              {formatDuration(todayTotalSeconds)}
            </Text>
          </View>

          <View style={styles.separator} />

          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Tüm Zamanların Toplam Süresi</Text>
            <Text style={styles.statValue}>
              {formatDuration(allTimeTotalSeconds)}
            </Text>
          </View>

          <View style={styles.separator} />

          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Toplam Dikkat Dağınıklığı</Text>
            <Text style={styles.statValue}>{totalDistractions}</Text>
          </View>
        </View>
      </View>

      {/* Son 7 Gün Bar Chart */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Son 7 Gün Odaklanma Süreleri</Text>

        <View style={styles.card}>
          <Text style={styles.chartSubtitle}>
            (Dakika cinsinden, gün bazında)
          </Text>
          <BarChart
            data={barChartData}
            width={screenWidth - 40} // padding'i hesaba kattık
            height={220}
            fromZero
            yAxisLabel=""  
            yAxisSuffix=" dk"
            chartConfig={chartConfig}
            style={{ marginTop: 8, borderRadius: 12 }}
          />
        </View>
      </View>

      {/* Kategori Pie Chart */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Kategorilere Göre Dağılım</Text>

        <View style={styles.card}>
          {pieChartData.length === 0 || totalCategorySeconds === 0 ? (
            <Text style={styles.helperText}>
              Henüz kategori verisi yok. Birkaç seans kaydedince burada bir
              pasta grafik göreceksin.
            </Text>
          ) : (
            <>
              <Text style={styles.chartSubtitle}>(Yüzde dağılım)</Text>
              <PieChart
                data={pieChartData}
                width={screenWidth - 40}
                height={220}
                accessor="population"
                backgroundColor="transparent"
                paddingLeft="10"
                chartConfig={chartConfig}
                absolute={false}
              />
            </>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    backgroundColor: "#ffffff",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#ffffff",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 20,
    color: "#111",
    textAlign: "center",
  },
  emptyText: {
    fontSize: 16,
    textAlign: "center",
    color: "#444",
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
    color: "#222",
  },
  statsCard: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#f5f5f5",
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  card: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#f9f9f9",
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statLabel: {
    fontSize: 14,
    color: "#333",
    flex: 1,
    marginRight: 8,
  },
  statValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111",
  },
  separator: {
    height: 1,
    backgroundColor: "#ddd",
    marginVertical: 8,
  },
  chartSubtitle: {
    fontSize: 12,
    color: "#666",
  },
  helperText: {
    fontSize: 12,
    color: "#777",
  },
});
