// ==========================================
// 1. MOTOR DE AUDIO CON WEBAUDIO API
// ==========================================
class SoundEngine {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  }

  async ensureAudioContext() {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  async play(filename, pan = 0, volumeDb = 0, wait = false) {
    await this.ensureAudioContext();

    try {
      const response = await fetch(`sounds/${filename}.ogg`);
      if (!response.ok) {
        console.warn(`No se encontró el archivo: sounds/${filename}.ogg`);
        return;
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);

      const source = this.ctx.createBufferSource();
      const panner = this.ctx.createStereoPanner();
      const gain = this.ctx.createGain();

      source.buffer = audioBuffer;
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      gain.gain.value = Math.pow(10, volumeDb / 20);

      source.connect(panner);
      panner.connect(gain);
      gain.connect(this.ctx.destination);

      source.start(0);

      if (wait) {
        return new Promise((resolve) => {
          source.onended = resolve;
        });
      }
      return source;
    } catch (e) {
      console.error(`Error procesando sounds/${filename}.ogg:`, e);
    }
  }
}

const audio = new SoundEngine();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const random = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function speakScreenReader(text) {
  const announcer = document.getElementById('screen-reader-announcer');
  if (announcer) {
    announcer.textContent = '';
    setTimeout(() => { announcer.textContent = text; }, 50);
  }
}

// ==========================================
// 2. SISTEMA DE MENÚ VERTICAL ACCESIBLE
// ==========================================
class GameMenu {
  constructor(onStartGame) {
    this.onStartGame = onStartGame;
    this.selectedIndex = 0;
    this.items = Array.from(document.querySelectorAll('.menu-item'));
    this.menuContainer = document.getElementById('menu');
    this.statusDisplay = document.getElementById('status-display');
    this.isActive = true;

    this.initEvents();
    this.updateSelection(false); // Seleccionar inicial sin forzar anuncio
  }

  updateSelection(announce = true) {
    this.items.forEach((item, index) => {
      if (index === this.selectedIndex) {
        item.classList.add('active');
        item.setAttribute('tabindex', '0');
        item.focus(); // El foco del navegador hace que el lector lea la opción automáticamente
        if (announce) {
          speakScreenReader(item.textContent);
        }
      } else {
        item.classList.remove('active');
        item.setAttribute('tabindex', '-1');
      }
    });
  }

  initEvents() {
    window.addEventListener('keydown', async (e) => {
      if (!this.isActive) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.selectedIndex = (this.selectedIndex + 1) % this.items.length;
        this.updateSelection(true);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.selectedIndex = (this.selectedIndex - 1 + this.items.length) % this.items.length;
        this.updateSelection(true);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        await this.triggerAction();
      }
    });

    this.items.forEach((item, index) => {
      item.addEventListener('click', async () => {
        if (!this.isActive) return;
        this.selectedIndex = index;
        this.updateSelection(false);
        await this.triggerAction();
      });
    });
  }

  async triggerAction() {
    const action = this.items[this.selectedIndex].getAttribute('data-action');
    if (action === 'play') {
      this.hide();
      await this.onStartGame();
    } else if (action === 'exit') {
      window.close();
    }
  }

  show() {
    this.isActive = true;
    this.menuContainer.style.display = 'flex';
    this.statusDisplay.style.display = 'none';
    this.updateSelection(true);
  }

  hide() {
    this.isActive = false;
    this.menuContainer.style.display = 'none';
    this.statusDisplay.style.display = 'block';
  }
}

// ==========================================
// 3. LÓGICA JUGABLE
// ==========================================
class FootballGame {
  constructor() {
    this.st1 = 0;
    this.st2 = 0;
    this.isPlaying = false;
  }

