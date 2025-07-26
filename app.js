// === Global Constants and State ===

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

// === Helper Functions ===

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

// === Initialization ===
window.onload = () => drawGrid();

// === Grid Drawing ===
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

// === Component Handling ===

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

  return group;
}

// Return an array of SVG elements representing the given type
function createShapeByType(type) {
  switch (type) {
    case "resistor": return createResistor();
    case "voltage": return createVoltageSource();
    case "current": return createCurrentSource();
    default: return [];
  }
}

// Brings all component elements to the front of the SVG stacking order.
function bringComponentsToFront() {
  const svg = document.getElementById("canvas");
  const components = svg.querySelectorAll("g.component");

  components.forEach(el => {
    svg.appendChild(el); // moves to end of DOM = top of rendering order
  });
}

// === Component Shapes ===

function createResistor() {
  const ns = "http://www.w3.org/2000/svg";

  const rect = document.createElementNS(ns, "rect");
  rect.setAttribute("x", -40);
  rect.setAttribute("y", -20);
  rect.setAttribute("width", 80);
  rect.setAttribute("height", 40);
  rect.setAttribute("fill", "#ddd");
  rect.setAttribute("stroke", "#333");

  const label = document.createElementNS(ns, "text");
  label.setAttribute("x", 0);
  label.setAttribute("y", 8);
  label.setAttribute("text-anchor", "middle");
  label.setAttribute("font-size", "20");
  label.textContent = "R";

  return [rect, label];
}

function createVoltageSource() {
  const ns = "http://www.w3.org/2000/svg";

  const circle = document.createElementNS(ns, "circle");
  circle.setAttribute("cx", 0);
  circle.setAttribute("cy", 0);
  circle.setAttribute("r", 30);
  circle.setAttribute("fill", "#eef");
  circle.setAttribute("stroke", "#333");

  const label = document.createElementNS(ns, "text");
  label.setAttribute("x", 0);
  label.setAttribute("y", 8);
  label.setAttribute("text-anchor", "middle");
  label.setAttribute("font-size", "20");
  label.textContent = "V";

  return [circle, label];
}

function createCurrentSource() {
  const ns = "http://www.w3.org/2000/svg";

  const circle = document.createElementNS(ns, "circle");
  circle.setAttribute("cx", 0);
  circle.setAttribute("cy", 0);
  circle.setAttribute("r", 30);
  circle.setAttribute("fill", "#efe");
  circle.setAttribute("stroke", "#333");

  const arrow = document.createElementNS(ns, "path");
  arrow.setAttribute("d", "M0,-14 L0,14 M-6,8 L0,14 L6,8");
  arrow.setAttribute("stroke", "#000");
  arrow.setAttribute("fill", "none");
  arrow.setAttribute("stroke-width", "2");

  return [circle, arrow];
}

// === Dragging ===

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
  
      pos.el.setAttribute("transform", `translate(${newX},${newY}) rotate(${rotation})`);
    });

        // ✅ Move selected wires too
    wirePositions.forEach(pos => {
      const newX1 = pos.x1 + dx;
      const newY1 = pos.y1 + dy;
      const newX2 = pos.x2 + dx;
      const newY2 = pos.y2 + dy;
      pos.el.setAttribute("x1", newX1);
      pos.el.setAttribute("y1", newY1);
      pos.el.setAttribute("x2", newX2);
      pos.el.setAttribute("y2", newY2);
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

// === Selection ===

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

  switch (el.dataset.type) {
    case "resistor":
      width = 80; height = 40;
      break;
    case "voltage":
    case "current":
      width = 60; height = 60;
      break;
    default:
      return false;
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


// === Wire Mode ===

function startWire(x, y) {
  wireStart = { x, y };
  wireDirection = null;

  previewWire = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  previewWire.setAttribute("fill", "none");
  previewWire.setAttribute("stroke", "#000");
  previewWire.setAttribute("stroke-width", "2");
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
  previewWire.setAttribute("stroke", "#000");
  previewWire.setAttribute("stroke-width", "2");
  canvas.appendChild(previewWire);
  mergeCollinearWires(wireSegments);
}

function drawWireLine(id, x1, y1, x2, y2) {
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", x1);
  line.setAttribute("y1", y1);
  line.setAttribute("x2", x2);
  line.setAttribute("y2", y2);
  line.setAttribute("stroke", "#000");
  line.setAttribute("stroke-width", "2");
  line.setAttribute("data-id", id);
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
  ].map((seg, idx) => ({ id: `wire-${idx}`, ...seg }));

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

      pos.el.setAttribute("x1", newX1);
      pos.el.setAttribute("y1", newY1);
      pos.el.setAttribute("x2", newX2);
      pos.el.setAttribute("y2", newY2);
    });
    
    // ✅ Move selected components too
    componentPositions.forEach(pos => {
      const rotation = parseInt(pos.el.dataset.rotation) || 0;
      const newX = pos.x + dx;
      const newY = pos.y + dy;
      pos.el.setAttribute("transform", `translate(${newX},${newY}) rotate(${rotation})`);
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

// === Event Bindings ===

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

// === Export ===

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
      componentData.push({ id, type, x, y, rotation });
    }
  });

  // === Export wires after merging collinear segments ===
  const mergedWires = mergeCollinearWires(wireSegments);

  const wires = mergedWires.map((seg) => ({
    id: seg.id,
    x1: seg.x1,
    y1: seg.y1,
    x2: seg.x2,
    y2: seg.y2
  }));

  // === Final output ===
  output.textContent = JSON.stringify(
    { components: componentData, wires },
    null,
    2
  );
}