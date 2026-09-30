# Sesiones U-SCRIPT-2 / U-FIXTURE-2

Estado: preparación en curso; ninguna sesión medida ha empezado.
Versión inicial: 29880c8. Participantes: D01, D02, A01, A02.

## Continuación del 2026-09-30

Se recrearon los seis entornos locales y se verificaron las existencias iniciales.
El entorno de entrenamiento del chofer respondió HTTP 200. Se entregaron las
instrucciones de introducción, pero no se recibieron horas de inicio/fin ni
resultados de participantes. No se acredita capacitación completada ni intento
medido. T141 permanece pendiente.

El propietario pidió guardar este avance y abrir una rama para rediseñar la
aplicación: considera que la interfaz no es intuitiva y que los botones no son
claros para el vendedor. Las sesiones quedan pendientes mientras se trabaja en
el rediseño. Antes de retomarlas, fijar la nueva versión y revisar el protocolo y
los datos de prueba correspondientes.

Cada participante tiene una base PostgreSQL temporal independiente. El catálogo y
los usuarios se generan como datos sintéticos; la confirmación de carga, inicio y
regreso de ruta se realizan por las APIs del negocio. Se verifican existencias de
5.000 por producto antes de entregar la pantalla. Esto concreta la preparación de
U-FIXTURE-2; no es una ejecución de los participantes.

| Participante | Pantalla | Introducción inicio/fin | Intento inicio/fin | Resultado |
| --- | --- | --- | --- | --- |
| D01 | localhost:5180 | pendiente | pendiente | NO INICIADO |
| D02 | localhost:5181 | pendiente | pendiente | NO INICIADO |
| A01 | localhost:5182 | pendiente | pendiente | NO INICIADO |
| A02 | localhost:5183 | pendiente | pendiente | NO INICIADO |

Entrenamiento separado: venta en 127.0.0.1:5184; conciliación en 127.0.0.1:5185.
Usar 127.0.0.1 para abrir todos los entornos. Los puertos no aíslan cookies: al
cambiar de entorno hay que autenticar la cuenta correspondiente, y verificar la
sesión antes de medir. No navegar entre entornos durante el intento.

Conservar hora real y cronómetro continuo de cada sesión. La disponibilidad del
primer chofer fue confirmada, pero no se ha registrado inicio de introducción ni
entrega del ejercicio. No inferir tiempos a partir de mensajes posteriores.
