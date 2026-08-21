import type { Delivery, DeliveryCustomer } from '../data/sample-deliveries'

const STORAGE_KEY = 'stock-control:added-delivery-customers'

type StoredCustomers = Record<string, DeliveryCustomer[]>

function getStoredCustomers(): StoredCustomers {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as unknown
    return value && typeof value === 'object' && !Array.isArray(value) ? value as StoredCustomers : {}
  } catch {
    return {}
  }
}

export function getDeliveryCustomers(delivery?: Delivery) {
  if (!delivery) return []
  return [...delivery.customers, ...(getStoredCustomers()[delivery.id] ?? [])]
}

export function addDeliveryCustomer(deliveryId: string, customer: DeliveryCustomer) {
  const storedCustomers = getStoredCustomers()
  storedCustomers[deliveryId] = [...(storedCustomers[deliveryId] ?? []), customer]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(storedCustomers))
}
