#pragma once
#include "Event.h"

class OrderFlowGenerator {
public:
    virtual Event nextEvent(int midPrice) = 0;
    virtual ~OrderFlowGenerator() = default;
};

