# 🎯 Sistema de Mapping de Columnas CSV - Guía de Implementación

## 📋 Resumen

Se ha implementado un sistema completo de **mapeo de columnas** para la carga de CSV en el admin panel de Yair Timings. Este sistema permite a los administradores:

✅ Subir archivos CSV con estructura flexible  
✅ Auto-detectar encabezados y hacer mapeo automático  
✅ Asignar manualmente cada columna a un campo del sistema  
✅ Validar campos obligatorios antes de continuar  
✅ Mantener intacta la lógica de caché existente  

---

## 🏗️ Archivos Creados/Modificados

### Nuevos Archivos:
- **`js/columnMapping.js`** - Motor de mapping y transformación de CSV

### Archivos Modificados:
- **`admin.html`** - Agregado modal UI + lógica de interacción

---

## 🔄 Flujo Nuevo (Paso a Paso)

### Paso 1: Subir CSV
1. Admin hace clic en botón "Validar CSV"
2. Se abre el selector de archivo
3. Admin selecciona archivo `.csv`

### Paso 2: Mapping de Columnas (NUEVO)
1. Se abre modal automáticamente
2. Se muestra:
   - Toggle: "¿Tiene encabezados?"
   - Preview de primeras 5 filas
   - Para cada columna: selector para asignar a campo
3. Admin puede:
   - Hacer clic en "Auto-detectar" (llena automáticamente)
   - Cambiar manualmente seleccionando opciones
4. Sistema valida que estén asignados:
   - ✅ **BIB** (Dorsal) - Obligatorio
   - ✅ **Nombre** - Obligatorio
   - ✅ **Tiempo de Carrera** - Obligatorio
5. Si falta alguno: bloquea botón "Continuar"
6. Si todo está ok: admin hace clic "Continuar"

### Paso 3: Validación (Igual que antes)
- Los datos se procesan con el mapping aplicado
- Se muestra preview con datos transformados
- Se muestran estadísticas, duplicados, errores

### Paso 4: Guardado (Igual que antes)
- Admin hace clic "Guardar cache"
- Se guarda en IndexedDB (sin cambios)
- El botón persiste en BD normalmente

---

## 🔧 Campos Disponibles del Sistema

**Campos Obligatorios:**
- `bib` - Dorsal o número de corredor
- `name` - Nombre del corredor
- `race_time` - Tiempo oficial de carrera

**Campos Opcionales:**
- `gender` - Género (M/F/Otro)
- `category` - Categoría de edad
- `distance` - Distancia de la prueba
- `pace` - Ritmo/velocidad (min/km)
- `global_position` - Posición general
- `gender_position` - Posición dentro del género
- `category_position` - Posición dentro de la categoría

---

## 🧠 Auto-Detección Inteligente

El sistema reconoce automáticamente variaciones de nombres:

### BIB/Dorsal:
- "BIB", "Bib", "bib", "DORSAL", "dorsal", "Numero", "N.", "No.", "nº"

### Nombre:
- "Nombre", "Name", "Atleta", "Competidor", "Corredor", "Nombres", "Apellido Nombre"

### Tiempo:
- "Tiempo", "Tiempo oficial", "Time", "Net time", "Chip time", "Chrono"

### Género:
- "Genero", "Sexo", "Gender", "M/F", "Hombre/Mujer"

### Categoría:
- "Categoria", "Clase", "Division", "Grupo", "Edad", "Cat."

### Distancia:
- "Distancia", "Distance", "Prueba", "Carrera", "KM", "Kilometros"

---

## 📊 Estructura de Datos (Interno)

### Archivo: `js/columnMapping.js`

**Funciones Públicas:**
```javascript
ColumnMapping.analyzeCSV(csvText, hasHeaders)
  // Retorna: { headers, preview, autoMapping, totalRows, columnCount }

ColumnMapping.validateMapping(mapping)
  // Retorna: { isValid, errors, mappedFields }

ColumnMapping.transformCSV(csvText, mapping, hasHeaders)
  // Retorna: Array de objetos con datos transformados

ColumnMapping.getSistemaFields()
  // Retorna: Objeto con campos disponibles

ColumnMapping.autoDetectMapping(headers)
  // Retorna: Objeto con mapping automático

ColumnMapping.normalizeColumnName(name)
  // Retorna: Nombre normalizado para búsqueda
```

---

## 🎨 UI del Modal

**Ubicación:** Modal `#modal-column-mapping`

**Componentes:**
- Header con título "Paso 2 de 3"
- Info box con instrucciones
- Toggle para headers
- Tabla preview con datos
- Grid de selects para mapping (uno por columna)
- Box de validación (errores si los hay)
- Box de resumen (campos mapeados)
- Botones: Cancelar, Auto-detectar, Continuar

