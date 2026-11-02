import { showToast } from '../components/toast';

interface VersionInfo {
  major: number;
  minor: number;
  label: string;
}

const AE_VERSIONS: Record<string, VersionInfo> = {
  '25.0': { major: 25, minor: 0, label: 'After Effects 2025 (v25.0)' },
  '24.0': { major: 24, minor: 0, label: 'After Effects 2024 (v24.0)' },
  '23.0': { major: 23, minor: 0, label: 'After Effects 2023 (v23.0)' },
  '22.0': { major: 22, minor: 0, label: 'After Effects 2022 (v22.0)' },
  '18.0': { major: 18, minor: 0, label: 'After Effects 2021 (v18.0)' },
  '17.0': { major: 17, minor: 0, label: 'After Effects 2020 (v17.0)' },
  '16.0': { major: 16, minor: 0, label: 'After Effects CC 2019 (v16.0)' },
  '15.0': { major: 15, minor: 0, label: 'After Effects CC 2018 (v15.0)' },
};

export class AeConverterTool {
  private fileBuffer: ArrayBuffer | null = null;
  private currentFileName = '';
  private currentFileSize = 0;
  private isAepx = false;
  private detectedVersion = '24.0';
  private headChunkOffset = -1;
  private isBigEndian = true;

  // DOM
  private dropZone: HTMLElement | null = null;
  private fileInput: HTMLInputElement | null = null;
  private pickBtn: HTMLElement | null = null;
  private resultPanel: HTMLElement | null = null;
  private errorBox: HTMLElement | null = null;
  private fileNameEl: HTMLElement | null = null;
  private fileSizeEl: HTMLElement | null = null;
  private detectedEl: HTMLElement | null = null;
  private targetSelect: HTMLSelectElement | null = null;
  private convertBtn: HTMLElement | null = null;
  private noteEl: HTMLElement | null = null;

  public init() {
    this.bindElements();
    this.setupEvents();
  }

  private bindElements() {
    this.dropZone = document.getElementById('aepDrop');
    this.fileInput = document.getElementById('aepInput') as HTMLInputElement;
    this.pickBtn = document.getElementById('aepPickBtn');
    this.resultPanel = document.getElementById('aepResult');
    this.errorBox = document.getElementById('aepError');
    this.fileNameEl = document.getElementById('aepFileName');
    this.fileSizeEl = document.getElementById('aepFileSize');
    this.detectedEl = document.getElementById('aepDetected');
    this.targetSelect = document.getElementById('aepTarget') as HTMLSelectElement;
    this.convertBtn = document.getElementById('aepConvertBtn');
    this.noteEl = document.getElementById('aepNote');
  }

