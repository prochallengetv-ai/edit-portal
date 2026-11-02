import { showToast } from '../components/toast';

export interface ParamDef {
  id: string;
  name: string;
  min: number;
  max: number;
  step: number;
  default: number;
  unit: string;
}

export interface ExpressionItem {
  id: string;
  name: string;
  category: 'Motion' | 'Loop' | 'Opacity' | 'Text' | 'Style';
  description: string;
  properties: string[];
  params: ParamDef[];
  getCode: (vals: Record<string, number>) => string;
  renderSim: (ctx: CanvasRenderingContext2D, w: number, h: number, time: number, vals: Record<string, number>) => void;
}

export class ExpressionGeneratorTool {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animFrameId: number | null = null;

  private currentExprId = 'bounce';
  private paramValues: Record<string, number> = {};
  private activeCategory = 'all';
  private searchQuery = '';

  // DOM
  private searchInput: HTMLInputElement | null = null;
  private listEl: HTMLElement | null = null;
  private badgeEl: HTMLElement | null = null;
  private titleEl: HTMLElement | null = null;
  private descEl: HTMLElement | null = null;
  private propsEl: HTMLElement | null = null;
  private controlsEl: HTMLElement | null = null;
  private codeEl: HTMLElement | null = null;
  private copyBtn: HTMLElement | null = null;

