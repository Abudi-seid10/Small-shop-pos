import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function UserMenu() {
  const { user, logout, isAdmin, isManager, isSales } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const getRoleBadge = () => {
    if (isAdmin) return 'Admin'
    if (isManager) return 'Manager'
    if (isSales) return 'Sales'
    return 'User'
  }

  const getRoleClass = () => {
    if (isAdmin) return 'admin'
    if (isManager) return 'manager'
    if (isSales) return 'sales'
    return ''
  }

  return (
    <div className="user-menu">
      <div className="user-info">
        <div className="user-avatar">
          {user?.email?.charAt(0).toUpperCase() || 'U'}
        </div>
        <div className="user-details">
          <p className="user-email">{user?.email || 'User'}</p>
          <span className={`badge ${getRoleClass()}`}>{getRoleBadge()}</span>
        </div>
      </div>
      <div className="user-actions">
        <button
          onClick={() => navigate('/expenses')}
          className="btn btn-secondary btn-sm"
          style={{ minHeight: '36px' }}
          title="Log Expense"
        >
          💰 Log Expense
        </button>
        <button
          onClick={handleLogout}
          className="btn btn-danger btn-sm"
          style={{ minHeight: '36px' }}
          title="Logout"
        >
          Logout
        </button>
      </div>
    </div>
  )
}
