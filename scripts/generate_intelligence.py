import csv
import json
import math
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "jan to may police violation_anonymized791b166 (1).csv"
OUT_PATH = ROOT / "public" / "data" / "parking_intelligence.json"

CELL_SIZE = 0.002
IST_OFFSET = timedelta(hours=5, minutes=30)


VIOLATION_WEIGHTS = {
    "PARKING NEAR TRAFFIC LIGHT OR ZEBRA CROSS": 1.85,
    "PARKING NEAR ROAD CROSSING": 1.75,
    "DOUBLE PARKING": 1.65,
    "PARKING IN A MAIN ROAD": 1.55,
    "PARKING OPPOSITE TO ANOTHER PARKED VEHICLE": 1.45,
    "PARKING NEAR BUSTOP/SCHOOL/HOSPITAL ETC": 1.35,
    "PARKING ON FOOTPATH": 1.15,
    "WRONG PARKING": 1.08,
    "NO PARKING": 1.0,
}

PCU_WEIGHTS = {
    "MOPED": 0.30,
    "SCOOTER": 0.35,
    "MOTOR CYCLE": 0.35,
    "PASSENGER AUTO": 0.75,
    "GOODS AUTO": 0.85,
    "CAR": 1.00,
    "JEEP": 1.05,
    "VAN": 1.15,
    "MAXI-CAB": 1.20,
    "LGV": 1.50,
    "TEMPO": 1.70,
    "PRIVATE BUS": 2.60,
    "BUS (BMTC/KSRTC)": 2.80,
    "HGV": 3.00,
    "LORRY/GOODS VEHICLE": 3.00,
    "TANKER": 3.20,
}

PEAK_HOURS = {8, 9, 10, 11, 17, 18, 19, 20, 21}
ARTERIAL_TERMS = ("MAIN ROAD", "ROAD CROSSING", "TRAFFIC LIGHT", "ZEBRA", "DOUBLE PARKING", "OPPOSITE")
PLACE_TERMS = {
    "metro": "Metro spillover",
    "market": "Commercial market",
    "mall": "Commercial mall",
    "hospital": "Hospital frontage",
    "school": "School frontage",
    "bus": "Bus-stop conflict",
    "station": "Transit station",
    "theatre": "Event/commercial venue",
}


def parse_list(value):
    if not value or value == "NULL":
        return []
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else [str(parsed)]
    except json.JSONDecodeError:
        cleaned = value.strip().strip("[]")
        return [part.strip().strip("'\"") for part in cleaned.split(",") if part.strip()]


def parse_datetime(value):
    if not value or value == "NULL":
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")) + IST_OFFSET
    except ValueError:
        return None


def cell_key(lat, lon):
    return (round(lat / CELL_SIZE), round(lon / CELL_SIZE))


def cell_center(key):
    return (round(key[0] * CELL_SIZE, 6), round(key[1] * CELL_SIZE, 6))


def new_cell():
    return {
        "count": 0,
        "weighted": 0.0,
        "pcu": 0.0,
        "severity": 0.0,
        "junction_count": 0,
        "arterial_count": 0,
        "peak_count": 0,
        "approved_count": 0,
        "scita_count": 0,
        "station": Counter(),
        "vehicle": Counter(),
        "violation": Counter(),
        "junction": Counter(),
        "location": Counter(),
        "hour": Counter(),
        "month": Counter(),
        "dates": set(),
        "place": Counter(),
    }


def priority(score):
    if score >= 74:
        return "Critical"
    if score >= 60:
        return "High"
    if score >= 45:
        return "Watch"
    return "Routine"


