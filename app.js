// #region === Global Constants and State ===

// Canvas and grid setup
const GRID_SIZE = 50;
const canvas = document.getElementById("canvas");

// Component and wire state
let componentId = 0;
let wireMode = false;
let wireStart = null;
let wireDirection = null;
let wireCurrentMid = null;
let previewWire = null;
let selectionBox = null;
let selectStart = null;
let isDraggingComponent = false;

let wireSegmentCounter = 0;
const wireSegments = [];

// #endregion

// #region === Global Settings ===

const SETTINGS = {
  gridSize: 20,
  wire: {
    stroke: "#000",
    width: 2
  },
  components: {
    resistor: {
      width: 60,
      height: 30,
      stroke: "#000",
      fill: "#ccc",
      draw: createResistor
    },
    voltage: {
      radius: 30,
      stroke: "#000",
      fill: "#eef",
      draw: createVoltageSource
    },
    current: {
      radius: 30,
      stroke: "#000",
      fill: "#efe",
      draw: createCurrentSource
    },
    ground: {
      width: 30,  // set to visual width of ground symbol
      height: 37, // set to visual height based on your SVG drawing
      stroke: "#000",
      fill: "#fff",
      centerOffset: { x: 0, y: 16 },  // ✅ approx halfway down
      draw: createGroundSymbol
    },
    currentarrow: {
      width: 10,   // eyeballed width of the arrowhead
      height: 25,  // from line endpoints
      stroke: "#000",
      fill: "#fff",
      draw: createCurrentArrow,
      centerOffset: { x: 0, y: 25 } // ✅ center vertically shifted down
    }
  }
};


// #endregion

// #region === Helper Functions ===

// Extracts the current translate(x, y) values from an element's transform string
function getTransformXY(element) {
  const transform = element.getAttribute("transform");
  const match = /translate\(([-\d.]+),([-\d.]+)\)/.exec(transform);
  return match ? [parseFloat(match[1]), parseFloat(match[2])] : [0, 0];
}

