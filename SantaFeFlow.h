#pragma once
#include "OrderFlowGenerator.h"
#include <random>

class SantaFeFlow : public OrderFlowGenerator {
    double lambda, mu, nu;
    int nextId = 1;
    int minPrice, maxPrice;
    double rho;              // НОВОЕ: сила памяти знака market orders
    Side lastMarketSide = Side::Buy;  // НОВОЕ: последний знак market order

    std::mt19937 gen;
    std::exponential_distribution<double> limitDist;
    std::exponential_distribution<double> marketDist;
    std::exponential_distribution<double> cancelDist;

    std::gamma_distribution<double> distanceDist;
    std::uniform_int_distribution<int> volumeDist;
    std::bernoulli_distribution sideDist;
    std::uniform_real_distribution<double> uniformDist{0.0, 1.0};  // НОВОЕ

public:
    SantaFeFlow(double l, double m, double n, int minP, int maxP, int minVolume, int maxVolume, double rhoParam = 0.0)
        : lambda(l), mu(m), nu(n),
          minPrice(minP), maxPrice(maxP),
          rho(rhoParam),                          // НОВОЕ
          gen(std::random_device{}()),
          limitDist(l), marketDist(m), cancelDist(n),
          distanceDist(2.0, 3.0),
          volumeDist(minVolume, maxVolume),
          sideDist(0.5)
    {}

    Side nextMarketSide() {                        // НОВОЕ: DAR(1) логика
        if (uniformDist(gen) < rho) {
            return lastMarketSide;                  // повторяем прошлый знак
        }
        lastMarketSide = sideDist(gen) ? Side::Buy : Side::Sell;
        return lastMarketSide;
    }

    Event nextEvent(int midPrice) override {
        double timeToLimit = limitDist(gen);
        double timeToMarket = marketDist(gen);
        double timeToCancel = cancelDist(gen);

        Side randomSide = sideDist(gen) ? Side::Buy : Side::Sell;  // для limit/cancel — без изменений

        if (timeToLimit < timeToMarket && timeToLimit < timeToCancel) {
            int distance = static_cast<int>(distanceDist(gen));
            int price = (randomSide == Side::Buy) ? midPrice - distance : midPrice + distance;
            price = std::max(minPrice, std::min(maxPrice, price));

            return Event{EventType::NewLimitOrder, randomSide, price, volumeDist(gen), nextId++};
        } else if (timeToMarket < timeToCancel) {
            Side marketSide = nextMarketSide();     // ИЗМЕНЕНО: DAR вместо randomSide
            return Event{EventType::NewMarketOrder, marketSide, 0, volumeDist(gen), nextId++};
        } else {
            return Event{EventType::Cancel, randomSide, 0, 0, 0};
        }
    }
};