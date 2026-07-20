#pragma once
#include "Order.h"

class MetaorderExecutor {
    Side side;
    int totalVolume;
    int numChildOrders;
    int volumePerChild;
    int remainder;        
    int executedSoFar = 0;
    int nextId;

public:
    MetaorderExecutor(Side s, int volume, int numChildren, int startId)
        : side(s), totalVolume(volume), numChildOrders(numChildren), nextId(startId)
    {
        volumePerChild = volume / numChildren;
        remainder = volume % numChildren;
    }

    bool isFinished() const {
        return executedSoFar >= numChildOrders;
    }

    int remainingChildOrders() const {
        return numChildOrders - executedSoFar;
    }

    Order nextChildOrder(int currentBestPrice) {
        int volume = volumePerChild;

     
        if (executedSoFar < remainder) {
            volume += 1;
        }

        executedSoFar++;

        return Order(side, currentBestPrice, volume, nextId++);
    }

    int getExecutedSoFar() const {
        return executedSoFar;
    }

    int getTotalChildOrders() const {
        return numChildOrders;
    }
};