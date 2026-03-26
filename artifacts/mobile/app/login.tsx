import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import Colors from "@/constants/colors";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { login, register } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [allowRegistration, setAllowRegistration] = useState(false);
  const [checkingUsers, setCheckingUsers] = useState(true);

  useEffect(() => {
    const checkUserCount = async () => {
      try {
        const domain = process.env.EXPO_PUBLIC_DOMAIN;
        const res = await fetch(`https://${domain}/api/auth/user-count`);
        if (res.ok) {
          const data = await res.json();
          if (data.count === 0) {
            setAllowRegistration(true);
            setIsRegistering(true);
          }
        }
      } catch {
      } finally {
        setCheckingUsers(false);
      }
    };
    checkUserCount();
  }, []);

  const handleSubmit = async () => {
    if (!username.trim() || !password.trim()) {
      setError("Please enter both username and password");
      return;
    }
    if (isRegistering && password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setError("");
    setIsSubmitting(true);
    try {
      if (isRegistering) {
        await register(username.trim(), password);
      } else {
        await login(username.trim(), password);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (checkingUsers) {
    return (
      <View style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: isWeb ? 40 : insets.top + 20 }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[
            styles.container,
            isWeb && styles.containerWeb,
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.iconContainer}>
            <Feather name="shield" size={64} color={Colors.light.tint} />
          </View>

          <Text style={styles.title}>Site Monitor</Text>
          <Text style={styles.subtitle}>
            {isRegistering ? "Create your admin account" : "Sign in to your account"}
          </Text>

          {error ? (
            <View style={styles.errorContainer}>
              <Feather name="alert-circle" size={16} color="#dc3545" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.form}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="Enter username"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Enter password"
              placeholderTextColor="#9ca3af"
              secureTextEntry
            />

            <Pressable
              style={[styles.button, isSubmitting && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>
                  {isRegistering ? "Create Account" : "Sign In"}
                </Text>
              )}
            </Pressable>

            {allowRegistration ? (
              <Pressable
                style={styles.switchButton}
                onPress={() => {
                  setIsRegistering(!isRegistering);
                  setError("");
                }}
              >
                <Text style={styles.switchText}>
                  {isRegistering
                    ? "Already have an account? Sign In"
                    : "First time? Create Account"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingBottom: 40,
  },
  containerWeb: {
    alignSelf: "center",
    maxWidth: 420,
    width: "100%",
  },
  iconContainer: {
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.light.text,
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.light.textSecondary,
    textAlign: "center",
    marginBottom: 24,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    color: "#dc3545",
    fontSize: 14,
    flex: 1,
  },
  form: {
    gap: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.light.text,
    marginBottom: 4,
    marginTop: 12,
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.light.text,
  },
  button: {
    backgroundColor: Colors.light.tint,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 24,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  switchButton: {
    alignItems: "center",
    marginTop: 16,
    paddingVertical: 8,
  },
  switchText: {
    color: Colors.light.tint,
    fontSize: 14,
  },
});
