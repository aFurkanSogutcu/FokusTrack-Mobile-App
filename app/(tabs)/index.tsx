import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  AppStateStatus,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const DEFAULT_DURATION = 0.2 * 60; // 25 dakika (saniye)
const CATEGORIES = ["Ders Çalışma", "Kodlama", "Proje", "Kitap Okuma"] as const;
const SESSIONS_KEY = "@focus_sessions_v1";

type TimerStatus = "idle" | "running" | "paused" | "finished";

type FocusSession = {
  id: string;
  category: string;
  durationSeconds: number;
  distractions: number;
  startTime: string; // ISO string
  endTime: string; // ISO string
  date: string; // YYYY-MM-DD
};

export default function HomeScreen() {
  const [remainingSeconds, setRemainingSeconds] = useState(DEFAULT_DURATION);
  const [status, setStatus] = useState<TimerStatus>("idle");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [distractionCount, setDistractionCount] = useState(0);
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const [lastSession, setLastSession] = useState<FocusSession | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const formatTime = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, "0");
    const s = (totalSeconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m === 0) return `${s} sn`;
    if (s === 0) return `${m} dk`;
    return `${m} dk ${s} sn`;
  };

  // Sayaç mantığı
  useEffect(() => {
    if (status !== "running") {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          // Süre bitti → sadece finished durumuna geçiriyoruz
          setStatus("finished");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [status]);

  // AppState ile dikkat dağınıklığı takibi
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "background" && status === "running") {
        setDistractionCount((prev) => prev + 1);
        setStatus("paused");
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [status]);

  // Seansı oluşturan ve AsyncStorage'a kaydeden fonksiyon
  const saveCurrentSession = async (reason: "manual" | "auto") => {
    if (!sessionStartTime || !selectedCategory) {
      // Seans hiç başlamamışsa / kategori yoksa kaydetme
      return;
    }

    const endTime = new Date();
    const durationSeconds = DEFAULT_DURATION - remainingSeconds;

    // hiç zaman geçmediyse kaydetmeye gerek yok
    if (durationSeconds <= 0) return;

    const dateStr = endTime.toISOString().slice(0, 10); // YYYY-MM-DD

    const session: FocusSession = {
      id: `${endTime.getTime()}_${reason}`,
      category: selectedCategory,
      durationSeconds,
      distractions: distractionCount,
      startTime: sessionStartTime.toISOString(),
      endTime: endTime.toISOString(),
      date: dateStr,
    };

    try {
      const existing = await AsyncStorage.getItem(SESSIONS_KEY);
      const parsed: FocusSession[] = existing ? JSON.parse(existing) : [];
      const updated = [...parsed, session];
      await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(updated));

      // Ekranda göstermek için son seansı state'e yaz
      setLastSession(session);
    } catch (err) {
      console.warn("Seans kaydedilirken hata:", err);
    }
  };

  const handleStart = () => {
    if (!selectedCategory) {
      Alert.alert(
        "Kategori seçilmedi",
        "Lütfen seansı başlatmadan önce bir kategori seç."
      );
      return;
    }

    // Yeni seans başlarken
    if (status === "idle" || status === "finished") {
      setRemainingSeconds(DEFAULT_DURATION);
      setDistractionCount(0);
      setSessionStartTime(new Date());
    }

    setStatus("running");
  };

  const handlePause = () => {
    if (status === "running") {
      setStatus("paused");
    }
  };

  // Reset: devam eden/biten seansı kaydedip sonra sıfırlar
  const handleReset = async () => {
    // Eğer seans başladıysa ve idle değilse → önce kaydet
    if (sessionStartTime && (status === "running" || status === "paused" || status === "finished")) {
      await saveCurrentSession(status === "finished" ? "auto" : "manual");
    }

    // Yeni seans için temizle
    setStatus("idle");
    setRemainingSeconds(DEFAULT_DURATION);
    setDistractionCount(0);
    setSessionStartTime(null);
    // Seçilen kategoriyi istersen sıfırlama, istersen sıfırla.
    // setSelectedCategory(null);
  };

  const isRunning = status === "running";
  const isPaused = status === "paused";
  const isFinished = status === "finished";

  return (
    <View style={styles.container}>
      {/* Başlık */}
      <Text style={styles.title}>Odaklanma Zamanlayıcısı</Text>

      {/* Sayaç Alanı */}
      <View style={styles.timerContainer}>
        <Text style={styles.timerText}>{formatTime(remainingSeconds)}</Text>
        <Text style={styles.timerSubtitle}>
          {isRunning
            ? "Çalışıyor..."
            : isPaused
            ? "Duraklatıldı"
            : isFinished
            ? "Seans tamamlandı"
            : "Hazır"}
        </Text>

        <Text style={styles.distractionText}>
          Dikkat Dağınıklığı:{" "}
          <Text style={styles.distractionValue}>{distractionCount}</Text>
        </Text>
      </View>

      {/* Kategori Seçici */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Kategori Seç</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
        >
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.categoryPill,
                  isSelected && styles.categoryPillSelected,
                ]}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text
                  style={[
                    styles.categoryText,
                    isSelected && styles.categoryTextSelected,
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Butonlar */}
      <View style={styles.buttonsRow}>
        <TouchableOpacity
          style={[styles.button, styles.startButton]}
          onPress={handleStart}
        >
          <Text style={styles.buttonText}>
            {isPaused ? "Devam Et" : "Başlat"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, !isRunning && { opacity: 0.5 }]}
          onPress={handlePause}
          disabled={!isRunning}
        >
          <Text style={styles.buttonText}>Duraklat</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={handleReset}>
          <Text style={styles.buttonText}>Sıfırla</Text>
        </TouchableOpacity>
      </View>

      {/* Seans Özeti */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Son Seans Özeti</Text>
        {lastSession ? (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryText}>
              Süre:{" "}
              <Text style={styles.summaryValue}>
                {formatDuration(lastSession.durationSeconds)}
              </Text>
            </Text>
            <Text style={styles.summaryText}>
              Kategori:{" "}
              <Text style={styles.summaryValue}>{lastSession.category}</Text>
            </Text>
            <Text style={styles.summaryText}>
              Dikkat Dağınıklığı:{" "}
              <Text style={styles.summaryValue}>{lastSession.distractions}</Text>
            </Text>
            <Text style={styles.summaryText}>
              Tarih:{" "}
              <Text style={styles.summaryValue}>{lastSession.date}</Text>
            </Text>
          </View>
        ) : (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryText}>
              Henüz kaydedilmiş bir seans yok.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 32,
    paddingBottom: 16,
    backgroundColor: "#ffffff",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 24,
    color: "#111",
  },
  timerContainer: {
    alignItems: "center",
    marginBottom: 24,
  },
  timerText: {
    fontSize: 56,
    fontWeight: "700",
    letterSpacing: 2,
    color: "#111",
  },
  timerSubtitle: {
    marginTop: 4,
    fontSize: 14,
    color: "#666",
  },
  distractionText: {
    marginTop: 8,
    fontSize: 14,
    color: "#444",
  },
  distractionValue: {
    fontWeight: "700",
    color: "#d32f2f",
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
  categoryRow: {
    flexDirection: "row",
  },
  categoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#f7f7f7",
    marginRight: 8,
  },
  categoryPillSelected: {
    backgroundColor: "#2e7d32",
    borderColor: "#2e7d32",
  },
  categoryText: {
    fontSize: 14,
    color: "#333",
  },
  categoryTextSelected: {
    color: "#fff",
    fontWeight: "600",
  },
  buttonsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
    gap: 10,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#444",
    alignItems: "center",
    justifyContent: "center",
  },
  startButton: {
    backgroundColor: "#2e7d32",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
  summaryCard: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#f5f5f5",
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  summaryText: {
    fontSize: 14,
    marginBottom: 4,
    color: "#333",
  },
  summaryValue: {
    fontWeight: "600",
    color: "#111",
  },
});
