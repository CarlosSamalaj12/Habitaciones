/* ==========================================================================
   NOTIFICATION SOUND / AUDIO
   ========================================================================== */

let audioCtx = null;
let notifAudioUnlocked = false;

export function unlockNotifAudio() {
  if (notifAudioUnlocked) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (typeof Ctx === "undefined") return;
    audioCtx = new Ctx();
    notifAudioUnlocked = true;
  } catch (e) {
    /* silencio: no es critico */
  }
}

export function initAudioUnlockListeners() {
  ["click", "touchstart", "keydown"].forEach(ev => {
    document.addEventListener(ev, unlockNotifAudio, { once: true });
  });
}

export function playNotificationSound() {
  try {
    if (!audioCtx) return;
    if (audioCtx.state === "suspended") {
      return;
    }
    [800, 1000].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
      osc.start(audioCtx.currentTime + i * 0.15);
      osc.stop(audioCtx.currentTime + i * 0.15 + 0.25);
    });
  } catch (e) {
    /* silencio: no es critico */
  }
}
