#include <iostream>
#include <chrono>
#include "OrderBook.h"
#include "SantaFeFlow.h"

int main() {
    OrderBook book;
    SantaFeFlow flow(2.0, 1.0, 0.5, 95, 105, 1, 50);

    const int N = 1'000'000;

    auto start = std::chrono::high_resolution_clock::now();

    for (int i = 0; i < N; i++) {
        Event e = flow.nextEvent();

        if (e.type == EventType::NewLimitOrder) {
            Order o(e.side, e.price, e.volume, e.id);
            book.processOrder(o);

        } else if (e.type == EventType::NewMarketOrder) {
            int marketPrice = (e.side == Side::Buy) ? book.bestAsk() : book.bestBid();
            if (marketPrice != -1) {
                Order o(e.side, marketPrice, e.volume, e.id);
                book.processOrder(o);
            }

        } else if (e.type == EventType::Cancel) {
            if (!book.orderLocation.empty()) {
                auto it = book.orderLocation.begin();
                book.cancelOrder(it->first);
            }
        }
    }

    auto end = std::chrono::high_resolution_clock::now();
    auto durationMs = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();

    double eventsPerSecond = (double)N / (durationMs / 1000.0);

    std::cout << "Processed " << N << " events in " << durationMs << " ms" << std::endl;
    std::cout << "Throughput: " << eventsPerSecond << " events/sec" << std::endl;

    std::cout << "\nFinal state: bestBid=" << book.bestBid()
               << ", bestAsk=" << book.bestAsk() << std::endl;
}