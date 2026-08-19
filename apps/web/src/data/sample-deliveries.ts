export type DeliveryStatus = 'preparing' | 'en-route' | 'returned' | 'closed'

export type Delivery = {
  id: string
  driverName: string
  startTime: string
  status: DeliveryStatus
  origin: string
  vehicle: string
  startedAt: string
  accountName: string
  accountCode: string
  totalItems: number
  loadedProducts: number
  soldProducts: number
  customers: Array<{
    id: string
    name: string
    status: 'visited' | 'pending'
    amountCents?: number
    amount?: string
    note: string
  }>
}

export const sampleDeliveries: Delivery[] = [
  {
    id: 'R-00023',
    driverName: 'Juan Pérez',
    startTime: '8:30 AM',
    status: 'en-route',
    origin: 'Magdalena',
    vehicle: 'Camioneta 1',
    startedAt: '19 may 2025 · 08:15 a.m.',
    accountName: 'Abarrotes La Esquina',
    accountCode: 'CLI-00125',
    totalItems: 85,
    loadedProducts: 85,
    soldProducts: 23,
    customers: [
      { id: 'CLI-00125', name: 'Abarrotes La Esquina', status: 'visited', amountCents: 125000, amount: '$1,250.00', note: 'Venta realizada' },
      { id: 'CLI-00142', name: 'Miscelánea El Sol', status: 'visited', amountCents: 85000, amount: '$850.00', note: 'Venta realizada' },
      { id: 'CLI-00158', name: 'Tienda Don Nacho', status: 'pending', note: 'Pendiente de visita' },
      { id: 'CLI-00163', name: 'Depósito Los Amigos', status: 'pending', note: 'Pendiente de visita' },
    ],
  },
]
