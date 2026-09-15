// 載入 jsQR（用 CDN，Chrome extension 允許）
const script = document.createElement('script');
script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
document.head.appendChild(script);

script.onload = () => {
  init();
};

function init() {
  const resultEl = document.getElementById('result');
  const uploadArea = document.getElementById('uploadArea');
  const fileInput = document.getElementById('fileInput');
  const uploadBtn = document.getElementById('uploadBtn');
  const camBtn = document.getElementById('camBtn');
  const cameraBox = document.getElementById('cameraBox');
  const video = document.getElementById('video');
  const closeCam = document.getElementById('closeCam');
  const toastEl = document.getElementById('toast');

  let stream = null;
  let scanning = false;

  function showToast(msg, isError = false) {
    toastEl.textContent = msg;
    toastEl.className = 'toast show' + (isError ? ' error' : '');
    setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function copyText(text) {
    navigator.clipboard.writeText(text).then(() => showToast('已複製！'));
  }

  // 解析 6 種內容
  function parseQR(text) {
    text = text.trim();

    if (text.toUpperCase().startsWith('WIFI:')) {
      const parts = {};
      text.slice(5).split(';').forEach(p => {
        const [k, ...v] = p.split(':');
        if (k) parts[k.toUpperCase()] = v.join(':');
      });
      return {
        type: 'WiFi',
        data: {
          ssid: parts.S || '',
          password: parts.P || '',
          encryption: parts.T || '無'
        }
      };
    }

    if (text.toLowerCase().startsWith('tel:')) {
      return { type: '電話', data: { number: text.slice(4) } };
    }

    if (text.toLowerCase().startsWith('sms:') || text.toUpperCase().startsWith('SMSTO:')) {
      let number = '', body = '';
      if (text.toUpperCase().startsWith('SMSTO:')) {
        const parts = text.slice(6).split(':');
        number = parts[0] || '';
        body = parts.slice(1).join(':') || '';
      } else {
        try {
          const url = new URL(text);
          number = url.pathname;
          body = url.searchParams.get('body') || '';
        } catch {}
      }
      return { type: '簡訊', data: { number, body } };
    }

    if (text.toLowerCase().startsWith('mailto:')) {
      try {
        const url = new URL(text);
        return {
          type: 'Email',
          data: {
            to: url.pathname,
            subject: url.searchParams.get('subject') || '',
            body: url.searchParams.get('body') || ''
          }
        };
      } catch {}
    }
    if (text.toUpperCase().startsWith('MATMSG:')) {
      const parts = {};
      text.slice(7).split(';').forEach(p => {
        const [k, ...v] = p.split(':');
        if (k) parts[k.toUpperCase()] = v.join(':');
      });
      return {
        type: 'Email',
        data: { to: parts.TO || '', subject: parts.SUB || '', body: parts.BODY || '' }
      };
    }

    try {
      const u = new URL(text);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        return { type: '網址', data: { url: text } };
      }
    } catch {}

    return { type: '文字', data: { text } };
  }

  function renderResult(parsed) {
    const d = parsed.data;
    let body = '';

    if (parsed.type === 'WiFi') {
      body = `
        <div class="structured">
          <div class="row"><span class="label">名稱</span><span class="value">${escapeHtml(d.ssid)} <button class="copy-btn" data-copy="${escapeHtml(d.ssid)}">複製</button></span></div>
          <div class="row"><span class="label">密碼</span><span class="value">${escapeHtml(d.password || '（無）')} <button class="copy-btn" data-copy="${escapeHtml(d.password)}">複製</button></span></div>
          <div class="row"><span class="label">加密</span><span class="value">${escapeHtml(d.encryption)}</span></div>
        </div>`;
    } else if (parsed.type === '電話') {
      body = `<div class="structured"><div class="row"><span class="label">電話</span><span class="value"><a href="tel:${escapeHtml(d.number)}">${escapeHtml(d.number)}</a></span></div></div>`;
    } else if (parsed.type === '簡訊') {
      body = `
        <div class="structured">
          <div class="row"><span class="label">電話</span><span class="value"><a href="sms:${escapeHtml(d.number)}">${escapeHtml(d.number)}</a></span></div>
          <div class="row"><span class="label">內容</span><span class="value">${escapeHtml(d.body || '（無）')}</span></div>
        </div>`;
    } else if (parsed.type === 'Email') {
      body = `
        <div class="structured">
          <div class="row"><span class="label">收件人</span><span class="value"><a href="mailto:${escapeHtml(d.to)}">${escapeHtml(d.to)}</a></span></div>
          ${d.subject ? `<div class="row"><span class="label">主旨</span><span class="value">${escapeHtml(d.subject)}</span></div>` : ''}
          ${d.body ? `<div class="row"><span class="label">內容</span><span class="value">${escapeHtml(d.body)}</span></div>` : ''}
        </div>`;
    } else if (parsed.type === '網址') {
      body = `<div class="structured"><div class="row"><span class="label">網址</span><span class="value"><a href="${escapeHtml(d.url)}" target="_blank">${escapeHtml(d.url)}</a></span></div></div>`;
    } else {
      body = `<div class="text-content">${escapeHtml(d.text)}</div>`;
    }

    resultEl.className = 'result';
    resultEl.innerHTML = `
      <div class="result-header">
        <span class="type-badge">${parsed.type}</span>
        <span>${new Date().toLocaleTimeString('zh-HK')}</span>
      </div>
      ${body}
    `;

    // 綁定複製按鈕
    resultEl.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', () => copyText(btn.dataset.copy));
    });
  }

  function decodeImage(img) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = img.width || img.videoWidth;
    canvas.height = img.height || img.videoHeight;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert'
    });
    return code ? code.data : null;
  }

  function process(text) {
    if (!text) {
      showToast('未能識別 QR Code', true);
      return;
    }
    const parsed = parseQR(text);
    renderResult(parsed);
    showToast('解讀成功！');
  }

  // 貼上
  document.addEventListener('paste', e => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        const img = new Image();
        img.onload = () => process(decodeImage(img));
        img.src = URL.createObjectURL(blob);
        break;
      }
    }
  });

  // 上傳
  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      process(decodeImage(img));
      fileInput.value = '';
    };
    img.src = URL.createObjectURL(file);
  });

  // 拖曳
  uploadArea.addEventListener('dragover', e => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });
  uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
  uploadArea.addEventListener('drop', e => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      const img = new Image();
      img.onload = () => process(decodeImage(img));
      img.src = URL.createObjectURL(file);
    }
  });

  // 相機
  camBtn.addEventListener('click', async () => {
    if (scanning) return;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      video.srcObject = stream;
      await video.play();
      cameraBox.style.display = 'block';
      scanning = true;
      requestAnimationFrame(scanLoop);
    } catch (err) {
      showToast('無法開啟相機', true);
    }
  });

  closeCam.addEventListener('click', stopCamera);

  function stopCamera() {
    scanning = false;
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    cameraBox.style.display = 'none';
  }

  function scanLoop() {
    if (!scanning) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const result = decodeImage(video);
      if (result) {
        process(result);
        stopCamera();
        return;
      }
    }
    requestAnimationFrame(scanLoop);
  }
}