import { useRouter } from "expo-router";
import { useMemo } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Badge, Button, Card, Empty, Header, useScreenStyles, useUI } from "@/src/components/ui";
import { duplicateGroups } from "@/src/db/catalogue";
import { audit, mutate, uid, useDB } from "@/src/db/store";
import { spacing } from "@/src/theme";

export default function Duplicates() {
  const db = useDB();
  const ss = useScreenStyles();
  const router = useRouter();
  const ui = useUI();
  const insets = useSafeAreaInsets();
  const groups = useMemo(() => duplicateGroups().sort((a, b) => Number(a.linked) - Number(b.linked)), [db]);
  const sup = new Map(db.suppliers.map((s) => [s.id, s.name]));

  const keep = (key: string) => mutate((d) => { d.dismissedDupes.push(key); audit("keep-separate", "duplicate", key); }, { catalogue: true });
  const link = async (ids: string[]) => {
    const ok = await ui.confirm({ title: "Link as one common product?", message: "Records stay separate with their own supplier SKU and URL, but are shown as the same product so you can choose a supplier when ordering.", confirmText: "Link" });
    if (!ok) return;
    mutate((d) => {
      Object.keys(d.links).forEach((g) => { d.links[g] = d.links[g].filter((x) => !ids.includes(x)); if (d.links[g].length < 2) delete d.links[g]; });
      d.links[uid()] = ids;
      audit("link", "duplicate", ids.join(","));
    }, { catalogue: true });
    ui.toast("Products linked");
  };
  const unlink = (ids: string[]) => mutate((d) => { Object.keys(d.links).forEach((g) => { if (ids.some((x) => d.links[g].includes(x))) delete d.links[g]; }); }, { catalogue: true });

  return (
    <View style={ss.screen}>
      <Header title="Duplicate review" subtitle={`${groups.length} potential duplicate groups · never merged automatically`} />
      <FlatList
        testID="duplicate-list"
        data={groups}
        keyExtractor={(g) => g.key}
        initialNumToRender={8}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl, gap: spacing.sm }}
        renderItem={({ item, index }) => (
          <Card testID={`duplicate-group-${index}`}>
            <View style={[ss.row, { justifyContent: "space-between", marginBottom: spacing.sm }]}>
              <Text style={ss.muted}>{item.reason}</Text>
              {item.linked ? <Badge label="LINKED" tone="success" /> : null}
            </View>
            {item.items.map((p) => (
              <Pressable key={p.id} onPress={() => router.push(`/product/${encodeURIComponent(p.id)}`)} style={{ paddingVertical: 4 }}>
                <Text style={ss.text} numberOfLines={2}>{p.name}{p.variant ? ` [${p.variant}]` : ""}</Text>
                <Text style={ss.muted}>{sup.get(p.supplierId)} · SKU {p.sku || "—"}</Text>
              </Pressable>
            ))}
            <View style={[ss.row, { marginTop: spacing.sm }]}>
              {item.linked ? (
                <Button small style={{ flex: 1 }} testID={`duplicate-unlink-${index}`} variant="ghost" title="Unlink" onPress={() => unlink(item.items.map((p) => p.id))} />
              ) : (
                <>
                  <Button small style={{ flex: 1 }} testID={`duplicate-keep-${index}`} variant="ghost" title="Keep both" onPress={() => keep(item.key)} />
                  <Button small style={{ flex: 1 }} testID={`duplicate-link-${index}`} title="Link as same" onPress={() => link(item.items.map((p) => p.id))} />
                </>
              )}
            </View>
          </Card>
        )}
        ListEmptyComponent={<Empty icon="content-duplicate" title="No potential duplicates" testID="duplicates-empty" />}
      />
    </View>
  );
}
