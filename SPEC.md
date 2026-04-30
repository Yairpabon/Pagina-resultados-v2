# YAIR TIMINGS - Especificación del Proyecto

## 1. Información General

- **Nombre del Proyecto**: Yair Timings
- **Tipo**: Sistema de cronometraje y resultados para carreras de trail running
- **Migración**: De Firebase a datos locales (JSON)
- **Estado**: En desarrollo

---

## 2. Estructura de Archivos

```
Proyecto/
├── index.html          # Portal de eventos (solo publicados)
├── resultados.html    # Tabla de clasificación por evento
├── atleta.html        # Perfil del corredor + diploma dinámico
├── admin.html         # Panel de administración
├── SPEC.md            # Este archivo
└── datas/
    ├── config.json         # Configuración de eventos (existente)
    ├── limpio.json         # Resultados de competidores (existente)
    └── estado-eventos.json # Control publicación + config diplomas (NUEVO)
```

---

## 3. Flujo de la Aplicación

### Usuario Visitante:
```
index.html → Ver eventos publicados → resultados.html → atleta.html
                                              ↓
                                      [Botón Diploma] → Genera diploma dinámico
```

### Administrador:
```
admin.html → Login (admin/123) → Dashboard → Editar evento → Guardar
                                                      ↓
                                            - Publicar/Ocultar
                                            - Configurar Diploma
                                            - Configurar Chuspic
                                            - Ver Estadísticas
```

---

## 4. Especificación de Datos

### 4.1 config.json (ya existe)
Contiene información de eventos: fecha, distancias, puntos de control, rutas

### 4.2 limpio.json (ya existe)
Contiene resultados de competidores por evento: nombre, dorsal, tiempo, categoría, género, país

### 4.3 estado-eventos.json (NUEVO)

```json
{
  "eventos": {
    "nombre-evento-2026": {
      "publicado": false,
      "fecha_publicacion": "2026-04-15T10:00:00Z",
      "diploma": {
        "plantilla_url": "https://...",
        "pie": "¡Gracias por participar!",
        "campos": {
          "nombre": { "x": 50, "y": 30, "size": 28, "color": "#000000", "align": "center", "font": "Arial" },
          "tiempo": { "x": 50, "y": 45, "size": 24, "color": "#00CFFF", "align": "center", "font": "Arial" },
          "posGeneral": { "x": 50, "y": 60, "size": 20, "color": "#000000", "align": "center", "font": "Arial" },
          "posCategoria": { "x": 50, "y": 70, "size": 20, "color": "#000000", "align": "center", "font": "Arial" },
          "categoria": { "x": 50, "y": 80, "size": 18, "color": "#666666", "align": "center", "font": "Arial" },
          "distancia": { "x": 50, "y": 85, "size": 18, "color": "#666666", "align": "center", "font": "Arial" },
          "evento": { "x": 50, "y": 92, "size": 14, "color": "#333333", "align": "center", "font": "Arial" },
          "fecha": { "x": 50, "y": 96, "size": 12, "color": "#333333", "align": "center", "font": "Arial" }
        }
      },
      "chuspic_url": "https://..."
    }
  }
}
```

---

## 5. Especificación de Funcionalidades

### 5.1 index.html (Portal)
- ✅ Lee `config.json` + `estado-eventos.json`
- ✅ Filtra: solo eventos con `publicado: true`
- ✅ Muestra grid de eventos (próximos y resultados)
- ✅ Buscador de eventos
- ✅ Modo oscuro
- ✅ Cambio nombre: "Tustiempos" → "Yair Timings"

### 5.2 resultados.html (Clasificación)
- ✅ Lee `config.json` + `limpio.json`
- ✅ Filtros por distancia, género, categoría
- ✅ Buscador por nombre/dorsal
- ✅ Exportación Excel
- ✅ Live timing (actualización en tiempo real)
- ✅ Cambio nombre: "Tustiempos" → "Yair Timings"

### 5.3 atleta.html (Perfil Corredor)
- ✅ Lee datos del corredor desde `limpio.json`
- ✅ Mapa 2D/3D con posición en tiempo real
- ✅ Gráfico de elevación
- ✅ Timeline de puntos de control
- ✅ Botón Diploma: leer config de `estado-eventos.json[evento].diploma`
- ✅ Generar diploma dinámico con campos posicionables
- ✅ Modal de reclamos
- ✅ Botón Chuspic: leer `estado-eventos.json[evento].chuspic_url`
- ✅ Cambio nombre: "Tustiempos" → "Yair Timings"

### 5.4 admin.html (Panel Administración)

#### Login:
- Usuario: admin
- Contraseña: 123
- Persistencia en localStorage

#### Dashboard:
- Total eventos
- Eventos publicados
- Eventos ocultos
- Total corredores

#### Lista de Eventos:
- Paginada (10 por página)
- Agrupada por año
- Buscador por nombre
- Muestra: nombre, fecha, distancias, corredores, estado

#### Editor de Evento (Modal):
- **Estado**: Toggle publicar/ocultar
- **Diploma**:
  - Subir imagen de plantilla
  - Preview en tiempo real
  - Configurar 8 campos (nombre, tiempo, posGral, posCat, categoría, distancia, evento, fecha)
  - Posición: X (%), Y (%), Tamaño (px), Color, Alineación, Fuente
  - Texto pie de página
- **Chuspic**: URL del evento
- **Estadísticas**: género, categorías, tiempos

---

## 6. Restricciones Importantes

### NO CAMBIAR:
- ❌ Funcionalidades existentes (filtros, live timing, mapas, export)
- ❌ Estilos (Tailwind, colores, diseño responsive)
- ❌ Estructura de código (IDs, clases, lógica de renderizado)
- ❌ Iconos Font Awesome
- ❌ Sistema de modo oscuro

### SÍ CAMBIAR:
- ✅ Fuente de datos: Firebase → JSON local
- ✅ Nombre: "Tustiempos" → "Yair Timings"
- ✅ Sistema de publicación (campo publicado)
- ✅ Diploma dinámico desde admin
- ✅ Panel admin con login

---

## 7. Colores y Estilos

- **Brand**: #00CFFF
- **Dark**: #0A0A0A
- **Card**: #111111
- **Framework**: Tailwind CSS
- **Iconos**: Font Awesome 6.4.0
- **Modo Oscuro**: class="dark"

---

## 8. Notas Técnicas

- Los JSONs se leen con `fetch()` nativo
- No se usa ningún framework JS (vanilla JS)
- El diploma se genera con HTML5 Canvas
- Para desarrollo local, los cambios en JSON se reflejan directamente
- El admin guarda directamente en `estado-eventos.json` (simulado con localStorage para demo)

---

## 9. Orden de Implementación

1. ✅ Crear `datas/estado-eventos.json` (estructura vacía)
2. 🔄 Modificar `index.html` (leer estado + filtrar publicados + nombre)
3. 🔄 Modificar `resultados.html` (cambiar nombre)
4. 🔄 Modificar `atleta.html` (cambiar nombre + diploma dinámico)
5. 🔄 Crear `admin.html` (panel completo con login)

---

## 10. Pendientes

- [ ] Crear archivo estado-eventos.json
- [ ] Modificar index.html para filtrar publicados
- [ ] Cambiar nombre en todas las páginas
- [ ] Implementar login admin
- [ ] Implementar editor de diplomas
- [ ] Implementar diploma dinámico en atleta.html
- [ ] Implementar estadísticas en admin