def recommendation(cell):
    top_violation = cell["violation"].most_common(1)[0][0] if cell["violation"] else "parking violation"
    top_hours = [hour for hour, _ in cell["hour"].most_common(3)]
    first_hour = min(top_hours) if top_hours else 9
    last_hour = max(top_hours) if top_hours else 11
    if cell["junction_count"] / cell["count"] > 0.35:
        action = "keep a junction-clearance unit on short-cycle patrol"
    elif cell["arterial_count"] / cell["count"] > 0.28:
        action = "prioritize towing and main-road no-parking checks"
    else:
        action = "schedule evidence-led beat enforcement"
    return f"{action}; dominant issue is {top_violation.lower()} around {first_hour:02d}:00-{last_hour + 1:02d}:00 IST"


def build():
    cells = defaultdict(new_cell)
    stations = defaultdict(new_cell)
    hours = Counter()
    months = Counter()
    violations = Counter()
    vehicles = Counter()
    station_counts = Counter()
    validation = Counter()
    junctions = Counter()
    date_values = []
    total = 0
    bounds = {"minLat": 90, "maxLat": -90, "minLng": 180, "maxLng": -180}

    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                lat = float(row["latitude"])
                lon = float(row["longitude"])
            except (TypeError, ValueError):
                continue
            if not (12.0 <= lat <= 14.0 and 76.5 <= lon <= 78.5):
                continue

            total += 1
            key = cell_key(lat, lon)
            cell = cells[key]
            station_name = row["police_station"] or "Unknown"
            station_cell = stations[station_name]
            vtype = row["vehicle_type"] or "Unknown"
            pcu = PCU_WEIGHTS.get(vtype, 1.0)
            violation_list = parse_list(row["violation_type"])
            if not violation_list:
                violation_list = ["Unknown"]
            severity = max(VIOLATION_WEIGHTS.get(v, 1.0) for v in violation_list)
            dt = parse_datetime(row["created_datetime"])
            hour = dt.hour if dt else None
            month = dt.strftime("%Y-%m") if dt else "Unknown"
            day = dt.strftime("%Y-%m-%d") if dt else None
            junction = row["junction_name"] or "No Junction"
            has_junction = junction != "No Junction"
            is_arterial = any(term in " ".join(violation_list).upper() for term in ARTERIAL_TERMS)
            is_peak = hour in PEAK_HOURS if hour is not None else False
            validation_status = row["validation_status"] or "Unknown"
            sent_scita = row["data_sent_to_scita"] == "TRUE"
            location = row["location"] or "Unknown location"
            location_lower = location.lower()
            place_tags = [label for term, label in PLACE_TERMS.items() if term in location_lower or term in junction.lower()]
            row_weight = pcu * severity * (1.35 if has_junction else 1.0) * (1.18 if is_peak else 1.0)

            for bucket in (cell, station_cell):
                bucket["count"] += 1
                bucket["weighted"] += row_weight
                bucket["pcu"] += pcu
                bucket["severity"] += severity
                bucket["junction_count"] += int(has_junction)
                bucket["arterial_count"] += int(is_arterial)
                bucket["peak_count"] += int(is_peak)
                bucket["approved_count"] += int(validation_status == "approved")
                bucket["scita_count"] += int(sent_scita)
                bucket["station"][station_name] += 1
                bucket["vehicle"][vtype] += 1
                bucket["junction"][junction] += 1
                bucket["location"][location] += 1
                bucket["month"][month] += 1
                if hour is not None:
                    bucket["hour"][hour] += 1
                for violation in violation_list:
                    bucket["violation"][violation] += 1
                for tag in place_tags:
                    bucket["place"][tag] += 1
                if day:
                    bucket["dates"].add(day)

            hours[hour] += 1
            months[month] += 1
            for violation in violation_list:
                violations[violation] += 1
            vehicles[vtype] += 1
            station_counts[station_name] += 1
            validation[validation_status] += 1
            junctions[junction] += 1
            if dt:
                date_values.append(dt)
            bounds["minLat"] = min(bounds["minLat"], lat)
            bounds["maxLat"] = max(bounds["maxLat"], lat)
            bounds["minLng"] = min(bounds["minLng"], lon)
            bounds["maxLng"] = max(bounds["maxLng"], lon)

    max_count = max(cell["count"] for cell in cells.values())
    max_weighted = max(cell["weighted"] for cell in cells.values())
    max_station_weighted = max(station["weighted"] for station in stations.values())

    def score_cell(cell, max_w=max_weighted):
        count_score = math.log1p(cell["count"]) / math.log1p(max_count)
        weighted_score = math.log1p(cell["weighted"]) / math.log1p(max_w)
        junction_share = cell["junction_count"] / cell["count"]
        arterial_share = cell["arterial_count"] / cell["count"]
        peak_share = cell["peak_count"] / cell["count"]
        recurrence = min(len(cell["dates"]) / 45, 1)
        avg_severity = min((cell["severity"] / cell["count"] - 1) / 0.85, 1)
        return round(100 * (
            0.34 * weighted_score
            + 0.18 * count_score
            + 0.15 * junction_share
            + 0.13 * arterial_share
            + 0.10 * peak_share
            + 0.06 * recurrence
            + 0.04 * avg_severity
        ), 1)

    hotspot_rows = []
    heatmap = []
    for key, cell in cells.items():
        lat, lon = cell_center(key)
        score = score_cell(cell)
        top_station = cell["station"].most_common(1)[0][0]
        top_location = cell["location"].most_common(1)[0][0]
        top_junction = cell["junction"].most_common(1)[0][0]
        place = cell["place"].most_common(1)[0][0] if cell["place"] else "Street segment"
        top_hours = [{"hour": h, "count": c} for h, c in cell["hour"].most_common(4)]
        hotspot_rows.append({
            "id": f"HS-{len(hotspot_rows)+1:04d}",
            "lat": lat,
            "lng": lon,
            "impactScore": score,
            "priority": priority(score),
            "violations": cell["count"],
            "weightedObstruction": round(cell["weighted"], 1),
            "pcu": round(cell["pcu"], 1),
            "activeDays": len(cell["dates"]),
            "peakShare": round(cell["peak_count"] / cell["count"], 3),
            "junctionShare": round(cell["junction_count"] / cell["count"], 3),
            "arterialShare": round(cell["arterial_count"] / cell["count"], 3),
            "approvedShare": round(cell["approved_count"] / cell["count"], 3),
            "scitaShare": round(cell["scita_count"] / cell["count"], 3),
            "station": top_station,
            "area": top_junction if top_junction != "No Junction" else top_location.split(",")[0],
            "placeType": place,
            "topViolation": cell["violation"].most_common(1)[0][0],
            "topVehicle": cell["vehicle"].most_common(1)[0][0],
            "topHours": top_hours,
            "recommendation": recommendation(cell),
        })
        if cell["count"] >= 4:
            heatmap.append([lat, lon, round(score / 100, 3), cell["count"]])

    hotspot_rows.sort(key=lambda row: row["impactScore"], reverse=True)
    for index, row in enumerate(hotspot_rows, start=1):
        row["rank"] = index
        row["id"] = f"HS-{index:04d}"

    heatmap = sorted(heatmap, key=lambda row: row[2], reverse=True)[:2500]

    station_rows = []
    for station_name, station in stations.items():
        station_score = round(100 * math.log1p(station["weighted"]) / math.log1p(max_station_weighted), 1)
        lat_sum = 0.0
        lng_sum = 0.0
        related = [row for row in hotspot_rows[:500] if row["station"] == station_name]
        if related:
            lat_sum = sum(row["lat"] for row in related) / len(related)
            lng_sum = sum(row["lng"] for row in related) / len(related)
        station_rows.append({
            "station": station_name,
            "cases": station["count"],
            "impactScore": station_score,
            "criticalHotspots": sum(1 for row in hotspot_rows[:500] if row["station"] == station_name and row["priority"] == "Critical"),
            "junctionShare": round(station["junction_count"] / station["count"], 3),
            "arterialShare": round(station["arterial_count"] / station["count"], 3),
            "peakShare": round(station["peak_count"] / station["count"], 3),
            "topViolation": station["violation"].most_common(1)[0][0],
            "topVehicle": station["vehicle"].most_common(1)[0][0],
            "lat": round(lat_sum, 5) if lat_sum else None,
            "lng": round(lng_sum, 5) if lng_sum else None,
        })
    station_rows.sort(key=lambda row: (row["impactScore"], row["cases"]), reverse=True)

    top_hotspots = hotspot_rows[:160]
    enforcement_plan = []
    used_stations = Counter()
    for row in hotspot_rows:
        if len(enforcement_plan) >= 12:
            break
        if used_stations[row["station"]] >= 2 and row["impactScore"] < 86:
            continue
        used_stations[row["station"]] += 1
        hours_sorted = sorted(row["topHours"], key=lambda item: item["count"], reverse=True)
        start = min(item["hour"] for item in hours_sorted[:2]) if hours_sorted else 9
        end = max(item["hour"] for item in hours_sorted[:2]) + 1 if hours_sorted else 11
        enforcement_plan.append({
            "rank": len(enforcement_plan) + 1,
            "hotspotId": row["id"],
            "station": row["station"],
            "area": row["area"],
            "impactScore": row["impactScore"],
            "window": f"{start:02d}:00-{end:02d}:00 IST",
            "action": row["recommendation"].split(";")[0],
            "why": f"{row['violations']:,} cases, {int(row['junctionShare']*100)}% junction exposure, {int(row['arterialShare']*100)}% arterial obstruction",
            "lat": row["lat"],
            "lng": row["lng"],
        })

    total_junction = sum(1 for name, count in junctions.items() if name != "No Junction" for _ in range(count))
    approved = validation["approved"]
    summary = {
        "totalViolations": total,
        "dateRange": {
            "start": min(date_values).strftime("%d %b %Y") if date_values else "",
            "end": max(date_values).strftime("%d %b %Y") if date_values else "",
        },
        "bounds": bounds,
        "cellsAnalyzed": len(cells),
        "stations": len(stations),
        "junctionLinkedShare": round(total_junction / total, 3),
        "approvedShare": round(approved / total, 3),
        "peakHourShare": round(sum(count for hour, count in hours.items() if hour in PEAK_HOURS) / total, 3),
        "topStation": station_counts.most_common(1)[0][0],
        "topViolation": violations.most_common(1)[0][0],
        "modelVersion": "Parking Impact Index v1.0",
        "generatedFrom": CSV_PATH.name,
    }

    output = {
        "summary": summary,
        "hotspots": top_hotspots,
        "heatmap": heatmap,
        "stations": station_rows[:60],
        "enforcementPlan": enforcement_plan,
        "charts": {
            "hours": [{"hour": int(hour), "count": count} for hour, count in sorted(hours.items()) if hour is not None],
            "months": [{"month": month, "count": count} for month, count in sorted(months.items())],
            "violations": [{"name": name, "count": count} for name, count in violations.most_common(12)],
            "vehicles": [{"name": name, "count": count} for name, count in vehicles.most_common(12)],
            "stations": [{"name": name, "count": count} for name, count in station_counts.most_common(12)],
        },
        "method": {
            "index": "100 * (0.34 weighted obstruction + 0.18 density + 0.15 junction exposure + 0.13 arterial obstruction + 0.10 peak recurrence + 0.06 active-day recurrence + 0.04 severity)",
            "notes": [
                "Weighted obstruction uses passenger-car-unit style vehicle weights and violation severity.",
                "Congestion impact is a transparent proxy because the supplied dataset contains violations, not measured speeds.",
                "The output ranks where illegal parking is most likely to reduce effective carriageway capacity."
            ],
        },
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(f"Wrote {OUT_PATH}")
    print(f"{total:,} rows -> {len(cells):,} grid cells -> {len(top_hotspots)} dashboard hotspots")


if __name__ == "__main__":
    build()
