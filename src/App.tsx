import { useEffect, useState } from 'react'
import './App.css'
import { supabase } from './utils/supabase'

type Theme = 'light' | 'dark'

type Todo = {
  id: number | string
  name: string
}

function getInitialTheme(): Theme {
  const storedTheme = localStorage.getItem('theme')

  if (storedTheme === 'light' || storedTheme === 'dark') {
    return storedTheme
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    let ignore = false

    async function getTodos() {
      const { data, error: queryError } = await supabase
        .from('todos')
        .select('id, name')
        .order('id', { ascending: true })

      if (ignore) {
        return
      }

      if (queryError) {
        setError(queryError.message)
      } else {
        setTodos((data ?? []) as Todo[])
      }

      setLoading(false)
    }

    void getTodos()

    return () => {
      ignore = true
    }
  }, [])

  return (
    <main className="app-shell">
      <section className="card">
        <div className="card__header">
          <div>
            <p className="eyebrow">Small Shop POS</p>
            <h1>Inventory todos</h1>
            <p className="subtitle">Live task data loaded from Supabase.</p>
          </div>
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? 'Dark mode' : 'Light mode'}
          </button>
        </div>

        {loading ? <p className="status">Loading todos…</p> : null}
        {error ? <p className="status status--error">{error}</p> : null}

        {!loading && !error ? (
          <ul className="todo-list">
            {todos.length > 0 ? (
              todos.map((todo) => <li key={todo.id}>{todo.name}</li>)
            ) : (
              <li>No todos found.</li>
            )}
          </ul>
        ) : null}
      </section>
    </main>
  )
}

export default App