// Converts a mouse event into SVG-local coordinates
function getSVGCoordinates(event, svg) {
  const pt = svg.createSVGPoint();
  pt.x = event.clientX;
  pt.y = event.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

// Snaps a value to the nearest grid point and clamps it between min and max
function snapAndClamp(value, min, max) {
  const snapped = Math.round(value / GRID_SIZE) * GRID_SIZE;
  return Math.max(min, Math.min(snapped, max));
}

function normalizeHex(hex) {
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    return "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  return hex;
}

function rgbToHex(rgb) {
  if (!rgb) return "#000000";
  if (rgb.startsWith("#")) return rgb; // already hex

  const result = rgb.match(/\d+/g).map(Number);
  return (
    "#" +
    result
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

function deleteSelectedElements() {
  const deletedNums = [];

  // === Remove selected components ===
  document.querySelectorAll("g.component.selected").forEach(el => {
    deletedNums.push(parseInt(el.dataset.num));
    el.remove();
  });

  // If any components were deleted, reindex them
  if (deletedNums.length > 0) {
    reindexComponents(Math.min(...deletedNums));
  }

  // === Remove selected wires ===
  const deletedWireIds = [];
  document.querySelectorAll("line.selected").forEach(line => {
    deletedWireIds.push(line.dataset.id);
    line.remove();
  });

  // If any wires were deleted, reindex them
  if (deletedWireIds.length > 0) {
    reindexWires(deletedWireIds);
  }
}

function reindexComponents(startIndex) {
  // Get all components sorted by their current num
  const components = Array.from(document.querySelectorAll("g.component"))
    .sort((a, b) => parseInt(a.dataset.num) - parseInt(b.dataset.num));

  // Reassign sequential nums and ids
  components.forEach((el, idx) => {
    el.dataset.num = idx;
    el.dataset.id = `comp-${idx}`;
  });

  // Update the global counter
  componentId = components.length;
}

function reindexWires(deletedIds) {
  // Remove deleted wires from wireSegments
  for (const id of deletedIds) {
    const index = wireSegments.findIndex(s => s.id === id);
    if (index !== -1) wireSegments.splice(index, 1);
  }

  // Reassign wire IDs sequentially
  wireSegments.forEach((seg, idx) => {
    const oldId = seg.id;
    seg.id = `wire-${idx}`;

    // Update DOM line elements that still exist
    const lineEl = document.querySelector(`[data-id="${oldId}"]`);
    if (lineEl) lineEl.dataset.id = seg.id;
  });

  // Update global counter
  wireSegmentCounter = wireSegments.length;
}

// #endregion

// #region === Initialization & Grid Drawing ===
window.onload = () => drawGrid();

function drawGrid() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  for (let x = 0; x <= width; x += GRID_SIZE) {
    canvas.appendChild(createSVGLine(x, 0, x, height));
  }

  for (let y = 0; y <= height; y += GRID_SIZE) {
    canvas.appendChild(createSVGLine(0, y, width, y));
  }
}

// Helper to create a light grey SVG line
function createSVGLine(x1, y1, x2, y2) {
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", x1);
  line.setAttribute("y1", y1);
  line.setAttribute("x2", x2);
  line.setAttribute("y2", y2);
  line.setAttribute("stroke", "#ddd");
  line.setAttribute("stroke-width", "1");
  return line;
}

// #endregion

// #region === Selection ===

// Any other small helpers like getSelectionBounds, wireIntersectsSelection, componentIntersectsSelection
function getSelectionBounds() {
  if (!selectionBox || !selectStart) return null;
  return {
    x: parseFloat(selectionBox.getAttribute("x")),
    y: parseFloat(selectionBox.getAttribute("y")),
    width: parseFloat(selectionBox.getAttribute("width")),
    height: parseFloat(selectionBox.getAttribute("height"))
  };
}

// Checks if a wire segment intersects with the selection rectangle bounds.
function wireIntersectsSelection(seg, bounds) {
  const xMin = Math.min(seg.x1, seg.x2);
  const xMax = Math.max(seg.x1, seg.x2);
  const yMin = Math.min(seg.y1, seg.y2);
  const yMax = Math.max(seg.y1, seg.y2);

  return (
    xMax >= bounds.x &&
    xMin <= bounds.x + bounds.width &&
    yMax >= bounds.y &&
    yMin <= bounds.y + bounds.height
  );
}

// Checks if a component element intersects with the selection rectangle bounds.
function componentIntersectsSelection(el, bounds) {
  const [x, y] = getTransformXY(el); // center position
  let width = 0, height = 0;

  const comp = SETTINGS.components[el.dataset.type];
  if (comp) {
    if ("radius" in comp) {
      width = height = comp.radius * 2;
    } else {
      width = comp.width;
      height = comp.height;
    }
  }

  const left = x - width / 2;
  const right = x + width / 2;
  const top = y - height / 2;
  const bottom = y + height / 2;

  return (
    right >= bounds.x &&
    left <= bounds.x + bounds.width &&
    bottom >= bounds.y &&
    top <= bounds.y + bounds.height
  );
}

// CLears selected components
function clearSelection() {
  document.querySelectorAll(".selected").forEach(el => el.classList.remove("selected"));
}

// #endregion

// #region === Component Handling ===

function addComponent(type) {

  clearSelection();
  const group = createComponentGroup(type);
  canvas.appendChild(group);
  enableDrag(group);
}

// Create a <g> element with correct attributes and children
function createComponentGroup(type) {
  const ns = "http://www.w3.org/2000/svg";
  const group = document.createElementNS(ns, "g");

  group.setAttribute("transform", "translate(100,100)");
  group.setAttribute("cursor", "move");
  group.classList.add("component");

  group.dataset.id = `comp-${componentId++}`;
  group.dataset.rotation = "0";
  group.dataset.num = componentId - 1;
  group.dataset.type = type;

  // Add SVG elements for this component
  const children = createShapeByType(type);
  children.forEach(el => group.appendChild(el));
  group.dataset.fill = SETTINGS.components[type].fill; // Store initial color

  // Add default label
  const label = document.createElementNS(ns, "text");
  label.textContent = "Label"; // default label text
  label.setAttribute("text-anchor", "middle");
  label.setAttribute("font-size", "16");
  label.setAttribute("pointer-events", "auto");
  label.setAttribute("style", "pointer-events:auto;");
  label.classList.add("component-label");

  // Position label above component by default
  // const comp = SETTINGS.components[type];
  // const labelY = -(comp.height ? comp.height / 2 : comp.radius) - 10;
  // label.setAttribute("x", 0);
  // label.setAttribute("y", labelY);

  group.appendChild(label);

  // Store label metadata for future use
  group.dataset.label = "Label";
  group.dataset.labelPos = "above";
  group.dataset.labelOffsetX = 0;
  group.dataset.labelOffsetY = 0;
  updateLabelPosition(group);

  applyLabelCounterRotation(group);

  return group;
}

// Return an array of SVG elements representing the given type
function createShapeByType(type) {
  if (SETTINGS.components[type]) {
    return SETTINGS.components[type].draw();
  }
  console.warn(`Unknown component type: ${type}`);
  return document.createElementNS("http://www.w3.org/2000/svg", "g");
}

// Brings all component elements to the front of the SVG stacking order.
function bringComponentsToFront() {
  const svg = document.getElementById("canvas");
  const components = svg.querySelectorAll("g.component");

  components.forEach(el => {
    svg.appendChild(el); // moves to end of DOM = top of rendering order
  });
}

// #endregion

// #region === Component Shapes ===

function createResistor() {
  const ns = "http://www.w3.org/2000/svg";
  const { stroke, fill, width, height } = SETTINGS.components.resistor;

  const rect = document.createElementNS(ns, "rect");
  rect.setAttribute("x", -width / 2);
  rect.setAttribute("y", -height / 2);
  rect.setAttribute("rx", 2); // slight rounded corners for a neat look
  rect.setAttribute("width", width);
  rect.setAttribute("height", height);
  rect.setAttribute("stroke", stroke);
  rect.setAttribute("stroke-width", "2");
  rect.setAttribute("fill", fill);

  /*
  const label = document.createElementNS(ns, "text");
  label.setAttribute("x", 0);
  label.setAttribute("y", 8);
  label.setAttribute("text-anchor", "middle");
  label.setAttribute("font-size", "20");
  label.textContent = "R";
  */


  // return [rect, label];
  return [rect];
}

function createVoltageSource() {
  const ns = "http://www.w3.org/2000/svg";
  const { radius, stroke, fill } = SETTINGS.components.voltage;

  const circle = document.createElementNS(ns, "circle");
  circle.setAttribute("cx", 0);
  circle.setAttribute("cy", 0);
  circle.setAttribute("r", radius);
  circle.setAttribute("fill", fill);
  circle.setAttribute("stroke", stroke);
  circle.setAttribute("stroke-width", "2");

  // Plus sign on bottom
  const plus = document.createElementNS(ns, "text");
  plus.setAttribute("x", 0);
  plus.setAttribute("y", radius / 2 + 5); // shifted downward
  plus.setAttribute("text-anchor", "middle");
  plus.setAttribute("font-size", "24");
  plus.textContent = "+";

  // Minus sign on top
  const minus = document.createElementNS(ns, "text");
  minus.setAttribute("x", 0);
  minus.setAttribute("y", -radius / 2 + 11); // shifted upward
  minus.setAttribute("text-anchor", "middle");
  minus.setAttribute("font-size", "24");
  minus.textContent = "–";
  return [circle, plus, minus];
}

function createCurrentSource() {
  const ns = "http://www.w3.org/2000/svg";
  const { radius, stroke, fill } = SETTINGS.components.current;

  const circle = document.createElementNS(ns, "circle");
  circle.setAttribute("cx", 0);
  circle.setAttribute("cy", 0);
  circle.setAttribute("r", radius);
  circle.setAttribute("fill", fill);
  circle.setAttribute("stroke", stroke);
  circle.setAttribute("stroke-width", "2");

  // Downward arrow
  const arrow = document.createElementNS(ns, "path");
  arrow.setAttribute("d", `M0,-${radius/2} L0,${radius/2} M-5,-${radius/4} L0,-${radius/2} L5,-${radius/4}`);
  arrow.setAttribute("stroke", "#000");
  arrow.setAttribute("fill", "none");
  arrow.setAttribute("stroke-width", "2");

  return [circle, arrow];
}

function createGroundSymbol() {
  const ns = "http://www.w3.org/2000/svg";
  const group = [];

  // Transparent hitbox (for easier clicking)
  const hitbox = document.createElementNS(ns, "rect");
  hitbox.setAttribute("x", -15);
  hitbox.setAttribute("y", -5);
  hitbox.setAttribute("width", 30);
  hitbox.setAttribute("height", 37);
  hitbox.setAttribute("fill", "transparent");
  hitbox.setAttribute("pointer-events", "all"); // Make it respond to mouse events
  hitbox.setAttribute("class", "hitbox");
  group.push(hitbox);

  // Ground lines
  const line1 = document.createElementNS(ns, "line");
  line1.setAttribute("x1", -15);
  line1.setAttribute("y1", 12);
  line1.setAttribute("x2", 15);
  line1.setAttribute("y2", 12);

  const line2 = document.createElementNS(ns, "line");
  line2.setAttribute("x1", -10);
  line2.setAttribute("y1", 18);
  line2.setAttribute("x2", 10);
  line2.setAttribute("y2", 18);

  const line3 = document.createElementNS(ns, "line");
  line3.setAttribute("x1", -4);
  line3.setAttribute("y1", 24);
  line3.setAttribute("x2", 4);
  line3.setAttribute("y2", 24);

  const line4 = document.createElementNS(ns, "line");
  line4.setAttribute("x1", 0);
  line4.setAttribute("y1", 0);
  line4.setAttribute("x2", 0);
  line4.setAttribute("y2", 12);

  [line1, line2, line3, line4].forEach(line => {
    line.setAttribute("stroke", "#000");
    line.setAttribute("stroke-width", "2");
  });

  group.push(line1, line2, line3, line4);
  return group;
}

function createCurrentArrow() {
  const ns = "http://www.w3.org/2000/svg";
  const group = [];

  // Transparent hitbox (for easier clicking)
  // const hitbox = document.createElementNS(ns, "rect");
  // hitbox.setAttribute("x", -15);
  // hitbox.setAttribute("y", -5);
  // hitbox.setAttribute("width", 30);
  // hitbox.setAttribute("height", 37);
  // hitbox.setAttribute("fill", "transparent");
  // hitbox.setAttribute("pointer-events", "all"); // Make it respond to mouse events
  // hitbox.setAttribute("class", "hitbox");
  // group.push(hitbox);

  // Arrow lines
  const line1 = document.createElementNS(ns, "line");
  line1.setAttribute("x1", 0);
  line1.setAttribute("y1", 20);
  line1.setAttribute("x2", 5);
  line1.setAttribute("y2", 25);

  const line2 = document.createElementNS(ns, "line");
  line2.setAttribute("x1", 0);
  line2.setAttribute("y1", 20);
  line2.setAttribute("x2", -5);
  line2.setAttribute("y2", 25);

  [line1, line2].forEach(line => {
    line.setAttribute("stroke", "#000");
    line.setAttribute("stroke-width", "2");
  });

  group.push(line1, line2);
  return group;
}

// #endregion

// #region === Labels ===

function startLabelEdit(labelEl) {
  const group = labelEl.closest("g.component");

  // Calculate absolute screen position with page scroll accounted
  const bbox = labelEl.getBoundingClientRect();
  const screenX = bbox.left + window.scrollX;
  const screenY = bbox.top + window.scrollY;

  // Create input element
  const input = document.createElement("input");
  input.type = "text";
  input.value = group.dataset.label;
  input.style.position = "absolute";
  input.style.left = `${screenX + bbox.width / 2}px`;
  input.style.top = `${screenY - 5}px`; // slightly above label
  input.style.transform = "translateX(-50%)";
  input.style.textAlign = "center";
  input.style.fontSize = `${bbox.height}px`;
  input.style.zIndex = "1000";
  input.style.background = "white";
  input.style.border = "1px solid black";
  input.style.padding = "2px";
  input.style.width = `${Math.max(bbox.width + 20, 60)}px`; // adapt width

  // Prevent interference
  input.addEventListener("mousedown", ev => ev.stopPropagation());

  document.body.appendChild(input);
  input.focus();
  input.select();

  // Save on blur or Enter
  input.addEventListener("blur", () => finishLabelEdit(input, labelEl, group));
  input.addEventListener("keydown", ev => {
    if (ev.key === "Enter") finishLabelEdit(input, labelEl, group);
  });
}

function finishLabelEdit(input, labelEl, group) {
  const newText = input.value.trim();
  group.dataset.label = newText;
  labelEl.textContent = newText;
  updateLabelPosition(group);
  document.body.removeChild(input);
}

function updateLabelPosition(group) {
  const label = group.querySelector(".component-label");
  if (!label) return;

  const comp = SETTINGS.components[group.dataset.type];
  const bbox = label.getBBox();
  const textWidth = bbox.width;

  const angleDeg = parseFloat(group.dataset.rotation) || 0;
  const angle = (angleDeg * Math.PI) / 180; // to radians

  // Base margin offsets (global frame)
  let marginX = 0, marginY = 0;
  const margin = 10;
  const w = comp.width || comp.radius * 2;
  const h = comp.height || comp.radius * 2;
  const centerOffset = comp.centerOffset || { x: 0, y: 0 };
  const normalizedAngle = ((angleDeg % 360) + 360) % 360;
  const rotated = (normalizedAngle === 90 || normalizedAngle === 270);

  // Use boxW and boxH for correct bounding box after rotation
  const boxW = rotated ? h : w;
  const boxH = rotated ? w : h;



  switch (group.dataset.labelPos) {
    case "above":
      marginY = -(boxH / 2 + margin);
      break;
    case "below":
      marginY = boxH / 2 + margin + 10;
      break;
    case "left":
      marginX = -(boxW / 2 + textWidth / 2 + margin);
      break;
    case "right":
      marginX = boxW / 2 + textWidth / 2 + margin;
      break;
  }

  marginX += centerOffset.x;
  marginY += centerOffset.y;

  // Transform global offset into the rotated <g> local coordinates
  const localX = marginX * Math.cos(-angle) - marginY * Math.sin(-angle);
  const localY = marginX * Math.sin(-angle) + marginY * Math.cos(-angle);

  // Reset previous transform
  label.removeAttribute("transform");

  // Read fine offsets from dataset
  const offsetX = parseFloat(group.dataset.labelOffsetX) || 0;
  const offsetY = parseFloat(group.dataset.labelOffsetY) || 0;

  // Apply fine offsets to local position
  const finalX = localX + offsetX;
  const finalY = localY + offsetY;

  // Set label position with offsets
  label.setAttribute("x", finalX);
  label.setAttribute("y", finalY);

  // Reapply counter-rotation
  applyLabelCounterRotation(group);
}

function applyLabelCounterRotation(group) {
  const label = group.querySelector(".component-label");
  if (!label) return;

  const angle = parseFloat(group.dataset.rotation) || 0;
  const x = parseFloat(label.getAttribute("x")) || 0;
  const y = parseFloat(label.getAttribute("y")) || 0;

  // ✅ Only apply counter-rotation around the label’s current (x,y)
  label.setAttribute("transform", `rotate(${-angle}, ${x}, ${y})`);
}

// #endregion

// #region === Wire Mode ===

function startWire(x, y) {
  wireStart = { x, y };
  wireDirection = null;

  previewWire = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  previewWire.setAttribute("fill", "none");
  previewWire.setAttribute("stroke", SETTINGS.wire.stroke);
  previewWire.setAttribute("stroke-width", SETTINGS.wire.width);
  previewWire.setAttribute("pointer-events", "none");
  canvas.appendChild(previewWire);
  bringComponentsToFront();
}

function updateWirePreview(endX, endY) {
  const dx = endX - wireStart.x;
  const dy = endY - wireStart.y;

  // Reset direction if movement becomes axis-aligned again
  if ((dx === 0 || dy === 0) && wireDirection !== null) {
    wireDirection = null;
  }

  // Lock direction based on dominant axis
  if (!wireDirection && (dx !== 0 || dy !== 0)) {
    wireDirection = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
  }

  let midX, midY;
  if (wireDirection === "x") {
    midX = endX;
    midY = wireStart.y;
  } else if (wireDirection === "y") {
    midX = wireStart.x;
    midY = endY;
  } else {
    return;
  }

  wireCurrentMid = { x: midX, y: midY };

  const points = `${wireStart.x},${wireStart.y} ${midX},${midY} ${endX},${endY}`;
  previewWire.setAttribute("points", points);
  bringComponentsToFront();
}

function commitWire(x, y) {
  if (wireStart.x === x && wireStart.y === y) return;
  if (!wireCurrentMid) return;

  const isStraight = (wireStart.x === x || wireStart.y === y);

  if (isStraight) {
    const id = `wire-${wireSegmentCounter++}`;
    wireSegments.push({ id, x1: wireStart.x, y1: wireStart.y, x2: x, y2: y });

    // Draw as individual line
    drawWireLine(id, wireStart.x, wireStart.y, x, y);
  } else {
    const id1 = `wire-${wireSegmentCounter++}`;
    wireSegments.push({ id: id1, x1: wireStart.x, y1: wireStart.y, x2: wireCurrentMid.x, y2: wireCurrentMid.y });
    drawWireLine(id1, wireStart.x, wireStart.y, wireCurrentMid.x, wireCurrentMid.y);

    const id2 = `wire-${wireSegmentCounter++}`;
    wireSegments.push({ id: id2, x1: wireCurrentMid.x, y1: wireCurrentMid.y, x2: x, y2: y });
    drawWireLine(id2, wireCurrentMid.x, wireCurrentMid.y, x, y);
  }

  // Reset for next segment
  wireStart = { x, y };
  wireDirection = null;
  previewWire.remove();
  previewWire = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  previewWire.setAttribute("fill", "none");
  previewWire.setAttribute("stroke", SETTINGS.wire.stroke);
  previewWire.setAttribute("stroke-width", SETTINGS.wire.width);
  previewWire.setAttribute("pointer-events", "none");
  canvas.appendChild(previewWire);
  mergeCollinearWires(wireSegments);
}

function drawWireLine(id, x1, y1, x2, y2) {
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.dataset.id = id;
  line.setAttribute("x1", x1);
  line.setAttribute("y1", y1);
  line.setAttribute("x2", x2);
  line.setAttribute("y2", y2);
  line.setAttribute("stroke", "#000");
  // Find this wire in wireSegments
  const seg = wireSegments.find(s => s.id === id);

  // Use per-wire color if available
  const strokeColor = seg?.color || SETTINGS.wire.stroke;
  const strokeWidth = seg?.width || SETTINGS.wire.width;

  line.setAttribute("stroke", strokeColor);
  line.setAttribute("stroke-width", strokeWidth);
  canvas.appendChild(line);

  enableWireDrag(line);
  bringComponentsToFront();
}

function activateWireMode() {
  clearSelection();
  wireMode = true;
  wireStart = null;
  wireDirection = null;

  // Optional: visually indicate mode
  canvas.style.cursor = "crosshair";
}

function exitWireMode() {
  wireMode = false;
  wireStart = null;
  wireDirection = null;
  wireCurrentMid = null;

  if (previewWire) {
    previewWire.remove();
    previewWire = null;
  }

  document.getElementById("canvas").style.cursor = "default";
}

function mergeCollinearWires(segments) {
  const horizontal = [];
  const vertical = [];

  // Separate horizontal and vertical wires
  for (const seg of segments) {
    if (seg.y1 === seg.y2) horizontal.push(seg);
    else if (seg.x1 === seg.x2) vertical.push(seg);
  }

  const groupBy = (arr, keyFn) => {
    const grouped = {};
    for (const seg of arr) {
      const key = keyFn(seg);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(seg);
    }
    return grouped;
  };

  const horizGrouped = groupBy(horizontal, seg => seg.y1);
  const vertGrouped = groupBy(vertical, seg => seg.x1);

  function mergeLineSegments(grouped, isHorizontal) {
    const merged = [];
    for (const segs of Object.values(grouped)) {
      segs.sort((a, b) => {
        const aStart = isHorizontal ? Math.min(a.x1, a.x2) : Math.min(a.y1, a.y2);
        const bStart = isHorizontal ? Math.min(b.x1, b.x2) : Math.min(b.y1, b.y2);
        return aStart - bStart;
      });

      let currentStart = isHorizontal ? Math.min(segs[0].x1, segs[0].x2) : Math.min(segs[0].y1, segs[0].y2);
      let currentEnd = isHorizontal ? Math.max(segs[0].x1, segs[0].x2) : Math.max(segs[0].y1, segs[0].y2);
      const constantCoord = isHorizontal ? segs[0].y1 : segs[0].x1;

      for (let i = 1; i < segs.length; i++) {
        const sStart = isHorizontal ? Math.min(segs[i].x1, segs[i].x2) : Math.min(segs[i].y1, segs[i].y2);
        const sEnd = isHorizontal ? Math.max(segs[i].x1, segs[i].x2) : Math.max(segs[i].y1, segs[i].y2);

        if (sStart <= currentEnd) {
          currentEnd = Math.max(currentEnd, sEnd);
        } else {
          merged.push(isHorizontal
            ? { x1: currentStart, y1: constantCoord, x2: currentEnd, y2: constantCoord }
            : { x1: constantCoord, y1: currentStart, x2: constantCoord, y2: currentEnd }
          );
          currentStart = sStart;
          currentEnd = sEnd;
        }
      }

      merged.push(isHorizontal
        ? { x1: currentStart, y1: constantCoord, x2: currentEnd, y2: constantCoord }
        : { x1: constantCoord, y1: currentStart, x2: constantCoord, y2: currentEnd }
      );
    }
    return merged;
  }

  // Merge and reassign IDs
  const merged = [
    ...mergeLineSegments(horizGrouped, true),
    ...mergeLineSegments(vertGrouped, false)
  ].map((seg, idx) => {
    // Try to find original segment to copy color/width
    const original = wireSegments.find(s =>
      (s.x1 === seg.x1 && s.y1 === seg.y1 && s.x2 === seg.x2 && s.y2 === seg.y2) ||
      (s.x1 === seg.x2 && s.y1 === seg.y2 && s.x2 === seg.x1 && s.y2 === seg.y1)
    );
  
    return {
      id: `wire-${idx}`,
      ...seg,
      color: original?.color || SETTINGS.wire.stroke,
      width: original?.width || SETTINGS.wire.width
    };
  });
  

  // Update global data
  wireSegments.length = 0;
  wireSegments.push(...merged);

  // Clear old wires from DOM
  document.querySelectorAll('line[data-id^="wire-"]').forEach(el => el.remove());

  // Redraw merged wires
  merged.forEach(seg => drawWireLine(seg.id, seg.x1, seg.y1, seg.x2, seg.y2));

  bringComponentsToFront();
  return merged;
}

// #endregion

// #region === Dragging ===

// Enables dragging for a single SVG component element
function enableDrag(element) {
  const svg = document.getElementById("canvas");
  let startMouseX = 0, startMouseY = 0;
  let initialPositions = [];
  let wirePositions = [];

  // Triggered as the mouse moves while dragging
  const onMouseMove = (e) => {
    const cursorPt = getSVGCoordinates(e, svg);
    const dx = cursorPt.x - startMouseX;
    const dy = cursorPt.y - startMouseY;
  
    const padding = 20;
    const svgWidth = svg.clientWidth;
    const svgHeight = svg.clientHeight;
  
    // Move all selected components
    initialPositions.forEach(pos => {
      const rotation = parseInt(pos.el.dataset.rotation) || 0;
      let newX = pos.x + dx;
      let newY = pos.y + dy;
  
      // Snap & Clamp to grid
      newX = snapAndClamp(newX, padding, svgWidth - padding);
      newY = snapAndClamp(newY, padding, svgHeight - padding);
  
      moveComponent(pos.el, newX, newY, rotation);
    });

        // Move selected wires too
    wirePositions.forEach(pos => {
      const newX1 = pos.x1 + dx;
      const newY1 = pos.y1 + dy;
      const newX2 = pos.x2 + dx;
      const newY2 = pos.y2 + dy;
      moveWire(pos.el, newX1, newY1, newX2, newY2);
    });
  };
  

  // Clean up when mouse is released
  const onMouseUp = () => {
    isDraggingComponent = false;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);

    // Snap wires to grid and update wireSegments
    wirePositions.forEach(pos => {
      const id = pos.el.dataset.id;
      const seg = wireSegments.find(s => s.id === id);
      if (seg) {
        // Snap endpoints
        seg.x1 = snapAndClamp(parseFloat(pos.el.getAttribute("x1")), 0, svg.clientWidth);
        seg.y1 = snapAndClamp(parseFloat(pos.el.getAttribute("y1")), 0, svg.clientHeight);
        seg.x2 = snapAndClamp(parseFloat(pos.el.getAttribute("x2")), 0, svg.clientWidth);
        seg.y2 = snapAndClamp(parseFloat(pos.el.getAttribute("y2")), 0, svg.clientHeight);

        // Apply snapped values back to DOM
        pos.el.setAttribute("x1", seg.x1);
        pos.el.setAttribute("y1", seg.y1);
        pos.el.setAttribute("x2", seg.x2);
        pos.el.setAttribute("y2", seg.y2);
      }
    });
  };

  // Start the drag operation
  element.addEventListener("mousedown", (e) => {
    if (wireMode) {
      e.stopPropagation();
      return;
    }
    // SHIFT+CLICK: Add to selection and exit early
    if (e.shiftKey) {
      element.classList.toggle("selected");
      e.stopPropagation();
      return;
    }
    // If this component wasn’t selected, clear previous selections
    if (!element.classList.contains("selected")) {
      clearSelection();
      element.classList.add("selected");
    }

    isDraggingComponent = true;

    const cursorPt = getSVGCoordinates(e, svg);
    startMouseX = cursorPt.x;
    startMouseY = cursorPt.y;

    // Save positions of all currently selected components
    initialPositions = [];
    document.querySelectorAll("g.component.selected").forEach(sel => {
      const [sx, sy] = getTransformXY(sel);
      initialPositions.push({ el: sel, x: sx, y: sy });
    });

    // Also store initial positions of selected wires
    wirePositions = [];
    document.querySelectorAll("line.selected").forEach(line => {
      wirePositions.push({
        el: line,
        x1: parseFloat(line.getAttribute("x1")),
        y1: parseFloat(line.getAttribute("y1")),
        x2: parseFloat(line.getAttribute("x2")),
        y2: parseFloat(line.getAttribute("y2"))
      });
    });

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  });
}

// Enables dragging for wire elements
function enableWireDrag(lineElement) {
  const svg = document.getElementById("canvas");
  let startMouseX = 0, startMouseY = 0;
  let initialPositions = [];
  let componentPositions = [];

  const onMouseMove = (e) => {
    const cursorPt = getSVGCoordinates(e, svg);
    const dx = cursorPt.x - startMouseX;
    const dy = cursorPt.y - startMouseY;

    initialPositions.forEach(pos => {
      const newX1 = pos.x1 + dx;
      const newY1 = pos.y1 + dy;
      const newX2 = pos.x2 + dx;
      const newY2 = pos.y2 + dy;

      moveWire(pos.el, newX1, newY1, newX2, newY2);
    });
    
    // Move selected components too
    componentPositions.forEach(pos => {
      const rotation = parseInt(pos.el.dataset.rotation) || 0;
      const newX = pos.x + dx;
      const newY = pos.y + dy;
      moveComponent(pos.el, newX, newY, rotation);
    });
  };

  const onMouseUp = () => {
    isDraggingComponent = false;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);

    // Snap to grid & update wireSegments data
    initialPositions.forEach(pos => {
      const id = pos.el.dataset.id;
      const seg = wireSegments.find(s => s.id === id);
      if (seg) {
        seg.x1 = snapAndClamp(parseFloat(pos.el.getAttribute("x1")), 0, svg.clientWidth);
        seg.y1 = snapAndClamp(parseFloat(pos.el.getAttribute("y1")), 0, svg.clientHeight);
        seg.x2 = snapAndClamp(parseFloat(pos.el.getAttribute("x2")), 0, svg.clientWidth);
        seg.y2 = snapAndClamp(parseFloat(pos.el.getAttribute("y2")), 0, svg.clientHeight);

        pos.el.setAttribute("x1", seg.x1);
        pos.el.setAttribute("y1", seg.y1);
        pos.el.setAttribute("x2", seg.x2);
        pos.el.setAttribute("y2", seg.y2);
      }
    });

    // Snap selected components to grid
    componentPositions.forEach(pos => {
      const [currentX, currentY] = getTransformXY(pos.el);
      const snappedX = snapAndClamp(currentX, 0, svg.clientWidth);
      const snappedY = snapAndClamp(currentY, 0, svg.clientHeight);
      const rotation = parseInt(pos.el.dataset.rotation) || 0;

      // Apply snapped position back
      pos.el.setAttribute("transform", `translate(${snappedX},${snappedY}) rotate(${rotation})`);
    });
  };

  lineElement.addEventListener("mousedown", (e) => {
    if (wireMode) {
      e.stopPropagation();
      return;
    }
    // SHIFT+CLICK: Add to selection and exit early
    if (e.shiftKey) {
      lineElement.classList.toggle("selected");
      e.stopPropagation();
      return;
    }
    // If not already selected, clear others and select this wire
    if (!lineElement.classList.contains("selected")) {
      clearSelection();
      lineElement.classList.add("selected");
    }

    isDraggingComponent = true;

    const cursorPt = getSVGCoordinates(e, svg);
    startMouseX = cursorPt.x;
    startMouseY = cursorPt.y;

    // Get all selected wires
    initialPositions = [];
    document.querySelectorAll("line.selected").forEach(sel => {
      initialPositions.push({
        el: sel,
        x1: parseFloat(sel.getAttribute("x1")),
        y1: parseFloat(sel.getAttribute("y1")),
        x2: parseFloat(sel.getAttribute("x2")),
        y2: parseFloat(sel.getAttribute("y2"))
      });
    });

    // Also store initial positions of selected components
    componentPositions = [];
    document.querySelectorAll("g.component.selected").forEach(sel => {
      const [sx, sy] = getTransformXY(sel);
      componentPositions.push({ el: sel, x: sx, y: sy });
    });


    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  });
}

