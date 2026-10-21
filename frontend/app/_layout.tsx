import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, AppState, LogBox, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { UIProvider } from "@/src/components/ui";
import { seedImports, seedSuppliers } from "@/src/db/catalogue";
import { flushSave, getDB, initDB } from "@/src/db/store";
import { queryClient } from "@/src/query-client";
import { setColorScheme, useTheme } from "@/src/theme";

LogBox.ignoreAllLogs(true);

function Boot({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const [state, setState] = useState<"loading" | "ready" | string>("loading");
  useEffect(() => {
    initDB(seedSuppliers, seedImports)
      .then(() => {
        const t = getDB().settings.theme;
        setColorScheme(t === "system" ? null : t);
        setState("ready");
      })
      .catch((e) => setState("Could not open the local database: " + (e?.message || "unknown error")));
    // Save pending changes whenever the app goes to background (crash/close safety).
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") void flushSave();
    });
    return () => sub.remove();
  }, []);
  if (state === "ready") return <>{children}</>;
  return (
    <View style={[styles.boot, { backgroundColor: colors.surface }]} testID="boot-screen">
      {state === "loading" ? <ActivityIndicator size="large" color={colors.brandPrimary} /> : null}
      <Text style={{ color: state === "loading" ? colors.muted : colors.error, marginTop: 12, textAlign: "center" }}>
        {state === "loading" ? "Opening TechronixHub…" : state}
      </Text>
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <KeyboardProvider>
            <UIProvider>
              <Boot>
                <Stack screenOptions={{ headerShown: false }} />
              </Boot>
            </UIProvider>
          </KeyboardProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  boot: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
});
