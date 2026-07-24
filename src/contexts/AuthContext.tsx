import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../utils/supabase'

type UserRole = 'admin' | 'manager' | 'sales'

type User = {
  id: string
  email?: string
  name?: string
  role?: UserRole
  full_name?: string
  phone?: string
}

type AuthContextType = {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  isAuthenticated: boolean
  hasRole: (role: UserRole) => boolean
  isAdmin: boolean
  isManager: boolean
  isSales: boolean
  canAccessInventory: boolean
  canAccessDashboard: boolean
  canAccessUsers: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const loadUserRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .eq('auth_id', userId)
        .eq('is_active', true)
        .single()

      if (error) {
        console.error('Error loading user role:', error)
        // Temporary fallback: if no role found, check if this is the first user
        // and grant admin access for initial setup
        const { count } = await supabase
          .from('user_roles')
          .select('*', { count: 'exact', head: true })
        
        if (count === 0) {
          console.log('No users in system yet, granting admin access for initial setup')
          return 'admin'
        }
        return undefined
      }

      console.log('Loaded user role:', data?.role)
      return data?.role as UserRole || undefined
    } catch (error) {
      console.error('Error loading user role:', error)
      return undefined
    }
  }

  useEffect(() => {
    // Check for existing session
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session?.user) {
        const role = await loadUserRole(session.user.id)
        setUser({
          id: session.user.id,
          email: session.user.email,
          role,
        })
      }
      
      setLoading(false)
    }

    checkSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          const role = await loadUserRole(session.user.id)
          setUser({
            id: session.user.id,
            email: session.user.email,
            role,
          })
        } else {
          setUser(null)
        }
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      throw error
    }

    if (data.user) {
      const role = await loadUserRole(data.user.id)
      setUser({
        id: data.user.id,
        email: data.user.email,
        role,
      })
    }
  }

  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  const hasRole = (role: UserRole): boolean => {
    return user?.role === role
  }

  const isAdmin = hasRole('admin')
  const isManager = hasRole('manager')
  const isSales = hasRole('sales')

  const canAccessInventory = isAdmin || isManager
  const canAccessDashboard = isAdmin || isManager
  const canAccessUsers = isAdmin

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        isAuthenticated: !!user,
        hasRole,
        isAdmin,
        isManager,
        isSales,
        canAccessInventory,
        canAccessDashboard,
        canAccessUsers,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
