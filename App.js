import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Linking, ActivityIndicator, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';



export default function App() {
  const [status, setStatus] = useState("loading");
  const [data, setData] = useState(null);

  const [hideMessage, setHideMessage] = useState(false);
  const [locked, setLocked] = useState(false);

  const CURRENT_VERSION = Constants.expoConfig.version;

  // 🧠 Load permanent lock on startup
  useEffect(() => {
    const loadLock = async () => {
      const value = await AsyncStorage.getItem('app_locked');

      if (value === 'true') {
        setLocked(true);
        setStatus("blocked");
      }
    };

    loadLock();
  }, []);

  useEffect(() => {
    const checkApp = async () => {
      try {
        const res = await fetch(
          'https://webshakk-app-control.vercel.app/apps/calc82/version.json'
        );

        const json = await res.json();
        setData(json);

        const isBlocked =
          json.forceUpdate && json.version !== CURRENT_VERSION;

        if (isBlocked) {
          setStatus("blocked");
          setLocked(true);

          // 💾 SAVE PERMANENT LOCK
          await AsyncStorage.setItem('app_locked', 'true');
        } else {
          setStatus("allowed");
        }
      } catch (e) {
        // 📴 offline → respect stored lock
        if (locked) {
          setStatus("blocked");
        } else {
          setStatus("allowed");
        }
      }
    };

    checkApp();
  }, [locked]);

  // 🔄 Loading
  if (status === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text>Loading...</Text>
      </View>
    );
  }

  // 🚫 Force Update Screen (LOCKED FOREVER UNTIL RESET)
  if (status === "blocked") {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Update Required</Text>

        <Text style={styles.message}>
          {data?.updateMessage || "Please update to continue"}
        </Text>

        <TouchableOpacity
          style={styles.button}
          onPress={() => Linking.openURL(data.updateUrl)}
        >
          <Text style={styles.buttonText}>Update Now</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ✅ Normal App + APP STYLE MESSAGE CARD
  return (
    <View style={{ flex: 1 }}>

      <WebView
        source={require('./app/index.html')}
        style={{ flex: 1 }}
      />

      {/* 📢 MESSAGE CARD */}
      {data?.dailyMessage && !hideMessage && (
        <View style={styles.card}>

          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>📢 Notice</Text>

            <TouchableOpacity onPress={() => setHideMessage(true)}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.cardText}>
            {data.dailyMessage}
          </Text>

        </View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({

  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },

  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 10
  },

  message: {
    textAlign: 'center',
    marginBottom: 20
  },

  button: {
    backgroundColor: 'blue',
    padding: 12,
    borderRadius: 8
  },

  buttonText: {
    color: 'white',
    fontWeight: 'bold'
  },

  card: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 12,
    elevation: 5
  },

  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8
  },

  cardTitle: {
    fontSize: 15,
    fontWeight: 'bold'
  },

  cardText: {
    fontSize: 14,
    color: '#333'
  },

  close: {
    fontSize: 18,
    color: '#666'
  }
});