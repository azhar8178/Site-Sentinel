import { useQuery } from "@tanstack/react-query";
import { useGetMagentoSyncStatus } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingBag, TrendingUp, ShoppingCart, UserX, RefreshCw, Store as StoreIcon } from "lucide-react";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";

async function apiFetch<T>(url: string): Promise<T> {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
  const res = await fetch(`${base}${url}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

interface StoreStats {
  storeId: number;
  name: string;
  currency: string;
  today: { orders: number; revenue: number };
  week: { orders: number; revenue: number };
  carts: { active: number; activeValue: number; abandoned: number; abandonedValue: number; abandonmentRate: number };
}

interface ByStoreResponse {
  stores: StoreStats[];
  combined: {
    today: { orders: number; revenue: number };
    week: { orders: number; revenue: number };
    carts: { active: number; activeValue: number; abandoned: number; abandonedValue: number; abandonmentRate: number };
  };
}

function useStoreStats() {
  return useQuery<ByStoreResponse>({
    queryKey: ["/api/magento/stats/by-store"],
    queryFn: () => apiFetch<ByStoreResponse>("/api/magento/stats/by-store"),
    refetchInterval: 60000,
  });
}

function useStoreOrders(storeId?: number) {
  const url = storeId !== undefined ? `/api/magento/orders?limit=50&storeId=${storeId}` : "/api/magento/orders?limit=50";
  return useQuery<any[]>({
    queryKey: ["/api/magento/orders", storeId],
    queryFn: () => apiFetch<any[]>(url),
  });
}

function useStoreCarts(storeId?: number) {
  const url = storeId !== undefined ? `/api/magento/carts?limit=50&storeId=${storeId}` : "/api/magento/carts?limit=50";
  return useQuery<any[]>({
    queryKey: ["/api/magento/carts", storeId],
    queryFn: () => apiFetch<any[]>(url),
  });
}

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: "€", GBP: "£", USD: "$" };

function fmt(value: number, currency: string = "EUR") {
  const sym = CURRENCY_SYMBOLS[currency] || currency + " ";
  return `${sym}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Store() {
  const { data: storeData, isLoading } = useStoreStats();
  const { data: syncLog } = useGetMagentoSyncStatus();
  const [activeStore, setActiveStore] = useState<number | undefined>(undefined);
  const [tab, setTab] = useState<'orders' | 'carts'>('orders');

  const { data: orders } = useStoreOrders(activeStore);
  const { data: carts } = useStoreCarts(activeStore);

  const lastSync = syncLog?.[0];
  const stores = storeData?.stores || [];
  const activeStoreInfo = stores.find(s => s.storeId === activeStore);
  const activeCurrency = activeStoreInfo?.currency || "EUR";

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-display font-bold">Magento Stores</h1>
          <p className="text-muted-foreground mt-1">E-commerce performance by store</p>
        </div>
        {lastSync && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-white px-3 py-1.5 rounded-full border shadow-sm">
            <RefreshCw className="w-4 h-4" />
            Synced {formatDistanceToNow(new Date(lastSync.syncedAt), { addSuffix: true })}
          </div>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setActiveStore(undefined)}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
            activeStore === undefined
              ? 'bg-primary text-white shadow-md'
              : 'bg-white text-muted-foreground hover:bg-slate-100 border'
          }`}
        >
          <StoreIcon className="w-4 h-4" />
          All Stores
        </button>
        {stores.map(store => (
          <button
            key={store.storeId}
            onClick={() => setActiveStore(store.storeId)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
              activeStore === store.storeId
                ? 'bg-primary text-white shadow-md'
                : 'bg-white text-muted-foreground hover:bg-slate-100 border'
            }`}
          >
            <Badge variant="outline" className={activeStore === store.storeId ? 'border-white/40 text-white' : ''}>
              {store.currency}
            </Badge>
            {store.name}
          </button>
        ))}
      </div>

      {activeStore === undefined ? (
        <>
          {stores.map(store => (
            <StoreSection key={store.storeId} store={store} onSelect={() => setActiveStore(store.storeId)} />
          ))}
          {stores.length === 0 && !isLoading && (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                No store data available yet. Waiting for Magento sync...
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <>
          {activeStoreInfo && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Today's Orders"
                value={activeStoreInfo.today.orders}
                sub={fmt(activeStoreInfo.today.revenue, activeCurrency)}
                icon={ShoppingBag}
                trend="up"
              />
              <StatCard
                title="Weekly Revenue"
                value={fmt(activeStoreInfo.week.revenue, activeCurrency)}
                sub={`${activeStoreInfo.week.orders} orders`}
                icon={TrendingUp}
                trend="up"
              />
              <StatCard
                title="Active Carts"
                value={activeStoreInfo.carts.active}
                sub={`${fmt(activeStoreInfo.carts.activeValue, activeCurrency)} potential`}
                icon={ShoppingCart}
              />
              <StatCard
                title="Abandoned Carts"
                value={activeStoreInfo.carts.abandoned}
                sub={`${activeStoreInfo.carts.abandonmentRate}% rate`}
                icon={UserX}
                trend="down"
              />
            </div>
          )}

          <Card className="overflow-hidden">
            <div className="border-b bg-slate-50/50 p-2 flex gap-2">
              <button
                onClick={() => setTab('orders')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'orders' ? 'bg-white shadow-sm text-primary' : 'text-muted-foreground hover:bg-black/5'}`}
              >
                Recent Orders
              </button>
              <button
                onClick={() => setTab('carts')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'carts' ? 'bg-white shadow-sm text-primary' : 'text-muted-foreground hover:bg-black/5'}`}
              >
                Abandoned Carts
              </button>
            </div>

            <div className="overflow-x-auto">
              {tab === 'orders' ? (
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground bg-slate-50 border-b">
                    <tr>
                      <th className="px-6 py-4 font-medium">Order ID</th>
                      <th className="px-6 py-4 font-medium">Customer</th>
                      <th className="px-6 py-4 font-medium">Total</th>
                      <th className="px-6 py-4 font-medium">Status</th>
                      <th className="px-6 py-4 font-medium text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {orders?.map((order: any) => (
                      <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-primary">#{order.incrementId}</td>
                        <td className="px-6 py-4">
                          {order.customerFirstname} {order.customerLastname}
                          <span className="block text-xs text-muted-foreground">{order.customerEmail}</span>
                        </td>
                        <td className="px-6 py-4 font-semibold">
                          {fmt(order.grandTotal, order.currency)}
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={order.status === 'complete' ? 'success' : order.status === 'processing' ? 'default' : 'secondary'}>
                            {order.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-right text-muted-foreground">
                          {formatDistanceToNow(new Date(order.orderCreatedAt), { addSuffix: true })}
                        </td>
                      </tr>
                    ))}
                    {(!orders || orders.length === 0) && (
                      <tr><td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">No orders found</td></tr>
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground bg-slate-50 border-b">
                    <tr>
                      <th className="px-6 py-4 font-medium">Customer Email</th>
                      <th className="px-6 py-4 font-medium">Items</th>
                      <th className="px-6 py-4 font-medium">Value</th>
                      <th className="px-6 py-4 font-medium text-right">Last Active</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {carts?.map((cart: any) => (
                      <tr key={cart.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-medium">{cart.customerEmail || 'Guest User'}</td>
                        <td className="px-6 py-4">{cart.itemsCount} items</td>
                        <td className="px-6 py-4 font-semibold text-warning">
                          {fmt(cart.grandTotal, cart.currency)}
                        </td>
                        <td className="px-6 py-4 text-right text-muted-foreground">
                          {formatDistanceToNow(new Date(cart.cartUpdatedAt), { addSuffix: true })}
                        </td>
                      </tr>
                    ))}
                    {(!carts || carts.length === 0) && (
                      <tr><td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">No abandoned carts found</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function StoreSection({ store, onSelect }: { store: StoreStats; onSelect: () => void }) {
  const cur = store.currency;
  return (
    <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-display font-bold">{store.name}</h2>
          <Badge variant="outline">{store.currency}</Badge>
        </div>
        <button
          onClick={onSelect}
          className="text-sm text-primary hover:underline font-medium"
        >
          View Details →
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Today's Orders"
          value={store.today.orders}
          sub={fmt(store.today.revenue, cur)}
          icon={ShoppingBag}
          trend="up"
        />
        <StatCard
          title="Weekly Revenue"
          value={fmt(store.week.revenue, cur)}
          sub={`${store.week.orders} orders`}
          icon={TrendingUp}
          trend="up"
        />
        <StatCard
          title="Active Carts"
          value={store.carts.active}
          sub={`${fmt(store.carts.activeValue, cur)} potential`}
          icon={ShoppingCart}
        />
        <StatCard
          title="Abandoned Carts"
          value={store.carts.abandoned}
          sub={`${store.carts.abandonmentRate}% rate`}
          icon={UserX}
          trend="down"
        />
      </div>
    </motion.div>
  );
}

function StatCard({ title, value, sub, icon: Icon, trend }: any) {
  return (
    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
      <Card className="h-full">
        <CardContent className="p-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
              <h3 className="text-2xl font-bold font-display text-foreground">{value}</h3>
              {sub && <p className="text-sm text-muted-foreground mt-1 font-medium">{sub}</p>}
            </div>
            <div className={`p-3 rounded-xl ${trend === 'up' ? 'bg-success/10 text-success' : trend === 'down' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
              <Icon className="w-5 h-5" />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
