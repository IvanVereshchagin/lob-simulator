import { useState, useEffect, useRef } from "react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const API_URL = "http://localhost:8000";
const MAX_HISTORY = 50;

export default function App() {
  const [state, setState] = useState({
    bestBid: -1,
    bestAsk: -1,
    bidDepth: [],
    askDepth: [],
    recentEvents: [],
  });
  const [isRunning, setIsRunning] = useState(false);
  const [modelType, setModelType] = useState("santa_fe");
  const [lam, setLam] = useState(2.0);
  const [mu, setMu] = useState(1.0);
  const [nu, setNu] = useState(0.5);
  const [phi0, setPhi0] = useState(1.0);
  const [branchingRatio, setBranchingRatio] = useState(0.7);
  const [decayRate, setDecayRate] = useState(0.5);
  const [minPrice, setMinPrice] = useState(95);
  const [maxPrice, setMaxPrice] = useState(105);
  const [minVolume, setMinVolume] = useState(1);
  const [maxVolume, setMaxVolume] = useState(50);
  const [bidLevels, setBidLevels] = useState(5);
  const [askLevels, setAskLevels] = useState(5);
  const [latencyBreakdown, setLatencyBreakdown] = useState(null);
  const [avgLatency, setAvgLatency] = useState(null);
  const [history, setHistory] = useState([]);

  const intervalRef = useRef(null);
  const latencyHistoryRef = useRef([]);
  const stepCounterRef = useRef(0);

  const recordHistory = (data) => {
    if (data.bestBid === -1 || data.bestAsk === -1) return;

    const mid = (data.bestBid + data.bestAsk) / 2;
    const spreadValue = data.bestAsk - data.bestBid;

    stepCounterRef.current += 1;

    setHistory((prev) => {
      const next = [...prev, { step: stepCounterRef.current, mid, spread: spreadValue }];
      const trimmed = next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;

      return trimmed.map((point, idx) => {
        const windowStart = Math.max(0, idx - 9);
        const window = trimmed.slice(windowStart, idx + 1);
        const spreadMA = window.reduce((sum, p) => sum + p.spread, 0) / window.length;
        return { ...point, spreadMA };
      });
    });
  };

  const step = async (n) => {
    const startTime = performance.now();
    const res = await fetch(`${API_URL}/step?n=${n}`, { method: "POST" });
    const data = await res.json();
    const endTime = performance.now();

    const totalLatency = endTime - startTime;
    const cppMs = data.serverTiming?.cppMs ?? null;
    const serializationMs = data.serverTiming?.serializationMs ?? null;
    const networkMs =
      cppMs !== null && serializationMs !== null
        ? totalLatency - cppMs - serializationMs
        : null;

    setLatencyBreakdown({ total: totalLatency, cpp: cppMs, serialization: serializationMs, network: networkMs });

    latencyHistoryRef.current.push(totalLatency);
    if (latencyHistoryRef.current.length > 20) {
      latencyHistoryRef.current.shift();
    }
    const avg =
      latencyHistoryRef.current.reduce((a, b) => a + b, 0) /
      latencyHistoryRef.current.length;
    setAvgLatency(avg);

    recordHistory(data);
    setState(data);
  };

  const reset = async () => {
    const res = await fetch(`${API_URL}/reset`, { method: "POST" });
    const data = await res.json();
    setState(data);
    setHistory([]);
    stepCounterRef.current = 0;
    latencyHistoryRef.current = [];
    setLatencyBreakdown(null);
    setAvgLatency(null);
  };


  const sendParams = async (overrides = {}) => {
    const payload = {
      modelType,
      lam,
      mu,
      nu,
      minPrice,
      maxPrice,
      minVolume,
      maxVolume,
      phi0,
      branchingRatio,
      decayRate,
      ...overrides,
    };
    await fetch(`${API_URL}/params`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  };

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        step(1);
      }, 300);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning]);

  const spread =
    state.bestBid !== -1 && state.bestAsk !== -1
      ? state.bestAsk - state.bestBid
      : null;

  const midPrice =
    state.bestBid !== -1 && state.bestAsk !== -1
      ? (state.bestBid + state.bestAsk) / 2
      : null;

  const bestBidVolume = state.bidDepth.length > 0 ? state.bidDepth[0][1] : 0;
  const bestAskVolume = state.askDepth.length > 0 ? state.askDepth[0][1] : 0;
  const imbalance =
    bestBidVolume + bestAskVolume > 0
      ? bestBidVolume / (bestBidVolume + bestAskVolume)
      : null;

  const bidDepthLimited = state.bidDepth.slice(0, bidLevels);
  const askDepthLimited = state.askDepth.slice(0, askLevels);

  const asksWithVolume = askDepthLimited.map(([price, cum], idx) => {
    const prevCum = idx === 0 ? 0 : askDepthLimited[idx - 1][1];
    return { price, cum, volume: cum - prevCum };
  });

  const bidsWithVolume = bidDepthLimited.map(([price, cum], idx) => {
    const prevCum = idx === 0 ? 0 : bidDepthLimited[idx - 1][1];
    return { price, cum, volume: cum - prevCum };
  });

  const asksSorted = [...asksWithVolume].reverse();

  const bidChartData = [...bidDepthLimited]
    .reverse()
    .map(([price, cum]) => ({ price, bidCum: cum, askCum: null }));

  const askChartData = askDepthLimited.map(([price, cum]) => ({
    price,
    bidCum: null,
    askCum: cum,
  }));

  const chartData = [...bidChartData, ...askChartData];

  const volumeDistributionData = [...bidsWithVolume, ...asksSorted]
    .map((item) => ({
      price: item.price,
      volume: item.volume,
      side: state.bidDepth.some(([p]) => p === item.price) ? "Bid" : "Ask",
    }))
    .sort((a, b) => a.price - b.price);

  const eventColor = (type) => {
    if (type === "NewLimitOrder") return "#2980b9";
    if (type === "NewMarketOrder") return "#e67e22";
    if (type === "Cancel") return "#7f8c8d";
    return "#333";
  };

  const eventLabel = (type) => {
    if (type === "NewLimitOrder") return "LIMIT";
    if (type === "NewMarketOrder") return "MARKET";
    if (type === "Cancel") return "CANCEL";
    return type;
  };

  const imbalanceColor =
    imbalance === null ? "#888" : imbalance > 0.5 ? "#27ae60" : "#c0392b";

  return (
    <div style={{ fontFamily: "monospace", padding: "24px", width: "100%", boxSizing: "border-box" }}>
      <h1 style={{ marginBottom: "4px" }}>LOB Simulator</h1>
      <p style={{ color: "#888", marginTop: 0 }}>
        {modelType === "hawkes" ? "Hawkes self-exciting model" : "Santa Fe order flow model"}
      </p>

      <div style={{ display: "flex", gap: "12px", marginBottom: "8px", alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={() => setIsRunning(!isRunning)}
          style={{
            background: isRunning ? "#c0392b" : "#27ae60",
            color: "white",
            fontWeight: "bold",
            border: "none",
            padding: "10px 18px",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "15px",
          }}
        >
          {isRunning ? "■ Стоп" : "▶ Пуск"}
        </button>

        <button onClick={() => step(1)}>Step ×1</button>
        <button onClick={() => step(20)}>Step ×20</button>
        <button onClick={() => step(100)}>Step ×100</button>
        <button onClick={reset}>Reset</button>

        <div style={{ marginLeft: "auto", fontSize: "13px", color: "#888", textAlign: "right" }}>
          Avg latency (20): {avgLatency !== null ? `${avgLatency.toFixed(1)} ms` : "—"}
        </div>
      </div>

      {latencyBreakdown && (
        <div style={{ fontSize: "12px", color: "#888", marginBottom: "16px", textAlign: "right" }}>
          Total: <strong>{latencyBreakdown.total.toFixed(1)}ms</strong>
          {" = "}
          C++: <strong>{latencyBreakdown.cpp?.toFixed(2) ?? "—"}ms</strong>
          {" + "}
          Serialize: <strong>{latencyBreakdown.serialization?.toFixed(2) ?? "—"}ms</strong>
          {" + "}
          Network/other: <strong>{latencyBreakdown.network?.toFixed(1) ?? "—"}ms</strong>
        </div>
      )}

      <div style={{ display: "flex", gap: "24px", marginBottom: "20px", padding: "12px 16px", background: "#fafafa", border: "1px solid #ddd", borderRadius: "8px" }}>
        <div>
          <span style={{ color: "#888" }}>Mid-price: </span>
          <strong>{midPrice === null ? "—" : midPrice.toFixed(2)}</strong>
        </div>
        <div>
          <span style={{ color: "#888" }}>Spread: </span>
          <strong>{spread === null ? "—" : spread}</strong>
        </div>
        <div>
          <span style={{ color: "#888" }}>Imbalance: </span>
          <strong style={{ color: imbalanceColor }}>
            {imbalance === null ? "—" : imbalance.toFixed(3)}
          </strong>
        </div>
      </div>

      <div style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
        {/* ЛЕВАЯ КОЛОНКА: параметры + order flow */}
        <div style={{ width: "320px", flexShrink: 0 }}>
          <div style={{ marginBottom: "20px", padding: "16px", background: "#f0f0f0", borderRadius: "8px", border: "1px solid #ccc" }}>
            <h3 style={{ marginTop: 0 }}>Модель потока заявок</h3>

            <div style={{ marginBottom: "16px", display: "flex", gap: "16px" }}>
              <label>
                <input
                  type="radio"
                  checked={modelType === "santa_fe"}
                  onChange={() => {
                    setModelType("santa_fe");
                    sendParams({ modelType: "santa_fe" });
                  }}
                />{" "}
                Santa Fe (Poisson)
              </label>
              <label>
                <input
                  type="radio"
                  checked={modelType === "hawkes"}
                  onChange={() => {
                    setModelType("hawkes");
                    sendParams({ modelType: "hawkes" });
                  }}
                />{" "}
                Hawkes
              </label>
            </div>

            {modelType === "santa_fe" && (
              <>
                <div style={{ marginBottom: "12px" }}>
                  <label>λ (лимитные заявки): <strong>{lam.toFixed(2)}</strong></label>
                  <input
                    type="range" min="0.1" max="5" step="0.1" value={lam}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setLam(v);
                      sendParams({ lam: v });
                    }}
                    style={{ width: "100%" }}
                  />
                </div>

                <div style={{ marginBottom: "12px" }}>
                  <label>μ (маркет-ордера): <strong>{mu.toFixed(2)}</strong></label>
                  <input
                    type="range" min="0.1" max="5" step="0.1" value={mu}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setMu(v);
                      sendParams({ mu: v });
                    }}
                    style={{ width: "100%" }}
                  />
                </div>

                <div style={{ marginBottom: "16px" }}>
                  <label>ν (отмены): <strong>{nu.toFixed(2)}</strong></label>
                  <input
                    type="range" min="0.1" max="5" step="0.1" value={nu}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setNu(v);
                      sendParams({ nu: v });
                    }}
                    style={{ width: "100%" }}
                  />
                </div>
              </>
            )}

            {modelType === "hawkes" && (
              <div style={{ marginBottom: "16px", padding: "10px", background: "#eef2fb", borderRadius: "6px" }}>
                <div style={{ marginBottom: "12px" }}>
                  <label>φ₀ (базовая интенсивность): <strong>{phi0.toFixed(2)}</strong></label>
                  <input
                    type="range" min="0.1" max="5" step="0.1" value={phi0}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setPhi0(v);
                      sendParams({ phi0: v });
                    }}
                    style={{ width: "100%" }}
                  />
                </div>

                <div style={{ marginBottom: "12px" }}>
                  <label>g (branching ratio): <strong>{branchingRatio.toFixed(2)}</strong></label>
                  <input
                    type="range" min="0.05" max="0.95" step="0.05" value={branchingRatio}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setBranchingRatio(v);
                      sendParams({ branchingRatio: v });
                    }}
                    style={{ width: "100%" }}
                  />
                </div>

                <div>
                  <label>ω (decay rate): <strong>{decayRate.toFixed(2)}</strong></label>
                  <input
                    type="range" min="0.1" max="5" step="0.1" value={decayRate}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setDecayRate(v);
                      sendParams({ decayRate: v });
                    }}
                    style={{ width: "100%" }}
                  />
                </div>
              </div>
            )}

            <div style={{ marginBottom: "12px" }}>
              <label>Диапазон цен: {minPrice} — {maxPrice}</label>
              <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                <input
                  type="number"
                  value={minPrice}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (!isNaN(v)) {
                      setMinPrice(v);
                      sendParams({ minPrice: v });
                    }
                  }}
                  style={{ width: "80px" }}
                />
                <input
                  type="number"
                  value={maxPrice}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (!isNaN(v)) {
                      setMaxPrice(v);
                      sendParams({ maxPrice: v });
                    }
                  }}
                  style={{ width: "80px" }}
                />
              </div>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label>Диапазон объёма: {minVolume} — {maxVolume}</label>
              <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                <input
                  type="number"
                  value={minVolume}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (!isNaN(v)) {
                      setMinVolume(v);
                      sendParams({ minVolume: v });
                    }
                  }}
                  style={{ width: "80px" }}
                />
                <input
                  type="number"
                  value={maxVolume}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (!isNaN(v)) {
                      setMaxVolume(v);
                      sendParams({ maxVolume: v });
                    }
                  }}
                  style={{ width: "80px" }}
                />
              </div>
            </div>

            <div style={{ paddingTop: "12px", borderTop: "1px solid #ccc" }}>
              <label>Видимых уровней Bid: <strong>{bidLevels}</strong></label>
              <input
                type="range"
                min="1"
                max="50"
                step="1"
                value={bidLevels}
                onChange={(e) => setBidLevels(parseInt(e.target.value))}
                style={{ width: "100%" }}
              />

              <label>Видимых уровней Ask: <strong>{askLevels}</strong></label>
              <input
                type="range"
                min="1"
                max="50"
                step="1"
                value={askLevels}
                onChange={(e) => setAskLevels(parseInt(e.target.value))}
                style={{ width: "100%" }}
              />
            </div>
          </div>

          <h3 style={{ marginTop: 0 }}>Order Flow</h3>
          <div style={{ maxHeight: "500px", overflowY: "auto", border: "1px solid #ccc", borderRadius: "6px" }}>
            {state.recentEvents.length === 0 && (
              <div style={{ padding: "12px", color: "#888" }}>Нет событий</div>
            )}
            {state.recentEvents.map((e, idx) => (
              <div
                key={idx}
                style={{
                  padding: "8px 10px",
                  borderBottom: "1px solid #eee",
                  fontSize: "13px",
                  display: "flex",
                  justifyContent: "space-between",
                  background: idx === 0 ? "#fffbe6" : "white",
                }}
              >
                <span style={{ color: eventColor(e.type), fontWeight: "bold" }}>{eventLabel(e.type)}</span>
                <span style={{ color: e.side === "Buy" ? "#27ae60" : "#c0392b" }}>{e.side}</span>
                <span>{e.price > 0 ? e.price : "—"}</span>
                <span>{e.volume > 0 ? e.volume : "—"}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ЦЕНТРАЛЬНАЯ КОЛОНКА */}
        <div style={{ flex: 1, minWidth: "400px" }}>
          <h3 style={{ marginTop: 0, marginBottom: "8px" }}>Mid-price</h3>
          <div style={{ width: "100%", height: 180, marginBottom: "24px" }}>
            <ResponsiveContainer>
              <LineChart data={history}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="step" />
                <YAxis domain={["auto", "auto"]} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="mid"
                  stroke="#2980b9"
                  dot={false}
                  isAnimationActive={false}
                  name="Mid-price"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <h3 style={{ marginTop: 0, marginBottom: "8px" }}>Spread &amp; Spread MA(10)</h3>
          <div style={{ width: "100%", height: 180, marginBottom: "24px" }}>
            <ResponsiveContainer>
              <LineChart data={history}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="step" />
                <YAxis domain={[0, "auto"]} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="spread"
                  stroke="#95a5a6"
                  dot={false}
                  isAnimationActive={false}
                  name="Spread"
                  strokeWidth={1}
                />
                <Line
                  type="monotone"
                  dataKey="spreadMA"
                  stroke="#e67e22"
                  dot={false}
                  isAnimationActive={false}
                  name="Spread MA(10)"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <h3 style={{ marginTop: 0, marginBottom: "8px" }}>Order Book Depth (кумулятив)</h3>
          <div style={{ width: "100%", height: 300, marginBottom: "24px" }}>
            <ResponsiveContainer>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="price" />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="bidCum" stroke="#27ae60" fill="#27ae60" fillOpacity={0.3} connectNulls={false} isAnimationActive={false} />
                <Area type="monotone" dataKey="askCum" stroke="#c0392b" fill="#c0392b" fillOpacity={0.3} connectNulls={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <h3 style={{ marginTop: 0, marginBottom: "8px" }}>Объём по уровням (не кумулятив)</h3>
          <div style={{ width: "100%", height: 250 }}>
            <ResponsiveContainer>
              <BarChart data={volumeDistributionData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="price" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="volume" isAnimationActive={false}>
                  {volumeDistributionData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.side === "Bid" ? "#27ae60" : "#c0392b"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ПРАВАЯ КОЛОНКА: таблица */}
        <div style={{ width: "380px", flexShrink: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "15px" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #333" }}>
                <th style={{ textAlign: "left", padding: "4px" }}>Цена</th>
                <th style={{ textAlign: "right", padding: "4px" }}>Кол-во</th>
                <th style={{ textAlign: "right", padding: "4px" }}>Кумулятив</th>
              </tr>
            </thead>
            <tbody>
              {asksSorted.map(({ price, cum, volume }) => (
                <tr key={`ask-${price}`} style={{ background: "#fde8e8" }}>
                  <td style={{ padding: "4px", color: "#c0392b", fontWeight: "bold" }}>{price}</td>
                  <td style={{ padding: "4px", textAlign: "right" }}>{volume}</td>
                  <td style={{ padding: "4px", textAlign: "right" }}>{cum}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={3} style={{ padding: "6px", textAlign: "center", color: "#888", borderTop: "2px solid #333", borderBottom: "2px solid #333" }}>
                  spread: {spread === null ? "—" : spread}
                </td>
              </tr>
              {bidsWithVolume.map(({ price, cum, volume }) => (
                <tr key={`bid-${price}`} style={{ background: "#e8f8ee" }}>
                  <td style={{ padding: "4px", color: "#27ae60", fontWeight: "bold" }}>{price}</td>
                  <td style={{ padding: "4px", textAlign: "right" }}>{volume}</td>
                  <td style={{ padding: "4px", textAlign: "right" }}>{cum}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}