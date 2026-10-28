const harmonicInput = document.getElementById("harmonic-count");
const harmonicStepButtons = document.querySelectorAll("[data-harmonic-step]");
const timeDomainPlot = document.getElementById("time-domain-plot");
const frequencyDomainPlot = document.getElementById("frequency-domain-plot");
const motionToggle = document.getElementById("signal-motion-toggle");
const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
const signalLab = document.querySelector(".signal-lab");
const homeIntro = document.querySelector(".home-intro");
const homeShell = document.querySelector(".site-shell");
const homeColumn = document.querySelector(".content-column");

const BRAILLE_BITS = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
];
const BRAILLE_BLANK = String.fromCharCode(0x2800);
const VISUAL_PLOT_PADDING = 14;
const TAU = 2 * Math.PI;
const WAVE_SCROLL_SECONDS = 10;
const TARGET_FRAME_INTERVAL = 1000 / 30;
const minHarmonicValue = 1;
const maxHarmonicValue = 99;

const timeConfig = {
  cellsWide: 68 + VISUAL_PLOT_PADDING,
  periodCellsWide: 68,
  cellsHigh: 10,
  labelWidth: 4,
  rightPad: 5,
  yLimit: 1,
};

const frequencyConfig = {
  cellsWide: timeConfig.cellsWide + 1,
  cellsHigh: 9,
  labelWidth: 4,
  rightPad: 5,
};

function mapRange(value, inMin, inMax, outMin, outMax) {
  return outMin + ((value - inMin) * (outMax - outMin)) / (inMax - inMin);
}

function createPixelCanvas(width, height) {
  return Array.from({ length: height }, () => new Uint8Array(width));
}

function plotPixelWidth(config) {
  return config.cellsWide * 2 - 1;
}

function plotPixelHeight(config) {
  return config.cellsHigh * 4 - 1;
}

function writeText(line, col, text) {
  for (let i = 0; i < text.length; i += 1) {
    const targetCol = col + i;

    if (targetCol >= 0 && targetCol < line.length) {
      line[targetCol] = text[i];
    }
  }
}

function setPixel(canvas, x, y) {
  if (y < 0 || y >= canvas.length) {
    return;
  }

  if (x < 0 || x >= canvas[y].length) {
    return;
  }

  canvas[y][x] = 1;
}

function drawLine(canvas, startX, startY, endX, endY) {
  let x0 = startX;
  let y0 = startY;
  const x1 = endX;
  const y1 = endY;
  const deltaX = Math.abs(x1 - x0);
  const stepX = x0 < x1 ? 1 : -1;
  const deltaY = -Math.abs(y1 - y0);
  const stepY = y0 < y1 ? 1 : -1;
  let error = deltaX + deltaY;

  while (true) {
    setPixel(canvas, x0, y0);

    if (x0 === x1 && y0 === y1) {
      break;
    }

    const twiceError = 2 * error;

    if (twiceError >= deltaY) {
      error += deltaY;
      x0 += stepX;
    }

    if (twiceError <= deltaX) {
      error += deltaX;
      y0 += stepY;
    }
  }
}

function pixelCanvasToBrailleRows(canvas) {
  const rows = [];
  const pixelHeight = canvas.length;
  const pixelWidth = canvas[0].length;
  const charRows = Math.ceil(pixelHeight / 4);
  const charCols = Math.ceil(pixelWidth / 2);

  for (let charRow = 0; charRow < charRows; charRow += 1) {
    let line = "";

    for (let charCol = 0; charCol < charCols; charCol += 1) {
      let mask = 0;

      for (let dy = 0; dy < 4; dy += 1) {
        for (let dx = 0; dx < 2; dx += 1) {
          const x = charCol * 2 + dx;
          const y = charRow * 4 + dy;

          if (y < pixelHeight && x < pixelWidth && canvas[y][x]) {
            mask |= BRAILLE_BITS[dy][dx];
          }
        }
      }

      line += mask === 0 ? BRAILLE_BLANK : String.fromCharCode(0x2800 + mask);
    }

    rows.push(line);
  }

  return rows;
}

