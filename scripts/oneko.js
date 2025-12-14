(function oneko() {
  const isReducedMotion =
    window.matchMedia(`(prefers-reduced-motion: reduce)`) === true ||
    window.matchMedia(`(prefers-reduced-motion: reduce)`).matches === true;

  if (isReducedMotion) return;

  const nekoEl = document.createElement("div");

  let nekoPosX = 32;
  let nekoPosY = 32;

  let mousePosX = 0;
  let mousePosY = 0;

  let frameCount = 0;
  let idleTime = 0;
  let idleAnimation = null;
  let idleAnimationFrame = 0;

  const nekoSpeed = 10;
  const spriteSets = {
    idle: [[-3, -3]],
    alert: [[-7, -3]],
    scratchSelf: [
      [-5, 0], [-6, 0], [-7, 0],
    ],
    scratchWallN: [
      [0, 0], [0, -1],
    ],
    scratchWallS: [
      [-7, -1], [-6, -2],
    ],
    scratchWallE: [
      [-2, -2], [-2, -3],
    ],
    scratchWallW: [
      [-4, 0], [-4, -1],
    ],
    tired: [[-3, -2]],
    sleeping: [
      [-2, 0], [-2, -1],
    ],
    N: [
      [-1, -2], [-1, -3],
    ],
    NE: [
      [0, -2], [0, -3],
    ],
    E: [
      [-3, 0], [-3, -1],
    ],
    SE: [
      [-5, -1], [-5, -2],
    ],
    S: [
      [-6, -3], [-7, -2],
    ],
    SW: [
      [-5, -3], [-6, -1],
    ],
    W: [
      [-4, -2], [-4, -3],
    ],
    NW: [
      [-1, 0], [-1, -1],
    ],
  };

  let isActive = false;

  function prepareElement() {
    nekoEl.id = "oneko";
    nekoEl.ariaHidden = true;
    nekoEl.style.width = "32px";
    nekoEl.style.height = "32px";
    nekoEl.style.position = "absolute"; // FIX 1: Absolute positioning
    nekoEl.style.pointerEvents = "auto";
    nekoEl.style.imageRendering = "pixelated";
    nekoEl.style.left = `${nekoPosX - 16}px`;
    nekoEl.style.top = `${nekoPosY - 16}px`;
    nekoEl.style.zIndex = "9999"; // High z-index to sit above everything
    nekoEl.style.visibility = 'hidden';

    let nekoFile = "assets/eevee.png";
    const curScript = document.currentScript;
    if (curScript && curScript.dataset.cat) {
      nekoFile = curScript.dataset.cat;
    }
    nekoEl.style.backgroundImage = `url(${nekoFile})`;
    nekoEl.style.backgroundRepeat = 'no-repeat';
    const initialSleeping = spriteSets.sleeping[0];
    nekoEl.style.backgroundPosition = `${initialSleeping[0] * 32}px ${initialSleeping[1] * 32}px`;
  }

  function init() {
    // FIX 2: Track mouse relative to the PAGE (document), not the screen
    document.addEventListener("mousemove", function (event) {
      mousePosX = event.pageX; 
      mousePosY = event.pageY;
    });

    const navbar = document.querySelector('.top-nav');
    if (navbar) {
      const rect = navbar.getBoundingClientRect();
      nekoPosX = rect.left + 15;
      nekoPosY = rect.top + (rect.height / 2) - 5;

      nekoEl.style.left = `${nekoPosX - 16}px`;
      nekoEl.style.top = `${nekoPosY - 16}px`;
    }

    document.body.appendChild(nekoEl);
    setSprite("sleeping", 0);

    setTimeout(() => {
      nekoEl.style.visibility = 'visible';
    }, 0);

    nekoEl.addEventListener('click', (e) => {
      isActive = true;
      e.stopPropagation();
    });

    window.requestAnimationFrame(onAnimationFrame);
  }

  if (document.readyState === 'loading') {
    prepareElement();
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    prepareElement();
    init();
  }

  let lastFrameTimestamp;

  function onAnimationFrame(timestamp) {
    if (!nekoEl.isConnected) {
      return;
    }
    if (!lastFrameTimestamp) {
      lastFrameTimestamp = timestamp;
    }
    if (timestamp - lastFrameTimestamp > 100) {
      lastFrameTimestamp = timestamp;
      frame();
    }
    window.requestAnimationFrame(onAnimationFrame);
  }

  function setSprite(name, frame) {
    const sprite = spriteSets[name][frame % spriteSets[name].length];
    nekoEl.style.backgroundPosition = `${sprite[0] * 32}px ${sprite[1] * 32}px`;
  }

  function resetIdleAnimation() {
    idleAnimation = null;
    idleAnimationFrame = 0;
  }

  function idle() {
    idleTime += 1;

    if (
      idleTime > 10 &&
      Math.floor(Math.random() * 200) == 0 &&
      idleAnimation == null
    ) {
      let avalibleIdleAnimations = ["sleeping", "scratchSelf"];
      if (nekoPosX < 32) {
        avalibleIdleAnimations.push("scratchWallW");
      }
      if (nekoPosY < 32) {
        avalibleIdleAnimations.push("scratchWallN");
      }
      // FIX 3: Check against document width, not window width
      if (nekoPosX > document.documentElement.scrollWidth - 32) {
        avalibleIdleAnimations.push("scratchWallE");
      }
      if (nekoPosY > document.documentElement.scrollHeight - 32) {
        avalibleIdleAnimations.push("scratchWallS");
      }
      idleAnimation =
        avalibleIdleAnimations[
          Math.floor(Math.random() * avalibleIdleAnimations.length)
        ];
    }

    switch (idleAnimation) {
      case "sleeping":
        if (idleAnimationFrame < 8) {
          setSprite("tired", 0);
          break;
        }
        setSprite("sleeping", Math.floor(idleAnimationFrame / 4));
        if (idleAnimationFrame > 192) {
          resetIdleAnimation();
        }
        break;
      case "scratchWallN":
      case "scratchWallS":
      case "scratchWallE":
      case "scratchWallW":
      case "scratchSelf":
        setSprite(idleAnimation, idleAnimationFrame);
        if (idleAnimationFrame > 9) {
          resetIdleAnimation();
        }
        break;
      default:
        setSprite("idle", 0);
        return;
    }
    idleAnimationFrame += 1;
  }

  function frame() {
    frameCount += 1;
    const diffX = nekoPosX - mousePosX;
    const diffY = nekoPosY - mousePosY;
    const distance = Math.sqrt(diffX ** 2 + diffY ** 2);

    if (!isActive) {
      setSprite("sleeping", Math.floor(frameCount / 4));
      return;
    }

    if (distance < nekoSpeed || distance < 48) {
      idle();
      return;
    }

    idleAnimation = null;
    idleAnimationFrame = 0;

    if (idleTime > 1) {
      setSprite("alert", 0);
      idleTime = Math.min(idleTime, 7);
      idleTime -= 1;
      return;
    }

    let direction;
    direction = diffY / distance > 0.5 ? "N" : "";
    direction += diffY / distance < -0.5 ? "S" : "";
    direction += diffX / distance > 0.5 ? "W" : "";
    direction += diffX / distance < -0.5 ? "E" : "";
    setSprite(direction, frameCount);

    nekoPosX -= (diffX / distance) * nekoSpeed;
    nekoPosY -= (diffY / distance) * nekoSpeed;

    // FIX 4: Clamp position to the PAGE size, not the WINDOW size
    const limitX = document.documentElement.scrollWidth - 16;
    const limitY = document.documentElement.scrollHeight - 16;
    
    nekoPosX = Math.min(Math.max(16, nekoPosX), limitX);
    nekoPosY = Math.min(Math.max(16, nekoPosY), limitY);

    nekoEl.style.left = `${nekoPosX - 16}px`;
    nekoEl.style.top = `${nekoPosY - 16}px`;
  }
})();