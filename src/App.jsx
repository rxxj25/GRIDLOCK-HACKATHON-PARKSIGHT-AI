import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import {
  Activity,
  BarChart3,
  CalendarDays,
  Car,
  CheckCircle2,
  Download,
  FileText,
  Flame,
  GitBranch,
  Layers3,
  LocateFixed,
  MapPin,
  Route,
  ShieldCheck,
  Siren,
  Target,
} from "lucide-react";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import { downloadCsvReport, downloadPdfReport } from "./reporting.js";
import "./index.css";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler);

const priorityColors = {
  Critical: "#d93d4a",
  High: "#e09b2d",
  Watch: "#04756f",
  Routine: "#6157a8",
};

const layerMeta = {
  impact: {
    label: "Impact",
    hint: "Overall congestion-priority score",
    gradient: { 0.2: "#f8df7d", 0.45: "#f39a54", 0.7: "#d93d4a", 1.0: "#8b1e42" },
  },
  violations: {
    label: "Volume",
    hint: "Raw illegal-parking case density",
    gradient: { 0.2: "#c7ddff", 0.45: "#6ea8ff", 0.7: "#3267d6", 1.0: "#152c8f" },
  },
  junction: {
    label: "Junction",
    hint: "Intersection and crossing obstruction risk",
    gradient: { 0.2: "#d7f7ec", 0.45: "#56c9ad", 0.7: "#04756f", 1.0: "#073f45" },
  },
};

const formatter = new Intl.NumberFormat("en-IN");

