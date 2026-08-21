export type InventoryProduct = {
  id: string
  name: string
  code: string
  category: string
  available: number
  minimum: number
  price: string
  cost: string
  unit: string
  packageSize: string
  supplier: string
  initial: string
  tone: 'blue' | 'orange' | 'purple' | 'green'
  locations: { name: string; stock: number; minimum: number }[]
  movements: { type: string; detail: string; amount: number }[]
}

export const inventoryProducts: InventoryProduct[] = [
  {
    id: 'coca-cola-600', name: 'Coca-Cola 600 ml', code: 'PROD-0001', category: 'Sodas', available: 12, minimum: 30,
    price: '$16.00', cost: '$11.50', unit: 'Pieza', packageSize: '24 piezas', supplier: 'Coca-Cola FEMSA', initial: 'C', tone: 'blue',
    locations: [{ name: 'Magdalena', stock: 8, minimum: 15 }, { name: 'Tucson', stock: 4, minimum: 10 }, { name: 'Camioneta 1', stock: 0, minimum: 5 }],
    movements: [{ type: 'Entrada de inventario', detail: 'Hoy, 10:42 a.m. · Magdalena', amount: 24 }, { type: 'Venta registrada', detail: 'Hoy, 9:15 a.m. · Juan Pérez', amount: -6 }],
  },
  {
    id: 'carbon-3kg', name: 'Carbón 3 kg', code: 'PROD-0018', category: 'Abarrotes', available: 5, minimum: 20,
    price: '$89.00', cost: '$61.00', unit: 'Bolsa', packageSize: '6 bolsas', supplier: 'Carbón del Norte', initial: 'C', tone: 'orange',
    locations: [{ name: 'Magdalena', stock: 3, minimum: 10 }, { name: 'Tucson', stock: 2, minimum: 7 }, { name: 'Camioneta 1', stock: 0, minimum: 3 }],
    movements: [{ type: 'Venta registrada', detail: 'Hoy, 11:20 a.m. · Mostrador', amount: -2 }, { type: 'Ajuste de inventario', detail: 'Ayer, 5:40 p.m. · Tucson', amount: -1 }],
  },
  {
    id: 'tostadas-20', name: 'Tostadas 20 pzas.', code: 'PROD-0032', category: 'Abarrotes', available: 8, minimum: 15,
    price: '$42.00', cost: '$29.50', unit: 'Paquete', packageSize: '12 paquetes', supplier: 'Tostadas del Sol', initial: 'T', tone: 'purple',
    locations: [{ name: 'Magdalena', stock: 5, minimum: 7 }, { name: 'Tucson', stock: 3, minimum: 5 }, { name: 'Camioneta 1', stock: 0, minimum: 3 }],
    movements: [{ type: 'Entrada de inventario', detail: 'Hoy, 8:30 a.m. · Magdalena', amount: 12 }, { type: 'Venta registrada', detail: 'Ayer, 4:18 p.m. · Reparto 001', amount: -4 }],
  },
  {
    id: 'sprite-600', name: 'Sprite 600 ml', code: 'PROD-0004', category: 'Sodas', available: 18, minimum: 30,
    price: '$16.00', cost: '$11.50', unit: 'Pieza', packageSize: '24 piezas', supplier: 'Coca-Cola FEMSA', initial: 'S', tone: 'green',
    locations: [{ name: 'Magdalena', stock: 10, minimum: 15 }, { name: 'Tucson', stock: 6, minimum: 10 }, { name: 'Camioneta 1', stock: 2, minimum: 5 }],
    movements: [{ type: 'Entrada de inventario', detail: 'Hoy, 9:05 a.m. · Tucson', amount: 24 }, { type: 'Venta registrada', detail: 'Hoy, 8:46 a.m. · Reparto 002', amount: -6 }],
  },
]

export function getInventoryProduct(productId: string | undefined) {
  return inventoryProducts.find(({ id }) => id === productId)
}
