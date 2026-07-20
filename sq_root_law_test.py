import os
os.add_dll_directory(r'C:\msys64\mingw64\bin')

import orderbook_cpp
import random
import statistics
import math

def build_book(lam=2.0, mu=1.0, nu=0.5, min_price=95, max_price=105,
                min_vol=1, max_vol=50, warmup_steps=500):
   
    book = orderbook_cpp.OrderBook()
    flow = orderbook_cpp.SantaFeFlow(lam, mu, nu, min_price, max_price, min_vol, max_vol)

    for _ in range(warmup_steps):
        mid = (book.bestBid() + book.bestAsk()) // 2 if book.bestBid() != -1 and book.bestAsk() != -1 else (min_price + max_price) // 2
        e = flow.nextEvent(mid)

        if e.type == orderbook_cpp.EventType.NewLimitOrder:
            order = orderbook_cpp.Order(e.side, e.price, e.volume, e.id)
            book.processOrder(order)
        elif e.type == orderbook_cpp.EventType.NewMarketOrder:
            price = book.bestAsk() if e.side == orderbook_cpp.Side.Buy else book.bestBid()
            if price != -1:
                order = orderbook_cpp.Order(e.side, price, e.volume, e.id)
                book.processOrder(order)
        elif e.type == orderbook_cpp.EventType.Cancel:
            if len(book.orderLocation) > 0:
                random_id = random.choice(list(book.orderLocation.keys()))
                book.cancelOrder(random_id)

    return book


def run_metaorder_experiment(volume, num_children=20, side=None):
  
    book = build_book()

    if side is None:
        side = random.choice([orderbook_cpp.Side.Buy, orderbook_cpp.Side.Sell])

    decision_mid = (book.bestBid() + book.bestAsk()) / 2
    if book.bestBid() == -1 or book.bestAsk() == -1:
        return None

    metaorder = orderbook_cpp.MetaorderExecutor(side, volume, num_children, 900000)

    while not metaorder.isFinished():
        price = book.bestAsk() if side == orderbook_cpp.Side.Buy else book.bestBid()
        if price == -1:
            break
        child = metaorder.nextChildOrder(price)
        book.processOrder(child)

    if book.bestBid() == -1 or book.bestAsk() == -1:
        return None

    final_mid = (book.bestBid() + book.bestAsk()) / 2
    impact = final_mid - decision_mid

    signed_impact = impact if side == orderbook_cpp.Side.Buy else -impact
    return signed_impact


def main():
    volumes = [50, 100, 150, 250, 400, 500, 750, 1000, 1500, 2000, 3000, 4000, 6000, 8000]
    repeats_per_volume = 40

    results = []

    print(f"{'Q':>6} | {'√Q':>8} | {'mean |impact|':>14} | {'std':>8} | {'n':>4} | {'failed':>6}")
    print("-" * 65)

    for Q in volumes:
        impacts = []
        failed = 0
        for _ in range(repeats_per_volume):
            impact = run_metaorder_experiment(Q)
            if impact is not None:
                impacts.append(abs(impact))
            else:
                failed += 1

        if len(impacts) < 2:
            print(f"{Q:>6} | {'—':>8} | {'skipped (too few valid runs)':>14} | | | {failed:>6}")
            continue

        mean_impact = statistics.mean(impacts)
        std_impact = statistics.stdev(impacts)
        sqrt_Q = math.sqrt(Q)

        results.append({"Q": Q, "sqrtQ": sqrt_Q, "meanImpact": mean_impact, "stdImpact": std_impact, "n": len(impacts)})
        print(f"{Q:>6} | {sqrt_Q:>8.2f} | {mean_impact:>14.4f} | {std_impact:>8.4f} | {len(impacts):>4} | {failed:>6}")

    # Линейная регрессия impact = Y * sqrtQ
    sum_xy = sum(r["sqrtQ"] * r["meanImpact"] for r in results)
    sum_xx = sum(r["sqrtQ"] ** 2 for r in results)
    Y = sum_xy / sum_xx

    ss_res = sum((r["meanImpact"] - Y * r["sqrtQ"]) ** 2 for r in results)
    mean_y = statistics.mean([r["meanImpact"] for r in results])
    ss_tot = sum((r["meanImpact"] - mean_y) ** 2 for r in results)
    r_squared = 1 - ss_res / ss_tot if ss_tot > 0 else float("nan")

    print("\n" + "=" * 65)
    print(f"Fitted: impact ≈ Y * sqrt(Q),  Y = {Y:.5f}")
    print(f"R² = {r_squared:.4f}")
    print(f"Points used in fit: {len(results)}")
    print("=" * 65)

    return results, Y, r_squared


if __name__ == "__main__":
    main()