function App() {
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [priority, setPriority] = useState("all");
  const [station, setStation] = useState("all");
  const [layer, setLayer] = useState("impact");
  const [selected, setSelected] = useState(null);
  const mapApi = useRef(null);
  const previousStation = useRef("all");

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    fetch(`${import.meta.env.BASE_URL}data/parking_intelligence.json`)
      .then((response) => {
        if (!response.ok) throw new Error("Could not load parking intelligence data");
        return response.json();
      })
      .then((payload) => {
        setData(payload);
        setSelected(payload.hotspots[0]);
      })
      .catch((error) => {
        setData({ error: error.message });
      });
  }, []);

  const filteredHotspots = useMemo(() => {
    if (!data?.hotspots) return [];
    return data.hotspots.filter((hotspot) => {
      const priorityMatch = priority === "all" || hotspot.priority === priority;
      const stationMatch = station === "all" || hotspot.station === station;
      return priorityMatch && stationMatch;
    });
  }, [data, priority, station]);

  useEffect(() => {
    if (!data?.hotspots || previousStation.current === station) return;
    previousStation.current = station;

    if (station === "all") {
      setSelected(data.hotspots[0]);
      mapApi.current?.reset();
      return;
    }

    const stationHotspots = data.hotspots.filter((hotspot) => hotspot.station === station);
    if (!stationHotspots.length) return;
    setSelected(stationHotspots[0]);
    mapApi.current?.fitHotspots(stationHotspots);
  }, [data, station]);

  if (!data) return <LoadingScreen />;
  if (data.error) return <ErrorScreen message={data.error} />;

  const criticalCount = data.hotspots.filter((hotspot) => hotspot.priority === "Critical").length;

  return (
    <div className="min-h-screen px-3 py-3 text-ink sm:px-5 sm:py-4">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-1 text-xs font-black uppercase tracking-normal text-teal">Flipkart Gridlock Challenge</p>
            <h1 className="text-[2.35rem] font-black leading-none tracking-normal sm:text-[4.3rem]">ParkSight AI</h1>
            <p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-slate-600 sm:text-base">
              AI parking intelligence that ranks where illegal parking hurts traffic flow, then turns hotspots into enforceable patrol beats.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge icon={<Layers3 size={16} />} label={data.summary.modelVersion} />
            <Badge icon={<CalendarDays size={16} />} label={`${data.summary.dateRange.start} to ${data.summary.dateRange.end}`} />
            <ReportActions data={data} />
          </div>
        </header>

        <BriefStrip data={data} />

        <main className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(390px,0.72fr)]">
          <section className="glass-panel depth-stage overflow-hidden rounded-xl">
            <div className="grid grid-cols-2 border-b border-white/60 lg:grid-cols-4">
              <Kpi title="Violations analyzed" value={formatter.format(data.summary.totalViolations)} icon={<Siren />} />
              <Kpi title="Scored urban cells" value={formatter.format(data.summary.cellsAnalyzed)} icon={<Target />} />
              <Kpi title="Junction-linked cases" value={`${Math.round(data.summary.junctionLinkedShare * 100)}%`} icon={<GitBranch />} />
              <Kpi title="Critical hotspots" value={criticalCount} icon={<Flame />} />
            </div>

            <ControlBar
              data={data}
              station={station}
              setStation={setStation}
              priority={priority}
              setPriority={setPriority}
              layer={layer}
              setLayer={setLayer}
            />

            <MapPanel
              data={data}
              layer={layer}
              hotspots={filteredHotspots}
              station={station}
              selected={selected}
              onSelect={setSelected}
              mapApi={mapApi}
            />
          </section>

          <aside className="glass-panel overflow-hidden rounded-xl">
            <Tabs activeTab={activeTab} setActiveTab={setActiveTab} />
            <div className="max-h-none overflow-auto p-3 xl:max-h-[calc(100vh-178px)]">
              {activeTab === "overview" && <Overview data={data} selected={selected} />}
              {activeTab === "hotspots" && (
                <Hotspots
                  hotspots={filteredHotspots}
                  onFocus={(hotspot) => {
                    setSelected(hotspot);
                    mapApi.current?.focus(hotspot);
                  }}
                />
              )}
              {activeTab === "plan" && (
                <Plan
                  plan={data.enforcementPlan}
                  hotspots={data.hotspots}
                  onFocus={(hotspot) => {
                    setSelected(hotspot);
                    mapApi.current?.focus(hotspot);
                  }}
                />
              )}
              {activeTab === "method" && <Method data={data} />}
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="glass-panel rounded-xl p-8 text-center">
        <div className="mx-auto mb-4 h-14 w-14 animate-pulse rounded-xl bg-teal/20 shadow-lift" />
        <h1 className="text-2xl font-black">Loading ParkSight AI</h1>
        <p className="mt-2 text-sm font-semibold text-slate-600">Building parking intelligence from violation records.</p>
      </div>
    </div>
  );
}

function ErrorScreen({ message }) {
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="glass-panel max-w-lg rounded-xl p-8">
        <h1 className="text-2xl font-black">ParkSight AI could not start</h1>
        <p className="mt-3 text-slate-600">{message}</p>
      </div>
    </div>
  );
}

function Badge({ icon, label }) {
  return (
    <div className="glass-inner flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-extrabold text-slate-600">
      <span className="text-teal">{icon}</span>
      {label}
    </div>
  );
}

function ReportActions({ data }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => downloadCsvReport(data)}
        className="glass-inner flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-extrabold text-slate-700 transition hover:-translate-y-0.5 hover:text-teal"
      >
        <Download size={16} />
        CSV Report
      </button>
      <button
        onClick={() => downloadPdfReport(data)}
        className="flex min-h-11 items-center gap-2 rounded-lg bg-teal px-4 text-sm font-extrabold text-white shadow-lift transition hover:-translate-y-0.5"
      >
        <FileText size={16} />
        PDF Brief
      </button>
    </div>
  );
}

