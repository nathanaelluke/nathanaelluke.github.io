const oddHarmonics = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

const harmonicInput = document.getElementById("harmonic-count");
const harmonicValue = document.getElementById("harmonic-value");
const harmonicSliderWrap = harmonicInput.parentElement;
const timeDomainPlot = document.getElementById("time-domain-plot");
const frequencyDomainPlot = document.getElementById("frequency-domain-plot");

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

const timeConfig = {
  cellsWide: 68,
  cellsHigh: 10,
  labelWidth: 4,
  rightPad: 5,
  yLimit: 1,
};

const frequencyConfig = {
  cellsWide: timeConfig.cellsWide + 1 + VISUAL_PLOT_PADDING,
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

function drawHorizontalLine(canvas, y, xStart, xEnd) {
  for (let x = Math.min(xStart, xEnd); x <= Math.max(xStart, xEnd); x += 1) {
    setPixel(canvas, x, y);
  }
}

function drawVerticalLine(canvas, x, yStart, yEnd) {
  for (let y = Math.min(yStart, yEnd); y <= Math.max(yStart, yEnd); y += 1) {
    setPixel(canvas, x, y);
  }
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

function partialSquareWave(termCount, sampleCount = 512) {
  const t = [];
  const y = new Array(sampleCount).fill(0);
  const activeHarmonics = oddHarmonics.slice(0, termCount);

  for (let i = 0; i < sampleCount; i += 1) {
    const time = ((2 * Math.PI) * i) / (sampleCount - 1);
    t.push(time);

    for (const harmonic of activeHarmonics) {
      y[i] += Math.sin(harmonic * time) / harmonic;
    }
  }

  return { t, y, activeHarmonics };
}

function partialSquareWaveValue(time, activeHarmonics) {
  let value = 0;

  for (const harmonic of activeHarmonics) {
    value += Math.sin(harmonic * time) / harmonic;
  }

  return value;
}

function frequencyStemColumn(harmonic, width) {
  const harmonicIndex = oddHarmonics.indexOf(harmonic);
  const firstColumn = 4;
  const lastColumn = width - 2;
  const columnStep = Math.floor((lastColumn - firstColumn) / (oddHarmonics.length - 1));

  return Math.min(lastColumn, firstColumn + harmonicIndex * columnStep);
}

function composeTimeRows(waveRows, xAxisRow, signalWidth) {
  return waveRows.map((row, rowIndex) => {
    if (rowIndex === xAxisRow) {
      const axisWidth = signalWidth + VISUAL_PLOT_PADDING;
      return `|${"-".repeat(axisWidth)} t`;
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

  let previousPoint = null;

  for (let pixelColumn = 0; pixelColumn < pixelWidth; pixelColumn += 1) {
    const time = (TAU * pixelColumn) / (pixelWidth - 1) + phase;
    const value = partialSquareWaveValue(time, signal.activeHarmonics);

    const pixelRow = Math.round(
      mapRange(value, -yLimit, yLimit, pixelHeight - 1, 0),
    );

    if (previousPoint) {
      drawLine(canvas, previousPoint.x, previousPoint.y, pixelColumn, pixelRow);
    }

    previousPoint = { x: pixelColumn, y: pixelRow };
  }

  const waveRows = pixelCanvasToBrailleRows(canvas);
  const signalWidth = timeConfig.cellsWide;
  const axisWidth = signalWidth + VISUAL_PLOT_PADDING;
  const piLabel = "pi";
  const twoPiLabel = "2pi";
  const piColumn = Math.round(axisWidth / 2 - piLabel.length / 2);
  const twoPiColumn = axisWidth - Math.floor(twoPiLabel.length / 2);
  const rows = composeTimeRows(waveRows, xAxisRow, signalWidth);
  const labels = [
    [0, "1"],
    [xAxisRow, "0"],
    [timeConfig.cellsHigh - 1, "-1"],
  ];
  const footerEntries = [
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
  const width = frequencyConfig.cellsWide;
  const height = frequencyConfig.cellsHigh;
  const baselineRow = height - 1;
  const stemChar = "⡇";
  const rows = Array.from({ length: height }, () => Array(width).fill(" "));

  for (let row = 0; row < height; row += 1) {
    rows[row][0] = "|";
  }

  for (let column = 1; column < width; column += 1) {
    rows[baselineRow][column] = "-";
  }

  for (const harmonic of oddHarmonics) {
    const column = frequencyStemColumn(harmonic, width);
    const stemHeight = Math.max(1, Math.round(mapRange(1 / harmonic, 0, 1, 1, height - 2)));

    if (activeHarmonics.includes(harmonic)) {
      const shiftedHalfStepLeft =
        harmonic === 7 || harmonic === 9 || harmonic === 11 || harmonic === 13;
      const shiftedHalfStepRight = harmonic === 15;
      const stemColumn = shiftedHalfStepLeft ? column - 1 : column;
      const stemGlyph = shiftedHalfStepLeft || shiftedHalfStepRight ? "⢸" : stemChar;

      for (let offset = 1; offset <= stemHeight; offset += 1) {
        rows[baselineRow - offset][stemColumn] = stemGlyph;
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
  const footerEntries = oddHarmonics.map((harmonic) => {
    const label = String(harmonic);
    const footerOffset =
      harmonic >= 15 ? 2 : harmonic === 11 || harmonic >= 13 ? 1 : 0;
    const column =
      frequencyStemColumn(harmonic, width) -
      Math.floor(label.length / 2) +
      footerOffset;
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

function render() {
  const termCount = Number(harmonicInput.value);
  const signal = partialSquareWave(termCount);
  const maxHarmonic = signal.activeHarmonics[signal.activeHarmonics.length - 1];
  const sliderMin = Number(harmonicInput.min);
  const sliderMax = Number(harmonicInput.max);
  const sliderRange = Math.max(1, sliderMax - sliderMin);
  const sliderPosition = ((termCount - sliderMin) / sliderRange) * 100;

  harmonicValue.textContent = String(maxHarmonic);
  harmonicSliderWrap.style.setProperty("--slider-position", `${sliderPosition}%`);
  activeSignal = signal;
  renderTimeDomain(activeSignal, animationPhase);
  renderFrequencyDomain(signal.activeHarmonics);
}

function animateTimeDomain(timestamp) {
  if (previousAnimationTime === null) {
    previousAnimationTime = timestamp;
  }

  const elapsed = Math.min(timestamp - previousAnimationTime, 100);
  previousAnimationTime = timestamp;
  animationPhase = (animationPhase + (elapsed / 1000) * (TAU / WAVE_SCROLL_SECONDS)) % TAU;

  if (timestamp - lastFrameTime >= TARGET_FRAME_INTERVAL) {
    renderTimeDomain(activeSignal, animationPhase);
    lastFrameTime = timestamp;
  }

  requestAnimationFrame(animateTimeDomain);
}

harmonicInput.addEventListener("input", render);
render();
requestAnimationFrame(animateTimeDomain);
