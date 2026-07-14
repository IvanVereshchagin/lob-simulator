#include <pybind11/pybind11.h>
#include <pybind11/stl.h>
#include "OrderBook.h"
#include "SantaFeFlow.h"

namespace py = pybind11;

PYBIND11_MODULE(orderbook_cpp, m) {
    py::enum_<Side>(m, "Side")
        .value("Buy", Side::Buy)
        .value("Sell", Side::Sell);

    py::class_<Order>(m, "Order")
        .def(py::init<Side, int, int, int>())
        .def_readwrite("side", &Order::side)
        .def_readwrite("price", &Order::price)
        .def_readwrite("volume", &Order::volume)
        .def_readwrite("id", &Order::id);

    py::class_<OrderBook>(m, "OrderBook")
        .def(py::init<>())
        .def("bestBid", &OrderBook::bestBid)
        .def("bestAsk", &OrderBook::bestAsk)
        .def("addLimitOrder", &OrderBook::addLimitOrder)
        .def("processOrder", &OrderBook::processOrder)
        .def("cancelOrder", &OrderBook::cancelOrder)
        .def("bidDepth", &OrderBook::bidDepth)
        .def("askDepth", &OrderBook::askDepth)
        .def_readonly("orderLocation", &OrderBook::orderLocation);

    py::enum_<EventType>(m, "EventType")
    .value("NewLimitOrder", EventType::NewLimitOrder)
    .value("NewMarketOrder", EventType::NewMarketOrder)
    .value("Cancel", EventType::Cancel);

    py::class_<Event>(m, "Event")
        .def_readwrite("type", &Event::type)
        .def_readwrite("side", &Event::side)
        .def_readwrite("price", &Event::price)
        .def_readwrite("volume", &Event::volume)
        .def_readwrite("id", &Event::id);

    py::class_<SantaFeFlow>(m, "SantaFeFlow")
        .def(py::init<double, double, double, int, int, int, int>())
        .def("nextEvent", &SantaFeFlow::nextEvent);
}