function renderLabeledRows(title, plotRows, config, labels, footerEntries) {
  const output = title ? [title] : [];
  const labelLookup = new Map(labels);
  const prefixWidth = config.labelWidth + 1;
  const plotWidth = plotRows.reduce(
    (maxWidth, row) => Math.max(maxWidth, Array.from(row).length),
    0,
  ) || config.cellsWide;

  for (let rowIndex = 0; rowIndex < plotRows.length; rowIndex += 1) {
    const label = labelLookup.get(rowIndex) ?? "";
    output.push(`${label.padStart(config.labelWidth, " ")} ${plotRows[rowIndex]}`);
  }

  const footer = Array(prefixWidth + plotWidth + config.rightPad).fill(" ");

  for (const [column, text] of footerEntries) {
    writeText(footer, prefixWidth + column, text);
  }

  output.push(footer.join("").replace(/\s+$/, ""));
  return output.join("\n");
}

function squareWaveHarmonics(harmonicLimit) {
  const harmonics = [];

  for (let harmonic = 1; harmonic <= harmonicLimit; harmonic += 2) {
    harmonics.push(harmonic);
  }

  return harmonics;
}

function createSquareWaveSignal(harmonicLimit) {
  return {
    harmonicLimit,
    activeHarmonics: squareWaveHarmonics(harmonicLimit),
  };
}

function partialSquareWaveValue(time, signal) {
  let value = 0;

  for (const harmonic of signal.activeHarmonics) {
    value += Math.sin(harmonic * time) / harmonic;
  }

  return value;
}

function frequencyStemColumn(harmonic, width, harmonicLimit = 19) {
  const firstColumn = 4;
  const lastColumn = width - 3;

  return Math.round(
    mapRange(harmonic, 1, harmonicLimit, firstColumn, lastColumn),
  );
}

function composeTimeRows(waveRows, xAxisRow) {
  return waveRows.map((row, rowIndex) => {
    if (rowIndex === xAxisRow) {
      return `|${"-".repeat(timeConfig.cellsWide)} t`;
    }

    return `|${row}`;
  });
}

function renderTimeDomain(signal, phase = 0) {
  const pixelWidth = plotPixelWidth(timeConfig);
  const pixelHeight = plotPixelHeight(timeConfig);
  const canvas = createPixelCanvas(pixelWidth, pixelHeight);
  const yLimit = timeConfig.yLimit;
  const xAxisY = Math.round(mapRange(0, -yLimit, yLimit, pixelHeight - 1, 0));
  const xAxisRow = Math.floor(xAxisY / 4);
  const periodPixels = (timeConfig.periodCellsWide - 1) * 2;
  const displayedPeriods = (pixelWidth - 1) / periodPixels;
  const sampleCount = Math.max(
    pixelWidth,
    Math.ceil(signal.harmonicLimit * 8 * displayedPeriods) + 1,
  );
  let previousPoint = null;

  for (let sample = 0; sample < sampleCount; sample += 1) {
    const position = sample / (sampleCount - 1);
    const pixelColumn = Math.round(position * (pixelWidth - 1));
    const time = TAU * position * displayedPeriods + phase;
    const value = partialSquareWaveValue(time, signal);
    const pixelRow = Math.round(
      mapRange(value, -yLimit, yLimit, pixelHeight - 1, 0),
    );

    if (previousPoint) {
      drawLine(canvas, previousPoint.x, previousPoint.y, pixelColumn, pixelRow);
    }

    previousPoint = { x: pixelColumn, y: pixelRow };
  }

  const waveRows = pixelCanvasToBrailleRows(canvas);
  const signalWidth = timeConfig.periodCellsWide;
  const piLabel = "pi";
  const twoPiLabel = "2pi";
  const piColumn =
    1 + Math.round((signalWidth - 1) / 2) - Math.floor(piLabel.length / 2);
  const twoPiColumn = signalWidth - Math.floor(twoPiLabel.length / 2);
  const rows = composeTimeRows(waveRows, xAxisRow);
  const labels = [
    [0, "1"],
    [xAxisRow, "0"],
    [timeConfig.cellsHigh - 1, "-1"],
  ];
  const footerEntries = [
    [0, "0"],
    [piColumn, piLabel],
    [twoPiColumn, twoPiLabel],
  ];

  timeDomainPlot.textContent = renderLabeledRows(
    "",
    rows,
    timeConfig,
    labels,
    footerEntries,
  );
}

