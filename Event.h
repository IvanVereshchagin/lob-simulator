#pragma once
#include "Order.h"

enum class EventType { NewLimitOrder , NewMarketOrder, Cancel};

struct Event{

    EventType type;
    Side side ; 
    int price; 
    int volume;
    int id;


};