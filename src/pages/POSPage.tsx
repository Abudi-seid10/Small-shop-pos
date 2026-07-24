import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import UserMenu from '../components/UserMenu'

type Product = {
  id: string
  name: string
  sku: string
  barcode: string
  selling_price: number
  stock_quantity: number
  tax_rate: number
  category_id: string
  min_stock_level: number
}

type CartItem = {
  product: Product
  quantity: number
  total: number
}

type Category = {
  id: string
  name: string
}

export default function POSPage() {
  const navigate = useNavigate()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [barcodeInput, setBarcodeInput] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    loadProducts()
    loadCategories()
  }, [])

  const loadProducts = async () => {
    try {
      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('name')

      setProducts(data || [])
    } catch (error) {
      console.error('Error loading products:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadCategories = async () => {
    try {
      const { data } = await supabase
        .from('categories')
        .select('*')
        .order('name')

      setCategories(data || [])
    } catch (error) {
      console.error('Error loading categories:', error)
    }
  }

  const filteredProducts = products.filter(product => {
    const matchesCategory = selectedCategory === 'all' || product.category_id === selectedCategory
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         product.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         product.barcode?.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  const handleBarcodeScan = (barcode: string) => {
    const product = products.find(p => p.barcode === barcode)
    if (product) {
      addToCart(product)
      setBarcodeInput('')
    } else {
      alert('Product not found for barcode: ' + barcode)
    }
  }

  useEffect(() => {
    if (barcodeInput.length > 0) {
      const timer = setTimeout(() => {
        handleBarcodeScan(barcodeInput)
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [barcodeInput])

  const addToCart = (product: Product) => {
    if (product.stock_quantity <= 0) {
      alert('This product is out of stock')
      return
    }

    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.product.id === product.id)
      
      if (existingItem) {
        if (existingItem.quantity >= product.stock_quantity) {
          alert('Not enough stock available')
          return prevCart
        }
        return prevCart.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.product.selling_price }
            : item
        )
      }
      
      return [...prevCart, { product, quantity: 1, total: product.selling_price }]
    })
  }

  const removeFromCart = (productId: string) => {
    setCart(prevCart => prevCart.filter(item => item.product.id !== productId))
  }

  const updateQuantity = (productId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromCart(productId)
      return
    }

    setCart(prevCart => prevCart.map(item => {
      if (item.product.id === productId) {
        if (newQuantity > item.product.stock_quantity) {
          alert('Not enough stock available')
          return item
        }
        return { ...item, quantity: newQuantity, total: newQuantity * item.product.selling_price }
      }
      return item
    }))
  }

  const subtotal = cart.reduce((sum, item) => sum + item.total, 0)
  const taxAmount = cart.reduce((sum, item) => sum + (item.total * item.product.tax_rate / 100), 0)
  const total = subtotal + taxAmount

  const handleCheckout = async () => {
    if (cart.length === 0) {
      alert('Cart is empty')
      return
    }

    setProcessing(true)

    try {
      // Generate sale number
      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .insert({
          sale_number: `SALE-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(Math.random() * 10000).toString().padStart(4,'0')}`,
          customer_name: customerName || null,
          customer_phone: customerPhone || null,
          subtotal,
          tax_amount: taxAmount,
          discount_amount: 0,
          total_amount: total,
          payment_method: paymentMethod,
          payment_status: 'paid',
        })
        .select()
        .single()

      if (saleError) throw saleError

      // Add sale items
      const saleItems = cart.map(item => ({
        sale_id: saleData.id,
        product_id: item.product.id,
        product_name: item.product.name,
        quantity: item.quantity,
        unit_price: item.product.selling_price,
        tax_rate: item.product.tax_rate,
        tax_amount: item.total * item.product.tax_rate / 100,
        discount_amount: 0,
        total_price: item.total,
        cost_price: item.product.selling_price * 0.6, // Approximate cost
      }))

      const { error: itemsError } = await supabase
        .from('sale_items')
        .insert(saleItems)

      if (itemsError) throw itemsError

      // Update product stock
      for (const item of cart) {
        await supabase
          .from('products')
          .update({ stock_quantity: item.product.stock_quantity - item.quantity })
          .eq('id', item.product.id)
      }

      alert('Sale completed successfully!')
      setCart([])
      setCustomerName('')
      setCustomerPhone('')
      loadProducts()
    } catch (error) {
      console.error('Error processing sale:', error)
      alert('Error processing sale. Please try again.')
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return <div className="loading-screen">Loading products...</div>
  }

  return (
    <div className="pos-container">
      <header className="pos-header">
        <button onClick={() => navigate('/dashboard')} className="btn btn-secondary">
          ← Back
        </button>
        <h1>Point of Sale</h1>
        <UserMenu />
      </header>

      <div className="pos-layout">
        <div className="pos-products">
          <div className="pos-filters">
            <input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="form-input"
              style={{ minHeight: '44px' }}
            />
            <input
              type="text"
              placeholder="Scan barcode..."
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              className="form-input"
              style={{ minHeight: '44px' }}
            />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="form-input"
              style={{ minHeight: '44px' }}
            >
              <option value="all">All Categories</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          <div className="products-grid">
            {filteredProducts.map(product => (
              <div
                key={product.id}
                className="product-card"
                onClick={() => addToCart(product)}
                style={{ cursor: product.stock_quantity > 0 ? 'pointer' : 'not-allowed', opacity: product.stock_quantity > 0 ? 1 : 0.5 }}
              >
                <h3>{product.name}</h3>
                <p className="product-sku">{product.sku}</p>
                <p className="product-price">${product.selling_price.toFixed(2)}</p>
                <p className={`product-stock ${product.stock_quantity <= product.min_stock_level ? 'low' : ''}`}>
                  Stock: {product.stock_quantity}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="pos-cart">
          <h2>Cart ({cart.length} items)</h2>

          <div className="cart-form">
            <input
              type="text"
              placeholder="Customer name (optional)"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="form-input"
              style={{ minHeight: '44px' }}
            />
            <input
              type="text"
              placeholder="Customer phone (optional)"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="form-input"
              style={{ minHeight: '44px' }}
            />
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="form-input"
              style={{ minHeight: '44px' }}
            >
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="upi">UPI</option>
              <option value="credit">Credit</option>
            </select>
          </div>

          <div className="cart-items">
            {cart.length === 0 ? (
              <p className="empty-cart">Cart is empty</p>
            ) : (
              cart.map(item => (
                <div key={item.product.id} className="cart-item">
                  <div className="cart-item-info">
                    <h4>{item.product.name}</h4>
                    <p>${item.product.selling_price.toFixed(2)} each</p>
                  </div>
                  <div className="cart-item-controls">
                    <button
                      onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                      className="btn btn-sm"
                      style={{ minHeight: '36px', minWidth: '36px' }}
                    >
                      -
                    </button>
                    <span>{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                      className="btn btn-sm"
                      style={{ minHeight: '36px', minWidth: '36px' }}
                    >
                      +
                    </button>
                  </div>
                  <div className="cart-item-total">
                    <p>${item.total.toFixed(2)}</p>
                    <button
                      onClick={() => removeFromCart(item.product.id)}
                      className="btn btn-danger btn-sm"
                      style={{ minHeight: '36px', minWidth: '36px' }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {cart.length > 0 && (
            <div className="cart-summary">
              <div className="summary-row">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="summary-row">
                <span>Tax</span>
                <span>${taxAmount.toFixed(2)}</span>
              </div>
              <div className="summary-row total">
                <span>Total</span>
                <span>${total.toFixed(2)}</span>
              </div>
              <button
                onClick={handleCheckout}
                disabled={processing}
                className="btn btn-primary btn-full"
                style={{ minHeight: '56px' }}
              >
                {processing ? 'Processing...' : `Checkout $${total.toFixed(2)}`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
