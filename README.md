# Reinforced Hopper (Tolva Reforzada)

Mod para **Minecraft 1.21.9 (Fabric)** inspirado en *faster_hopper*.

---

## 🚀 Características

### 1. Tolva Reforzada (Reinforced Hopper)
- **7 slots de almacenamiento** estándar para ítems.
- **Velocidad base 2.5x más rápida** que una tolva vainilla (cooldown de 3 ticks vs 8 ticks de vainilla).
- Mueve ítems hacia abajo y a los lados como una tolva normal.
- Acabado metálico en **hierro plateado brillante**.

### 2. Tolva Reforzada Invertida (Inverted Reinforced Hopper)
- Misma capacidad de **7 slots de almacenamiento** y velocidad 2.5x (o x3 con mejora).
- **Transporte invertido (hacia arriba)**:
  - Chupa / extrae ítems del contenedor que tenga **debajo**.
  - Empuja ítems hacia **arriba** (o hacia los lados según su orientación).
  - Succiona objetos caídos en su receptáculo inferior.
- Modelo y textura invertidos verticalmente.

### 3. Doble Ranura de Mejoras en la Interfaz (GUI)
La interfaz incluye 7 slots para ítems y **2 slots de mejora dedicados** a la derecha:
- **Slot 1 (Icono de Diamante)**: Reservado exclusivamente para la **Mejora de Diamante**.
  - Eleva la velocidad de transferencia a **x3** (cooldown de **1 tick**, transfiriendo **20 ítems/segundo**).
- **Slot 2 (Icono de Bloque)**: Reservado exclusivamente para **Bloques de Mejora de Carriles**:
  - **Bloque de Esmeralda**: Genera **2 carriles** de transporte para ítems diferentes y aporta un **5% de aumento de velocidad**.
  - **Bloque de Diamante**: Genera **2 carriles** simultáneos para ítems de diferente tipo.
  - **Bloque de Netherita**: Genera **4 carriles** simultáneos para ítems de diferente tipo.

> **💡 Funcionamiento por franjas / carriles**:  
> Si la tolva transporta un solo tipo de ítem (por ejemplo, solo bloques de hierro), enviará a la velocidad normal (1 ítem por ciclo). Pero si la tolva contiene **diferentes tipos de ítems**, los carriles adicionales permiten transferir múltiples ítems distintos al mismo tiempo sin tener que esperar a vaciar el primero.

### 4. Seguridad de Redstone y Automatizaciones
- Los dos slots de mejoras están **protegidos al 100%**: otras tolvas, sistemas de tuberías o caída de ítems solo interactúan con los 7 slots de almacenamiento; las mejoras nunca se salen ni se mezclan.
- Los comparadores de Redstone calculan la señal de llenado basándose en los 7 slots de almacenamiento.

---

## 🛠️ Crafteos

### 1. Tolva Reforzada Normal (Cuarzo ARRIBA)
Posiciones con cuarzo en la fila superior (forma de tolva):
- **Arriba**: Bloque de hierro | Cuarzo | Bloque de hierro
- **Centro**: Bloque de hierro | Tolva | Bloque de hierro
- **Abajo**: Vacío | Bloque de hierro | Vacío

```
[B.Hierro][ Cuarzo ] [B.Hierro]
[B.Hierro][  Tolva ] [B.Hierro]
[       ] [B.Hierro] [       ]
```

### 2. Tolva Reforzada Invertida (Cuarzo ABAJO)
Posiciones con cuarzo en la fila inferior (forma invertida):
- **Arriba**: Vacío | Bloque de hierro | Vacío
- **Centro**: Bloque de hierro | Tolva | Bloque de hierro
- **Abajo**: Bloque de hierro | Cuarzo | Bloque de hierro

```
[       ] [B.Hierro] [       ]
[B.Hierro][  Tolva ] [B.Hierro]
[B.Hierro][ Cuarzo ] [B.Hierro]
```

### 3. Mejora de Diamante (Reinforced Speed Upgrade)
- **8 Lingotes de hierro** alrededor.
- **1 Diamante** en el centro.

```
[Hierro][ Hierro ][Hierro]
[Hierro][Diamante][Hierro]
[Hierro][ Hierro ][Hierro]
```

---

## 📦 Instalación

El archivo ya ha sido colocado directamente en tu carpeta de mods:
`%appdata%\.minecraft\mods\reinforced_hopper-1.0.0.jar`