function renderFrequencyDomain(activeHarmonics) {
  const harmonicLimit = Math.max(19, activeHarmonics.at(-1));
  const frequencyHarmonics = squareWaveHarmonics(harmonicLimit);
  const width = frequencyConfig.cellsWide;
  const height = frequencyConfig.cellsHigh;
  const baselineRow = height - 1;
  const rows = Array.from({ length: height }, () => Array(width).fill(" "));

  for (let row = 0; row < height; row += 1) {
    rows[row][0] = "|";
  }

  for (let column = 1; column < width; column += 1) {
    rows[baselineRow][column] = "-";
  }

  for (const harmonic of frequencyHarmonics) {
    const column = frequencyStemColumn(harmonic, width, harmonicLimit);

    if (activeHarmonics.includes(harmonic)) {
      const stemHeight = Math.max(1, Math.round((baselineRow * 4) / harmonic));

      for (let offset = 1; offset <= stemHeight; offset += 1) {
        const pixelRow = baselineRow * 4 - offset;
        const row = Math.floor(pixelRow / 4);
        const cell = rows[row][column];
        const mask = cell === " " ? 0 : cell.charCodeAt(0) - 0x2800;
        rows[row][column] = String.fromCharCode(
          0x2800 + (mask | BRAILLE_BITS[pixelRow % 4][0]),
        );
      }
    }
  }

  const plotRows = rows.map((row, rowIndex) =>
    rowIndex === baselineRow ? `${row.join("")} f` : row.join(""),
  );
  const labels = [
    [0, "1"],
    [frequencyConfig.cellsHigh - 1, "0"],
  ];
  const labelStride = Math.ceil(frequencyHarmonics.length / 10);
  const labeledHarmonics = frequencyHarmonics.filter(
    (_, index) => index % labelStride === 0,
  );

  if (labeledHarmonics.at(-1) !== harmonicLimit) {
    const lastLabel = labeledHarmonics.at(-1);
    if (
      frequencyStemColumn(harmonicLimit, width, harmonicLimit) -
        frequencyStemColumn(lastLabel, width, harmonicLimit) < 4
    ) {
      labeledHarmonics.pop();
    }
    labeledHarmonics.push(harmonicLimit);
  }

  const footerEntries = labeledHarmonics.map((harmonic) => {
    const label = String(harmonic);
    const column =
      frequencyStemColumn(harmonic, width, harmonicLimit) -
      Math.floor(label.length / 2);
    return [column, label];
  });

  frequencyDomainPlot.textContent = renderLabeledRows(
    "",
    plotRows,
    frequencyConfig,
    labels,
    footerEntries,
  );
}

let activeSignal = null;
let animationPhase = 0;
let previousAnimationTime = null;
let lastFrameTime = 0;
let animationFrameId = null;
let animationPaused = motionPreference.matches;
let plotsFit = false;
let layoutFrameId = null;

function clampHarmonicValue(harmonicValue) {
  const clampedHarmonic = Math.max(
    minHarmonicValue,
    Math.min(maxHarmonicValue, harmonicValue),
  );

  return clampedHarmonic % 2 === 0 ? clampedHarmonic - 1 : clampedHarmonic;
}

function harmonicValueFromInput(value) {
  const text = value.trim();
  if (!/^[+-]?\d+$/.test(text)) {
    return null;
  }
  const harmonicValue = Number(text);

  if (!Number.isFinite(harmonicValue)) {
    return null;
  }

  return clampHarmonicValue(harmonicValue);
}

function updateHarmonicButtons(harmonicLimit) {
  harmonicStepButtons.forEach((button) => {
    const step = Number(button.dataset.harmonicStep);
    button.disabled =
      harmonicLimit + step < minHarmonicValue ||
      harmonicLimit + step > maxHarmonicValue;
  });
}

function renderHarmonicLimit(harmonicLimit) {
  const resolvedHarmonicLimit = clampHarmonicValue(harmonicLimit);
  const signal = createSquareWaveSignal(resolvedHarmonicLimit);

  activeSignal = signal;
  harmonicInput.setAttribute("aria-valuenow", String(resolvedHarmonicLimit));
  timeDomainPlot.setAttribute(
    "aria-label",
    `Time-domain plot of a Fourier series through odd harmonic ${resolvedHarmonicLimit}`,
  );
  frequencyDomainPlot.setAttribute(
    "aria-label",
    `Frequency-domain plot of odd harmonics 1 through ${resolvedHarmonicLimit}, with amplitudes 1/n`,
  );
  updateHarmonicButtons(resolvedHarmonicLimit);
  renderTimeDomain(activeSignal, animationPhase);
  renderFrequencyDomain(signal.activeHarmonics);
}

