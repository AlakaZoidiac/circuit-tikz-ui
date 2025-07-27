import json
import pprint

# --- Step 1: Load the exported JSON ---
with open("export.json", "r") as f:
    data = json.load(f)

# --- Step 2: Extract components and wires ---
components = data["components"]
wires = data["wires"]

print("Components found:")
for c in components:
    lbl = c["label"]
    print(f"- ID: {c['id']}, Type: {c['type']}, Pos: ({c['x']},{c['y']}), "
          f"Rotation: {c['rotation']}, Color: {c['color']}, Label: {lbl['text']} "
          f"(Position = {lbl['pos']}, Offsets = ({lbl['offsetX']}, {lbl['offsetY']}))")

print("\nWires found:")
for w in wires:
    print(f"- ID: {w['id']}, From: ({w['x1']},{w['y1']}) To: ({w['x2']},{w['y2']}), "
          f"Color: {w['color']}, Thickness: {w['thickness']}")

for w in wires:
    x1 = w["x1"] / 75
    y1 = w["y1"] / 75
    x2 = w["x2"] / 75
    y2 = w["y2"] / 75
    print(f"\\draw ({x1:.2f},{-y1:.2f}) -- ({x2:.2f},{-y2:.2f});")

for c in components:
    cx = c["x"] / 75
    cy = -c["y"] / 75
    y1 = cy - 0.75
    y2 = cy + 0.75
    
    # Map types to CircuitikZ
    if c["type"] == "voltage":
        comp = "vsource"
    elif c["type"] == "current":
        comp = "isource"
    elif c["type"] == "resistor":
        comp = "resistor, european"
    else:
        comp = "generic"
    
    print(f"\\draw ({cx:.2f},{y1:.2f}) to[{comp}] ({cx:.2f},{y2:.2f});")