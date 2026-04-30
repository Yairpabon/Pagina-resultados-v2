(function(global) {
  'use strict';

  var BRAND = '#00CFFF';
  var DARK = '#0E1525';
  var CARD = '#141E33';
  var MUTED = '#64748b';
  var LIGHT = '#f8fafc';
  var GREEN = '#22c55e';
  var YELLOW = '#facc15';

  function safeText(value) {
    return String(value == null ? '' : value);
  }

  function slugify(value) {
    return safeText(value)
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'reporte';
  }

  function ensureExtension(filename, extension) {
    var clean = safeText(filename || 'reporte').trim() || 'reporte';
    var suffix = '.' + extension.replace(/^\./, '');
    return clean.toLowerCase().endsWith(suffix.toLowerCase()) ? clean : clean + suffix;
  }

  function htmlEscape(value) {
    return safeText(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function downloadBlob(blob, filename) {
    var link = document.createElement('a');
    var url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function() {
      URL.revokeObjectURL(url);
    }, 30000);
  }

  function openBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var viewer = window.open(url, '_blank');
    if (!viewer) {
      downloadBlob(blob, filename);
      return;
    }
    setTimeout(function() {
      URL.revokeObjectURL(url);
    }, 60000);
  }

  function columnValue(row, column) {
    if (typeof column.value === 'function') return column.value(row);
    if (column.key) return row[column.key];
    return '';
  }

  function downloadExcelTable(options, filename) {
    var columns = options.columns || [];
    var rows = options.rows || [];
    var title = options.title || 'Resultados';
    var subtitle = options.subtitle || '';
    var meta = options.meta || [];

    var head = columns.map(function(column) {
      return '<th>' + htmlEscape(column.label) + '</th>';
    }).join('');

    var body = rows.map(function(row) {
      return '<tr>' + columns.map(function(column) {
        return '<td style="mso-number-format:\'\\@\';">' + htmlEscape(columnValue(row, column)) + '</td>';
      }).join('') + '</tr>';
    }).join('');

    var html = [
      '<!doctype html>',
      '<html><head><meta charset="UTF-8">',
      '<style>',
      'body{font-family:Arial,sans-serif;color:#0E1525;}',
      'h1{font-size:22px;margin:0 0 6px;}',
      'p{margin:0 0 12px;color:#64748b;}',
      '.meta{margin:10px 0 16px;font-size:12px;color:#475569;}',
      '.meta span{display:inline-block;margin-right:14px;}',
      'table{border-collapse:collapse;width:100%;font-size:12px;}',
      'th{background:#0E1525;color:#fff;text-align:left;padding:8px;border:1px solid #0E1525;}',
      'td{padding:7px;border:1px solid #dbe4ef;}',
      'tr:nth-child(even) td{background:#f8fafc;}',
      '</style></head><body>',
      '<h1>' + htmlEscape(title) + '</h1>',
      subtitle ? '<p>' + htmlEscape(subtitle) + '</p>' : '',
      meta.length ? '<div class="meta">' + meta.map(function(item) {
        return '<span><strong>' + htmlEscape(item.label) + ':</strong> ' + htmlEscape(item.value) + '</span>';
      }).join('') + '</div>' : '',
      '<table><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table>',
      '</body></html>'
    ].join('');

    var blob = new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    downloadBlob(blob, ensureExtension(filename || slugify(title), 'xls'));
  }

  function hexToRgb(hex) {
    var clean = safeText(hex || '#000000').replace('#', '');
    if (clean.length === 3) {
      clean = clean.split('').map(function(item) { return item + item; }).join('');
    }
    var intValue = parseInt(clean, 16);
    if (!Number.isFinite(intValue)) intValue = 0;
    return [
      ((intValue >> 16) & 255) / 255,
      ((intValue >> 8) & 255) / 255,
      (intValue & 255) / 255
    ];
  }

  function fmt(number) {
    var value = Math.round(Number(number || 0) * 100) / 100;
    return String(value).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  }

  function toWinAnsi(value) {
    var replacements = {
      '\u2018': "'",
      '\u2019': "'",
      '\u201C': '"',
      '\u201D': '"',
      '\u2013': '-',
      '\u2014': '-',
      '\u2022': '*',
      '\u2026': '...',
      '\u00A0': ' '
    };
    return safeText(value).split('').map(function(char) {
      if (replacements[char]) return replacements[char];
      var code = char.charCodeAt(0);
      if (code <= 255) return char;
      var normalized = char.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (normalized && normalized.charCodeAt(0) <= 255) return normalized[0];
      return '?';
    }).join('');
  }

  function pdfLiteral(value) {
    return '(' + toWinAnsi(value)
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/\r/g, '')
      .replace(/\n/g, '\\n') + ')';
  }

  function estimateTextWidth(text, size) {
    return toWinAnsi(text).split('').reduce(function(total, char) {
      if (char === ' ') return total + (size * 0.28);
      if (/[,.:;|!'#]/.test(char)) return total + (size * 0.25);
      if (/[0-9]/.test(char)) return total + (size * 0.52);
      if (/[A-Z]/.test(char)) return total + (size * 0.62);
      return total + (size * 0.5);
    }, 0);
  }

  function truncateText(text, maxWidth, size) {
    var value = toWinAnsi(text);
    if (estimateTextWidth(value, size) <= maxWidth) return value;
    var suffix = '...';
    while (value.length && estimateTextWidth(value + suffix, size) > maxWidth) {
      value = value.slice(0, -1);
    }
    return value + suffix;
  }

  function wrapText(text, maxWidth, size, maxLines) {
    var words = toWinAnsi(text).split(/\s+/).filter(Boolean);
    var lines = [];
    var line = '';
    words.forEach(function(word) {
      var testLine = line ? line + ' ' + word : word;
      if (line && estimateTextWidth(testLine, size) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = testLine;
      }
    });
    if (line) lines.push(line);
    if (!lines.length) lines.push('');
    if (maxLines && lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[lines.length - 1] = truncateText(lines[lines.length - 1], maxWidth, size);
    }
    return lines;
  }

  function PdfDoc(layout) {
    this.width = layout === 'landscape' ? 842 : 595;
    this.height = layout === 'landscape' ? 595 : 842;
    this.pages = [];
    this.current = null;
  }

  PdfDoc.prototype.addPage = function() {
    this.current = { commands: [] };
    this.pages.push(this.current);
    return this.current;
  };

  PdfDoc.prototype.raw = function(command) {
    if (!this.current) this.addPage();
    this.current.commands.push(command);
  };

  PdfDoc.prototype.fill = function(color) {
    var rgb = hexToRgb(color);
    this.raw(fmt(rgb[0]) + ' ' + fmt(rgb[1]) + ' ' + fmt(rgb[2]) + ' rg');
  };

  PdfDoc.prototype.stroke = function(color) {
    var rgb = hexToRgb(color);
    this.raw(fmt(rgb[0]) + ' ' + fmt(rgb[1]) + ' ' + fmt(rgb[2]) + ' RG');
  };

  PdfDoc.prototype.rect = function(x, y, width, height, fillColor, strokeColor, lineWidth) {
    var pdfY = this.height - y - height;
    this.raw('q');
    if (fillColor) this.fill(fillColor);
    if (strokeColor) {
      this.stroke(strokeColor);
      this.raw(fmt(lineWidth || 1) + ' w');
    }
    this.raw(fmt(x) + ' ' + fmt(pdfY) + ' ' + fmt(width) + ' ' + fmt(height) + ' re');
    this.raw(fillColor && strokeColor ? 'B' : fillColor ? 'f' : 'S');
    this.raw('Q');
  };

  PdfDoc.prototype.line = function(x1, y1, x2, y2, color, lineWidth) {
    this.raw('q');
    this.stroke(color || '#000000');
    this.raw(fmt(lineWidth || 1) + ' w');
    this.raw(fmt(x1) + ' ' + fmt(this.height - y1) + ' m ' + fmt(x2) + ' ' + fmt(this.height - y2) + ' l S');
    this.raw('Q');
  };

  PdfDoc.prototype.text = function(text, x, y, options) {
    var opts = options || {};
    var size = opts.size || 10;
    var font = opts.font || 'F1';
    var color = opts.color || '#000000';
    var maxWidth = opts.maxWidth || 0;
    var align = opts.align || 'left';
    var value = maxWidth ? truncateText(text, maxWidth, size) : toWinAnsi(text);
    var drawX = x;
    var textWidth = estimateTextWidth(value, size);
    if (align === 'center') drawX = x - (textWidth / 2);
    if (align === 'right') drawX = x - textWidth;

    this.raw('BT');
    this.fill(color);
    this.raw('/' + font + ' ' + fmt(size) + ' Tf');
    this.raw('1 0 0 1 ' + fmt(drawX) + ' ' + fmt(this.height - y) + ' Tm');
    this.raw(pdfLiteral(value) + ' Tj');
    this.raw('ET');
  };

  PdfDoc.prototype.textBlock = function(text, x, y, width, options) {
    var opts = options || {};
    var size = opts.size || 10;
    var lineHeight = opts.lineHeight || size * 1.28;
    var lines = wrapText(text, width, size, opts.maxLines || 0);
    lines.forEach(function(line, index) {
      this.text(line, x, y + (index * lineHeight), opts);
    }, this);
    return y + (lines.length * lineHeight);
  };

  function binaryStringToBlob(binary, type) {
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i) & 255;
    }
    return new Blob([bytes], { type: type || 'application/pdf' });
  }

  PdfDoc.prototype.toBlob = function() {
    var objects = [];
    function addObject(body) {
      objects.push(body);
      return objects.length;
    }

    addObject('<< /Type /Catalog /Pages 2 0 R >>');
    addObject('');
    var fontRegular = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    var fontBold = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    var fontMono = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');
    var fontMonoBold = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>');
    var pageRefs = [];

    this.pages.forEach(function(page) {
      var stream = page.commands.join('\n') + '\n';
      var contentRef = addObject('<< /Length ' + stream.length + ' >>\nstream\n' + stream + 'endstream');
      var pageRef = addObject([
        '<< /Type /Page',
        '/Parent 2 0 R',
        '/MediaBox [0 0 ' + fmt(this.width) + ' ' + fmt(this.height) + ']',
        '/Resources << /Font << /F1 ' + fontRegular + ' 0 R /F2 ' + fontBold + ' 0 R /F3 ' + fontMono + ' 0 R /F4 ' + fontMonoBold + ' 0 R >> >>',
        '/Contents ' + contentRef + ' 0 R',
        '>>'
      ].join(' '));
      pageRefs.push(pageRef + ' 0 R');
    }, this);

    objects[1] = '<< /Type /Pages /Kids [' + pageRefs.join(' ') + '] /Count ' + pageRefs.length + ' >>';

    var output = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    var offsets = [0];
    objects.forEach(function(body, index) {
      offsets.push(output.length);
      output += (index + 1) + ' 0 obj\n' + body + '\nendobj\n';
    });
    var xref = output.length;
    output += 'xref\n0 ' + (objects.length + 1) + '\n';
    output += '0000000000 65535 f \n';
    for (var i = 1; i <= objects.length; i += 1) {
      output += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    }
    output += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\n';
    output += 'startxref\n' + xref + '\n%%EOF';
    return binaryStringToBlob(output, 'application/pdf');
  };

  function drawFooter(doc, label) {
    var y = doc.height - 24;
    doc.line(36, y - 12, doc.width - 36, y - 12, '#e2e8f0', 0.6);
    doc.text(label || 'Generado por Yair Timings', 36, y, { size: 8, color: MUTED });
    doc.text('Pagina ' + doc.pages.length, doc.width - 36, y, { size: 8, color: MUTED, align: 'right' });
  }

  function drawSummaryCard(doc, x, y, width, height, item) {
    doc.rect(x, y, width, height, '#ffffff', '#dbe4ef', 0.7);
    doc.text(item.label || '', x + 10, y + 15, { size: 7, font: 'F2', color: MUTED, maxWidth: width - 20 });
    doc.text(item.value == null ? '-' : item.value, x + 10, y + 33, { size: 15, font: 'F2', color: item.color || DARK, maxWidth: width - 20 });
    if (item.help) {
      doc.text(item.help, x + 10, y + 46, { size: 7, color: MUTED, maxWidth: width - 20 });
    }
  }

  function drawResultsHeader(doc, options, firstPage) {
    doc.rect(0, 0, doc.width, firstPage ? 88 : 58, DARK);
    doc.rect(0, firstPage ? 84 : 54, doc.width, 4, BRAND);
    doc.text('YAIR TIMINGS', 36, 30, { size: 8, font: 'F2', color: BRAND });
    doc.text(options.title || 'Clasificacion', 36, firstPage ? 53 : 39, { size: firstPage ? 22 : 15, font: 'F2', color: '#ffffff', maxWidth: 520 });
    if (firstPage && options.subtitle) {
      doc.text(options.subtitle, 36, 74, { size: 9, color: '#cbd5e1', maxWidth: 560 });
    }
    if (options.meta && options.meta.length) {
      var metaText = options.meta.map(function(item) {
        return item.label + ': ' + item.value;
      }).join('  |  ');
      doc.text(metaText, doc.width - 36, firstPage ? 38 : 39, { size: 8, color: '#cbd5e1', align: 'right', maxWidth: 260 });
    }
  }

  function drawTableHeader(doc, columns, x, y) {
    var cursor = x;
    doc.rect(x, y, columns.reduce(function(sum, col) { return sum + col.width; }, 0), 20, CARD);
    columns.forEach(function(column) {
      doc.text(column.label, cursor + 5, y + 13, { size: 7.2, font: 'F2', color: '#ffffff', maxWidth: column.width - 10 });
      cursor += column.width;
    });
  }

  function drawTableRow(doc, columns, row, x, y, index) {
    var rowHeight = 20;
    var cursor = x;
    if (index % 2 === 0) {
      doc.rect(x, y, columns.reduce(function(sum, col) { return sum + col.width; }, 0), rowHeight, LIGHT);
    }
    columns.forEach(function(column) {
      var raw = columnValue(row, column);
      var value = raw == null || raw === '' ? '-' : raw;
      var align = column.align || 'left';
      var textX = cursor + 5;
      if (align === 'right') textX = cursor + column.width - 5;
      if (align === 'center') textX = cursor + (column.width / 2);
      doc.text(value, textX, y + 13, {
        size: column.size || 8,
        font: column.mono ? 'F3' : column.bold ? 'F2' : 'F1',
        color: column.color || DARK,
        align: align,
        maxWidth: column.width - 10
      });
      cursor += column.width;
    });
    doc.line(x, y + rowHeight, x + columns.reduce(function(sum, col) { return sum + col.width; }, 0), y + rowHeight, '#e2e8f0', 0.4);
  }

  function buildResultsPdfBlob(options) {
    var doc = new PdfDoc('landscape');
    var rows = options.rows || [];
    var columns = options.columns || [];
    var margin = 36;
    var tableX = margin;
    var rowHeight = 20;
    var bottom = doc.height - 46;
    var y = 0;

    function startPage(firstPage) {
      doc.addPage();
      drawResultsHeader(doc, options, firstPage);
      if (firstPage && options.summaryCards && options.summaryCards.length) {
        var gap = 10;
        var cardWidth = (doc.width - (margin * 2) - (gap * 3)) / 4;
        options.summaryCards.slice(0, 4).forEach(function(item, index) {
          drawSummaryCard(doc, margin + (index * (cardWidth + gap)), 104, cardWidth, 48, item);
        });
        y = 172;
      } else {
        y = 78;
      }
      drawTableHeader(doc, columns, tableX, y);
      y += 20;
    }

    startPage(true);
    if (!rows.length) {
      doc.text('No hay atletas para exportar con los filtros actuales.', margin, y + 24, { size: 10, color: MUTED });
    }

    rows.forEach(function(row, index) {
      if (y + rowHeight > bottom) {
        drawFooter(doc, options.footer);
        startPage(false);
      }
      drawTableRow(doc, columns, row, tableX, y, index);
      y += rowHeight;
    });

    drawFooter(doc, options.footer);
    return doc.toBlob();
  }

  function downloadResultsPdf(options, filename) {
    var blob = buildResultsPdfBlob(options);
    downloadBlob(blob, ensureExtension(filename || slugify(options.title), 'pdf'));
  }

  function drawAthleteHeader(doc, report, compact) {
    var headerHeight = compact ? 74 : 160;
    doc.rect(0, 0, doc.width, headerHeight, DARK);
    doc.rect(0, headerHeight - 5, doc.width, 5, BRAND);
    doc.text('YAIR TIMINGS', 38, 32, { size: 8, font: 'F2', color: BRAND });
    doc.text(compact ? 'Resultado individual' : 'Resultado individual del atleta', 38, compact ? 53 : 58, {
      size: compact ? 16 : 21,
      font: 'F2',
      color: '#ffffff',
      maxWidth: 320
    });
    if (!compact) {
      doc.text(report.eventName || 'Evento', 38, 82, { size: 10, color: '#cbd5e1', maxWidth: 310 });
      doc.text(report.athleteName || 'Atleta', 38, 112, { size: 25, font: 'F2', color: '#ffffff', maxWidth: 340 });
      doc.text((report.distance || 'General') + ' | ' + (report.category || 'General') + ' | Dorsal #' + (report.bib || '-'), 38, 136, {
        size: 10,
        color: '#dbeafe',
        maxWidth: 360
      });
      doc.rect(385, 48, 172, 78, '#ffffff', '#ffffff', 0.7);
      doc.text('Tiempo oficial', 402, 70, { size: 8, font: 'F2', color: MUTED });
      doc.text(report.officialTime || '--:--:--', 402, 99, { size: 24, font: 'F4', color: DARK, maxWidth: 140 });
      doc.text(report.status || 'Resultado', 402, 116, { size: 8, font: 'F2', color: GREEN, maxWidth: 140 });
    }
  }

  function drawProgressBar(doc, x, y, width, label, value, color) {
    var percent = Math.max(0, Math.min(100, Number(value) || 0));
    doc.text(label, x, y, { size: 9, font: 'F2', color: DARK, maxWidth: width - 60 });
    doc.text(percent + '%', x + width, y, { size: 9, font: 'F2', color: color || BRAND, align: 'right' });
    doc.rect(x, y + 10, width, 9, '#e2e8f0');
    doc.rect(x, y + 10, (width * percent) / 100, 9, color || BRAND);
  }

  function buildAthletePdfBlob(report) {
    var doc = new PdfDoc('portrait');
    var margin = 38;
    var bottom = doc.height - 54;
    var y = 0;

    function startPage(compact) {
      doc.addPage();
      drawAthleteHeader(doc, report, compact);
      y = compact ? 98 : 184;
    }

    function ensureSpace(height) {
      if (y + height <= bottom) return;
      drawFooter(doc, 'Resultado individual | Yair Timings');
      startPage(true);
    }

    startPage(false);

    var cards = report.cards || [];
    var cardGap = 10;
    var cardWidth = (doc.width - (margin * 2) - cardGap) / 2;
    cards.forEach(function(card, index) {
      ensureSpace(62);
      var x = margin + ((index % 2) * (cardWidth + cardGap));
      var rowY = y + (index % 2 === 0 ? 0 : 0);
      drawSummaryCard(doc, x, rowY, cardWidth, 56, card);
      if (index % 2 === 1) y += 66;
    });
    if (cards.length % 2 === 1) y += 66;

    ensureSpace(76);
    doc.text('Lectura rapida', margin, y + 4, { size: 13, font: 'F2', color: DARK });
    doc.textBlock(report.narrative || 'Reporte generado con la clasificacion local del evento.', margin, y + 24, doc.width - (margin * 2), {
      size: 9,
      color: MUTED,
      lineHeight: 12,
      maxLines: 3
    });
    y += 64;

    ensureSpace(70);
    drawProgressBar(doc, margin, y, doc.width - (margin * 2), 'Percentil en la distancia', report.percentile || 0, BRAND);
    drawProgressBar(doc, margin, y + 34, doc.width - (margin * 2), 'Avance de categoria', report.categoryPercent || 0, YELLOW);
    y += 72;

    if (report.ranking && report.ranking.length) {
      ensureSpace(42 + (report.ranking.length * 20));
      doc.text('Referencia competitiva', margin, y, { size: 13, font: 'F2', color: DARK });
      y += 16;
      var rankingColumns = [
        { label: 'Pos', value: function(row) { return row.pos; }, width: 42, bold: true, color: BRAND },
        { label: 'Dorsal', value: function(row) { return '#' + row.bib; }, width: 58, mono: true },
        { label: 'Atleta', value: function(row) { return row.name; }, width: 222, bold: true },
        { label: 'Cat', value: function(row) { return row.category; }, width: 86 },
        { label: 'Tiempo', value: function(row) { return row.time; }, width: 92, mono: true, bold: true }
      ];
      drawTableHeader(doc, rankingColumns, margin, y);
      y += 20;
      report.ranking.forEach(function(row, index) {
        if (row.current) doc.rect(margin, y, doc.width - (margin * 2), 20, '#e0f7ff');
        drawTableRow(doc, rankingColumns, row, margin, y, index);
        y += 20;
      });
      y += 20;
    }

    if (report.timeline && report.timeline.length) {
      ensureSpace(40 + (Math.min(report.timeline.length, 8) * 32));
      doc.text('Puntos de control', margin, y, { size: 13, font: 'F2', color: DARK });
      y += 20;
      report.timeline.slice(0, 8).forEach(function(point) {
        ensureSpace(32);
        doc.rect(margin, y, 16, 16, point.finished ? BRAND : '#e2e8f0');
        doc.text(point.name || 'Punto', margin + 26, y + 12, { size: 9, font: 'F2', color: DARK, maxWidth: 250 });
        doc.text('Km ' + (point.km || '-') + ' | ' + (point.time || '--:--:--') + ' | Split ' + (point.split || '--:--'), doc.width - margin, y + 12, {
          size: 8,
          font: 'F3',
          color: point.finished ? DARK : MUTED,
          align: 'right',
          maxWidth: 210
        });
        y += 30;
      });
      if (report.timeline.length > 8) {
        doc.text('+' + (report.timeline.length - 8) + ' puntos adicionales en la ficha del atleta.', margin, y + 8, { size: 8, color: MUTED });
        y += 20;
      }
    }

    drawFooter(doc, 'Resultado individual | Yair Timings');
    return doc.toBlob();
  }

  function openAthletePdf(report, filename) {
    var blob = buildAthletePdfBlob(report);
    openBlob(blob, ensureExtension(filename || slugify(report.athleteName || 'atleta'), 'pdf'));
  }

  function downloadAthletePdf(report, filename) {
    var blob = buildAthletePdfBlob(report);
    downloadBlob(blob, ensureExtension(filename || slugify(report.athleteName || 'atleta'), 'pdf'));
  }

  global.YairExport = {
    downloadBlob: downloadBlob,
    openBlob: openBlob,
    downloadExcelTable: downloadExcelTable,
    downloadResultsPdf: downloadResultsPdf,
    openAthletePdf: openAthletePdf,
    downloadAthletePdf: downloadAthletePdf,
    slugify: slugify
  };
})(window);
