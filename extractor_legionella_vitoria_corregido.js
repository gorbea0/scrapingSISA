/* Legionella Vitoria-Gasteiz. Solo lectura. Ejecutar en la búsqueda de casos, tras pulsar Buscar. */
(async () => {
  'use strict';
  const LIMITE = Infinity; // Cambiar a 3 para una prueba corta
  const ESPERA_MS = 700;
  const BASE = '/ab69ljLegionellaWar/casosLegionella/maintDetalle/';
  const dormir = ms => new Promise(r => setTimeout(r, ms));
  const $ = window.jQuery;
  if (!$?.fn?.dataTable) throw Error('Abre Búsqueda Casos Epidemiología y pulsa Buscar.');
  const tablas = $.fn.dataTable.tables({api:true});
  const candidatas = [];
  tablas.iterator('table', settings => {
    const api = new $.fn.dataTable.Api(settings);
    if (settings.aoColumns.some(c => String(c.mData ?? '').includes('fecIniSintomas'))) candidatas.push(api);
  });
  if (!candidatas.length) throw Error('No se encontró la tabla de casos epidemiológicos.');
  const tabla = candidatas[0];
  // DataTables no siempre expone los filtros personalizados en ajax.params().
  // En esta aplicación se añaden al POST en una fase posterior; no inferimos que
  // un filtro ausente equivalga a Vitoria-Gasteiz.
  const parametros = tabla.ajax.params?.() ?? {};
  const filtro = parametros.filter ?? {};
  const municipio = filtro.localizacionesFiltro?.municipios ?? filtro.localizacionesFiltroRdo?.municipios;
  const municipioRdo = filtro.localizacionesFiltroRdo?.municipios;
  if (municipio && municipio !== '01|059') throw Error('El filtro obtenido no corresponde a Vitoria-Gasteiz. Extracción cancelada.');
  if (municipioRdo && municipioRdo !== '01|059') throw Error('El filtro territorial secundario no corresponde a Vitoria-Gasteiz.');
  if (!municipio && !municipioRdo) {
    console.warn('DataTables no expone el filtro territorial. Comprueba en Red > filter > Carga útil que localizacionesFiltro.municipios sea 01|059.');
    if (!confirm('CONFIRMACIÓN MANUAL: ¿Has seleccionado Vitoria-Gasteiz, pulsado Buscar y comprobado en Red > filter > Carga útil que municipios = 01|059?\n\nAceptar: continuar solo con los resultados de la tabla filtrada. Cancelar: detener.')) return;
  }
  const info = tabla.page.info();
  const paginas = info.pages;
  const paginaOriginal = tabla.page();
  if (!paginas || !Number.isFinite(paginas)) throw Error('No se puede determinar la paginación.');
  if (!confirm(`La tabla actual indica ${info.recordsDisplay} registros y ${paginas} páginas. ¿Continuar con la extracción de estas fichas?`)) return;
  const ids = new Set();
  const cambiarPagina = p => new Promise((resolve, reject) => {
    if (tabla.page() === p) return resolve();
    const nodo = $(tabla.table().node());
    const timeout = setTimeout(() => { nodo.off('draw.dt', onDraw); reject(Error('Tiempo agotado en página ' + (p+1))); }, 30000);
    function onDraw() { clearTimeout(timeout); nodo.off('draw.dt', onDraw); resolve(); }
    nodo.on('draw.dt', onDraw);
    tabla.page(p).draw('page');
  });
  try {
    for (let p = 0; p < paginas; p++) {
      await cambiarPagina(p);
      for (const fila of tabla.rows({page:'current'}).data().toArray()) {
        const id = fila?.idInstalacion ?? fila?.instalaciones?.idInstalacion;
        if (/^\d+$/.test(String(id ?? ''))) ids.add(String(id));
      }
      console.log(`Página ${p+1}/${paginas}: ${ids.size} casos únicos`);
      if (ids.size >= LIMITE) break;
    }
  } finally {
    await cambiarPagina(paginaOriginal).catch(e => console.warn('No se pudo restaurar la página original:', e.message));
  }
  if (!ids.size) throw Error('No se encontraron identificadores.');
  const campos = [
    ['idInstalacion','casosLegionella_detalle_idInstalacionHidden'],
    ['codigoInterno','casosLegionella_detalle_codigoInstalacionHidden'],
    ['caso','casosLegionella_detalle_nombreInstalacion'],
    ['agrupacion','casosLegionella_detalle_descAgrupacion'],
    ['edad','casosLegionella_detalle_edad'],
    ['fechaInicioSintomas','casosLegionella_detalle_fecIniSintomas'],
    ['fechaNotificacion','casosLegionella_detalle_fecNotifCaso'],
    ['testDiagnostico','casosLegionella_detalle_testDiagnostico'],
    ['observaciones','diagnostico_detail'],
    ['actuacionComarca','actuComarca_detail'],
    ['actuacionAyuntamiento','actuAyunta_detail'],
    ['domicilio','localizacionDomicilio'],
    ['trabajo','localizacionTra'],
    ['otraLocalizacion','localizacionOtro'],
    ['sexoCodigo','casosLegionella_detalle_sexoHidden'],
    ['tipoCasoCodigo','casosLegionella_detalle_tipoHidden'],
    ['fallecidoCodigo','casosLegionella_detalle_fallecidoHidden'],
    ['subdireccionCodigo','casosLegionella_detalle_subdireccionesValues'],
    ['comarcaCodigo','casosLegionella_detalle_comarcasValues'],
    ['inspectorCodigo','casosLegionella_detalle_idInspectorAsociadoValues'],
    ['responsableMuestrasCodigo','casosLegionella_detalle_idRespAnaliticaValues']
  ];
  // Las equivalencias conocidas proceden de las fichas verificadas. Las restantes se dejan sin inventar.
  const sexo = {'1':'Masculino','2':'Femenino'};
  const tipo = {'1':'Confirmado'};
  const fallecido = {'0':'No','1':'Sí'};
  const descripciones = ['sexo','tipoCaso','fallecido','subdireccion','comarca','inspector','responsableMuestras'];
  const equivalencias = {
    sexo:sexo, tipoCaso:tipo, fallecido:fallecido,
    subdireccion:{}, comarca:{}, inspector:{}, responsableMuestras:{}
  };
  // Aprovecha las opciones cargadas en la página, si existen.
  const selectores = {
    subdireccion:'#casosLegionella_detalle_subdirecciones',
    comarca:'#casosLegionella_detalle_comarcas',
    inspector:'#casosLegionella_detalle_idInspectorAsociado',
    responsableMuestras:'#casosLegionella_detalle_idRespAnalitica'
  };
  for (const [campo,selector] of Object.entries(selectores)) {
    for (const o of document.querySelectorAll(selector+' option')) {
      if (o.value && o.textContent.trim() && !/^[-\s]+$/.test(o.textContent.trim())) equivalencias[campo][o.value] = o.textContent.trim();
    }
  }
  const registros = [], errores = [];
  const seleccion = [...ids].slice(0, LIMITE);
  for (let i=0; i<seleccion.length; i++) {
    const id = seleccion[i];
    try {
      const respuesta = await fetch(BASE+encodeURIComponent(id), {credentials:'same-origin', redirect:'follow'});
      if (!respuesta.ok) throw Error('HTTP '+respuesta.status);
      const doc = new DOMParser().parseFromString(await respuesta.text(), 'text/html');
      if (!doc.querySelector('#casosLegionella_detalle_form')) throw Error('Formulario no encontrado (posible sesión caducada)');
      const r = {};
      for (const [nombre,elemento] of campos) {
        const nodo = doc.getElementById(elemento);
        r[nombre] = nodo ? (nodo.tagName === 'TEXTAREA' ? nodo.textContent.trim() : nodo.getAttribute('value') ?? '') : '';
      }
      if (String(r.idInstalacion) !== id) throw Error('Identificador de ficha inesperado');
      for (const nombre of descripciones) {
        const codigo = r[nombre+'Codigo'];
        r[nombre] = equivalencias[nombre][codigo] ?? '';
      }
      registros.push(r);
      console.log(`Ficha ${i+1}/${seleccion.length}: OK (ID ${id})`);
    } catch(e) {
      errores.push({id, error:e.message});
      console.error('Ficha '+id+': '+e.message);
      if (/sesión caducada/.test(e.message)) { console.error('Extracción detenida para evitar solicitudes con sesión caducada.'); break; }
    }
    await dormir(ESPERA_MS);
  }
  if (!registros.length) throw Error('No se obtuvo ninguna ficha válida.');
  const columnas = [...campos.map(([nombre])=>nombre), ...descripciones];
  const celda = valor => {
    let s = String(valor ?? '');
    if (/^[\s\r\n]*[=+@\-]/.test(s)) s = "'"+s;
    return '"'+s.replace(/"/g,'""')+'"';
  };
  const guardar = (nombre, contenido) => {
    const url = URL.createObjectURL(new Blob(['\uFEFF'+contenido],{type:'text/csv;charset=utf-8'}));
    const a = document.createElement('a'); a.href=url; a.download=nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),15000);
  };
  guardar(`legionella_vitoria_${registros.length}_casos.csv`, [columnas.join(';'),...registros.map(r=>columnas.map(c=>celda(r[c])).join(';'))].join('\r\n'));
  if (errores.length) guardar('legionella_vitoria_errores.csv', ['id;error',...errores.map(e=>celda(e.id)+';'+celda(e.error))].join('\r\n'));
  console.log(`FINALIZADO: ${registros.length} fichas, ${ids.size} identificadores únicos, ${errores.length} errores.`);
  console.log('Las descripciones de comarca/inspector/responsable solo se completan si están disponibles en los desplegables; se conservan siempre los códigos.');
})();
