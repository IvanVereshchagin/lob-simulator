#pragma once
#include "OrderFlowGenerator.h"
#include <random>

class SantaFeFlow : public OrderFlowGenerator {
    double lambda, mu, nu;
    int nextId = 1;
    int minPrice, maxPrice;

    std::mt19937 gen;
    std::exponential_distribution<double> limitDist;
    std::exponential_distribution<double> marketDist;
    std::exponential_distribution<double> cancelDist;

    std::gamma_distribution<double> distanceDist;  // расстояние от mid-price, горбатая форма
    std::uniform_int_distribution<int> volumeDist;
    std::bernoulli_distribution sideDist;

public:
    SantaFeFlow(double l, double m, double n, int minP, int maxP, int minVolume, int maxVolume)
        : lambda(l), mu(m), nu(n),
          minPrice(minP), maxPrice(maxP),
          gen(std::random_device{}()),
          limitDist(l), marketDist(m), cancelDist(n),
          distanceDist(2.0, 3.0),   // shape=2, scale=3 — подбери эмпирически под свой диапазон цен
          volumeDist(minVolume, maxVolume),
          sideDist(0.5)
    {}

    Event nextEvent(int midPrice) override {
        double timeToLimit = limitDist(gen);
        double timeToMarket = marketDist(gen);
        double timeToCancel = cancelDist(gen);

        Side randomSide = sideDist(gen) ? Side::Buy : Side::Sell;

        if (timeToLimit < timeToMarket && timeToLimit < timeToCancel) {
            int distance = static_cast<int>(distanceDist(gen));
            int price = (randomSide == Side::Buy) ? midPrice - distance : midPrice + distance;
            price = std::max(minPrice, std::min(maxPrice, price));  // не выйти за диапазон

            return Event{EventType::NewLimitOrder, randomSide, price, volumeDist(gen), nextId++};
        } else if (timeToMarket < timeToCancel) {
            return Event{EventType::NewMarketOrder, randomSide, 0, volumeDist(gen), nextId++};
        } else {
            return Event{EventType::Cancel, randomSide, 0, 0, 0};
        }
    }
};