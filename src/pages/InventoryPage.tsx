import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import UserMenu from '../components/UserMenu'

type Product = {
  id: string
  name: string
  sku: string
  barcode: string
  category_id: string
  description: string
  cost_price: number
  selling_price: number
  stock_quantity: number
  min_stock_level: number
  tax_rate: number
  is_active: boolean
}

type Category = {
  id: string
  name: string
}

export default function InventoryPage() {
  const navigate = useNavigate()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    barcode: '',
    category_id: '',
    description: '',
    cost_price: '',
    selling_price: '',
    stock_quantity: '',
    min_stock_level: '10',
    tax_rate: '0',
  })

  useEffect(() => {
    loadProducts()
    loadCategories()
  }, [])

  const loadProducts = async () => {
    try {
      const { data } = await supabase
        .from('products')
        .select('*, categories(name)')
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

  const handleAddProduct = () => {
    setEditingProduct(null)
    setFormData({
      name: '',
      sku: '',
      barcode: '',
      category_id: '',
      description: '',
      cost_price: '',
      selling_price: '',
      stock_quantity: '',
      min_stock_level: '10',
      tax_rate: '0',
    })
    setShowModal(true)
  }

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product)
    setFormData({
      name: product.name,
      sku: product.sku || '',
      barcode: product.barcode || '',
      category_id: product.category_id || '',
      description: product.description || '',
      cost_price: product.cost_price.toString(),
      selling_price: product.selling_price.toString(),
      stock_quantity: product.stock_quantity.toString(),
      min_stock_level: product.min_stock_level.toString(),
      tax_rate: product.tax_rate.toString(),
    })
    setShowModal(true)
  }

  const handleSaveProduct = async () => {
    try {
      const productData = {
        name: formData.name,
        sku: formData.sku || null,
        barcode: formData.barcode || null,
        category_id: formData.category_id || null,
        description: formData.description || null,
        cost_price: parseFloat(formData.cost_price) || 0,
        selling_price: parseFloat(formData.selling_price) || 0,
        stock_quantity: parseInt(formData.stock_quantity) || 0,
        min_stock_level: parseInt(formData.min_stock_level) || 10,
        tax_rate: parseFloat(formData.tax_rate) || 0,
      }

      if (editingProduct) {
        await supabase
          .from('products')
          .update(productData)
          .eq('id', editingProduct.id)
      } else {
        await supabase
          .from('products')
          .insert(productData)
      }

      setShowModal(false)
      loadProducts()
    } catch (error) {
      console.error('Error saving product:', error)
      alert('Error saving product')
    }
  }

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return

    try {
      await supabase.from('products').delete().eq('id', id)
      loadProducts()
    } catch (error) {
      console.error('Error deleting product:', error)
      alert('Error deleting product')
    }
  }

  const handleToggleActive = async (product: Product) => {
    try {
      await supabase
        .from('products')
        .update({ is_active: !product.is_active })
        .eq('id', product.id)
      loadProducts()
    } catch (error) {
      console.error('Error toggling product:', error)
    }
  }

  if (loading) {
    return <div className="loading-screen">Loading inventory...</div>
  }

  return (
    <div className="inventory-container">
      <header className="page-header">
        <div>
          <button onClick={() => navigate('/dashboard')} className="btn btn-secondary">
            ← Back
          </button>
          <h1>Inventory Management</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button onClick={handleAddProduct} className="btn btn-primary" style={{ minHeight: '44px' }}>
            + Add Product
          </button>
          <UserMenu />
        </div>
      </header>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>SKU</th>
              <th>Category</th>
              <th>Stock</th>
              <th>Cost</th>
              <th>Price</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map(product => (
              <tr key={product.id}>
                <td>
                  <strong>{product.name}</strong>
                  {product.description && <p className="text-sm">{product.description}</p>}
                </td>
                <td>{product.sku || '-'}</td>
                <td>{(product as any).categories?.name || '-'}</td>
                <td>
                  <span className={product.stock_quantity <= product.min_stock_level ? 'text-danger' : ''}>
                    {product.stock_quantity}
                  </span>
                </td>
                <td>${product.cost_price.toFixed(2)}</td>
                <td>${product.selling_price.toFixed(2)}</td>
                <td>
                  <button
                    onClick={() => handleToggleActive(product)}
                    className={`btn btn-sm ${product.is_active ? 'btn-success' : 'btn-secondary'}`}
                    style={{ minHeight: '36px', minWidth: '80px' }}
                  >
                    {product.is_active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td>
                  <div className="action-buttons">
                    <button
                      onClick={() => handleEditProduct(product)}
                      className="btn btn-sm btn-secondary"
                      style={{ minHeight: '36px', minWidth: '36px' }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteProduct(product.id)}
                      className="btn btn-sm btn-danger"
                      style={{ minHeight: '36px', minWidth: '36px' }}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>{editingProduct ? 'Edit Product' : 'Add New Product'}</h2>
            <form onSubmit={(e) => { e.preventDefault(); handleSaveProduct(); }} className="modal-form">
              <div className="form-group">
                <label>Product Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="form-input"
                  style={{ minHeight: '44px' }}
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>SKU</label>
                  <input
                    type="text"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    className="form-input"
                    style={{ minHeight: '44px' }}
                  />
                </div>
                <div className="form-group">
                  <label>Barcode</label>
                  <input
                    type="text"
                    value={formData.barcode}
                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    className="form-input"
                    style={{ minHeight: '44px' }}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Category</label>
                <select
                  value={formData.category_id}
                  onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                  className="form-input"
                  style={{ minHeight: '44px' }}
                >
                  <option value="">Select category</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="form-input"
                  rows={3}
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Cost Price *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.cost_price}
                    onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
                    required
                    className="form-input"
                    style={{ minHeight: '44px' }}
                  />
                </div>
                <div className="form-group">
                  <label>Selling Price *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.selling_price}
                    onChange={(e) => setFormData({ ...formData, selling_price: e.target.value })}
                    required
                    className="form-input"
                    style={{ minHeight: '44px' }}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Stock Quantity *</label>
                  <input
                    type="number"
                    value={formData.stock_quantity}
                    onChange={(e) => setFormData({ ...formData, stock_quantity: e.target.value })}
                    required
                    className="form-input"
                    style={{ minHeight: '44px' }}
                  />
                </div>
                <div className="form-group">
                  <label>Min Stock Level</label>
                  <input
                    type="number"
                    value={formData.min_stock_level}
                    onChange={(e) => setFormData({ ...formData, min_stock_level: e.target.value })}
                    className="form-input"
                    style={{ minHeight: '44px' }}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Tax Rate (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.tax_rate}
                  onChange={(e) => setFormData({ ...formData, tax_rate: e.target.value })}
                  className="form-input"
                  style={{ minHeight: '44px' }}
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-secondary"
                  style={{ minHeight: '44px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ minHeight: '44px' }}
                >
                  Save Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
