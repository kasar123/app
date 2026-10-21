import { useLocalSearchParams, useRouter } from "expo-router";
import { useDeferredValue, useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProductRow } from "@/src/components/products";
import { Chip, ChipRow, Empty, Header, HeaderAction, SearchBar, useScreenStyles, useUI } from "@/src/components/ui";
import { categories, Filters, searchProducts } from "@/src/db/catalogue";
import { useDB } from "@/src/db/store";
import { usesNativeTabs } from "@/src/navigation";
import { spacing } from "@/src/theme";

const STOCK: { v: NonNullable<Filters["stock"]>; l: string }[] = [
  { v: "all", l: "All" }, { v: "tracked", l: "In my shop" }, { v: "shop-low", l: "Low" }, { v: "shop-out", l: "Out" },
  { v: "sup-in", l: "Supplier in stock" }, { v: "sup-out", l: "Supplier out" }, { v: "no-hsn", l: "HSN missing" }, { v: "hsn", l: "HSN set" },
];

export default function Catalogue() {
  const db = useDB();
  const ss = useScreenStyles();
  const router = useRouter();
  const ui = useUI();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ pick?: string }>();
  const [q, setQ] = useState("");
  const [sup, setSup] = useState<string | undefined>();
  const [cat, setCat] = useState<string | undefined>();
  const [stock, setStock] = useState<Filters["stock"]>("all");
  const dq = useDeferredValue(q);
  const supName = useMemo(() => new Map(db.suppliers.map((s) => [s.id, s.name])), [db.suppliers]);

  const result = useMemo(() => searchProducts(dq, { supplierId: sup, category: cat, stock }), [dq, sup, cat, stock, db]);

  const chooseCategory = async () => {
    const opts = [{ value: "", label: "All categories" }, ...categories(sup).map(([c, n]) => ({ value: c, label: c, sub: `${n} products` }))];
    const v = await ui.pick("Category", opts);
    if (v !== null) setCat(v || undefined);
  };

  return (
    <View style={ss.screen}>
      <Header title="Products" subtitle={`${result.items.length} of catalogue${result.fuzzy ? " · showing close matches" : ""}`} back={false}
        right={<HeaderAction testID="add-product-button" icon="plus" label="Add" onPress={() => router.push("/product/edit")} />} />
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <SearchBar testID="product-search-input" value={q} onChangeText={setQ} placeholder="Name, SKU, HSN, category, variant…" />
      </View>
      <ChipRow>
        <Chip testID="filter-supplier-all" label="All suppliers" active={!sup} onPress={() => { setSup(undefined); setCat(undefined); }} />
        {db.suppliers.map((s) => (
          <Chip key={s.id} testID={`filter-supplier-${s.id}`} label={s.name} active={sup === s.id} onPress={() => { setSup(s.id); setCat(undefined); }} />
        ))}
        <Chip testID="filter-category" icon="shape-outline" label={cat || "Category"} active={!!cat} onPress={chooseCategory} />
      </ChipRow>
      <ChipRow>
        {STOCK.map((o) => (
          <Chip key={o.v} testID={`filter-stock-${o.v}`} label={o.l} active={stock === o.v} onPress={() => setStock(o.v)} />
        ))}
      </ChipRow>
      <FlatList
        testID="product-list"
        data={result.items}
        keyExtractor={(p) => p.id}
        initialNumToRender={15}
        maxToRenderPerBatch={20}
        windowSize={7}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: (usesNativeTabs ? insets.bottom : 0) + spacing.xl }}
        renderItem={({ item, index }) => (
          <ProductRow p={item} supplierName={supName.get(item.supplierId) || item.supplierId} testID={`product-row-${index}`}
            onPress={() => router.push(params.pick ? `/product/${encodeURIComponent(item.id)}?pick=1` : `/product/${encodeURIComponent(item.id)}`)} />
        )}
        ListEmptyComponent={<Empty title="No matching products" text="Try fewer words, a SKU, or clear the filters." icon="magnify-close" testID="product-list-empty" />}
      />
    </View>
  );
}
