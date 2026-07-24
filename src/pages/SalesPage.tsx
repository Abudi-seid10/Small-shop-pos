import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import UserMenu from '../components/UserMenu'

type Sale = {
  id: string
  sale_number: string
  customer_name: string
  customer_phone: string
  total_amount: number
  payment_method: string
  payment_status: string
  created_at: string
}

type SaleItem = {
  id: string
  product_name: string
  quantity: number
  unit_price: number
  total_price: number
}

export default function SalesPage() {
  const navigate = useNavigate()
  const [sales, setSales] = useState<Sale[]>([])
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [saleItems, setSaleItems] = useState<SaleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState('all')

  useEffect(() => {
    loadSales()
  }, [dateFilter])

  const loadSales = async () => {
    try {
      let query = supabase
        .from('sales')
        .select('*')
        .order('created_at', { ascending: false })

      if (dateFilter === 'today') {
        const today = new Date().toISOString().split('T')[0]
        query = query.gte('created_at', today)
      } else if (dateFilter === 'week') {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        query = query.gte('created_at', weekAgo)
      } else if (dateFilter === 'month') {
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        query = query.gte('created_at', monthAgo)
      }

      const { data } = await query
      setSales(data || [])
    } catch (error) {
      console.error('Error loading sales:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadSaleItems = async (saleId: string) => {
    try {
      const { data } = await supabase
        .from('sale_items')
        .select('*')
        .eq('sale_id', saleId)

      setSaleItems(data || [])
    } catch (error) {
      console.error('Error loading sale items:', error)
    }
  }

  const handleViewSale = (sale: Sale) => {
    setSelectedSale(sale)
    loadSaleItems(sale.id)
  }

  const totalRevenue = sales.reduce((sum, sale) => sum + Number(sale.total_amount), 0)

  if (loading) {
    return <div className="loading-screen">Loading sales...</div>
  }

  return (
    <div className="sales-container">
      <header className="page-header">
        <button onClick={() => navigate('/dashboard')} className="btn btn-secondary">
          ← Back
        </button>
        <h1>Sales History</h1>
        <UserMenu />
      </header>

      <div className="sales-summary">
        <div className="summary-card">
          <h3>Total Revenue</h3>
          <p className="summary-value">${totalRevenue.toFixed(2)}</p>
        </div>
        <div className="summary-card">
          <h3>Total Transactions</h3>
          <p className="summary-value">{sales.length}</p>
        </div>
        <div className="form-group" style={{ minWidth: '200px' }}>
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="form-input"
            style={{ minHeight: '44px' }}
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
        </div>
      </div>

      <div className="sales-layout">
        <div className="sales-list">
          <table className="data-table">
            <thead>
              <tr>
                <th>Sale #</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Payment</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {sales.map(sale => (
                <tr
                  key={sale.id}
                  className={selectedSale?.id === sale.id ? 'selected' : ''}
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleViewSale(sale)}
                >
                  <td><strong>{sale.sale_number}</strong></td>
                  <td>{new Date(sale.created_at).toLocaleDateString()}</td>
                  <td>{sale.customer_name || 'Walk-in'}</td>
                  <td>${Number(sale.total_amount).toFixed(2)}</td>
                  <td>
                    <span className={`badge ${sale.payment_status}`}>
                      {sale.payment_method}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-sm btn-secondary" style={{ minHeight: '36px' }}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selectedSale && (
          <div className="sale-details">
            <h2>Sale Details</h2>
            <div className="detail-row">
              <span>Sale Number:</span>
              <strong>{selectedSale.sale_number}</strong>
            </div>
            <div className="detail-row">
              <span>Date:</span>
              <strong>{new Date(selectedSale.created_at).toLocaleString()}</strong>
            </div>
            <div className="detail-row">
              <span>Customer:</span>
              <strong>{selectedSale.customer_name || 'Walk-in customer'}</strong>
            </div>
            <div className="detail-row">
              <span>Phone:</span>
              <strong>{selectedSale.customer_phone || '-'}</strong>
            </div>
            <div className="detail-row">
              <span>Payment Method:</span>
              <strong>{selectedSale.payment_method}</strong>
            </div>
            <div className="detail-row">
              <span>Status:</span>
              <strong className={selectedSale.payment_status}>{selectedSale.payment_status}</strong>
            </div>

            <h3>Items</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {saleItems.map(item => (
                  <tr key={item.id}>
                    <td>{item.product_name}</td>
                    <td>{item.quantity}</td>
                    <td>${Number(item.unit_price).toFixed(2)}</td>
                    <td>${Number(item.total_price).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="sale-totals">
              <div className="total-row">
                <span>Total:</span>
                <strong>${Number(selectedSale.total_amount).toFixed(2)}</strong>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
