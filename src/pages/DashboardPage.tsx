import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../utils/supabase'
import UserMenu from '../components/UserMenu'

type DashboardStats = {
  todaySales: number
  todayRevenue: number
  totalProducts: number
  lowStockCount: number
  recentSales: any[]
  topProducts: any[]
}

export default function DashboardPage() {
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState<DashboardStats>({
    todaySales: 0,
    todayRevenue: 0,
    totalProducts: 0,
    lowStockCount: 0,
    recentSales: [],
    topProducts: [],
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      const today = new Date().toISOString().split('T')[0]

      // Get today's sales
      const { data: todaySalesData } = await supabase
        .from('sales')
        .select('total_amount')
        .gte('created_at', today)

      const todaySalesCount = todaySalesData?.length || 0
      const todayRevenue = todaySalesData?.reduce((sum, sale) => sum + Number(sale.total_amount), 0) || 0

      // Get total products
      const { count: totalProducts } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })

      // Get low stock products
      const { count: lowStockCount } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .lt('stock_quantity', 'min_stock_level')

      // Get recent sales
      const { data: recentSales } = await supabase
        .from('sales')
        .select('sale_number, total_amount, created_at, customer_name')
        .order('created_at', { ascending: false })
        .limit(5)

      // Get top products
      const { data: topProductsData } = await supabase
        .from('sale_items')
        .select('product_name, quantity, total_price')
        .order('quantity', { ascending: false })
        .limit(5)

      setStats({
        todaySales: todaySalesCount,
        todayRevenue,
        totalProducts: totalProducts || 0,
        lowStockCount: lowStockCount || 0,
        recentSales: recentSales || [],
        topProducts: topProductsData || [],
      })
    } catch (error) {
      console.error('Error loading dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="loading-screen">Loading dashboard...</div>
  }

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p>Welcome back, {user?.email}</p>
        </div>
        <UserMenu />
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <h3>Today's Sales</h3>
          <p className="stat-value">{stats.todaySales}</p>
          <p className="stat-label">Transactions</p>
        </div>
        <div className="stat-card">
          <h3>Today's Revenue</h3>
          <p className="stat-value">${stats.todayRevenue.toFixed(2)}</p>
          <p className="stat-label">Total earnings</p>
        </div>
        <div className="stat-card">
          <h3>Total Products</h3>
          <p className="stat-value">{stats.totalProducts}</p>
          <p className="stat-label">In inventory</p>
        </div>
        <div className="stat-card warning">
          <h3>Low Stock</h3>
          <p className="stat-value">{stats.lowStockCount}</p>
          <p className="stat-label">Need restocking</p>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-section">
          <h2>Quick Actions</h2>
          <div className="quick-actions">
            <button
              onClick={() => navigate('/pos')}
              className="btn btn-primary btn-large"
              style={{ minHeight: '60px' }}
            >
              New Sale
            </button>
            <button
              onClick={() => navigate('/inventory')}
              className="btn btn-secondary btn-large"
              style={{ minHeight: '60px' }}
            >
              Manage Inventory
            </button>
            <button
              onClick={() => navigate('/sales')}
              className="btn btn-secondary btn-large"
              style={{ minHeight: '60px' }}
            >
              View Sales History
            </button>
            <button
              onClick={() => navigate('/expenses')}
              className="btn btn-secondary btn-large"
              style={{ minHeight: '60px' }}
            >
              Add Expense
            </button>
            {isAdmin && (
              <button
                onClick={() => navigate('/users')}
                className="btn btn-secondary btn-large"
                style={{ minHeight: '60px' }}
              >
                Manage Users
              </button>
            )}
          </div>
        </div>

        <div className="dashboard-section">
          <h2>Recent Sales</h2>
          {stats.recentSales.length > 0 ? (
            <ul className="recent-list">
              {stats.recentSales.map((sale) => (
                <li key={sale.sale_number} className="recent-item">
                  <div>
                    <strong>{sale.sale_number}</strong>
                    <p>{sale.customer_name || 'Walk-in customer'}</p>
                  </div>
                  <span className="amount">${Number(sale.total_amount).toFixed(2)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="no-data">No recent sales</p>
          )}
        </div>

        <div className="dashboard-section">
          <h2>Top Products</h2>
          {stats.topProducts.length > 0 ? (
            <ul className="recent-list">
              {stats.topProducts.map((item, index) => (
                <li key={index} className="recent-item">
                  <div>
                    <strong>{item.product_name}</strong>
                    <p>{item.quantity} sold</p>
                  </div>
                  <span className="amount">${Number(item.total_price).toFixed(2)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="no-data">No sales data yet</p>
          )}
        </div>
      </div>
    </div>
  )
}
