const SESSION_KEY = 'stock-control:temporary-session'

export function createTemporarySession(remember: boolean) {
  const storage = remember ? localStorage : sessionStorage
  storage.setItem(SESSION_KEY, 'admin')
}

export function hasTemporarySession() {
  return sessionStorage.getItem(SESSION_KEY) === 'admin' || localStorage.getItem(SESSION_KEY) === 'admin'
}

export function clearTemporarySession() {
  sessionStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(SESSION_KEY)
}
