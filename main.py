import os
import sys

if sys.platform == "win32":
    os.add_dll_directory(r'C:\msys64\mingw64\bin')

import time
import orderbook_cpp
from fastapi import FastAPI
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
    lam: float = 2.0
    mu: float = 1.0
    nu: float = 0.5
    minPrice: int = 95
    maxPrice: int = 105
    minVolume: int = 1
    maxVolume: int = 50


class DepthResponse(BaseModel):
    bestBid: int
    bestAsk: int
    bidDepth: list[tuple[int, int]]
    askDepth: list[tuple[int, int]]
    recentEvents: list[dict]
    serverTiming: dict | None = None


current_params = FlowParams()
book = orderbook_cpp.OrderBook()
flow = orderbook_cpp.SantaFeFlow(
    current_params.lam, current_params.mu, current_params.nu,
    current_params.minPrice, current_params.maxPrice,
    current_params.minVolume, current_params.maxVolume
)

recent_events = []
MAX_EVENTS = 30


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

    elif e.type == orderbook_cpp.EventType.Cancel:
        if len(book.orderLocation) > 0:
            random_id = random.choice(list(book.orderLocation.keys()))
            book.cancelOrder(random_id)


@app.post("/params")
def update_params(params: FlowParams):
    global flow, current_params
    if params.minPrice >= params.maxPrice or params.minVolume >= params.maxVolume:
        return current_params  # игнорируем некорректные параметры, не пересоздаём flow
    current_params = params
    flow = orderbook_cpp.SantaFeFlow(
        params.lam, params.mu, params.nu,
        params.minPrice, params.maxPrice,
        params.minVolume, params.maxVolume
    )
    return params

@app.get("/params")
def get_params():
    return current_params


@app.get("/state", response_model=DepthResponse)
def state():
    return get_state()


@app.post("/step")
def step(n: int = 1):
    t0 = time.perf_counter()
    for _ in range(n):
        # Используем current_params для получения minPrice и maxPrice
        mid = (book.bestBid() + book.bestAsk()) // 2 if book.bestBid() != -1 and book.bestAsk() != -1 else (current_params.minPrice + current_params.maxPrice) // 2
        e = flow.nextEvent(mid)
        apply_event(e)
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
    global book, recent_events
    book = orderbook_cpp.OrderBook()
    recent_events = []
    return get_state()