function render() {
  const harmonicLimit = harmonicValueFromInput(harmonicInput.value);

  if (harmonicLimit === null) {
    return;
  }

  renderHarmonicLimit(harmonicLimit);
}

function commitHarmonicInput() {
  const harmonicLimit =
    harmonicValueFromInput(harmonicInput.value) ??
    activeSignal?.harmonicLimit ??
    minHarmonicValue;
  harmonicInput.value = String(harmonicLimit);
  renderHarmonicLimit(harmonicLimit);
}

function stepHarmonicInput(step) {
  const harmonicLimit =
    harmonicValueFromInput(harmonicInput.value) ??
    activeSignal?.harmonicLimit ??
    minHarmonicValue;
  const nextHarmonicLimit = clampHarmonicValue(harmonicLimit + step);

  harmonicInput.value = String(nextHarmonicLimit);
  renderHarmonicLimit(nextHarmonicLimit);
}

function animateTimeDomain(timestamp) {
  if (previousAnimationTime === null) {
    previousAnimationTime = timestamp;
  }

  const elapsed = Math.min(timestamp - previousAnimationTime, 100);
  previousAnimationTime = timestamp;
  animationPhase =
    (animationPhase + (elapsed / 1000) * (TAU / WAVE_SCROLL_SECONDS)) % TAU;

  if (timestamp - lastFrameTime >= TARGET_FRAME_INTERVAL) {
    renderTimeDomain(activeSignal, animationPhase);
    lastFrameTime = timestamp;
  }

  animationFrameId = requestAnimationFrame(animateTimeDomain);
}

function updateAnimation() {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  previousAnimationTime = null;
  lastFrameTime = 0;
  motionToggle.textContent = animationPaused ? "play" : "pause";
  motionToggle.setAttribute(
    "aria-label",
    animationPaused ? "Play waveform animation" : "Pause waveform animation",
  );

  if (!animationPaused && !document.hidden && plotsFit) {
    animationFrameId = requestAnimationFrame(animateTimeDomain);
  }
}

function updateHomeLayout() {
  const shellStyle = getComputedStyle(homeShell);
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
  const availableHeight =
    viewportHeight -
    parseFloat(shellStyle.paddingTop) -
    parseFloat(shellStyle.paddingBottom);
  const sectionGap = parseFloat(getComputedStyle(homeColumn).rowGap);
  const contentHeight = homeIntro.offsetHeight + sectionGap + signalLab.offsetHeight;
  const fitsHorizontally = [timeDomainPlot, frequencyDomainPlot].every((plot) => {
    const bounds = plot.getBoundingClientRect();
    return (
      plot.scrollWidth <= plot.clientWidth + 1 &&
      bounds.left >= 0 &&
      bounds.right <= viewportWidth
    );
  });
  const fits = contentHeight <= availableHeight - 1 && fitsHorizontally;

  if (plotsFit !== fits) {
    plotsFit = fits;
    document.body.classList.toggle("has-signal", fits);
    signalLab.inert = !fits;
    updateAnimation();
  }
}

function scheduleHomeLayout() {
  if (layoutFrameId !== null) {
    return;
  }
  layoutFrameId = requestAnimationFrame(() => {
    layoutFrameId = null;
    updateHomeLayout();
  });
}

harmonicInput.addEventListener("input", render);
harmonicInput.addEventListener("blur", commitHarmonicInput);
harmonicInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    commitHarmonicInput();
    harmonicInput.blur();
  } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    event.preventDefault();
    stepHarmonicInput(event.key === "ArrowUp" ? 2 : -2);
  }
});
harmonicStepButtons.forEach((button) => {
  button.addEventListener("click", () => {
    stepHarmonicInput(Number(button.dataset.harmonicStep));
  });
});
motionToggle.addEventListener("click", () => {
  animationPaused = !animationPaused;
  updateAnimation();
});
motionPreference.addEventListener("change", () => {
  animationPaused = motionPreference.matches;
  updateAnimation();
});
document.addEventListener("visibilitychange", updateAnimation);
window.addEventListener("resize", scheduleHomeLayout);
window.visualViewport?.addEventListener("resize", scheduleHomeLayout);
const layoutObserver = new ResizeObserver(scheduleHomeLayout);
[homeIntro, signalLab, homeShell, homeColumn].forEach((element) => {
  layoutObserver.observe(element);
});
document.fonts.ready.then(scheduleHomeLayout);
commitHarmonicInput();
updateHomeLayout();
updateAnimation();