function BriefStrip({ data }) {
  const topHotspot = data.hotspots[0];
  const topStation = data.stations[0];
  const planHotspots = data.enforcementPlan
    .map((item) => data.hotspots.find((hotspot) => hotspot.id === item.hotspotId))
    .filter(Boolean);
  const planCases = planHotspots.reduce((sum, hotspot) => sum + hotspot.violations, 0);
  const planObstruction = planHotspots.reduce((sum, hotspot) => sum + hotspot.weightedObstruction, 0);
  const totalHotspotCases = data.hotspots.reduce((sum, hotspot) => sum + hotspot.violations, 0);
  const coverage = Math.round((planCases / totalHotspotCases) * 100);

  const cards = [
    {
      icon: <LocateFixed size={18} />,
      title: "Highest risk",
      value: topHotspot.area,
      detail: `${topHotspot.station} · ${topHotspot.impactScore} impact score`,
    },
    {
      icon: <ShieldCheck size={18} />,
      title: "Best first deployment",
      value: `${data.enforcementPlan.length} beats`,
      detail: `${formatter.format(planCases)} cases covered in priority zones`,
    },
    {
      icon: <BarChart3 size={18} />,
      title: "Station burden",
      value: topStation.station,
      detail: `${formatter.format(topStation.cases)} cases · ${topStation.impactScore} station score`,
    },
    {
      icon: <CheckCircle2 size={18} />,
      title: "Plan leverage",
      value: `${coverage}%`,
      detail: `${formatter.format(Math.round(planObstruction))} PCU obstruction captured`,
    },
  ];

  return (
    <section className="mb-4 grid gap-3 lg:grid-cols-4">
      {cards.map((card) => (
        <article key={card.title} className="glass-panel depth-card rounded-xl p-4">
          <div className="mb-3 flex items-center gap-2 text-teal">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-teal/10">{card.icon}</span>
            <span className="text-xs font-black uppercase tracking-normal text-slate-500">{card.title}</span>
          </div>
          <strong className="block truncate text-lg font-black leading-tight" title={card.value}>
            {card.value}
          </strong>
          <p className="mt-2 text-sm font-semibold leading-5 text-slate-600">{card.detail}</p>
        </article>
      ))}
    </section>
  );
}

function Kpi({ title, value, icon }) {
  return (
    <div className="depth-card border-r border-white/60 p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-[0.72rem] font-black uppercase tracking-normal text-slate-500">{title}</span>
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-teal/10 text-teal">{React.cloneElement(icon, { size: 18 })}</span>
      </div>
      <strong className="block text-3xl font-black leading-none sm:text-4xl">{value}</strong>
    </div>
  );
}

