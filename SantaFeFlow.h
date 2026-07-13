#pragma once
#include "OrderFlowGenerator.h"
#include <random>

class SantaFeFlow : public OrderFlowGenerator {
    double lambda;   // интенсивность лимитных заявок
    double mu;       // интенсивность маркет-ордеров
    double nu;       // интенсивность отмен
    int nextId = 1;  // счётчик для генерации уникальных id заявок

    std::mt19937 gen;
    std::exponential_distribution<double> limitDist;
    std::exponential_distribution<double> marketDist;
    std::exponential_distribution<double> cancelDist;

    std::uniform_int_distribution<int> priceDist;   // диапазон цен для случайной постановки лимитки
    std::uniform_int_distribution<int> volumeDist;  // диапазон объёма заявки
    std::bernoulli_distribution sideDist;           // 50/50 — buy или sell

public:
    SantaFeFlow(double l, double m, double n, int minPrice, int maxPrice, int minVolume, int maxVolume)
        : lambda(l), mu(m), nu(n),
          gen(std::random_device{}()),
          limitDist(l), marketDist(m), cancelDist(n),
          priceDist(minPrice, maxPrice),
          volumeDist(minVolume, maxVolume),
          sideDist(0.5)
    {}

    Event nextEvent() override {
        double timeToLimit = limitDist(gen);
        double timeToMarket = marketDist(gen);
        double timeToCancel = cancelDist(gen);

        Side randomSide = sideDist(gen) ? Side::Buy : Side::Sell;

        if (timeToLimit < timeToMarket && timeToLimit < timeToCancel) {
            return Event{EventType::NewLimitOrder, randomSide, priceDist(gen), volumeDist(gen), nextId++};
        } else if (timeToMarket < timeToCancel) {
            return Event{EventType::NewMarketOrder, randomSide, 0, volumeDist(gen), nextId++};
        } else {
            return Event{EventType::Cancel, randomSide, 0, 0, 0};
        }
    }
};