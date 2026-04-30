(function(global) {
  'use strict';

  /**
   * Sistema de Mapping de Columnas CSV
   * Permite al usuario asignar columnas del CSV a campos internos del sistema
   * Con auto-detección inteligente y validaciones
   */

  // ============================================================================
  // CONFIGURACIÓN: Campos disponibles del sistema
  // ============================================================================
  var SISTEMA_FIELDS = {
    global_position: { label: 'Posición Global', required: false },
    gender_position: { label: 'Posición Género', required: false },
    category_position: { label: 'Posición Categoría', required: false },
    bib: { label: 'Dorsal / BIB', required: true },
    name: { label: 'Nombre', required: true },
    gender: { label: 'Género', required: false },
    category: { label: 'Categoría', required: false },
    race_time: { label: 'Tiempo de Carrera', required: true },
    pace: { label: 'Ritmo/Pace', required: false },
    distance: { label: 'Distancia', required: false }
  };

  // ============================================================================
  // AUTO-MAPPING: Variaciones de nombres de columnas en CSV
  // ============================================================================
  var COLUMN_ALIASES = {
    bib: [
      'bib', 'dorsal', 'numero', 'nro', 'n_bib', 'bib_number', 'chip',
      'corredor_id', 'id_corredor', 'participante_id', 'id_participante',
      'biblia', 'n.', 'no.', 'n°', 'nº'
    ],
    name: [
      'nombre', 'name', 'atleta', 'competidor', 'corredor', 'participante',
      'nombre_completo', 'full_name', 'nombres', 'apellido_nombre'
    ],
    gender: [
      'genero', 'sexo', 'gender', 'm_f', 'hombre_mujer', 'masculino_femenino',
      'categoria_genero', 'categoria_sexo'
    ],
    category: [
      'categoria', 'category', 'clase', 'division', 'grupo', 'edad',
      'categoria_edad', 'grupo_edad', 'cat'
    ],
    race_time: [
      'tiempo', 'tiempo_carrera', 'tiempo_oficial', 'official_time', 
      'net_time', 'tiempo_neto', 'tiempo_chip', 'chip_time', 'chrono',
      'tiempo_total', 'duracion', 'duration'
    ],
    pace: [
      'ritmo', 'pace', 'velocidad', 'kmh', 'km_h', 'min_km', 'min_por_km'
    ],
    distance: [
      'distancia', 'distance', 'prueba', 'carrera', 'race', 'categoria_distancia',
      'km', 'kilometros', 'longitud'
    ],
    global_position: [
      'posicion', 'posicion_general', 'pos_general', 'pos_gral', 'global', 
      'overall', 'ranking', 'posicion_final', 'lugar', 'position'
    ],
    gender_position: [
      'posicion_genero', 'pos_genero', 'posicion_sexo', 'pos_sexo', 
      'ranking_genero', 'ranking_sexo', 'pos_hombre', 'pos_mujer'
    ],
    category_position: [
      'posicion_categoria', 'pos_categoria', 'posicion_clase', 'pos_clase',
      'ranking_categoria', 'ranking_edad', 'posicion_edad'
    ]
  };

  // ============================================================================
  // FUNCIÓN: Normalizar nombre de columna para búsqueda
  // ============================================================================
  function normalizeColumnName(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  // ============================================================================
  // FUNCIÓN: Auto-detectar el mapping basado en encabezados
  // ============================================================================
  function autoDetectMapping(headers) {
    var mapping = {};
    var usedFields = {};

    headers.forEach(function(header, columnIndex) {
      var normalizedHeader = normalizeColumnName(header);

      // Buscar en cada campo del sistema
      for (var fieldName in COLUMN_ALIASES) {
        if (usedFields[fieldName]) continue; // Campo ya mapeado

        var aliases = COLUMN_ALIASES[fieldName];
        var isMatch = aliases.some(function(alias) {
          var normalizedAlias = normalizeColumnName(alias);
          return normalizedAlias === normalizedHeader || 
                 normalizedHeader.indexOf(normalizedAlias) !== -1;
        });

        if (isMatch) {
          mapping[columnIndex] = fieldName;
          usedFields[fieldName] = true;
          break;
        }
      }

      // Si no hay match, deja como "ignore"
      if (!mapping[columnIndex]) {
        mapping[columnIndex] = 'ignore';
      }
    });

    return mapping;
  }

  // ============================================================================
  // FUNCIÓN: Validar que los campos obligatorios estén mapeados
  // ============================================================================
  function validateMapping(mapping, rowCount) {
    var errors = [];
    var mappedFields = {};

    // Recolectar todos los campos mapeados
    for (var columnIndex in mapping) {
      var fieldName = mapping[columnIndex];
      if (fieldName !== 'ignore') {
        mappedFields[fieldName] = true;
      }
    }

    // Verificar campos requeridos
    for (var fieldName in SISTEMA_FIELDS) {
      var fieldConfig = SISTEMA_FIELDS[fieldName];
      if (fieldConfig.required && !mappedFields[fieldName]) {
        errors.push(`Campo obligatorio no mapeado: "${SISTEMA_FIELDS[fieldName].label}"`);
      }
    }

    if (errors.length > 0) {
      return {
        isValid: false,
        errors: errors
      };
    }

    return {
      isValid: true,
      errors: [],
      mappedFields: Object.keys(mappedFields)
    };
  }

  // ============================================================================
  // FUNCIÓN: Parsear CSV y extraer headers + primeras filas
  // ============================================================================
  function parseCSVPreview(csvText, hasHeaders) {
    var rows = [];
    var row = [];
    var cell = '';
    var inQuotes = false;
    var lineNumber = 0;

    // Limpiar BOM
    csvText = String(csvText || '').replace(/^\uFEFF/, '');

    // Parsear línea por línea
    for (var i = 0; i < csvText.length; i++) {
      var char = csvText[i];

      if (char === '"') {
        if (inQuotes && csvText[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === ';' && !inQuotes) {
        row.push(cell.trim());
        cell = '';
        continue;
      }

      if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && csvText[i + 1] === '\n') {
          i += 1;
        }
        row.push(cell.trim());
        if (row.some(function(v) { return v.length > 0; })) {
          rows.push(row);
          lineNumber++;
        }
        row = [];
        cell = '';
        continue;
      }

      cell += char;
    }

    // Última fila
    if (cell.length > 0 || row.length > 0) {
      row.push(cell.trim());
      if (row.some(function(v) { return v.length > 0; })) {
        rows.push(row);
      }
    }

    var headers = hasHeaders && rows.length > 0 ? rows.shift() : null;
    var preview = rows.slice(0, 5); // Primeras 5 filas de datos

    return {
      headers: headers || [],
      preview: preview,
      totalRows: rows.length + (hasHeaders ? 1 : 0)
    };
  }

  // ============================================================================
  // FUNCIÓN: Aplicar mapping a un row
  // ============================================================================
  function applyMappingToRow(row, mapping) {
    var result = {};

    for (var columnIndex in mapping) {
      var fieldName = mapping[columnIndex];
      var cellValue = row[columnIndex] || '';

      if (fieldName !== 'ignore') {
        result[fieldName] = cellValue;
      }
    }

    return result;
  }

  // ============================================================================
  // FUNCIÓN: Transformar CSV usando el mapping
  // ============================================================================
  function transformCsvWithMapping(csvText, mapping, hasHeaders) {
    var rows = [];
    var row = [];
    var cell = '';
    var inQuotes = false;
    var lineNumber = 0;
    var results = [];

    // Limpiar BOM
    csvText = String(csvText || '').replace(/^\uFEFF/, '');

    // Parsear todo el CSV
    for (var i = 0; i < csvText.length; i++) {
      var char = csvText[i];

      if (char === '"') {
        if (inQuotes && csvText[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === ';' && !inQuotes) {
        row.push(cell.trim());
        cell = '';
        continue;
      }

      if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && csvText[i + 1] === '\n') {
          i += 1;
        }
        row.push(cell.trim());
        if (row.some(function(v) { return v.length > 0; })) {
          rows.push(row);
          lineNumber++;
        }
        row = [];
        cell = '';
        continue;
      }

      cell += char;
    }

    // Última fila
    if (cell.length > 0 || row.length > 0) {
      row.push(cell.trim());
      if (row.some(function(v) { return v.length > 0; })) {
        rows.push(row);
      }
    }

    // Saltar header si está presente
    var startIndex = hasHeaders && rows.length > 0 ? 1 : 0;

    // Aplicar mapping a cada fila
    for (var idx = startIndex; idx < rows.length; idx++) {
      results.push(applyMappingToRow(rows[idx], mapping));
    }

    return results;
  }

  // ============================================================================
  // API PÚBLICA
  // ============================================================================
  var ColumnMapping = {
    SISTEMA_FIELDS: SISTEMA_FIELDS,
    COLUMN_ALIASES: COLUMN_ALIASES,

    /**
     * Analizar CSV y detectar headers + auto-mapping
     * @param {string} csvText - Contenido del CSV
     * @param {boolean} hasHeaders - Si la primera fila tiene headers
     * @returns {object} { headers, preview, autoMapping, totalRows }
     */
    analyzeCSV: function(csvText, hasHeaders) {
      var parsed = parseCSVPreview(csvText, hasHeaders);
      var mapping = autoDetectMapping(parsed.headers);

      return {
        headers: parsed.headers,
        preview: parsed.preview,
        autoMapping: mapping,
        totalRows: parsed.totalRows,
        columnCount: parsed.headers.length
      };
    },

    /**
     * Validar que el mapping sea válido (campos obligatorios)
     * @param {object} mapping - { columnIndex: fieldName, ... }
     * @returns {object} { isValid, errors, mappedFields }
     */
    validateMapping: validateMapping,

    /**
     * Transformar CSV usando el mapping
     * @param {string} csvText - Contenido del CSV
     * @param {object} mapping - { columnIndex: fieldName, ... }
     * @param {boolean} hasHeaders - Si la primera fila tiene headers
     * @returns {array} Array de objetos mapeados
     */
    transformCSV: transformCsvWithMapping,

    /**
     * Obtener lista de campos del sistema
     * @returns {object} Campos disponibles con labels y requerimientos
     */
    getSistemaFields: function() {
      return SISTEMA_FIELDS;
    },

    /**
     * Normalizar un nombre de columna
     * @param {string} name - Nombre a normalizar
     * @returns {string} Nombre normalizado
     */
    normalizeColumnName: normalizeColumnName,

    /**
     * Auto-detectar mapping
     * @param {array} headers - Array de nombres de columnas
     * @returns {object} Mapping automático
     */
    autoDetectMapping: autoDetectMapping,

    /**
     * Generar mapping vacío (todas las columnas como "ignore")
     * @param {number} columnCount - Cantidad de columnas
     * @returns {object} Mapping vacío
     */
    createEmptyMapping: function(columnCount) {
      var mapping = {};
      for (var i = 0; i < columnCount; i++) {
        mapping[i] = 'ignore';
      }
      return mapping;
    }
  };

  // Exportar a global
  global.ColumnMapping = ColumnMapping;

})(typeof window !== 'undefined' ? window : global);
