#include "SantaFeFlow.h"
#include "OrderBook.h"
#include <iostream>
#include <random>
#include <iterator>

int main() {
    OrderBook book;
    SantaFeFlow flow(2.0, 1.0, 0.5, 95, 105, 1, 50);
    std::mt19937 gen(std::random_device{}());

    for (int i = 0; i < 20; i++) {
        Event e = flow.nextEvent();

        if (e.type == EventType::NewLimitOrder) {
            Order o(e.side, e.price, e.volume, e.id);
            book.addLimitOrder(o);
            std::cout << "Event " << i << ": NewLimitOrder id=" << e.id 
                       << " side=" << (e.side == Side::Buy ? "Buy" : "Sell")
                       << " price=" << e.price << " volume=" << e.volume << std::endl;

        } else if (e.type == EventType::NewMarketOrder) {
            int marketPrice = (e.side == Side::Buy) ? book.bestAsk() : book.bestBid();
            if (marketPrice != -1) {
                Order o(e.side, marketPrice, e.volume, e.id);
                book.processOrder(o);
                std::cout << "Event " << i << ": NewMarketOrder id=" << e.id 
                           << " side=" << (e.side == Side::Buy ? "Buy" : "Sell") << std::endl;
            } else {
                std::cout << "Event " << i << ": MarketOrder skipped (empty book)" << std::endl;
            }

        } else if (e.type == EventType::Cancel) {
            if (!book.orderLocation.empty()) {
                std::uniform_int_distribution<int> pickDist(0, book.orderLocation.size() - 1);
                int randomIndex = pickDist(gen);

                auto it = book.orderLocation.begin();
                std::advance(it, randomIndex);
                int idToCancel = it->first;

                book.cancelOrder(idToCancel);
                std::cout << "Event " << i << ": Cancel id=" << idToCancel << std::endl;
            } else {
                std::cout << "Event " << i << ": Cancel skipped (no active orders)" << std::endl;
            }
        }
    }

    std::cout << "\nFinal state: bestBid=" << book.bestBid() 
               << ", bestAsk=" << book.bestAsk() << std::endl;
}