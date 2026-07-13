#pragma once
#include "Order.h"
#include <deque>

struct PriceLevel{

    std::deque<Order> orders; 

};