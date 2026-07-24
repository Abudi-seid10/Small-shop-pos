import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import POSPage from './pages/POSPage'
import InventoryPage from './pages/InventoryPage'
import SalesPage from './pages/SalesPage'
import ExpensesPage from './pages/ExpensesPage'
import UsersPage from './pages/UsersPage'
import './App.css'

function ProtectedRoute({ children, requiredPermission }: { children: React.ReactNode, requiredPermission?: keyof ReturnType<typeof useAuth> }) {
  const { isAuthenticated, loading } = useAuth()
  const auth = useAuth()

  if (loading) {
    return <div className="loading-screen">Loading...</div>
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (requiredPermission && !auth[requiredPermission]) {
    return <Navigate to="/pos" replace />
  }

  return <>{children}</>
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute requiredPermission="canAccessDashboard">
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pos"
            element={
              <ProtectedRoute>
                <POSPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventory"
            element={
              <ProtectedRoute requiredPermission="canAccessInventory">
                <InventoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sales"
            element={
              <ProtectedRoute>
                <SalesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/expenses"
            element={
              <ProtectedRoute>
                <ExpensesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute requiredPermission="canAccessUsers">
                <UsersPage />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<RoleBasedRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

function RoleBasedRedirect() {
  const { canAccessDashboard, isAuthenticated, user } = useAuth()
  
  console.log('RoleBasedRedirect - isAuthenticated:', isAuthenticated, 'user:', user)
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  
  if (canAccessDashboard) {
    console.log('Redirecting to dashboard')
    return <Navigate to="/dashboard" replace />
  }
  
  console.log('Redirecting to POS (no dashboard access)')
  return <Navigate to="/pos" replace />
}

export default App
