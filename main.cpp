#include "OrderBook.h"
#include <iostream>

int main() {
    OrderBook book;

    book.addLimitOrder(Order(Side::Buy, 100, 50, 10));
    book.addLimitOrder(Order(Side::Buy, 99, 30, 11));
    book.addLimitOrder(Order(Side::Buy, 98, 20, 12));

    for (const auto& p : book.bidDepth()) {
        std::cout << "Price: " << p.first << ", Cumulative: " << p.second << std::endl;
    }

    book.addLimitOrder(Order(Side::Sell, 101, 40, 20));
    book.addLimitOrder(Order(Side::Sell, 102, 25, 21));
    book.addLimitOrder(Order(Side::Sell, 103, 35, 22));

    for (const auto& p : book.askDepth()) {
        std::cout << "Price: " << p.first << ", Cumulative: " << p.second << std::endl;
    }
}