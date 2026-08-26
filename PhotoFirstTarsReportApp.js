const { TarsReportApp } = require('./LegacyTarsReportApp');

function imageFiles(message) {
  const files = [];
  const add = (file) => {
    if (!file) return;
    const type = String(file.type || file.mimeType || '');
    const name = String(file.name || file.title || '').toLowerCase();
    if (/^image\//i.test(type) || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(name)) files.push(file);
  };
  add(message && message.file);
  for (const file of message && Array.isArray(message.files) ? message.files : []) add(file);
  return files;
}

function isDirectRoom(room) {
  const type = String(room && (room.type || room.t) || '').toLowerCase();
  return type === 'd' || type === 'direct' || type.includes('direct');
}

function bytesToBase64(content) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes = content instanceof Uint8Array ? content : new Uint8Array(content);
  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const value = (a << 16) | (b << 8) | c;
    output += alphabet[(value >>> 18) & 63];
    output += alphabet[(value >>> 12) & 63];
    output += i + 1 < bytes.length ? alphabet[(value >>> 6) & 63] : '=';
    output += i + 2 < bytes.length ? alphabet[value & 63] : '=';
  }
  return output;
}

function responseText(payload) {
  if (!payload) return '';
  if (typeof payload.output_text === 'string') return payload.output_text;
  if (typeof payload.text === 'string') return payload.text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  const parts = [];
  for (const item of output) {
    for (const content of Array.isArray(item && item.content) ? item.content : []) {
      if (typeof content.text === 'string') parts.push(content.text);
      else if (content.text && typeof content.text.value === 'string') parts.push(content.text.value);
    }
  }
  return parts.join(' ');
}

class PhotoFirstTarsReportApp extends TarsReportApp {
  async classifyIndependentImage(file, content, read, http) {
    try {
      const settings = read.getEnvironmentReader().getSettings();
      const key = String(await settings.getValueById('openai_receipt_api_key') || '').trim();
      if (!key || !content || !content.length) return 'unknown';
      const model = String(await settings.getValueById('openai_receipt_model') || 'gpt-4.1-mini').trim() || 'gpt-4.1-mini';
      const mime = String(file && (file.type || file.mimeType) || 'image/jpeg');
      const response = await http.post('https://api.openai.com/v1/responses', {
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        data: {
          model,
          input: [{ role: 'user', content: [
            { type: 'input_text', text: 'Классифицируй изображение строго как receipt, mailing или photo. receipt = банковский чек/квитанция/перевод/СБП/QR банка. mailing = скриншот рассылки, переписки или интерфейса сообщений. photo = обычное фото работы салона, стрижки, окрашивания, маникюра, бровей или другое обычное фото. Если не уверен, не выбирай photo. Верни только одно слово: receipt, mailing или photo.' },
            { type: 'input_image', image_url: `data:${mime};base64,${bytesToBase64(content)}` }
          ] }],
          max_output_tokens: 20
        },
        timeout: 20000
      });
      const payload = response && (response.data || response.content || response);
      const text = responseText(payload).trim().toLowerCase();
      if (/\breceipt\b/.test(text)) return 'receipt';
      if (/\bmailing\b/.test(text)) return 'mailing';
      if (/\bphoto\b/.test(text)) return 'photo';
    } catch (error) {
      this.getLogger().warn(`PHOTO_FIRST_CLASSIFY_FAILED: ${error && error.message || error}`);
    }
    return 'unknown';
  }

  async findReportsRoom(read) {
    const names = ['Otchet', 'otchet', 'Отчеты', 'отчеты', 'Отчёт', 'отчёт', 'Отчет', 'отчет'];
    for (const name of names) {
      try {
        const room = await read.getRoomReader().getByName(name);
        if (room) return room;
      } catch (_error) {}
    }
    return undefined;
  }

  async sendIndependentPhotoToReports(message, read, http, modify) {
    if (!message || !isDirectRoom(message.room)) return false;
    const files = imageFiles(message);
    if (!files.length) return false;
    const room = await this.findReportsRoom(read);
    const appUser = await read.getUserReader().getByUsername('tars') || await read.getUserReader().getAppUser();
    if (!room || !appUser) return false;
    if (message.sender && String(message.sender.id || '') === String(appUser.id || '')) return false;

    for (const file of files) {
      const uploadId = String(file && (file._id || file.id) || '');
      if (!uploadId) continue;
      try {
        const content = await read.getUploadReader().getBufferById(uploadId);
        const kind = await this.classifyIndependentImage(file, content, read, http);
        if (kind !== 'photo') {
          this.getLogger().info(`PHOTO_FIRST_SKIP upload=${uploadId} kind=${kind}`);
          continue;
        }
        const sourceUpload = await read.getUploadReader().getById(uploadId);
        const reportFile = {
          _id: uploadId,
          name: String(file.name || sourceUpload && sourceUpload.name || 'photo-report.jpg'),
          type: String(file.type || sourceUpload && sourceUpload.type || 'image/jpeg')
        };
        const master = message && message.sender ? `@${message.sender.username || message.sender.name || message.sender.id}` : 'мастер';
        const builder = modify.getCreator().startMessage({
          room,
          sender: appUser,
          text: `Мастер: ${master}`,
          file: reportFile,
          parseUrls: false
        });
        const messageId = await modify.getCreator().finish(builder);
        if (messageId) {
          this.getLogger().info(`PHOTO_FIRST_OK upload=${uploadId} message=${messageId}`);
          return true;
        }
      } catch (error) {
        this.getLogger().warn(`PHOTO_FIRST_FORWARD_FAILED: ${error && error.message || error}`);
      }
    }
    return false;
  }

  async executePostMessageSent(message, read, http, persistence, modify) {
    try {
      if (await this.sendIndependentPhotoToReports(message, read, http, modify)) return;
    } catch (error) {
      this.getLogger().warn(`PHOTO_FIRST_ROUTE_FAILED: ${error && error.message || error}`);
    }
    return super.executePostMessageSent(message, read, http, persistence, modify);
  }
}

exports.TarsReportApp = PhotoFirstTarsReportApp;
