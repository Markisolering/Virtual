import { Capacitor } from '@capacitor/core';
import { SpeechRecognition as NativeSTT } from '@capacitor-community/speech-recognition';
import { TextToSpeech as NativeTTS } from '@capacitor-community/text-to-speech';
import { speechLang } from './i18n.js';

// Röst in och ut. I webbläsaren används Web Speech API; i Android-appen (Capacitor) saknar webbvyn
// det, så där används telefonens egen taligenkänning och talsyntes via två plugins.

const native = Capacitor.isNativePlatform();
const WebSTT = window.SpeechRecognition || window.webkitSpeechRecognition;
const LANG = speechLang; // sv-SE eller en-US beroende på appens språk
const LANG_RE = new RegExp(`^${LANG.slice(0, 2)}`, 'i');

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
  // Varje inspelning har ett eget nummer, så att sena händelser från en gammal inspelning (som
  // telefonen ibland skickar efter att man har tryckt stopp) inte kan störa nästa.
  listening: false,
  _session: 0,
  _rec: null,
  _stop: null,
  _permission: false,

  // Lyssnar på en mening. onPartial(text) under tiden, onSound() när ljud/tal uppfattas.
  // Löftet ger { text, error } när meningen är slut, när stop() anropas eller om något hänger sig.
  listenOnce({ onPartial, onSound } = {}) {
    if (this.listening) this.abort();
    const id = ++this._session;
    this.listening = true;
    let last = '';
    let error = null;
    let done;
    const result = new Promise((resolve) => (done = resolve));
    const timers = [];
    const finish = () => {
      if (id !== this._session || !this.listening) return;
      this.listening = false;
      this._stop = null;
      timers.forEach(clearTimeout);
      if (native) NativeSTT.removeAllListeners().catch(() => {});
      done({ text: last.trim(), error });
    };
    const partial = (t) => {
      if (id !== this._session || !t) return;
      last = t;
      onPartial?.(t);
    };
    // Säkerhetsnät: en mening tar aldrig mer än 25 s, och efter stopp väntar vi högst 1,5 s på slutet
    timers.push(setTimeout(() => this.stop(), 25000));
    this._stop = () => {
      timers.push(setTimeout(finish, 1500));
      if (native) NativeSTT.stop().catch(finish);
      else {
        try {
          this._rec?.stop();
        } catch {
          finish();
        }
      }
    };
    this._finish = finish;

    if (native) {
      (async () => {
        try {
          if (!this._permission) {
            const perm = await NativeSTT.requestPermissions();
            if (perm.speechRecognition !== 'granted') throw new Error('not-allowed');
            this._permission = true;
          }
          if (id !== this._session) return;
          await NativeSTT.removeAllListeners();
          await NativeSTT.addListener('partialResults', (d) => {
            partial(d.matches?.[0]);
            onSound?.();
          });
          await NativeSTT.addListener('listeningState', (d) => {
            if (id !== this._session) return;
            if (d.status === 'started') onSound?.('start');
            if (d.status === 'stopped') setTimeout(finish, 250); // sista resultatet kan komma strax efter
          });
          // Kommer inget alls inom 12 s ger vi upp
          timers.push(setTimeout(() => !last && this.listening && id === this._session && ((error = 'timeout'), finish()), 12000));
          const res = await NativeSTT.start({ language: LANG, maxResults: 1, partialResults: true, popup: false });
          if (res?.matches?.[0]) partial(res.matches[0]);
        } catch (err) {
          error = String(err?.message || err);
          finish();
        }
      })();
      return result;
    }
    if (!WebSTT) {
      error = 'unsupported';
      finish();
      return result;
    }
    const rec = new WebSTT();
    this._rec = rec;
    rec.lang = LANG;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let started = false;
    rec.onstart = () => {
      started = true;
      if (id === this._session) onSound?.('start');
    };
    rec.onspeechstart = () => id === this._session && onSound?.();
    rec.onresult = (e) => {
      partial(
        Array.from(e.results)
          .map((r) => r[0].transcript)
          .join(' '),
      );
    };
    rec.onerror = (e) => {
      if (id !== this._session) return;
      if (e.error !== 'aborted') error = e.error;
    };
    rec.onend = finish;
    timers.push(setTimeout(() => !started && id === this._session && ((error = 'timeout'), this.abort()), 6000));
    try {
      rec.start();
    } catch (err) {
      error = String(err?.message || err);
      finish();
    }
    return result;
  },

  // Sluta lyssna; det som hunnit sägas kommer med i resultatet
  stop() {
    if (this.listening) this._stop?.();
  },

  // Avbryt direkt utan att vänta på resultatet
  abort() {
    if (!this.listening) return;
    if (native) NativeSTT.stop().catch(() => {});
    else {
      try {
        this._rec?.abort();
      } catch {
        // Redan stoppad
      }
    }
    this._finish?.();
  },

  stopListening() {
    this.stop();
  },

  // ---------- Tala ----------
  _webVoices: [],

  // Röster på appens språk att välja mellan i inställningarna: [{ id, name }]
  async voices() {
    if (native) {
      try {
        const { voices } = await NativeTTS.getSupportedVoices();
        return voices.map((v, i) => ({ id: String(i), name: v.name, lang: v.lang })).filter((v) => LANG_RE.test(v.lang));
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
    return list.filter((v) => LANG_RE.test(v.lang)).map((v) => ({ id: v.name, name: v.name, lang: v.lang }));
  },

  // Läser upp texten. onStart anropas när rösten börjar; löftet uppfylls när den har slutat.
  speaking: false,

  // onWord(teckenindex) anropas när rösten börjar säga ett nytt ord (för läppsynken). Indexet gäller
  // texten efter speakable(), som är det som läses upp.
  async speak(text, { rate = 1, pitch = 1, voiceId = '', onStart, onWord } = {}) {
    const words = speakable(text);
    if (!words) return;
    this.cancel();
    this.speaking = true;
    let handle = null;
    try {
      if (native && onWord) handle = await NativeTTS.addListener('onRangeStart', (info) => onWord(info.start)).catch(() => null);
      await this._speak(words, { rate, pitch, voiceId, onStart, onWord });
    } finally {
      handle?.remove?.();
      this.speaking = false;
    }
  },

  async _speak(words, { rate, pitch, voiceId, onStart, onWord }) {
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
        const pickVoice = (this._webVoices.length ? this._webVoices : speechSynthesis.getVoices()).find((v) => (voiceId ? v.name === voiceId && LANG_RE.test(v.lang) : LANG_RE.test(v.lang)));
        if (pickVoice) u.voice = pickVoice;
      } catch {
        // Ogiltig röst: använd webbläsarens standardröst för språket
      }
      u.onstart = () => onStart?.();
      u.onboundary = (e) => {
        if (e.name === 'word' || e.name === undefined) onWord?.(e.charIndex);
      };
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