**Estado del Botón "Continuar":**
- Disabled (rojo) si hay errores de validación
- Enabled (azul) si todo está correcto

---

## ⚠️ Validaciones

1. **Campos Obligatorios:**
   - ✅ BIB debe estar asignado
   - ✅ Name debe estar asignado
   - ✅ Race Time debe estar asignado
   - ❌ Si falta alguno: muestra error y bloquea continuar

2. **Encabezados:**
   - Auto-detección al cambiar toggle
   - Si hay headers: primera fila se salta en datos
   - Si no hay headers: todas las filas son datos

3. **Transformación:**
   - Los datos se convierten a formato interno esperado por parser
   - Campos ignorados se descartan
   - Valores vacíos se preservan como vacíos

---

## 🔌 Integración con Sistema Existente

**Sin cambios en:**
- ❌ `YairStore.cacheSaveEvento()` - Mismo formato
- ❌ `YairStore.parseResultadosCsvForEvento()` - Mismo comportamiento
- ❌ Sistema de caché (IndexedDB) - Idéntico
- ❌ Guardado en BD - Sin cambios
- ❌ Validaciones de duplicados - Mismo comportamiento

**Cambios en:**
- ✅ `validateCsvFile()` - Ahora abre modal de mapping
- ✅ `validateCsvText()` - Se llama después del mapping
- ✅ Flujo CSV - Agregado paso de mapping intermedio

---

## 🧪 Pruebas Realizadas

### Test 1: Auto-mapping
```
CSV Input: "BIB;Nombre;Tiempo;Genero"
Expected: { 0: "bib", 1: "name", 2: "race_time", 3: "gender" }
Status: ✅ PASS
```

### Test 2: Validación
```
Mapping sin BIB: Error ✅
Mapping sin Name: Error ✅
Mapping sin Race Time: Error ✅
Mapping completo: OK ✅
```

### Test 3: Transformación
```
Raw CSV → Mapped Objects → Internal CSV → Parser
Resultado: ✅ Data preserva integridad
```

### Test 4: Caché
```
Guardado después del mapping: ✅ OK
Recuperación de caché: ✅ OK
Datos idénticos: ✅ OK
```

---

## 📝 Ejemplo de Uso Real

### Ejemplo 1: CSV Perfectamente Formateado
```
BIB;Nombre;Genero;Categoria;Tiempo
101;Juan Perez;M;Senior;00:28:45
102;Maria Garcia;F;Junior;00:32:15
```
✅ Auto-mapping detecta todo correctamente
✅ Usuario solo confirma y continúa

### Ejemplo 2: CSV con Nombres Raros
```
Dorsal;Competidor;Sexo;Grupo;Cronometro
101;Juan Perez;Masculino;Veterans;28:45
102;Maria Garcia;Femenino;Juniors;32:15
```
✅ Auto-mapping reconoce variaciones
✅ Usuario confirma
✅ Sistema funciona normalmente

### Ejemplo 3: CSV Desorden
```
Global;Nombre;;Dorsal;Cronometro;Distancia;Genero
1;Juan Perez;;101;28:45;5K;M
2;Maria Garcia;;102;32:15;5K;F
```
✅ Usuario asigna manualmente
✅ Ignora columnas vacías
✅ Continúa normalmente

---

## 🐛 Debugging

Si hay problemas, revisar:

1. **Console.log en Modal:**
```javascript
console.log('pendingCsvData:', pendingCsvData);
console.log('currentMapping:', pendingCsvData.currentMapping);
```

2. **Validar ColumnMapping:**
```javascript
const analysis = ColumnMapping.analyzeCSV(csvText, true);
console.log('analysis:', analysis);
```

3. **Revisar transformación:**
```javascript
const transformed = ColumnMapping.transformCSV(csvText, mapping, true);
console.log('transformed:', transformed);
```

---

## 🚀 Próximos Pasos (Recomendaciones)

1. **Agregar más aliases** para casos específicos del usuario
2. **Persistir mapping favoritos** para reutilizar
3. **Exportar/importar templates de mapping**
4. **Logging de auditoría** de cambios
5. **Webhooks** para integraciones externas

---

## 📞 Soporte

**Archivo de cambios:** `js/columnMapping.js` y `admin.html`

**Funciones principales:**
- `openColumnMappingModal(csvText, fileName)`
- `continueCsvImportWithMappedData(mappedRows, fileName)`
- `ColumnMapping.*` (módulo de mapping)

**Variables importantes:**
- `pendingCsvData` - Estado del modal de mapping
- `pendingImport` - Datos en proceso (igual que antes)

---

*Documentación generada: 2026-04-30*
