#pragma once
enum class Side {

    Buy ,
    Sell

};

struct Order { 

    Side side; 
    int price;
    int volume;
    int id;

    Order(Side s, int p, int v , int i) : side(s) , price(p), volume(v), id(i) {} ;
};


