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

let audioCtx = null;
let audioStartTime = 0;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
        audioStartTime = audioCtx.currentTime;
    }
}

async function run() {
    await init()
    let gb = new wasm.GB()

    document.getElementById("fileinput").addEventListener("change", function (e) {
        // stop prev game from rendering, if one exists
        if (anim_frame != 0) {
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
            gb.load_rom(rom)
            let title = gb.get_title()
            document.title = title

            initAudio()
            mainloop(gb)
        }

        fr.readAsArrayBuffer(file)
    }, false)

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
    let ticks = fast_forward ? 4 : 1;
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