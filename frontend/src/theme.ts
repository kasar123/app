// Design tokens (from /app/design_guidelines.json). Light + dark.
// Use makeStyles(colors => ...) for sheets and useTheme().colors for color props.
import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#FFFFFF",
  onSurface: "#0B132B",
  surfaceSecondary: "#F4F6F8",
  onSurfaceSecondary: "#1C2541",
  surfaceTertiary: "#E9ECEF",
  onSurfaceTertiary: "#3A506B",
  surfaceInverse: "#0B132B",
  onSurfaceInverse: "#FFFFFF",
  muted: "#6C757D",
  brand: "#1C4ED8",
  onBrand: "#FFFFFF",
  brandPrimary: "#1D4ED8",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#3B82F6",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#DBEAFE",
  onBrandTertiary: "#1E3A8A",
  accent: "#F97316",
  onAccent: "#FFFFFF",
  success: "#16A34A",
  onSuccess: "#FFFFFF",
  warning: "#B45309",
  onWarning: "#FFFFFF",
  error: "#DC2626",
  onError: "#FFFFFF",
  info: "#0284C7",
  onInfo: "#FFFFFF",
  border: "#E5E7EB",
  borderStrong: "#D1D5DB",
  divider: "#F3F4F6",
  overlay: "rgba(11,19,43,0.45)",
};

export type ThemeColors = typeof light;

const dark: ThemeColors = {
  surface: "#0B132B",
  onSurface: "#F8FAFC",
  surfaceSecondary: "#1C2541",
  onSurfaceSecondary: "#F1F5F9",
  surfaceTertiary: "#2D3A56",
  onSurfaceTertiary: "#E2E8F0",
  surfaceInverse: "#F8FAFC",
  onSurfaceInverse: "#0B132B",
  muted: "#94A3B8",
  brand: "#3B82F6",
  onBrand: "#FFFFFF",
  brandPrimary: "#3B82F6",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#60A5FA",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#1E3A8A",
  onBrandTertiary: "#BFDBFE",
  accent: "#FB923C",
  onAccent: "#FFFFFF",
  success: "#22C55E",
  onSuccess: "#000000",
  warning: "#FACC15",
  onWarning: "#000000",
  error: "#EF4444",
  onError: "#FFFFFF",
  info: "#38BDF8",
  onInfo: "#000000",
  border: "#334155",
  borderStrong: "#475569",
  divider: "#1E293B",
  overlay: "rgba(0,0,0,0.6)",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 4, md: 8, lg: 12, pill: 999 };
export const font = { sm: 12, base: 14, lg: 16, xl: 20, xxl: 24 };

export const defaultScheme = "light" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light, dark };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = (system === "light" || system === "dark") && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