// Moves a component to a new (x, y) position with rotation
function moveComponent(el, x, y, rotation) {
  el.setAttribute("transform", `translate(${x},${y}) rotate(${rotation})`);
}

// Updates a wire element's endpoints to new coordinates
function moveWire(el, x1, y1, x2, y2) {
  el.setAttribute("x1", x1);
  el.setAttribute("y1", y1);
  el.setAttribute("x2", x2);
  el.setAttribute("y2", y2);
}

// #endregion

// #region === Event Bindings ===

canvas.addEventListener("mousedown", (e) => {
  if (e.target.classList.contains("component-label")) {
    e.preventDefault();
    startLabelEdit(e.target);
    return;                 
  }
  if (e.button !== 0 || isDraggingComponent || wireMode) return;

  clearSelection();

  document.body.classList.add("noselect");

  const pt = getSVGCoordinates(e, canvas);
  selectStart = pt;

  selectionBox = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  selectionBox.setAttribute("stroke", "red");
  selectionBox.setAttribute("stroke-width", "1");
  selectionBox.setAttribute("fill", "rgba(255,0,0,0.1)");
  selectionBox.setAttribute("pointer-events", "none");

  canvas.appendChild(selectionBox);
});

canvas.addEventListener("mousemove", (e) => {
  if (!selectStart || !selectionBox) return;

  const pt = getSVGCoordinates(e, canvas);

  const x = Math.min(selectStart.x, pt.x);
  const y = Math.min(selectStart.y, pt.y);
  const width = Math.abs(pt.x - selectStart.x);
  const height = Math.abs(pt.y - selectStart.y);

  selectionBox.setAttribute("x", x);
  selectionBox.setAttribute("y", y);
  selectionBox.setAttribute("width", width);
  selectionBox.setAttribute("height", height);
});