  private setupEvents() {
    this.pickBtn?.addEventListener('click', () => this.fileInput?.click());
    this.fileInput?.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) this.processFile(file);
    });

    this.dropZone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropZone?.classList.add('is-dragover');
    });
    this.dropZone?.addEventListener('dragleave', () => this.dropZone?.classList.remove('is-dragover'));
    this.dropZone?.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropZone?.classList.remove('is-dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file) this.processFile(file);
    });

    this.convertBtn?.addEventListener('click', () => this.convertAndDownload());
  }

  public async processFile(file: File) {
    this.errorBox?.classList.add('hidden');
    this.currentFileName = file.name;
    this.currentFileSize = file.size;

    try {
      const arrayBuffer = await file.arrayBuffer();
      this.fileBuffer = arrayBuffer;
      this.isAepx = file.name.toLowerCase().endsWith('.aepx');

      if (this.isAepx) {
        this.parseAepx(arrayBuffer);
      } else {
        this.parseBinaryAep(arrayBuffer);
      }

      // Display info
      if (this.fileNameEl) this.fileNameEl.textContent = file.name;
      if (this.fileSizeEl) {
        this.fileSizeEl.textContent = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
      }
      if (this.detectedEl) {
        const verObj = AE_VERSIONS[this.detectedVersion];
        this.detectedEl.textContent = verObj ? verObj.label : `After Effects v${this.detectedVersion}`;
      }

      this.resultPanel?.classList.remove('hidden');
      showToast(`Detected After Effects project: ${file.name}`);
    } catch (err: any) {
      this.showError(err.message || 'Invalid After Effects project file.');
    }
  }

  private parseBinaryAep(buffer: ArrayBuffer) {
    if (buffer.byteLength < 32) {
      throw new Error('File is too small to be a valid After Effects project.');
    }

    const view = new DataView(buffer);
    const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));

    if (magic === 'RIFX') {
      this.isBigEndian = true;
    } else if (magic === 'RIFF') {
      this.isBigEndian = false;
    } else {
      throw new Error('Invalid file format. Expected RIFX or RIFF container header.');
    }

    const formType = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
    if (formType !== 'Egg!' && formType !== 'FXFX') {
      throw new Error(`Unrecognized project signature "${formType}". Expected Adobe After Effects "Egg!" chunk.`);
    }

    // Search for "head" chunk in the first 8192 bytes
    const searchLimit = Math.min(buffer.byteLength - 8, 8192);
    let headOffset = -1;

    for (let i = 12; i < searchLimit; i++) {
      if (
        view.getUint8(i) === 0x68 && // 'h'
        view.getUint8(i + 1) === 0x65 && // 'e'
        view.getUint8(i + 2) === 0x61 && // 'a'
        view.getUint8(i + 3) === 0x64    // 'd'
      ) {
        headOffset = i;
        break;
      }
    }

    if (headOffset === -1) {
      // Chunk not found, use default offset near header
      headOffset = 16;
    }

    this.headChunkOffset = headOffset;

    // Read version byte in head chunk
    // In AE RIFX: 'head' [4 bytes ID] [4 bytes length] [major version int16/int32]
    const versionByteOffset = headOffset + 8;
    let major = 24;
    try {
      const val = this.isBigEndian ? view.getUint16(versionByteOffset, false) : view.getUint16(versionByteOffset, true);
      if (val >= 14 && val <= 30) {
        major = val;
      }
    } catch (e) {}

    this.detectedVersion = `${major}.0`;
  }

  private parseAepx(buffer: ArrayBuffer) {
    const text = new TextDecoder('utf-8').decode(buffer);
    const match = text.match(/version="(\d+(\.\d+)?)"/);
    if (match) {
      const v = parseFloat(match[1]);
      this.detectedVersion = `${Math.floor(v)}.0`;
    } else {
      this.detectedVersion = '24.0';
    }
  }

  public convertAndDownload() {
    if (!this.fileBuffer) return;
    const targetVer = this.targetSelect?.value || '17.0';
    const targetObj = AE_VERSIONS[targetVer] || { major: 17, minor: 0, label: 'AE 2020' };

    let outputBlob: Blob;

    if (this.isAepx) {
      // String replace in XML
      const text = new TextDecoder('utf-8').decode(this.fileBuffer);
      const replaced = text.replace(/version="\d+(\.\d+)?"/g, `version="${targetVer}"`);
      outputBlob = new Blob([replaced], { type: 'application/xml' });
    } else {
      // Binary in-place patch
      const patchedBuffer = this.fileBuffer.slice(0);
      const view = new DataView(patchedBuffer);

      if (this.headChunkOffset > 0) {
        const versionOffset = this.headChunkOffset + 8;
        if (this.isBigEndian) {
          view.setUint16(versionOffset, targetObj.major, false);
          view.setUint16(versionOffset + 2, targetObj.minor, false);
        } else {
          view.setUint16(versionOffset, targetObj.major, true);
          view.setUint16(versionOffset + 2, targetObj.minor, true);
        }
      }

      outputBlob = new Blob([patchedBuffer], { type: 'application/octet-stream' });
    }

    // Generate output file name
    const dotIndex = this.currentFileName.lastIndexOf('.');
    const base = dotIndex > 0 ? this.currentFileName.substring(0, dotIndex) : this.currentFileName;
    const ext = dotIndex > 0 ? this.currentFileName.substring(dotIndex) : '.aep';
    const cleanLabel = targetObj.label.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    const outName = `${base}_${cleanLabel}${ext}`;

    const url = URL.createObjectURL(outputBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = outName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    if (this.noteEl) {
      this.noteEl.textContent = `✓ Successfully downgraded to ${targetObj.label}! You can now open this project in older After Effects versions.`;
    }
    showToast(`Converted and downloaded ${outName}!`);
  }

  private showError(msg: string) {
    if (this.errorBox) {
      this.errorBox.textContent = `Error: ${msg}`;
      this.errorBox.classList.remove('hidden');
    }
    this.resultPanel?.classList.add('hidden');
  }
}
