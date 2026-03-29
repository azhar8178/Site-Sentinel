import { useGetMagentoStats, useGetMagentoOrders, useGetMagentoCarts, useGetMagentoSyncStatus } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingBag, TrendingUp, ShoppingCart, UserX, RefreshCw } from "lucide-react";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";

export default function Store() {
  const { data: stats, isLoading: statsLoading } = useGetMagentoStats();
  const { data: syncLog } = useGetMagentoSyncStatus();
  const [tab, setTab] = useState<'orders'|'carts'>('orders');
  
  const { data: orders } = useGetMagentoOrders({ limit: 50 }, { query: { enabled: tab === 'orders' }});
  const { data: carts } = useGetMagentoCarts({ limit: 50 }, { query: { enabled: tab === 'carts' }});

  const lastSync = syncLog?.[0];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-display font-bold">Magento Store</h1>
          <p className="text-muted-foreground mt-1">E-commerce performance metrics</p>
        </div>
        {lastSync && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-white px-3 py-1.5 rounded-full border shadow-sm">
            <RefreshCw className="w-4 h-4" />
            Synced {formatDistanceToNow(new Date(lastSync.syncedAt), { addSuffix: true })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Today's Orders" 
          value={stats?.today?.orders ?? 0} 
          sub={`€${(stats?.today?.revenue ?? 0).toFixed(2)}`}
          icon={ShoppingBag} 
          trend="up" 
        />
        <StatCard 
          title="Weekly Revenue" 
          value={`€${(stats?.week?.revenue ?? 0).toFixed(2)}`}
          sub={`${stats?.week?.orders ?? 0} orders`}
          icon={TrendingUp} 
          trend="up" 
        />
        <StatCard 
          title="Active Carts" 
          value={stats?.carts?.active ?? 0} 
          sub={`€${(stats?.carts?.activeValue ?? 0).toFixed(2)} potential`}
          icon={ShoppingCart} 
        />
        <StatCard 
          title="Abandoned Carts" 
          value={stats?.carts?.abandoned ?? 0} 
          sub={`${(stats?.carts?.abandonmentRate ?? 0).toFixed(1)}% rate`}
          icon={UserX} 
          trend="down" 
        />
      </div>

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
                {orders?.map(order => (
                  <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-primary">#{order.incrementId}</td>
                    <td className="px-6 py-4">
                      {order.customerFirstname} {order.customerLastname}
                      <span className="block text-xs text-muted-foreground">{order.customerEmail}</span>
                    </td>
                    <td className="px-6 py-4 font-semibold">{order.currency} {order.grandTotal.toFixed(2)}</td>
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
                {carts?.map(cart => (
                  <tr key={cart.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-medium">{cart.customerEmail || 'Guest User'}</td>
                    <td className="px-6 py-4">{cart.itemsCount} items</td>
                    <td className="px-6 py-4 font-semibold text-warning">{cart.currency} {cart.grandTotal.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right text-muted-foreground">
                      {formatDistanceToNow(new Date(cart.cartUpdatedAt), { addSuffix: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
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
