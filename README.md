# Implementacion CSV Local

Fecha de actualizacion: 2026-04-29

## 1. Objetivo del cambio

El proyecto fue reestructurado para dejar de depender de un JSON gigante de resultados y pasar a una arquitectura local por evento:

1. El admin crea o edita el evento.
2. El evento puede publicarse aunque aun no tenga resultados.
3. Cuando termina el cronometraje, el admin sube un CSV.
4. El CSV se valida, se normaliza y se convierte a un JSON interno.
5. Ese JSON se guarda por `eventoKey` en el cache local del navegador.
6. `index.html`, `resultados.html`, `atleta.html` y `premiacion.html` consumen ese cache.

No hay escritura a disco desde el navegador y no se usa Firebase desde el frontend publico.

## 2. Respuesta a la duda sobre `BASE_CONFIG_URL` y `BASE_ESTADO_URL`

Ese comportamiento ya no esta activo.

Antes el store podia hacer bootstrap desde:

- `./datas/config.json`
- `./datas/estado-eventos.json`

Ahora `js/csvParser.js` funciona en modo local puro por defecto.

Solo existe un bootstrap opcional, apagado por defecto, para casos de compatibilidad o migracion. Ese bootstrap solo se activa si alguien define explicitamente:

```js
window.YAIR_STATIC_BOOTSTRAP = {
  enabled: true,
  configUrl: './datas/config.json',
  estadoUrl: './datas/estado-eventos.json'
};
```

Si eso no existe, el sistema arranca con:

- catalogo de eventos vacio
- estados vacios
- resultados vacios

Conclusion: el parser ya no "consume JSON que no estan creados" salvo que se habilite ese modo de forma manual.

## 3. Arquitectura final

### 3.1 Capa de datos

Archivo principal:

- `js/csvParser.js`

Responsabilidades:

- parsear CSV con `;`
- quitar BOM
- normalizar headers con o sin acentos
- mapear filas a atletas normalizados
- detectar errores de validacion
- detectar duplicados por `distancia + dorsal`
- resolver duplicados con una politica fija
- guardar resultados por evento en cache local
- exponer helpers para listado, busqueda, export y restauracion

### 3.2 Almacenamiento

Orden de persistencia:

1. `IndexedDB`
2. `localStorage` como fallback

Stores logicos:

- `eventos_catalogo`
- `eventos_estado`
- `resultados_evento`

Cada resultado guardado incluye:

- `eventoKey`
- `schemaVersion`
- `importedAt`
- `originalFileName`
- `sourceHash`
- `duplicatePolicy`
- `stats`
- `duplicates`
- `validationErrors`
- `resultados`

### 3.3 Estructura interna de resultados

Forma base:

```txt
eventoKey -> distancia -> dorsal -> atleta
```

Campos base por atleta:

- `dorsal`
- `nombre`
- `genero`
- `categoria`
- `distancia`
- `pais`
- `tiempo_oficial`
- `tiempo_chip`
- `ritmo`
- `posGral`
- `posGenero`
- `posCategoria`
- `puntos_control`
- `tramos`

## 4. Funciones implementadas

### `parseCsv(text)`

Hace lo siguiente:

- quita BOM si existe
- usa separador `;`
- toma la primera fila como header
- normaliza headers con `normalize('NFD')`
- elimina acentos y caracteres raros
- convierte nombres como `Género-pos` en claves como `genero_pos`

### `normalizeRow(row)`

Hace lo siguiente:

- mapea columnas conocidas a la estructura interna
- acepta variantes comunes de nombres de campo
- valida obligatorios:
  - dorsal
  - nombre
  - distancia
- normaliza `tiempo_oficial` a `HH:MM:SS`
- normaliza `ritmo` a `MM:SS`
- conserva posiciones si vienen en el CSV

### `buildResultadosIndex(rows)`

Hace lo siguiente:

- construye `distancia -> dorsal -> atleta`
- registra filas invalidas
- detecta duplicados por `distancia + dorsal`
- guarda el detalle de cada grupo duplicado
- devuelve `data`, `duplicates`, `validationErrors` y `stats`

### `cacheSaveEvento(eventoKey, payload)` / `cacheLoadEvento(eventoKey)`

Hace lo siguiente:

- guarda o carga resultados por `eventoKey`
- aplica `schemaVersion`
- conserva `sourceHash`
- permite invalidacion por cambios de esquema

### `loadResultadosEvento(eventoKey)`

Hace lo siguiente:

- lee el cache local del evento
- si no hay resultados devuelve `null`
- si hay resultados devuelve el JSON interno listo para consumir

## 5. Politica de duplicados

Politica activa:

- `mejor_tiempo_gana`

Reglas:

- si ambos tiempos son validos, gana el menor tiempo
- si uno es valido y el otro no, gana el valido
- si ambos tiempos son invalidos, gana el ultimo registro
- el panel muestra el resumen por alert
- el detalle completo queda en el panel de duplicados

## 6. Metricas agregadas

### 6.1 Metricas globales en `admin.html`

Tarjetas del dashboard:

- total eventos
- publicados
- ocultos
- total atletas
- con resultados
- distancias activas
- duplicados globales
- errores CSV globales

### 6.2 Metricas del CSV importado

Tarjetas y resumen de importacion:

- distancias
- filas CSV
- filas validas
- atletas unicos
- llegados
- duplicados
- errores
- sin tiempo
- porcentaje de finalizacion
- distribucion por genero
- detalle por distancia

