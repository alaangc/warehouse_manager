import { sampleDeliveries, type Delivery } from '../data/sample-deliveries'

const STORAGE_KEY = 'stock-control:created-deliveries'

export function getDeliveries(): Delivery[] {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown
    return [...sampleDeliveries, ...(Array.isArray(stored) ? stored as Delivery[] : [])]
  } catch {
    return sampleDeliveries
  }
}

export function saveDelivery(delivery: Delivery) {
  const createdDeliveries = getDeliveries().filter(({ id }) => !sampleDeliveries.some((sample) => sample.id === id))
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...createdDeliveries, delivery]))
}
