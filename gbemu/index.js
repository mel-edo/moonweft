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
let current_session_id = 0
let save_timer = 0
const SAVE_INTERVAL_MS = 3000

// Display timing synchronization
const TARGET_FPS = 59.73;
const FRAME_DURATION_MS = 1000 / TARGET_FPS; // ~16.74 ms
let last_frame_time = 0;
let time_accumulator = 0;

let audioCtx = null;
let audioStartTime = 0;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
    }
    if (audioCtx.state === "suspended") {
        audioCtx.resume().catch(console.warn);
    }
    audioStartTime = audioCtx.currentTime;
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

// Centralized ROM loader that prevents duplicate/overlapping instances
function loadRom(romBufferPromise, romTitleHint, activeBtn) {
    const sessionId = ++current_session_id;

    // Unfocus any element so Enter / Space don't trigger buttons
    if (document.activeElement && typeof document.activeElement.blur === "function") {
        document.activeElement.blur();
    }

    // Stop current animation loop immediately
    if (anim_frame !== 0) {
        window.cancelAnimationFrame(anim_frame);
        anim_frame = 0;
    }

    // Flush battery save of previous game before replacing
    if (current_gb) {
        flushSave(current_gb);
        current_gb = null;
    }

    // Reset frame pacing timers
    last_frame_time = 0;
    time_accumulator = 0;

    // Update active button indicator
    document.querySelectorAll(".rom-btn").forEach(b => b.classList.remove("active"));
    if (activeBtn) activeBtn.classList.add("active");

    const uploadLabel = document.querySelector(".custom-file-upload");
    if (uploadLabel && romTitleHint) {
        uploadLabel.innerText = "LOADING...";
    }

    // Reset canvas display
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    Promise.resolve(romBufferPromise)
        .then(buffer => {
            // Discard if another game load was initiated while waiting
            if (sessionId !== current_session_id) {
                return;
            }

            const rom = new Uint8Array(buffer);
            const gb = new wasm.GB();
            gb.load_rom(rom);
            loadSave(gb);
            current_gb = gb;

            const title = gb.get_title();
            document.title = title || "emulator ~ moonweft";

            if (uploadLabel) {
                const displayTitle = title || romTitleHint || "GAME BOY";
                uploadLabel.innerText = displayTitle.length > 15 ? displayTitle.substring(0, 15) + "..." : displayTitle;
            }

            save_timer = 0;
            initAudio();
            audioStartTime = audioCtx ? audioCtx.currentTime : 0;
            last_frame_time = performance.now();
            time_accumulator = 0;

            mainloop(gb, sessionId);
        })
        .catch(err => {
            if (sessionId === current_session_id) {
                console.error("Failed to load ROM:", err);
                if (uploadLabel) uploadLabel.innerText = "LOAD FAILED";
            }
        });
}

// Game key set for input filtering
const GAME_KEYS = new Set([
    "ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft",
    "w", "W", "s", "S", "a", "A", "d", "D",
    "Enter", "Backspace", " ", "Tab",
    "x", "X", "z", "Z", "k", "K", "j", "J",
    "Shift"
]);

