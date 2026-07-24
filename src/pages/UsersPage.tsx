import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import UserMenu from '../components/UserMenu'

type UserRole = 'admin' | 'manager' | 'sales'

type UserWithRole = {
  id: string
  auth_id: string
  role: UserRole
  full_name: string
  phone: string
  email?: string
  is_active: boolean
  created_at: string
}

export default function UsersPage() {
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<UserWithRole[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState<UserWithRole | null>(null)
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    phone: '',
    role: 'sales' as UserRole,
  })

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    try {
      const { data } = await supabase
        .from('user_roles')
        .select('*')
        .order('created_at', { ascending: false })

      // Get emails from auth.users
      const usersWithEmails = await Promise.all(
        (data || []).map(async (user) => {
          const { data: authUser } = await supabase.auth.admin.getUserById(user.auth_id)
          return {
            ...user,
            email: authUser?.user?.email,
          }
        })
      )

      setUsers(usersWithEmails as UserWithRole[])
    } catch (error) {
      console.error('Error loading users:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddUser = () => {
    setEditingUser(null)
    setFormData({
      email: '',
      full_name: '',
      phone: '',
      role: 'sales',
    })
    setShowModal(true)
  }

  const handleEditUser = (user: UserWithRole) => {
    setEditingUser(user)
    setFormData({
      email: user.email || '',
      full_name: user.full_name,
      phone: user.phone,
      role: user.role,
    })
    setShowModal(true)
  }

  const handleSaveUser = async () => {
    try {
      if (editingUser) {
        // Update existing user role
        await supabase
          .from('user_roles')
          .update({
            role: formData.role,
            full_name: formData.full_name,
            phone: formData.phone,
          })
          .eq('auth_id', editingUser.auth_id)
      } else {
        // Create new user
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: 'TempPassword123!', // In production, you'd want a better flow
        })

        if (authError) throw authError

        if (authData.user) {
          await supabase.from('user_roles').insert({
            auth_id: authData.user.id,
            role: formData.role,
            full_name: formData.full_name,
            phone: formData.phone,
          })
        }
      }

      setShowModal(false)
      loadUsers()
    } catch (error) {
      console.error('Error saving user:', error)
      alert('Error saving user. Make sure the email is valid.')
    }
  }

  const handleToggleActive = async (user: UserWithRole) => {
    if (user.auth_id === currentUser?.id) {
      alert('You cannot deactivate yourself')
      return
    }

    try {
      await supabase
        .from('user_roles')
        .update({ is_active: !user.is_active })
        .eq('auth_id', user.auth_id)
      loadUsers()
    } catch (error) {
      console.error('Error toggling user:', error)
    }
  }

  const handleDeleteUser = async (authId: string) => {
    if (authId === currentUser?.id) {
      alert('You cannot delete yourself')
      return
    }

    if (!confirm('Are you sure you want to delete this user?')) return

    try {
      await supabase.from('user_roles').delete().eq('auth_id', authId)
      loadUsers()
    } catch (error) {
      console.error('Error deleting user:', error)
      alert('Error deleting user')
    }
  }

  if (loading) {
    return <div className="loading-screen">Loading users...</div>
  }

  return (
    <div className="users-container">
      <header className="page-header">
        <div>
          <button onClick={() => navigate('/dashboard')} className="btn btn-secondary">
            ← Back
          </button>
          <h1>User Management</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button onClick={handleAddUser} className="btn btn-primary" style={{ minHeight: '44px' }}>
            + Add User
          </button>
          <UserMenu />
        </div>
      </header>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Role</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id}>
                <td>
                  <strong>{user.full_name || 'N/A'}</strong>
                  {user.auth_id === currentUser?.id && (
                    <span className="badge" style={{ marginLeft: '0.5rem' }}>You</span>
                  )}
                </td>
                <td>{user.email || 'N/A'}</td>
                <td>{user.phone || 'N/A'}</td>
                <td>
                  <span className={`badge ${user.role === 'admin' ? 'admin' : user.role === 'manager' ? 'manager' : 'sales'}`}>
                    {user.role}
                  </span>
                </td>
                <td>
                  <button
                    onClick={() => handleToggleActive(user)}
                    className={`btn btn-sm ${user.is_active ? 'btn-success' : 'btn-secondary'}`}
                    style={{ minHeight: '36px', minWidth: '80px' }}
                    disabled={user.auth_id === currentUser?.id}
                  >
                    {user.is_active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td>
                  <div className="action-buttons">
                    <button
                      onClick={() => handleEditUser(user)}
                      className="btn btn-sm btn-secondary"
                      style={{ minHeight: '36px', minWidth: '36px' }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteUser(user.auth_id)}
                      className="btn btn-sm btn-danger"
                      style={{ minHeight: '36px', minWidth: '36px' }}
                      disabled={user.auth_id === currentUser?.id}
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
            <h2>{editingUser ? 'Edit User' : 'Add New User'}</h2>
            <form onSubmit={(e) => { e.preventDefault(); handleSaveUser(); }} className="modal-form">
              {!editingUser && (
                <div className="form-group">
                  <label>Email *</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    className="form-input"
                    style={{ minHeight: '44px' }}
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                    A temporary password will be set. User should change it after first login.
                  </p>
                </div>
              )}
              <div className="form-group">
                <label>Full Name *</label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  required
                  className="form-input"
                  style={{ minHeight: '44px' }}
                />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="form-input"
                  style={{ minHeight: '44px' }}
                />
              </div>
              <div className="form-group">
                <label>Role *</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                  required
                  className="form-input"
                  style={{ minHeight: '44px' }}
                >
                  <option value="sales">Sales - Can log expenses and process sales</option>
                  <option value="manager">Manager - Can manage inventory and view dashboard</option>
                  <option value="admin">Admin - Full access including user management</option>
                </select>
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
                  {editingUser ? 'Update User' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
