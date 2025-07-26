// #region === Global Constants and State ===

// Canvas and grid setup
const GRID_SIZE = 40;
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

// #endregion

// #region === Component Handling ===

function addComponent(type) {
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

  // Plus sign on top
  const plus = document.createElementNS(ns, "text");
  plus.setAttribute("x", 0);
  plus.setAttribute("y", -radius / 2 + 11); // shifted upward
  plus.setAttribute("text-anchor", "middle");
  plus.setAttribute("font-size", "24");
  plus.textContent = "+";

  // Minus sign on bottom
  const minus = document.createElementNS(ns, "text");
  minus.setAttribute("x", 0);
  minus.setAttribute("y", radius / 2 + 5); // shifted downward
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
  arrow.setAttribute("d", `M0,-${radius/2} L0,${radius/2} M-5,${radius/4} L0,${radius/2} L5,${radius/4}`);
  arrow.setAttribute("stroke", "#000");
  arrow.setAttribute("fill", "none");
  arrow.setAttribute("stroke-width", "2");

  return [circle, arrow];
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

    // ✅ Draw as individual line
    drawWireLine(id, wireStart.x, wireStart.y, x, y);
  } else {
    const id1 = `wire-${wireSegmentCounter++}`;
    wireSegments.push({ id: id1, x1: wireStart.x, y1: wireStart.y, x2: wireCurrentMid.x, y2: wireCurrentMid.y });
    drawWireLine(id1, wireStart.x, wireStart.y, wireCurrentMid.x, wireCurrentMid.y);

    const id2 = `wire-${wireSegmentCounter++}`;
    wireSegments.push({ id: id2, x1: wireCurrentMid.x, y1: wireCurrentMid.y, x2: x, y2: y });
    drawWireLine(id2, wireCurrentMid.x, wireCurrentMid.y, x, y);
  }

  // ✅ Reset for next segment
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
  

  // ✅ Update global data
  wireSegments.length = 0;
  wireSegments.push(...merged);

  // ✅ Clear old wires from DOM
  document.querySelectorAll('line[data-id^="wire-"]').forEach(el => el.remove());

  // ✅ Redraw merged wires
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
  
      // ✅ Snap & Clamp to grid
      newX = snapAndClamp(newX, padding, svgWidth - padding);
      newY = snapAndClamp(newY, padding, svgHeight - padding);
  
      moveComponent(pos.el, newX, newY, rotation);
    });

        // ✅ Move selected wires too
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

    // ✅ Snap wires to grid and update wireSegments
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
    // ✅ If this component wasn’t selected, clear previous selections
    if (!element.classList.contains("selected")) {
      document.querySelectorAll(".selected").forEach(el => el.classList.remove("selected"));
      element.classList.add("selected");
    }

    isDraggingComponent = true;

    const cursorPt = getSVGCoordinates(e, svg);
    startMouseX = cursorPt.x;
    startMouseY = cursorPt.y;

    // ✅ Save positions of all currently selected components
    initialPositions = [];
    document.querySelectorAll("g.component.selected").forEach(sel => {
      const [sx, sy] = getTransformXY(sel);
      initialPositions.push({ el: sel, x: sx, y: sy });
    });

    // ✅ Also store initial positions of selected wires
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
    
    // ✅ Move selected components too
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

    // ✅ Snap to grid & update wireSegments data
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

    // ✅ Snap selected components to grid
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
    // ✅ If not already selected, clear others and select this wire
    if (!lineElement.classList.contains("selected")) {
      document.querySelectorAll(".selected").forEach(el => el.classList.remove("selected"));
      lineElement.classList.add("selected");
    }

    isDraggingComponent = true;

    const cursorPt = getSVGCoordinates(e, svg);
    startMouseX = cursorPt.x;
    startMouseY = cursorPt.y;

    // ✅ Get all selected wires
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

    // ✅ Also store initial positions of selected components
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
  if (e.button !== 0 || isDraggingComponent || wireMode) return;

  document.querySelectorAll(".selected").forEach(el => el.classList.remove("selected"));

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

  // ✅ Remove selection rectangle
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
  if (e.key === "Escape" && wireMode) {
    exitWireMode();
  }

  // 🔁 Rotate selected component on 'r' key
  if (e.key === "r") {
    // ✅ Get all selected components
    const selectedComponents = document.querySelectorAll("g.component.selected");
  
    selectedComponents.forEach(selected => {
      let rotation = parseInt(selected.dataset.rotation || "0");
      rotation = (rotation + 90) % 360;
      selected.dataset.rotation = rotation;
  
      // ✅ Get current position (translate stays the same)
      const [x, y] = getTransformXY(selected);
  
      // ✅ Apply updated transform
      selected.setAttribute("transform", `translate(${x},${y}) rotate(${rotation})`);
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
        color: fill // include current component color
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
}

// #endregion

// #region === SIMPLE SELECTION EDITOR ===
const editBtn = document.getElementById("editSelectedBtn");
const editDropdown = document.getElementById("editDropdown");
const colorControl = document.getElementById("colorControl");
const colorPicker = document.getElementById("selectedColor");
const widthControl = document.getElementById("widthControl");
const wireWidthSlider = document.getElementById("selectedWireWidth");

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

// #endregion