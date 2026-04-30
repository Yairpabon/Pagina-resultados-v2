/* global YairStore, YairSupabase */

(function (global) {
  'use strict';

  if (!global.YairStore) {
    console.error('[YairSupabaseStore] YairStore no esta cargado todavia.');
    return;
  }
  if (!global.YairSupabase || !global.YairSupabase.client) {
    console.error('[YairSupabaseStore] YairSupabase no esta cargado todavia.');
    return;
  }

  var Store = global.YairStore;
  var sb = global.YairSupabase.client;

  function trim(value) { return String(value == null ? '' : value).trim(); }

  function obj(value) { return value && typeof value === 'object' ? value : {}; }

  function clone(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function uniq(values) {
    var seen = {}, out = [];
    (values || []).forEach(function (v) {
      var t = trim(v);
      if (!t || seen[t]) return;
      seen[t] = true;
      out.push(t);
    });
    return out;
  }

  var eventoIdCache = {};

  function invalidateEventoIdCache(eventoKey) {
    if (!eventoKey) eventoIdCache = {};
    else delete eventoIdCache[eventoKey];
  }

  async function getEventoIdByKey(eventoKey, allowCreate) {
    if (!eventoKey) return null;
    if (eventoIdCache[eventoKey]) return eventoIdCache[eventoKey];

    var resp = await sb.from('eventos').select('id').eq('evento_key', eventoKey).maybeSingle();
    if (resp.error) throw resp.error;

    if (resp.data) {
      eventoIdCache[eventoKey] = resp.data.id;
      return resp.data.id;
    }

    if (!allowCreate) return null;

    var ins = await sb.from('eventos')
      .insert({ evento_key: eventoKey, nombre: Store.humanizeEventoKey(eventoKey) })
      .select('id')
      .single();
    if (ins.error) throw ins.error;
    eventoIdCache[eventoKey] = ins.data.id;
    return ins.data.id;
  }

  function rowToCatalogRecord(row) {
    var meta = obj(row.meta);
    return {
      eventoKey: row.evento_key,
      nombre: row.nombre || Store.humanizeEventoKey(row.evento_key),
      fecha: row.fecha || '',
      imagen_url: meta.imagen_url || '',
      estado: '',
      distancias: uniq(meta.distancias || []),
      rutas_utmb: obj(meta.rutas_utmb),
      puntos_ruta: obj(meta.puntos_ruta),
      tramos_utmb: obj(meta.tramos_utmb),
      updatedAt: row.updated_at || ''
    };
  }

  function rowToEstadoRecord(row) {
    var meta = obj(row.meta);
    var diploma = obj(row.diploma);
    return {
      eventoKey: row.evento_key,
      publicado: row.publicado === true,
      fecha_publicacion: meta.fecha_publicacion || '',
      chuspic_url: row.chuspic_url || '',
      diploma: {
        plantilla_url: diploma.plantilla_url || '',
        pie: diploma.pie || '',
        campos: obj(diploma.campos)
      }
    };
  }


  async function loadEventosCatalogo() {
    var resp = await sb.from('eventos').select('*').order('fecha', { ascending: false });
    if (resp.error) throw resp.error;
    var out = {};
    (resp.data || []).forEach(function (row) {
      eventoIdCache[row.evento_key] = row.id;
      out[row.evento_key] = rowToCatalogRecord(row);
    });
    return out;
  }

  async function loadEstadoEventos() {
    var resp = await sb.from('eventos').select('*');
    if (resp.error) throw resp.error;
    var eventos = {};
    (resp.data || []).forEach(function (row) {
      eventoIdCache[row.evento_key] = row.id;
      eventos[row.evento_key] = rowToEstadoRecord(row);
    });
    return { eventos: eventos };
  }

  async function saveEventoConfig(eventoKey, payload) {
    var key = Store.slugify(eventoKey || (payload && payload.eventoKey) || (payload && payload.nombre) || '');
    if (!key) throw new Error('El evento necesita un eventoKey valido.');

    var p = obj(payload);

    var currentResp = await sb.from('eventos').select('*').eq('evento_key', key).maybeSingle();
    if (currentResp.error) throw currentResp.error;
    var current = currentResp.data || null;
    var currentMeta = obj(current && current.meta);

    var newMeta = Object.assign({}, currentMeta, {
      imagen_url: p.imagen_url != null ? trim(p.imagen_url) : (currentMeta.imagen_url || ''),
      distancias: p.distancias ? uniq(p.distancias) : (currentMeta.distancias || []),
      rutas_utmb: p.rutas_utmb != null ? obj(p.rutas_utmb) : obj(currentMeta.rutas_utmb),
      puntos_ruta: p.puntos_ruta != null ? obj(p.puntos_ruta) : obj(currentMeta.puntos_ruta),
      tramos_utmb: p.tramos_utmb != null ? obj(p.tramos_utmb) : obj(currentMeta.tramos_utmb)
    });

    var row = {
      evento_key: key,
      nombre: trim(p.nombre) || (current && current.nombre) || Store.humanizeEventoKey(key),
      fecha: p.fecha ? trim(p.fecha) : (current && current.fecha) || null,
      meta: newMeta
    };

    var up = await sb.from('eventos').upsert(row, { onConflict: 'evento_key' }).select('*').single();
    if (up.error) throw up.error;
    eventoIdCache[key] = up.data.id;
    return rowToCatalogRecord(up.data);
  }

  async function saveEstadoEvento(eventoKey, payload) {
    if (!eventoKey) throw new Error('Falta eventoKey para guardar el estado.');
    var p = obj(payload);

    var currentResp = await sb.from('eventos').select('*').eq('evento_key', eventoKey).maybeSingle();
    if (currentResp.error) throw currentResp.error;
    var current = currentResp.data || null;

    var newMeta = Object.assign({}, obj(current && current.meta), {
      fecha_publicacion: p.fecha_publicacion != null
        ? trim(p.fecha_publicacion)
        : (obj(current && current.meta).fecha_publicacion || '')
    });

    var diploma = p.diploma != null ? obj(p.diploma) : obj(current && current.diploma);
    diploma = {
      plantilla_url: diploma.plantilla_url || '',
      pie: diploma.pie || '',
      campos: obj(diploma.campos)
    };

    var row = {
      evento_key: eventoKey,
      nombre: (current && current.nombre) || Store.humanizeEventoKey(eventoKey),
      publicado: typeof p.publicado === 'boolean' ? p.publicado : (current ? current.publicado : false),
      chuspic_url: p.chuspic_url != null ? trim(p.chuspic_url) : (current ? current.chuspic_url : ''),
      diploma: diploma,
      meta: newMeta
    };

    var up = await sb.from('eventos').upsert(row, { onConflict: 'evento_key' }).select('*').single();
    if (up.error) throw up.error;
    eventoIdCache[eventoKey] = up.data.id;
    return rowToEstadoRecord(up.data);
  }

  async function deleteEventoConfig(eventoKey) {
    if (!eventoKey) return true;
    var resp = await sb.from('eventos').delete().eq('evento_key', eventoKey);
    if (resp.error) throw resp.error;
    invalidateEventoIdCache(eventoKey);
    return true;
  }

  async function deleteEstadoEvento(eventoKey) {

    if (!eventoKey) return true;
    var resp = await sb.from('eventos')
      .update({ publicado: false })
      .eq('evento_key', eventoKey);
    if (resp.error) throw resp.error;
    return true;
  }

  async function deleteEventoCompleto(eventoKey) {
    return deleteEventoConfig(eventoKey);
  }

  function distanciasFromResultados(resultados) {
    return uniq(Object.keys(obj(resultados)));
  }

  async function cacheSaveEvento(eventoKey, payload) {
    if (!eventoKey) throw new Error('Falta eventoKey para guardar resultados.');
    var p = obj(payload);
    var resultados = obj(p.resultados || p.data);
    if (!Object.keys(resultados).length) {
      throw new Error('No hay resultados para guardar.');
    }

    var eventoId = await getEventoIdByKey(eventoKey, true);

    // 1) Limpiar atletas previos del evento (cascade: distancias quedan)
    var delAtletas = await sb.from('atletas').delete().eq('evento_id', eventoId);
    if (delAtletas.error) throw delAtletas.error;

    // 2) Asegurar distancias y obtener mapa nombre->id
    var distancias = distanciasFromResultados(resultados);
    if (distancias.length) {
      var rowsDist = distancias.map(function (nombre) {
        return { evento_id: eventoId, nombre: nombre };
      });
      var upDist = await sb.from('distancias')
        .upsert(rowsDist, { onConflict: 'evento_id,nombre' })
        .select('id,nombre');
      if (upDist.error) throw upDist.error;
    }

    var distResp = await sb.from('distancias').select('id,nombre').eq('evento_id', eventoId);
    if (distResp.error) throw distResp.error;
    var distMap = {};
    (distResp.data || []).forEach(function (r) { distMap[r.nombre] = r.id; });

    // 3) Insertar atletas
    var atletasRows = [];
    distancias.forEach(function (distancia) {
      var distId = distMap[distancia];
      if (!distId) return;
      var byDorsal = obj(resultados[distancia]);
      Object.keys(byDorsal).forEach(function (dorsal) {
        var a = obj(byDorsal[dorsal]);
        atletasRows.push({
          evento_id: eventoId,
          distancia_id: distId,
          dorsal: String(dorsal),
          nombre: a.nombre || '',
          genero: a.genero || null,
          categoria: a.categoria || null,
          pais: a.pais || null,
          tiempo_oficial: a.tiempo_oficial || null,
          tiempo_chip: a.tiempo_chip || null,
          ritmo: a.ritmo || null,
          pos_gral: a.posGral != null ? a.posGral : null,
          pos_genero: a.posGenero != null ? a.posGenero : null,
          pos_categoria: a.posCategoria != null ? a.posCategoria : null,
          puntos_control: a.puntos_control || {},
          tramos: a.tramos || {}
        });
      });
    });

    // insertar en chunks por seguridad (Postgres maneja, pero igual)
    var CHUNK = 500;
    for (var i = 0; i < atletasRows.length; i += CHUNK) {
      var slice = atletasRows.slice(i, i + CHUNK);
      var insA = await sb.from('atletas').insert(slice);
      if (insA.error) throw insA.error;
    }

    // 4) Registrar import (auditoria + ultima ventana de stats)
    var stats = p.stats || Store.summarizeResultados(resultados);
    var importRow = {
      evento_id: eventoId,
      file_name: p.originalFileName || p.fileName || '',
      source_hash: p.sourceHash || '',
      stats: stats,
      duplicates: p.duplicates || [],
      validation_errors: p.validationErrors || []
    };
    var importedBy = await currentUserIdSafe();
    if (importedBy) importRow.imported_by = importedBy;
    var insImp = await sb.from('csv_imports').insert(importRow).select('*').single();
    if (insImp.error) throw insImp.error;

    return {
      eventoKey: eventoKey,
      schemaVersion: Store.SCHEMA_VERSION,
      importedAt: insImp.data.imported_at,
      originalFileName: insImp.data.file_name || '',
      sourceHash: insImp.data.source_hash || '',
      duplicatePolicy: Store.DUPLICATE_POLICY,
      stats: stats,
      duplicates: clone(p.duplicates || []),
      validationErrors: clone(p.validationErrors || []),
      resultados: clone(resultados)
    };
  }

  async function currentUserIdSafe() {
    try {
      var u = await global.YairSupabase.currentUser();
      return u ? u.id : null;
    } catch (e) { return null; }
  }

  async function fetchResultadosForEvento(eventoId) {
    // distancias
    var distResp = await sb.from('distancias').select('id,nombre').eq('evento_id', eventoId);
    if (distResp.error) throw distResp.error;
    var distById = {};
    (distResp.data || []).forEach(function (d) { distById[d.id] = d.nombre; });
    if (!Object.keys(distById).length) return {};

    // atletas (paginado, supabase corta a 1000 por defecto)
    var resultados = {};
    var PAGE = 1000;
    var from = 0;
    while (true) {
      var aResp = await sb.from('atletas')
        .select('*')
        .eq('evento_id', eventoId)
        .range(from, from + PAGE - 1);
      if (aResp.error) throw aResp.error;
      var rows = aResp.data || [];
      rows.forEach(function (a) {
        var distancia = distById[a.distancia_id];
        if (!distancia) return;
        if (!resultados[distancia]) resultados[distancia] = {};
        resultados[distancia][a.dorsal] = {
          dorsal: a.dorsal,
          nombre: a.nombre || '',
          genero: a.genero || '-',
          categoria: a.categoria || 'General',
          distancia: distancia,
          pais: a.pais || 'COL',
          tiempo_oficial: a.tiempo_oficial || '--:--:--',
          tiempo_chip: a.tiempo_chip || a.tiempo_oficial || '--:--:--',
          ritmo: a.ritmo || '--:--',
          posGral: a.pos_gral,
          posGenero: a.pos_genero,
          posCategoria: a.pos_categoria,
          puntos_control: obj(a.puntos_control),
          tramos: obj(a.tramos)
        };
      });
      if (rows.length < PAGE) break;
      from += PAGE;
    }
    return resultados;
  }

  async function fetchLastImport(eventoId) {
    var resp = await sb.from('csv_imports')
      .select('*')
      .eq('evento_id', eventoId)
      .order('imported_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (resp.error) throw resp.error;
    return resp.data || null;
  }

  async function cacheLoadEvento(eventoKey) {
    if (!eventoKey) return null;
    var eventoId = await getEventoIdByKey(eventoKey, false);
    if (!eventoId) return null;

    var resultados = await fetchResultadosForEvento(eventoId);
    if (!Object.keys(resultados).length) return null;

    var lastImp = await fetchLastImport(eventoId);
    var stats = (lastImp && lastImp.stats) || Store.summarizeResultados(resultados);

    return {
      eventoKey: eventoKey,
      schemaVersion: Store.SCHEMA_VERSION,
      importedAt: lastImp ? lastImp.imported_at : '',
      originalFileName: lastImp ? (lastImp.file_name || '') : '',
      sourceHash: lastImp ? (lastImp.source_hash || '') : '',
      duplicatePolicy: Store.DUPLICATE_POLICY,
      stats: stats,
      duplicates: lastImp ? (lastImp.duplicates || []) : [],
      validationErrors: lastImp ? (lastImp.validation_errors || []) : [],
      resultados: resultados
    };
  }

  async function cacheDeleteEvento(eventoKey) {
    if (!eventoKey) return true;
    var eventoId = await getEventoIdByKey(eventoKey, false);
    if (!eventoId) return true;
    var d1 = await sb.from('atletas').delete().eq('evento_id', eventoId);
    if (d1.error) throw d1.error;
    var d2 = await sb.from('distancias').delete().eq('evento_id', eventoId);
    if (d2.error) throw d2.error;
    var d3 = await sb.from('csv_imports').delete().eq('evento_id', eventoId);
    if (d3.error) throw d3.error;
    return true;
  }

  async function cacheListEventos() {
    var resp = await sb.from('eventos').select('id,evento_key');
    if (resp.error) throw resp.error;
    var out = [];
    for (var i = 0; i < resp.data.length; i++) {
      var row = resp.data[i];
      eventoIdCache[row.evento_key] = row.id;
      var rec = await cacheLoadEvento(row.evento_key);
      if (rec) out.push(rec);
    }
    return out;
  }

  async function loadResultadosEvento(eventoKey) {
    var rec = await cacheLoadEvento(eventoKey);
    return rec ? rec.resultados : null;
  }

  async function loadResultadosEventoFlat(eventoKey) {
    var resultados = await loadResultadosEvento(eventoKey);
    if (!resultados) return null;
    return Store.flattenResultados(resultados);
  }

  async function loadAllResultadosRecords() {
    var records = await cacheListEventos();
    var out = {};
    records.forEach(function (record) {
      if (record && record.eventoKey) out[record.eventoKey] = record.resultados;
    });
    return out;
  }

  // ============================================================
  //          BUNDLES / VISTAS COMBINADAS (alto nivel)
  // ============================================================

  function mergeForBundle(eventoKey, catalog, estado, resultadosRecord) {
    var stats = resultadosRecord && resultadosRecord.stats ? resultadosRecord.stats : null;
    var merged = Object.assign({}, catalog || {});
    merged.eventoKey = eventoKey;
    merged.publicado = !!(estado && estado.publicado);
    merged.fecha_publicacion = estado ? estado.fecha_publicacion : '';
    merged.chuspic_url = estado ? estado.chuspic_url : '';
    merged.diploma = estado ? estado.diploma : { plantilla_url: '', pie: '', campos: {} };
    merged.diploma_url = merged.diploma.plantilla_url || '';
    merged.pie_diploma = merged.diploma.pie || '';
    merged.estado = stats && stats.totalAtletas > 0 ? 'Resultados disponibles' : 'Esperando resultados';
    merged.distancias = uniq(
      (stats && stats.distancias) ||
      (catalog && catalog.distancias) ||
      Object.keys((catalog && catalog.rutas_utmb) || {})
    );
    merged.totalAtletas = stats ? stats.totalAtletas : 0;
    merged.llegados = stats ? stats.llegados : 0;
    merged.hasResultados = !!(stats && stats.totalAtletas > 0);
    merged.importedAt = resultadosRecord ? resultadosRecord.importedAt : '';
    merged.originalFileName = resultadosRecord ? resultadosRecord.originalFileName : '';
    return merged;
  }

  async function loadEventoBundle(eventoKey) {
    if (!eventoKey) return null;
    var resp = await sb.from('eventos').select('*').eq('evento_key', eventoKey).maybeSingle();
    if (resp.error) throw resp.error;
    if (!resp.data) return null;
    eventoIdCache[eventoKey] = resp.data.id;

    var catalog = rowToCatalogRecord(resp.data);
    var estado = rowToEstadoRecord(resp.data);
    var record = await cacheLoadEvento(eventoKey);

    return {
      eventoKey: eventoKey,
      config: mergeForBundle(eventoKey, catalog, estado, record),
      estado: estado,
      resultadosRecord: record,
      resultados: record ? clone(record.resultados) : null
    };
  }

  async function loadEventoRuntime(eventoKey) {
    return loadEventoBundle(eventoKey);
  }

  async function loadEventosVista() {
    // Devuelve la MISMA forma plana que el csvParser original: una lista
    // de objetos donde cada item ya incluye nombre, fecha, publicado, etc.
    var resp = await sb.from('eventos').select('*').order('fecha', { ascending: false });
    if (resp.error) throw resp.error;
    var out = [];
    for (var i = 0; i < resp.data.length; i++) {
      var row = resp.data[i];
      eventoIdCache[row.evento_key] = row.id;
      var catalog = rowToCatalogRecord(row);
      var estado = rowToEstadoRecord(row);
      var record = await cacheLoadEvento(row.evento_key);
      out.push(mergeForBundle(row.evento_key, catalog, estado, record));
    }
    return out;
  }

  // ============================================================
  //          OVERRIDE de saveResultadosFromCsv para que
  //          use el cacheSaveEvento de Supabase (no el local).
  // ============================================================

  async function saveResultadosFromCsv(eventoKey, csvText, originalFileName, options) {
    var preview = await Store.parseResultadosCsvForEvento(eventoKey, csvText, originalFileName, options);
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

  // ============================================================
  //                 SNAPSHOT / WIPE (compat)
  // ============================================================

  async function dumpLocalSnapshot() {
    var catalogo = await loadEventosCatalogo();
    var estado = await loadEstadoEventos();
    var resultados = await cacheListEventos();
    return {
      schemaVersion: Store.SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      eventos: catalogo,
      estados: estado,
      resultados: resultados
    };
  }

  async function restoreLocalSnapshot(payload) {
    var p = obj(payload);
    var eventos = obj(p.eventos);
    var estados = obj(obj(p.estados).eventos);
    var resultados = Array.isArray(p.resultados) ? p.resultados : [];
    var keys = uniq(Object.keys(eventos));
    for (var i = 0; i < keys.length; i++) {
      await saveEventoConfig(keys[i], eventos[keys[i]]);
    }
    var ekeys = uniq(Object.keys(estados));
    for (var j = 0; j < ekeys.length; j++) {
      await saveEstadoEvento(ekeys[j], estados[ekeys[j]]);
    }
    var restored = 0;
    for (var k = 0; k < resultados.length; k++) {
      var rec = resultados[k];
      if (!rec || !rec.eventoKey) continue;
      await cacheSaveEvento(rec.eventoKey, rec);
      restored += 1;
    }
    return { eventos: keys.length, estados: ekeys.length, resultados: restored };
  }

  async function clearAllLocalData() {
    // borra TODO el contenido del backend
    var resp = await sb.from('eventos').delete().neq('id', 0); // RLS-safe
    if (resp.error) throw resp.error;
    eventoIdCache = {};
    return true;
  }

  // ============================================================
  //          INSTALAR OVERRIDES en el namespace YairStore
  // ============================================================

  Store.loadEventosCatalogo     = loadEventosCatalogo;
  Store.loadEstadoEventos       = loadEstadoEventos;
  Store.saveEventoConfig        = saveEventoConfig;
  Store.saveEstadoEvento        = saveEstadoEvento;
  Store.deleteEventoConfig      = deleteEventoConfig;
  Store.deleteEstadoEvento      = deleteEstadoEvento;
  Store.deleteEventoCompleto    = deleteEventoCompleto;
  Store.cacheSaveEvento         = cacheSaveEvento;
  Store.cacheLoadEvento         = cacheLoadEvento;
  Store.cacheDeleteEvento       = cacheDeleteEvento;
  Store.cacheListEventos        = cacheListEventos;
  Store.loadResultadosEvento    = loadResultadosEvento;
  Store.loadResultadosEventoFlat= loadResultadosEventoFlat;
  Store.loadAllResultadosRecords= loadAllResultadosRecords;
  Store.loadEventoBundle        = loadEventoBundle;
  Store.loadEventoRuntime       = loadEventoRuntime;
  Store.loadEventosVista        = loadEventosVista;
  Store.saveResultadosFromCsv   = saveResultadosFromCsv;
  Store.dumpLocalSnapshot       = dumpLocalSnapshot;
  Store.restoreLocalSnapshot    = restoreLocalSnapshot;
  Store.clearAllLocalData       = clearAllLocalData;

  // marca para debug
  Store.__backend = 'supabase';
  global.YairStoreBackend = 'supabase';
  console.info('[YairSupabaseStore] adaptador Supabase instalado.');
})(window);
