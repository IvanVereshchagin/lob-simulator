import os
import sys

if sys.platform == "win32":
    os.add_dll_directory(r'C:\msys64\mingw64\bin')

import time
import orderbook_cpp
from fastapi import FastAPI, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import random

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class FlowParams(BaseModel):
    modelType: str = "santa_fe"
    lam: float = 2.0
    mu: float = 1.0
    nu: float = 0.5
    minPrice: int = 95
    maxPrice: int = 105
    minVolume: int = 1
    maxVolume: int = 50
    phi0: float = 1.0
    branchingRatio: float = 0.7
    decayRate: float = 0.5
    rho: float = 0.0  # НОВОЕ: сила памяти знака market orders (DAR)


class DepthResponse(BaseModel):
    bestBid: int
    bestAsk: int
    bidDepth: list[tuple[int, int]]
    askDepth: list[tuple[int, int]]
    recentEvents: list[dict]
    serverTiming: dict | None = None


def create_flow(params: FlowParams):
    if params.modelType == "hawkes":
        return orderbook_cpp.HawkesFlow(
            params.phi0, params.branchingRatio, params.decayRate,
            params.minPrice, params.maxPrice,
            params.minVolume, params.maxVolume,
            params.rho,
        )
    else:
        return orderbook_cpp.SantaFeFlow(
            params.lam, params.mu, params.nu,
            params.minPrice, params.maxPrice,
            params.minVolume, params.maxVolume,
            params.rho,
        )


current_params = FlowParams()
book = orderbook_cpp.OrderBook()
flow = create_flow(current_params)

recent_events = []
MAX_EVENTS = 30

sign_history = []  # НОВОЕ: знаки исполненных market orders для автокорреляции
MAX_SIGN_HISTORY = 2000

active_metaorder = None
last_completed_metaorder = None


def get_state(server_timing=None) -> DepthResponse:
    return DepthResponse(
        bestBid=book.bestBid(),
        bestAsk=book.bestAsk(),
        bidDepth=book.bidDepth(),
        askDepth=book.askDepth(),
        recentEvents=recent_events,
        serverTiming=server_timing,
    )


def apply_event(e):
    event_desc = {
        "type": str(e.type).split(".")[-1],
        "side": str(e.side).split(".")[-1],
        "price": e.price,
        "volume": e.volume,
        "id": e.id,
    }
    recent_events.insert(0, event_desc)
    if len(recent_events) > MAX_EVENTS:
        recent_events.pop()

    if e.type == orderbook_cpp.EventType.NewLimitOrder:
        order = orderbook_cpp.Order(e.side, e.price, e.volume, e.id)
        book.processOrder(order)

    elif e.type == orderbook_cpp.EventType.NewMarketOrder:
        market_price = book.bestAsk() if e.side == orderbook_cpp.Side.Buy else book.bestBid()
        if market_price != -1:
            order = orderbook_cpp.Order(e.side, market_price, e.volume, e.id)
            book.processOrder(order)
            # НОВОЕ: логируем знак исполненной сделки
            sign_history.append(1 if e.side == orderbook_cpp.Side.Buy else -1)
            if len(sign_history) > MAX_SIGN_HISTORY:
                sign_history.pop(0)

    elif e.type == orderbook_cpp.EventType.Cancel:
        if len(book.orderLocation) > 0:
            random_id = random.choice(list(book.orderLocation.keys()))
            book.cancelOrder(random_id)


@app.post("/params")
def update_params(params: FlowParams):
    global flow, current_params
    if params.minPrice >= params.maxPrice or params.minVolume >= params.maxVolume:
        return current_params
    current_params = params
    flow = create_flow(params)
    return params


@app.get("/params")
def get_params():
    return current_params


@app.get("/state", response_model=DepthResponse)
def state():
    return get_state()


@app.post("/step")
def step(n: int = 1):
    global active_metaorder
    t0 = time.perf_counter()
    for _ in range(n):
        mid = (book.bestBid() + book.bestAsk()) // 2 if book.bestBid() != -1 and book.bestAsk() != -1 else (current_params.minPrice + current_params.maxPrice) // 2
        e = flow.nextEvent(mid)
        apply_event(e)

        if active_metaorder is not None:
            execute_metaorder_child()

    t1 = time.perf_counter()
    result = get_state()
    t2 = time.perf_counter()

    result.serverTiming = {
        "cppMs": round((t1 - t0) * 1000, 3),
        "serializationMs": round((t2 - t1) * 1000, 3),
    }
    return result


