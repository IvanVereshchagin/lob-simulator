#include "OrderBook.h"
#include <iostream>

int main() {
    OrderBook book;

    // строим книгу
    book.addLimitOrder(Order(Side::Sell, 105, 50, 1));
    book.addLimitOrder(Order(Side::Sell, 106, 30, 2));
    book.addLimitOrder(Order(Side::Sell, 107, 20, 3));

    std::cout << "Before: bestAsk=" << book.bestAsk() << std::endl;

    // buy-заявка на 80 шт по цене 107 — должна съесть уровни 105 и 106 целиком
    book.processOrder(Order(Side::Buy, 107, 80, 4));

    std::cout << "After: bestAsk=" << book.bestAsk() << std::endl;
    // ожидаем 107 — уровни 105 и 106 должны исчезнуть
}

