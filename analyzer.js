/**
 * ISO 12233 Camera Resolution (LW/PH) Analyzer
 * Antigravity Advanced Optical Measurement Engine
 */

(function () {
  'use strict';

  // --- DOM Elements ---
  const canvas = document.getElementById('mainCanvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const wrapper = document.getElementById('canvasWrapper');

  const waveformCanvas = document.getElementById('waveformCanvas');
  const waveCtx = waveformCanvas.getContext('2d');

  const mtfCanvas = document.getElementById('mtfCanvas');
  const mtfCtx = mtfCanvas.getContext('2d');

  // Input & Buttons
  const imageInput = document.getElementById('imageInput');
  const btnUpload = document.getElementById('btnUpload');
  const btnAnalyze = document.getElementById('btnAnalyze');

  const btnZoomIn = document.getElementById('btnZoomIn');
  const btnZoomOut = document.getElementById('btnZoomOut');
  const btnZoomFit = document.getElementById('btnZoomFit');
  const btnZoom100 = document.getElementById('btnZoom100');
  const btnRotateROI = document.getElementById('btnRotateROI');
  const btnFlipROI = document.getElementById('btnFlipROI');

  const presetVertWedge = document.getElementById('presetVertWedge');
  const presetHorizWedge = document.getElementById('presetHorizWedge');

  const pictureHeightInput = document.getElementById('pictureHeightInput');
  const contrastThresholdInput = document.getElementById('contrastThresholdInput');
  const roiWidthInput = document.getElementById('roiWidthInput');
  const smoothingInput = document.getElementById('smoothingInput');
  const inspectSlider = document.getElementById('inspectSlider');
  const sliderPosVal = document.getElementById('sliderPosVal');

  const calcModeSelect = document.getElementById('calcModeSelect');
  const scaleStartInput = document.getElementById('scaleStartInput');
  const scaleEndInput = document.getElementById('scaleEndInput');
  const scaleInputsContainer = document.getElementById('scaleInputsContainer');

  const angleValueDisplay = document.getElementById('angleValueDisplay');
  const angleSlider = document.getElementById('angleSlider');
  const btnAngleMinus1 = document.getElementById('btnAngleMinus1');
  const btnAngleMinus01 = document.getElementById('btnAngleMinus01');
  const btnAnglePlus01 = document.getElementById('btnAnglePlus01');
  const btnAnglePlus1 = document.getElementById('btnAnglePlus1');

  // Display fields
  const resLWPH = document.getElementById('resLWPH');
  const resPixelWidth = document.getElementById('resPixelWidth');
  const evalStatus = document.getElementById('evalStatus');
  const metricThreshold = document.getElementById('metricThreshold');
  const metricScale = document.getElementById('metricScale');
  const metricSamples = document.getElementById('metricSamples');
  const metricLPPH = document.getElementById('metricLPPH');

  const waveMin = document.getElementById('waveMin');
  const waveMax = document.getElementById('waveMax');
  const waveContrast = document.getElementById('waveContrast');

  const statusImageInfo = document.getElementById('statusImageInfo');
  const statusCoordinates = document.getElementById('statusCoordinates');
  const statusZoom = document.getElementById('statusZoom');

  // Marker & Export controls
  const btnToggleROI = document.getElementById('btnToggleROI');
  const btnExportImage = document.getElementById('btnExportImage');
  const showLimitLineCheckbox = document.getElementById('showLimitLineCheckbox');
  const markerStyleSelect = document.getElementById('markerStyleSelect');
  const showLimitLabelCheckbox = document.getElementById('showLimitLabelCheckbox');
  const btnDownloadMarked = document.getElementById('btnDownloadMarked');

  // Offscreen canvas for fast pixel data extraction
  let offscreenCanvas = document.createElement('canvas');
  let offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });

  // --- State Variables ---
  let image = null;
  let transform = { x: 0, y: 0, scale: 1 };
  let isPanning = false;
  let panStart = { x: 0, y: 0 };
  let showRoiOverlay = true; // true: 顯示選框與手柄; false: 純淨檢視模式 (如 line char_note.jpg)

  // ROI State: p1 = Wide end (low freq), p2 = Narrow end (high freq)
  let roi = {
    p1: { x: 1730, y: 245 }, // Default to horizontal wedge in sample (scale 6 to 20)
    p2: { x: 885, y: 200 },
    width: 75
  };

  let dragTarget = null; // 'all', 'p1', 'p2', 'handleL', 'handleR', 'rotHandle'
  let dragStart = null;
  let analysisResult = null;
  let currentInspectRatio = 0.5; // 0 to 1 along ROI length

  // --- Resize Canvas ---
  function resizeCanvas() {
    if (!canvas || !wrapper) return;
    canvas.width = wrapper.clientWidth;
    canvas.height = wrapper.clientHeight;

    const dpr = window.devicePixelRatio || 1;
    [waveformCanvas, mtfCanvas].forEach(c => {
      if (!c) return;
      const rect = c.getBoundingClientRect();
      c.width = Math.max(10, rect.width * dpr);
      c.height = Math.max(10, rect.height * dpr);
    });

    render();
    if (analysisResult) {
      renderPlots();
    }
  }

  window.addEventListener('resize', resizeCanvas);

  // --- Status & State Helpers ---
  function markNeedsAnalysis() {
    analysisResult = null;
    evalStatus.textContent = '等待分析';
    evalStatus.style.borderColor = 'rgba(148, 163, 184, 0.4)';
    evalStatus.style.color = '#94a3b8';

    resLWPH.textContent = '---';
    resPixelWidth.textContent = '--- px';
    metricScale.textContent = '---';
    metricLPPH.textContent = '---';

    // Clear plots
    waveCtx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
    mtfCtx.clearRect(0, 0, mtfCanvas.width, mtfCanvas.height);
    waveMin.textContent = '暗部谷值: --';
    waveMax.textContent = '亮部峰值: --';
    waveContrast.textContent = '切片調變度: --%';

    render();
  }

  // --- Image Loading ---
  function loadImage(src, name = '影像') {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      image = img;
      offscreenCanvas.width = img.naturalWidth;
      offscreenCanvas.height = img.naturalHeight;
      offscreenCtx.drawImage(img, 0, 0);

      // Update inputs
      pictureHeightInput.value = img.naturalHeight;
      statusImageInfo.textContent = `${name} (${img.naturalWidth} × ${img.naturalHeight} px)`;

      fitToScreen();
      markNeedsAnalysis();
    };
    img.onerror = () => {
      statusImageInfo.textContent = '載入影像失敗，請確認檔案路徑或手動選擇圖片。';
    };
    img.src = src;
  }

  // --- View Transformations ---
  function fitToScreen() {
    if (!image) return;
    const margin = 40;
    const scaleX = (canvas.width - margin * 2) / image.naturalWidth;
    const scaleY = (canvas.height - margin * 2) / image.naturalHeight;
    const scale = Math.min(scaleX, scaleY, 1.0);

    transform.scale = Math.max(0.1, scale);
    transform.x = (canvas.width - image.naturalWidth * transform.scale) / 2;
    transform.y = (canvas.height - image.naturalHeight * transform.scale) / 2;

    updateZoomDisplay();
    render();
  }

  function setZoom(newScale, centerScreenX = canvas.width / 2, centerScreenY = canvas.height / 2) {
    newScale = Math.min(Math.max(0.05, newScale), 10.0);
    const imgX = (centerScreenX - transform.x) / transform.scale;
    const imgY = (centerScreenY - transform.y) / transform.scale;

    transform.scale = newScale;
    transform.x = centerScreenX - imgX * transform.scale;
    transform.y = centerScreenY - imgY * transform.scale;

    updateZoomDisplay();
    render();
  }

  function updateZoomDisplay() {
    statusZoom.textContent = `Zoom: ${Math.round(transform.scale * 100)}%`;
  }

  function screenToImage(sx, sy) {
    return {
      x: (sx - transform.x) / transform.scale,
      y: (sy - transform.y) / transform.scale
    };
  }

  function imageToScreen(ix, iy) {
    return {
      x: ix * transform.scale + transform.x,
      y: iy * transform.scale + transform.y
    };
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function getRoiGeometry() {
    const dx = roi.p2.x - roi.p1.x;
    const dy = roi.p2.y - roi.p1.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    // Normal vector perpendicular to wedge axis
    const nx = -uy;
    const ny = ux;

    const width = roi.width;
    const halfW = width / 2;

    // Four corners: c1, c2 at p1; c3, c4 at p2
    const c1 = { x: roi.p1.x + nx * halfW, y: roi.p1.y + ny * halfW };
    const c2 = { x: roi.p1.x - nx * halfW, y: roi.p1.y - ny * halfW };
    const c3 = { x: roi.p2.x - nx * halfW, y: roi.p2.y - ny * halfW };
    const c4 = { x: roi.p2.x + nx * halfW, y: roi.p2.y + ny * halfW };

    const center = { x: (roi.p1.x + roi.p2.x) / 2, y: (roi.p1.y + roi.p2.y) / 2 };

    return { dx, dy, len, ux, uy, nx, ny, width, halfW, c1, c2, c3, c4, center };
  }

  // --- Angle & Geometry Helpers ---
  function updateAngleUI() {
    const geo = getRoiGeometry();
    const deg = Math.atan2(geo.dy, geo.dx) * (180 / Math.PI);
    if (angleValueDisplay) angleValueDisplay.textContent = deg.toFixed(1) + '°';
    if (angleSlider && document.activeElement !== angleSlider) {
      angleSlider.value = deg.toFixed(1);
    }
  }

  function setRoiAngle(targetDeg) {
    const geo = getRoiGeometry();
    const rad = targetDeg * (Math.PI / 180);
    const halfL = geo.len / 2;
    roi.p1 = {
      x: geo.center.x - Math.cos(rad) * halfL,
      y: geo.center.y - Math.sin(rad) * halfL
    };
    roi.p2 = {
      x: geo.center.x + Math.cos(rad) * halfL,
      y: geo.center.y + Math.sin(rad) * halfL
    };
    render();
    markNeedsAnalysis();
  }

  // --- Rendering ---
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!image) {
      ctx.fillStyle = '#64748b';
      ctx.font = '16px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('請開啟影像以開始分析', canvas.width / 2, canvas.height / 2);
      return;
    }

    // 1. Draw Background Image
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.scale, transform.scale);
    ctx.drawImage(image, 0, 0);
    ctx.restore();

    // 2. Draw ROI Overlay
    drawRoiOverlay();
    updateAngleUI();
  }

  function drawRoiOverlay() {
    if (!showRoiOverlay) return;

    const geo = getRoiGeometry();
    ctx.save();

    // 1. 繪製 ROI 選框、中心線、箭頭與把手
    const sc1 = imageToScreen(geo.c1.x, geo.c1.y);
    const sc2 = imageToScreen(geo.c2.x, geo.c2.y);
    const sc3 = imageToScreen(geo.c3.x, geo.c3.y);
    const sc4 = imageToScreen(geo.c4.x, geo.c4.y);
    const sp1 = imageToScreen(roi.p1.x, roi.p1.y);
    const sp2 = imageToScreen(roi.p2.x, roi.p2.y);

    // Shaded ROI boundary
    ctx.beginPath();
    ctx.moveTo(sc1.x, sc1.y);
    ctx.lineTo(sc2.x, sc2.y);
    ctx.lineTo(sc3.x, sc3.y);
    ctx.lineTo(sc4.x, sc4.y);
    ctx.closePath();

    ctx.fillStyle = 'rgba(6, 182, 212, 0.10)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#06b6d4';
    ctx.stroke();

    // Centerline (dotted)
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.moveTo(sp1.x, sp1.y);
    ctx.lineTo(sp2.x, sp2.y);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrow at high-freq end
    const arrowLen = 14;
    const arrowAngle = Math.atan2(geo.dy, geo.dx);
    ctx.beginPath();
    ctx.moveTo(sp2.x, sp2.y);
    ctx.lineTo(
      sp2.x - arrowLen * Math.cos(arrowAngle - Math.PI / 6),
      sp2.y - arrowLen * Math.sin(arrowAngle - Math.PI / 6)
    );
    ctx.moveTo(sp2.x, sp2.y);
    ctx.lineTo(
      sp2.x - arrowLen * Math.cos(arrowAngle + Math.PI / 6),
      sp2.y - arrowLen * Math.sin(arrowAngle + Math.PI / 6)
    );
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Labels
    ctx.font = '600 11px Inter, sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('▼ 寬端 (低頻)', sp1.x, sp1.y - 14);
    ctx.fillText('▲ 窄端 (高頻)', sp2.x, sp2.y - 14);

    // End Handles
    drawHandle(sp1.x, sp1.y, '#3b82f6', '寬端');
    drawHandle(sp2.x, sp2.y, '#f59e0b', '窄端');

    // Width adjust handles
    const sMidL = imageToScreen(
      geo.center.x + geo.nx * geo.halfW,
      geo.center.y + geo.ny * geo.halfW
    );
    const sMidR = imageToScreen(
      geo.center.x - geo.nx * geo.halfW,
      geo.center.y - geo.ny * geo.halfW
    );
    drawHandle(sMidL.x, sMidL.y, '#06b6d4');
    drawHandle(sMidR.x, sMidR.y, '#06b6d4');

    // Rotation Handle at narrow end
    const rotDist = 36 / transform.scale;
    const rotImgPt = { x: roi.p2.x + geo.ux * rotDist, y: roi.p2.y + geo.uy * rotDist };
    const sRot = imageToScreen(rotImgPt.x, rotImgPt.y);

    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.moveTo(sp2.x, sp2.y);
    ctx.lineTo(sRot.x, sRot.y);
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.setLineDash([]);

    drawHandle(sRot.x, sRot.y, '#10b981');
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('↻', sRot.x, sRot.y);

    // Current Inspect Line (綠色虛線，僅在滑動且不與紅線重合時顯示)
    const isNearLimit = analysisResult && analysisResult.limitRatio !== null &&
                        Math.abs(currentInspectRatio - analysisResult.limitRatio) < 0.015;
    if (!isNearLimit) {
      const curX = roi.p1.x + geo.dx * currentInspectRatio;
      const curY = roi.p1.y + geo.dy * currentInspectRatio;
      const sci1 = imageToScreen(curX + geo.nx * geo.halfW, curY + geo.ny * geo.halfW);
      const sci2 = imageToScreen(curX - geo.nx * geo.halfW, curY - geo.ny * geo.halfW);

      ctx.beginPath();
      ctx.moveTo(sci1.x, sci1.y);
      ctx.lineTo(sci2.x, sci2.y);
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 2. 繪製極限解析度紅線與數值標記
    const shouldDrawLimitLine = showLimitLineCheckbox ? showLimitLineCheckbox.checked : true;
    if (shouldDrawLimitLine && analysisResult && analysisResult.limitRatio !== null) {
      drawResolutionRedLine(ctx, geo, false);
    }

    ctx.restore();
  }

  /**
   * 繪製如同 line char_note.jpg 的解析度紅線
   * @param {CanvasRenderingContext2D} targetCtx - 繪製目標 context
   * @param {Object} geo - ROI 幾何資訊
   * @param {boolean} isExportImage - 是否為原圖像素匯出 (若為 true 直接用原圖像素空間)
   */
  function drawResolutionRedLine(targetCtx, geo, isExportImage = false) {
    if (!analysisResult || analysisResult.limitRatio === null) return;

    const limitR = analysisResult.limitRatio;
    const lx = roi.p1.x + geo.dx * limitR;
    const ly = roi.p1.y + geo.dy * limitR;

    // 計算紅線跨度
    const isFit = markerStyleSelect ? markerStyleSelect.value === 'fit' : true;
    let sStart = -geo.halfW;
    let sEnd = geo.halfW;

    const limitSlice = analysisResult.limitSlice;
    if (isFit && limitSlice && limitSlice.valleys && limitSlice.valleys.length >= 2) {
      const sampleCount = limitSlice.profile.length;
      const v0 = limitSlice.valleys[0].index;
      const v1 = limitSlice.valleys[limitSlice.valleys.length - 1].index;
      const pos0 = -geo.halfW + (v0 / (sampleCount - 1)) * geo.width;
      const pos1 = -geo.halfW + (v1 / (sampleCount - 1)) * geo.width;
      let span = Math.abs(pos1 - pos0);
      
      // 確保紅線具備醒目的最小寬度（至少 22px 原圖像素），避免高頻端線條過短難以察覺
      const minSpan = 22;
      const midPos = (pos0 + pos1) / 2;
      if (span < minSpan) {
        span = minSpan;
      }
      const pad = Math.max(6, span * 0.22);
      sStart = midPos - span / 2 - pad;
      sEnd = midPos + span / 2 + pad;
    } else if (isFit) {
      const halfSpan = Math.max(14, geo.halfW * 0.45);
      sStart = -halfSpan;
      sEnd = halfSpan;
    }

    const p1 = { x: lx + geo.nx * sStart, y: ly + geo.ny * sStart };
    const p2 = { x: lx + geo.nx * sEnd, y: ly + geo.ny * sEnd };

    // 坐標換算
    const pt1 = isExportImage ? p1 : imageToScreen(p1.x, p1.y);
    const pt2 = isExportImage ? p2 : imageToScreen(p2.x, p2.y);

    targetCtx.save();

    // 1. 繪製俐落鮮紅線段（精準直切在 line pair 上）
    targetCtx.beginPath();
    targetCtx.moveTo(pt1.x, pt1.y);
    targetCtx.lineTo(pt2.x, pt2.y);
    targetCtx.strokeStyle = '#ff0033'; // 鮮紅高對比
    targetCtx.lineWidth = isExportImage ? 3.5 : Math.max(2.8, 3.2 * Math.min(1.2, transform.scale));
    targetCtx.lineCap = 'butt';
    targetCtx.stroke();

    // 2. 數值標籤（智慧計算外側位置，絕不覆蓋水平或垂直紅線）
    const showLabel = showLimitLabelCheckbox ? showLimitLabelCheckbox.checked : true;
    if (showLabel) {
      const midX = (pt1.x + pt2.x) / 2;
      const midY = (pt1.y + pt2.y) / 2;
      const dLineX = pt2.x - pt1.x;
      const dLineY = pt2.y - pt1.y;

      const text = `${Math.round(analysisResult.lwph)} LW/PH`;
      targetCtx.font = isExportImage ? 'bold 16px Inter, sans-serif' : '600 11px Inter, sans-serif';
      const m = targetCtx.measureText(text);
      const padX = 6;
      const padY = 3;
      const boxW = m.width + padX * 2;
      const boxH = isExportImage ? 24 : 18;

      let labelX = midX;
      let labelY = midY;
      const offsetDist = isExportImage ? 18 : 14;

      if (Math.abs(dLineY) >= Math.abs(dLineX)) {
        // 紅線偏向垂直（例如上方水平楔形）：標籤置於上頂點上方外側
        const topPt = pt1.y < pt2.y ? pt1 : pt2;
        labelX = topPt.x;
        labelY = topPt.y - offsetDist - boxH / 2;
      } else {
        // 紅線偏向水平（例如左側垂直楔形）：標籤置於紅線中點上方外側（Y 軸向上退開）
        labelX = midX;
        labelY = Math.min(pt1.y, pt2.y) - offsetDist - boxH / 2;
      }

      targetCtx.fillStyle = 'rgba(15, 23, 42, 0.90)';
      targetCtx.strokeStyle = '#ff0033';
      targetCtx.lineWidth = 1;
      targetCtx.beginPath();
      if (targetCtx.roundRect) {
        targetCtx.roundRect(labelX - boxW / 2, labelY - boxH / 2, boxW, boxH, 4);
      } else {
        targetCtx.rect(labelX - boxW / 2, labelY - boxH / 2, boxW, boxH);
      }
      targetCtx.fill();
      targetCtx.stroke();

      targetCtx.fillStyle = '#ffffff';
      targetCtx.textAlign = 'center';
      targetCtx.textBaseline = 'middle';
      targetCtx.fillText(text, labelX, labelY);
    }

    targetCtx.restore();
  }

  function drawHandle(x, y, color) {
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }

  // --- Interaction & Mouse Handling ---
  function getHitTarget(screenX, screenY) {
    if (!showRoiOverlay) return null; // 純淨標註檢視模式下不選取 ROI 手柄
    const geo = getRoiGeometry();
    const sp1 = imageToScreen(roi.p1.x, roi.p1.y);
    const sp2 = imageToScreen(roi.p2.x, roi.p2.y);
    const sMidL = imageToScreen(
      geo.center.x + geo.nx * geo.halfW,
      geo.center.y + geo.ny * geo.halfW
    );
    const sMidR = imageToScreen(
      geo.center.x - geo.nx * geo.halfW,
      geo.center.y - geo.ny * geo.halfW
    );

    const hitDist = 14;
    const rotDist = 36 / transform.scale;
    const sRot = imageToScreen(roi.p2.x + geo.ux * rotDist, roi.p2.y + geo.uy * rotDist);
    if (dist({ x: screenX, y: screenY }, sRot) < hitDist) return 'rotHandle';

    if (dist({ x: screenX, y: screenY }, sp1) < hitDist) return 'p1';
    if (dist({ x: screenX, y: screenY }, sp2) < hitDist) return 'p2';
    if (dist({ x: screenX, y: screenY }, sMidL) < hitDist) return 'handleL';
    if (dist({ x: screenX, y: screenY }, sMidR) < hitDist) return 'handleR';

    const imgPos = screenToImage(screenX, screenY);
    const vx = imgPos.x - roi.p1.x;
    const vy = imgPos.y - roi.p1.y;
    const alongAxis = vx * geo.ux + vy * geo.uy;
    const alongNorm = Math.abs(vx * geo.nx + vy * geo.ny);

    if (alongAxis >= 0 && alongAxis <= geo.len && alongNorm <= geo.halfW) {
      return 'all';
    }

    return null;
  }

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 1 || e.button === 2) {
      isPanning = true;
      panStart = { x: e.clientX, y: e.clientY };
      e.preventDefault();
      return;
    }

    if (e.button === 0) {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      const hit = getHitTarget(sx, sy);
      if (hit) {
        dragTarget = hit;
        const imgPt = screenToImage(sx, sy);
        dragStart = {
          imgPt: { x: imgPt.x, y: imgPt.y },
          roiP1: { ...roi.p1 },
          roiP2: { ...roi.p2 },
          roiWidth: roi.width
        };
      } else {
        isPanning = true;
        panStart = { x: e.clientX, y: e.clientY };
      }
    }
  });

  window.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const imgPt = screenToImage(sx, sy);

    if (image) {
      statusCoordinates.textContent = `X: ${Math.round(imgPt.x)}, Y: ${Math.round(imgPt.y)}`;
    }

    if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      panStart = { x: e.clientX, y: e.clientY };
      transform.x += dx;
      transform.y += dy;
      render();
      return;
    }

    if (dragTarget && dragStart) {
      const geo = getRoiGeometry();
      if (dragTarget === 'rotHandle') {
        const rad = Math.atan2(imgPt.y - geo.center.y, imgPt.x - geo.center.x);
        setRoiAngle(rad * (180 / Math.PI));
        return;
      } else if (dragTarget === 'all') {
        const dImgX = imgPt.x - dragStart.imgPt.x;
        const dImgY = imgPt.y - dragStart.imgPt.y;
        roi.p1 = { x: dragStart.roiP1.x + dImgX, y: dragStart.roiP1.y + dImgY };
        roi.p2 = { x: dragStart.roiP2.x + dImgX, y: dragStart.roiP2.y + dImgY };
      } else if (dragTarget === 'p1') {
        const dImgX = imgPt.x - dragStart.imgPt.x;
        const dImgY = imgPt.y - dragStart.imgPt.y;
        roi.p1 = { x: dragStart.roiP1.x + dImgX, y: dragStart.roiP1.y + dImgY };
      } else if (dragTarget === 'p2') {
        const dImgX = imgPt.x - dragStart.imgPt.x;
        const dImgY = imgPt.y - dragStart.imgPt.y;
        roi.p2 = { x: dragStart.roiP2.x + dImgX, y: dragStart.roiP2.y + dImgY };
      } else if (dragTarget === 'handleL' || dragTarget === 'handleR') {
        const vx = imgPt.x - geo.center.x;
        const vy = imgPt.y - geo.center.y;
        const dNorm = Math.abs(vx * geo.nx + vy * geo.ny);
        roi.width = Math.max(15, Math.min(400, Math.round(dNorm * 2)));
        roiWidthInput.value = roi.width;
      }
      render();
    } else {
      const hit = getHitTarget(sx, sy);
      if (hit === 'rotHandle') canvas.style.cursor = 'grab';
      else if (hit === 'p1' || hit === 'p2') canvas.style.cursor = 'crosshair';
      else if (hit === 'handleL' || hit === 'handleR') canvas.style.cursor = 'ew-resize';
      else if (hit === 'all') canvas.style.cursor = 'move';
      else canvas.style.cursor = 'default';
    }
  });

  window.addEventListener('mouseup', () => {
    if (dragTarget) {
      dragTarget = null;
      dragStart = null;
      markNeedsAnalysis();
    }
    isPanning = false;
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    setZoom(transform.scale * zoomFactor, sx, sy);
  }, { passive: false });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // --- Core Analysis Algorithm ---

  /**
   * Sample cross-section slice at ratio t (0 = wide end, 1 = narrow end)
   */
  function sampleSlice(ratio, sampleCount = 140) {
    const geo = getRoiGeometry();
    const cx = roi.p1.x + geo.dx * ratio;
    const cy = roi.p1.y + geo.dy * ratio;

    const imgW = offscreenCanvas.width;
    const imgH = offscreenCanvas.height;

    // Sample across [-halfW, halfW]
    const rawProfile = [];
    for (let i = 0; i < sampleCount; i++) {
      const s = -geo.halfW + (i / (sampleCount - 1)) * geo.width;
      const px = Math.round(cx + geo.nx * s);
      const py = Math.round(cy + geo.ny * s);

      if (px >= 0 && px < imgW && py >= 0 && py < imgH) {
        const p = offscreenCtx.getImageData(px, py, 1, 1).data;
        const lum = 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
        rawProfile.push(lum);
      } else {
        rawProfile.push(255);
      }
    }

    // Moving average filter
    const smoothRadius = parseInt(smoothingInput.value, 10) || 2;
    const smoothed = [];
    for (let i = 0; i < rawProfile.length; i++) {
      let sum = 0, count = 0;
      for (let k = -smoothRadius; k <= smoothRadius; k++) {
        const idx = i + k;
        if (idx >= 0 && idx < rawProfile.length) {
          sum += rawProfile[idx];
          count++;
        }
      }
      smoothed.push(sum / count);
    }

    // Peak & Valley Detection
    const valleys = []; // Black lines
    const peaks = [];   // White gaps

    for (let i = 2; i < smoothed.length - 2; i++) {
      const v = smoothed[i];
      if (v < smoothed[i - 1] && v < smoothed[i - 2] && v <= smoothed[i + 1] && v < smoothed[i + 2]) {
        valleys.push({ index: i, val: v });
      } else if (v > smoothed[i - 1] && v > smoothed[i - 2] && v >= smoothed[i + 1] && v > smoothed[i + 2]) {
        peaks.push({ index: i, val: v });
      }
    }

    // Intelligent Wedge Clustering:
    // Filter out peripheral tick marks, text, or border lines if ROI is wide.
    // Wedge lines are tightly clustered around the ROI center with uniform spacing.
    let coreValleys = valleys;
    if (valleys.length > 5) {
      const centerIdx = sampleCount / 2;
      // Sort valleys by proximity to ROI center line
      const sortedByCenter = [...valleys].sort((a, b) => 
        Math.abs(a.index - centerIdx) - Math.abs(b.index - centerIdx)
      );
      // Take the top 5 closest to center (the 5 wedge lines) and restore spatial order
      coreValleys = sortedByCenter.slice(0, 5).sort((a, b) => a.index - b.index);
    }

    // Filter peaks that lie within the core wedge span
    let corePeaks = peaks;
    if (coreValleys.length >= 2) {
      const minVIdx = coreValleys[0].index;
      const maxVIdx = coreValleys[coreValleys.length - 1].index;
      corePeaks = peaks.filter(p => p.index >= minVIdx - 5 && p.index <= maxVIdx + 5);
      if (corePeaks.length === 0) corePeaks = peaks;
    }

    // Michelson Contrast Modulation: C = (I_max - I_min) / (I_max + I_min)
    let minVal = Math.min(...smoothed);
    let maxVal = Math.max(...smoothed);

    if (coreValleys.length > 0 && corePeaks.length > 0) {
      const vMean = coreValleys.reduce((acc, cur) => acc + cur.val, 0) / coreValleys.length;
      const pMean = corePeaks.reduce((acc, cur) => acc + cur.val, 0) / corePeaks.length;
      minVal = vMean;
      maxVal = pMean;
    }

    const contrast = (maxVal - minVal) / Math.max(1, maxVal + minVal);

    // Compute pixel cycle wavelength lambda (px)
    let lambdaPx = 10;
    if (coreValleys.length >= 2) {
      const spans = [];
      for (let i = 1; i < coreValleys.length; i++) {
        spans.push(coreValleys[i].index - coreValleys[i - 1].index);
      }
      spans.sort((a, b) => a - b);
      const medianSpan = spans[Math.floor(spans.length / 2)];
      lambdaPx = (medianSpan / sampleCount) * geo.width;
    } else {
      lambdaPx = Math.max(1.5, 12 - ratio * 10);
    }

    return {
      ratio,
      profile: smoothed,
      valleys: coreValleys,
      peaks: corePeaks,
      minVal,
      maxVal,
      contrast: Math.max(0, Math.min(1, contrast)),
      lambdaPx: Math.max(1.0, lambdaPx)
    };
  }

  function runAnalysis() {
    if (!image) return;

    evalStatus.textContent = '分析中...';
    evalStatus.style.borderColor = '#f59e0b';
    evalStatus.style.color = '#f59e0b';

    setTimeout(() => {
      const totalSlices = 100;
      const slices = [];
      const thresholdPercent = parseFloat(contrastThresholdInput.value) || 10.0;
      const threshold = thresholdPercent / 100.0;
      const pictureHeight = parseFloat(pictureHeightInput.value) || image.naturalHeight;
      const mode = calcModeSelect ? calcModeSelect.value : 'scale';

      let limitSlice = null;
      let limitRatio = null;

      for (let i = 0; i < totalSlices; i++) {
        const r = i / (totalSlices - 1);
        const sl = sampleSlice(r);
        slices.push(sl);
      }

      // Smooth contrast trend
      const smoothedContrasts = [];
      for (let i = 0; i < slices.length; i++) {
        let sum = 0, c = 0;
        for (let k = -2; k <= 2; k++) {
          if (i + k >= 0 && i + k < slices.length) {
            sum += slices[i + k].contrast;
            c++;
          }
        }
        smoothedContrasts.push(sum / c);
      }

      // Find cut-off limit from low freq (ratio 0) to high freq (ratio 1)
      for (let i = 3; i < totalSlices; i++) {
        const sc = smoothedContrasts[i];
        const prevSc = smoothedContrasts[i - 1];

        if (sc <= threshold && prevSc > threshold) {
          limitSlice = slices[i];
          limitRatio = slices[i].ratio;
          break;
        }
      }

      // Fallback: lowest contrast location or end of ROI
      if (!limitSlice) {
        let minIdx = totalSlices - 1;
        let minC = 999;
        smoothedContrasts.forEach((c, idx) => {
          if (c < minC) { minC = c; minIdx = idx; }
        });
        limitSlice = slices[minIdx];
        limitRatio = limitSlice.ratio;
      }

      // Calculate LW/PH according to selected mode
      let finalLwph = 0;
      const sStart = parseFloat(scaleStartInput.value) || 600; // e.g. 600 LW/PH (scale 6)
      const sEnd = parseFloat(scaleEndInput.value) || 2000;    // e.g. 2000 LW/PH (scale 20)

      if (mode === 'scale') {
        // Linear interpolation across ISO 12233 hyperbolic scale
        finalLwph = sStart + limitRatio * (sEnd - sStart);
      } else {
        // Physical Line Pair Frequency: LW/PH = 2 * PictureHeight / lambda
        finalLwph = (2 * pictureHeight) / limitSlice.lambdaPx;
      }

      analysisResult = {
        slices,
        smoothedContrasts,
        limitRatio,
        limitSlice,
        lwph: finalLwph,
        pictureHeight,
        thresholdPercent
      };

      // Update UI displays
      resLWPH.textContent = Math.round(finalLwph);
      resPixelWidth.textContent = (limitSlice.lambdaPx / 2).toFixed(2) + ' px';
      metricThreshold.textContent = thresholdPercent.toFixed(1) + ' %';
      metricScale.textContent = (finalLwph / 100).toFixed(1) + ' (x100)';
      metricSamples.textContent = totalSlices;
      metricLPPH.textContent = (finalLwph / 2).toFixed(0) + ' LP/PH';

      evalStatus.textContent = '分析完成';
      evalStatus.style.borderColor = 'rgba(16, 185, 129, 0.4)';
      evalStatus.style.color = 'var(--accent-emerald)';

      // Sync slider to limit position
      currentInspectRatio = limitRatio;
      inspectSlider.value = Math.round(limitRatio * 100);
      sliderPosVal.textContent = Math.round(limitRatio * 100) + '%';

      render();
      renderPlots();
    }, 20);
  }

  // --- Plots Rendering ---
  function renderPlots() {
    if (!analysisResult) return;

    // 1. Render Waveform of current inspect slice
    const curSlice = sampleSlice(currentInspectRatio);
    const prof = curSlice.profile;

    waveCtx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
    const w = waveformCanvas.width;
    const h = waveformCanvas.height;

    // Background grid
    waveCtx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    waveCtx.lineWidth = 1;
    for (let y = 0; y <= h; y += h / 4) {
      waveCtx.beginPath();
      waveCtx.moveTo(0, y);
      waveCtx.lineTo(w, y);
      waveCtx.stroke();
    }

    // Draw Waveform
    waveCtx.beginPath();
    waveCtx.strokeStyle = '#38bdf8';
    waveCtx.lineWidth = 2;
    for (let i = 0; i < prof.length; i++) {
      const x = (i / (prof.length - 1)) * w;
      const y = h - (prof[i] / 255) * (h - 16) - 8;
      if (i === 0) waveCtx.moveTo(x, y);
      else waveCtx.lineTo(x, y);
    }
    waveCtx.stroke();

    // Mark peaks and valleys
    curSlice.valleys.forEach(v => {
      const x = (v.index / (prof.length - 1)) * w;
      const y = h - (v.val / 255) * (h - 16) - 8;
      waveCtx.fillStyle = '#f43f5e';
      waveCtx.beginPath();
      waveCtx.arc(x, y, 4, 0, Math.PI * 2);
      waveCtx.fill();
    });

    curSlice.peaks.forEach(p => {
      const x = (p.index / (prof.length - 1)) * w;
      const y = h - (p.val / 255) * (h - 16) - 8;
      waveCtx.fillStyle = '#10b981';
      waveCtx.beginPath();
      waveCtx.arc(x, y, 4, 0, Math.PI * 2);
      waveCtx.fill();
    });

    waveMin.textContent = `暗部谷值: ${Math.round(curSlice.minVal)}`;
    waveMax.textContent = `亮部峰值: ${Math.round(curSlice.maxVal)}`;
    waveContrast.textContent = `當前切片調變度: ${(curSlice.contrast * 100).toFixed(1)}%`;

    // 2. Render MTF / Contrast Curve
    mtfCtx.clearRect(0, 0, mtfCanvas.width, mtfCanvas.height);
    const mw = mtfCanvas.width;
    const mh = mtfCanvas.height;

    // Threshold Line
    const thY = mh - (analysisResult.thresholdPercent / 100) * (mh - 16) - 8;
    mtfCtx.beginPath();
    mtfCtx.setLineDash([4, 4]);
    mtfCtx.strokeStyle = 'rgba(244, 63, 94, 0.6)';
    mtfCtx.lineWidth = 1.5;
    mtfCtx.moveTo(0, thY);
    mtfCtx.lineTo(mw, thY);
    mtfCtx.stroke();
    mtfCtx.setLineDash([]);

    // Contrast Curve
    const contr = analysisResult.smoothedContrasts;
    mtfCtx.beginPath();
    mtfCtx.strokeStyle = '#10b981';
    mtfCtx.lineWidth = 2.5;
    for (let i = 0; i < contr.length; i++) {
      const x = (i / (contr.length - 1)) * mw;
      const y = mh - contr[i] * (mh - 16) - 8;
      if (i === 0) mtfCtx.moveTo(x, y);
      else mtfCtx.lineTo(x, y);
    }
    mtfCtx.stroke();

    // Red dot on Limit
    if (analysisResult.limitRatio !== null) {
      const lx = analysisResult.limitRatio * mw;
      const ly = mh - analysisResult.smoothedContrasts[Math.round(analysisResult.limitRatio * (contr.length - 1))] * (mh - 16) - 8;
      mtfCtx.beginPath();
      mtfCtx.arc(lx, ly, 5, 0, Math.PI * 2);
      mtfCtx.fillStyle = '#f43f5e';
      mtfCtx.fill();
      mtfCtx.strokeStyle = '#ffffff';
      mtfCtx.lineWidth = 1.5;
      mtfCtx.stroke();
    }

    // Inspect cursor line
    const curX = currentInspectRatio * mw;
    mtfCtx.beginPath();
    mtfCtx.setLineDash([2, 2]);
    mtfCtx.strokeStyle = '#38bdf8';
    mtfCtx.moveTo(curX, 0);
    mtfCtx.lineTo(curX, mh);
    mtfCtx.stroke();
    mtfCtx.setLineDash([]);
  }

  // --- Controls & Toolbar Listeners ---
  btnZoomIn.addEventListener('click', () => setZoom(transform.scale * 1.25));
  btnZoomOut.addEventListener('click', () => setZoom(transform.scale * 0.8));
  btnZoomFit.addEventListener('click', fitToScreen);
  btnZoom100.addEventListener('click', () => setZoom(1.0));

  btnRotateROI.addEventListener('click', () => {
    const geo = getRoiGeometry();
    const cx = geo.center.x;
    const cy = geo.center.y;
    const rx1 = -(roi.p1.y - cy);
    const ry1 = roi.p1.x - cx;
    const rx2 = -(roi.p2.y - cy);
    const ry2 = roi.p2.x - cx;
    roi.p1 = { x: cx + rx1, y: cy + ry1 };
    roi.p2 = { x: cx + rx2, y: cy + ry2 };
    render();
    markNeedsAnalysis();
  });

  btnFlipROI.addEventListener('click', () => {
    const tmp = { ...roi.p1 };
    roi.p1 = { ...roi.p2 };
    roi.p2 = tmp;
    render();
    markNeedsAnalysis();
  });

  // Presets for line char.jpg
  presetHorizWedge.addEventListener('click', () => {
    roi.p1 = { x: 1730, y: 245 }; // Scale 6
    roi.p2 = { x: 885, y: 200 };  // Scale 20
    roi.width = 75;
    roiWidthInput.value = 75;
    scaleStartInput.value = 600;
    scaleEndInput.value = 2000;
    render();
    markNeedsAnalysis();
  });

  presetVertWedge.addEventListener('click', () => {
    roi.p1 = { x: 725, y: 880 }; // Scale 6 at bottom
    roi.p2 = { x: 745, y: 65 };  // Scale 18 at top
    roi.width = 50;
    roiWidthInput.value = 50;
    scaleStartInput.value = 600;
    scaleEndInput.value = 1800;
    render();
    markNeedsAnalysis();
  });

  // ONLY manual button triggers analysis
  btnAnalyze.addEventListener('click', runAnalysis);

  contrastThresholdInput.addEventListener('change', markNeedsAnalysis);
  pictureHeightInput.addEventListener('change', markNeedsAnalysis);
  smoothingInput.addEventListener('change', markNeedsAnalysis);
  scaleStartInput.addEventListener('change', markNeedsAnalysis);
  scaleEndInput.addEventListener('change', markNeedsAnalysis);

  if (calcModeSelect) {
    calcModeSelect.addEventListener('change', () => {
      scaleInputsContainer.style.display = calcModeSelect.value === 'scale' ? 'grid' : 'none';
      markNeedsAnalysis();
    });
  }

  roiWidthInput.addEventListener('input', () => {
    roi.width = parseInt(roiWidthInput.value, 10) || 50;
    render();
  });
  roiWidthInput.addEventListener('change', markNeedsAnalysis);

  inspectSlider.addEventListener('input', () => {
    currentInspectRatio = parseInt(inspectSlider.value, 10) / 100;
    sliderPosVal.textContent = inspectSlider.value + '%';
    render();
    renderPlots();
  });

  if (btnAngleMinus1) {
    btnAngleMinus1.addEventListener('click', () => {
      const geo = getRoiGeometry();
      const deg = Math.atan2(geo.dy, geo.dx) * (180 / Math.PI);
      setRoiAngle(deg - 1.0);
    });
    btnAngleMinus01.addEventListener('click', () => {
      const geo = getRoiGeometry();
      const deg = Math.atan2(geo.dy, geo.dx) * (180 / Math.PI);
      setRoiAngle(deg - 0.2);
    });
    btnAnglePlus01.addEventListener('click', () => {
      const geo = getRoiGeometry();
      const deg = Math.atan2(geo.dy, geo.dx) * (180 / Math.PI);
      setRoiAngle(deg + 0.2);
    });
    btnAnglePlus1.addEventListener('click', () => {
      const geo = getRoiGeometry();
      const deg = Math.atan2(geo.dy, geo.dx) * (180 / Math.PI);
      setRoiAngle(deg + 1.0);
    });
    angleSlider.addEventListener('input', () => {
      setRoiAngle(parseFloat(angleSlider.value));
    });
  }

  // File Upload
  btnUpload.addEventListener('click', () => imageInput.click());
  imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        loadImage(evt.target.result, file.name);
      };
      reader.readAsDataURL(file);
    }
  });

  // Drag and drop onto canvas
  wrapper.addEventListener('dragover', (e) => e.preventDefault());
  wrapper.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = (evt) => {
        loadImage(evt.target.result, file.name);
      };
      reader.readAsDataURL(file);
    }
  });

  // Toggle ROI Overlay (切換選框與紅線數值標記)
  if (btnToggleROI) {
    btnToggleROI.addEventListener('click', () => {
      showRoiOverlay = !showRoiOverlay;
      btnToggleROI.classList.toggle('active', showRoiOverlay);
      btnToggleROI.title = showRoiOverlay 
        ? '隱藏選框與紅線標記' 
        : '顯示選框與紅線標記';
      btnToggleROI.innerHTML = showRoiOverlay
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
      render();
    });
  }

  // Marker Display Options Listeners
  if (showLimitLineCheckbox) showLimitLineCheckbox.addEventListener('change', render);
  if (markerStyleSelect) markerStyleSelect.addEventListener('change', render);
  if (showLimitLabelCheckbox) showLimitLabelCheckbox.addEventListener('change', render);

  // Export Marked Image (產生如 line char_note.jpg 的標註圖檔)
  function exportMarkedImage() {
    if (!image) {
      alert('尚未載入影像！');
      return;
    }
    if (!analysisResult || analysisResult.limitRatio === null) {
      alert('請先點擊「開始分析」完成解像力測定！');
      return;
    }

    const expCanvas = document.createElement('canvas');
    expCanvas.width = image.naturalWidth;
    expCanvas.height = image.naturalHeight;
    const expCtx = expCanvas.getContext('2d');

    // 1. 繪製高畫質原圖
    expCtx.drawImage(image, 0, 0);

    // 2. 在原圖像素坐標繪製解析度紅線
    const geo = getRoiGeometry();
    drawResolutionRedLine(expCtx, geo, true);

    // 3. 觸發瀏覽器下載
    const lwphVal = Math.round(analysisResult.lwph);
    const link = document.createElement('a');
    link.download = `camera_resolution_marked_${lwphVal}LWPH.jpg`;
    link.href = expCanvas.toDataURL('image/jpeg', 0.95);
    link.click();
  }

  if (btnExportImage) btnExportImage.addEventListener('click', exportMarkedImage);
  if (btnDownloadMarked) btnDownloadMarked.addEventListener('click', exportMarkedImage);

  // Initial Startup
  resizeCanvas();
  loadImage('./line%20char.jpg', 'line char.jpg');

})();

