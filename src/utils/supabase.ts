import { createClient } from '@supabase/supabase-js'

function getEnvValue(name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_PUBLISHABLE_KEY') {
  const value = import.meta.env[name]

  if (!value) {
    throw new Error(`Missing required Supabase environment variable: ${name}`)
  }

  return value
}

const supabaseUrl = getEnvValue('VITE_SUPABASE_URL')
const supabaseKey = getEnvValue('VITE_SUPABASE_PUBLISHABLE_KEY')

export const supabase = createClient(supabaseUrl, supabaseKey)
