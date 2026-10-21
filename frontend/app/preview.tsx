import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import { Button, Header, useScreenStyles, useUI } from "@/src/components/ui";
import { outputPdf } from "@/src/lib/files";
import { getPreview } from "@/src/lib/preview";
import { spacing } from "@/src/theme";

export default function Preview() {
  const ss = useScreenStyles();
  const ui = useUI();
  const insets = useSafeAreaInsets();
  const { html, title } = getPreview();
  const run = async (mode: "share" | "print") => {
    try { ui.toast(await outputPdf(`${(title || "document").replace(/[^A-Za-z0-9-_]+/g, "_")}.pdf`, html, mode)); } catch (e: any) { ui.toast(e?.message || "Failed", "error"); }
  };
  return (
    <View style={ss.screen}>
      <Header title="Preview" subtitle={title} />
      <WebView testID="pdf-preview-webview" originWhitelist={["*"]} source={{ html: html.replace("<head>", '<head><meta name="viewport" content="width=620"/>') }} style={{ flex: 1 }} />
      <View style={[ss.row, { padding: spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}>
        <Button style={{ flex: 1 }} testID="preview-share-button" icon="share-variant" title="Share PDF" onPress={() => run("share")} />
        <Button style={{ flex: 1 }} testID="preview-print-button" variant="secondary" icon="printer" title="Print" onPress={() => run("print")} />
      </View>
    </View>
  );
}
