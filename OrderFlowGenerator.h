#pragma once
#include "Event.h"

class OrderFlowGenerator {
public:
    virtual Event nextEvent() = 0;
    virtual ~OrderFlowGenerator() = default;
};