window.addEventListener("mouseup", () => {
  const bounds = getSelectionBounds();

  // Remove selection rectangle
  if (selectionBox) {
    selectionBox.remove();
    selectionBox = null;
    selectStart = null;
  }

  document.body.classList.remove("noselect");
  if (!bounds) return;

  const selectedWires = [];
  const selectedComponents = [];

  // === Check wire intersections ===
  wireSegments.forEach(seg => {
    if (wireIntersectsSelection(seg, bounds)) {
      selectedWires.push(seg.id);
    }
  });

  // Apply style to selected wires
  selectedWires.forEach(id => {
    const el = document.querySelector(`[data-id="${id}"]`);
    if (el) el.classList.add("selected");
  });

  // === Check component intersections ===
  document.querySelectorAll("g.component").forEach(el => {
    if (componentIntersectsSelection(el, bounds)) {
      el.classList.add("selected");
      selectedComponents.push(el.dataset.id);
    }
  });
});

window.addEventListener("keydown", (e) => {
  if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") {
    return;
  }

  if (e.key === "Escape" && wireMode) {
    exitWireMode();
  }

  // 🔁 Rotate selected component on 'r' key
  if (e.key === "r") {
    // Get all selected components
    const selectedComponents = document.querySelectorAll("g.component.selected");
  
    selectedComponents.forEach(selected => {
      let rotation = parseInt(selected.dataset.rotation || "0");
      rotation = (rotation + 90) % 360;
      selected.dataset.rotation = rotation;
  
      // Get current position (translate stays the same)
      const [x, y] = getTransformXY(selected);
  
      // Apply updated transform
      selected.setAttribute("transform", `translate(${x},${y}) rotate(${rotation})`);

      updateLabelPosition(selected);
    });
  }  

  // 🗑️ Delete selected components and wires
  if (e.key === "Delete") {
    deleteSelectedElements();
  }
  
  // ✅ Close dropdown and clear selection when pressing Esc
  if (e.key === "Escape") {
    clearSelection();                           // remove selected state
    editDropdown.style.display = "none";        // hide dropdown
    return;                                     // stop further handling
  }

  // ✅ WASD label positioning
  if (["w", "a", "s", "d"].includes(e.key.toLowerCase())) {
    const direction = { w: "above", a: "left", s: "below", d: "right" }[e.key.toLowerCase()];
    document.querySelectorAll("g.component.selected").forEach(group => {
      group.dataset.labelPos = direction;
      updateLabelPosition(group);
    });
  }
});

