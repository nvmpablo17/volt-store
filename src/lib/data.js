import { supabase } from "./supabase.js";

const num = (v) => (v === null || v === undefined ? v : Number(v));

/* ---------- row <-> app shape mapping ---------- */
const mapSettings = (row) => ({
  storeName: row.store_name,
  currency: row.currency,
  openingCash: num(row.opening_cash),
});

const mapProduct = (row) => ({
  id: row.id,
  barcode: row.barcode,
  name: row.name,
  brand: row.brand || "",
  category: row.category || "",
  cost: num(row.cost),
  price: num(row.price),
  qty: row.qty,
  alertAt: row.alert_at,
  supplier: row.supplier || "",
});

const mapTransaction = (row) => ({
  id: row.id,
  type: row.type,
  reason: row.reason,
  amount: num(row.amount),
  profit: row.profit === null ? null : num(row.profit),
  auto: row.auto,
  productId: row.product_id,
  iso: row.created_at,
});

const mapDebt = (row) => ({
  id: row.id,
  direction: row.direction,
  name: row.name,
  amount: num(row.amount),
  due: row.due || "",
});

/* ---------- settings ---------- */
export async function fetchSettings(userId) {
  const { data, error } = await supabase.from("settings").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data ? mapSettings(data) : null;
}
export async function createSettings(userId, { storeName, currency, openingCash }) {
  const { data, error } = await supabase
    .from("settings")
    .insert({ user_id: userId, store_name: storeName, currency, opening_cash: openingCash })
    .select()
    .single();
  if (error) throw error;
  return mapSettings(data);
}
export async function updateSettings(userId, { storeName, currency, openingCash }) {
  const { data, error } = await supabase
    .from("settings")
    .update({ store_name: storeName, currency, opening_cash: openingCash })
    .eq("user_id", userId)
    .select()
    .single();
  if (error) throw error;
  return mapSettings(data);
}

/* ---------- products ---------- */
export async function fetchProducts(userId) {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(mapProduct);
}
export async function insertProduct(userId, p) {
  const { data, error } = await supabase
    .from("products")
    .insert({
      user_id: userId, barcode: p.barcode, name: p.name, brand: p.brand, category: p.category,
      cost: p.cost, price: p.price, qty: p.qty, alert_at: p.alertAt, supplier: p.supplier,
    })
    .select()
    .single();
  if (error) throw error;
  return mapProduct(data);
}
export async function updateProduct(id, p) {
  const patch = {};
  if (p.barcode !== undefined) patch.barcode = p.barcode;
  if (p.name !== undefined) patch.name = p.name;
  if (p.brand !== undefined) patch.brand = p.brand;
  if (p.category !== undefined) patch.category = p.category;
  if (p.cost !== undefined) patch.cost = p.cost;
  if (p.price !== undefined) patch.price = p.price;
  if (p.qty !== undefined) patch.qty = p.qty;
  if (p.alertAt !== undefined) patch.alert_at = p.alertAt;
  if (p.supplier !== undefined) patch.supplier = p.supplier;
  const { data, error } = await supabase.from("products").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return mapProduct(data);
}
export async function deleteProduct(id) {
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw error;
}

/* ---------- transactions ---------- */
export async function fetchTransactions(userId) {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(mapTransaction);
}
export async function insertTransaction(userId, t) {
  const { data, error } = await supabase
    .from("transactions")
    .insert({
      user_id: userId, type: t.type, reason: t.reason, amount: t.amount,
      profit: t.profit ?? null, auto: !!t.auto, product_id: t.productId ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return mapTransaction(data);
}
export async function deleteTransaction(id) {
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) throw error;
}

/* ---------- debts ---------- */
export async function fetchDebts(userId) {
  const { data, error } = await supabase
    .from("debts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(mapDebt);
}
export async function insertDebt(userId, d) {
  const { data, error } = await supabase
    .from("debts")
    .insert({ user_id: userId, direction: d.direction, name: d.name, amount: d.amount, due: d.due || "" })
    .select()
    .single();
  if (error) throw error;
  return mapDebt(data);
}
export async function deleteDebt(id) {
  const { error } = await supabase.from("debts").delete().eq("id", id);
  if (error) throw error;
}

/* ---------- stock adjustments ---------- */
export async function insertStockAdjustment(userId, a) {
  const { error } = await supabase.from("stock_adjustments").insert({
    user_id: userId, product_id: a.productId, qty_removed: a.qtyRemoved,
    reason: a.reason, value_written_off: a.valueWrittenOff,
  });
  if (error) throw error;
}