async function run() {
    await init();

    // File input loader
    const fileinput = document.getElementById("fileinput");
    fileinput.addEventListener("change", function (e) {
        this.blur();
        if (document.activeElement && typeof document.activeElement.blur === "function") {
            document.activeElement.blur();
        }

        const file = e.target.files[0];
        if (!file) return;

        const fr = new FileReader();
        const filePromise = new Promise((resolve, reject) => {
            fr.onload = () => resolve(fr.result);
            fr.onerror = reject;
        });
        fr.readAsArrayBuffer(file);

        loadRom(filePromise, file.name, null);
        this.value = "";
    }, false);

    // Built-in ROM buttons
    document.querySelectorAll(".rom-btn").forEach(btn => {
        btn.addEventListener("click", function (e) {
            e.preventDefault();
            this.blur();
            if (document.activeElement && typeof document.activeElement.blur === "function") {
                document.activeElement.blur();
            }

            const romUrl = this.dataset.rom;
            if (!romUrl) return;

            const titleHint = this.closest("li")?.querySelector(".rom-title")?.innerText || "";
            const fetchPromise = fetch(romUrl).then(r => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.arrayBuffer();
            });

            loadRom(fetchPromise, titleHint, this);
        });
    });

    // Keyboard controls
    document.addEventListener("keydown", function (e) {
        if (GAME_KEYS.has(e.key)) {
            // Prevent browser default actions (such as Enter/Space clicking focused buttons or arrows scrolling)
            e.preventDefault();
            if (document.activeElement && typeof document.activeElement.blur === "function") {
                document.activeElement.blur();
            }
        }
        if (e.key === "Shift") { fast_forward = true; return; }
        if (current_gb) current_gb.press_button(e, true);
    });

    document.addEventListener("keyup", function (e) {
        if (GAME_KEYS.has(e.key)) {
            e.preventDefault();
        }
        if (e.key === "Shift") { fast_forward = false; return; }
        if (current_gb) current_gb.press_button(e, false);
    });

    // On-screen Game Boy controls
    const bindBtn = (selector, btnName) => {
        const el = document.querySelector(selector);
        if (!el) return;
        const press = (e) => {
            e.preventDefault();
            if (current_gb) current_gb.press_btn(btnName, true);
        };
        const release = (e) => {
            e.preventDefault();
            if (current_gb) current_gb.press_btn(btnName, false);
        };
        el.addEventListener("mousedown", press);
        el.addEventListener("mouseup", release);
        el.addEventListener("mouseleave", release);
        el.addEventListener("touchstart", press, { passive: false });
        el.addEventListener("touchend", release, { passive: false });
    };

    bindBtn(".arr-up", "up");
    bindBtn(".arr-down", "down");
    bindBtn(".arr-left", "left");
    bindBtn(".arr-right", "right");
    bindBtn(".btn-a", "a");
    bindBtn(".btn-b", "b");

    document.querySelectorAll(".sys-btn-wrapper").forEach(wrapper => {
        const label = wrapper.querySelector(".sys-label")?.innerText.trim();
        const btnName = label === "ENTER" ? "start" : "select";
        const btnEl = wrapper.querySelector(".sys-btn") || wrapper;
        const press = (e) => {
            e.preventDefault();
            if (current_gb) current_gb.press_btn(btnName, true);
        };
        const release = (e) => {
            e.preventDefault();
            if (current_gb) current_gb.press_btn(btnName, false);
        };
        btnEl.addEventListener("mousedown", press);
        btnEl.addEventListener("mouseup", release);
        btnEl.addEventListener("mouseleave", release);
        btnEl.addEventListener("touchstart", press, { passive: false });
        btnEl.addEventListener("touchend", release, { passive: false });
    });
}

function runGbFrame(gb) {
    while (true) {
        let draw_time = gb.tick();
        if (draw_time) {
            gb.draw_screen();
            if (SCALE != 1) {
                let ctx = canvas.getContext("2d");
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(canvas, 0, 0, WIDTH, HEIGHT, 0, 0, canvas.width, canvas.height);
            }

            let samples = gb.get_audio_samples();
            if (!fast_forward && samples.length > 0 && audioCtx) {
                if (audioCtx.state === "suspended") {
                    audioCtx.resume().catch(console.warn);
                }
                let numFrames = samples.length / 2;
                let buffer = audioCtx.createBuffer(2, numFrames, 44100);
                let leftChannel = buffer.getChannelData(0);
                let rightChannel = buffer.getChannelData(1);

                for (let i = 0; i < numFrames; i++) {
                    leftChannel[i] = samples[i * 2];
                    rightChannel[i] = samples[i * 2 + 1];
                }

                let source = audioCtx.createBufferSource();
                source.buffer = buffer;
                source.connect(audioCtx.destination);

                if (audioStartTime < audioCtx.currentTime || audioStartTime > audioCtx.currentTime + 0.1) {
                    audioStartTime = audioCtx.currentTime + 0.02;
                }

                source.start(audioStartTime);
                audioStartTime += buffer.duration;
            }
            break;
        }
    }
}

function mainloop(gb, sessionId, timestamp) {
    // Terminate immediately if a newer game session has taken over or this instance is stale
    if (sessionId !== current_session_id || gb !== current_gb) {
        return;
    }

    if (!timestamp) {
        timestamp = performance.now();
    }

    if (last_frame_time === 0) {
        last_frame_time = timestamp;
    }

    let delta = timestamp - last_frame_time;
    last_frame_time = timestamp;

    // Prevent catch-up spikes if tab was backgrounded or lagged
    if (delta > 100) delta = 100;
    if (delta < 0) delta = 0;

    if (fast_forward) {
        for (let i = 0; i < 4; i++) {
            runGbFrame(gb);
        }
        time_accumulator = 0;
    } else {
        time_accumulator += delta;

        // Run frame when accumulator passes threshold (~15.0ms)
        // This ensures 1 frame per tick on 60Hz displays and 1 frame every 2 ticks on 120Hz displays
        let frames_run = 0;
        while (time_accumulator >= 15.0 && frames_run < 2) {
            runGbFrame(gb);
            time_accumulator -= FRAME_DURATION_MS;
            frames_run++;
        }

        if (time_accumulator > FRAME_DURATION_MS) {
            time_accumulator = 0;
        } else if (time_accumulator < 0) {
            time_accumulator = 0;
        }
    }

    // Periodic save flush every SAVE_INTERVAL_MS
    save_timer += delta;
    if (save_timer >= SAVE_INTERVAL_MS) {
        save_timer = 0;
        flushSave(gb);
    }

    anim_frame = window.requestAnimationFrame((t) => { mainloop(gb, sessionId, t); });
}

run().catch(console.error)