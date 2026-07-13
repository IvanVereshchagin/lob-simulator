#pragma once
#include "PriceLevel.h"
#include <map>
#include <iterator>


struct OrderBook{

    std::map<int, PriceLevel> bids ;
    std::map<int, PriceLevel> asks ;

    int bestBid() const {

        if (bids.empty()) {

            return -1;
        }
        return bids.rbegin()->first;

    }


    int bestAsk() const {

        if (asks.empty()) {

            return -1;
        }

        return asks.begin()->first;

    }

    void addLimitOrder( const Order& order){


        if ( order.side == Side::Buy) { 

            bids[ order.price ].orders.push_back( order) ; 

        }

        else if  ( order.side == Side::Sell) {

            asks[ order.price ].orders.push_back( order) ; 

        }
    }


    void processOrder( const Order& order){ 

        if (order.side == Side::Buy) { 
            
            if (bestAsk() != -1 && order.price >= bestAsk() ) {
                

                int remainingVolume = order.volume; 

                while (remainingVolume > 0 && bestAsk() != -1 && order.price >= bestAsk()){

                    auto it = asks.begin();
                    Order& topOrder = it->second.orders.front() ; 

                    if (remainingVolume >= topOrder.volume) { 

                        remainingVolume -= topOrder.volume ; 
                        it->second.orders.pop_front();

                        if (it->second.orders.empty()) { 

                            asks.erase(it);

                        }


                    } else {

                        topOrder.volume -= remainingVolume;
                        remainingVolume = 0 ; 


                    }

                }


                if (remainingVolume > 0) {
                    Order restOrder = order;              
                    restOrder.volume = remainingVolume;  
                    addLimitOrder(restOrder);
                }



            } else {

                addLimitOrder(order); 

            }


        } else if (order.side == Side::Sell) { 

            if (bestBid() != -1 && order.price <= bestBid() ) {

                int remainingVolume = order.volume; 

                while (remainingVolume > 0 && bestBid() != -1 && order.price <= bestBid()){

                    auto it = std::prev(bids.end());;
                    Order& topOrder = it->second.orders.front() ; 

                    if (remainingVolume >= topOrder.volume) { 

                        remainingVolume -= topOrder.volume ; 
                        it->second.orders.pop_front();

                        if (it->second.orders.empty()) { 

                            bids.erase(it);

                        }


                    } else {

                        topOrder.volume -= remainingVolume;
                        remainingVolume = 0 ; 


                    }

                }


                if (remainingVolume > 0) {
                    Order restOrder = order;              
                    restOrder.volume = remainingVolume;  
                    addLimitOrder(restOrder);
                }

            } else {

                addLimitOrder(order);

            }

        }


    }

};