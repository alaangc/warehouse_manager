export type DeliveryStatus = 'preparing' | 'en-route' | 'returned' | 'closed'

export type DeliveryCustomer = {
  id: string
  name: string
  status: 'visited' | 'pending'
  amountCents?: number
  amount?: string
  note: string
  address: string
  phone: string
  deliveredProducts: Array<{
    id: string
    name: string
    category: string
    quantity: number
    unitPriceCents: number
  }>
}

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
  observations?: string
  customers: DeliveryCustomer[]
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
      { id: 'CLI-00125', name: 'Abarrotes La Esquina', status: 'visited', amountCents: 125000, amount: '$1,250.00', note: 'Venta realizada', address: 'Av. Juárez 125, Centro, Magdalena', phone: '632 115 2048', deliveredProducts: [
        { id: 'PROD-001', name: 'Refresco cola 600 ml', category: 'Bebidas', quantity: 10, unitPriceCents: 2500 },
        { id: 'PROD-014', name: 'Agua purificada 1 L', category: 'Bebidas', quantity: 8, unitPriceCents: 1500 },
        { id: 'PROD-032', name: 'Papas saladas 45 g', category: 'Botanas', quantity: 12, unitPriceCents: 2000 },
        { id: 'PROD-046', name: 'Galletas de chocolate', category: 'Dulces y galletas', quantity: 8, unitPriceCents: 2500 },
        { id: 'PROD-059', name: 'Aceite vegetal 900 ml', category: 'Abarrotes', quantity: 4, unitPriceCents: 11000 },
      ] },
      { id: 'CLI-00142', name: 'Miscelánea El Sol', status: 'visited', amountCents: 85000, amount: '$850.00', note: 'Venta realizada', address: 'Calle Sonora 42, San Martín, Magdalena', phone: '632 112 8730', deliveredProducts: [
        { id: 'PROD-001', name: 'Refresco cola 600 ml', category: 'Bebidas', quantity: 10, unitPriceCents: 2500 },
        { id: 'PROD-032', name: 'Papas saladas 45 g', category: 'Botanas', quantity: 10, unitPriceCents: 2000 },
        { id: 'PROD-059', name: 'Aceite vegetal 900 ml', category: 'Abarrotes', quantity: 4, unitPriceCents: 10000 },
      ] },
      { id: 'CLI-00158', name: 'Tienda Don Nacho', status: 'pending', note: 'Pendiente de visita', address: 'Blvd. Kino 318, La Industria, Magdalena', phone: '632 118 4512', deliveredProducts: [] },
      { id: 'CLI-00163', name: 'Depósito Los Amigos', status: 'pending', note: 'Pendiente de visita', address: 'Calle Reforma 63, Fátima, Magdalena', phone: '632 109 6621', deliveredProducts: [] },
    ],
  },
]
