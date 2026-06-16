# ParkSight AI

**AI-driven parking intelligence for congestion-aware enforcement.**

ParkSight AI converts raw illegal-parking violation records into a decision-support dashboard for traffic police. It detects where illegal parking repeats, quantifies where it is most likely to choke carriageways and intersections, and produces a targeted enforcement plan with downloadable CSV/PDF reports.

## Live Demo

The app is hosted on GitHub Pages:

```text
https://rxxj25.github.io/GRIDLOCK-HACKATHON-PARKSIGHT-AI/
```

## Problem Statement

On-street illegal parking and spillover parking near commercial areas, metro stations, and events choke carriageways and intersections.

Current enforcement is often patrol-based and reactive:

- no heatmap of parking violations versus congestion impact
- no clear way to prioritize enforcement zones
- limited visibility into which hotspots hurt traffic flow most

ParkSight AI answers:

1. Where is illegal parking happening repeatedly?
2. Which hotspots are most likely to affect traffic flow?
3. Which police station areas need attention first?
4. What enforcement action should be deployed, and when?

## Key Features

- Interactive Bengaluru illegal-parking hotspot map
- Separate map modes for **Impact**, **Volume**, and **Junction risk**
- Police-station filtering with automatic map focus
- Ranked hotspot evidence cards
- Parking Impact Index for explainable congestion-risk scoring
- Targeted 12-beat enforcement plan
- Downloadable CSV enforcement report
- Downloadable PDF enforcement brief
- Judge-friendly React dashboard with glassmorphism and subtle 3D depth

## AI / ML Approach

The supplied dataset contains violation events, not measured vehicle speeds. Because there is no ground-truth congestion label, ParkSight AI uses an explainable ML-style geospatial analytics pipeline instead of a black-box neural model.

The pipeline:

1. **Geospatial hotspot detection**: groups violations into roughly 220 m urban grid cells.
2. **Feature engineering**: derives congestion-risk features from each violation.
3. **Vehicle obstruction weighting**: applies passenger-car-unit style weights so larger vehicles contribute more obstruction pressure.
4. **Violation severity weighting**: boosts double parking, main-road parking, crossing parking, and traffic-light/zebra-crossing violations.
5. **Peak recurrence scoring**: increases risk where violations recur during peak movement windows.
6. **Explainable ranking**: scores and ranks hotspots using the Parking Impact Index.

Parking Impact Index:

```text
100 * (
  0.34 weighted obstruction
  + 0.18 density
  + 0.15 junction exposure
  + 0.13 arterial obstruction
  + 0.10 peak recurrence
  + 0.06 active-day recurrence
  + 0.04 severity
)
```

This makes the model auditable for civic enforcement teams.

## Dataset

Original local dataset:

```text
jan to may police violation_anonymized791b166 (1).csv
```

The raw CSV is intentionally **not committed** because it is larger than GitHub's normal file limit. The repository includes the generated dashboard intelligence file:

```text
public/data/parking_intelligence.json
```

Dataset summary used by the app:

- 298,450 geocoded parking-violation records
- Bengaluru region
- Actual record date range: 10 Nov 2023 to 08 Apr 2024
- 3,969 scored urban cells
- 160 dashboard hotspots
- 12 deployable enforcement beats

## Tech Stack

- React + Vite
- Tailwind CSS
- Leaflet + Leaflet heatmap
- Chart.js
- jsPDF
- Lucide React icons
- Python preprocessing pipeline
- GitHub Actions + GitHub Pages

## Local Setup

```powershell
npm install
python scripts\generate_intelligence.py
npm run dev -- --port 8000
```

Open:

```text
http://localhost:8000
```

## Build

```powershell
npm run build
```

## Project Structure

```text
.
├── public/
│   └── data/
│       └── parking_intelligence.json
├── scripts/
│   └── generate_intelligence.py
├── src/
│   ├── App.jsx
│   ├── index.css
│   └── reporting.js
├── submission_assets/
├── .github/workflows/deploy.yml
├── package.json
├── tailwind.config.js
├── vite.config.js
└── README.md
```

## Prior Art Checked

We reviewed parking-ticket hotspot analysis, parking-violation map dashboards, and illegal-parking computer-vision demos. ParkSight AI is different because it does not stop at ticket density. It ranks hotspots by likely congestion impact and converts that ranking into enforcement actions.

## Submission Summary

ParkSight AI helps traffic police move from reactive patrols to evidence-led parking enforcement by showing where illegal parking is happening, where it is hurting traffic most, and where to deploy first.
