import init, * as wasm from "./wasm.js"

const SCALE = 3
const WIDTH = 160
const HEIGHT = 144

let canvas = document.getElementById("canvas")
canvas.width = WIDTH * SCALE
canvas.height = HEIGHT * SCALE

let ctx = canvas.getContext("2d")
ctx.fillStyle = "#FFFFFF"
ctx.fillRect(0, 0, canvas.width, canvas.height)

let anim_frame = 0
let fast_forward = false
let current_gb = null
let save_timer = 0
const SAVE_INTERVAL_MS = 3000

let audioCtx = null;
let audioStartTime = 0;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
        audioStartTime = audioCtx.currentTime;
    }
}

// --- Save helpers ---

function saveKey(title) {
    return `gbsave:${title}`;
}

function loadSave(gb) {
    if (!gb.has_battery()) return;
    const key = saveKey(gb.get_title());
    const b64 = localStorage.getItem(key);
    if (!b64) return;
    try {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        gb.load_save_data(bytes);
        console.log(`[save] Loaded save for "${gb.get_title()}" (${bytes.length} bytes)`);
    } catch (e) {
        console.warn("[save] Failed to load save:", e);
    }
}

function flushSave(gb) {
    if (!gb || !gb.has_battery() || !gb.is_battery_dirty()) return;
    try {
        const data = gb.get_save_data();
        let binary = "";
        for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i]);
        const b64 = btoa(binary);
        const key = saveKey(gb.get_title());
        localStorage.setItem(key, b64);
        gb.clean_battery();
        console.log(`[save] Flushed save for "${gb.get_title()}" (${data.length} bytes)`);
    } catch (e) {
        console.warn("[save] Failed to flush save:", e);
    }
}

// Final save on page close
window.addEventListener("beforeunload", () => {
    if (current_gb) flushSave(current_gb);
});

// Also expose a manual save for the built-in ROM buttons
export function loadRomFromUrl(gb, url) {
    return fetch(url)
        .then(r => r.arrayBuffer())
        .then(buf => {
            const rom = new Uint8Array(buf);
            gb.load_rom(rom);
            loadSave(gb);
            current_gb = gb;
        });
}

async function run() {
    await init()
    let gb = new wasm.GB()

    document.getElementById("fileinput").addEventListener("change", function (e) {
        if (anim_frame != 0) {
            // Flush save for the previous game before switching
            if (current_gb) flushSave(current_gb);
            window.cancelAnimationFrame(anim_frame)
        }

        let file = e.target.files[0]
        if (!file) {
            alert("Failed to read file")
            return
        }

        let fr = new FileReader()
        fr.onload = function () {
            let buffer = fr.result
            const rom = new Uint8Array(buffer)
            gb = new wasm.GB()
            gb.load_rom(rom)
            loadSave(gb)
            current_gb = gb

            let title = gb.get_title()
            document.title = title

            save_timer = 0
            initAudio()
            mainloop(gb)
        }

        fr.readAsArrayBuffer(file)
    }, false)

    // Built-in ROM buttons
    document.querySelectorAll(".rom-btn").forEach(btn => {
        btn.addEventListener("click", function () {
            const romUrl = this.dataset.rom;
            if (!romUrl) return;

            if (anim_frame != 0) {
                if (current_gb) flushSave(current_gb);
                window.cancelAnimationFrame(anim_frame);
            }

            fetch(romUrl)
                .then(r => r.arrayBuffer())
                .then(buf => {
                    const rom = new Uint8Array(buf);
                    gb = new wasm.GB();
                    gb.load_rom(rom);
                    loadSave(gb);
                    current_gb = gb;

                    let title = gb.get_title();
                    document.title = title;

                    save_timer = 0;
                    initAudio();
                    mainloop(gb);
                })
                .catch(err => console.error("Failed to load ROM:", err));
        });
    });

    document.addEventListener("keydown", function (e) {
        if (e.key === "Shift") { fast_forward = true; return; }
        gb.press_button(e, true)
    })

    document.addEventListener("keyup", function (e) {
        if (e.key === "Shift") { fast_forward = false; return; }
        gb.press_button(e, false)
    })
}

function mainloop(gb) {
    const ticks = fast_forward ? 4 : 1;
    for (let t = 0; t < ticks; t++) {
        while (true) {
            let draw_time = gb.tick()
            if (draw_time) {
                if (t === ticks - 1) {
                    gb.draw_screen()
                    if (SCALE != 1) {
                        let ctx = canvas.getContext('2d')
                        ctx.imageSmoothingEnabled = false
                        ctx.drawImage(canvas, 0, 0, WIDTH, HEIGHT, 0, 0, canvas.width, canvas.height)
                    }
                }

                let samples = gb.get_audio_samples();
                if (!fast_forward && samples.length > 0 && audioCtx) {
                    let buffer = audioCtx.createBuffer(2, samples.length / 2, 44100);
                    let leftChannel = buffer.getChannelData(0);
                    let rightChannel = buffer.getChannelData(1);

                    for (let i = 0; i < samples.length / 2; i++) {
                        leftChannel[i] = samples[i * 2];
                        rightChannel[i] = samples[i * 2 + 1];
                    }

                    let source = audioCtx.createBufferSource();
                    source.buffer = buffer;
                    source.connect(audioCtx.destination);

                    if (audioStartTime < audioCtx.currentTime) {
                        audioStartTime = audioCtx.currentTime;
                    }

                    source.start(audioStartTime);
                    audioStartTime += buffer.duration;
                }
                break;
            }
        }
    }

    // Periodic save flush every SAVE_INTERVAL_MS
    save_timer += 16; // approximate ms per rAF
    if (save_timer >= SAVE_INTERVAL_MS) {
        save_timer = 0;
        flushSave(gb);
    }

    // If audio is too far ahead (e.g. > 50ms), wait before scheduling the next frame
    let delay = 0;
    if (!fast_forward && audioCtx && (audioStartTime - audioCtx.currentTime) > 0.05) {
        delay = Math.max(0, (audioStartTime - audioCtx.currentTime - 0.05) * 1000);
    }

    if (delay > 0) {
        setTimeout(() => {
            anim_frame = window.requestAnimationFrame(() => { mainloop(gb) })
        }, delay);
    } else {
        anim_frame = window.requestAnimationFrame(() => { mainloop(gb) })
    }
}

run().catch(console.error)