  private expressions: ExpressionItem[] = [
    {
      id: 'bounce',
      name: 'Inertial Bounce',
      category: 'Motion',
      description: 'Creates a natural elastic bounce overshoot whenever keyframes come to a stop.',
      properties: ['Position', 'Scale', 'Rotation'],
      params: [
        { id: 'amp', name: 'Amplitude', min: 0.01, max: 0.2, step: 0.01, default: 0.05, unit: '' },
        { id: 'freq', name: 'Frequency', min: 1.0, max: 10.0, step: 0.5, default: 4.0, unit: 'Hz' },
        { id: 'decay', name: 'Decay', min: 1.0, max: 12.0, step: 0.5, default: 5.0, unit: '' },
      ],
      getCode: (p) => `// Inertial Bounce - Edit Portal
var amp = ${p.amp.toFixed(2)};
var freq = ${p.freq.toFixed(1)};
var decay = ${p.decay.toFixed(1)};

var n = 0;
if (numKeys > 0) {
  n = nearestKey(time).index;
  if (key(n).time > time) n--;
}

if (n == 0) {
  value;
} else {
  var t = time - key(n).time;
  if (t > 0 && t < 1.5) {
    var v = velocityAtTime(key(n).time - thisComp.frameDuration / 10);
    value + v * amp * Math.sin(freq * t * 2 * Math.PI) / Math.exp(decay * t);
  } else {
    value;
  }
}`,
      renderSim: (ctx, w, h, time, p) => {
        // Repeated keyframe impulse every 2 seconds
        const cycle = time % 2.0;
        const keyTime = 0.5;
        let offset = 0;

        if (cycle < keyTime) {
          offset = (cycle / keyTime) * 120 - 60;
        } else {
          const t = cycle - keyTime;
          const v = 240; // simulated arrival velocity
          offset = 60 + (v * p.amp * Math.sin(p.freq * t * 2 * Math.PI)) / Math.exp(p.decay * t);
        }

        ctx.fillStyle = '#06070c';
        ctx.fillRect(0, 0, w, h);

        // Draw rail & target
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        ctx.moveTo(40, h / 2);
        ctx.lineTo(w - 40, h / 2);
        ctx.stroke();

        // Target goal post
        ctx.strokeStyle = 'rgba(236, 72, 153, 0.4)';
        ctx.beginPath();
        ctx.moveTo(w / 2 + 60, h / 2 - 30);
        ctx.lineTo(w / 2 + 60, h / 2 + 30);
        ctx.stroke();

        // Bouncing element
        const bx = w / 2 + offset;
        const by = h / 2;

        ctx.fillStyle = '#df71dc';
        ctx.shadowColor = '#f15aa9';
        ctx.shadowBlur = 16;
        ctx.fillRect(bx - 20, by - 20, 40, 40);
        ctx.shadowBlur = 0;
      },
    },
    {
      id: 'wiggle',
      name: 'Smooth Organic Wiggle',
      category: 'Motion',
      description: 'Continuous organic procedural oscillation with adjustable frequency, amplitude and octaves.',
      properties: ['Position', 'Rotation', 'Anchor Point'],
      params: [
        { id: 'freq', name: 'Frequency', min: 0.5, max: 15.0, step: 0.5, default: 2.5, unit: 'Hz' },
        { id: 'amp', name: 'Amplitude', min: 5, max: 120, step: 5, default: 45, unit: 'px' },
        { id: 'octaves', name: 'Octaves (Detail)', min: 1, max: 5, step: 1, default: 2, unit: '' },
      ],
      getCode: (p) => `// Smooth Wiggle - Edit Portal
var freq = ${p.freq.toFixed(1)};
var amp = ${p.amp.toFixed(0)};
var octaves = ${Math.round(p.octaves)};
wiggle(freq, amp, octaves);`,
      renderSim: (ctx, w, h, time, p) => {
        ctx.fillStyle = '#06070c';
        ctx.fillRect(0, 0, w, h);

        // Multi-octave simulated perlin
        let ox = 0;
        let oy = 0;
        for (let o = 1; o <= p.octaves; o++) {
          const f = p.freq * o;
          const a = p.amp / o;
          ox += Math.sin(time * f * 2.1) * a;
          oy += Math.cos(time * f * 1.7) * (a * 0.7);
        }

        // Draw trail
        ctx.strokeStyle = 'rgba(182, 145, 255, 0.2)';
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, p.amp, 0, Math.PI * 2);
        ctx.stroke();

        const bx = w / 2 + ox;
        const by = h / 2 + oy;

        ctx.fillStyle = '#b691ff';
        ctx.shadowColor = '#818cf8';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(bx, by, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      },
    },
    {
      id: 'loop',
      name: 'Loop In + Out (PingPong / Cycle)',
      category: 'Loop',
      description: 'Seamlessly loops any keyframed property endlessly without manually duplicating keyframes.',
      properties: ['All Keyframable Properties'],
      params: [
        { id: 'type', name: 'Loop Type (0=cycle, 1=pingpong)', min: 0, max: 1, step: 1, default: 1, unit: '' },
        { id: 'keys', name: 'Keyframe Range', min: 0, max: 5, step: 1, default: 0, unit: '' },
      ],
      getCode: (p) => {
        const t = Math.round(p.type) === 1 ? 'pingpong' : 'cycle';
        return `// Seamless Loop - Edit Portal
loopOut("${t}", ${Math.round(p.keys)});
// loopIn("${t}", ${Math.round(p.keys)}); // enable if looping prior keyframes`;
      },
      renderSim: (ctx, w, h, time, p) => {
        ctx.fillStyle = '#06070c';
        ctx.fillRect(0, 0, w, h);

        const isPingPong = Math.round(p.type) === 1;
        const dur = 1.6;
        const cycle = (time % (isPingPong ? dur * 2 : dur)) / dur;
        const progress = isPingPong ? (cycle <= 1 ? cycle : 2 - cycle) : cycle;

        const bx = 80 + progress * (w - 160);
        const by = h / 2;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.strokeRect(80, h / 2 - 2, w - 160, 4);

        ctx.fillStyle = '#df71dc';
        ctx.shadowColor = '#df71dc';
        ctx.shadowBlur = 12;
        ctx.fillRect(bx - 16, by - 16, 32, 32);
        ctx.shadowBlur = 0;
      },
    },
    {
      id: 'fade',
      name: 'Auto Fade In & Out',
      category: 'Opacity',
      description: 'Automatically animates layer opacity from 0% to 100% at in-point, and fades out at out-point.',
      properties: ['Opacity'],
      params: [
        { id: 'fadeIn', name: 'Fade In Duration', min: 0.1, max: 2.0, step: 0.1, default: 0.4, unit: 's' },
        { id: 'fadeOut', name: 'Fade Out Duration', min: 0.1, max: 2.0, step: 0.1, default: 0.6, unit: 's' },
      ],
      getCode: (p) => `// Auto Fade In & Out - Edit Portal
var fadeIn = ${p.fadeIn.toFixed(1)};
var fadeOut = ${p.fadeOut.toFixed(1)};

var inT = inPoint + fadeIn;
var outT = outPoint - fadeOut;

if (time < inT) {
  ease(time, inPoint, inT, 0, 100);
} else if (time > outT) {
  ease(time, outT, outPoint, 100, 0);
} else {
  100;
}`,
      renderSim: (ctx, w, h, time, p) => {
        ctx.fillStyle = '#06070c';
        ctx.fillRect(0, 0, w, h);

        const loopDur = 3.0;
        const t = time % loopDur;
        let opacity = 1.0;

        if (t < p.fadeIn) {
          opacity = t / p.fadeIn;
        } else if (t > loopDur - p.fadeOut) {
          opacity = (loopDur - t) / p.fadeOut;
        }

        ctx.fillStyle = `rgba(56, 189, 248, ${Math.max(0, Math.min(1, opacity))})`;
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 20;
        ctx.fillRect(w / 2 - 60, h / 2 - 60, 120, 120);
        ctx.shadowBlur = 0;
      },
    },
    {
      id: 'overshoot',
      name: 'Overshoot Scale / Pop-in',
      category: 'Motion',
      description: 'Impactful pop-in entrance with elastic scale overshoot used in fast TikTok edits.',
      properties: ['Scale'],
      params: [
        { id: 'speed', name: 'Entrance Speed', min: 0.2, max: 1.5, step: 0.1, default: 0.4, unit: 's' },
        { id: 'overshoot', name: 'Overshoot %', min: 5, max: 60, step: 5, default: 25, unit: '%' },
        { id: 'damp', name: 'Damping', min: 2, max: 10, step: 0.5, default: 4.5, unit: '' },
      ],
      getCode: (p) => `// Overshoot Pop-in Scale - Edit Portal
var dur = ${p.speed.toFixed(1)};
var maxScale = [${(100 + p.overshoot).toFixed(0)}, ${(100 + p.overshoot).toFixed(0)}];
var endScale = [100, 100];
var decay = ${p.damp.toFixed(1)};

var t = time - inPoint;
if (t < dur) {
  linear(t, 0, dur, [0,0], maxScale);
} else {
  var t2 = t - dur;
  var w = Math.sin(t2 * 14) / Math.exp(decay * t2);
  endScale + (maxScale - endScale) * w;
}`,
      renderSim: (ctx, w, h, time, p) => {
        ctx.fillStyle = '#06070c';
        ctx.fillRect(0, 0, w, h);

        const cycle = time % 1.8;
        let scale = 1.0;
        const dur = p.speed;

        if (cycle < dur) {
          scale = (cycle / dur) * (1 + p.overshoot / 100);
        } else {
          const t2 = cycle - dur;
          const wOff = Math.sin(t2 * 14) / Math.exp(p.damp * t2);
          scale = 1.0 + (p.overshoot / 100) * wOff;
        }

        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.scale(scale, scale);
        ctx.fillStyle = '#f15aa9';
        ctx.shadowColor = '#f15aa9';
        ctx.shadowBlur = 18;
        ctx.fillRect(-35, -35, 70, 70);
        ctx.restore();
      },
    },
    {
      id: 'pendulum',
      name: 'Pendulum / Swing',
      category: 'Motion',
      description: 'Physical pendulum swing with gravity damping decay over time.',
      properties: ['Rotation'],
      params: [
        { id: 'speed', name: 'Swing Speed', min: 1, max: 10, step: 0.5, default: 3.5, unit: 'Hz' },
        { id: 'angle', name: 'Max Angle', min: 10, max: 90, step: 5, default: 45, unit: 'deg' },
        { id: 'decay', name: 'Decay Factor', min: 0.1, max: 2.0, step: 0.1, default: 0.4, unit: '' },
      ],
      getCode: (p) => `// Pendulum Swing - Edit Portal
var speed = ${p.speed.toFixed(1)};
var maxAngle = ${p.angle.toFixed(0)};
var decay = ${p.decay.toFixed(1)};

var t = time - inPoint;
maxAngle * Math.cos(speed * t * 2 * Math.PI) / Math.exp(decay * t);`,
      renderSim: (ctx, w, h, time, p) => {
        ctx.fillStyle = '#06070c';
        ctx.fillRect(0, 0, w, h);

        const cycle = time % 4.0;
        const angle = ((p.angle * Math.PI) / 180) * Math.cos(p.speed * cycle * 2 * Math.PI) / Math.exp(p.decay * cycle);

        ctx.save();
        ctx.translate(w / 2, 40);
        ctx.rotate(angle);

        // String
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, 130);
        ctx.stroke();

        // Bob
        ctx.fillStyle = '#c084fc';
        ctx.shadowColor = '#c084fc';
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(0, 130, 20, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      },
    },
    {
      id: 'strobe',
      name: 'Strobe / Flicker',
      category: 'Style',
      description: 'Rhythmic flash strobe for hard beat drops or horror glitch aesthetics.',
      properties: ['Opacity'],
      params: [
        { id: 'rate', name: 'Flashes / Second', min: 2, max: 24, step: 1, default: 12, unit: 'Hz' },
        { id: 'minOp', name: 'Min Opacity', min: 0, max: 50, step: 5, default: 0, unit: '%' },
      ],
      getCode: (p) => `// Strobe Flicker - Edit Portal
var rate = ${p.rate.toFixed(0)};
var minOp = ${p.minOp.toFixed(0)};
(Math.sin(time * rate * 2 * Math.PI) > 0) ? 100 : minOp;`,
      renderSim: (ctx, w, h, time, p) => {
        ctx.fillStyle = '#06070c';
        ctx.fillRect(0, 0, w, h);

        const isWhite = Math.sin(time * p.rate * 2 * Math.PI) > 0;
        ctx.fillStyle = isWhite ? '#ffffff' : `rgba(255, 255, 255, ${p.minOp / 100})`;
        ctx.fillRect(w / 2 - 50, h / 2 - 50, 100, 100);
      },
    },
    {
      id: 'shake',
      name: 'Snap Zoom / Shake Decay',
      category: 'Motion',
      description: 'Sudden camera impact shake that settles down quickly on each transition beat.',
      properties: ['Position', 'Scale'],
      params: [
        { id: 'intensity', name: 'Intensity', min: 10, max: 100, step: 5, default: 50, unit: 'px' },
        { id: 'freq', name: 'Frequency', min: 10, max: 40, step: 2, default: 22, unit: 'Hz' },
        { id: 'decay', name: 'Settle Speed', min: 2, max: 12, step: 1, default: 6, unit: '' },
      ],
      getCode: (p) => `// Snap Shake Decay - Edit Portal
var intensity = ${p.intensity.toFixed(0)};
var freq = ${p.freq.toFixed(0)};
var decay = ${p.decay.toFixed(1)};

var t = time % 1.5; // triggered every 1.5s
var shake = (wiggle(freq, intensity) - value) / Math.exp(decay * t);
value + shake;`,
      renderSim: (ctx, w, h, time, p) => {
        ctx.fillStyle = '#06070c';
        ctx.fillRect(0, 0, w, h);

        const cycle = time % 1.5;
        const factor = Math.exp(-p.decay * cycle);
        const ox = (Math.sin(time * p.freq) * p.intensity) * factor;
        const oy = (Math.cos(time * (p.freq * 1.3)) * p.intensity * 0.7) * factor;

        ctx.strokeStyle = '#f43f5e';
        ctx.shadowColor = '#f43f5e';
        ctx.shadowBlur = 12;
        ctx.lineWidth = 3;
        ctx.strokeRect(w / 2 - 60 + ox, h / 2 - 60 + oy, 120, 120);
        ctx.shadowBlur = 0;
      },
    },
    {
      id: 'counter',
      name: 'Number Counter',
      category: 'Text',
      description: 'Generates animated number counts with customizable decimals and zero padding for UI metrics.',
      properties: ['Source Text'],
      params: [
        { id: 'start', name: 'Start Value', min: 0, max: 1000, step: 10, default: 0, unit: '' },
        { id: 'end', name: 'End Value', min: 100, max: 100000, step: 500, default: 50000, unit: '' },
        { id: 'dur', name: 'Duration', min: 0.5, max: 6.0, step: 0.5, default: 2.0, unit: 's' },
        { id: 'decimals', name: 'Decimals', min: 0, max: 2, step: 1, default: 0, unit: '' },
      ],
      getCode: (p) => `// Number Counter - Edit Portal
var startVal = ${p.start.toFixed(0)};
var endVal = ${p.end.toFixed(0)};
var dur = ${p.dur.toFixed(1)};
var decimals = ${Math.round(p.decimals)};

var t = Math.min(Math.max((time - inPoint) / dur, 0), 1);
var easeT = easeOut(t, 0, 1, 0, 1);
var val = startVal + (endVal - startVal) * easeT;

val.toLocaleString('en-US', {
  minimumFractionDigits: decimals,
  maximumFractionDigits: decimals
});`,
      renderSim: (ctx, w, h, time, p) => {
        ctx.fillStyle = '#06070c';
        ctx.fillRect(0, 0, w, h);

        const cycle = (time % (p.dur + 1.0));
        const t = Math.min(Math.max(cycle / p.dur, 0), 1);
        const easeOut = 1 - Math.pow(1 - t, 3);
        const currentVal = p.start + (p.end - p.start) * easeOut;

        ctx.fillStyle = '#ffffff';
        ctx.font = '700 48px Space Grotesk, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(Math.floor(currentVal).toLocaleString(), w / 2, h / 2);
      },
    },
    {
      id: 'posterize',
      name: 'Posterize Time (Frame Rate Lock)',
      category: 'Style',
      description: 'Forces specific lower frame rates (e.g. 12 FPS anime look) on continuous movement.',
      properties: ['All Keyframable Properties'],
      params: [
        { id: 'fps', name: 'Target Frame Rate', min: 4, max: 30, step: 1, default: 12, unit: 'FPS' },
      ],
      getCode: (p) => `// Posterize Time - Edit Portal
posterizeTime(${Math.round(p.fps)});
value;`,
      renderSim: (ctx, w, h, time, p) => {
        ctx.fillStyle = '#06070c';
        ctx.fillRect(0, 0, w, h);

        const targetFps = Math.round(p.fps);
        const quantizedTime = Math.floor(time * targetFps) / targetFps;
        const angle = quantizedTime * 3.0;

        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate(angle);
        ctx.fillStyle = '#4ade80';
        ctx.shadowColor = '#4ade80';
        ctx.shadowBlur = 12;
        ctx.fillRect(-30, -30, 60, 60);
        ctx.restore();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = '12px Space Grotesk, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`LOCKED TO ${targetFps} FPS`, w / 2, h - 20);
      },
    },
    {
      id: 'parallax',
      name: '3D Parallax Depth Offset',
      category: 'Motion',
      description: 'Calculates natural multi-plane depth movement based on camera distance or null controller.',
      properties: ['Position', 'Z-Depth'],
      params: [
        { id: 'mult', name: 'Multiplier', min: 0.1, max: 3.0, step: 0.1, default: 1.0, unit: 'x' },
        { id: 'dist', name: 'Depth Layer', min: 100, max: 2000, step: 100, default: 500, unit: 'px' },
      ],
      getCode: (p) => `// 3D Parallax Depth Offset - Edit Portal
var mult = ${p.mult.toFixed(2)};
var depth = ${p.dist.toFixed(0)};
var cam = thisComp.activeCamera;

if (cam) {
  var camPos = cam.toWorld([0,0,0]);
  var delta = camPos - toWorld(anchorPoint);
  var factor = depth / 1000.0 * mult;
  value + [delta[0] * factor * 0.1, delta[1] * factor * 0.1];
} else {
  value;
}`,
      renderSim: (ctx, w, h, time, p) => {
        ctx.fillStyle = '#06070c';
        ctx.fillRect(0, 0, w, h);

        const camX = Math.sin(time * 1.5) * 60;
        const offset = camX * p.mult * (p.dist / 500);

        // Draw multiple parallax planes
        // Background plane
        ctx.fillStyle = 'rgba(129, 140, 248, 0.2)';
        ctx.fillRect(w / 2 - 120 + offset * 0.2, h / 2 - 50, 240, 100);

        // Midground plane
        ctx.fillStyle = 'rgba(236, 72, 153, 0.4)';
        ctx.fillRect(w / 2 - 80 + offset * 0.6, h / 2 - 40, 160, 80);

        // Foreground plane (active)
        ctx.fillStyle = '#df71dc';
        ctx.shadowColor = '#f15aa9';
        ctx.shadowBlur = 16;
        ctx.fillRect(w / 2 - 40 + offset, h / 2 - 30, 80, 60);
        ctx.shadowBlur = 0;
      },
    },
    {
      id: 'audioReact',
      name: 'Audio Amplitude React (Bass Pulse)',
      category: 'Style',
      description: 'Dynamically scales or pulses layers in sync with "Audio Amplitude" effect keyframes.',
      properties: ['Scale', 'Glow Intensity', 'Blur'],
      params: [
        { id: 'boost', name: 'Bass Boost', min: 1.0, max: 8.0, step: 0.5, default: 3.5, unit: 'x' },
        { id: 'smooth', name: 'Smoothing', min: 1, max: 10, step: 1, default: 3, unit: 'f' },
      ],
      getCode: (p) => `// Audio Amplitude Pulse - Edit Portal
var boost = ${p.boost.toFixed(1)};
var s = ${p.smooth.toFixed(0)};

var audioAmp = thisComp.layer("Audio Amplitude").effect("Both Channels")("Slider");
var amp = audioAmp.smooth(s, s * 2);
var pulse = amp * boost;

[value[0] + pulse, value[1] + pulse];`,
      renderSim: (ctx, w, h, time, p) => {
        ctx.fillStyle = '#06070c';
        ctx.fillRect(0, 0, w, h);

        // Simulated kick drum pulse every 0.6 seconds (100 BPM)
        const beatCycle = (time * 1.66) % 1.0;
        const kickEnvelope = Math.max(0, Math.exp(-beatCycle * 8.0));
        const pulse = kickEnvelope * p.boost * 15;

        const size = 60 + pulse;
        ctx.fillStyle = '#38bdf8';
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = pulse * 1.5;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, (size + 30) / 2, 0, Math.PI * 2);
        ctx.stroke();
      },
    },
  ];

  public init() {
    this.bindElements();
    this.setupEvents();
    this.initDefaultParams();
    this.renderCardsList();
    this.selectExpression(this.currentExprId);
    this.startSimulation();
  }

  private bindElements() {
    this.canvas = document.getElementById('exprCanvas') as HTMLCanvasElement;
    if (this.canvas) this.ctx = this.canvas.getContext('2d');

    this.searchInput = document.getElementById('exprSearch') as HTMLInputElement;
    this.listEl = document.getElementById('exprList');
    this.badgeEl = document.getElementById('exprBadge');
    this.titleEl = document.getElementById('exprTitle');
    this.descEl = document.getElementById('exprDesc');
    this.propsEl = document.getElementById('exprProperties');
    this.controlsEl = document.getElementById('exprControls');
    this.codeEl = document.getElementById('exprCode');
    this.copyBtn = document.getElementById('exprCopyBtn');
  }

  private setupEvents() {
    // Search filter
    this.searchInput?.addEventListener('input', () => {
      this.searchQuery = this.searchInput!.value.toLowerCase().trim();
      this.renderCardsList();
    });

    // Category chips
    const catButtons = document.querySelectorAll('.expr-cat');
    catButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        catButtons.forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        this.activeCategory = btn.getAttribute('data-cat') || 'all';
        this.renderCardsList();
      });
    });

    // Copy Button
    this.copyBtn?.addEventListener('click', () => {
      const code = this.codeEl?.textContent || '';
      navigator.clipboard.writeText(code).then(() => {
        showToast('Expression copied to clipboard!');
      });
    });

    window.addEventListener('resize', () => this.resizeCanvas());
  }

  private resizeCanvas() {
    if (!this.canvas) return;
    this.canvas.width = this.canvas.clientWidth * window.devicePixelRatio;
    this.canvas.height = this.canvas.clientHeight * window.devicePixelRatio;
  }

  private initDefaultParams() {
    this.expressions.forEach((expr) => {
      expr.params.forEach((param) => {
        const key = `${expr.id}_${param.id}`;
        this.paramValues[key] = param.default;
      });
    });
  }

  private renderCardsList() {
    if (!this.listEl) return;
    this.listEl.innerHTML = '';

    const filtered = this.expressions.filter((expr) => {
      const matchesCat = this.activeCategory === 'all' || expr.category === this.activeCategory;
      const matchesSearch =
        !this.searchQuery ||
        expr.name.toLowerCase().includes(this.searchQuery) ||
        expr.description.toLowerCase().includes(this.searchQuery) ||
        expr.properties.some((p) => p.toLowerCase().includes(this.searchQuery));
      return matchesCat && matchesSearch;
    });

    filtered.forEach((expr) => {
      const card = document.createElement('div');
      card.className = `expr-item-card ${expr.id === this.currentExprId ? 'is-active' : ''}`;
      card.innerHTML = `
        <div class="expr-item-top">
          <span class="expr-item-title font-display">${expr.name}</span>
          <span class="expr-item-cat font-mono">${expr.category}</span>
        </div>
        <p class="expr-item-desc">${expr.description}</p>
      `;

      card.addEventListener('click', () => {
        document.querySelectorAll('.expr-item-card').forEach((c) => c.classList.remove('is-active'));
        card.classList.add('is-active');
        this.selectExpression(expr.id);
      });

      this.listEl!.appendChild(card);
    });
  }

  public selectExpression(id: string) {
    this.currentExprId = id;
    const expr = this.expressions.find((e) => e.id === id);
    if (!expr) return;

    if (this.badgeEl) this.badgeEl.textContent = expr.category.toUpperCase();
    if (this.titleEl) this.titleEl.textContent = expr.name;
    if (this.descEl) this.descEl.textContent = expr.description;

    // Property badges
    if (this.propsEl) {
      this.propsEl.innerHTML = expr.properties
        .map((p) => `<span class="expr-prop-pill">Property: <strong>${p}</strong></span>`)
        .join('');
    }

    // Parametric Sliders
    if (this.controlsEl) {
      this.controlsEl.innerHTML = '';
      expr.params.forEach((param) => {
        const key = `${expr.id}_${param.id}`;
        const currentVal = this.paramValues[key] ?? param.default;

        const box = document.createElement('div');
        box.className = 'expr-ctrl-box font-mono';
        box.innerHTML = `
          <label>
            <span>${param.name.toUpperCase()}</span>
            <span id="val_${key}" class="text-neon-pink">${currentVal} ${param.unit}</span>
          </label>
          <input type="range" class="ep-slider" min="${param.min}" max="${param.max}" step="${param.step}" value="${currentVal}" />
        `;

        const slider = box.querySelector('input')!;
        const valDisplay = box.querySelector(`#val_${key}`)!;

        slider.addEventListener('input', () => {
          const v = parseFloat(slider.value);
          this.paramValues[key] = v;
          valDisplay.textContent = `${v} ${param.unit}`;
          this.updateCode();
        });

        this.controlsEl!.appendChild(box);
      });
    }

    this.updateCode();
    this.resizeCanvas();
  }

  private getCurrentParams(): Record<string, number> {
    const expr = this.expressions.find((e) => e.id === this.currentExprId);
    if (!expr) return {};
    const res: Record<string, number> = {};
    expr.params.forEach((p) => {
      res[p.id] = this.paramValues[`${expr.id}_${p.id}`] ?? p.default;
    });
    return res;
  }

  private updateCode() {
    const expr = this.expressions.find((e) => e.id === this.currentExprId);
    if (!expr || !this.codeEl) return;
    const vals = this.getCurrentParams();
    this.codeEl.textContent = expr.getCode(vals);
  }

  private startSimulation() {
    const startTime = performance.now();

    const loop = () => {
      const now = performance.now();
      const elapsed = (now - startTime) / 1000;

      if (this.ctx && this.canvas) {
        const expr = this.expressions.find((e) => e.id === this.currentExprId);
        if (expr) {
          const vals = this.getCurrentParams();
          expr.renderSim(this.ctx, this.canvas.width, this.canvas.height, elapsed, vals);
        }
      }

      this.animFrameId = requestAnimationFrame(loop);
    };

    this.animFrameId = requestAnimationFrame(loop);
  }
}
