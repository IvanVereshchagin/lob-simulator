#pragma once
#include "PriceLevel.h"
#include <map>
#include <iterator>
#include <unordered_map>

struct OrderBook{

    std::map<int, PriceLevel> bids ;
    std::map<int, PriceLevel> asks ;
    std::unordered_map<int, std::pair<Side, int>> orderLocation;

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

        orderLocation[order.id] = {order.side, order.price};

    }

    void cancelOrder( int id){

        auto it = orderLocation.find(id) ; 

        if ( it != orderLocation.end() ) {

            Side order_to_cancel_side = it->second.first ; 
            int order_to_cancel_price = it->second.second;

            if ( order_to_cancel_side == Side::Buy) {

                auto& targetDeque = bids[order_to_cancel_price].orders;


                for (auto deqIt = targetDeque.begin(); deqIt != targetDeque.end(); ++deqIt) {
                if (deqIt->id == id) {
                    targetDeque.erase(deqIt);
                    break;
                }
                }

                orderLocation.erase(it); 

            } else if ( ( order_to_cancel_side == Side::Sell)) { 

               auto& targetDeque = asks[order_to_cancel_price].orders;


               for (auto deqIt = targetDeque.begin(); deqIt != targetDeque.end(); ++deqIt) {
                if (deqIt->id == id) {
                    targetDeque.erase(deqIt);
                    break;
                }
                }
                
               orderLocation.erase(it);
            }

        } else {


            return ; 
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