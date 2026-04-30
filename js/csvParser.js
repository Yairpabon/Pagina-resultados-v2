(function(global) {
  'use strict';

  var DB_NAME = 'yair_timings';
  var DB_VERSION = 2;
  var STORE_RESULTADOS = 'resultados_evento';
  var STORE_EVENTOS = 'eventos_catalogo';
  var STORE_ESTADOS = 'eventos_estado';
  var SCHEMA_VERSION = '2.0.0';
  var DUPLICATE_POLICY = 'mejor_tiempo_gana';
  var FALLBACK_PREFIX = 'yair_store__';
  var STATIC_BOOTSTRAP = toObject(global.YAIR_STATIC_BOOTSTRAP);
  var baseConfigPromise = null;
  var baseEstadoPromise = null;

  function supportsIndexedDB() {
    return typeof global.indexedDB !== 'undefined';
  }

  function toObject(value) {
    return value && typeof value === 'object' ? value : {};
  }

  function trimString(value) {
    return String(value == null ? '' : value).trim();
  }

  function cleanBom(text) {
    return String(text == null ? '' : text).replace(/^\uFEFF/, '');
  }

  function collapseSpaces(value) {
    return trimString(value).replace(/\s+/g, ' ');
  }

  function normalizeHeader(value) {
    return cleanBom(value)
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function normalizeIdentity(value) {
    return collapseSpaces(value)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function slugify(value) {
    return collapseSpaces(value)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function buildEventoKeyFromName(value) {
    return slugify(value || 'evento');
  }

  function humanizeEventoKey(eventoKey) {
    return collapseSpaces(String(eventoKey || '').replace(/-/g, ' '))
      .replace(/\b\w/g, function(letter) {
        return letter.toUpperCase();
      });
  }

  function uniqueStrings(values) {
    var seen = {};
    var result = [];
    (values || []).forEach(function(value) {
      var text = collapseSpaces(value);
      if (!text) return;
      var key = normalizeIdentity(text);
      if (seen[key]) return;
      seen[key] = true;
      result.push(text);
    });
    return result;
  }

  function safeJsonParse(value, fallback) {
    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function fnv1a(str) {
    var input = String(str == null ? '' : str);
    var hash = 0x811c9dc5;
    for (var i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
    }
    return ('0000000' + hash.toString(16)).slice(-8);
  }

  function parseDelimitedRecords(text, delimiter) {
    var input = cleanBom(text);
    var rows = [];
    var row = [];
    var cell = '';
    var inQuotes = false;

    for (var i = 0; i < input.length; i++) {
      var char = input[i];

      if (char === '"') {
        if (inQuotes && input[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === delimiter && !inQuotes) {
        row.push(cell);
        cell = '';
        continue;
      }

      if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && input[i + 1] === '\n') {
          i += 1;
        }
        row.push(cell);
        if (row.some(function(value) { return trimString(value).length > 0; })) {
          rows.push(row);
        }
        row = [];
        cell = '';
        continue;
      }

      cell += char;
    }

    if (cell.length > 0 || row.length > 0) {
      row.push(cell);
      if (row.some(function(value) { return trimString(value).length > 0; })) {
        rows.push(row);
      }
    }

    return rows;
  }

  function parseCsv(text) {
    var records = parseDelimitedRecords(text, ';');
    if (!records.length) {
      return {
        headers: [],
        normalizedHeaders: [],
        rows: [],
        rawRows: [],
        delimiter: ';'
      };
    }

    var rawHeaders = records[0].map(function(value) {
      return trimString(value);
    });
    var headers = rawHeaders.map(normalizeHeader);
    var rows = [];

    for (var i = 1; i < records.length; i++) {
      var columns = records[i];
      var row = { _line: i + 1 };
      for (var j = 0; j < headers.length; j++) {
        row[headers[j]] = trimString(columns[j]);
      }
      row._raw = columns.map(function(value) {
        return trimString(value);
      });
      rows.push(row);
    }

    return {
      headers: rawHeaders,
      normalizedHeaders: headers,
      rows: rows,
      rawRows: records,
      delimiter: ';'
    };
  }

  function toIntSafe(value) {
    var cleaned = trimString(value).replace(/[^\d-]/g, '');
    if (!cleaned) return null;
    var parsed = parseInt(cleaned, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function extractFirstValue(row, aliases) {
    for (var i = 0; i < aliases.length; i++) {
      var key = aliases[i];
      if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
      var value = trimString(row[key]);
      if (value) return value;
    }
    return '';
  }

  function normalizeGenero(value) {
    var text = collapseSpaces(value).toUpperCase();
    if (!text) return '-';
    if (text === 'MASCULINO' || text === 'MALE' || text === 'HOMBRE' || text === 'MAN') return 'M';
    if (text === 'FEMENINO' || text === 'FEMALE' || text === 'MUJER' || text === 'WOMAN') return 'F';
    if (text === 'M' || text === 'F') return text;
    return text;
  }

  function normalizeDistanceLabel(value) {
    return collapseSpaces(value || 'General') || 'General';
  }

  function normalizeCategoria(value) {
    return collapseSpaces(value || 'General') || 'General';
  }

  function normalizeRaceTime(value) {
    var raw = collapseSpaces(value).toUpperCase();
    if (!raw) return '--:--:--';
    if (raw === '--' || raw === '--:--' || raw === '--:--:--') return '--:--:--';
    if (raw === 'DNF' || raw === 'DNS' || raw === 'DSQ' || raw === 'DQ' || raw === 'RET') return raw;

    var matches = raw.match(/\d+/g);
    if (!matches || !matches.length) return '--:--:--';

    var parts = raw.replace(/[^\d:]/g, '').split(':').filter(Boolean);
    if (!parts.length) parts = matches;

    if (parts.length === 2) {
      return '00:' + parts[0].padStart(2, '0') + ':' + parts[1].padStart(2, '0');
    }

    if (parts.length >= 3) {
      var hours = parts[0];
      var minutes = parts[1];
      var seconds = parts[2];
      return hours.padStart(2, '0') + ':' + minutes.padStart(2, '0') + ':' + seconds.padStart(2, '0');
    }

    return '--:--:--';
  }

  function secondsToRaceTime(totalSeconds) {
    if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '--:--:--';
    var hours = Math.floor(totalSeconds / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = Math.floor(totalSeconds % 60);
    return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
  }

  function secondsToPace(totalSeconds) {
    if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '--:--';
    var minutes = Math.floor(totalSeconds / 60);
    var seconds = Math.floor(totalSeconds % 60);
    return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
  }

  function normalizePace(value) {
    var raw = collapseSpaces(value).toUpperCase();
    if (!raw || raw === '--' || raw === '--:--' || raw === '--:--:--') return '--:--';

    var matches = raw.match(/\d+/g);
    if (!matches || !matches.length) return '--:--';

    var parts = raw.replace(/[^\d:]/g, '').split(':').filter(Boolean);
    if (!parts.length) parts = matches;

    if (parts.length === 2) {
      return parts[0].padStart(2, '0') + ':' + parts[1].padStart(2, '0');
    }

    if (parts.length >= 3) {
      var hours = parseInt(parts[0], 10) || 0;
      var minutes = parseInt(parts[1], 10) || 0;
      var seconds = parseInt(parts[2], 10) || 0;
      return secondsToPace((hours * 3600) + (minutes * 60) + seconds);
    }

    return '--:--';
  }

  function timeToSortableSeconds(value) {
    var text = trimString(value).toUpperCase();
    if (!text || text === '--' || text === '--:--' || text === '--:--:--') return Number.POSITIVE_INFINITY;
    if (text === 'DNF' || text === 'DNS' || text === 'DSQ' || text === 'DQ' || text === 'RET') return Number.POSITIVE_INFINITY;

    var parts = text.split(':').map(function(part) {
      return parseInt(part, 10);
    });

    if (parts.length === 2 && parts.every(Number.isFinite)) {
      return (parts[0] * 60) + parts[1];
    }

    if (parts.length === 3 && parts.every(Number.isFinite)) {
      return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
    }

    return Number.POSITIVE_INFINITY;
  }

  function isFinishedTime(value) {
    return Number.isFinite(timeToSortableSeconds(value));
  }

  function buildRowError(linea, errors, row) {
    return {
      linea: linea || null,
      errores: errors.slice(),
      row: cloneJson(row || {})
    };
  }

  function normalizeImportOptions(options) {
    var normalized = toObject(options);
    normalized.defaultDistance = normalizeDistanceLabel(normalized.defaultDistance || '');
    if (normalized.defaultDistance === 'General') {
      normalized.defaultDistance = '';
    }
    normalized.ignoreCsvDistance = !!normalized.ignoreCsvDistance;
    return normalized;
  }

  function normalizeRow(row, options) {
    var opts = normalizeImportOptions(options);
    var errors = [];
    var dorsal = collapseSpaces(extractFirstValue(row, ['dorsal', 'bib', 'numero', 'nro', 'n_bib', 'bib_number']));
    var nombre = collapseSpaces(extractFirstValue(row, ['nombre', 'name', 'atleta', 'competidor']));
    var rawDistance = opts.ignoreCsvDistance
      ? ''
      : extractFirstValue(row, ['distancia', 'distance', 'prueba', 'carrera', 'race']);
    var distancia = normalizeDistanceLabel(rawDistance || opts.defaultDistance || '');

    if (!dorsal) errors.push('Falta dorsal/BIB');
    if (!nombre) errors.push('Falta nombre');
    if (!distancia || distancia === 'General') {
      if (!rawDistance && !opts.defaultDistance) errors.push('Falta distancia');
    }

    var genero = normalizeGenero(extractFirstValue(row, ['genero', 'sexo', 'gender']));
    var categoria = normalizeCategoria(extractFirstValue(row, ['categoria', 'category']));
    var tiempoOficial = normalizeRaceTime(extractFirstValue(row, ['tiempo_de_carrera', 'tiempo_oficial', 'tiempo', 'official_time', 'net_time']));
    var tiempoChip = normalizeRaceTime(extractFirstValue(row, ['tiempo_chip', 'tiempo_neto', 'chip_time', 'net_time'])) || tiempoOficial;
    var ritmo = normalizePace(extractFirstValue(row, ['ritmo', 'pace']));
    var posGral = toIntSafe(extractFirstValue(row, ['global', 'posicion_general', 'pos_general', 'overall', 'overall_pos']));
    var posGenero = toIntSafe(extractFirstValue(row, ['genero_pos', 'pos_genero', 'genero_posicion', 'gender_pos', 'sexo_pos']));
    var posCategoria = toIntSafe(extractFirstValue(row, ['categoria_pos', 'pos_categoria', 'categoria_posicion', 'category_pos']));
    var pais = collapseSpaces(extractFirstValue(row, ['pais', 'country'])) || 'COL';

    if (errors.length) {
      return {
        ok: false,
        line: row._line || null,
        errors: errors,
        row: row
      };
    }

    return {
      ok: true,
      line: row._line || null,
      row: row,
      atleta: {
        dorsal: dorsal,
        nombre: nombre,
        genero: genero,
        categoria: categoria,
        distancia: distancia,
        pais: pais,
        tiempo_oficial: tiempoOficial,
        tiempo_chip: tiempoChip === '--:--:--' ? tiempoOficial : tiempoChip,
        ritmo: ritmo,
        posGral: posGral,
        posGenero: posGenero,
        posCategoria: posCategoria,
        puntos_control: {},
        tramos: {}
      }
    };
  }

  function compareDuplicateWinner(currentAtleta, incomingAtleta) {
    var currentSeconds = timeToSortableSeconds(currentAtleta.tiempo_oficial);
    var incomingSeconds = timeToSortableSeconds(incomingAtleta.tiempo_oficial);

    if (Number.isFinite(currentSeconds) && Number.isFinite(incomingSeconds)) {
      if (incomingSeconds <= currentSeconds) {
        return {
          useIncoming: true,
          reason: incomingSeconds === currentSeconds ? 'empate, se conserva el ultimo registro' : 'mejor tiempo'
        };
      }
      return {
        useIncoming: false,
        reason: 'mejor tiempo'
      };
    }

    if (Number.isFinite(incomingSeconds) && !Number.isFinite(currentSeconds)) {
      return {
        useIncoming: true,
        reason: 'registro valido reemplaza uno sin tiempo valido'
      };
    }

    if (!Number.isFinite(incomingSeconds) && Number.isFinite(currentSeconds)) {
      return {
        useIncoming: false,
        reason: 'se conserva el unico tiempo valido'
      };
    }

    return {
      useIncoming: true,
      reason: 'sin tiempos validos, se conserva el ultimo registro'
    };
  }

  function summarizeResultados(resultados) {
    var data = toObject(resultados);
    var stats = {
      distancias: Object.keys(data),
      totalAtletas: 0,
      llegados: 0,
      sinTiempo: 0,
      finalizacionPct: 0,
      promedioTiempo: null,
      mejorTiempo: null,
      porGenero: {},
      porCategoria: {},
      porDistancia: {}
    };
    var totalSeconds = 0;
    var totalValidTimes = 0;
    var bestSeconds = Number.POSITIVE_INFINITY;

    Object.keys(data).forEach(function(distancia) {
      var atletas = toObject(data[distancia]);
      var distStats = {
        total: 0,
        llegados: 0,
        sinTiempo: 0,
        promedioTiempo: null,
        mejorTiempo: null,
        porGenero: {}
      };
      var distSeconds = 0;
      var distValidTimes = 0;
      var distBestSeconds = Number.POSITIVE_INFINITY;
      stats.totalAtletas += Object.keys(atletas).length;
      Object.keys(atletas).forEach(function(dorsal) {
        var atleta = atletas[dorsal] || {};
        var genero = atleta.genero || 'NC';
        var categoria = atleta.categoria || 'Sin categoria';
        var seconds = timeToSortableSeconds(atleta.tiempo_oficial);

        distStats.total += 1;
        stats.porGenero[genero] = (stats.porGenero[genero] || 0) + 1;
        stats.porCategoria[categoria] = (stats.porCategoria[categoria] || 0) + 1;
        distStats.porGenero[genero] = (distStats.porGenero[genero] || 0) + 1;

        if (Number.isFinite(seconds)) {
          stats.llegados += 1;
          distStats.llegados += 1;
          totalSeconds += seconds;
          totalValidTimes += 1;
          distSeconds += seconds;
          distValidTimes += 1;
          if (seconds < bestSeconds) bestSeconds = seconds;
          if (seconds < distBestSeconds) distBestSeconds = seconds;
        } else {
          stats.sinTiempo += 1;
          distStats.sinTiempo += 1;
        }
      });

      if (distValidTimes) {
        distStats.promedioTiempo = secondsToRaceTime(Math.round(distSeconds / distValidTimes));
        distStats.mejorTiempo = secondsToRaceTime(distBestSeconds);
      }
      stats.porDistancia[distancia] = distStats;
    });

    if (totalValidTimes) {
      stats.promedioTiempo = secondsToRaceTime(Math.round(totalSeconds / totalValidTimes));
      stats.mejorTiempo = secondsToRaceTime(bestSeconds);
    }
    if (stats.totalAtletas) {
      stats.finalizacionPct = Math.round((stats.llegados / stats.totalAtletas) * 1000) / 10;
    }

    return stats;
  }

  function buildResultadosIndex(rows, options) {
    var opts = normalizeImportOptions(options);
    var data = {};
    var distanceKeyMap = {};
    var validationErrors = [];
    var duplicateGroups = {};
    var currentWinnerMeta = {};
    var currentWinnerAtleta = {};

    (rows || []).forEach(function(row) {
      var normalized = row && row.atleta ? row : normalizeRow(row, opts);

      if (!normalized.ok) {
        validationErrors.push(buildRowError(normalized.line, normalized.errors, normalized.row));
        return;
      }

      var atleta = normalized.atleta;
      var distanceKey = normalizeIdentity(atleta.distancia);
      var distanceLabel = distanceKeyMap[distanceKey] || atleta.distancia;
      distanceKeyMap[distanceKey] = distanceLabel;

      if (!data[distanceLabel]) data[distanceLabel] = {};

      var duplicateKey = distanceKey + '::' + atleta.dorsal;
      var detail = {
        linea: normalized.line,
        dorsal: atleta.dorsal,
        nombre: atleta.nombre,
        distancia: distanceLabel,
        tiempo: atleta.tiempo_oficial,
        genero: atleta.genero,
        categoria: atleta.categoria,
        kept: false,
        motivo: ''
      };

      if (!data[distanceLabel][atleta.dorsal]) {
        data[distanceLabel][atleta.dorsal] = cloneJson(atleta);
        currentWinnerMeta[duplicateKey] = detail;
        currentWinnerAtleta[duplicateKey] = cloneJson(atleta);
        return;
      }

      if (!duplicateGroups[duplicateKey]) {
        duplicateGroups[duplicateKey] = {
          distancia: distanceLabel,
          dorsal: atleta.dorsal,
          policy: DUPLICATE_POLICY,
          registros: [cloneJson(currentWinnerMeta[duplicateKey])]
        };
      }

      duplicateGroups[duplicateKey].registros.push(cloneJson(detail));

      var winnerDecision = compareDuplicateWinner(currentWinnerAtleta[duplicateKey], atleta);
      var winnerMeta = winnerDecision.useIncoming ? detail : currentWinnerMeta[duplicateKey];
      var loserMeta = winnerDecision.useIncoming ? currentWinnerMeta[duplicateKey] : detail;

      winnerMeta.kept = true;
      winnerMeta.motivo = winnerDecision.reason;
      loserMeta.kept = false;
      loserMeta.motivo = winnerDecision.reason;

      duplicateGroups[duplicateKey].registros = duplicateGroups[duplicateKey].registros.map(function(record) {
        if (record.linea === winnerMeta.linea && record.nombre === winnerMeta.nombre && record.tiempo === winnerMeta.tiempo) {
          record.kept = true;
          record.motivo = winnerDecision.reason;
        } else if (record.linea === loserMeta.linea && record.nombre === loserMeta.nombre && record.tiempo === loserMeta.tiempo) {
          record.kept = false;
          record.motivo = winnerDecision.reason;
        }
        return record;
      });

      if (winnerDecision.useIncoming) {
        data[distanceLabel][atleta.dorsal] = cloneJson(atleta);
        currentWinnerMeta[duplicateKey] = cloneJson(detail);
        currentWinnerMeta[duplicateKey].kept = true;
        currentWinnerMeta[duplicateKey].motivo = winnerDecision.reason;
        currentWinnerAtleta[duplicateKey] = cloneJson(atleta);
      } else {
        currentWinnerMeta[duplicateKey].kept = true;
        currentWinnerMeta[duplicateKey].motivo = winnerDecision.reason;
      }
    });

    var duplicates = Object.keys(duplicateGroups).map(function(key) {
      var group = duplicateGroups[key];
      var winner = group.registros.find(function(record) { return record.kept; }) || group.registros[group.registros.length - 1];
      group.winner = winner ? {
        linea: winner.linea,
        nombre: winner.nombre,
        tiempo: winner.tiempo,
        motivo: winner.motivo
      } : null;
      return group;
    });

    var stats = summarizeResultados(data);
    stats.totalFilas = (rows || []).length;
    stats.filasValidas = stats.totalFilas - validationErrors.length;
    stats.totalErrores = validationErrors.length;
    stats.duplicadosCount = duplicates.length;
    stats.duplicadosFilas = duplicates.reduce(function(total, group) {
      return total + Math.max(group.registros.length - 1, 0);
    }, 0);

    return {
      data: data,
      duplicates: duplicates,
      validationErrors: validationErrors,
      stats: stats
    };
  }

  function buildPreviewRows(resultados) {
    var preview = [];
    Object.keys(resultados || {}).forEach(function(distancia) {
      Object.keys(resultados[distancia] || {}).forEach(function(dorsal) {
        var atleta = resultados[distancia][dorsal];
        preview.push({
          distancia: distancia,
          dorsal: dorsal,
          nombre: atleta.nombre,
          genero: atleta.genero,
          categoria: atleta.categoria,
          tiempo_oficial: atleta.tiempo_oficial,
          ritmo: atleta.ritmo,
          posGral: atleta.posGral
        });
      });
    });

    preview.sort(function(a, b) {
      if (a.distancia !== b.distancia) return a.distancia.localeCompare(b.distancia, undefined, { numeric: true, sensitivity: 'base' });
      return timeToSortableSeconds(a.tiempo_oficial) - timeToSortableSeconds(b.tiempo_oficial);
    });

    return preview.slice(0, 12);
  }

  async function openDB() {
    if (!supportsIndexedDB()) {
      return null;
    }

    return new Promise(function(resolve, reject) {
      var request = global.indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = function() {
        reject(request.error);
      };

      request.onsuccess = function() {
        resolve(request.result);
      };

      request.onupgradeneeded = function(event) {
        var db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_RESULTADOS)) {
          db.createObjectStore(STORE_RESULTADOS, { keyPath: 'eventoKey' });
        }
        if (!db.objectStoreNames.contains(STORE_EVENTOS)) {
          db.createObjectStore(STORE_EVENTOS, { keyPath: 'eventoKey' });
        }
        if (!db.objectStoreNames.contains(STORE_ESTADOS)) {
          db.createObjectStore(STORE_ESTADOS, { keyPath: 'eventoKey' });
        }
      };
    });
  }

  function fallbackStoreName(storeName) {
    return FALLBACK_PREFIX + storeName;
  }

  function fallbackLoadStore(storeName) {
    return safeJsonParse(global.localStorage.getItem(fallbackStoreName(storeName)), {}) || {};
  }

  function fallbackSaveStore(storeName, data) {
    global.localStorage.setItem(fallbackStoreName(storeName), JSON.stringify(data || {}));
  }

  function mergeStoreObjects(primary, secondary) {
    var merged = {};
    Object.keys(secondary || {}).forEach(function(key) {
      merged[key] = secondary[key];
    });
    Object.keys(primary || {}).forEach(function(key) {
      merged[key] = primary[key];
    });
    return merged;
  }

  async function storePut(storeName, record) {
    var fallbackStore = fallbackLoadStore(storeName);
    fallbackStore[record.eventoKey] = record;
    fallbackSaveStore(storeName, fallbackStore);

    if (!supportsIndexedDB()) {
      return record;
    }

    try {
      var db = await openDB();
      return await new Promise(function(resolve, reject) {
        var tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(record);
        tx.oncomplete = function() { resolve(record); };
        tx.onerror = function() { reject(tx.error); };
      });
    } catch (error) {
      return record;
    }
  }

  async function storeGet(storeName, key) {
    var fallbackStore = fallbackLoadStore(storeName);
    var fallbackRecord = fallbackStore[key] || null;

    if (!supportsIndexedDB()) {
      return fallbackRecord;
    }

    try {
      var db = await openDB();
      var indexedRecord = await new Promise(function(resolve, reject) {
        var request = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
        request.onsuccess = function() { resolve(request.result || null); };
        request.onerror = function() { reject(request.error); };
      });
      return indexedRecord || fallbackRecord;
    } catch (error) {
      return fallbackRecord;
    }
  }

  async function storeGetAll(storeName) {
    var fallbackStore = fallbackLoadStore(storeName);

    if (!supportsIndexedDB()) {
      return Object.keys(fallbackStore).map(function(key) {
        return fallbackStore[key];
      });
    }

    try {
      var db = await openDB();
      var indexedRecords = await new Promise(function(resolve, reject) {
        var request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
        request.onsuccess = function() { resolve(request.result || []); };
        request.onerror = function() { reject(request.error); };
      });
      var indexedMap = {};
      (indexedRecords || []).forEach(function(record) {
        if (record && record.eventoKey) {
          indexedMap[record.eventoKey] = record;
        }
      });
      var merged = mergeStoreObjects(indexedMap, fallbackStore);
      return Object.keys(merged).map(function(key) {
        return merged[key];
      });
    } catch (error) {
      return Object.keys(fallbackStore).map(function(key) {
        return fallbackStore[key];
      });
    }
  }

  async function storeDelete(storeName, key) {
    var fallbackStore = fallbackLoadStore(storeName);
    delete fallbackStore[key];
    fallbackSaveStore(storeName, fallbackStore);

    if (!supportsIndexedDB()) {
      return true;
    }

    try {
      var db = await openDB();
      return await new Promise(function(resolve, reject) {
        var tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).delete(key);
        tx.oncomplete = function() { resolve(true); };
        tx.onerror = function() { reject(tx.error); };
      });
    } catch (error) {
      return true;
    }
  }

  async function storeClear(storeName) {
    fallbackSaveStore(storeName, {});

    if (!supportsIndexedDB()) {
      return true;
    }

    try {
      var db = await openDB();
      return await new Promise(function(resolve, reject) {
        var tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).clear();
        tx.oncomplete = function() { resolve(true); };
        tx.onerror = function() { reject(tx.error); };
      });
    } catch (error) {
      return true;
    }
  }

  async function safeFetchJson(url, fallback) {
    if (!url) return fallback;
    try {
      var response = await global.fetch(url);
      if (!response.ok) return fallback;
      return await response.json();
    } catch (error) {
      return fallback;
    }
  }

  function isStaticBootstrapEnabled() {
    return !!STATIC_BOOTSTRAP.enabled;
  }

  async function loadBaseConfig() {
    if (!isStaticBootstrapEnabled()) {
      return {};
    }
    if (!baseConfigPromise) {
      baseConfigPromise = safeFetchJson(STATIC_BOOTSTRAP.configUrl || '', {});
    }
    return cloneJson(await baseConfigPromise);
  }

  async function loadBaseEstado() {
    if (!isStaticBootstrapEnabled()) {
      return { eventos: {} };
    }
    if (!baseEstadoPromise) {
      baseEstadoPromise = safeFetchJson(STATIC_BOOTSTRAP.estadoUrl || '', { eventos: {} });
    }
    var base = await baseEstadoPromise;
    if (!base || typeof base !== 'object') {
      return { eventos: {} };
    }
    if (!base.eventos) {
      return { eventos: {} };
    }
    return cloneJson(base);
  }

  function normalizeCatalogRecord(eventoKey, source) {
    var record = Object.assign({}, toObject(source));
    record.eventoKey = eventoKey;
    record.nombre = collapseSpaces(record.nombre) || humanizeEventoKey(eventoKey);
    record.fecha = trimString(record.fecha || '');
    record.imagen_url = trimString(record.imagen_url || '');
    record.estado = collapseSpaces(record.estado || '');
    record.distancias = uniqueStrings(record.distancias || []);
    record.rutas_utmb = toObject(record.rutas_utmb);
    record.puntos_ruta = toObject(record.puntos_ruta);
    record.tramos_utmb = toObject(record.tramos_utmb);
    return record;
  }

  function normalizeEstadoRecord(eventoKey, source) {
    var record = Object.assign({}, toObject(source));
    record.eventoKey = eventoKey;
    if (typeof record.publicado !== 'boolean') {
      record.publicado = true;
    }
    record.fecha_publicacion = trimString(record.fecha_publicacion || '');
    record.chuspic_url = trimString(record.chuspic_url || '');
    record.diploma = toObject(record.diploma);
    record.diploma.plantilla_url = trimString(record.diploma.plantilla_url || '');
    record.diploma.pie = trimString(record.diploma.pie || '');
    record.diploma.campos = toObject(record.diploma.campos);
    return record;
  }

  async function loadEventosCatalogo() {
    var base = await loadBaseConfig();
    var localRecords = await storeGetAll(STORE_EVENTOS);
    var merged = {};

    Object.keys(base || {}).forEach(function(eventoKey) {
      merged[eventoKey] = normalizeCatalogRecord(eventoKey, base[eventoKey]);
    });

    (localRecords || []).forEach(function(record) {
      if (!record || !record.eventoKey) return;
      var current = merged[record.eventoKey] || {};
      merged[record.eventoKey] = normalizeCatalogRecord(record.eventoKey, Object.assign({}, current, record));
    });

    return merged;
  }

  async function loadEstadoEventos() {
    var base = await loadBaseEstado();
    var localRecords = await storeGetAll(STORE_ESTADOS);
    var merged = {};

    Object.keys(base.eventos || {}).forEach(function(eventoKey) {
      merged[eventoKey] = normalizeEstadoRecord(eventoKey, base.eventos[eventoKey]);
    });

    (localRecords || []).forEach(function(record) {
      if (!record || !record.eventoKey) return;
      var current = merged[record.eventoKey] || {};
      merged[record.eventoKey] = normalizeEstadoRecord(record.eventoKey, Object.assign({}, current, record));
    });

    return { eventos: merged };
  }

  async function saveEventoConfig(eventoKey, payload) {
    var catalog = await loadEventosCatalogo();
    var finalKey = slugify(eventoKey || payload.eventoKey || payload.nombre || '');
    if (!finalKey) {
      throw new Error('El evento necesita un eventoKey valido.');
    }

    var current = catalog[finalKey] || {};
    var nextRecord = normalizeCatalogRecord(finalKey, Object.assign({}, current, payload, {
      eventoKey: finalKey,
      updatedAt: new Date().toISOString()
    }));

    await storePut(STORE_EVENTOS, nextRecord);
    return nextRecord;
  }

  async function saveEstadoEvento(eventoKey, payload) {
    if (!eventoKey) {
      throw new Error('Falta eventoKey para guardar el estado.');
    }

    var estadoActual = await loadEstadoEventos();
    var current = estadoActual.eventos[eventoKey] || {};
    var nextRecord = normalizeEstadoRecord(eventoKey, Object.assign({}, current, payload, {
      eventoKey: eventoKey,
      updatedAt: new Date().toISOString()
    }));

    await storePut(STORE_ESTADOS, nextRecord);
    return nextRecord;
  }

  async function deleteEventoConfig(eventoKey) {
    if (!eventoKey) return true;
    return storeDelete(STORE_EVENTOS, eventoKey);
  }

  async function deleteEstadoEvento(eventoKey) {
    if (!eventoKey) return true;
    return storeDelete(STORE_ESTADOS, eventoKey);
  }

  function buildResultadosRecord(eventoKey, payload) {
    var resultados = payload.resultados || payload.data || {};
    var stats = payload.stats || summarizeResultados(resultados);
    var rawCsvText = cleanBom(payload.rawCsvText || '');
    var sourceHash = payload.sourceHash || fnv1a(rawCsvText || JSON.stringify(resultados));

    return {
      eventoKey: eventoKey,
      schemaVersion: SCHEMA_VERSION,
      importedAt: payload.importedAt || new Date().toISOString(),
      originalFileName: trimString(payload.originalFileName || payload.fileName || ''),
      sourceHash: sourceHash,
      duplicatePolicy: DUPLICATE_POLICY,
      stats: {
        distancias: stats.distancias || [],
        totalAtletas: stats.totalAtletas || 0,
        llegados: stats.llegados || 0,
        sinTiempo: stats.sinTiempo || 0,
        finalizacionPct: stats.finalizacionPct || 0,
        promedioTiempo: stats.promedioTiempo || null,
        mejorTiempo: stats.mejorTiempo || null,
        totalFilas: stats.totalFilas || 0,
        filasValidas: stats.filasValidas || 0,
        totalErrores: stats.totalErrores || 0,
        duplicadosCount: stats.duplicadosCount || 0,
        duplicadosFilas: stats.duplicadosFilas || 0,
        porGenero: cloneJson(stats.porGenero || {}),
        porCategoria: cloneJson(stats.porCategoria || {}),
        porDistancia: cloneJson(stats.porDistancia || {})
      },
      duplicates: cloneJson(payload.duplicates || []),
      validationErrors: cloneJson(payload.validationErrors || []),
      resultados: cloneJson(resultados)
    };
  }

  async function cacheSaveEvento(eventoKey, payload) {
    if (!eventoKey) {
      throw new Error('Falta eventoKey para guardar resultados.');
    }

    var record = buildResultadosRecord(eventoKey, payload);
    await storePut(STORE_RESULTADOS, record);
    return cloneJson(record);
  }

  async function cacheLoadEvento(eventoKey) {
    var record = await storeGet(STORE_RESULTADOS, eventoKey);
    if (!record) return null;
    if (record.schemaVersion !== SCHEMA_VERSION) return null;
    return cloneJson(record);
  }

  async function cacheDeleteEvento(eventoKey) {
    return storeDelete(STORE_RESULTADOS, eventoKey);
  }

  async function cacheListEventos() {
    var records = await storeGetAll(STORE_RESULTADOS);
    return (records || [])
      .filter(function(record) {
        return record && record.schemaVersion === SCHEMA_VERSION;
      })
      .map(function(record) {
        return cloneJson(record);
      });
  }

  async function loadResultadosEvento(eventoKey) {
    var record = await cacheLoadEvento(eventoKey);
    return record ? record.resultados : null;
  }

  function flattenResultados(resultados) {
    var flat = {};
    Object.keys(resultados || {}).forEach(function(distancia) {
      Object.keys(resultados[distancia] || {}).forEach(function(dorsal) {
        var athleteKey = distancia + '::' + dorsal;
        flat[athleteKey] = Object.assign({ dorsal: dorsal, distancia: distancia }, resultados[distancia][dorsal]);
      });
    });
    return flat;
  }

  async function loadResultadosEventoFlat(eventoKey) {
    var resultados = await loadResultadosEvento(eventoKey);
    if (!resultados) return null;
    return flattenResultados(resultados);
  }

  function listAtletasEvento(resultados) {
    var atletas = [];
    Object.keys(resultados || {}).forEach(function(distancia) {
      Object.keys(resultados[distancia] || {}).forEach(function(dorsal) {
        atletas.push(Object.assign({ dorsal: dorsal, distancia: distancia }, resultados[distancia][dorsal]));
      });
    });
    return atletas;
  }

  function findAtleta(resultados, dorsal, distancia) {
    if (!resultados || !dorsal) return null;

    var distancias = distancia ? [distancia] : Object.keys(resultados);
    for (var i = 0; i < distancias.length; i++) {
      var dist = distancias[i];
      if (!resultados[dist]) continue;
      if (resultados[dist][dorsal]) {
        return {
          distancia: dist,
          atleta: resultados[dist][dorsal]
        };
      }
    }

    var dorsalStr = String(dorsal);
    var allDistances = Object.keys(resultados);
    for (var j = 0; j < allDistances.length; j++) {
      var distanceLabel = allDistances[j];
      var dorsales = Object.keys(resultados[distanceLabel] || {});
      for (var k = 0; k < dorsales.length; k++) {
        if (String(dorsales[k]) === dorsalStr) {
          return {
            distancia: distanceLabel,
            atleta: resultados[distanceLabel][dorsales[k]]
          };
        }
      }
    }

    return null;
  }

  async function parseResultadosCsvForEvento(eventoKey, csvText, originalFileName, options) {
    if (!eventoKey) {
      throw new Error('Selecciona un evento antes de importar el CSV.');
    }

    var parsed = parseCsv(csvText);
    if (!parsed.rows.length) {
      throw new Error('El CSV esta vacio o no contiene filas de resultados.');
    }

    var opts = normalizeImportOptions(options);
    var indexed = buildResultadosIndex(parsed.rows, opts);
    if (!indexed.stats.totalAtletas && !indexed.validationErrors.length) {
      throw new Error('No se encontraron atletas validos en el CSV.');
    }

    return {
      eventoKey: eventoKey,
      schemaVersion: SCHEMA_VERSION,
      importedAt: new Date().toISOString(),
      originalFileName: trimString(originalFileName || ''),
      sourceHash: fnv1a(cleanBom(csvText)),
      headers: parsed.headers,
      normalizedHeaders: parsed.normalizedHeaders,
      stats: indexed.stats,
      duplicates: indexed.duplicates,
      validationErrors: indexed.validationErrors,
      importOptions: opts,
      resultados: indexed.data,
      previewRows: buildPreviewRows(indexed.data),
      rawCsvText: cleanBom(csvText)
    };
  }

  async function saveResultadosFromCsv(eventoKey, csvText, originalFileName, options) {
    var preview = await parseResultadosCsvForEvento(eventoKey, csvText, originalFileName, options);
    var saved = await cacheSaveEvento(eventoKey, preview);
    return Object.assign({}, preview, {
      saved: saved,
      meta: {
        originalFileName: saved.originalFileName,
        distancias: saved.stats.distancias,
        totalAtletas: saved.stats.totalAtletas,
        llegados: saved.stats.llegados,
        duplicadosCount: saved.stats.duplicadosCount,
        erroresCount: saved.stats.totalErrores
      }
    });
  }

  function mergeEventoConfig(eventoKey, config, estado, resultadosRecord) {
    var merged = normalizeCatalogRecord(eventoKey, config || {});
    var mergedEstado = normalizeEstadoRecord(eventoKey, estado || {});
    var resultsStats = resultadosRecord && resultadosRecord.stats ? resultadosRecord.stats : null;

    merged.publicado = mergedEstado.publicado;
    merged.fecha_publicacion = mergedEstado.fecha_publicacion;
    merged.chuspic_url = mergedEstado.chuspic_url;
    merged.diploma = mergedEstado.diploma;
    merged.diploma_url = mergedEstado.diploma.plantilla_url || '';
    merged.pie_diploma = mergedEstado.diploma.pie || '';
    merged.estado = resultsStats && resultsStats.totalAtletas > 0 ? 'Resultados disponibles' : 'Esperando resultados';
    merged.distancias = uniqueStrings(
      (resultsStats && resultsStats.distancias) ||
      merged.distancias ||
      Object.keys(merged.rutas_utmb || {})
    );
    merged.totalAtletas = resultsStats ? resultsStats.totalAtletas : 0;
    merged.llegados = resultsStats ? resultsStats.llegados : 0;
    merged.hasResultados = !!(resultsStats && resultsStats.totalAtletas > 0);
    merged.importedAt = resultadosRecord ? resultadosRecord.importedAt : '';
    merged.originalFileName = resultadosRecord ? resultadosRecord.originalFileName : '';
    return merged;
  }

  function uniqueKeyList(values) {
    var seen = {};
    var keys = [];
    (values || []).forEach(function(value) {
      var key = trimString(value);
      if (!key || seen[key]) return;
      seen[key] = true;
      keys.push(key);
    });
    return keys;
  }

  function getSourceKeys(source) {
    if (Array.isArray(source)) {
      return uniqueKeyList(source);
    }
    return uniqueKeyList(Object.keys(source || {}));
  }

  function resolveEventoKeyFromKeys(inputKey, keys) {
    if (!keys.length) return null;
    if (!inputKey) return keys[0] || null;
    if (keys.indexOf(inputKey) !== -1) return inputKey;

    var normalizedInput = slugify(inputKey);
    var exactSlug = keys.find(function(key) { return slugify(key) === normalizedInput; });
    if (exactSlug) return exactSlug;

    var normalizedHuman = normalizeIdentity(inputKey);
    var humanMatch = keys.find(function(key) {
      return normalizeIdentity(key) === normalizedHuman || normalizeIdentity(humanizeEventoKey(key)) === normalizedHuman;
    });
    if (humanMatch) return humanMatch;

    var partial = keys.find(function(key) {
      return slugify(key).indexOf(normalizedInput) !== -1 || normalizedInput.indexOf(slugify(key)) !== -1;
    });

    return partial || null;
  }

  async function loadEventoBundle(eventoKey) {
    var catalog = await loadEventosCatalogo();
    var estado = await loadEstadoEventos();
    var record = await cacheLoadEvento(eventoKey);
    var config = catalog[eventoKey] || null;
    if (!config) return null;

    return {
      eventoKey: eventoKey,
      config: mergeEventoConfig(eventoKey, config, estado.eventos[eventoKey], record),
      estado: normalizeEstadoRecord(eventoKey, estado.eventos[eventoKey] || {}),
      resultadosRecord: record
    };
  }

  async function loadEventosVista() {
    var catalog = await loadEventosCatalogo();
    var estado = await loadEstadoEventos();
    var resultRecords = await cacheListEventos();
    var recordMap = {};

    resultRecords.forEach(function(record) {
      recordMap[record.eventoKey] = record;
    });

    return uniqueKeyList(Object.keys(catalog).concat(Object.keys(recordMap))).map(function(eventoKey) {
      return mergeEventoConfig(
        eventoKey,
        catalog[eventoKey] || buildRuntimeEventConfig(eventoKey, recordMap[eventoKey] || null),
        estado.eventos[eventoKey],
        recordMap[eventoKey] || null
      );
    });
  }

  function resolveEventoKey(inputKey, catalog) {
    return resolveEventoKeyFromKeys(inputKey, getSourceKeys(catalog));
  }

  async function resolveEventoRuntimeKey(inputKey) {
    var catalog = await loadEventosCatalogo();
    var records = await cacheListEventos();
    var keys = getSourceKeys(catalog);

    records.forEach(function(record) {
      if (record && record.eventoKey) {
        keys.push(record.eventoKey);
      }
    });

    return resolveEventoKeyFromKeys(inputKey, uniqueKeyList(keys));
  }

  function buildRuntimeEventConfig(eventoKey, record) {
    return normalizeCatalogRecord(eventoKey, {
      eventoKey: eventoKey,
      nombre: humanizeEventoKey(eventoKey),
      distancias: record && record.stats ? record.stats.distancias || [] : []
    });
  }

  async function loadEventoRuntime(inputKey) {
    var catalog = await loadEventosCatalogo();
    var estado = await loadEstadoEventos();
    var records = await cacheListEventos();
    var recordMap = {};

    records.forEach(function(record) {
      if (record && record.eventoKey) {
        recordMap[record.eventoKey] = record;
      }
    });

    var runtimeKeys = uniqueKeyList(getSourceKeys(catalog).concat(Object.keys(recordMap)));
    var resolvedKey = resolveEventoKeyFromKeys(inputKey, runtimeKeys);
    if (!resolvedKey) return null;

    var record = recordMap[resolvedKey] || null;
    var config = catalog[resolvedKey] || buildRuntimeEventConfig(resolvedKey, record);

    return {
      eventoKey: resolvedKey,
      config: mergeEventoConfig(resolvedKey, config, estado.eventos[resolvedKey], record),
      estado: normalizeEstadoRecord(resolvedKey, estado.eventos[resolvedKey] || {}),
      resultadosRecord: record,
      resultados: record ? cloneJson(record.resultados) : null
    };
  }

  async function loadAllResultadosRecords() {
    var records = await cacheListEventos();
    var output = {};
    records.forEach(function(record) {
      output[record.eventoKey] = record.resultados;
    });
    return output;
  }

  async function deleteEventoCompleto(eventoKey) {
    await deleteEventoConfig(eventoKey);
    await deleteEstadoEvento(eventoKey);
    await cacheDeleteEvento(eventoKey);
    return true;
  }

  async function dumpLocalSnapshot() {
    return {
      kind: 'yair-timings-local-snapshot',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      staticBootstrapEnabled: isStaticBootstrapEnabled(),
      eventos: await loadEventosCatalogo(),
      estados: await loadEstadoEventos(),
      resultados: await cacheListEventos()
    };
  }

  function normalizeSnapshot(snapshot) {
    var normalized = toObject(snapshot);
    var estados = toObject(normalized.estados);
    if (!estados.eventos || typeof estados.eventos !== 'object') {
      estados = { eventos: {} };
    }

    return {
      eventos: toObject(normalized.eventos),
      estados: estados,
      resultados: Array.isArray(normalized.resultados) ? normalized.resultados : []
    };
  }

  async function restoreLocalSnapshot(snapshot, options) {
    var payload = normalizeSnapshot(snapshot);
    var opts = toObject(options);
    var eventKeys = Object.keys(payload.eventos);
    var estadoKeys = Object.keys(payload.estados.eventos || {});
    var restoredResultados = 0;

    if (opts.replaceExisting !== false) {
      await clearAllLocalData();
    }

    for (var i = 0; i < eventKeys.length; i++) {
      await saveEventoConfig(eventKeys[i], payload.eventos[eventKeys[i]]);
    }

    for (var j = 0; j < estadoKeys.length; j++) {
      await saveEstadoEvento(estadoKeys[j], payload.estados.eventos[estadoKeys[j]]);
    }

    for (var k = 0; k < payload.resultados.length; k++) {
      var record = payload.resultados[k];
      if (!record || !record.eventoKey) continue;
      await cacheSaveEvento(record.eventoKey, record);
      restoredResultados += 1;
    }

    return {
      eventos: eventKeys.length,
      estados: estadoKeys.length,
      resultados: restoredResultados
    };
  }

  async function clearAllLocalData() {
    await storeClear(STORE_EVENTOS);
    await storeClear(STORE_ESTADOS);
    await storeClear(STORE_RESULTADOS);
    return true;
  }

  var api = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    DUPLICATE_POLICY: DUPLICATE_POLICY,
    parseCsv: parseCsv,
    parseCsvSemicolon: parseCsv,
    normalizeRow: normalizeRow,
    buildResultadosIndex: buildResultadosIndex,
    summarizeResultados: summarizeResultados,
    parseResultadosCsvForEvento: parseResultadosCsvForEvento,
    saveResultadosFromCsv: saveResultadosFromCsv,
    cacheSaveEvento: cacheSaveEvento,
    cacheLoadEvento: cacheLoadEvento,
    cacheDeleteEvento: cacheDeleteEvento,
    cacheListEventos: cacheListEventos,
    loadResultadosEvento: loadResultadosEvento,
    loadResultadosEventoFlat: loadResultadosEventoFlat,
    flattenResultados: flattenResultados,
    listAtletasEvento: listAtletasEvento,
    findAtleta: findAtleta,
    loadEventosCatalogo: loadEventosCatalogo,
    loadEstadoEventos: loadEstadoEventos,
    saveEventoConfig: saveEventoConfig,
    saveEstadoEvento: saveEstadoEvento,
    deleteEventoConfig: deleteEventoConfig,
    deleteEstadoEvento: deleteEstadoEvento,
    deleteEventoCompleto: deleteEventoCompleto,
    dumpLocalSnapshot: dumpLocalSnapshot,
    restoreLocalSnapshot: restoreLocalSnapshot,
    clearAllLocalData: clearAllLocalData,
    loadEventoBundle: loadEventoBundle,
    loadEventoRuntime: loadEventoRuntime,
    loadEventosVista: loadEventosVista,
    resolveEventoKey: resolveEventoKey,
    resolveEventoRuntimeKey: resolveEventoRuntimeKey,
    loadAllResultadosRecords: loadAllResultadosRecords,
    humanizeEventoKey: humanizeEventoKey,
    buildEventoKeyFromName: buildEventoKeyFromName,
    slugify: slugify,
    timeToSortableSeconds: timeToSortableSeconds,
    normalizeRaceTime: normalizeRaceTime,
    normalizePace: normalizePace,
    secondsToRaceTime: secondsToRaceTime,
    secondsToPace: secondsToPace,
    isStaticBootstrapEnabled: isStaticBootstrapEnabled
  };

  global.YairStore = api;
  global.YairCSV = api;
})(window);