canvas.addEventListener("mousemove", (e) => {
  if (!wireMode || !wireStart || !previewWire) return;

  const pt = canvas.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const svgPt = pt.matrixTransform(canvas.getScreenCTM().inverse());

  const endX = Math.round(svgPt.x / GRID_SIZE) * GRID_SIZE;
  const endY = Math.round(svgPt.y / GRID_SIZE) * GRID_SIZE;

  updateWirePreview(endX, endY);
});

canvas.addEventListener("click", (e) => {
  const pt = canvas.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const svgPt = pt.matrixTransform(canvas.getScreenCTM().inverse());

  const x = Math.round(svgPt.x / GRID_SIZE) * GRID_SIZE;
  const y = Math.round(svgPt.y / GRID_SIZE) * GRID_SIZE;

  if (!wireStart) {
    startWire(x, y);
  } else {
    commitWire(x, y);
  }
});

canvas.addEventListener("dblclick", (e) => {
  e.preventDefault();
  if (wireMode) {
    exitWireMode();
  }
});

// #endregion

// #region === Export ===

function exportComponentData() {
  const svg = document.getElementById("canvas");
  const output = document.getElementById("output");

  // === Export components ===
  const components = svg.querySelectorAll("g.component");
  const componentData = [];

  components.forEach((el) => {
    const id = el.dataset.id;
    const type = el.dataset.type;

    const transform = el.getAttribute("transform");
    const match = /translate\(([-\d.]+),([-\d.]+)\)/.exec(transform);
    const rotationMatch = /rotate\(([-\d.]+)\)/.exec(transform);

    const rotation = rotationMatch ? parseFloat(rotationMatch[1]) : 0;
    const [x, y] = match ? [parseFloat(match[1]), parseFloat(match[2])] : [0, 0];

    if (type) {
      // detect component color (use fill or fallback to SETTINGS)
      const shape = el.querySelector("rect, circle");
      const fill = shape?.getAttribute("fill") || SETTINGS.components[type].fill;
    
      componentData.push({
        id,
        type,
        x,
        y,
        rotation,
        color: fill,
        label: {
          text: el.dataset.label || "",
          pos: el.dataset.labelPos || "above",
          offsetX: parseFloat(el.dataset.labelOffsetX) || 0,
          offsetY: parseFloat(el.dataset.labelOffsetY) || 0
        }
      });
    }
    
  });

  // === Export wires after merging collinear segments ===
  const mergedWires = mergeCollinearWires(wireSegments);

  const wires = mergedWires.map((seg) => ({
    id: seg.id,
    x1: seg.x1,
    y1: seg.y1,
    x2: seg.x2,
    y2: seg.y2,
    color: seg.color || SETTINGS.wire.stroke,       // store wire color
    thickness: seg.width || SETTINGS.wire.width     // store wire thickness
  }));

  // === Final output ===
  output.textContent = JSON.stringify(
    { components: componentData, wires },
    null,
    2
  );
  // --- Auto-download JSON export ---
  const jsonData = JSON.stringify({ components: componentData, wires }, null, 2);
  const blob = new Blob([jsonData], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "export.json";  // File name when downloaded
  a.click();
  URL.revokeObjectURL(url);
}

// #endregion

// #region === Selection Editor ===
const editBtn = document.getElementById("editSelectedBtn");
const editDropdown = document.getElementById("editDropdown");
const colorControl = document.getElementById("colorControl");
const colorPicker = document.getElementById("selectedColor");
const widthControl = document.getElementById("widthControl");
const wireWidthSlider = document.getElementById("selectedWireWidth");
const labelControl = document.getElementById("labelControl");
const labelInputDropdown = document.getElementById("dropdownLabelInput");
const labelPosDropdown = document.getElementById("dropdownLabelPos");
const offsetXInput = document.getElementById("labelOffsetX");
const offsetYInput = document.getElementById("labelOffsetY");
const resetOffsetBtn = document.getElementById("resetLabelOffset");


// Toggle dropdown only if something is selected
editBtn.addEventListener("click", () => {
  const selectedComponents = document.querySelectorAll("g.component.selected");
  const selectedWires = document.querySelectorAll("line.selected");
  if (selectedWires.length > 0) {
    const widthAttr = selectedWires[0].getAttribute("stroke-width");
    wireWidthSlider.value = widthAttr ? parseInt(widthAttr) : SETTINGS.wire.width;
  }

  // If nothing is selected, don't open dropdown
  if (selectedComponents.length === 0 && selectedWires.length === 0) {
    editDropdown.style.display = "none";
    return;
  }

  // Determine the current color of the first selected element
  let currentColor = "#ff0000";

  if (selectedComponents.length > 0) {
    const comp = selectedComponents[0];
    const shape = comp.children[0];
    let shapeFill = shape ? shape.getAttribute("fill") : null;
    if (!shapeFill) {
      shapeFill = SETTINGS.components[comp.dataset.type]?.fill || "#ff0000";
    }
    currentColor = normalizeHex(shapeFill.startsWith("#") ? shapeFill : rgbToHex(shapeFill));
  } else if (selectedWires.length > 0) {
    // Use stored color if available, fallback to stroke attribute
    const seg = wireSegments.find(s => s.id === selectedWires[0].dataset.id);
    if (seg && seg.color) {
      currentColor = seg.color;
    } else {
      const stroke = selectedWires[0].getAttribute("stroke");
      currentColor = stroke ? rgbToHex(stroke) : SETTINGS.wire.stroke;
    }
  }
  
  // Set picker value
  colorPicker.value = currentColor;

  // Always show color picker
  colorControl.style.display = "block";

  // Show wire width slider if any wires are selected
  widthControl.style.display = selectedWires.length > 0 ? "block" : "none";

  // Toggle dropdown
  editDropdown.style.display =
    editDropdown.style.display === "none" ? "block" : "none";

  if (selectedComponents.length > 0) {
    labelControl.style.display = "block";

    const firstLabel = selectedComponents[0].dataset.label;
    const allSame = Array.from(selectedComponents).every(el => el.dataset.label === firstLabel);
    labelInputDropdown.value = allSame ? firstLabel : "";
    labelPosDropdown.value = selectedComponents[0].dataset.labelPos || "above";

    const firstComp = selectedComponents[0];
    offsetXInput.value = firstComp.dataset.labelOffsetX || 0;
    offsetYInput.value = firstComp.dataset.labelOffsetY || 0;

  } else {
    labelControl.style.display = "none";
  }

});


// Change color of selected elements (wires + components)
colorPicker.addEventListener("input", (e) => {
  const newColor = e.target.value;

  // Components → update fill and store in SETTINGS
  document.querySelectorAll("g.component.selected").forEach((comp) => {
    const shape = comp.querySelector("rect, circle");
    if (shape) shape.setAttribute("fill", newColor);

    // Store updated color for this component type
    SETTINGS.components[comp.dataset.type].fill = newColor;
  });

  // Wires → update stroke and store in wireSegments
  document.querySelectorAll("line.selected").forEach((line) => {
    line.setAttribute("stroke", newColor);

    // Persist wire color in wireSegments for detection later
    const seg = wireSegments.find(s => s.id === line.dataset.id);
    if (seg) seg.color = newColor;
  });

  // Also update default wire color for new wires
  // SETTINGS.wire.stroke = newColor;
});


// Change width of selected wires
wireWidthSlider.addEventListener("input", (e) => {
  const newWidth = parseInt(e.target.value);

  // Apply to selected wires
  document.querySelectorAll("line.selected").forEach((line) => {
    line.setAttribute("stroke-width", newWidth);

    // Store width in wireSegments for export
    const seg = wireSegments.find(s => s.id === line.dataset.id);
    if (seg) seg.width = newWidth;
  });

  // Track this width in SETTINGS for future wires
  SETTINGS.wire.width = newWidth;
});


// Close dropdown when clicking anywhere outside the dropdown & button
document.addEventListener("click", (e) => {
  const isClickInside = editBtn.contains(e.target) || editDropdown.contains(e.target);

  // Only close if it's open and the click is outside
  if (editDropdown.style.display === "block" && !isClickInside) {
    editDropdown.style.display = "none";
  }
});

labelInputDropdown.addEventListener("input", () => {
  const newText = labelInputDropdown.value.trim();
  document.querySelectorAll("g.component.selected").forEach(group => {
    if (newText !== "") {
      group.dataset.label = newText;
      const label = group.querySelector(".component-label");
      if (label) label.textContent = newText;
      updateLabelPosition(group);
    }
  });
});

labelPosDropdown.addEventListener("change", () => {
  const newPos = labelPosDropdown.value;
  document.querySelectorAll("g.component.selected").forEach(group => {
    group.dataset.labelPos = newPos;
    updateLabelPosition(group);
  });
});

// ✅ When user changes X offset
offsetXInput.addEventListener("input", () => {
  document.querySelectorAll("g.component.selected").forEach(group => {
    group.dataset.labelOffsetX = offsetXInput.value;
    updateLabelPosition(group);
  });
});

// ✅ When user changes Y offset
offsetYInput.addEventListener("input", () => {
  document.querySelectorAll("g.component.selected").forEach(group => {
    group.dataset.labelOffsetY = offsetYInput.value;
    updateLabelPosition(group);
  });
});

// ✅ Reset offsets button
resetOffsetBtn.addEventListener("click", () => {
  offsetXInput.value = 0;
  offsetYInput.value = 0;
  document.querySelectorAll("g.component.selected").forEach(group => {
    group.dataset.labelOffsetX = 0;
    group.dataset.labelOffsetY = 0;
    updateLabelPosition(group);
  });
});


// #endregion