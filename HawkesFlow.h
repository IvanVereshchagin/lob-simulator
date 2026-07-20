#pragma once
#include "OrderFlowGenerator.h"
#include <random>
#include <algorithm>
#include <cmath>

class HawkesFlow : public OrderFlowGenerator {
    double baseIntensity;   
    double g;               
    double omega;           

    double currentIntensity; 
    double lastEventTime;    
    double simulatedTime;    

    int nextId = 1;
    int minPrice, maxPrice;
    double rho;                          // НОВОЕ: сила памяти знака market orders
    Side lastMarketSide = Side::Buy;     // НОВОЕ

    std::mt19937 gen;
    std::exponential_distribution<double> unitExpDist; 
    std::uniform_real_distribution<double> uniformDist; 
    std::gamma_distribution<double> distanceDist;
    std::uniform_int_distribution<int> volumeDist;
    std::bernoulli_distribution sideDist;
    std::uniform_int_distribution<int> eventTypeDist; 

public:
    HawkesFlow(double phi0, double branchingRatio, double decayRate,
               int minP, int maxP, int minVolume, int maxVolume, double rhoParam = 0.0)
        : baseIntensity(phi0), g(branchingRatio), omega(decayRate),
          currentIntensity(phi0), lastEventTime(0.0), simulatedTime(0.0),
          minPrice(minP), maxPrice(maxP),
          rho(rhoParam),                 // НОВОЕ
          gen(std::random_device{}()),
          unitExpDist(1.0),
          uniformDist(0.0, 1.0),
          distanceDist(2.0, 3.0),
          volumeDist(minVolume, maxVolume),
          sideDist(0.5),
          eventTypeDist(0, 2)  
    {}

    Side nextMarketSide() {              // НОВОЕ: DAR(1) логика
        if (uniformDist(gen) < rho) {
            return lastMarketSide;
        }
        lastMarketSide = sideDist(gen) ? Side::Buy : Side::Sell;
        return lastMarketSide;
    }

    Event nextEvent(int midPrice) override {
        double phiMax = currentIntensity;

        while (true) {
            double waitTime = unitExpDist(gen) / phiMax;
            simulatedTime += waitTime;

            double elapsed = simulatedTime - lastEventTime;
            double actualIntensity = baseIntensity + (phiMax - baseIntensity) * std::exp(-omega * elapsed);

            double u = uniformDist(gen);
            if (u <= actualIntensity / phiMax) {
                lastEventTime = simulatedTime;
                currentIntensity = actualIntensity + g * omega;

                return generateEventDetails(midPrice);
            }
        }
    }

private:
    Event generateEventDetails(int midPrice) {
        int typeRoll = eventTypeDist(gen);
        Side randomSide = sideDist(gen) ? Side::Buy : Side::Sell;

        if (typeRoll == 0) {
            int distance = static_cast<int>(distanceDist(gen));
            int price = (randomSide == Side::Buy) ? midPrice - distance : midPrice + distance;
            price = std::max(minPrice, std::min(maxPrice, price));
            return Event{EventType::NewLimitOrder, randomSide, price, volumeDist(gen), nextId++};
        } else if (typeRoll == 1) {
            Side marketSide = nextMarketSide();   // ИЗМЕНЕНО: DAR вместо randomSide
            return Event{EventType::NewMarketOrder, marketSide, 0, volumeDist(gen), nextId++};
        } else {
            return Event{EventType::Cancel, randomSide, 0, 0, 0};
        }
    }
};