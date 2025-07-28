import json
import pprint

# --- Step 1: Load the exported JSON ---
with open("export.json", "r") as f:
    data = json.load(f)

# --- Step 2: Extract components and wires ---
components = data["components"]
wires = data["wires"]


"""
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
"""    
    
def is_on_wire(c, w):
    cx, cy = c["x"], c["y"]
    x1, y1 = w["x1"], w["y1"]
    x2, y2 = w["x2"], w["y2"]

    # Vertical wire
    if x1 == x2:
        return cx == x1 and min(y1, y2) < cy < max(y1, y2)

    # Horizontal wire
    if y1 == y2:
        return cy == y1 and min(x1, x2) < cx < max(x1, x2)

    return False

def add_edge_wires(w, c, new_wires):
    cx, cy = c["x"], c["y"]
    x1, y1 = w["x1"], w["y1"]
    x2, y2 = w["x2"], w["y2"]

    if c["type"] == "resistor":
        offset = 0.65 * 75
    else:
        offset = 0.5 * 75

    # Precompute component endpoints in app coordinates
    upper = min(cy - offset, cy + offset)
    lower = max(cy - offset, cy + offset)
    left  = min(cx - offset, cx + offset)
    right = max(cx - offset, cx + offset)

    # Vertical wire split
    if x1 == x2:
        new_wires.append({"x1": x1, "y1": y1, "x2": cx, "y2": upper})
        new_wires.append({"x1": cx, "y1": lower, "x2": x2, "y2": y2})

    # Horizontal wire split
    else:
        new_wires.append({"x1": x1, "y1": y1, "x2": left, "y2": cy})
        new_wires.append({"x1": right, "y1": cy, "x2": x2, "y2": y2})



for c in components:
    for w in list(wires):   # iterate over a copy to allow removal
        if is_on_wire(c, w):
            wires.remove(w)
            add_edge_wires(w, c, wires)
           # move to next component



print(f"\\documentclass[border=5mm]{{standalone}}")
print(f"\\usepackage[siunitx]{{circuitikz}}")
print(f"\\begin{{document}}")
print(f"\\begin{{circuitikz}}[american]")

for w in wires:
    x1 = w["x1"] / 75
    y1 = w["y1"] / 75
    x2 = w["x2"] / 75
    y2 = w["y2"] / 75
    print(f"\\draw ({x1:.2f},{-y1:.2f}) -- ({x2:.2f},{-y2:.2f});")

for c in components:
    x1 = x2 = cx = c["x"] / 75
    y1 = y2 = cy = -c["y"] / 75

    if (c["rotation"] % 180) == 0:
        if c["type"] == "resistor":
            x1 = cx - 0.65
            x2 = cx + 0.65
        else:
            y1 = cy - 0.5
            y2 = cy + 0.5
    elif (c["rotation"] % 180) == 90:
        if c["type"] == "resistor":
            y1 = cy - 0.65
            y2 = cy + 0.65
        else:
            x1 = cx - 0.5
            x2 = cx + 0.5

    # Map types to CircuitikZ
    if c["type"] == "voltage":
        comp = "vsource"
        if (c["rotation"] == 180 or c["rotation"] == 270):
            comp += ", invert"
    elif c["type"] == "current":
        comp = "isource"
        if (c["rotation"] == 180 or c["rotation"] == 270):
            comp += ", invert"
    elif c["type"] == "resistor":
        comp = "resistor, european"
    else:
        comp = "generic"
    
    lbl = c["label"]
    if lbl["text"] != "":
        if (lbl["pos"] == "above") or (lbl["pos"] == "left"):
            comp += ", l^="
        else:
            comp += ", l_="
        comp += lbl["text"]

        if c["type"] == "voltage":
            comp += "<\\volt>"
        elif c["type"] == "current":
            comp += "<\\ampere>"
        elif c["type"] == "resistor":
            comp += "<\\ohm>"
        else:
            comp = "generic"

    


    print(f"\\draw[font = {{\\small}}] ({x1:.2f},{y1:.2f}) to[{comp}] ({x2:.2f},{y2:.2f});")

print(f"\\end{{circuitikz}}")
print(f"\\end{{document}}")

# Create rearrange wires (make all wire polarity left to right (and up to down)).