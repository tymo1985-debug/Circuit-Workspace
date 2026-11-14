// zip.js — минимальный упаковщик ZIP без сжатия (Ф3 «Рассылка», 14.11.2026).
//
// Почему свой, а не библиотека: пакету собранию нужны только уже готовые PDF,
// они и так сжаты, и выигрыш от deflate — проценты. Своих 60 строк хватает,
// а новая библиотека в shared/vendor — это ещё один файл в прекэше каждого
// модуля, SRI-замок и ещё один тракт обновления.
//
// Имена файлов — UTF-8 с флагом 0x0800: кириллица в именах читается в
// проводнике Windows 10+, Finder и архиваторах Android без «кракозябр».
// Папки задаются прямо в имени: «Прага/invitation-....pdf».

const PSZip = {
  _crcTable: null,

  _crc32(bytes) {
    if (!this._crcTable) {
      this._crcTable = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        this._crcTable[n] = c >>> 0;
      }
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) crc = this._crcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  },

  _dos(date) {
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { time, day };
  },

  /**
   * @param {Array<{name:string, data:Uint8Array|ArrayBuffer}>} files
   * @returns {Blob} application/zip
   */
  build(files, date = new Date()) {
    const enc = new TextEncoder();
    const { time, day } = this._dos(date);
    const chunks = [];
    const central = [];
    let offset = 0;

    files.forEach((file) => {
      const name = enc.encode(file.name);
      const data = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
      const crc = this._crc32(data);

      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true);
      local.setUint16(8, 0, true);
      local.setUint16(10, time, true);
      local.setUint16(12, day, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, name.length, true);
      local.setUint16(28, 0, true);
      chunks.push(local.buffer, name, data);

      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);
      cd.setUint16(4, 20, true);
      cd.setUint16(6, 20, true);
      cd.setUint16(8, 0x0800, true);
      cd.setUint16(10, 0, true);
      cd.setUint16(12, time, true);
      cd.setUint16(14, day, true);
      cd.setUint32(16, crc, true);
      cd.setUint32(20, data.length, true);
      cd.setUint32(24, data.length, true);
      cd.setUint16(28, name.length, true);
      cd.setUint32(42, offset, true);
      central.push(cd.buffer, name);

      offset += 30 + name.length + data.length;
    });

    const cdSize = central.reduce((sum, part) => sum + (part.byteLength || part.length), 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);

    return new Blob([...chunks, ...central, end.buffer], { type: 'application/zip' });
  },

  /** Имя файла/папки: кириллица сохраняется, запрещённые символы ОС — нет. */
  safeName(value, fallback = 'file') {
    const name = String(value || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
    return name || fallback;
  },

  download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
};

window.PSZip = PSZip;