### 6.3 Metricas por evento en el modal

Resumen lateral:

- por genero
- categorias principales
- total corredores
- sin tiempo
- finalizacion
- distancias activas
- tiempo promedio
- mejor tiempo
- fecha de importacion
- archivo fuente
- alertas de duplicados y errores
- detalle por distancia con mejor tiempo

## 7. Nuevas funcionalidades del admin

Login local:

- usuario: `admin`
- clave: `123`

### 7.1 Gestion de eventos

- crear evento
- editar evento
- autogenerar `eventoKey`
- publicar u ocultar
- guardar distancias esperadas
- configurar diploma
- configurar URL de Chuspic

### 7.2 Importacion CSV

- validar CSV manual
- cargar CSV demo limpio
- cargar CSV demo con errores
- mostrar preview
- mostrar errores de validacion
- mostrar panel de duplicados
- guardar cache local por evento
- exportar JSON del evento o del preview

### 7.3 Operacion local

- exportar backup local completo
- restaurar backup local desde JSON
- recargar datos del navegador
- borrar solo resultados de un evento
- eliminar un evento local completo
- borrar todos los datos locales del admin

## 8. CSV de prueba creados

Se dejaron dos archivos en `resultados-csv/`.

### 8.1 `demo-trail-multidistancia-2026.csv`

Pensado para flujo feliz:

- varias distancias
- headers con acentos
- tiempos mixtos
- ritmos tipo `min/Km`
- un duplicado real
- sin filas invalidas

### 8.2 `demo-validacion-admin-2026.csv`

Pensado para QA del panel:

- duplicado de dorsal en la misma distancia
- fila sin dorsal
- fila sin distancia
- atleta con estado tipo `DNS`

Sirve para probar:

- alert de duplicados
- panel de duplicados
- panel de errores
- bloqueo de guardado cuando hay filas invalidas

## 9. Paginas publicas adaptadas

### `index.html`

- lista eventos publicados
- muestra si un evento tiene resultados o esta esperando resultados
- consume `YairStore.loadEventosVista()`

### `resultados.html`

- consume `YairStore.loadResultadosEvento(eventoKey)`
- soporta multiples distancias
- filtros por texto, genero y categoria
- export de la vista filtrada
- mensaje de espera si aun no hay resultados

### `atleta.html`

- busca atleta por `evento`, `distancia` y `dorsal`
- muestra resumen, posiciones y datos del atleta
- soporta link de Chuspic si el evento lo tiene configurado

### `premiacion.html`

- arma podios por distancia, genero y categoria
- usa directamente el cache normalizado
- muestra estado de espera cuando no hay resultados

## 10. Backup y restauracion

Se agrego soporte completo para snapshot local.

### Export

Funcion:

- `YairStore.dumpLocalSnapshot()`

Contenido:

- `kind: "yair-timings-local-snapshot"`
- `schemaVersion`
- `exportedAt`
- `staticBootstrapEnabled`
- `eventos`
- `estados`
- `resultados`

### Restore

Funcion:

- `YairStore.restoreLocalSnapshot(snapshot, { replaceExisting: true })`

Uso en admin:

- boton `Restaurar backup`
- carga un `.json`
- reemplaza el almacenamiento local actual
- refresca el panel automaticamente

## 11. Archivos tocados

- `js/csvParser.js`
- `admin.html`
- `index.html`
- `resultados.html`
- `atleta.html`
- `premiacion.html`
- `resultados-csv/demo-trail-multidistancia-2026.csv`
- `resultados-csv/demo-validacion-admin-2026.csv`
- `IMPLEMENTACION-CSV-LOCAL.md`

## 12. Verificaciones realizadas

Se verifico lo siguiente:

- sintaxis de `js/csvParser.js` con `node --check`
- parseo de scripts inline en:
  - `admin.html`
  - `index.html`
  - `resultados.html`
  - `premiacion.html`
  - `atleta.html`
- parseo real del CSV demo limpio
- parseo real del CSV demo con errores
- guardado y carga de resultados en fallback local
- export y restore de snapshot local

Resultado de la ultima prueba automatica:

- bootstrap estatico desactivado: `false`
- demo limpio:
  - `9` atletas
  - `3` distancias
  - `1` grupo duplicado
  - `0` errores
- demo con errores:
  - `4` atletas validos
  - `2` filas invalidas
  - `1` grupo duplicado
  - `5` filas validas
- restore local correcto: `true`

## 13. Limitaciones reales de esta arquitectura

Importante:

- los eventos y resultados viven en el navegador donde el admin los crea
- si se borra el almacenamiento del navegador, se pierde ese estado local
- otro navegador o dispositivo no vera esos datos automaticamente
- para mover datos entre navegadores hay que usar el backup JSON

Sin backend, esa limitacion es normal y esperada.

## 14. Flujo recomendado de uso

1. Entrar a `admin.html`.
2. Login con `admin / 123`.
3. Crear el evento y guardar datos base.
4. Definir si queda publicado u oculto.
5. Cargar CSV demo o CSV real.
6. Revisar preview, errores y duplicados.
7. Guardar el cache local del evento.
8. Abrir `resultados.html?evento=...`.
9. Revisar `premiacion.html?evento=...`.
10. Exportar backup local si quieres conservar o mover el estado.