  async waitForAim() {
    return new Promise((resolve) => {
      let counter = 2; // 1 = Izquierda, 2 = Centro, 3 = Derecha

      const onKeyDown = async (e) => {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          counter = Math.max(1, counter - 1);
          await this.playDirectionSound(counter);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          counter = Math.min(3, counter + 1);
          await this.playDirectionSound(counter);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          window.removeEventListener('keydown', onKeyDown);
          resolve(counter);
        }
      };

      window.addEventListener('keydown', onKeyDown);
    });
  }

  async playDirectionSound(counter) {
    let pan = counter === 1 ? -0.8 : (counter === 3 ? 0.8 : 0);
    let soundName = counter === 1 ? 'bw_left' : (counter === 3 ? 'bw_right' : 'bw_center');
    await audio.play(soundName, pan);
  }

  async start(onGameEnd) {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.st1 = 0;
    this.st2 = 0;

    const bgAmbience = await audio.play('bw_background', 0, -5, false);
    if (bgAmbience) bgAmbience.loop = true;

    const team1 = random(1, 10);
    let team2 = random(1, 10);
    while (team2 === team1) team2 = random(1, 10);

    // Presentación
    await audio.play(`bw_intro${random(1, 3)}`, 0, 0, true);
    await audio.play(`bw_team_${team1}_1`, 0, 0, true);
    await audio.play('bw_vs', 0, 0, true);
    await audio.play(`bw_team_${team2}_2`, 0, 0, true);

    let turn = team1;

    // Tanda de penaltis
    while (this.st1 < 5 && this.st2 < 5) {
      await audio.play('bw_turn', 0, 0, true);
      await audio.play(`bw_team_${turn}_2`, 0, 0, true);

      if (turn === team1) {
        // Tiro del jugador
        await audio.play('bw_where', 0, 0, true);
        const choice = await this.waitForAim();
        const saving = random(1, 3);

        let pan = choice === 1 ? -0.8 : (choice === 3 ? 0.8 : 0);
        await audio.play(`bw_chuta${random(1, 4)}`, pan);
        await sleep(220);

        let savePan = saving === 1 ? -0.8 : (saving === 3 ? 0.8 : 0);
        if (choice === saving) {
          await audio.play(`bw_parar${random(1, 3)}`, savePan);
          await sleep(300);
          await audio.play(`bw_paradon${random(1, 3)}`);
          await audio.play(`bw_mal${random(1, 3)}`, 0, 0, true);
        } else {
          await audio.play(`bw_portero${random(1, 2)}`, savePan);
          await sleep(200);
          this.st1++;
          await audio.play(`bw_sgol${random(1, 7)}`);
          await audio.play(`bw_gol${random(1, 6)}`, 0, 0, true);

          await audio.play(`bw_marc${random(1, 3)}`, 0, 0, true);
          await audio.play(`bw_team_${team1}_2`, 0, 0, true);
          await audio.play(`bw_${this.st1}_1`, 0, 0, true);
          await audio.play(`bw_team_${team2}_1`, 0, 0, true);
          await audio.play(`bw_${this.st2}_2`, 0, 0, true);
        }
        turn = team2;
      } else {
        // Atajada del jugador
        await audio.play('bw_dwhere', 0, 0, true);
        const choice = await this.waitForAim();

        await audio.play(`bw_prepara${random(1, 4)}`, 0, 0, true);
        await sleep(random(1500, 2500));

        const kickDir = random(1, 3);
        let kickPan = kickDir === 1 ? -0.8 : (kickDir === 3 ? 0.8 : 0);
        await audio.play(`bw_chuta${random(1, 4)}`, kickPan);
        await sleep(220);

        let blockPan = choice === 1 ? -0.8 : (choice === 3 ? 0.8 : 0);
        if (choice === kickDir) {
          await audio.play(`bw_parar${random(1, 3)}`, blockPan);
          await sleep(300);
          await audio.play(`bw_paradon${random(1, 3)}`);
          await audio.play(`bw_mal${random(1, 3)}`, 0, 0, true);
        } else {
          await audio.play(`bw_portero${random(1, 2)}`, blockPan);
          await sleep(200);
          this.st2++;
          await audio.play(`bw_sgol${random(1, 7)}`);
          await audio.play(`bw_gol${random(1, 6)}`, 0, 0, true);

          await audio.play(`bw_marc${random(1, 3)}`, 0, 0, true);
          await audio.play(`bw_team_${team1}_2`, 0, 0, true);
          await audio.play(`bw_${this.st1}_1`, 0, 0, true);
          await audio.play(`bw_team_${team2}_1`, 0, 0, true);
          await audio.play(`bw_${this.st2}_2`, 0, 0, true);
        }
        turn = team1;
      }
    }

    // Fin del partido
    if (bgAmbience) bgAmbience.stop();

    const winnerTeam = this.st1 > this.st2 ? team1 : team2;

    await audio.play('bw_ganador', 0, 0, true);

    const winMusic = await audio.play('bw_ganar', 0, 0, false);
    if (winMusic) winMusic.loop = true;

    await audio.play(`bw_team_${winnerTeam}_1`, 0, 0, true);

    if (winMusic) {
      await sleep(3000);
      winMusic.stop();
    }

    this.isPlaying = false;
    onGameEnd();
  }
}

// ==========================================
// 4. INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  const appContainer = document.getElementById('app-container');

  const game = new FootballGame();
  const menu = new GameMenu(async () => {
    // Pasar el foco al contenedor del juego para que el lector no moleste durante el partido
    appContainer.focus();
    await game.start(() => {
      menu.show();
    });
  });
});