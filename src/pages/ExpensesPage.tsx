import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import UserMenu from '../components/UserMenu'

type Expense = {
  id: string
  expense_number: string
  category: string
  description: string
  amount: number
  expense_date: string
  payment_method: string
  notes: string
}

export default function ExpensesPage() {
  const navigate = useNavigate()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [formData, setFormData] = useState({
    category: 'other',
    description: '',
    amount: '',
    expense_date: new Date().toISOString().split('T')[0],
    payment_method: 'cash',
    notes: '',
  })

  useEffect(() => {
    loadExpenses()
  }, [])

  const loadExpenses = async () => {
    try {
      const { data } = await supabase
        .from('expenses')
        .select('*')
        .order('expense_date', { ascending: false })

      setExpenses(data || [])
    } catch (error) {
      console.error('Error loading expenses:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddExpense = () => {
    setEditingExpense(null)
    setFormData({
      category: 'other',
      description: '',
      amount: '',
      expense_date: new Date().toISOString().split('T')[0],
      payment_method: 'cash',
      notes: '',
    })
    setShowModal(true)
  }

  const handleEditExpense = (expense: Expense) => {
    setEditingExpense(expense)
    setFormData({
      category: expense.category,
      description: expense.description,
      amount: expense.amount.toString(),
      expense_date: expense.expense_date,
      payment_method: expense.payment_method || 'cash',
      notes: expense.notes || '',
    })
    setShowModal(true)
  }

  const handleSaveExpense = async () => {
    try {
      const expenseData = {
        expense_number: `EXP-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(Math.random() * 10000).toString().padStart(4,'0')}`,
        category: formData.category,
        description: formData.description,
        amount: parseFloat(formData.amount) || 0,
        expense_date: formData.expense_date,
        payment_method: formData.payment_method,
        notes: formData.notes || null,
      }

      if (editingExpense) {
        await supabase
          .from('expenses')
          .update(expenseData)
          .eq('id', editingExpense.id)
      } else {
        await supabase
          .from('expenses')
          .insert(expenseData)
      }

      setShowModal(false)
      loadExpenses()
    } catch (error) {
      console.error('Error saving expense:', error)
      alert('Error saving expense')
    }
  }

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('Are you sure you want to delete this expense?')) return

    try {
      await supabase.from('expenses').delete().eq('id', id)
      loadExpenses()
    } catch (error) {
      console.error('Error deleting expense:', error)
      alert('Error deleting expense')
    }
  }

  const totalExpenses = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0)

  if (loading) {
    return <div className="loading-screen">LoadingExpenses...</div>
  }

  return (
    <div className="expenses-container">
      <header className="page-header">
        <div>
          <button onClick={() => navigate('/dashboard')} className="btn btn-secondary">
            ← Back
          </button>
          <h1>Expense Management</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button onClick={handleAddExpense} className="btn btn-primary" style={{ minHeight: '44px' }}>
            + Add Expense
          </button>
          <UserMenu />
        </div>
      </header>

      <div className="expenses-summary">
        <div className="summary-card">
          <h3>Total Expenses</h3>
          <p className="summary-value">${totalExpenses.toFixed(2)}</p>
        </div>
        <div className="summary-card">
          <h3>Total Entries</h3>
          <p className="summary-value">{expenses.length}</p>
        </div>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Expense #</th>
              <th>Date</th>
              <th>Category</th>
              <th>Description</th>
              <th>Amount</th>
              <th>Payment</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map(expense => (
              <tr key={expense.id}>
                <td><strong>{expense.expense_number}</strong></td>
                <td>{new Date(expense.expense_date).toLocaleDateString()}</td>
                <td>
                  <span className="badge">{expense.category}</span>
                </td>
                <td>{expense.description}</td>
                <td><strong>${Number(expense.amount).toFixed(2)}</strong></td>
                <td>{expense.payment_method || '-'}</td>
                <td>
                  <div className="action-buttons">
                    <button
                      onClick={() => handleEditExpense(expense)}
                      className="btn btn-sm btn-secondary"
                      style={{ minHeight: '36px', minWidth: '36px' }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteExpense(expense.id)}
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
            <h2>{editingExpense ? 'Edit Expense' : 'Add New Expense'}</h2>
            <form onSubmit={(e) => { e.preventDefault(); handleSaveExpense(); }} className="modal-form">
              <div className="form-group">
                <label>Category *</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  required
                  className="form-input"
                  style={{ minHeight: '44px' }}
                >
                  <option value="rent">Rent</option>
                  <option value="utilities">Utilities</option>
                  <option value="supplies">Supplies</option>
                  <option value="salary">Salary</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label>Description *</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                  className="form-input"
                  style={{ minHeight: '44px' }}
                />
              </div>
              <div className="form-group">
                <label>Amount *</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  required
                  className="form-input"
                  style={{ minHeight: '44px' }}
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Date *</label>
                  <input
                    type="date"
                    value={formData.expense_date}
                    onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                    required
                    className="form-input"
                    style={{ minHeight: '44px' }}
                  />
                </div>
                <div className="form-group">
                  <label>Payment Method</label>
                  <select
                    value={formData.payment_method}
                    onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                    className="form-input"
                    style={{ minHeight: '44px' }}
                  >
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="form-input"
                  rows={3}
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
                  Save Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
