export const workflowEs = {
  emptyCatalog: 'No hay registros activos para seleccionar. Agr?galos en Cat?logo antes de continuar.',
  openCatalog: 'Abrir Cat?logo',
  inventoryHelp:
    'Elige qué ocurrió, selecciona la sucursal y el producto, e indica la cantidad y el motivo.',
  operationSaved: 'Operación registrada. El inventario se actualizó.',
  branch: 'Sucursal',
  destination: 'Sucursal de destino',
  destinationHelp: 'Selecciona una sucursal distinta de la de origen.',
  reasonHelp: 'Describe el motivo. Ejemplo: recepción de mercancía del proveedor.',
  ENTRY: 'Entrada: suma mercancía recibida a la sucursal seleccionada.',
  MANUAL_EXIT: 'Salida: descuenta mercancía de la sucursal. Indica una cantidad positiva.',
  POSITIVE_ADJUSTMENT: 'Ajuste positivo: suma la diferencia encontrada al contar existencias.',
  NEGATIVE_ADJUSTMENT: 'Ajuste negativo: resta la diferencia encontrada al contar existencias.',
  TRANSFER: 'Transferencia: mueve la cantidad indicada de la sucursal de origen a la de destino.',
  REVERSAL:
    'Reversión: deshace una operación previa. Copia su identificador del historial e indica el motivo.',
  printHelp:
    'Selecciona el perfil aprobado y pulsa Conectar impresora para elegir el dispositivo Bluetooth. Registrar el perfil no conecta el dispositivo.',
  bluetoothHelp:
    'Enciende la impresora y desconéctala de otras aplicaciones. Debe admitir Bluetooth BLE; una impresora que solo usa Bluetooth clásico no aparece en este selector.',
  printSnapshot: 'Preparar reporte para imprimir o descargar',
  printSnapshotHelp:
    'Guarda una copia del reporte y genera su documento para imprimirlo por Bluetooth o descargarlo.',
};
export const workflowEn: Record<keyof typeof workflowEs, string> = {
  emptyCatalog: 'There are no active records to select. Add them in Catalog before continuing.',
  openCatalog: 'Open Catalog',
  inventoryHelp:
    'Choose the operation, select a branch and product, then enter the quantity and reason.',
  operationSaved: 'Operation recorded. Inventory has been updated.',
  branch: 'Branch',
  destination: 'Destination branch',
  destinationHelp: 'Choose a branch different from the source.',
  reasonHelp: 'Describe why. Example: goods received from supplier.',
  ENTRY: 'Entry: add received goods to the selected branch.',
  MANUAL_EXIT: 'Exit: remove goods from the branch. Enter a positive quantity.',
  POSITIVE_ADJUSTMENT: 'Positive adjustment: add the difference found during a stock count.',
  NEGATIVE_ADJUSTMENT: 'Negative adjustment: subtract the difference found during a stock count.',
  TRANSFER: 'Transfer: move the entered quantity from the source branch to the destination.',
  REVERSAL:
    'Reversal: undo a previous operation. Copy its identifier from history and enter the reason.',
  printHelp:
    'Choose the approved profile and click Connect printer to select the Bluetooth device. Registering a profile does not connect the device.',
  bluetoothHelp:
    'Turn the printer on and disconnect it from other apps. Bluetooth BLE is required; printers using only classic Bluetooth do not appear in this selector.',
  printSnapshot: 'Prepare report for printing or download',
  printSnapshotHelp:
    'Save a report snapshot and generate its document to print over Bluetooth or download.',
};
