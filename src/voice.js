import { Capacitor } from '@capacitor/core';
import { SpeechRecognition as NativeSTT } from '@capacitor-community/speech-recognition';
import { TextToSpeech as NativeTTS } from '@capacitor-community/text-to-speech';

// Röst in och ut. I webbläsaren används Web Speech API; i Android-appen (Capacitor) saknar webbvyn
// det, så där används telefonens egen taligenkänning och talsyntes via två plugins.

const native = Capacitor.isNativePlatform();
const WebSTT = window.SpeechRecognition || window.webkitSpeechRecognition;
const LANG = 'sv-SE';

// Ta bort sådant som inte ska läsas upp: *handlingar*, emojis och överblivna tecken
export function speakable(text) {
  return text
    .replace(/\*[^*]*\*/g, ' ')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const voice = {
  native,

  canListen() {
    return native || !!WebSTT;
  },

  canSpeak() {
    return native || 'speechSynthesis' in window;
  },

  // ---------- Lyssna ----------
  listening: false,
  _rec: null,
  _handles: [],

  // onPartial(text) under tiden man pratar, onEnd(slutlig text eller '') när man har slutat
  async listen({ onPartial, onEnd, onError }) {
    if (this.listening) return;
    this.listening = true;
    let last = '';
    const finish = () => {
      if (!this.listening) return;
      this.listening = false;
      onEnd?.(last.trim());
    };
    if (native) {
      try {
        const perm = await NativeSTT.requestPermissions();
        if (perm.speechRecognition !== 'granted') throw new Error('not-allowed');
        await NativeSTT.removeAllListeners();
        this._handles = [
          await NativeSTT.addListener('partialResults', (d) => {
            last = d.matches?.[0] || last;
            onPartial?.(last);
          }),
          await NativeSTT.addListener('listeningState', (d) => d.status === 'stopped' && finish()),
        ];
        await NativeSTT.start({ language: LANG, maxResults: 1, partialResults: true, popup: false });
      } catch (err) {
        this.listening = false;
        onError?.(String(err?.message || err));
      }
      return;
    }
    if (!WebSTT) {
      this.listening = false;
      onError?.('unsupported');
      return;
    }
    const rec = new WebSTT();
    this._rec = rec;
    rec.lang = LANG;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      last = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join(' ');
      onPartial?.(last);
    };
    rec.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') onError?.(e.error);
    };
    rec.onend = finish;
    try {
      rec.start();
    } catch (err) {
      this.listening = false;
      onError?.(String(err?.message || err));
    }
  },

  stopListening() {
    if (!this.listening) return;
    if (native) NativeSTT.stop().catch(() => {});
    else this._rec?.stop();
  },

  // ---------- Tala ----------
  _webVoices: [],

  // Svenska röster att välja mellan i inställningarna: [{ id, name }]
  async voices() {
    if (native) {
      try {
        const { voices } = await NativeTTS.getSupportedVoices();
        return voices.map((v, i) => ({ id: String(i), name: v.name, lang: v.lang })).filter((v) => /^sv/i.test(v.lang));
      } catch {
        return [];
      }
    }
    if (!('speechSynthesis' in window)) return [];
    let list = speechSynthesis.getVoices();
    if (!list.length) {
      // Rösterna laddas asynkront i de flesta webbläsare
      await new Promise((r) => {
        speechSynthesis.addEventListener('voiceschanged', r, { once: true });
        setTimeout(r, 1500);
      });
      list = speechSynthesis.getVoices();
    }
    this._webVoices = list;
    return list.filter((v) => /^sv/i.test(v.lang)).map((v) => ({ id: v.name, name: v.name, lang: v.lang }));
  },

  // Läser upp texten. onStart anropas när rösten börjar; löftet uppfylls när den har slutat.
  async speak(text, { rate = 1, pitch = 1, voiceId = '', onStart } = {}) {
    const words = speakable(text);
    if (!words) return;
    this.cancel();
    if (native) {
      onStart?.();
      const opts = { text: words, lang: LANG, rate, pitch, volume: 1, category: 'playback' };
      if (voiceId !== '') opts.voice = Number(voiceId);
      try {
        await NativeTTS.speak(opts);
      } catch {
        // Avbruten eller ingen röst installerad
      }
      return;
    }
    if (!('speechSynthesis' in window)) return;
    await new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(words);
      u.lang = LANG;
      u.rate = rate;
      u.pitch = pitch;
      try {
        const pickVoice = (this._webVoices.length ? this._webVoices : speechSynthesis.getVoices()).find((v) => (voiceId ? v.name === voiceId : /^sv/i.test(v.lang)));
        if (pickVoice) u.voice = pickVoice;
      } catch {
        // Ogiltig röst: använd webbläsarens standardröst för svenska
      }
      u.onstart = () => onStart?.();
      u.onend = resolve;
      u.onerror = resolve;
      try {
        speechSynthesis.speak(u);
      } catch {
        resolve();
      }
      // Säkerhetsnät om webbläsaren aldrig skickar onend
      setTimeout(resolve, 2000 + words.length * 150);
    });
  },

  cancel() {
    if (native) NativeTTS.stop().catch(() => {});
    else if ('speechSynthesis' in window) speechSynthesis.cancel();
  },
};