function ControlBar({ data, station, setStation, priority, setPriority, layer, setLayer }) {
  const priorityOptions = ["all", "Critical", "High", "Watch"];
  const layerOptions = [
    ["impact", Flame, "Impact"],
    ["violations", MapPin, "Volume"],
    ["junction", GitBranch, "Junction"],
  ];

  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-white/60 bg-white/35 p-3">
      <label className="grid min-w-full gap-1 text-xs font-black uppercase tracking-normal text-slate-500 sm:min-w-[280px]">
        Station
        <select
          value={station}
          onChange={(event) => setStation(event.target.value)}
          className="h-11 rounded-lg border border-white/70 bg-white/80 px-3 text-sm font-bold text-ink outline-none ring-teal/20 transition focus:ring-4"
        >
          <option value="all">All police stations</option>
          {data.stations.map((item) => (
            <option key={item.station} value={item.station}>
              {item.station} ({formatter.format(item.cases)})
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap gap-2">
        {priorityOptions.map((item) => (
          <button
            key={item}
            onClick={() => setPriority(item)}
            className={`h-11 rounded-lg px-4 text-sm font-black transition ${
              priority === item ? "bg-teal text-white shadow-lift" : "glass-inner text-slate-600 hover:text-teal"
            }`}
          >
            {item === "all" ? "All" : item}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {layerOptions.map(([id, Icon, label]) => (
          <button
            key={id}
            onClick={() => setLayer(id)}
            className={`flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-black transition ${
              layer === id ? "bg-teal text-white shadow-lift" : "glass-inner text-slate-600 hover:text-teal"
            }`}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function MapPanel({ data, layer, hotspots, station, selected, onSelect, mapApi }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const heatRef = useRef(null);
  const markerLayerRef = useRef(null);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    mapInstance.current = L.map(mapRef.current, {
      zoomControl: false,
      preferCanvas: true,
    }).setView([12.975, 77.6], 12);

    L.control.zoom({ position: "bottomright" }).addTo(mapInstance.current);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapInstance.current);

    heatRef.current = L.heatLayer(getHeatPoints(data, layer), {
      radius: layer === "violations" ? 27 : layer === "junction" ? 20 : 23,
      blur: layer === "junction" ? 16 : 22,
      maxZoom: 16,
      gradient: layerMeta[layer].gradient,
    }).addTo(mapInstance.current);
    markerLayerRef.current = L.layerGroup().addTo(mapInstance.current);

    mapApi.current = {
      focus: (hotspot) => mapInstance.current?.flyTo([hotspot.lat, hotspot.lng], 16, { duration: 0.8 }),
      fitHotspots: (items) => {
        if (!mapInstance.current || !items?.length) return;
        if (items.length === 1) {
          mapInstance.current.flyTo([items[0].lat, items[0].lng], 15, { duration: 0.8 });
          return;
        }
        const bounds = L.latLngBounds(items.slice(0, 45).map((item) => [item.lat, item.lng]));
        mapInstance.current.flyToBounds(bounds, { padding: [72, 72], maxZoom: 14, duration: 0.8 });
      },
      reset: () => mapInstance.current?.flyTo([12.975, 77.6], 12, { duration: 0.8 }),
    };

    return () => {
      mapInstance.current?.remove();
      mapInstance.current = null;
    };
  }, [data, layer, mapApi]);

  useEffect(() => {
    if (!heatRef.current) return;
    heatRef.current.setOptions({
      radius: layer === "violations" ? 27 : layer === "junction" ? 20 : 23,
      blur: layer === "junction" ? 16 : 22,
      gradient: layerMeta[layer].gradient,
    });
    heatRef.current.setLatLngs(getHeatPoints(data, layer));
  }, [data, layer]);

  useEffect(() => {
    if (!markerLayerRef.current) return;
    markerLayerRef.current.clearLayers();
    hotspots.forEach((hotspot) => {
      const radius = getMarkerRadius(hotspot, layer, data);
      const fillColor = getMarkerColor(hotspot, layer, data);
      L.circleMarker([hotspot.lat, hotspot.lng], {
        radius,
        color: "#ffffff",
        weight: selected?.id === hotspot.id ? 4 : 2,
        fillColor,
        fillOpacity: selected?.id === hotspot.id ? 0.98 : 0.86,
      })
        .bindPopup(
          `<strong>${hotspot.rank}. ${escapeHtml(hotspot.area)}</strong><br/>Impact score: <b>${hotspot.impactScore}</b><br/>${formatter.format(
            hotspot.violations,
          )} cases · ${escapeHtml(hotspot.station)}`,
        )
        .on("click", () => onSelect(hotspot))
        .addTo(markerLayerRef.current);
    });
  }, [hotspots, layer, onSelect, selected?.id]);

  return (
    <div className="map-shell relative">
      <div ref={mapRef} className="h-[560px] min-h-[560px] w-full sm:h-[calc(100vh-280px)]" />
      <div className="pointer-events-none absolute bottom-4 left-4 z-[500] flex max-w-[calc(100%-2rem)] flex-wrap gap-2 rounded-lg border border-white/70 bg-white/75 px-3 py-2 text-xs font-black text-slate-600 shadow-glass backdrop-blur-xl">
        {layer === "impact" && (
          <>
            <LegendDot color={priorityColors.Critical} label="Critical" />
            <LegendDot color={priorityColors.High} label="High" />
            <LegendDot color={priorityColors.Watch} label="Watch" />
          </>
        )}
        {layer === "violations" && (
          <>
            <LegendDot color="#152c8f" label="Highest volume" />
            <LegendDot color="#3267d6" label="High volume" />
            <LegendDot color="#6ea8ff" label="Moderate volume" />
          </>
        )}
        {layer === "junction" && (
          <>
            <LegendDot color="#073f45" label="Highest junction risk" />
            <LegendDot color="#04756f" label="High junction risk" />
            <LegendDot color="#56c9ad" label="Lower junction risk" />
          </>
        )}
        <span className="flex items-center gap-2">
          <b className={`h-3 w-8 rounded-full ${layer === "violations" ? "bg-gradient-to-r from-[#c7ddff] via-[#6ea8ff] to-[#152c8f]" : layer === "junction" ? "bg-gradient-to-r from-[#d7f7ec] via-[#56c9ad] to-[#073f45]" : "bg-gradient-to-r from-[#ffdf70] via-[#ff7b54] to-[#c72c48]"}`} />
          Hotspot intensity
        </span>
      </div>
      <div className="pointer-events-none absolute right-4 top-4 z-[500] hidden max-w-[255px] rounded-lg border border-white/70 bg-white/75 p-3 text-xs font-bold leading-5 text-slate-600 shadow-glass backdrop-blur-xl md:block">
        <strong className="block text-sm font-black text-ink">{layerMeta[layer].label} layer</strong>
        {layerMeta[layer].hint}
        <span className="mt-1 block text-teal">{hotspots.length} visible hotspots · layer: {layer}</span>
        <span className="mt-1 block text-slate-700">Focus: {station === "all" ? "Bengaluru overview" : station}</span>
      </div>
    </div>
  );
}

function LegendDot({ color, label }) {
  return (
    <span className="flex items-center gap-2">
      <b className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function Tabs({ activeTab, setActiveTab }) {
  const tabs = [
    ["overview", Activity, "Overview"],
    ["hotspots", LocateFixed, "Hotspots"],
    ["plan", Route, "Plan"],
    ["method", ShieldCheck, "Method"],
  ];

  return (
    <nav className="grid grid-cols-2 gap-2 border-b border-white/60 bg-white/35 p-3 sm:grid-cols-4">
      {tabs.map(([id, Icon, label]) => (
        <button
          key={id}
          onClick={() => setActiveTab(id)}
          className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-black transition ${
            activeTab === id ? "bg-teal text-white shadow-lift" : "glass-inner text-slate-600 hover:text-teal"
          }`}
        >
          <Icon size={17} />
          {label}
        </button>
      ))}
    </nav>
  );
}

function Overview({ data, selected }) {
  return (
    <div className="grid gap-3">
      <DecisionBrief data={data} />
      {selected && <SelectedHotspot hotspot={selected} />}
      <ScenarioCard data={data} />
      <ChartCard title="Violation Rhythm">
        <Line data={hourChartData(data)} options={lineOptions} />
      </ChartCard>
      <ChartCard title="Primary Violations">
        <Doughnut data={violationChartData(data)} options={doughnutOptions} />
      </ChartCard>
      <ChartCard title="Station Burden">
        <Bar data={stationChartData(data)} options={barOptions} />
      </ChartCard>
    </div>
  );
}

function DecisionBrief({ data }) {
  const peakShare = Math.round(data.summary.peakHourShare * 100);
  const junctionShare = Math.round(data.summary.junctionLinkedShare * 100);
  const topViolation = data.summary.topViolation.toLowerCase();

  return (
    <section className="glass-inner depth-card rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-coral/10 text-coral">
          <Siren size={20} />
        </div>
        <div>
          <h2 className="text-lg font-black">Judge Brief</h2>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
            ParkSight AI found that {junctionShare}% of all violations are linked to junction-sensitive zones, while {peakShare}% recur during peak movement windows. The dominant offence is {topViolation}, so enforcement should prioritize obstruction removal over simple ticket counting.
          </p>
        </div>
      </div>
    </section>
  );
}

function ScenarioCard({ data }) {
  const planHotspots = data.enforcementPlan
    .map((item) => data.hotspots.find((hotspot) => hotspot.id === item.hotspotId))
    .filter(Boolean);
  const planCases = planHotspots.reduce((sum, hotspot) => sum + hotspot.violations, 0);
  const planPcu = planHotspots.reduce((sum, hotspot) => sum + hotspot.weightedObstruction, 0);
  const top160Cases = data.hotspots.reduce((sum, hotspot) => sum + hotspot.violations, 0);
  const top160Pcu = data.hotspots.reduce((sum, hotspot) => sum + hotspot.weightedObstruction, 0);
  const caseCoverage = Math.round((planCases / top160Cases) * 100);
  const pcuCoverage = Math.round((planPcu / top160Pcu) * 100);

  return (
    <section className="glass-inner depth-card rounded-xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black">Priority Plan Coverage</h2>
          <p className="mt-1 text-sm font-semibold text-slate-600">Top 12 beats against the top 160 hotspot set</p>
        </div>
        <span className="rounded-lg bg-teal px-3 py-2 text-sm font-black text-white shadow-lift">{data.enforcementPlan.length} beats</span>
      </div>
      <CoverageBar label="Violation coverage" value={caseCoverage} detail={`${formatter.format(planCases)} cases`} color="bg-coral" />
      <CoverageBar label="Obstruction coverage" value={pcuCoverage} detail={`${formatter.format(Math.round(planPcu))} PCU index`} color="bg-teal" />
    </section>
  );
}

function CoverageBar({ label, value, detail, color }) {
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="font-black">{label}</span>
        <span className="font-semibold text-slate-600">{detail}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-white/70 shadow-inner">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <p className="mt-1 text-xs font-black text-slate-500">{value}% of ranked hotspot burden</p>
    </div>
  );
}

function SelectedHotspot({ hotspot }) {
  const metrics = [
    [formatter.format(hotspot.violations), "violation records"],
    [formatter.format(Math.round(hotspot.weightedObstruction)), "PCU obstruction index"],
    [`${Math.round(hotspot.peakShare * 100)}%`, "peak-hour recurrence"],
    [`${Math.round(hotspot.junctionShare * 100)}%`, "junction exposure"],
    [`${Math.round(hotspot.arterialShare * 100)}%`, "main-road/crossing risk"],
    [hotspot.activeDays, "active days in data"],
  ];

  return (
    <article className="glass-inner depth-card rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black leading-tight">{hotspot.rank}. {hotspot.area}</h2>
          <p className="mt-2 text-sm font-semibold leading-5 text-slate-600">
            {hotspot.station} · {hotspot.placeType} · {hotspot.topViolation}
          </p>
        </div>
        <ScorePill hotspot={hotspot} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {metrics.map(([value, label]) => (
          <div key={label} className="rounded-lg bg-white/55 p-3 shadow-sm">
            <strong className="block text-xl font-black">{value}</strong>
            <span className="mt-1 block text-xs font-semibold leading-4 text-slate-600">{label}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm font-medium leading-6 text-slate-600">{hotspot.recommendation}</p>
    </article>
  );
}

function ScorePill({ hotspot }) {
  return (
    <div
      className="min-w-[76px] rounded-lg px-3 py-2 text-center text-white shadow-lift"
      style={{ backgroundColor: priorityColors[hotspot.priority] || priorityColors.Routine }}
    >
      <strong className="block text-lg font-black leading-none">{hotspot.impactScore}</strong>
      <small className="text-[0.66rem] font-black">{hotspot.priority}</small>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <section className="glass-inner depth-card rounded-xl p-4">
      <h2 className="mb-3 text-base font-black">{title}</h2>
      <div className="h-[220px]">{children}</div>
    </section>
  );
}

function Hotspots({ hotspots, onFocus }) {
  return (
    <section>
      <PanelTitle title="Ranked Hotspot Evidence" note={`${hotspots.length} visible`} />
      <div className="grid gap-3">
        {hotspots.slice(0, 35).map((hotspot) => (
          <article key={hotspot.id} className="glass-inner depth-card rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <strong className="text-base font-black">
                  <span className="text-teal">#{hotspot.rank}</span> {hotspot.area}
                </strong>
                <p className="mt-1 text-sm font-semibold text-slate-600">
                  {hotspot.station} · {formatter.format(hotspot.violations)} cases
                </p>
              </div>
              <ScorePill hotspot={hotspot} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Tag>{hotspot.topViolation}</Tag>
              <Tag>{Math.round(hotspot.peakShare * 100)}% peak</Tag>
              <Tag>{Math.round(hotspot.junctionShare * 100)}% junction</Tag>
              <Tag>{hotspot.topVehicle}</Tag>
            </div>
            <button onClick={() => onFocus(hotspot)} className="mt-3 rounded-lg bg-teal px-4 py-2 text-sm font-black text-white shadow-lift">
              Focus on map
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function Plan({ plan, hotspots, onFocus }) {
  return (
    <section>
      <PanelTitle title="Targeted Enforcement Plan" note="12 deployable beats" />
      <div className="grid gap-3">
        {plan.map((item) => {
          const hotspot = hotspots.find((candidate) => candidate.id === item.hotspotId);
          return (
            <article key={item.hotspotId} className="glass-inner depth-card grid grid-cols-[42px_minmax(0,1fr)] gap-3 rounded-xl p-4">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-violet text-sm font-black text-white shadow-lift">{item.rank}</div>
              <div>
                <div className="flex items-start justify-between gap-3">
                  <strong className="font-black leading-tight">{item.area}</strong>
                  <span className="font-black text-teal">{item.impactScore}</span>
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-600">
                  {item.station} · {item.window}
                </p>
                <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{item.why}</p>
                {hotspot && (
                  <button onClick={() => onFocus(hotspot)} className="mt-3 rounded-lg bg-teal px-4 py-2 text-sm font-black text-white shadow-lift">
                    Open hotspot
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Method({ data }) {
  const steps = [
    ["Detect", "Cluster violations into 220 m urban cells."],
    ["Quantify", "Convert vehicle and offence mix into obstruction pressure."],
    ["Prioritize", "Rank stations and hotspots by likely traffic-flow impact."],
    ["Deploy", "Generate beat windows and junction-specific actions."],
  ];

  return (
    <section className="glass-inner depth-card rounded-xl p-5">
      <h2 className="text-lg font-black">How Congestion Impact Is Quantified</h2>
      <p className="mt-3 text-sm font-medium leading-6 text-slate-600">
        The dataset contains violation events, not measured traffic speed. ParkSight AI therefore uses a transparent congestion-impact proxy that judges can audit: density, vehicle obstruction, severity, junction exposure, arterial risk, peak recurrence, and active-day recurrence.
      </p>
      <div className="my-4 rounded-lg border-l-4 border-teal bg-white/58 p-4 text-sm font-black leading-6 shadow-sm">{data.method.index}</div>
      <div className="grid gap-2 sm:grid-cols-2">
        {steps.map(([title, text]) => (
          <div key={title} className="rounded-lg bg-white/55 p-3">
            <strong className="font-black">{title}</strong>
            <span className="mt-1 block text-sm font-semibold leading-5 text-slate-600">{text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function PanelTitle({ title, note }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-lg font-black">{title}</h2>
      <span className="text-xs font-black text-slate-500">{note}</span>
    </div>
  );
}

function Tag({ children }) {
  return <span className="rounded-full bg-white/62 px-3 py-1 text-xs font-black text-slate-600 shadow-sm">{children}</span>;
}

function getHeatPoints(data, layer) {
  if (layer === "junction") {
    const byLocation = new Map(data.hotspots.map((hotspot) => [`${hotspot.lat},${hotspot.lng}`, hotspot.junctionShare]));
    return data.heatmap.map(([lat, lng, intensity]) => {
      const junctionShare = byLocation.get(`${lat},${lng}`) || 0.03;
      return [lat, lng, Math.min(1, Math.pow(junctionShare, 0.55) * 1.15 + intensity * 0.08)];
    });
  }
  if (layer === "violations") {
    const maxCount = Math.max(...data.heatmap.map((point) => point[3]));
    return data.heatmap.map(([lat, lng, , count]) => [lat, lng, Math.min(1, Math.pow(count / maxCount, 0.38) * 1.12)]);
  }
  return data.heatmap.map(([lat, lng, intensity]) => [lat, lng, intensity]);
}

function getMarkerRadius(hotspot, layer, data) {
  if (layer === "violations") {
    const maxViolations = data.hotspots[0]?.violations || 1;
    return 7 + Math.pow(hotspot.violations / maxViolations, 0.45) * 30;
  }
  if (layer === "junction") {
    return 5 + Math.pow(hotspot.junctionShare, 0.55) * 30;
  }
  return 8 + Math.pow(hotspot.impactScore / 100, 1.2) * 26;
}

function getMarkerColor(hotspot, layer, data) {
  if (layer === "violations") {
    const maxViolations = data.hotspots[0]?.violations || 1;
    const ratio = hotspot.violations / maxViolations;
    if (ratio > 0.72) return "#152c8f";
    if (ratio > 0.38) return "#3267d6";
    return "#6ea8ff";
  }
  if (layer === "junction") {
    if (hotspot.junctionShare > 0.8) return "#073f45";
    if (hotspot.junctionShare > 0.45) return "#04756f";
    return "#56c9ad";
  }
  return priorityColors[hotspot.priority] || priorityColors.Routine;
}

function hourChartData(data) {
  return {
    labels: data.charts.hours.map((item) => formatHourLabel(item.hour)),
    datasets: [
      {
        label: "Violations",
        data: data.charts.hours.map((item) => item.count),
        borderColor: "#04756f",
        backgroundColor: "rgba(4,117,111,0.15)",
        fill: true,
        tension: 0.35,
        pointRadius: 0,
      },
    ],
  };
}

function formatHourLabel(hour) {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

function violationChartData(data) {
  const values = data.charts.violations.slice(0, 7);
  return {
    labels: values.map((item) => item.name),
    datasets: [
      {
        data: values.map((item) => item.count),
        backgroundColor: ["#04756f", "#d93d4a", "#e09b2d", "#6157a8", "#56a3a6", "#c96f52", "#889063"],
        borderWidth: 0,
      },
    ],
  };
}

function stationChartData(data) {
  const values = data.charts.stations.slice(0, 8).reverse();
  return {
    labels: values.map((item) => item.name),
    datasets: [
      {
        label: "Cases",
        data: values.map((item) => item.count),
        backgroundColor: "#d93d4a",
        borderRadius: 8,
      },
    ],
  };
}

const axisColor = "#65707d";
const gridColor = "rgba(101,112,125,0.16)";

const lineOptions = {
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: {
      grid: { display: false },
      title: {
        display: true,
        text: "Hour of day (IST)",
        color: axisColor,
        font: { size: 11, weight: "bold" },
      },
      ticks: { color: axisColor, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
    },
    y: {
      grid: { color: gridColor },
      title: {
        display: true,
        text: "Violation count",
        color: axisColor,
        font: { size: 11, weight: "bold" },
      },
      ticks: { color: axisColor },
    },
  },
};

const doughnutOptions = {
  maintainAspectRatio: false,
  plugins: { legend: { position: "bottom", labels: { boxWidth: 10, color: axisColor } } },
  cutout: "62%",
};

const barOptions = {
  indexAxis: "y",
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { color: gridColor }, ticks: { color: axisColor } },
    y: { grid: { display: false }, ticks: { color: axisColor } },
  },
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

createRoot(document.getElementById("root")).render(<App />);