@app.post("/reset")
def reset():
    global book, recent_events, active_metaorder, last_completed_metaorder, sign_history
    book = orderbook_cpp.OrderBook()
    recent_events = []
    active_metaorder = None
    last_completed_metaorder = None
    sign_history = []
    return get_state()


@app.post("/metaorder/start")
def start_metaorder(side: str = Body(...), volume: int = Body(...), numChildren: int = Body(...)):
    global active_metaorder
    decision_mid = (book.bestBid() + book.bestAsk()) / 2 if book.bestBid() != -1 and book.bestAsk() != -1 else None

    active_metaorder = {
        "side": side,
        "volumePerChild": volume // numChildren,
        "remainder": volume % numChildren,
        "totalChildren": numChildren,
        "executed": 0,
        "decisionMid": decision_mid,
        "path": [],
        "nextId": 900000,
    }
    return {"started": True, "decisionPrice": decision_mid}


def execute_metaorder_child():
    global active_metaorder, last_completed_metaorder
    m = active_metaorder
    side_enum = orderbook_cpp.Side.Buy if m["side"] == "Buy" else orderbook_cpp.Side.Sell

    current_price = book.bestAsk() if side_enum == orderbook_cpp.Side.Buy else book.bestBid()
    if current_price == -1:
        return

    volume = m["volumePerChild"] + (1 if m["executed"] < m["remainder"] else 0)
    order = orderbook_cpp.Order(side_enum, current_price, volume, m["nextId"])
    m["nextId"] += 1
    m["executed"] += 1

    book.processOrder(order)

    recent_events.insert(0, {
        "type": "Metaorder", "side": m["side"], "price": current_price, "volume": volume, "id": order.id,
    })
    if len(recent_events) > MAX_EVENTS:
        recent_events.pop()

    # НОВОЕ: метаордер тоже несёт знак сделки — логируем для автокорреляции
    sign_history.append(1 if side_enum == orderbook_cpp.Side.Buy else -1)
    if len(sign_history) > MAX_SIGN_HISTORY:
        sign_history.pop(0)

    mid = (book.bestBid() + book.bestAsk()) / 2 if book.bestBid() != -1 and book.bestAsk() != -1 else None
    m["path"].append({"step": m["executed"], "mid": mid})

    if m["executed"] >= m["totalChildren"]:
        last_completed_metaorder = {
            "volume": m["volumePerChild"] * m["totalChildren"] + m["remainder"],
            "side": m["side"],
            "numChildren": m["totalChildren"],
            "decisionPrice": m["decisionMid"],
            "finalPrice": mid,
            "impact": (mid - m["decisionMid"]) if (mid is not None and m["decisionMid"] is not None) else None,
            "path": m["path"],
        }
        active_metaorder = None


@app.get("/metaorder/status")
def metaorder_status():
    if active_metaorder is not None:
        return {
            "active": True,
            "executed": active_metaorder["executed"],
            "total": active_metaorder["totalChildren"],
            "decisionPrice": active_metaorder["decisionMid"],
            "path": active_metaorder["path"],
            "lastCompleted": last_completed_metaorder,
        }
    return {"active": False, "lastCompleted": last_completed_metaorder}


@app.get("/autocorrelation")
def autocorrelation(maxLag: int = 50):
    n = len(sign_history)
    if n < 20:
        return {"points": [], "sampleSize": n}

    import statistics
    mean = statistics.mean(sign_history)
    var = statistics.pvariance(sign_history)
    if var == 0:
        return {"points": [], "sampleSize": n}

    max_lag = min(maxLag, n // 2)
    points = []
    for lag in range(1, max_lag + 1):
        cov = sum(
            (sign_history[i] - mean) * (sign_history[i + lag] - mean)
            for i in range(n - lag)
        ) / (n - lag)
        points.append({"lag": lag, "correlation": cov / var})

    return {"points": points, "sampleSize": n}